-- Trustive Test Data Purge SQL Script
-- PRESERVES: users, settings
-- PURGES: token_sales, ico_purchases, vesting_schedules, admin_withdraw, payment_settings_history

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `token_sales`;
TRUNCATE TABLE `ico_purchases`;
TRUNCATE TABLE `vesting_schedules`;
TRUNCATE TABLE `admin_withdraw`;
TRUNCATE TABLE `payment_settings_history`;

UPDATE `settings` SET `ico_remaining_tokens` = '0' WHERE `id` = 1;

SET FOREIGN_KEY_CHECKS = 1;
