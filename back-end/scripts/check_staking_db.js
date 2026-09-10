const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

async function queryDB() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [rows] = await connection.query('SELECT * FROM staking_records');
        console.log("Staking records count:", rows.length);
        console.log(rows);

        const [plans] = await connection.query('SELECT * FROM staking_plans');
        console.log("Staking plans count:", plans.length);
        console.log(plans);

        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
queryDB();
