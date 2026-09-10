/**
 * Rebuilds vesting_claims receipts for claims made before the table existed.
 *
 * Each claim tx is matched to the periods it released: the contract pays out
 * every period unlocked at that moment, so a claim that covers three periods
 * writes the same hash against all three rows, and periods claimed one at a
 * time each get their own hash — which is exactly what the detail modal shows.
 *
 * Claim transactions are found via the TokenClaimed event. Public Sepolia RPCs
 * prune logs, so pass an Etherscan key (ETHERSCAN_API_KEY in .env) when the log
 * scan comes up empty for claims that are known to exist.
 *
 * Usage:
 *   node scripts/backfill_vesting_claims.js [0xbeneficiary]           # dry run
 *   node scripts/backfill_vesting_claims.js [0xbeneficiary] --apply
 */
const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const ONLY_ADDRESS = process.argv.slice(2).find(a => a.startsWith('0x'));

const PERIOD_SECONDS = 120; // 1 contract unit = 2 real minutes
const VESTING_ADDRESS = process.env.VESTING_CONTRACT_ADDRESS || '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12';
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: '+00:00',
};

const RPC_URLS = [...new Set([
    process.env.RPC_URL,
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://eth-sepolia-testnet.api.pocket.network',
].filter(Boolean))];

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/vesting.json"), 'utf8'));
const iface = new ethers.Interface(abi);

async function getProviders() {
    const providers = [];
    for (const url of RPC_URLS) {
        try {
            const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
            await p.getBlockNumber();
            providers.push({ url, provider: p });
        } catch (e) { /* skip */ }
    }
    if (providers.length === 0) throw new Error('No working RPC');
    console.log('Usable RPCs:', providers.map(p => p.url).join(', '));
    return providers;
}

// Walk the chain in chunks: a pruned node answers a narrow range even when it
// empties or refuses a wide one. The public pool is inconsistent about which
// node serves a request — the same query can come back full or empty seconds
// apart — so every chunk is asked of every RPC over several passes and the
// results are merged. A log missed on one attempt turns up on another.
async function scanClaimLogs(providers, fromBlock, toBlock, { chunk = 2000, passes = 3 } = {}) {
    const found = new Map();
    for (let pass = 1; pass <= passes; pass++) {
        const before = found.size;
        for (let start = fromBlock; start <= toBlock; start += chunk) {
            const end = Math.min(start + chunk - 1, toBlock);
            for (const { provider } of providers) {
                try {
                    const logs = await provider.getLogs({ address: VESTING_ADDRESS, fromBlock: start, toBlock: end });
                    for (const log of logs) {
                        let parsed = null;
                        try { parsed = iface.parseLog({ topics: [...log.topics], data: log.data }); } catch (e) { continue; }
                        if (parsed.name !== 'TokenClaimed') continue;
                        found.set(`${log.transactionHash}:${log.index ?? log.logIndex}`, {
                            user: parsed.args[0], amount: parsed.args[1],
                            txHash: log.transactionHash, blockNumber: log.blockNumber
                        });
                    }
                } catch (e) { /* this node can't serve the range; another may */ }
            }
        }
        console.log(`  pass ${pass}: ${found.size} claim event(s) known (+${found.size - before})`);
    }
    return [...found.values()];
}

