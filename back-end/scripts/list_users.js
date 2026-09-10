require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ppm_db',
  });

  console.log('Fetching all users from database...\n');
  const [users] = await connection.query('SELECT id, name, email, wallet_address, is_verified, created_at FROM users ORDER BY id DESC');
  
  if (users.length === 0) {
    console.log('No users found in database.');
  } else {
    console.table(users);
  }

  await connection.end();
}

main().catch((err) => {
  console.error('Error listing users:', err);
  process.exit(1);
});
