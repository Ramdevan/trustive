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
    process.env.RPC_URL || 'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet-rpc.publicnode.com',
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://data-seed-prebsc-2-s1.binance.org:8545',
    'https://bsc-testnet.drpc.org'
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

const ICO_ADDR = process.env.ICO_CONTRACT_ADDRESS || '0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC';
const VESTING_ADDR = process.env.VESTING_CONTRACT_ADDRESS || '0xbd0a737599462974aD054c958Fce5bbfaaEDeFb8';

const ICO_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../abi\'s/ico.json'), 'utf8'));
const VESTING_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../abi\'s/vesting.json'), 'utf8'));

async function sync() {
    console.log("Starting Deep Sync from Chain...");
    provider = await initProvider();

    const icoContract = new ethers.Contract(ICO_ADDR, ICO_ABI, provider);
    const vestingContract = new ethers.Contract(VESTING_ADDR, VESTING_ABI, provider);

    const connection = await mysql.createConnection(dbConfig);

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

    // 1. ICO PURCHASES SYNC
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
            let paymentType = 'BNB';
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
                    const nativeVal = parseFloat(ethers.formatEther(tx.value));
                    if (nativeVal > 0) {
                        paymentType = 'BNB';
                        cryptoValue = nativeVal.toString();
                        usdValue = (nativeVal * 700).toFixed(2);
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

    // 2. USERS SYNC
    console.log("Ensuring users exist...");
    for (const user of uniqueUsers) {
        await connection.query("INSERT IGNORE INTO users (wallet_address) VALUES (?)", [user]);
    }

    // 3. VESTING SYNC
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

    console.log("Sync Complete!");
    await connection.end();
}

sync().catch(console.error);