// Etherscan keeps the full history, so with a key set this recovers claims the
// pruned public nodes have already dropped. Free key: etherscan.io/apis
async function fetchEtherscanClaims(address, allIndexes) {
    const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=txlist`
        + `&address=${address}&sort=asc&apikey=${ETHERSCAN_KEY}`;
    const res = await fetch(url);
    const body = await res.json();
    if (body.status !== '1' && body.message !== 'No transactions found') {
        throw new Error(`Etherscan: ${body.result || body.message}`);
    }
    return (body.result || [])
        .filter(tx => (tx.to || '').toLowerCase() === VESTING_ADDRESS.toLowerCase() && tx.isError === '0')
        .map(tx => {
            let indexes = null;
            try {
                const parsed = iface.parseTransaction({ data: tx.input });
                if (!parsed) return null;
                if (parsed.name === 'claim') indexes = [Number(parsed.args[0])];
                else if (parsed.name === 'claimAll') indexes = allIndexes;
                else return null; // vest, revoke, anything else
            } catch (e) { return null; }
            return { txHash: tx.hash, timestamp: Number(tx.timeStamp), indexes };
        })
        .filter(Boolean);
}

(async () => {
    const conn = await mysql.createConnection(dbConfig);
    const providers = await getProviders();
    const provider = providers[0].provider;

    const [schedules] = await conn.query(
        ONLY_ADDRESS
            ? "SELECT * FROM vesting_schedules WHERE LOWER(beneficiary) = LOWER(?) AND status = 'active' ORDER BY vesting_index ASC"
            : "SELECT * FROM vesting_schedules WHERE status = 'active' ORDER BY beneficiary, vesting_index ASC",
        ONLY_ADDRESS ? [ONLY_ADDRESS] : []
    );

    const byBeneficiary = new Map();
    for (const s of schedules) {
        const key = s.beneficiary.toLowerCase();
        if (!byBeneficiary.has(key)) byBeneficiary.set(key, []);
        byBeneficiary.get(key).push(s);
    }
    console.log(`${schedules.length} schedule(s) across ${byBeneficiary.size} beneficiary(ies)\n`);

    // One log scan covers every beneficiary
    const head = await provider.getBlockNumber();
    const lookback = Number(process.env.BACKFILL_LOOKBACK_BLOCKS || 60000);
    console.log(`Scanning blocks ${head - lookback}..${head} for TokenClaimed…`);
    const claimLogs = await scanClaimLogs(providers, head - lookback, head);
    console.log(`Found ${claimLogs.length} claim event(s) on chain\n`);

    const blockTimes = new Map();
    const getBlockTime = async (blockNumber) => {
        if (!blockTimes.has(blockNumber)) {
            const block = await provider.getBlock(blockNumber);
            blockTimes.set(blockNumber, block.timestamp);
        }
        return blockTimes.get(blockNumber);
    };

    const txIndexCache = new Map();
    // claim(index) names its schedule; claimAll() releases every one of them
    const getClaimedIndexes = async (txHash, allIndexes) => {
        if (txIndexCache.has(txHash)) return txIndexCache.get(txHash);
        let indexes = allIndexes;
        try {
            const tx = await provider.getTransaction(txHash);
            const parsed = iface.parseTransaction({ data: tx.data });
            if (parsed && parsed.name === 'claim') indexes = [Number(parsed.args[0])];
        } catch (e) { /* fall back to every index */ }
        txIndexCache.set(txHash, indexes);
        return indexes;
    };

    let planned = 0;
    for (const [beneficiary, rows] of byBeneficiary) {
        const allIndexes = rows.map(r => r.vesting_index);
        const [already] = await conn.query(
            'SELECT vesting_index, period_index FROM vesting_claims WHERE LOWER(beneficiary) = LOWER(?)',
            [beneficiary]
        );
        const recorded = new Set((already || []).map(r => `${r.vesting_index}:${r.period_index}`));

        // Prefer Etherscan when a key is configured — the public nodes prune
        let claimTxs = [];
        if (ETHERSCAN_KEY) {
            try {
                claimTxs = await fetchEtherscanClaims(beneficiary, allIndexes);
            } catch (e) {
                console.warn(`  ${beneficiary}: ${e.message} — falling back to the log scan`);
            }
        }
        if (claimTxs.length === 0) {
            const mine = claimLogs.filter(l => l.user.toLowerCase() === beneficiary);
            mine.sort((a, b) => a.blockNumber - b.blockNumber);
            for (const log of mine) {
                claimTxs.push({
                    txHash: log.txHash,
                    timestamp: await getBlockTime(log.blockNumber),
                    indexes: await getClaimedIndexes(log.txHash, allIndexes),
                });
            }
        }

        if (claimTxs.length === 0) {
            console.log(`${beneficiary}: no claim transactions recoverable (${rows.length} schedule(s), ${recorded.size} receipt(s) already stored)`);
            continue;
        }

        claimTxs.sort((a, b) => a.timestamp - b.timestamp);
        const assignedUpTo = new Map(); // vesting_index -> last period given a hash
        const inserts = [];

        for (const claimTx of claimTxs) {
            const when = claimTx.timestamp;

            for (const index of claimTx.indexes) {
                const schedule = rows.find(r => r.vesting_index === index);
                if (!schedule) continue;
                const start = Math.floor(new Date(schedule.start_at).getTime() / 1000);
                const cliff = Number(schedule.cliff_months);
                const totalPeriods = Number(schedule.vesting_months);
                const perPeriod = parseFloat(schedule.total_amount) / (totalPeriods || 1);

                // Periods the contract had unlocked by the time this tx landed
                const unlocked = Math.max(0, Math.min(totalPeriods, Math.floor((when - start) / PERIOD_SECONDS) - cliff));
                const from = (assignedUpTo.get(index) ?? 0) + 1;
                for (let period = from; period <= unlocked; period++) {
                    if (!recorded.has(`${index}:${period}`)) {
                        inserts.push([schedule.beneficiary, index, period, perPeriod.toString(), claimTx.txHash]);
                    }
                }
                if (unlocked >= from) assignedUpTo.set(index, unlocked);
            }
        }

        console.log(`${beneficiary}: ${claimTxs.length} claim tx(s) -> ${inserts.length} receipt(s) to write`);
        for (const [, index, period, amount, hash] of inserts) {
            console.log(`   index ${index} period ${period}  ${Number(amount).toFixed(2)} Trustive  ${hash}`);
        }
        planned += inserts.length;

        if (APPLY && inserts.length > 0) {
            await conn.query(
                'INSERT IGNORE INTO vesting_claims (beneficiary, vesting_index, period_index, amount, tx_hash) VALUES ?',
                [inserts]
            );
        }
    }

    console.log(APPLY ? `\nWrote ${planned} receipt(s).` : `\nDry run: would write ${planned} receipt(s). Re-run with --apply.`);
    await conn.end();
})().catch(err => { console.error(err); process.exit(1); });
