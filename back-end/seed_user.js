const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function seed() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '12345',
        database: process.env.DB_NAME || 'ppm_db'
    });

    const email = 'Demo@trustive.com';
    const password = 'Demo@123';
    const hash = await bcrypt.hash(password, 10);

    const [existing] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length === 0) {
        await connection.execute(
            'INSERT INTO users (name, email, password, is_verified, PTC_REF_ID, wallet_address) VALUES (?, ?, ?, ?, ?, ?)',
            ['Demo User', email, hash, 1, 'REFTRUSTIVEDEMO123', '']
        );
        console.log('Dummy user created');
    } else {
        console.log('Dummy user already exists');
    }
    await connection.end();
}

seed().catch(console.error);
