require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function main() {
  const target = process.argv[2] || '';

  if (!target) {
    console.log('Usage: node back-end/scripts/delete_user.js <username | email | 0xAddress>');
    process.exit(1);
  }

  console.log('--------------------------------------------------');
  console.log(`Trustive Data Purge: Target "${target}"`);
  console.log('--------------------------------------------------');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ppm_db',
  });

  await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

  // If target looks like a wallet address
  if (target.startsWith('0x') || target.length === 42) {
    console.log(`Searching for wallet address ${target}...`);
    const [delPurchases] = await connection.query('DELETE FROM ico_purchases WHERE address LIKE ?', [`%${target}%`]);
    const [delStakes] = await connection.query('DELETE FROM staking_records WHERE user_address LIKE ?', [`%${target}%`]);
    const [delRewards] = await connection.query('DELETE FROM staking_reward_history WHERE user_address LIKE ?', [`%${target}%`]);
    const [delVestings] = await connection.query('DELETE FROM vesting_schedules WHERE beneficiary LIKE ?', [`%${target}%`]);
    const [delUsers] = await connection.query('DELETE FROM users WHERE wallet_address LIKE ?', [`%${target}%`]);

    console.log(`  ✓ Removed ${delUsers.affectedRows} user account(s) matching wallet.`);
    console.log(`  ✓ Removed ${delPurchases.affectedRows} purchase record(s).`);
    console.log(`  ✓ Removed ${delStakes.affectedRows} staking record(s).`);
    console.log(`  ✓ Removed ${delRewards.affectedRows} staking reward(s).`);
    console.log(`  ✓ Removed ${delVestings.affectedRows} vesting schedule(s).`);
  } else {
    // Search users by name or email
    const [users] = await connection.query(
      'SELECT * FROM users WHERE name LIKE ? OR email LIKE ? OR wallet_address LIKE ?',
      [`%${target}%`, `%${target}%`, `%${target}%`]
    );

    if (users.length === 0) {
      console.log(`No user found matching "${target}".`);
    } else {
      for (const user of users) {
        console.log(`  - Found: ID ${user.id} | "${user.name}" | "${user.email}" | Wallet: "${user.wallet_address || 'None'}"`);
        if (user.wallet_address) {
          await connection.query('DELETE FROM ico_purchases WHERE address = ?', [user.wallet_address]);
          await connection.query('DELETE FROM staking_records WHERE user_address = ?', [user.wallet_address]);
          await connection.query('DELETE FROM staking_reward_history WHERE user_address = ?', [user.wallet_address]);
          await connection.query('DELETE FROM vesting_schedules WHERE beneficiary = ?', [user.wallet_address]);
        }
        await connection.query('DELETE FROM users WHERE id = ?', [user.id]);
        console.log(`    ✓ Deleted user ID ${user.id}`);
      }
    }
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('\nOperation completed.');
  await connection.end();
}

main().catch((err) => {
  console.error('Error in deletion utility:', err);
  process.exit(1);
});
