/**
 * One-off repair for vesting_schedules.
 *
 * /createVesting derived the new index from getVestingCount() straight after the
 * tx, and a lagging RPC read gave a count that was one behind. Every affected
 * row landed on the previous vesting's index, so a (beneficiary, vesting_index)
 * pair ended up with two rows. This keeps the row that matches the chain for
 * that index, drops the rest, and adds the unique key that stops it recurring.
 *
 * Usage:
 *   node scripts/fix_vesting_duplicates.js          # dry run, prints the plan
 *   node scripts/fix_vesting_duplicates.js --apply  # delete duplicates + add key
 */
const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Same as Plugins/Mysql.js — without it DATETIMEs come back shifted by the
    // host's local offset and every row looks equally far from the chain time.
    timezone: '+00:00',
};

const RPC_URLS = [
    process.env.RPC_URL,
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.gateway.tenderly.co',
    'https://sepolia.drpc.org',
].filter(Boolean);

const VESTING_ADDRESS = process.env.VESTING_CONTRACT_ADDRESS || '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12';

async function getContract() {
    const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/vesting.json"), 'utf8'));
    for (const url of RPC_URLS) {
        try {
            const provider = new ethers.JsonRpcProvider(url);
            await provider.getBlockNumber();
            console.log('Using RPC:', url);
            return new ethers.Contract(VESTING_ADDRESS, abi, provider);
        } catch (e) { /* try next */ }
    }
    console.warn('No working RPC — falling back to the earliest-row heuristic');
    return null;
}

(async () => {
    const conn = await mysql.createConnection(dbConfig);
    const contract = await getContract();

    const [groups] = await conn.query(
        `SELECT beneficiary, vesting_index, COUNT(*) AS n
         FROM vesting_schedules
         GROUP BY beneficiary, vesting_index
         HAVING n > 1`
    );

    if (groups.length === 0) {
        console.log('No duplicate (beneficiary, vesting_index) rows.');
    }

    const toDelete = [];
    for (const g of groups) {
        const [rows] = await conn.query(
            'SELECT * FROM vesting_schedules WHERE beneficiary = ? AND vesting_index = ? ORDER BY start_at ASC, id ASC',
            [g.beneficiary, g.vesting_index]
        );

        // The chain is the authority: keep whichever row starts closest to the
        // on-chain startTimestamp for this index.
        let keep = rows[0];
        let reason = 'earliest start_at (no chain data)';
        if (contract) {
            try {
                const details = await contract.getVestingDetails(g.beneficiary, g.vesting_index);
                const chainStartMs = Number(details.startTimestamp) * 1000;
                const chainTotal = parseFloat(ethers.formatEther(details.totalAmount));
                let best = null;
                for (const r of rows) {
                    const drift = Math.abs(new Date(r.start_at).getTime() - chainStartMs);
                    const amountMatches = Math.abs(parseFloat(r.total_amount) - chainTotal) < 1e-9 ? 0 : 1;
                    const score = amountMatches * 1e12 + drift;
                    if (!best || score < best.score) best = { row: r, score, drift };
                }
                keep = best.row;
                reason = `matches chain start (${Math.round(best.drift / 1000)}s drift, ${chainTotal} Trustive)`;
            } catch (e) {
                console.warn(`  chain read failed for ${g.beneficiary}#${g.vesting_index}: ${e.message}`);
            }
        }

        console.log(`\n${g.beneficiary} index ${g.vesting_index} — ${rows.length} rows`);
        for (const r of rows) {
            const mark = r.id === keep.id ? 'KEEP  ' : 'DELETE';
            console.log(`  ${mark} id=${r.id} amount=${r.total_amount} start=${new Date(r.start_at).toISOString()} tx=${(r.tx_hash || '').slice(0, 14)}`);
        }
        console.log(`  reason: ${reason}`);
        toDelete.push(...rows.filter(r => r.id !== keep.id));
    }

    const [idx] = await conn.query('SHOW INDEX FROM vesting_schedules');
    const hasKey = idx.some(i => i.Key_name === 'unique_beneficiary_index');

    if (!APPLY) {
        console.log(`\nDry run: would delete ${toDelete.length} row(s)` + (hasKey ? '' : ' and add unique_beneficiary_index'));
        console.log('Re-run with --apply to make the changes.');
        await conn.end();
        return;
    }

    if (toDelete.length > 0) {
        const backup = path.join(__dirname, `vesting_duplicates_backup_${Date.now()}.json`);
        fs.writeFileSync(backup, JSON.stringify(toDelete, null, 2));
        console.log(`\nBacked up ${toDelete.length} row(s) to ${backup}`);
        await conn.query('DELETE FROM vesting_schedules WHERE id IN (?)', [toDelete.map(r => r.id)]);
        console.log(`Deleted ${toDelete.length} duplicate row(s).`);
    }

    if (!hasKey) {
        await conn.query('ALTER TABLE vesting_schedules ADD UNIQUE KEY unique_beneficiary_index (beneficiary, vesting_index)');
        console.log('Added unique key unique_beneficiary_index (beneficiary, vesting_index).');
    } else {
        console.log('Unique key already present.');
    }

    await conn.end();
})().catch(err => { console.error(err); process.exit(1); });
