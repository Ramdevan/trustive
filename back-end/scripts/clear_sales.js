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

  console.log('Purging token_sales table...');
  await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
  await connection.query('TRUNCATE TABLE `token_sales`;');
  await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('✓ All token sales removed successfully from database.');

  await connection.end();
}

main().catch((err) => {
  console.error('Error clearing sales:', err);
  process.exit(1);
});
