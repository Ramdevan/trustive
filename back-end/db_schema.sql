-- Trustive Backend Database Schema
-- Database: trustive_db

SET NAMES utf8mb4;
SET TIME_ZONE = '+00:00';

-- ========================================
-- Settings Table
-- ========================================
CREATE TABLE IF NOT EXISTS `settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `site_name` varchar(255) DEFAULT 'Trustive',
  `site_logo` varchar(500) DEFAULT NULL,
  `token_logo` varchar(500) DEFAULT NULL,
  `whitepaper` varchar(500) DEFAULT NULL,
  `owner_address` varchar(255) DEFAULT NULL,
  `admin_email` varchar(255) DEFAULT NULL,
  `admin_password` varchar(255) DEFAULT NULL,
  `admin_two_fa_secret` varchar(255) DEFAULT NULL,
  `admin_two_fa_enabled` tinyint(1) DEFAULT 0,
  `token_name` varchar(100) DEFAULT 'Trustive',
  `token_symbol` varchar(20) DEFAULT 'Trustive',
  `chain` varchar(50) DEFAULT 'Base Sepolia',
  `token_decimal` int DEFAULT 18,
  `contract_address` varchar(255) DEFAULT '0xe12F60d7c0bc493b033c789Aa533E772541041eA',
  `crypto_decimal` int DEFAULT 8,
  `fiat_decimal` int DEFAULT 2,
  `ico_contract` varchar(255) DEFAULT '0x300C8EEB80Af24FF831015cF667f670077Fe1564',
  `usdt_address` varchar(255) DEFAULT '0xFF891d2335d111fb71Eecec16255a6F285eF9aD3',
  `usdc_address` varchar(255) DEFAULT '0xFC266AF032A9243dba4f9Dfe0BE69e6f76d1b80b',
  `eth_address` varchar(255) DEFAULT NULL,
  `staking_contract` varchar(255) DEFAULT '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb',
  `vesting_contract` varchar(255) DEFAULT '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12',
  `ico_remaining_tokens` varchar(255) DEFAULT '0',
  `referral_level1` decimal(5,2) DEFAULT 5.00,
  `kyc_enabled` tinyint(1) DEFAULT 0,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings
INSERT INTO `settings` (`site_name`, `token_name`, `token_symbol`, `chain`, `token_decimal`, `contract_address`, `ico_contract`, `usdt_address`, `usdc_address`, `staking_contract`, `vesting_contract`, `referral_level1`, `admin_email`, `admin_password`)
VALUES ('Trustive', 'Trustive', 'Trustive', 'Base Sepolia', 18, '0xe12F60d7c0bc493b033c789Aa533E772541041eA', '0x300C8EEB80Af24FF831015cF667f670077Fe1564', '0xFF891d2335d111fb71Eecec16255a6F285eF9aD3', '0xFC266AF032A9243dba4f9Dfe0BE69e6f76d1b80b', '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb', '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12', 5.00, 'admin@trustive.com', 'admin123');

-- ========================================
-- Users Table
-- ========================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT 0,
  `verification_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wallet_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `PTC_REF_ID` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referred_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrer_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `two_fa_secret` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `two_fa_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_address_unique` (`wallet_address`),
  UNIQUE KEY `ptc_ref_id_unique` (`PTC_REF_ID`),
  UNIQUE KEY `email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- Token Sales Table
-- ========================================
CREATE TABLE IF NOT EXISTS `token_sales` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_quantity` decimal(30,8) DEFAULT 0,
  `price` decimal(20,8) DEFAULT 0,
  `minimum_purchase` decimal(20,8) DEFAULT 0,
  `maximum_purchase` decimal(20,8) DEFAULT 0,
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `status` enum('active','scheduled','ended') COLLATE utf8mb4_unicode_ci DEFAULT 'scheduled',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- ICO Purchases Table
-- ========================================
CREATE TABLE IF NOT EXISTS `ico_purchases` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `crypto_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '0',
  `payment_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ptc_tokens` decimal(30,8) DEFAULT 0,
  `trans_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `usd_value_of_crypto` decimal(20,8) DEFAULT 0,
  `sale_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'success',
  `referrer_bonus` decimal(20,8) DEFAULT 0,
  `referrer_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trans_hash_unique` (`trans_hash`),
  INDEX `idx_address` (`address`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- Admin Withdraw Table
-- ========================================
CREATE TABLE IF NOT EXISTS `admin_withdraw` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `coin` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(38,18) NOT NULL DEFAULT 0,
  `to_address` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tx_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tx_hash_unique` (`tx_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- Payment Settings History Table
-- ========================================
CREATE TABLE IF NOT EXISTS `payment_settings_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_value` text COLLATE utf8mb4_unicode_ci,
  `new_value` text COLLATE utf8mb4_unicode_ci,
  `changed_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Admin',
  `transaction_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- Vesting Schedules Table
-- ========================================
CREATE TABLE IF NOT EXISTS `vesting_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `beneficiary` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `total_amount` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `cliff_months` int NOT NULL,
  `vesting_months` int NOT NULL,
  `start_at` datetime NOT NULL,
  `tx_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT '',
  `vesting_index` int DEFAULT 0,
  `status` enum('active','revoked') COLLATE utf8mb4_general_ci DEFAULT 'active',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_beneficiary_index` (`beneficiary`, `vesting_index`),
  INDEX `idx_beneficiary` (`beneficiary`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ========================================
-- Vesting Claims Table (one row per vesting period released by a claim tx)
-- ========================================
CREATE TABLE IF NOT EXISTS `vesting_claims` (
  `id` int NOT NULL AUTO_INCREMENT,
  `beneficiary` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `vesting_index` int NOT NULL DEFAULT 0,
  `period_index` int NOT NULL,
  `amount` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0',
  `tx_hash` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_claim_period` (`beneficiary`, `vesting_index`, `period_index`),
  INDEX `idx_beneficiary` (`beneficiary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ========================================
-- Staking Plans Table
-- ========================================
CREATE TABLE IF NOT EXISTS `staking_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `duration_days` int NOT NULL DEFAULT 0,
  `duration_seconds` int DEFAULT 0,
  `apy` decimal(10,2) NOT NULL DEFAULT 0,
  `min_stake` varchar(255) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT 1,
  `total_staked` varchar(255) DEFAULT '0',
  `chain_level` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert default staking plans
INSERT INTO `staking_plans` (`name`, `duration_days`, `duration_seconds`, `apy`, `min_stake`, `is_active`, `chain_level`) VALUES
('GOLD', 0, 180, 8.00, '1000', 1, 1);

-- ========================================
-- Staking Records Table
-- ========================================
CREATE TABLE IF NOT EXISTS `staking_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_address` varchar(255) NOT NULL,
  `amount` varchar(255) NOT NULL,
  `plan_id` int NOT NULL DEFAULT 0,
  `plan_name` varchar(100) DEFAULT 'Flexible',
  `apy` decimal(10,2) DEFAULT 0,
  `duration_days` int DEFAULT 0,
  `duration_seconds` int DEFAULT 0,
  `chain_stake_index` int DEFAULT NULL,
  `stake_tx_hash` varchar(255) NOT NULL,
  `unstake_tx_hash` varchar(255) DEFAULT NULL,
  `is_emergency` tinyint(1) NOT NULL DEFAULT 0,
  `start_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_at` timestamp NULL DEFAULT NULL,
  `reward_claimed` varchar(255) DEFAULT '0',
  `status` enum('active','completed','unstaked') DEFAULT 'active',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_stake_tx` (`stake_tx_hash`),
  INDEX `idx_user_address` (`user_address`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ========================================
-- Staking Reward History Table
-- ========================================
CREATE TABLE IF NOT EXISTS `staking_reward_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_address` varchar(255) NOT NULL,
  `stake_id` int NOT NULL,
  `reward_amount` varchar(255) NOT NULL,
  `tx_hash` varchar(255) NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_reward_tx` (`tx_hash`),
  INDEX `idx_user_address` (`user_address`),
  INDEX `idx_stake_id` (`stake_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ========================================
-- CMS Sections Table
-- ========================================
CREATE TABLE IF NOT EXISTS `cms_sections` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `section_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtitle` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `button_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `button_link` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_order` int DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `section_key_unique` (`section_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
