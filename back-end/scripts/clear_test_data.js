require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function main() {
  console.log('--------------------------------------------------');
  console.log('Trustive DB Data Purge Utility');
  console.log('--------------------------------------------------');
  console.log(`Connecting to database: ${process.env.DB_NAME || 'ppm_db'} at ${process.env.DB_HOST || 'localhost'}...`);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ppm_db',
  });

  console.log('Connected successfully.\n');

  // Tables to clear
  const tablesToClear = [
    'token_sales',
    'ico_purchases',
    'vesting_schedules',
    'staking_records',
    'staking_reward_history',
    'admin_withdraw',
    'payment_settings_history'
  ];

  // Preserved tables
  const preservedTables = ['users', 'settings', 'cms_sections', 'staking_plans'];

  console.log('Checking current row counts:');
  for (const table of [...preservedTables, ...tablesToClear]) {
    try {
      const [rows] = await connection.query(`SELECT COUNT(*) as count FROM \`${table}\``);
      console.log(`  - ${table.padEnd(26)}: ${rows[0].count} rows ${preservedTables.includes(table) ? '(PRESERVED)' : '(WILL CLEAR)'}`);
    } catch (e) {
      console.log(`  - ${table.padEnd(26)}: (table does not exist or error)`);
    }
  }

  console.log('\nPurging test data while PRESERVING user accounts and system configuration...');
  await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

  for (const table of tablesToClear) {
    try {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`  ✓ Cleared ${table}`);
    } catch (err) {
      console.warn(`  ! Could not truncate ${table}: ${err.message}`);
    }
  }

  // Reset cached remaining tokens in settings to default if desired
  try {
    await connection.query("UPDATE settings SET ico_remaining_tokens = '0' WHERE id = 1");
    console.log("  ✓ Reset settings.ico_remaining_tokens to 0");
  } catch (e) { }

  await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

  console.log('\nPost-purge verification:');
  for (const table of [...preservedTables, ...tablesToClear]) {
    try {
      const [rows] = await connection.query(`SELECT COUNT(*) as count FROM \`${table}\``);
      console.log(`  - ${table.padEnd(26)}: ${rows[0].count} rows`);
    } catch (e) { }
  }

  await connection.end();
  console.log('\nPurge operation completed successfully.');
}

main().catch((err) => {
  console.error('Purge error:', err);
  process.exit(1);
});
