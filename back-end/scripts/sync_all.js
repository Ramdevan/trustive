const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

const RPC_URLS = [
    process.env.RPC_URL || 'https://rpc.sepolia.org',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.gateway.tenderly.co'
];

let provider;
async function initProvider() {
    for (const url of RPC_URLS) {
        try {
            const p = new ethers.JsonRpcProvider(url);
            await p.getBlockNumber();
            console.log("Using RPC: " + url);
            return p;
        } catch (e) { }
    }
    throw new Error("No working RPC found");
}

const ICO_ADDR = process.env.ICO_CONTRACT_ADDRESS || '0x300C8EEB80Af24FF831015cF667f670077Fe1564';
const STAKING_ADDR = process.env.STAKING_CONTRACT_ADDRESS || '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';
const VESTING_ADDR = process.env.VESTING_CONTRACT_ADDRESS || '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12';

const ICO_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../abi\'s/ico.json'), 'utf8'));
const STAKING_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../abi\'s/staking.json'), 'utf8'));
const VESTING_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../abi\'s/vesting.json'), 'utf8'));

async function sync() {
    console.log("Starting Deep Sync from Chain...");
    provider = await initProvider();

    const icoContract = new ethers.Contract(ICO_ADDR, ICO_ABI, provider);
    const stakingContract = new ethers.Contract(STAKING_ADDR, STAKING_ABI, provider);
    const vestingContract = new ethers.Contract(VESTING_ADDR, VESTING_ABI, provider);

    const connection = await mysql.createConnection(dbConfig);

    // 0. SYNC STAKING PLANS
    console.log("Syncing Staking Plans...");
    try {
        const planCount = await stakingContract.totalPlans();
        console.log(`Found ${planCount} plans.`);
        for (let i = 1; i <= Number(planCount); i++) {
            const plan = await stakingContract.getPlanDetails(i);
            if (plan.exists) {
                await connection.query(
                    "INSERT INTO staking_plans (name, chain_level, apy, duration_seconds, is_active, min_stake) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE apy = VALUES(apy), duration_seconds = VALUES(duration_seconds), is_active = VALUES(is_active)",
                    ["Level " + i, i, Number(plan.rewardPercent), Number(plan.durationLimit), plan.active ? 1 : 0, '1000']
                );
            }
        }
    } catch (e) {
        console.error("Staking Plans sync failed:", e.message);
    }

    // Refresh plan cache
    const [planList] = await connection.query("SELECT * FROM staking_plans");
    const planMap = {};
    planList.forEach(p => planMap[p.chain_level] = p);

    const currentBlock = await provider.getBlockNumber();
    const startBlock = 10600000;
    console.log("Scanning from block " + startBlock + " to " + currentBlock);

    async function getLogsInChunks(contract, filter, start, end) {
        let results = [];
        const CHUNK_SIZE = 2000;
        for (let i = start; i < end; i += CHUNK_SIZE) {
            const toBlock = Math.min(i + CHUNK_SIZE, end);
            console.log("  Fetching logs " + i + " to " + toBlock + " for " + contract.target + "...");
            try {
                const logs = await contract.queryFilter(filter, i, toBlock);
                results = results.concat(logs);
            } catch (e) {
                console.error("    Chunk failed, skipping: " + e.message);
            }
        }
        return results;
    }

    const uniqueUsers = new Set();

    // 1. STAKING SYNC
    console.log("Syncing Staking Events...");
    const stakingFilter = stakingContract.filters.Staking();
    let stakingEvents = await getLogsInChunks(stakingContract, stakingFilter, startBlock, currentBlock);
    console.log("Found " + stakingEvents.length + " total Staking events.");

    for (const event of stakingEvents) {
        const [user, level, amount, endtime] = event.args;
        const txHash = event.transactionHash;
        uniqueUsers.add(user.toLowerCase());

        try {
            const res = await stakingContract.getUserDetails(user, level);
            const details = res[0];

            const plan = planMap[Number(level)] || { id: 0, name: "Level " + level, apy: 0, duration_seconds: 0 };

            const principal = ethers.formatEther(amount);
            const reward = ethers.formatEther(details.rewardAmount);

            await connection.query(`
                INSERT INTO staking_records 
                (user_address, amount, plan_id, plan_name, apy, duration_seconds, stake_tx_hash, start_at, end_at, status, chain_stake_index, reward_claimed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                status = VALUES(status),
                end_at = VALUES(end_at),
                reward_claimed = VALUES(reward_claimed),
                amount = VALUES(amount)
            `, [
                user.toLowerCase(),
                principal,
                plan.id,
                plan.name,
                plan.apy,
                plan.duration_seconds,
                txHash,
                new Date(Number(details.initialTime || 0) * 1000),
                details.endTime > 0n ? new Date(Number(details.endTime) * 1000) : null,
                details.status ? 'active' : 'unstaked',
                Number(level),
                reward
            ]);
        } catch (e) {
            console.error(`Sync error for ${user} L${level}: ${e.message}`);
        }
    }

    // 2. WITHDRAW SYNC
    console.log("Syncing Withdraw Events...");
    const withdrawFilter = stakingContract.filters.Withdraw();
    let withdrawEvents = await getLogsInChunks(stakingContract, withdrawFilter, startBlock, currentBlock);
    console.log("Found " + withdrawEvents.length + " Withdraw events.");

    for (const event of withdrawEvents) {
        const [user, withdrawAmount, rewardAmount] = event.args;
        const txHash = event.transactionHash;

        try {
            await connection.query(`
                UPDATE staking_records 
                SET status = 'unstaked', 
                    reward_claimed = ?, 
                    unstake_tx_hash = ?,
                    updated_at = NOW()
                WHERE LOWER(user_address) = LOWER(?) AND status IN ('active', 'unstaked') AND reward_claimed = '0'
            `, [
                ethers.formatEther(rewardAmount),
                txHash,
                user.toLowerCase()
            ]);
        } catch (e) { }
    }

    // 4. USERS SYNC
    console.log("Ensuring users exist...");
    for (const user of uniqueUsers) {
        await connection.query("INSERT IGNORE INTO users (wallet_address) VALUES (?)", [user]);
    }

    // 5. VESTING SYNC
    console.log("Syncing Vesting for " + uniqueUsers.size + " unique users...");
    for (const user of uniqueUsers) {
        try {
            const count = await vestingContract.getVestingCount(user);
            if (Number(count) > 0) {
                for (let i = 0; i < Number(count); i++) {
                    const details = await vestingContract.getVestingDetails(user, i);
                    await connection.query(`
                        INSERT IGNORE INTO vesting_schedules 
                        (beneficiary, total_amount, cliff_months, vesting_months, start_at, status, vesting_index)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        user,
                        ethers.formatEther(details.totalAmount),
                        Number(details.cliffMonths),
                        Number(details.vestingMonths),
                        new Date(Number(details.startTimestamp) * 1000),
                        'active',
                        i
                    ]);
                }
            }
        } catch (e) { }
    }

    // 6. ICO PURCHASES SYNC
    console.log("Syncing ICO Purchases Events...");
    try {
        const icoFilter = icoContract.filters.TokenPurchased();
        let icoLogs = await getLogsInChunks(icoContract, icoFilter, startBlock, currentBlock);
        console.log("Found " + icoLogs.length + " TokenPurchased events.");
        for (const log of icoLogs) {
            const txHash = log.transactionHash;
            const recipient = log.args[0];
            const trustiveTokens = ethers.formatEther(log.args[1]);
            uniqueUsers.add(recipient.toLowerCase());

            let createdAt = new Date();
            let paymentType = 'ETH';
            let cryptoValue = '0.001';
            let usdValue = '2.50';

            try {
                const [tx, block] = await Promise.all([
                    provider.getTransaction(txHash).catch(() => null),
                    provider.getBlock(log.blockNumber).catch(() => null)
                ]);
                if (block) {
                    createdAt = new Date(block.timestamp * 1000);
                }
                if (tx) {
                    const ethVal = parseFloat(ethers.formatEther(tx.value));
                    if (ethVal > 0) {
                        paymentType = 'ETH';
                        cryptoValue = ethVal.toString();
                        usdValue = (ethVal * 2500).toFixed(2);
                    } else {
                        paymentType = 'USDT';
                        cryptoValue = '1';
                        usdValue = '1.00';
                    }
                }
            } catch (e) { }

            await connection.query("INSERT IGNORE INTO users (wallet_address) VALUES (?)", [recipient]);
            await connection.query(
                `INSERT INTO ico_purchases (address, crypto_value, payment_type, ptc_tokens, trans_hash, usd_value_of_crypto, sale_type, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?)
                 ON DUPLICATE KEY UPDATE ptc_tokens = VALUES(ptc_tokens), status = 'success'`,
                [recipient, cryptoValue, paymentType, trustiveTokens, txHash, usdValue, 'PRESALE', createdAt]
            );
        }
    } catch (e) {
        console.error("ICO Purchases sync failed:", e.message);
    }

    console.log("Sync Complete!");
    await connection.end();
}

sync().catch(console.error);
