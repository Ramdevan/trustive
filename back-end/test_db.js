const mysql = require('mysql2');
require('dotenv').config();
const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || ''
});

async function main() {
    const executeQuery = (sql, params) => {
        return new Promise((resolve, reject) => {
            pool.query(sql, params, (err, results, fields) => {
                if (err) reject(err);
                else resolve([results, fields]);
            });
        });
    };

    const [statsRows] = await executeQuery(`
        SELECT
            (SELECT COUNT(*) FROM users) AS total_users,
            (SELECT COUNT(*) FROM ico_purchases WHERE status IN ('success', 'paid')) AS total_transactions,
            (SELECT COUNT(*) FROM ico_purchases WHERE status IN ('success', 'paid')) AS successful_transactions,
            (SELECT COUNT(*) FROM ico_purchases WHERE status = 'failed') AS failed_transactions,
            (SELECT COALESCE(SUM(ptc_tokens), 0) FROM ico_purchases WHERE status IN ('success', 'paid')) AS purchased_tokens;
    `);

    const [stakingStats] = await executeQuery(`
        SELECT
            (SELECT COUNT(*) FROM staking_records WHERE status = 'active') AS active_stakes,
            (SELECT COUNT(DISTINCT user_address) FROM staking_records) AS total_stakers,
            (SELECT COALESCE(SUM(CAST(amount AS DECIMAL(36,18))), 0) FROM staking_records WHERE status = 'active') AS total_staked,
            (SELECT COALESCE(SUM(CAST(reward_claimed AS DECIMAL(36,18))), 0) FROM staking_records) AS total_rewards_distributed,
            (SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(36,18))), 0) FROM vesting_schedules WHERE status = 'active') AS tokens_in_vesting
    `);

    console.log("Stats rows:", statsRows);
    console.log("Staking stats:", stakingStats);

    // Check if the actual tables have data:
    const [users] = await executeQuery(`SELECT * FROM users`);
    console.log("Users:", users.length);

    pool.end();
}
main();
