const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getProvider, withFailover } = require('../Utils/rpcProvider');
const BN = require('bignumber.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../Utils/Mail');
const sumsubService = require('../Services/SumsubService');

module.exports = async function (fastify, opts) {
  const { toUtcISOString, updateSaleStatuses } = require('./timeUtils');

  // Ensure reset_token, reset_token_expires and the 2FA columns exist in users
  try {
    const [cols] = await fastify.mysql.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('reset_token', 'reset_token_expires', 'two_fa_secret', 'two_fa_enabled')
    `);
    const colNames = (cols || []).map(c => c.COLUMN_NAME);
    if (!colNames.includes('reset_token')) {
      await fastify.mysql.query('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL');
    }
    if (!colNames.includes('reset_token_expires')) {
      await fastify.mysql.query('ALTER TABLE users ADD COLUMN reset_token_expires DATETIME DEFAULT NULL');
    }
    // User 2FA shipped without these columns, so every /generate-2fa hit the
    // catch-all below and came back as a bogus 401
    if (!colNames.includes('two_fa_secret')) {
      await fastify.mysql.query('ALTER TABLE users ADD COLUMN two_fa_secret VARCHAR(255) DEFAULT NULL');
      console.log('[Users] Added two_fa_secret column to users');
    }
    if (!colNames.includes('two_fa_enabled')) {
      await fastify.mysql.query('ALTER TABLE users ADD COLUMN two_fa_enabled TINYINT(1) NOT NULL DEFAULT 0');
      console.log('[Users] Added two_fa_enabled column to users');
    }
  } catch (schemaErr) {
    console.error('Error ensuring users schema:', schemaErr);
  }

  // Ensure MoonPay columns exist in settings
  try {
    const [settingCols] = await fastify.mysql.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME IN ('moonpay_enabled', 'moonpay_api_key', 'moonpay_secret_key', 'moonpay_environment', 'referral_contract')
    `);
    const settingColNames = (settingCols || []).map(c => c.COLUMN_NAME);
    if (!settingColNames.includes('moonpay_enabled')) {
      await fastify.mysql.query('ALTER TABLE settings ADD COLUMN moonpay_enabled TINYINT(1) DEFAULT 1');
    }
    if (!settingColNames.includes('moonpay_api_key')) {
      await fastify.mysql.query('ALTER TABLE settings ADD COLUMN moonpay_api_key VARCHAR(255) DEFAULT "pk_test_123"');
    }
    if (!settingColNames.includes('moonpay_secret_key')) {
      await fastify.mysql.query('ALTER TABLE settings ADD COLUMN moonpay_secret_key VARCHAR(255) DEFAULT NULL');
    }
    if (!settingColNames.includes('moonpay_environment')) {
      await fastify.mysql.query('ALTER TABLE settings ADD COLUMN moonpay_environment VARCHAR(50) DEFAULT "sandbox"');
    }
    if (!settingColNames.includes('referral_contract')) {
      await fastify.mysql.query('ALTER TABLE settings ADD COLUMN referral_contract VARCHAR(255) DEFAULT "0x66ae3C6846C0a340936B127BBBec4f3FC2C08935"');
    }
  } catch (schemaErr) {
    console.error('Error ensuring settings MoonPay & Referral schema:', schemaErr);
  }

  // Ensure referral_claims table exists
  try {
    await fastify.mysql.query(`
      CREATE TABLE IF NOT EXISTS referral_claims (
        id int unsigned NOT NULL AUTO_INCREMENT,
        user_id int unsigned DEFAULT NULL,
        wallet_address varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        amount decimal(30,8) NOT NULL DEFAULT 0,
        nonce bigint unsigned NOT NULL,
        tx_hash varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        status varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'success',
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_nonce (nonce),
        UNIQUE KEY unique_tx_hash (tx_hash),
        INDEX idx_wallet (wallet_address),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (schemaErr) {
    console.error('Error ensuring referral_claims table:', schemaErr);
  }

  // Ensure login_history table exists
  try {
    await fastify.mysql.query(`
      CREATE TABLE IF NOT EXISTS login_history (
        id int unsigned NOT NULL AUTO_INCREMENT,
        user_id int unsigned NOT NULL,
        ip_address varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        country varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '',
        os varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        browser varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        user_agent text COLLATE utf8mb4_unicode_ci,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (schemaErr) {
    console.error('Error ensuring login_history table:', schemaErr);
  }

  // User-Agent, IP and Country parsers for session history
  function parseUserAgent(ua) {
    if (!ua) return { os: 'Linux x86_64', browser: 'Chrome' };
    let os = 'Unknown OS';
    if (/windows nt 10\.0/i.test(ua)) os = 'Windows 10';
    else if (/windows nt 6\.3/i.test(ua)) os = 'Windows 8.1';
    else if (/windows nt 6\.2/i.test(ua)) os = 'Windows 8';
    else if (/windows nt 6\.1/i.test(ua)) os = 'Windows 7';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) {
      if (/x86_64/i.test(ua)) os = 'Linux x86_64';
      else if (/arm|aarch64/i.test(ua)) os = 'Linux ARM';
      else os = 'Linux';
    }

    let browser = 'Unknown Browser';
    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/opr|opera/i.test(ua)) browser = 'Opera';
    else if (/brave/i.test(ua)) browser = 'Brave';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer';

    return { os, browser };
  }

  function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first.replace(/^::ffff:/, '');
    }
    const raw = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const clean = (raw === '::1' ? '127.0.0.1' : raw).replace(/^::ffff:/, '');
    return clean || '127.0.0.1';
  }

  function getCountry(req, ip) {
    const isPrivate = !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.');
    if (isPrivate) return '';
    const cfCountry = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || req.headers['x-country'];
    if (cfCountry && cfCountry !== 'XX') return String(cfCountry).toUpperCase();
    return '';
  }


  // ========================================
  // ========================================
  // User Signup
  // ========================================
  fastify.post('/signup', async (request, reply) => {
    try {
      const { name, email, password, confirmPassword, referral_code } = request.body || {};

      if (!name || !name.trim()) {
        return reply.code(400).send({ status: false, msg: 'Username is required' });
      }

      if (!email || !email.trim()) {
        return reply.code(400).send({ status: false, msg: 'Email is required' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const normalizedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(normalizedEmail)) {
        return reply.code(400).send({ status: false, msg: 'Please enter a valid email address' });
      }

      if (!password) {
        return reply.code(400).send({ status: false, msg: 'Password is required' });
      }

      // If confirmPassword is provided, ensure it matches
      if (confirmPassword !== undefined && password !== confirmPassword) {
        return reply.code(400).send({ status: false, msg: 'Passwords do not match' });
      }

      // Strong password validation: 8-15 chars, 1 uppercase letter, 1 number, 1 special character
      if (password.length < 8 || password.length > 15) {
        return reply.code(400).send({ status: false, msg: 'Password must be between 8 and 15 characters long' });
      }
      if (!/[A-Z]/.test(password)) {
        return reply.code(400).send({ status: false, msg: 'Password must contain at least one uppercase letter (A-Z)' });
      }
      if (!/[0-9]/.test(password)) {
        return reply.code(400).send({ status: false, msg: 'Password must contain at least one number (0-9)' });
      }
      if (!/[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/~`]/.test(password)) {
        return reply.code(400).send({ status: false, msg: 'Password must contain at least one special character' });
      }

      // Check if email already exists in database
      const [existing] = await fastify.mysql.query('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
      if (existing && existing.length > 0) {
        return reply.code(400).send({ status: false, msg: 'Email already registered. Please use another.' });
      }

      const displayName = name.trim();
      const hashedPassword = await bcrypt.hash(password, 10);

      // Check referral code if provided
      let referredBy = null;
      let referrerAddress = null;
      if (referral_code && String(referral_code).trim()) {
        const cleanRef = String(referral_code).trim();
        const [refRows] = await fastify.mysql.query('SELECT id, wallet_address, PTC_REF_ID FROM users WHERE PTC_REF_ID = ? LIMIT 1', [cleanRef]);
        if (refRows && refRows.length > 0) {
          referredBy = refRows[0].PTC_REF_ID;
          referrerAddress = refRows[0].wallet_address || null;
        }
      }

      // Generate a unique referral ID for the new user
      const newRefId = 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase();

      // Save user directly with verified status (no third-party verification service)
      const [result] = await fastify.mysql.query(
        'INSERT INTO users (name, email, password, is_verified, verification_token, wallet_address, kyc_status, PTC_REF_ID, referred_by, referrer_address) VALUES (?, ?, ?, 1, NULL, NULL, "unverified", ?, ?, ?)',
        [displayName, normalizedEmail, hashedPassword, newRefId, referredBy, referrerAddress]
      );

      return reply.code(201).send({
        status: true,
        msg: 'Registration successful! You can now log in.',
        data: {
          user: {
            id: result.insertId,
            name: displayName,
            email: normalizedEmail,
            kyc_status: 'unverified',
            PTC_REF_ID: newRefId
          }
        }
      });

    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return reply.code(400).send({ status: false, msg: 'Email already registered. Please use another.' });
      }
      console.error('Signup error:', err);
      return reply.code(500).send({ status: false, msg: err.message || 'Internal Server Error' });
    }
  });

  // ========================================
  // User Login
  // ========================================
  fastify.post('/login', async (request, reply) => {
    try {
      const { email, password, twoFaCode } = request.body || {};

      if (!email || !password) {
        return reply.code(400).send({ status: false, msg: 'Email and password are required' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const [rows] = await fastify.mysql.query('SELECT * FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
      let user = rows[0];

      if (!user) {
        // Fallback: Check if it matches Admin credentials in settings
        const [settingsRows] = await fastify.mysql.query('SELECT admin_email, admin_password, admin_two_fa_secret, admin_two_fa_enabled FROM settings LIMIT 1');
        const settings = settingsRows[0];

        const adminPasswordOk = settings && settings.admin_password && normalizedEmail === settings.admin_email?.toLowerCase()
          ? await bcrypt.compare(password, settings.admin_password)
          : false;

        if (adminPasswordOk) {
          if (settings.admin_two_fa_enabled) {
            if (!twoFaCode) {
              return reply.send({ status: true, require2FA: true, msg: '2FA code required' });
            }
            const speakeasy = require('speakeasy');
            const verified = speakeasy.totp.verify({
              secret: settings.admin_two_fa_secret,
              encoding: 'base32',
              token: twoFaCode
            });
            if (!verified) return reply.send({ status: false, msg: 'Invalid 2FA code' });
          }

          const token = fastify.jwt.sign({ id: 0, email: settings.admin_email, name: 'ADMIN', isAdmin: true }, { expiresIn: '7d' });
          return reply.send({
            status: true,
            msg: 'Admin login successful',
            data: {
              token,
              user: { id: 0, name: 'ADMIN', email: settings.admin_email, isAdmin: true }
            }
          });
        }
        return reply.code(401).send({ status: false, msg: 'Invalid email or password' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return reply.code(401).send({ status: false, msg: 'Invalid email or password' });
      }

      // Check User 2FA
      if (user.two_fa_enabled) {
        if (!twoFaCode) {
          return reply.send({ status: true, require2FA: true, msg: '2FA code required' });
        }
        const speakeasy = require('speakeasy');
        const verified = speakeasy.totp.verify({
          secret: user.two_fa_secret,
          encoding: 'base32',
          token: twoFaCode.toString().trim(),
          window: 2
        });
        if (!verified) return reply.send({ status: false, msg: 'Invalid 2FA code' });
      }

      // Record successful user session in login_history
      try {
        const ip = getClientIp(request);
        const ua = request.headers['user-agent'] || '';
        const { os, browser } = parseUserAgent(ua);
        const country = getCountry(request, ip);
        await fastify.mysql.query(
          'INSERT INTO login_history (user_id, ip_address, country, os, browser, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, ip, country, os, browser, ua]
        );
      } catch (sessionErr) {
        console.error('[SessionHistory] Error logging session:', sessionErr.message);
      }

      const token = fastify.jwt.sign({ id: user.id, email: user.email, name: user.name }, { expiresIn: '7d' });

      return reply.send({
        status: true,
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            wallet_address: user.wallet_address,
            kyc_status: user.kyc_status || 'unverified'
          }
        }
      });

    } catch (err) {
      console.error('Login error:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // 2FA User Endpoints
  // ========================================

  // Only a bad token is a 401. Wrapping the whole handler in one catch that
  // answered 'Invalid or expired token' turned server-side faults (a missing
  // column, a broken require) into a silent no-op in the UI.
  const authOr401 = async (req, reply) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      reply.code(401).send({ status: false, msg: 'Unauthorized' });
      return null;
    }
    try {
      return await fastify.jwt.verify(token);
    } catch {
      reply.code(401).send({ status: false, msg: 'Invalid or expired token' });
      return null;
    }
  };

  const fail500 = (reply, err, what) => {
    fastify.log.error({ err: err?.message || err }, `2FA: ${what} failed`);
    return reply.code(500).send({ status: false, msg: `Could not ${what}. Please try again or contact support.` });
  };

  // ========================================
  // Sumsub KYC Endpoints
  // ========================================

  // 1. Generate Sumsub WebSDK access token
  fastify.get('/sumsub-token', async (request, reply) => {
    const auth = await authOr401(request, reply);
    if (!auth) return;

    try {
      const [rows] = await fastify.mysql.query('SELECT id, email, name, kyc_status FROM users WHERE id = ?', [auth.id]);
      if (!rows || rows.length === 0) {
        return reply.code(404).send({ status: false, msg: 'User not found' });
      }

      const user = rows[0];
      const externalUserId = user.id.toString();
      let currentKycStatus = user.kyc_status || 'unverified';

      // Check with Sumsub API if user is not yet marked verified in DB
      if (currentKycStatus !== 'verified') {
        const applicantRes = await sumsubService.getApplicantStatus(externalUserId);
        if (applicantRes.success && applicantRes.reviewStatus === 'completed' && applicantRes.reviewAnswer === 'GREEN') {
          currentKycStatus = 'verified';
          await fastify.mysql.query('UPDATE users SET kyc_status = "verified" WHERE id = ?', [user.id]);
        }
      }

      const tokenResult = await sumsubService.getAccessToken(externalUserId);

      return reply.send({
        status: true,
        token: tokenResult.token,
        userId: externalUserId,
        isDevFallback: Boolean(tokenResult.isDevFallback),
        kyc_status: currentKycStatus,
        msg: tokenResult.msg
      });
    } catch (err) {
      console.error('Error generating Sumsub token:', err);
      return reply.code(500).send({ status: false, msg: 'Failed to generate KYC verification token' });
    }
  });

  // 2. Check current user KYC status
  fastify.get('/kyc-status', async (request, reply) => {
    const auth = await authOr401(request, reply);
    if (!auth) return;

    try {
      const [rows] = await fastify.mysql.query('SELECT id, email, name, kyc_status FROM users WHERE id = ?', [auth.id]);
      if (!rows || rows.length === 0) {
        return reply.code(404).send({ status: false, msg: 'User not found' });
      }

      const user = rows[0];
      let kycStatus = user.kyc_status || 'unverified';

      // If pending/unverified, do an on-demand check with Sumsub API
      if (kycStatus !== 'verified') {
        const applicantRes = await sumsubService.getApplicantStatus(user.id.toString());
        if (applicantRes.success) {
          const status = applicantRes.reviewStatus;
          const answer = applicantRes.reviewAnswer;
          if (status === 'completed' && answer === 'GREEN') {
            kycStatus = 'verified';
            await fastify.mysql.query('UPDATE users SET kyc_status = "verified" WHERE id = ?', [user.id]);
          } else if (status === 'completed' && answer === 'RED') {
            kycStatus = 'rejected';
            await fastify.mysql.query('UPDATE users SET kyc_status = "rejected" WHERE id = ?', [user.id]);
          } else if (status === 'pending') {
            kycStatus = 'pending';
            await fastify.mysql.query('UPDATE users SET kyc_status = "pending" WHERE id = ?', [user.id]);
          }
        }
      }

      return reply.send({
        status: true,
        kyc_status: kycStatus
      });
    } catch (err) {
      console.error('Error checking KYC status:', err);
      return reply.code(500).send({ status: false, msg: 'Failed to retrieve KYC status' });
    }
  });

  // 3. Sumsub Webhook Handler (POST /api/user/webhooks/sumsub)
  fastify.post('/webhooks/sumsub', async (request, reply) => {
    try {
      const signature = request.headers['x-payload-digest'];
      const algorithm = request.headers['x-payload-digest-alg'] || 'HMAC_SHA256_HEX';
      const rawPayload = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

      // Verify webhook signature if secret key is set
      if (process.env.SUMSUB_SECRET_KEY && !process.env.SUMSUB_SECRET_KEY.includes('your_sumsub')) {
        const isValid = sumsubService.validateWebhook(rawPayload, signature, algorithm);
        if (!isValid) {
          console.warn('Sumsub webhook rejected: invalid signature');
          return reply.code(401).send({ status: false, msg: 'Invalid signature' });
        }
      }

      const payload = typeof request.body === 'object' ? request.body : JSON.parse(request.body || '{}');
      console.log('Received Sumsub webhook:', payload.type, payload.reviewStatus, payload.externalUserId);

      const externalUserId = payload.externalUserId;
      if (!externalUserId) {
        return reply.code(200).send({ status: 'ok', msg: 'No externalUserId in payload' });
      }

      // Handle retry prefixes/suffixes like "123_retry_456"
      const cleanUserId = externalUserId.toString().split('_')[0];
      const userIdNum = parseInt(cleanUserId, 10);
      if (isNaN(userIdNum)) {
        return reply.code(200).send({ status: 'ok', msg: 'Non-numeric user ID' });
      }

      const reviewAnswer = payload.reviewResult?.reviewAnswer;
      const reviewStatus = payload.reviewStatus;

      if (reviewStatus === 'completed' && reviewAnswer === 'GREEN') {
        await fastify.mysql.query('UPDATE users SET kyc_status = "verified" WHERE id = ?', [userIdNum]);
        console.log(`[Sumsub Webhook] User ${userIdNum} KYC set to VERIFIED`);
      } else if (reviewStatus === 'completed' && reviewAnswer === 'RED') {
        await fastify.mysql.query('UPDATE users SET kyc_status = "rejected" WHERE id = ?', [userIdNum]);
        console.log(`[Sumsub Webhook] User ${userIdNum} KYC set to REJECTED`);
      } else if (reviewStatus === 'pending' || payload.type === 'applicantPending') {
        await fastify.mysql.query('UPDATE users SET kyc_status = "pending" WHERE id = ?', [userIdNum]);
        console.log(`[Sumsub Webhook] User ${userIdNum} KYC set to PENDING`);
      }

      return reply.code(200).send({ status: 'ok' });
    } catch (err) {
      console.error('Sumsub webhook processing error:', err);
      return reply.code(500).send({ status: false, msg: 'Webhook processing failed' });
    }
  });

  // 4. Test / Simulator endpoint to mark KYC verified (for testing or instant verification)
  fastify.post('/test-verify-kyc', async (request, reply) => {
    try {
      const auth = await authOr401(request, reply);
      if (!auth) return;

      const userId = request.body?.userId || auth.id;
      await fastify.mysql.query('UPDATE users SET kyc_status = "verified" WHERE id = ?', [userId]);

      const [updated] = await fastify.mysql.query('SELECT id, email, name, kyc_status, wallet_address FROM users WHERE id = ?', [userId]);
      return reply.send({
        status: true,
        msg: 'KYC status verified successfully!',
        user: updated[0]
      });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: err.message });
    }
  });

  // 5. Confirm KYC completion from WebSDK client
  fastify.post('/confirm-kyc-success', async (request, reply) => {
    try {
      const auth = await authOr401(request, reply);
      if (!auth) return;

      await fastify.mysql.query('UPDATE users SET kyc_status = "verified" WHERE id = ?', [auth.id]);
      const [updated] = await fastify.mysql.query('SELECT id, email, name, kyc_status, wallet_address FROM users WHERE id = ?', [auth.id]);
      return reply.send({
        status: true,
        msg: 'KYC marked verified successfully!',
        user: updated[0]
      });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: err.message });
    }
  });


  // Turning 2FA off is as sensitive as logging in, so it re-checks the password
  // and a live authenticator code. Six digits is a small space to guess at, so
  // failures are counted per user and locked out for a spell. In-memory is
  // enough here: trustive-backend runs as a single pm2 fork.
  const DISABLE_MAX_ATTEMPTS = 5;
  const DISABLE_LOCKOUT_MS = 15 * 60 * 1000;
  const disable2faAttempts = new Map();

  const disableLockRemaining = (userId) => {
    const entry = disable2faAttempts.get(userId);
    if (!entry || entry.count < DISABLE_MAX_ATTEMPTS) return 0;
    const remaining = entry.lockedAt + DISABLE_LOCKOUT_MS - Date.now();
    if (remaining <= 0) {
      disable2faAttempts.delete(userId);
      return 0;
    }
    return remaining;
  };

  // Returns how many attempts are left before the lockout starts.
  const noteDisableFailure = (userId) => {
    const entry = disable2faAttempts.get(userId) || { count: 0, lockedAt: 0 };
    entry.count += 1;
    if (entry.count >= DISABLE_MAX_ATTEMPTS) entry.lockedAt = Date.now();
    disable2faAttempts.set(userId, entry);
    return Math.max(0, DISABLE_MAX_ATTEMPTS - entry.count);
  };

  fastify.post('/generate-2fa', async (req, reply) => {
    const decoded = await authOr401(req, reply);
    if (!decoded) return;
    try {
      const speakeasy = require('speakeasy');
      const qrcode = require('qrcode');

      // Re-keying an active account would hand 2FA to whoever holds the session
      // token, which is the very thing disable-2fa checks for. Make them turn it
      // off properly first.
      const [current] = await fastify.mysql.query("SELECT two_fa_enabled FROM users WHERE id = ?", [decoded.id]);
      if (current[0]?.two_fa_enabled) {
        return reply.send({ status: false, msg: '2FA is already enabled. Disable it first to set up a new device.' });
      }

      const secret = speakeasy.generateSecret({ name: `Trustive (${decoded.email})` });
      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

      await fastify.mysql.query("UPDATE users SET two_fa_secret = ? WHERE id = ?", [secret.base32, decoded.id]);

      return reply.send({ status: true, secret: secret.base32, qrCode: qrCodeUrl });
    } catch (err) {
      return fail500(reply, err, 'start 2FA setup');
    }
  });

  fastify.post('/verify-2fa', async (req, reply) => {
    const decoded = await authOr401(req, reply);
    if (!decoded) return;
    try {
      const { code } = req.body;
      if (!code) return reply.send({ status: false, msg: 'Verification code is required' });

      const [rows] = await fastify.mysql.query("SELECT two_fa_secret FROM users WHERE id = ?", [decoded.id]);
      const user = rows[0];

      if (!user || !user.two_fa_secret) return reply.send({ status: false, msg: '2FA not initialized. Please scan the QR code first.' });

      const speakeasy = require('speakeasy');
      const verified = speakeasy.totp.verify({
        secret: user.two_fa_secret,
        encoding: 'base32',
        token: code.toString().trim(),
        window: 2
      });

      if (verified) {
        await fastify.mysql.query("UPDATE users SET two_fa_enabled = 1 WHERE id = ?", [decoded.id]);
        return reply.send({ status: true, msg: '2FA enabled successfully' });
      } else {
        return reply.send({ status: false, msg: 'Invalid verification code. Please make sure your device clock is accurate.' });
      }
    } catch (err) {
      return fail500(reply, err, 'verify the 2FA code');
    }
  });

  fastify.post('/disable-2fa', async (req, reply) => {
    const decoded = await authOr401(req, reply);
    if (!decoded) return;
    try {
      const lockedFor = disableLockRemaining(decoded.id);
      if (lockedFor > 0) {
        return reply.code(429).send({
          status: false,
          msg: `Too many failed attempts. Try again in ${Math.ceil(lockedFor / 60000)} minute(s).`
        });
      }

      const { password, code } = req.body || {};
      if (!password || !code) {
        return reply.send({ status: false, msg: 'Your password and a current authenticator code are required to disable 2FA' });
      }

      const [rows] = await fastify.mysql.query(
        "SELECT password, two_fa_secret, two_fa_enabled FROM users WHERE id = ?", [decoded.id]
      );
      const user = rows[0];
      if (!user) return reply.code(401).send({ status: false, msg: 'Unauthorized' });
      if (!user.two_fa_enabled) return reply.send({ status: false, msg: '2FA is not enabled on this account' });

      const speakeasy = require('speakeasy');
      const passwordOk = user.password ? await bcrypt.compare(password, user.password) : false;
      const codeOk = !!user.two_fa_secret && speakeasy.totp.verify({
        secret: user.two_fa_secret,
        encoding: 'base32',
        token: code.toString().trim(),
        // Tighter than setup: the code must be current, not two steps stale
        window: 1
      });

      // Both are reported together so a wrong password cannot be told apart
      // from a wrong code.
      if (!passwordOk || !codeOk) {
        const left = noteDisableFailure(decoded.id);
        // Not a 401: the session is valid, it is the re-check that failed.
        return reply.send({
          status: false,
          msg: left > 0
            ? `Incorrect password or authenticator code. ${left} attempt(s) left.`
            : 'Too many failed attempts. Disabling 2FA is locked for 15 minutes.'
        });
      }

      disable2faAttempts.delete(decoded.id);
      await fastify.mysql.query("UPDATE users SET two_fa_enabled = 0, two_fa_secret = NULL WHERE id = ?", [decoded.id]);
      return reply.send({ status: true, msg: '2FA disabled successfully' });
    } catch (err) {
      return fail500(reply, err, 'disable 2FA');
    }
  });

  fastify.get('/2fa-status', async (req, reply) => {
    const decoded = await authOr401(req, reply);
    if (!decoded) return;
    try {
      const [rows] = await fastify.mysql.query("SELECT two_fa_enabled FROM users WHERE id = ?", [decoded.id]);
      return reply.send({ status: true, enabled: !!rows[0]?.two_fa_enabled });
    } catch (err) {
      return fail500(reply, err, 'read the 2FA status');
    }
  });

  // ========================================
  // Verify Email
  // ========================================
  fastify.get('/verify-email', {
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      }
    }
  }, async (request, reply) => {
    try {
      const { token } = request.query;
      const [rows] = await fastify.mysql.query('SELECT * FROM users WHERE verification_token = ?', [token]);
      if (!rows || rows.length === 0) {
        const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?verified=error`;
        return reply.redirect(errorUrl);
      }
      const user = rows[0];
      await fastify.mysql.query(
        'UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?',
        [user.id]
      );

      // Redirect to frontend login page
      const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?verified=true`;
      return reply.redirect(loginUrl);

    } catch (err) {
      console.error('Verification error:', err);
      const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?verified=error`;
      return reply.redirect(errorUrl);
    }
  });

  // ========================================
  // Forgot Password Request
  // ========================================
  fastify.post('/forgot-password', async (request, reply) => {
    try {
      const { email } = request.body;
      if (!email) {
        return reply.code(400).send({ status: false, msg: 'Email is required' });
      }

      const [users] = await fastify.mysql.query('SELECT * FROM users WHERE email = ?', [email]);
      if (!users || users.length === 0) {
        return reply.code(404).send({ status: false, msg: 'No account found with this email address' });
      }

      const user = users[0];
      const resetToken = crypto.randomBytes(32).toString('hex');
      // Token valid for 1 hour
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);

      await fastify.mysql.query(
        'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
        [resetToken, resetTokenExpires, user.id]
      );

      try {
        await sendPasswordResetEmail(user.email, resetToken);
      } catch (mailErr) {
        console.error('Failed to send reset email:', mailErr);
        return reply.code(500).send({ status: false, msg: 'Failed to send reset email. Please try again later.' });
      }

      return reply.send({
        status: true,
        msg: 'Password reset link has been sent to your email.'
      });

    } catch (err) {
      console.error('Forgot password error:', err);
      return reply.code(500).send({ status: false, msg: err.message || 'Internal server error' });
    }
  });

  // ========================================
  // Verify Reset Token
  // ========================================
  fastify.get('/verify-reset-token', async (request, reply) => {
    try {
      const { token } = request.query;
      if (!token) {
        return reply.code(400).send({ status: false, msg: 'Reset token is required' });
      }

      const [users] = await fastify.mysql.query(
        'SELECT id, email, reset_token_expires FROM users WHERE reset_token = ?',
        [token]
      );

      if (!users || users.length === 0) {
        return reply.code(400).send({ status: false, msg: 'Invalid or expired password reset link.' });
      }

      const user = users[0];
      if (new Date() > new Date(user.reset_token_expires)) {
        return reply.code(400).send({ status: false, msg: 'Password reset link has expired. Please request a new one.' });
      }

      return reply.send({ status: true, email: user.email });
    } catch (err) {
      console.error('Verify reset token error:', err);
      return reply.code(500).send({ status: false, msg: 'Internal server error' });
    }
  });

  // ========================================
  // Reset Password
  // ========================================
  fastify.post('/reset-password', async (request, reply) => {
    try {
      const { token, newPassword } = request.body;
      if (!token || !newPassword) {
        return reply.code(400).send({ status: false, msg: 'Reset token and new password are required' });
      }

      // Strong password validation: 8-15 chars, 1 uppercase letter, 1 number, 1 special character
      if (newPassword.length < 8 || newPassword.length > 15) {
        return reply.code(400).send({ status: false, msg: 'Password must be between 8 and 15 characters long' });
      }
      if (!/[A-Z]/.test(newPassword)) {
        return reply.code(400).send({ status: false, msg: 'Password must contain at least one uppercase letter (A-Z)' });
      }
      if (!/[0-9]/.test(newPassword)) {
        return reply.code(400).send({ status: false, msg: 'Password must contain at least one number (0-9)' });
      }
      if (!/[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/~`]/.test(newPassword)) {
        return reply.code(400).send({ status: false, msg: 'Password must contain at least one special character' });
      }

      const [users] = await fastify.mysql.query(
        'SELECT * FROM users WHERE reset_token = ?',
        [token]
      );

      if (!users || users.length === 0) {
        return reply.code(400).send({ status: false, msg: 'Invalid or expired password reset link.' });
      }

      const user = users[0];
      if (new Date() > new Date(user.reset_token_expires)) {
        return reply.code(400).send({ status: false, msg: 'Password reset link has expired. Please request a new one.' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await fastify.mysql.query(
        'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [hashedPassword, user.id]
      );

      return reply.send({
        status: true,
        msg: 'Password has been reset successfully. You can now log in with your new password.'
      });

    } catch (err) {
      console.error('Reset password error:', err);
      return reply.code(500).send({ status: false, msg: err.message || 'Internal server error' });
    }
  });

  // ========================================
  // Link Wallet to User Account
  // ========================================
  fastify.post('/link-wallet', async (request, reply) => {
    try {
      // Temporary authentication check until full JWT middleware is integrated for user routes
      const token = request.headers.authorization?.split(' ')[1];
      if (!token) return reply.code(401).send({ status: false, msg: 'Unauthorized' });

      const decoded = await fastify.jwt.verify(token);
      const userId = decoded.id;
      const { wallet_address } = request.body;

      if (!wallet_address) {
        return reply.code(400).send({ status: false, msg: 'Wallet address is required' });
      }

      // Check if wallet is already linked to someone else
      const [existingWallet] = await fastify.mysql.query(
        'SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?) AND id != ?',
        [wallet_address, userId]
      );

      if (existingWallet.length > 0) {
        // If the other account has a registered email/password, it is a real account
        const realAccount = existingWallet.find(u => u.email && u.email.trim() !== '');
        if (realAccount) {
          return reply.code(400).send({ status: false, msg: 'This wallet is already linked to another account' });
        }
        // If it was just an anonymous/sync placeholder row (email is null/empty), clean it up
        await fastify.mysql.query(
          'DELETE FROM users WHERE LOWER(wallet_address) = LOWER(?) AND (email IS NULL OR email = "") AND id != ?',
          [wallet_address, userId]
        );
      }

      // Check if current user already has a wallet
      const [currentUser] = await fastify.mysql.query('SELECT wallet_address FROM users WHERE id = ?', [userId]);
      if (currentUser && currentUser.length > 0 && currentUser[0].wallet_address && currentUser[0].wallet_address !== '') {
        if (currentUser[0].wallet_address.toLowerCase() !== wallet_address.toLowerCase()) {
          await fastify.mysql.query(
            'UPDATE users SET wallet_address = ? WHERE id = ?',
            [wallet_address, userId]
          );
          return reply.send({ status: true, msg: 'Wallet updated successfully' });
        }
        return reply.send({ status: true, msg: 'Wallet already linked' });
      }

      await fastify.mysql.query(
        'UPDATE users SET wallet_address = ? WHERE id = ?',
        [wallet_address, userId]
      );

      return reply.send({ status: true, msg: 'Wallet linked successfully' });

    } catch (err) {
      console.error('Link wallet error:', err);
      return reply.code(401).send({ status: false, msg: 'Invalid or expired token' });
    }
  });

  // ========================================
  // User Profile
  // ========================================
  fastify.get('/me', async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(' ')[1];
      if (!token) return reply.code(401).send({ status: false, msg: 'Unauthorized' });
      let decoded;
      try {
        decoded = await fastify.jwt.verify(token);
      } catch (jwtErr) {
        decoded = fastify.jwt.decode(token);
      }
      if (!decoded || !decoded.id) return reply.code(401).send({ status: false, msg: 'Invalid or expired token' });
      const [rows] = await fastify.mysql.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
      if (!rows || rows.length === 0) return reply.code(404).send({ status: false, msg: 'User not found' });
      const user = rows[0];
      if (user.kyc_status !== 'verified') {
        try {
          const applicantRes = await sumsubService.getApplicantStatus(user.id.toString());
          if (applicantRes.success && applicantRes.reviewStatus === 'completed' && applicantRes.reviewAnswer === 'GREEN') {
            user.kyc_status = 'verified';
            await fastify.mysql.query('UPDATE users SET kyc_status = "verified" WHERE id = ?', [user.id]);
          }
        } catch (syncErr) {
          // ignore external API sync failure
        }
      }
      delete user.password;
      delete user.verification_token;
      delete user.two_fa_secret;
      delete user.reset_token;
      delete user.reset_token_expires;
      return reply.send({ status: true, user });
    } catch (err) {
      console.error('Error in /me:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // User Session History (Recent Activity)
  // ========================================
  fastify.get('/session-history', async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(' ')[1];
      let userId = null;
      if (token) {
        try {
          const decoded = await fastify.jwt.verify(token);
          if (decoded && decoded.id) userId = decoded.id;
        } catch {
          try {
            const decoded = fastify.jwt.decode(token);
            if (decoded && decoded.id) userId = decoded.id;
          } catch { }
        }
      }

      if (!userId && request.query.userId) {
        userId = Number(request.query.userId);
      }

      if (!userId && request.query.address) {
        const [u] = await fastify.mysql.query(
          'SELECT id FROM users WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1',
          [request.query.address]
        );
        if (u && u.length > 0) userId = u[0].id;
      }

      if (!userId) {
        return reply.code(401).send({ status: false, msg: 'Unauthorized' });
      }

      const [rows] = await fastify.mysql.query(
        'SELECT id, ip_address, country, os, browser, created_at FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
        [userId]
      );

      const pad = (n) => String(n).padStart(2, '0');
      const formatTime = (d) => {
        if (!d) return '';
        const date = new Date(d);
        if (isNaN(date.getTime())) return String(d);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      };

      return reply.send({
        status: true,
        history: (rows || []).map(r => ({
          id: r.id,
          ip: r.ip_address || '127.0.0.1',
          country: r.country || '',
          os: r.os || 'Linux x86_64',
          browser: r.browser || 'Chrome',
          login_time: formatTime(r.created_at)
        }))
      });
    } catch (err) {
      console.error('Error in /session-history:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.post('/update-password', async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(' ')[1];
      if (!token) return reply.code(401).send({ status: false, msg: 'Unauthorized' });
      const decoded = await fastify.jwt.verify(token);
      const { currentPassword, newPassword } = request.body;
      if (!currentPassword || !newPassword) return reply.send({ status: false, msg: 'Current and new passwords are required' });

      const [rows] = await fastify.mysql.query('SELECT password FROM users WHERE id = ?', [decoded.id]);
      const user = rows[0];
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return reply.send({ status: false, msg: 'Current password is incorrect' });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await fastify.mysql.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, decoded.id]);
      return reply.send({ status: true, msg: 'Password updated successfully' });
    } catch (err) {
      return reply.code(401).send({ status: false, msg: 'Invalid or expired token' });
    }
  });

  fastify.post('/update-profile-pic', async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(' ')[1];
      if (!token) return reply.code(401).send({ status: false, msg: 'Unauthorized' });
      const decoded = await fastify.jwt.verify(token);
      const { profile_pic } = request.body;
      await fastify.mysql.query('UPDATE users SET profile_pic = ? WHERE id = ?', [profile_pic, decoded.id]);
      return reply.send({ status: true, msg: 'Profile picture updated successfully' });
    } catch (err) {
      return reply.code(401).send({ status: false, msg: 'Invalid or expired token' });
    }
  });

  fastify.post('/update-name', async (request, reply) => {
    try {
      const token = request.headers.authorization?.split(' ')[1];
      if (!token) return reply.code(401).send({ status: false, msg: 'Unauthorized' });
      const decoded = await fastify.jwt.verify(token);
      const { name } = request.body;

      if (!name || name.trim() === '') {
        return reply.code(400).send({ status: false, msg: 'Name is required' });
      }

      // Check if name is already taken by someone else
      const [existing] = await fastify.mysql.query(
        'SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id != ?',
        [name.trim(), decoded.id]
      );

      if (existing && existing.length > 0) {
        return reply.code(400).send({ status: false, msg: 'This username is already taken. Please choose another.' });
      }

      await fastify.mysql.query('UPDATE users SET name = ? WHERE id = ?', [name.trim(), decoded.id]);

      return reply.send({ status: true, msg: 'Name updated successfully', name: name.trim() });
    } catch (err) {
      console.error('Update name error:', err);
      return reply.code(401).send({ status: false, msg: 'Invalid or expired token' });
    }
  });

  // ========================================
  // Register New User
  // ========================================
  fastify.get('/RegisterNewUser', {
    schema: {
      querystring: {
        type: 'object',
        required: ['wallet_address'],
        properties: {
          wallet_address: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { wallet_address } = request.query;

      if (!wallet_address) {
        return reply.code(400).send({ status: false, msg: 'Wallet address is required' });
      }

      const [existingUsers] = await fastify.mysql.query(
        'SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?)',
        [wallet_address]
      );

      if (existingUsers.length > 0) {
        let user = existingUsers[0];

        const [previousPurchases] = await fastify.mysql.query(
          'SELECT COUNT(*) as purchase_count FROM ico_purchases WHERE address = ? AND status = ?',
          [wallet_address, 'success']
        );
        const hasPreviousPurchases = (previousPurchases[0]?.purchase_count || 0) > 0;

        return reply.code(200).send({ status: true, msg: 'User already saved', userData: user, hasPreviousPurchases });
      }

      // ================================
      // Register New User
      // ================================
      try {
        await fastify.mysql.query(
          'INSERT INTO users (wallet_address) VALUES (?)',
          [wallet_address]
        );
      } catch (insertError) {
        throw insertError;
      }

      return reply.code(200).send({
        status: true,
        msg: 'New user registered',
        userData: {
          wallet_address
        },
        hasPreviousPurchases: false
      });

    } catch (err) {
      console.error('Error in RegisterNewUser:', err);
      return reply.code(500).send({ status: false, msg: 'Something went wrong while registering user' });
    }
  });

  // ========================================
  // Create Signature for ICO Purchase
  // ========================================
  async function splitSign(hash, nonce) {
    var signature = ethers.Signature.from(hash);
    return [signature.v, signature.r, signature.s, nonce];
  }

  fastify.post('/createSign', {
    schema: {
      body: {
        type: 'object',
        required: ['index', 'address', 'caller', 'amount'],
        properties: {
          index: { type: "integer" },
          address: { type: "string" },
          caller: { type: "string" },
          amount: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    const { index, address, caller, amount } = req.body;
    try {
      const privateKey = process.env.SIGNER_PRIVATE_KEY || process.env.SIGN_KEY;
      if (!privateKey || !privateKey.trim()) {
        return reply.code(500).send({
          status: false,
          message: 'Server is missing SIGNER_PRIVATE_KEY. Please configure it in back-end/.env'
        });
      }
      let wallet = new ethers.Wallet(privateKey.trim());

      const checksumAddress = ethers.getAddress(address);
      const checksumCaller = ethers.getAddress(caller);

      const decimals = index === 0 ? 18 : 8;
      const amountWei = ethers.parseUnits(amount.toString(), decimals);
      const nonce = Math.floor(Date.now() / 1000);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const ICO_ADDRESS = process.env.ICO_CONTRACT_ADDRESS || '0xeFE1D53E66d344A22719189C8c15A3Bda8434DbC';

      // Validation: Enforce dynamic Trustive purchase limits from active sale
      try {
        const [activeSaleRows] = await fastify.mysql.query(`
          SELECT minimum_purchase, maximum_purchase 
          FROM token_sales 
          WHERE status = 'active' OR (UTC_TIMESTAMP() BETWEEN start_at AND end_at)
          ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, start_at DESC
          LIMIT 1
        `);
        const activeSale = activeSaleRows[0];

        if (activeSale) {
          const tokensWei = await withFailover(async (provider) => {
            const c = new ethers.Contract(ICO_ADDRESS, ['function getToken(uint256, uint256) view returns (uint256)'], provider);
            return await c.getToken(index, amountWei);
          });
          const tokens = parseFloat(ethers.formatUnits(tokensWei, 18));

          const minVal = parseFloat(activeSale.minimum_purchase || 0);
          const maxVal = parseFloat(activeSale.maximum_purchase || 0);
          const EPSILON = 0.01; // Allow small tolerance for EVM on-chain integer division/oracle rounding

          if (minVal > 0 && tokens < (minVal - EPSILON)) {
            return reply.code(400).send({ status: false, message: `Minimum purchase of ${minVal} Trustive tokens required` });
          }
          if (maxVal > 0 && tokens > (maxVal + EPSILON)) {
            return reply.code(400).send({ status: false, message: `Maximum purchase of ${maxVal} Trustive tokens allowed` });
          }
        }
      } catch (err) {
        console.warn('Backend limit-check warning:', err.message);
      }

      // EIP712 domain matching the contract: TRSIV_ICO
      const domain = {
        name: 'TRSIV_ICO',
        version: '1',
        chainId: parseInt(process.env.CHAIN_ID || '97', 10),
        verifyingContract: ICO_ADDRESS,
      };

      const types = {
        Purchase: [
          { name: 'assetType', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'caller', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };

      const value = {
        assetType: index,
        recipient: checksumAddress,
        caller: checksumCaller,
        amount: amountWei,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await wallet.signTypedData(domain, types, value);
      const splitSig = ethers.Signature.from(signature);

      return reply.code(200).send({
        status: true,
        signature,
        nonce,
        deadline,
        signTuple: {
          v: splitSig.v,
          r: splitSig.r,
          s: splitSig.s,
          nonce: nonce,
          deadline: deadline,
        }
      });
    } catch (error) {
      console.log('Signature generation error:', error);
      return reply.code(500).send({ status: false, message: "Unable to Generate Signature" });
    }
  });

  // ========================================
  // Save Purchase
  // ========================================
  fastify.post('/createPurchase', {
    schema: {
      body: {
        type: "object",
        required: ['address', 'CryptoValue', 'payment_type', 'transHash', 'USDvalue_of_crypto_purchased'],
        properties: {
          address: { type: "string" },
          CryptoValue: { type: "string" },
          payment_type: { type: "string" },
          trustive_tokens: { type: "string" },
          transHash: { type: "string", minLength: 64 },
          USDvalue_of_crypto_purchased: { type: "string" },
          sale_type: { type: "string" },
          referrer_bonus: { type: "string" },
          referrer_address: { type: "string" },
          status: { type: "string" }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const {
        address,
        CryptoValue,
        payment_type,
        trustive_tokens,
        USDvalue_of_crypto_purchased,
        transHash,
        sale_type = '',
        status = 'success'
      } = req.body;

      const tokenAmount = trustive_tokens || '0';

      // Check if transaction hash already exists
      const [existingTransaction] = await fastify.mysql.query(
        'SELECT * FROM ico_purchases WHERE trans_hash = ?',
        [transHash]
      );
      if (existingTransaction && existingTransaction.length > 0) {
        return reply.code(200).send({
          status: true,
          msg: `${tokenAmount} Trustive tokens purchased successfully!!! (Already recorded)`,
        });
      }


      // Auto-compute USD value from crypto amount
      let finalUsdValue = USDvalue_of_crypto_purchased || '0';
      try {
        const cryptoAmt = parseFloat(CryptoValue || '0');
        if (payment_type === 'BNB' && cryptoAmt > 0) {
          // Use Chainlink BNB/USD feed on BSC Testnet
          const _provider = await getProvider();
          const _feed = new ethers.Contract(
            '0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526',
            ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'],
            _provider
          );
          const [, _price] = await _feed.latestRoundData();
          const cryptoUsd = parseFloat(ethers.formatUnits(_price, 8));
          finalUsdValue = (cryptoAmt * cryptoUsd).toFixed(2);
        } else if ((payment_type === 'USDT' || payment_type === 'USDC') && cryptoAmt > 0) {
          // Stablecoins: USD value = crypto amount directly
          finalUsdValue = cryptoAmt.toFixed(2);
        }
      } catch (_e) {
        // fallback: keep whatever was passed
      }

      // Resolve sale_type if not provided
      let resolvedSaleType = sale_type;
      if (!resolvedSaleType || String(resolvedSaleType).trim() === '') {
        try {
          const [activeRows] = await fastify.mysql.query(`
            SELECT type, name FROM token_sales
            WHERE status = 'active' OR (UTC_TIMESTAMP() BETWEEN start_at AND end_at)
            ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, start_at DESC
            LIMIT 1
          `);
          if (activeRows && activeRows.length > 0) {
            resolvedSaleType = activeRows[0].type || activeRows[0].name || '';
          }
        } catch (e) {
          fastify.log && fastify.log.warn && fastify.log.warn('Failed to resolve active sale_type:', e.message || e);
        }
      }

      // Check for referral attribution
      let refBonus = 0;
      let refAddress = '';
      try {
        const [buyerRows] = await fastify.mysql.query(
          'SELECT referred_by, referrer_address FROM users WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1',
          [address]
        );
        if (buyerRows && buyerRows.length > 0 && buyerRows[0].referred_by) {
          const [settRows] = await fastify.mysql.query('SELECT referral_level1 FROM settings LIMIT 1');
          const refPct = settRows && settRows[0]?.referral_level1 != null ? parseFloat(settRows[0].referral_level1) : 5.0;
          refBonus = (parseFloat(tokenAmount || '0') * (refPct / 100));

          if (buyerRows[0].referrer_address) {
            refAddress = buyerRows[0].referrer_address;
          } else {
            const [uRef] = await fastify.mysql.query('SELECT wallet_address FROM users WHERE PTC_REF_ID = ? LIMIT 1', [buyerRows[0].referred_by]);
            if (uRef && uRef.length > 0 && uRef[0].wallet_address) {
              refAddress = uRef[0].wallet_address;
            }
          }
        }
      } catch (refErr) {
        console.error('Error calculating referral bonus for purchase:', refErr.message);
      }

      // Insert purchase record
      const [insertResult] = await fastify.mysql.query(
        `INSERT INTO ico_purchases
        (address, crypto_value, payment_type, ptc_tokens, trans_hash, usd_value_of_crypto, sale_type, status, referrer_bonus, referrer_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [address, CryptoValue, payment_type, tokenAmount, transHash, finalUsdValue, resolvedSaleType || '', status, refBonus, refAddress]
      );


      return reply.code(200).send({
        status: true,
        msg: `${tokenAmount} Trustive tokens purchased successfully!!!`,
      });
    } catch (err) {
      console.error('Error in /createPurchase:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // Get User Purchase History
  // ========================================
  fastify.get('/getPurchaseHistory', async (req, reply) => {
    try {
      const { address } = req.query;
      if (!address) {
        return reply.code(400).send({ status: false, msg: 'Address parameter is required' });
      }

      const [transactions] = await fastify.mysql.query('SELECT * FROM ico_purchases WHERE address = ?', [address]);
      return reply.send({ status: true, transactions });
    } catch (err) {
      console.error('Error in /getPurchaseHistory:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // Get User Purchase History
  // ========================================
  fastify.get('/getUserHistory', async (req, reply) => {
    try {
      const { address } = req.query;
      if (!address) {
        return reply.code(400).send({ status: false, msg: 'Address parameter is required' });
      }

      const [transactions] = await fastify.mysql.query(
        `SELECT ip.*, ts.name AS sale_name
         FROM ico_purchases ip
         LEFT JOIN token_sales ts ON (LOWER(ip.sale_type) = LOWER(ts.type) OR LOWER(ip.sale_type) = LOWER(ts.name))
         WHERE ip.address = ?
         ORDER BY ip.id DESC`,
        [address]
      );

      return reply.send({ status: true, transactions, stakings: [] });
    } catch (err) {
      console.error('Error in /getUserHistory:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // Get User Data
  // ========================================
  fastify.get('/getUserData', async (request, reply) => {
    const { address } = request.query;
    try {
      let [checkData] = await fastify.mysql.query('SELECT id, name, email, wallet_address, profile_pic, kyc_status, PTC_REF_ID, created_at FROM users WHERE wallet_address = ?', [address]);
      if (checkData && checkData.length > 0) {
        const [transactions] = await fastify.mysql.query('SELECT * FROM ico_purchases WHERE address = ?', [address]);
        const txNorm = Array.isArray(transactions) ? transactions.map((r) => ({ ...r, created_at_utc: toUtcISOString(r.created_at) })) : transactions;
        return reply.code(200).send({
          status: true,
          UserData: checkData,
          transactions: txNorm
        });
      } else {
        return reply.code(200).send({
          status: true,
          msg: "User not found. Please register first.",
          UserData: [],
          transactions: []
        });
      }
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // Get Referral Data
  // ========================================

  // ========================================
  // Get Transaction Details (User)
  // ========================================
  fastify.get('/getTransactionDetails', async (request, reply) => {
    const { address } = request.query;
    try {
      const [results] = await fastify.mysql.query(
        `SELECT ip.*, u.name as username 
         FROM ico_purchases ip
         LEFT JOIN users u ON LOWER(ip.address) = LOWER(u.wallet_address COLLATE utf8mb4_unicode_ci)
         WHERE ip.address = ? AND ip.status IN ('success', 'paid') 
         ORDER BY ip.created_at DESC`,
        [address]
      );
      const normalized = Array.isArray(results) ? results.map(r => ({ ...r, created_at_utc: toUtcISOString(r.created_at) })) : (results ? [{ ...results, created_at_utc: toUtcISOString(results.created_at) }] : []);
      return reply.send({ status: true, userData: normalized });
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // Get Active Sale (User-facing)
  // ========================================
  fastify.get('/getActiveSale', async (req, reply) => {
    try {
      await updateSaleStatuses(fastify.mysql);
      const [activeRows] = await fastify.mysql.query(`
        SELECT *,
        CASE
          WHEN UTC_TIMESTAMP() BETWEEN start_at AND end_at THEN 'active'
          WHEN UTC_TIMESTAMP() < start_at THEN 'scheduled'
          ELSE 'ended'
        END AS computed_status
        FROM token_sales
        WHERE (status = 'active' OR (UTC_TIMESTAMP() BETWEEN start_at AND end_at)) AND status != 'ended'
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, start_at DESC
        LIMIT 1;
      `);
      let sale = activeRows[0] || null;
      if (!sale) {
        const [upcomingRows] = await fastify.mysql.query(`
          SELECT *, 'scheduled' AS computed_status
          FROM token_sales 
          WHERE (status = 'scheduled' OR UTC_TIMESTAMP() < start_at) AND status != 'ended' 
          ORDER BY start_at ASC LIMIT 1;
        `);
        sale = upcomingRows[0] || null;
      }
      if (sale) {
        try {
          if (sale.computed_status === 'scheduled' || !sale.start_at || !sale.end_at) {
            sale.total_tokens_sold = 0;
            sale.available_tokens = Number(sale.token_quantity || 0);
          } else {
            const [soldRows] = await fastify.mysql.query(
              `SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(30,8))), 0) AS total_tokens_sold
               FROM ico_purchases 
               WHERE status IN ('success', 'paid') 
                 AND (created_at BETWEEN ? AND ?)`,
              [sale.start_at, sale.end_at]
            );
            const sold = parseFloat(soldRows[0]?.total_tokens_sold || 0);
            sale.total_tokens_sold = sold;
            sale.available_tokens = Math.max(0, Number(sale.token_quantity || 0) - sold);
          }
          sale.start_at_utc = toUtcISOString(sale.start_at);
          sale.end_at_utc = toUtcISOString(sale.end_at);
        } catch (e) {
          sale.total_tokens_sold = 0;
          sale.available_tokens = Number(sale.token_quantity || 0);
        }
      }
      return reply.send({ status: true, sale });
    } catch (err) {
      console.error('Error in /getActiveSale:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // Get Settings (Public)
  // ========================================
  fastify.get('/getSettings', async (req, reply) => {
    try {
      const [rows] = await fastify.mysql.query("SELECT site_name, token_name, token_symbol, chain, token_decimal, contract_address, ico_contract, usdt_address, usdc_address, site_logo, token_logo, vesting_contract, referral_contract, referral_level1, moonpay_enabled, moonpay_api_key, moonpay_environment FROM settings LIMIT 1");
      return reply.send({ status: true, data: rows[0] || {} });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // MoonPay Gateway Endpoints
  // ========================================

  // GET /moonpay/config - public MoonPay onramp configuration
  fastify.get('/moonpay/config', async (request, reply) => {
    try {
      const [rows] = await fastify.mysql.query(
        "SELECT moonpay_enabled, moonpay_api_key, moonpay_environment FROM settings LIMIT 1"
      );
      const s = rows[0] || {};
      const enabled = s.moonpay_enabled !== undefined ? Boolean(s.moonpay_enabled) : true;
      const apiKey = s.moonpay_api_key || process.env.MOONPAY_API_KEY || 'pk_test_123';
      const environment = s.moonpay_environment || process.env.MOONPAY_ENV || 'sandbox';

      return reply.send({
        status: true,
        data: {
          enabled,
          apiKey,
          environment,
          supportedCurrencies: [
            { code: 'bnb_bsc', name: 'BNB', network: 'BSC', symbol: 'BNB' },
            { code: 'usdt_bsc', name: 'USDT', network: 'BSC', symbol: 'USDT' }
          ]
        }
      });
    } catch (err) {
      console.error('Error fetching MoonPay config:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // POST /moonpay/generate-url - generate and sign MoonPay onramp URL
  fastify.post('/moonpay/generate-url', async (request, reply) => {
    try {
      const { walletAddress, currencyCode, baseCurrencyAmount, baseCurrencyCode, redirectURL } = request.body || {};

      if (!walletAddress) {
        return reply.code(400).send({ status: false, msg: 'Wallet address is required' });
      }

      // Fetch current MoonPay configuration from settings
      const [rows] = await fastify.mysql.query(
        "SELECT moonpay_enabled, moonpay_api_key, moonpay_secret_key, moonpay_environment FROM settings LIMIT 1"
      );
      const s = rows[0] || {};
      if (s.moonpay_enabled !== undefined && !Boolean(s.moonpay_enabled)) {
        return reply.code(400).send({ status: false, msg: 'MoonPay payment gateway is currently disabled' });
      }

      const apiKey = s.moonpay_api_key || process.env.MOONPAY_API_KEY || 'pk_test_123';
      const secretKey = s.moonpay_secret_key || process.env.MOONPAY_SECRET_KEY || null;
      const environment = s.moonpay_environment || process.env.MOONPAY_ENV || 'sandbox';

      // Standardize BSC currency code
      let targetCurrency = 'bnb_bsc';
      if (currencyCode) {
        const lower = currencyCode.toLowerCase();
        if (lower.includes('usdt')) targetCurrency = 'usdt_bsc';
        else if (lower.includes('usdc')) targetCurrency = 'usdc_bsc';
        else targetCurrency = 'bnb_bsc';
      }

      const baseUrl = environment === 'production'
        ? 'https://buy.moonpay.com'
        : 'https://buy-sandbox.moonpay.com';

      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('apiKey', apiKey);
      urlObj.searchParams.set('currencyCode', targetCurrency);
      urlObj.searchParams.set('walletAddress', walletAddress);
      urlObj.searchParams.set('baseCurrencyCode', (baseCurrencyCode || 'usd').toLowerCase());
      if (baseCurrencyAmount && parseFloat(baseCurrencyAmount) > 0) {
        urlObj.searchParams.set('baseCurrencyAmount', parseFloat(baseCurrencyAmount).toString());
      }
      urlObj.searchParams.set('colorCode', '#315EFB');
      if (redirectURL) {
        urlObj.searchParams.set('redirectURL', redirectURL);
      }

      // HMAC-SHA256 signature if secretKey is present
      if (secretKey && secretKey.trim()) {
        const queryString = urlObj.search;
        const signature = crypto
          .createHmac('sha256', secretKey.trim())
          .update(queryString)
          .digest('base64');
        urlObj.searchParams.set('signature', signature);
      }

      return reply.send({
        status: true,
        url: urlObj.toString(),
        apiKey,
        environment,
        currencyCode: targetCurrency
      });
    } catch (err) {
      console.error('Error generating MoonPay URL:', err);
      return reply.code(500).send({ status: false, msg: 'Failed to generate MoonPay URL: ' + err.message });
    }
  });

  // ========================================
  // Vesting - User Routes
  // ========================================

  // Per-period claim history. One row per vesting period covered by a claim tx,
  // so the user panel can show a tx hash next to every unlocked installment.
  await fastify.mysql.query(`CREATE TABLE IF NOT EXISTS vesting_claims (
    id INT AUTO_INCREMENT PRIMARY KEY,
    beneficiary VARCHAR(255) NOT NULL,
    vesting_index INT NOT NULL DEFAULT 0,
    period_index INT NOT NULL,
    amount VARCHAR(255) NOT NULL DEFAULT '0',
    tx_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_claim_period (beneficiary, vesting_index, period_index),
    INDEX idx_beneficiary (beneficiary)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`).catch(() => { });

  // Vesting uses the centralized RPC provider with failover
  async function getVestingProvider() {
    return getProvider();
  }

  let vestingAbiCache = null;
  function getVestingAbi() {
    if (!vestingAbiCache) {
      vestingAbiCache = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/vesting.json"), 'utf8'));
    }
    return vestingAbiCache;
  }

  const VESTING_ADDRESS = process.env.VESTING_CONTRACT_ADDRESS || '0xbd0a737599462974aD054c958Fce5bbfaaEDeFb8';
  async function getVestingContract() {
    return new ethers.Contract(VESTING_ADDRESS, getVestingAbi(), await getVestingProvider());
  }

  // The vesting page polls every 30s and the chain state only moves once per
  // period, so re-walking every index on each poll is wasted work.
  const vestingSyncedAt = new Map();
  const VESTING_SYNC_TTL_MS = 60000;

  // queryFilter over 20k blocks needs an archival node; the public RPCs answer
  // it with an error after ~900ms. Look the hashes up once per address and
  // remember the outcome (failure included) instead of paying that per index.
  const vestedHashCache = new Map();
  const VESTED_HASH_TTL_MS = 10 * 60 * 1000;
  async function getVestTxHashes(contract, userAddress) {
    const key = userAddress.toLowerCase();
    const cached = vestedHashCache.get(key);
    if (cached && Date.now() - cached.at < VESTED_HASH_TTL_MS) return cached.hashes;
    let hashes = [];
    try {
      const events = await contract.queryFilter(contract.filters.TokenVested(userAddress), -20000);
      hashes = (events || []).map(e => e.transactionHash);
    } catch (e) {
      // Non-archival RPC — no hashes to recover, don't ask again for a while
    }
    vestedHashCache.set(key, { at: Date.now(), hashes });
    return hashes;
  }

  // getVestingDetails is the one call both the sync and the response need, so
  // cache it briefly and let them share: a poll that arrives inside the window
  // costs no chain traffic, and the background sync stops competing with the
  // request it was kicked off by. A period is 2 minutes, so 20s is well inside
  // the resolution the numbers actually change at. Cleared on claim.
  const vestingDetailsCache = new Map();
  const VESTING_DETAILS_TTL_MS = 20000;
  // Beyond this the value is too old to hand out; wait for a fresh read instead
  const VESTING_DETAILS_MAX_STALE_MS = 5 * 60 * 1000;

  // Caches the in-flight promise, not just the result: on a cold poll the
  // background sync and the response ask for the same 15 schedules at the same
  // moment, and storing the promise makes the second caller wait on the first
  // call instead of issuing its own.
  function readVestingDetails(contract, userAddress, index) {
    const key = `${userAddress.toLowerCase()}:${index}`;
    const cached = vestingDetailsCache.get(key);

    if (cached && Date.now() - cached.at < VESTING_DETAILS_MAX_STALE_MS) {
      // Past the TTL the entry is still worth serving: refresh it behind the
      // response rather than making the poll wait on the RPC. Amounts move once
      // per 2-minute period, so a few seconds of lag is invisible, and a claim
      // clears the entry outright.
      if (Date.now() - cached.at >= VESTING_DETAILS_TTL_MS && !cached.refreshing) {
        cached.refreshing = true;
        contract.getVestingDetails(userAddress, index)
          .then(details => vestingDetailsCache.set(key, { at: Date.now(), promise: Promise.resolve(details) }))
          .catch(() => { cached.refreshing = false; });
      }
      return cached.promise;
    }

    const promise = contract.getVestingDetails(userAddress, index).catch(err => {
      vestingDetailsCache.delete(key); // never cache a failure
      throw err;
    });
    vestingDetailsCache.set(key, { at: Date.now(), promise });
    return promise;
  }

  // The contract counts released periods itself now, so the UI no longer has to
  // infer them from the claimed amount. Cached on the same keys as the details.
  function readPeriodInfo(contract, userAddress, index) {
    const key = `${userAddress.toLowerCase()}:${index}:periods`;
    const cached = vestingDetailsCache.get(key);

    if (cached && Date.now() - cached.at < VESTING_DETAILS_MAX_STALE_MS) {
      if (Date.now() - cached.at >= VESTING_DETAILS_TTL_MS && !cached.refreshing) {
        cached.refreshing = true;
        contract.getPeriodInfo(userAddress, index)
          .then(info => vestingDetailsCache.set(key, { at: Date.now(), promise: Promise.resolve(info) }))
          .catch(() => { cached.refreshing = false; });
      }
      return cached.promise;
    }

    const promise = contract.getPeriodInfo(userAddress, index).catch(err => {
      vestingDetailsCache.delete(key);
      throw err;
    });
    vestingDetailsCache.set(key, { at: Date.now(), promise });
    return promise;
  }

  function clearVestingDetailsCache(userAddress) {
    const prefix = `${userAddress.toLowerCase()}:`;
    for (const key of vestingDetailsCache.keys()) {
      if (key.startsWith(prefix)) vestingDetailsCache.delete(key);
    }
  }

  const isPlaceholderHash = (h) =>
    !h || h === 'ON-CHAIN-SYNC' || h === 'SYSTEM-SYNC' || h === 'ON-CHAIN' || h === 'SYNCED';

  async function syncVestingFromChain(userAddress) {
    try {
      const syncKey = userAddress.toLowerCase();
      const lastSync = vestingSyncedAt.get(syncKey);
      if (lastSync && Date.now() - lastSync < VESTING_SYNC_TTL_MS) return;

      const contract = await getVestingContract();

      const count = Number(await contract.getVestingCount(userAddress));
      if (count === 0) { vestingSyncedAt.set(syncKey, Date.now()); return; }

      const [existing] = await fastify.mysql.query(
        "SELECT vesting_index, status, tx_hash FROM vesting_schedules WHERE LOWER(beneficiary) = LOWER(?)",
        [userAddress]
      );
      const existingByIndex = new Map((existing || []).map(r => [r.vesting_index, r]));

      // One batched round trip instead of `count` sequential ones
      const allDetails = await Promise.all(
        Array.from({ length: count }, (_, i) => readVestingDetails(contract, userAddress, i))
      );

      for (let i = 0; i < count; i++) {
        const details = allDetails[i];
        const totalAmount = ethers.formatEther(details.totalAmount);
        const startAt = new Date(Number(details.startTimestamp) * 1000);
        const cliffMonths = Number(details.cliffMonths);
        const vestingMonths = Number(details.vestingMonths);
        const existingRec = existingByIndex.get(i);

        if (!existingRec) {
          // On-chain but not in our DB: record it, with the real tx hash if the
          // RPC can still serve the TokenVested event.
          const hashes = await getVestTxHashes(contract, userAddress);
          const bestHash = hashes.length > i ? hashes[i] : (hashes[hashes.length - 1] ?? null);

          await fastify.mysql.query(
            "INSERT IGNORE INTO vesting_schedules (beneficiary, total_amount, cliff_months, vesting_months, start_at, tx_hash, vesting_index, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')",
            [userAddress, totalAmount, cliffMonths, vestingMonths, startAt, bestHash, i]
          );
        } else if (existingRec.status === 'revoked' || existingRec.status === 'active') {
          // Restore a real hash only when the stored one is a placeholder
          if (isPlaceholderHash(existingRec.tx_hash)) {
            const hashes = await getVestTxHashes(contract, userAddress);
            const currentHash = hashes.length > i ? hashes[i] : (hashes[hashes.length - 1] ?? null);
            if (currentHash) {
              await fastify.mysql.query(
                "UPDATE vesting_schedules SET status = 'active', tx_hash = ? WHERE beneficiary = ? AND vesting_index = ?",
                [currentHash, userAddress, i]
              );
              continue;
            }
          }

          if (existingRec.status === 'revoked') {
            await fastify.mysql.query(
              "UPDATE vesting_schedules SET status = 'active' WHERE beneficiary = ? AND vesting_index = ?",
              [userAddress, i]
            );
          }
        }
      }

      vestingSyncedAt.set(syncKey, Date.now());
    } catch (err) {
      console.error("Vesting sync error for", userAddress, err.message);
    }
  }

  fastify.get('/vesting/:address', async (request, reply) => {
    try {
      const { address } = request.params;

      const listQuery = "SELECT * FROM vesting_schedules WHERE LOWER(beneficiary) = LOWER(?) AND status = 'active' ORDER BY start_at DESC, id DESC";
      let [rows] = await fastify.mysql.query(listQuery, [address]);

      if (!Array.isArray(rows) || rows.length === 0) {
        // Nothing stored yet — this is the one case worth waiting on the chain for
        await syncVestingFromChain(address).catch(() => { });
        [rows] = await fastify.mysql.query(listQuery, [address]);
      } else {
        // Already known: refresh in the background so the page isn't held up.
        // Amounts and claimable balances below are still read live from chain.
        syncVestingFromChain(address).catch(() => { });
      }

      const vestings = Array.isArray(rows) ? rows : [];
      if (vestings.length === 0) return reply.send({ status: true, vestings: [] });

      // Per-period claim receipts, grouped by vesting index
      const [claimRows] = await fastify.mysql.query(
        "SELECT vesting_index, period_index, amount, tx_hash, created_at FROM vesting_claims WHERE LOWER(beneficiary) = LOWER(?) ORDER BY period_index ASC",
        [address]
      ).catch(() => [[]]);
      const claimsByIndex = new Map();
      for (const c of (claimRows || [])) {
        const list = claimsByIndex.get(c.vesting_index) || [];
        list.push({
          period_index: c.period_index,
          amount: c.amount,
          tx_hash: c.tx_hash,
          created_at: toUtcISOString(c.created_at)
        });
        claimsByIndex.set(c.vesting_index, list);
      }

      const vestingContract = await getVestingContract();

      const formatted = await Promise.all(vestings.map(async (v) => {
        const index = v.vesting_index !== null ? v.vesting_index : 0;
        let onChainDetails = null;
        try {
          const [details, periodInfo] = await Promise.all([
            readVestingDetails(vestingContract, v.beneficiary, index),
            readPeriodInfo(vestingContract, v.beneficiary, index).catch(() => null)
          ]);
          onChainDetails = {
            totalAmount: ethers.formatEther(details.totalAmount),
            claimedAmount: ethers.formatEther(details.claimedAmount),
            remainingToClaim: ethers.formatEther(details.remainingToClaim),
            claimableNow: ethers.formatEther(details.claimableNow),
            cliffRemaining: details.cliffRemaining.toString(),
            vestingRemaining: details.vestingRemaining.toString(),
            cliffMonths: details.cliffMonths.toString(),
            vestingMonths: details.vestingMonths.toString(),
            startTimestamp: details.startTimestamp.toString(),
            monthsElapsed: details.monthsElapsed.toString(),
            claimedPeriods: periodInfo ? periodInfo.claimedPeriods.toString() : null,
            unlockedPeriods: periodInfo ? periodInfo.unlockedPeriods.toString() : null,
            claimablePeriods: periodInfo ? periodInfo.claimablePeriods.toString() : null
          };
        } catch (e) {
          // Fallback to DB info if chain call fails
          onChainDetails = {
            totalAmount: v.total_amount,
            claimedAmount: '0',
            remainingToClaim: v.total_amount,
            claimableNow: '0',
            cliffRemaining: v.cliff_months.toString(),
            vestingRemaining: v.vesting_months.toString(),
            cliffMonths: v.cliff_months.toString(),
            vestingMonths: v.vesting_months.toString(),
            startTimestamp: Math.floor(new Date(v.start_at).getTime() / 1000).toString(),
            monthsElapsed: '0',
            claimedPeriods: null,
            unlockedPeriods: null,
            claimablePeriods: null
          };
        }

        let displayStatus = 'successful';
        if (onChainDetails) {
          const claimable = parseFloat(onChainDetails.claimableNow);
          const claimed = parseFloat(onChainDetails.claimedAmount);
          const total = parseFloat(onChainDetails.totalAmount);
          const cliffRem = parseInt(onChainDetails.cliffRemaining);

          if (claimed >= total && total > 0) displayStatus = 'claimed';
          else if (claimable > 0) displayStatus = 'claimable';
          else if (cliffRem > 0) displayStatus = 'cliff';
          else if (total > 0) displayStatus = 'locked';
        }

        return {
          ...v,
          index,
          details: onChainDetails,
          claims: claimsByIndex.get(index) || [],
          start_at: toUtcISOString(v.start_at),
          created_at: toUtcISOString(v.created_at),
          display_status: v.is_pending ? 'pending' : (v.status === 'revoked' ? 'revoked' : displayStatus)
        };
      }));

      return reply.send({ status: true, vestings: formatted });
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.get('/vesting/details/:address/:index', async (request, reply) => {
    try {
      const { address, index } = request.params;
      const vestingContract = await getVestingContract();
      const details = await vestingContract.getVestingDetails(address, index);
      if (details.totalAmount === 0n) return reply.code(404).send({ status: false, msg: 'Vesting schedule not found on blockchain' });
      return reply.send({
        status: true, details: {
          totalAmount: ethers.formatEther(details.totalAmount),
          claimedAmount: ethers.formatEther(details.claimedAmount),
          remainingToClaim: ethers.formatEther(details.remainingToClaim),
          claimableNow: ethers.formatEther(details.claimableNow),
          cliffMonths: details.cliffMonths.toString(), cliffRemaining: details.cliffRemaining.toString(),
          vestingMonths: details.vestingMonths.toString(), vestingRemaining: details.vestingRemaining.toString(),
          startTimestamp: details.startTimestamp.toString(), monthsElapsed: details.monthsElapsed.toString()
        }
      });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // Record a vesting claim tx and map it to the periods it released.
  // The contract releases every unlocked period in one claim(), so this stores
  // one row per newly released period, all sharing the same tx hash.
  fastify.post('/vesting/claim', async (request, reply) => {
    try {
      const { beneficiary, vesting_index, tx_hash, amount } = request.body || {};
      if (!beneficiary || tx_hash === undefined || tx_hash === null || tx_hash === '') {
        return reply.send({ status: false, msg: 'Missing required fields' });
      }
      const index = Number(vesting_index) || 0;

      const [dupe] = await fastify.mysql.query(
        "SELECT id FROM vesting_claims WHERE tx_hash = ? LIMIT 1", [tx_hash]
      );
      if (dupe && dupe.length > 0) return reply.send({ status: true, msg: 'Claim already recorded' });

      // How many periods are paid out in total after this tx, straight from chain
      let claimedPeriods = 0;
      let perPeriod = 0;
      try {
        const vestingContract = await getVestingContract();
        clearVestingDetailsCache(beneficiary);
        const [details, periodInfo] = await Promise.all([
          vestingContract.getVestingDetails(beneficiary, index),
          vestingContract.getPeriodInfo(beneficiary, index)
        ]);
        const total = parseFloat(ethers.formatEther(details.totalAmount));
        const periods = Number(details.vestingMonths) || 1;
        perPeriod = total / periods;
        claimedPeriods = Number(periodInfo.claimedPeriods);
      } catch (e) {
        console.error('Vesting claim chain read failed:', e.message);
      }

      const [maxRows] = await fastify.mysql.query(
        "SELECT COALESCE(MAX(period_index), 0) AS last_period FROM vesting_claims WHERE LOWER(beneficiary) = LOWER(?) AND vesting_index = ?",
        [beneficiary, index]
      );
      const from = Number(maxRows?.[0]?.last_period || 0) + 1;

      // Chain read failed or nothing new resolved: still keep a receipt for the next period
      const to = claimedPeriods >= from ? claimedPeriods : from;
      const rowAmount = perPeriod > 0 ? perPeriod.toString() : String(amount ?? '0');

      const values = [];
      for (let period = from; period <= to; period++) {
        values.push([beneficiary, index, period, rowAmount, tx_hash]);
      }
      if (values.length > 0) {
        await fastify.mysql.query(
          "INSERT IGNORE INTO vesting_claims (beneficiary, vesting_index, period_index, amount, tx_hash) VALUES ?",
          [values]
        );
      }

      return reply.send({ status: true, msg: 'Claim recorded', periods: values.length });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return reply.send({ status: true, msg: 'Claim already recorded' });
      console.error('Vesting claim record error:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });


  // ========================================
  // Referral Program Endpoints
  // ========================================

  // GET /referral/stats - returns code, link, bonus percentage, stats, friends list, claimable balance, claims history
  fastify.get('/referral/stats', async (req, reply) => {
    try {
      let user = null;
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const decoded = await fastify.jwt.verify(token);
          if (decoded && decoded.id) {
            const [u] = await fastify.mysql.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
            if (u && u.length > 0) user = u[0];
          }
        } catch { }
      }
      if (!user && req.query.address) {
        const [u] = await fastify.mysql.query('SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?)', [req.query.address]);
        if (u && u.length > 0) user = u[0];
      }
      if (!user && req.query.userId) {
        const [u] = await fastify.mysql.query('SELECT * FROM users WHERE id = ?', [req.query.userId]);
        if (u && u.length > 0) user = u[0];
      }

      // If user exists and doesn't have PTC_REF_ID yet, assign one
      if (user && !user.PTC_REF_ID) {
        const newRefId = 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await fastify.mysql.query('UPDATE users SET PTC_REF_ID = ? WHERE id = ?', [newRefId, user.id]);
        user.PTC_REF_ID = newRefId;
      }

      const [settRows] = await fastify.mysql.query(
        'SELECT referral_level1, referral_contract, contract_address, token_symbol FROM settings LIMIT 1'
      );
      const sett = settRows[0] || {};
      const commissionRate = sett.referral_level1 != null ? parseFloat(sett.referral_level1) : 5.0;
      const referralContract = sett.referral_contract || process.env.REFERRAL_CONTRACT_ADDRESS || '0x66ae3C6846C0a340936B127BBBec4f3FC2C08935';
      const tokenSymbol = sett.token_symbol || 'TRSIV';

      const userWallet = user?.wallet_address || (req.query.address ? String(req.query.address).toLowerCase() : '');
      const userRefId = user?.PTC_REF_ID || '';

      // Referred users list
      let referredUsers = [];
      if (userRefId) {
        const [rRows] = await fastify.mysql.query(`
          SELECT u.id, u.name, u.email, u.wallet_address, u.created_at,
                 COALESCE(SUM(CAST(ip.ptc_tokens AS DECIMAL(36,18))), 0) AS total_purchased,
                 COALESCE(SUM(CAST(ip.referrer_bonus AS DECIMAL(36,18))), 0) AS bonus_generated
          FROM users u
          LEFT JOIN ico_purchases ip ON (
            LOWER(ip.address) = LOWER(u.wallet_address) AND ip.status = 'success'
          )
          WHERE u.referred_by = ?
          GROUP BY u.id
          ORDER BY u.created_at DESC
        `, [userRefId]);
        referredUsers = (rRows || []).map(r => ({
          ...r,
          total_purchased: parseFloat(r.total_purchased).toFixed(2),
          bonus_generated: parseFloat(r.bonus_generated).toFixed(4)
        }));
      }

      // Total earned bonus tokens: sum from ico_purchases
      let totalEarned = 0;
      const [earnedRows] = await fastify.mysql.query(`
        SELECT COALESCE(SUM(CAST(ip.referrer_bonus AS DECIMAL(36,18))), 0) AS total_earned
        FROM ico_purchases ip
        WHERE (
          (? != '' AND LOWER(ip.referrer_address) = LOWER(?))
          OR (? != '' AND ip.address IN (SELECT wallet_address FROM users WHERE referred_by = ? AND wallet_address IS NOT NULL))
        ) AND ip.status = 'success'
      `, [userWallet, userWallet, userRefId, userRefId]);
      totalEarned = parseFloat(earnedRows[0]?.total_earned || 0);

      // Total claimed bonus tokens: sum from referral_claims
      let totalClaimed = 0;
      const [claimedRows] = await fastify.mysql.query(`
        SELECT COALESCE(SUM(CAST(amount AS DECIMAL(36,18))), 0) AS total_claimed
        FROM referral_claims
        WHERE (
          (? > 0 AND user_id = ?)
          OR (? != '' AND LOWER(wallet_address) = LOWER(?))
        ) AND status = 'success'
      `, [user?.id || 0, user?.id || 0, userWallet, userWallet]);
      totalClaimed = parseFloat(claimedRows[0]?.total_claimed || 0);

      const claimableBalance = Math.max(0, totalEarned - totalClaimed);

      // Past claims
      const [claimList] = await fastify.mysql.query(`
        SELECT id, amount, nonce, tx_hash, status, created_at
        FROM referral_claims
        WHERE (
          (? > 0 AND user_id = ?)
          OR (? != '' AND LOWER(wallet_address) = LOWER(?))
        ) AND status = 'success'
        ORDER BY created_at DESC
      `, [user?.id || 0, user?.id || 0, userWallet, userWallet]);

      const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
      const referralLink = userRefId ? `${frontendBase}/register?ref=${userRefId}` : '';

      return reply.send({
        status: true,
        data: {
          referral_code: userRefId || null,
          referral_link: referralLink,
          commission_rate: commissionRate,
          total_referred_users: referredUsers.length,
          total_earned: totalEarned.toFixed(4),
          total_claimed: totalClaimed.toFixed(4),
          claimable_balance: claimableBalance.toFixed(4),
          token_symbol: tokenSymbol,
          referral_contract: referralContract,
          wallet_address: userWallet || null,
          referred_users: referredUsers,
          claims_history: claimList || []
        }
      });
    } catch (err) {
      console.error('Error in /referral/stats:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // POST /referral/create-claim-sign - generates signed ECDSA claim payload for ReferralClaim contract
  fastify.post('/referral/create-claim-sign', async (req, reply) => {
    try {
      const { caller, to } = req.body || {};

      if (!caller || !ethers.isAddress(caller)) {
        return reply.code(400).send({ status: false, msg: 'Valid caller address is required' });
      }
      const targetTo = (to && ethers.isAddress(to)) ? to : caller;

      // Identify user either by token or by caller address
      let user = null;
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const decoded = await fastify.jwt.verify(token);
          if (decoded && decoded.id) {
            const [u] = await fastify.mysql.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
            if (u && u.length > 0) user = u[0];
          }
        } catch { }
      }
      if (!user) {
        const [u] = await fastify.mysql.query('SELECT * FROM users WHERE LOWER(wallet_address) = LOWER(?)', [caller]);
        if (u && u.length > 0) user = u[0];
      }

      const userWallet = user?.wallet_address || caller.toLowerCase();
      const userRefId = user?.PTC_REF_ID || '';

      // Compute total earned
      const [earnedRows] = await fastify.mysql.query(`
        SELECT COALESCE(SUM(CAST(ip.referrer_bonus AS DECIMAL(36,18))), 0) AS total_earned
        FROM ico_purchases ip
        WHERE (
          (? != '' AND LOWER(ip.referrer_address) = LOWER(?))
          OR (? != '' AND ip.address IN (SELECT wallet_address FROM users WHERE referred_by = ? AND wallet_address IS NOT NULL))
        ) AND ip.status = 'success'
      `, [userWallet, userWallet, userRefId, userRefId]);
      const totalEarned = parseFloat(earnedRows[0]?.total_earned || 0);

      // Compute total claimed
      const [claimedRows] = await fastify.mysql.query(`
        SELECT COALESCE(SUM(CAST(amount AS DECIMAL(36,18))), 0) AS total_claimed
        FROM referral_claims
        WHERE (
          (? > 0 AND user_id = ?)
          OR (? != '' AND LOWER(wallet_address) = LOWER(?))
        ) AND status = 'success'
      `, [user?.id || 0, user?.id || 0, userWallet, userWallet]);
      const totalClaimed = parseFloat(claimedRows[0]?.total_claimed || 0);

      const claimable = Math.max(0, totalEarned - totalClaimed);
      if (claimable <= 0.000001) {
        return reply.code(400).send({ status: false, msg: 'No claimable referral rewards available at this time.' });
      }

      // Read contract addresses
      const [settRows] = await fastify.mysql.query(
        'SELECT referral_contract, contract_address FROM settings LIMIT 1'
      );
      const sett = settRows[0] || {};
      const referralContract = sett.referral_contract || process.env.REFERRAL_CONTRACT_ADDRESS || '0x66ae3C6846C0a340936B127BBBec4f3FC2C08935';
      const tokenAddress = sett.contract_address || process.env.TRUSTIVE_TOKEN_ADDRESS || '0xe12F60d7c0bc493b033c789Aa533E772541041eA';

      const amountWei = ethers.parseEther(claimable.toFixed(6));

      // Verify server has SIGNER_PRIVATE_KEY
      const signerKey = process.env.SIGNER_PRIVATE_KEY;
      if (!signerKey || signerKey.trim() === '') {
        return reply.code(500).send({
          status: false,
          msg: 'Server is missing SIGNER_PRIVATE_KEY. Please configure the authorized signer key in the backend environment.'
        });
      }

      // Check on-chain referral contract balance
      try {
        const provider = await getProvider();
        const tokenContract = new ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
        const contractBalance = await tokenContract.balanceOf(referralContract);
        if (contractBalance < amountWei) {
          const availFormatted = ethers.formatEther(contractBalance);
          return reply.code(400).send({
            status: false,
            msg: `Referral contract reward pool has insufficient balance (Available: ${parseFloat(availFormatted).toFixed(2)} TRSIV, Requested: ${claimable.toFixed(2)} TRSIV). Please notify the administrator to fund the referral contract.`
          });
        }
      } catch (rpcErr) {
        console.warn('Could not verify referral contract token balance:', rpcErr.message);
      }

      // Generate unique nonce
      const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

      // Hash: keccak256(abi.encodePacked(address(this), block.chainid, caller, to, amount, nonce))
      // On BSC Testnet, chainid = 97
      const claimHash = ethers.solidityPackedKeccak256(
        ['address', 'uint256', 'address', 'address', 'uint256', 'uint256'],
        [referralContract, 97n, caller, targetTo, amountWei, nonce]
      );

      const signerWallet = new ethers.Wallet(signerKey);
      const signatureBytes = await signerWallet.signMessage(ethers.getBytes(claimHash));
      const sig = ethers.Signature.from(signatureBytes);

      return reply.send({
        status: true,
        data: {
          referralContract,
          amount: amountWei.toString(),
          displayAmount: claimable.toFixed(6),
          caller,
          to: targetTo,
          nonce: nonce.toString(),
          signature: {
            v: sig.v,
            r: sig.r,
            s: sig.s,
            nonce: nonce.toString()
          }
        }
      });
    } catch (err) {
      console.error('Error in /referral/create-claim-sign:', err);
      return reply.code(500).send({ status: false, msg: err.message || 'Internal Server Error' });
    }
  });

  // POST /referral/record-claim - records confirmed on-chain claim transaction
  fastify.post('/referral/record-claim', async (req, reply) => {
    try {
      const { txHash, amount, nonce, walletAddress } = req.body || {};
      if (!txHash) {
        return reply.code(400).send({ status: false, msg: 'Transaction hash is required' });
      }
      if (!amount || isNaN(parseFloat(amount))) {
        return reply.code(400).send({ status: false, msg: 'Valid amount is required' });
      }

      // Find user if available
      let userId = null;
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const decoded = await fastify.jwt.verify(token);
          if (decoded && decoded.id) userId = decoded.id;
        } catch { }
      }
      if (!userId && walletAddress) {
        const [u] = await fastify.mysql.query('SELECT id FROM users WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1', [walletAddress]);
        if (u && u.length > 0) userId = u[0].id;
      }

      await fastify.mysql.query(
        'INSERT INTO referral_claims (user_id, wallet_address, amount, nonce, tx_hash, status) VALUES (?, ?, ?, ?, ?, "success")',
        [userId, walletAddress || '', parseFloat(amount), nonce || Date.now(), txHash]
      );

      return reply.send({ status: true, msg: 'Referral claim recorded successfully' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return reply.send({ status: true, msg: 'Claim already recorded' });
      }
      console.error('Error in /referral/record-claim:', err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });
};
