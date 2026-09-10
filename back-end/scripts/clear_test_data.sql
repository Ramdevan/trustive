-- Trustive Test Data Purge SQL Script
-- PRESERVES: users, settings, cms_sections, staking_plans
-- PURGES: token_sales, ico_purchases, vesting_schedules, staking_records, staking_reward_history, admin_withdraw, payment_settings_history

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `token_sales`;
TRUNCATE TABLE `ico_purchases`;
TRUNCATE TABLE `vesting_schedules`;
TRUNCATE TABLE `staking_records`;
TRUNCATE TABLE `staking_reward_history`;
TRUNCATE TABLE `admin_withdraw`;
TRUNCATE TABLE `payment_settings_history`;

UPDATE `settings` SET `ico_remaining_tokens` = '0' WHERE `id` = 1;

SET FOREIGN_KEY_CHECKS = 1;
