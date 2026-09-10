const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function syncPurchases() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'trustive_ico'
        });
        const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
        const icoAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/ico.json"), 'utf8'));
        const icoAddress = process.env.ICO_CONTRACT_ADDRESS || '0x300C8EEB80Af24FF831015cF667f670077Fe1564';
        const icoContract = new ethers.Contract(icoAddress, icoAbi, provider);

        const currentBlock = await provider.getBlockNumber();
        const startBlock = 11500000;
        const filter = icoContract.filters.TokenPurchased();

        const CHUNK_SIZE = 10000;
        let logs = [];
        for (let i = startBlock; i < currentBlock; i += CHUNK_SIZE) {
            const to = Math.min(i + CHUNK_SIZE, currentBlock);
            const chunk = await icoContract.queryFilter(filter, i, to);
            logs = logs.concat(chunk);
        }
        console.log(`Found ${logs.length} TokenPurchased events on-chain.`);

        for (const log of logs) {
            const txHash = log.transactionHash;
            const recipient = log.args[0];
            const trustiveTokens = ethers.formatEther(log.args[1]);

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

            // Ensure user exists
            await conn.query("INSERT IGNORE INTO users (wallet_address) VALUES (?)", [recipient]);

            // Upsert into ico_purchases
            await conn.query(
                `INSERT INTO ico_purchases (address, crypto_value, payment_type, ptc_tokens, trans_hash, usd_value_of_crypto, sale_type, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?)
                 ON DUPLICATE KEY UPDATE ptc_tokens = VALUES(ptc_tokens), status = 'success'`,
                [recipient, cryptoValue, paymentType, trustiveTokens, txHash, usdValue, 'PRESALE', createdAt]
            );
            console.log(`Synced purchase: ${recipient} -> ${trustiveTokens} Trustive (${paymentType})`);
        }

        const [summary] = await conn.query("SELECT COUNT(*) as total_txs, COALESCE(SUM(ptc_tokens), 0) as total_tokens FROM ico_purchases WHERE status IN ('success', 'paid')");
        console.log('ICO Purchases Summary in DB:', summary[0]);
        await conn.end();
    } catch (e) {
        console.error('syncPurchases error:', e);
    }
}

if (require.main === module) {
    syncPurchases();
}

module.exports = { syncPurchases };
