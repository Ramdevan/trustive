const ethers = require('ethers');
const BN = require('bignumber.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../Utils/Mail');

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


  // ========================================
  // User Signup
  // ========================================
  fastify.post('/signup', async (request, reply) => {
    try {
      const { name, email, password } = request.body;

      if (!name || !name.trim()) {
        return reply.code(400).send({ status: false, msg: 'Username is required' });
      }

      if (!email || !password) {
        return reply.code(400).send({ status: false, msg: 'Email and password are required' });
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

      // Check if email already exists
      const [existing] = await fastify.mysql.query('SELECT * FROM users WHERE email = ?', [email]);
      if (existing && existing.length > 0) {
        return reply.code(400).send({ status: false, msg: 'Email already registered' });
      }

      const displayName = name && name.trim() ? name.trim() : email.split('@')[0];
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationToken = crypto.randomBytes(32).toString('hex');

      const [result] = await fastify.mysql.query(
        'INSERT INTO users (name, email, password, is_verified, verification_token, wallet_address) VALUES (?, ?, ?, 0, ?, ?)',
        [displayName, email, hashedPassword, verificationToken, null] // wallet_address null initially, is_verified 0 until email verified
      );

      // Send verification email
      try {
        await sendVerificationEmail(email, verificationToken);
      } catch (emailErr) {
        console.error('Email sending failed:', emailErr);
      }

      return reply.code(201).send({
        status: true,
        msg: 'Signup successful! Please check your email to verify your account before logging in.',
        requireVerification: true
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
      const { email, password, twoFaCode } = request.body;

      if (!email || !password) {
        return reply.code(400).send({ status: false, msg: 'Email and password are required' });
      }

      const [rows] = await fastify.mysql.query('SELECT * FROM users WHERE email = ?', [email]);
      let user = rows[0];

      if (!user) {
        // Fallback: Check if it matches Admin credentials in settings
        const [settingsRows] = await fastify.mysql.query('SELECT admin_email, admin_password, admin_two_fa_secret, admin_two_fa_enabled FROM settings LIMIT 1');
        const settings = settingsRows[0];

        // admin_password is a bcrypt hash now (AdminController hashes the old
        // plaintext value on boot), so this has to compare the same way.
        const adminPasswordOk = settings && settings.admin_password && email === settings.admin_email
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

      // Check if email is verified
      if (!user.is_verified) {
        return reply.code(403).send({ status: false, msg: 'Please verify your email before logging in. Check your inbox for the verification link.' });
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

      const token = fastify.jwt.sign({ id: user.id, email: user.email, name: user.name }, { expiresIn: '7d' });

      return reply.send({
        status: true,
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            wallet_address: user.wallet_address
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
        const errorUrl = `${process.env.FRONTEND_URL || 'http://ppm.meme'}/login?verified=error`;
        return reply.redirect(errorUrl);
      }
      const user = rows[0];
      await fastify.mysql.query(
        'UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?',
        [user.id]
      );

      // Redirect to frontend login page
      const loginUrl = `${process.env.FRONTEND_URL || 'http://ppm.meme'}/login?verified=true`;
      return reply.redirect(loginUrl);

    } catch (err) {
      console.error('Verification error:', err);
      const errorUrl = `${process.env.FRONTEND_URL || 'http://ppm.meme'}/login?verified=error`;
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
      delete user.password;
      delete user.verification_token;
      return reply.send({ status: true, user });
    } catch (err) {
      console.error('Error in /me:', err);
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
      let wallet = new ethers.Wallet(process.env.SIGN_KEY);

      const checksumAddress = ethers.getAddress(address);
      const checksumCaller = ethers.getAddress(caller);

      const decimals = index === 0 ? 18 : 8;
      const amountWei = ethers.parseUnits(amount.toString(), decimals);
      const nonce = Math.floor(Date.now() / 1000);

      const ICO_ADDRESS = process.env.ICO_CONTRACT_ADDRESS || '0x8Ab0caB366B23Dcb88ceA447312CCb103B138cFa';

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
          const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');
          const icoContract = new ethers.Contract(ICO_ADDRESS, ['function getToken(uint256, uint256) view returns (uint256)'], provider);
          const tokensWei = await icoContract.getToken(index, amountWei);
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

      // EIP712 domain matching the contract constructor: EIP712("PPMICO", "1")
      const domain = {
        name: 'PPMICO',
        version: '1',
        chainId: 11155111,
        verifyingContract: ICO_ADDRESS,
      };

      const types = {
        Buy: [
          { name: 'assetType', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'caller', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      };

      const value = {
        assetType: index,
        recipient: checksumAddress,
        caller: checksumCaller,
        amount: amountWei,
        nonce: nonce,
      };

      const signature = await wallet.signTypedData(domain, types, value);

      return reply.code(200).send({ status: true, signature, nonce });
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
        required: ['address', 'CryptoValue', 'payment_type', 'PPM_tokens', 'transHash', 'USDvalue_of_crypto_purchased'],
        properties: {
          address: { type: "string" },
          CryptoValue: { type: "string" },
          payment_type: { type: "string" },
          PPM_tokens: { type: "string" },
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
        PPM_tokens,
        USDvalue_of_crypto_purchased,
        transHash,
        sale_type = '',
        status = 'success'
      } = req.body;

      // Check if transaction hash already exists
      const [existingTransaction] = await fastify.mysql.query(
        'SELECT * FROM ico_purchases WHERE trans_hash = ?',
        [transHash]
      );
      if (existingTransaction && existingTransaction.length > 0) {
        return reply.code(200).send({
          status: true,
          msg: `${PPM_tokens} Trustive tokens purchased successfully!!! (Already recorded)`,
        });
      }


      // Auto-compute USD value from crypto amount
      let finalUsdValue = USDvalue_of_crypto_purchased || '0';
      try {
        const cryptoAmt = parseFloat(CryptoValue || '0');
        if (payment_type === 'ETH' && cryptoAmt > 0) {
          // Use Chainlink ETH/USD feed on Sepolia
          const { ethers: _ethers } = require('ethers');
          const _provider = new _ethers.JsonRpcProvider(process.env.RPC_URL || 'https://eth-sepolia-testnet.api.pocket.network');
          const _feed = new _ethers.Contract(
            '0x694AA1769357215DE4FAC081bf1f309aDC325306',
            ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'],
            _provider
          );
          const [, _price] = await _feed.latestRoundData();
          const ethUsd = parseFloat(_ethers.formatUnits(_price, 8));
          finalUsdValue = (cryptoAmt * ethUsd).toFixed(2);
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

      // Insert purchase record
      const [insertResult] = await fastify.mysql.query(
        `INSERT INTO ico_purchases
        (address, crypto_value, payment_type, ptc_tokens, trans_hash, usd_value_of_crypto, sale_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [address, CryptoValue, payment_type, PPM_tokens, transHash, finalUsdValue, resolvedSaleType || '', status]
      );


      return reply.code(200).send({
        status: true,
        msg: `${PPM_tokens} Trustive tokens purchased successfully!!!`,
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
  // Get User Purchase & Staking History
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

      const [stakings] = await fastify.mysql.query(
        'SELECT * FROM staking_records WHERE LOWER(wallet_address) = LOWER(?) ORDER BY id DESC',
        [address]
      );

      return reply.send({ status: true, transactions, stakings });
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
      let [checkData] = await fastify.mysql.query('SELECT * FROM users WHERE wallet_address = ?', [address]);
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
      const [rows] = await fastify.mysql.query("SELECT site_name, token_name, token_symbol, chain, token_decimal, contract_address, ico_contract, usdt_address, usdc_address, site_logo, token_logo, staking_contract, vesting_contract FROM settings LIMIT 1");
      return reply.send({ status: true, data: rows[0] || {} });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  // ========================================
  // Staking - User Routes
  // ========================================
  const { ethers: stakingEthers } = require('ethers');
  const stakingFs = require('fs');
  const stakingPath = require('path');
  // Ordered by measured latency: publicnode answers a 15-call batch in ~130ms,
  // pocket in ~1.4s cold. sepolia.gateway.tenderly.co no longer resolves.
  const stakingRpcUrls = [
    process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://eth-sepolia-testnet.api.pocket.network',
  ];
  let stakingProvider = new stakingEthers.JsonRpcProvider(stakingRpcUrls[0]);
  // Try to find a working RPC at startup
  (async () => {
    for (const rpc of stakingRpcUrls) {
      try {
        const p = new stakingEthers.JsonRpcProvider(rpc);
        await p.getBlockNumber();
        stakingProvider = p;
        break;
      } catch { /* try next */ }
    }
  })().catch(() => { });

  // Ensure staking tables exist
  await fastify.mysql.query(`CREATE TABLE IF NOT EXISTS staking_records (
    id INT AUTO_INCREMENT PRIMARY KEY, user_address VARCHAR(255) NOT NULL,
    amount VARCHAR(255) NOT NULL, plan_id INT NOT NULL DEFAULT 0,
    plan_name VARCHAR(100) DEFAULT 'Flexible', apy DECIMAL(10,2) DEFAULT 0,
    duration_days INT DEFAULT 0, duration_seconds INT DEFAULT 0,
    chain_stake_index INT DEFAULT NULL,
    stake_tx_hash VARCHAR(255) NOT NULL,
    unstake_tx_hash VARCHAR(255) DEFAULT NULL,
    is_emergency TINYINT(1) NOT NULL DEFAULT 0,
    start_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_at TIMESTAMP NULL DEFAULT NULL, reward_claimed VARCHAR(255) DEFAULT '0',
    status ENUM('active','completed','unstaked') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_stake_tx (stake_tx_hash), INDEX idx_user_address (user_address), INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`).catch(() => { });

  // Add missing columns if table already existed without them
  try {
    const [cols] = await fastify.mysql.query("SHOW COLUMNS FROM staking_records");
    const colNames = cols.map(c => c.Field || c.field);
    if (!colNames.includes('duration_seconds')) {
      await fastify.mysql.query("ALTER TABLE staking_records ADD COLUMN duration_seconds INT DEFAULT 0");
      console.log('[Staking] Added duration_seconds column to staking_records');
    }
    if (!colNames.includes('chain_stake_index')) {
      await fastify.mysql.query("ALTER TABLE staking_records ADD COLUMN chain_stake_index INT DEFAULT NULL");
      console.log('[Staking] Added chain_stake_index column to staking_records');
    }
    if (!colNames.includes('is_emergency')) {
      await fastify.mysql.query("ALTER TABLE staking_records ADD COLUMN is_emergency TINYINT(1) NOT NULL DEFAULT 0");
      console.log('[Staking] Added is_emergency column to staking_records');
    }
  } catch (migErr) {
    console.error('[Staking] Migration error:', migErr.message);
  }

  await fastify.mysql.query(`CREATE TABLE IF NOT EXISTS staking_plans (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL,
    duration_days INT NOT NULL DEFAULT 0, apy DECIMAL(10,2) NOT NULL DEFAULT 0,
    min_stake VARCHAR(255) DEFAULT '0', is_active TINYINT(1) DEFAULT 1,
    total_staked VARCHAR(255) DEFAULT '0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`).catch(() => { });

  await fastify.mysql.query(`CREATE TABLE IF NOT EXISTS staking_reward_history (
    id INT AUTO_INCREMENT PRIMARY KEY, user_address VARCHAR(255) NOT NULL,
    stake_id INT NOT NULL, reward_amount VARCHAR(255) NOT NULL,
    tx_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_reward_tx (tx_hash), INDEX idx_user_address (user_address), INDEX idx_stake_id (stake_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`).catch(() => { });

  // Ensure staking plan name and min_stake are updated
  await fastify.mysql.query("UPDATE staking_plans SET name = 'GOLD', min_stake = '1000' WHERE name = 'Flexible' OR name LIKE 'Level %' OR name = '3 min lock period' OR min_stake = '100' OR min_stake = '0'").catch(() => { });

  function getStakingContract(provider) {
    const addr = process.env.STAKING_CONTRACT_ADDRESS || '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb';
    const abi = JSON.parse(stakingFs.readFileSync(stakingPath.join(__dirname, "../abi's/staking.json"), 'utf8'));
    return new stakingEthers.Contract(addr, abi, provider || stakingProvider);
  }

  // Probing every RPC on each call costs a full round trip per request, so the
  // winner is cached the way AdminController's getWorkingProvider does it.
  let _cachedStakingProvider = null;
  let _stakingProviderCheckedAt = 0;
  const STAKING_PROVIDER_TTL = 300000; // 5 minutes

  async function getWorkingStakingProvider() {
    if (_cachedStakingProvider && Date.now() - _stakingProviderCheckedAt < STAKING_PROVIDER_TTL) {
      return _cachedStakingProvider;
    }
    for (const rpc of stakingRpcUrls) {
      try {
        const p = new stakingEthers.JsonRpcProvider(rpc);
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        _cachedStakingProvider = p;
        _stakingProviderCheckedAt = Date.now();
        return p;
      } catch { /* try next */ }
    }
    return _cachedStakingProvider || stakingProvider; // fallback to the startup provider
  }

  async function getWorkingStakingContract() {
    return getStakingContract(await getWorkingStakingProvider());
  }

  fastify.get('/staking/plans', async (request, reply) => {
    try {
      const [plans] = await fastify.mysql.query("SELECT * FROM staking_plans WHERE is_active = 1 ORDER BY id ASC");
      const normalized = (Array.isArray(plans) ? plans : []).map(p => ({
        ...p,
        name: (p.name === 'Flexible' || !p.name || p.name.startsWith('Level ')) ? 'GOLD' : p.name,
        min_stake: (p.min_stake === '100' || p.min_stake === '0' || !p.min_stake) ? '1000' : p.min_stake
      }));
      return reply.send({ status: true, plans: normalized });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.post('/staking/stake', async (request, reply) => {
    try {
      const { user_address, amount, plan_id, tx_hash, chain_stake_index } = request.body;
      if (!user_address || !amount || plan_id === undefined || !tx_hash) {
        return reply.send({ status: false, msg: "Missing required fields" });
      }
      const [existing] = await fastify.mysql.query("SELECT id FROM staking_records WHERE stake_tx_hash = ?", [tx_hash]);
      if (existing && existing.length > 0) return reply.send({ status: true, msg: "Stake already recorded" });

      const [planRows] = await fastify.mysql.query("SELECT * FROM staking_plans WHERE id = ? OR chain_level = ? LIMIT 1", [plan_id, plan_id]).catch(() => [[]]);
      const plan = planRows[0] || { id: 1, name: 'GOLD', apy: 8, duration_seconds: 180, total_staked: '0' };

      try {
        const provider = await getWorkingStakingProvider();
        const receipt = await Promise.race([
          provider.waitForTransaction(tx_hash, 1, 15000),
          provider.getTransactionReceipt(tx_hash)
        ]);
        if (receipt && receipt.status === 0) {
          return reply.send({ status: false, msg: "Transaction reverted on chain" });
        }
      } catch (e) {
        console.warn("Staking receipt check warning:", e.message);
      }

      const start_at = new Date();
      const duration = Number(plan.duration_seconds || 180);
      const end_at = duration > 0 ? new Date(start_at.getTime() + duration * 1000) : null;
      const chainIdx = (chain_stake_index !== undefined && chain_stake_index !== null) ? Number(chain_stake_index) : 1;
      const planName = plan.name || 'GOLD';
      const apy = Number(plan.apy || 8);

      // UPSERT logic: check if this level already exists for this user
      const [existingLevel] = await fastify.mysql.query(
        "SELECT id FROM staking_records WHERE LOWER(user_address) = LOWER(?) AND chain_stake_index = ? AND status IN ('active', 'completed')",
        [user_address, chainIdx]
      );
      if (existingLevel && existingLevel.length > 0) {
        // Update the existing record
        await fastify.mysql.query(
          "UPDATE staking_records SET amount = ?, plan_id = ?, plan_name = ?, apy = ?, duration_seconds = ?, stake_tx_hash = ?, start_at = ?, end_at = ?, status = 'active', updated_at = NOW() WHERE id = ?",
          [amount, plan.id || 1, planName, apy, duration, tx_hash, start_at, end_at, existingLevel[0].id]
        );
      } else {
        // Insert new record
        await fastify.mysql.query(
          "INSERT INTO staking_records (user_address, amount, plan_id, plan_name, apy, duration_seconds, stake_tx_hash, start_at, end_at, status, chain_stake_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)",
          [user_address, amount, plan.id || 1, planName, apy, duration, tx_hash, start_at, end_at, chainIdx]
        );
      }

      const newTotal = parseFloat(plan.total_staked || '0') + parseFloat(amount);
      await fastify.mysql.query("UPDATE staking_plans SET total_staked = ? WHERE id = ?", [newTotal.toString(), plan.id || 1]).catch(() => {});
      return reply.send({ status: true, msg: "Stake recorded successfully" });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return reply.send({ status: true, msg: "Stake already recorded" });
      console.error("Staking record error:", err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.post('/staking/unstake', async (request, reply) => {
    try {
      const { stake_id, tx_hash, reward_amount, emergency } = request.body;
      if (!stake_id || !tx_hash) return reply.send({ status: false, msg: "Missing required fields" });
      try {
        const receipt = await stakingProvider.waitForTransaction(tx_hash, 1, 30000);
        if (receipt.status !== 1) return reply.send({ status: false, msg: "Transaction failed on-chain" });
      } catch (e) {
        return reply.send({ status: false, msg: "Unable to verify transaction on-chain" });
      }
      // An emergency exit leaves the lock period early: the principal comes back
      // but the accrued reward is forfeited, so reward_claimed stays at 0
      const isEmergency = emergency === true || emergency === 'true' ? 1 : 0;
      await fastify.mysql.query(
        "UPDATE staking_records SET status = 'unstaked', unstake_tx_hash = ?, reward_claimed = ?, is_emergency = ?, updated_at = NOW() WHERE id = ?",
        [tx_hash, isEmergency ? '0' : (reward_amount || '0'), isEmergency, stake_id]
      );
      const [stakeRows] = await fastify.mysql.query("SELECT amount, plan_id FROM staking_records WHERE id = ?", [stake_id]);
      if (stakeRows && stakeRows.length > 0) {
        const { amount, plan_id } = stakeRows[0];
        const [planRows] = await fastify.mysql.query("SELECT total_staked FROM staking_plans WHERE id = ?", [plan_id]);
        if (planRows && planRows.length > 0) {
          const newTotal = Math.max(0, parseFloat(planRows[0].total_staked || '0') - parseFloat(amount));
          await fastify.mysql.query("UPDATE staking_plans SET total_staked = ? WHERE id = ?", [newTotal.toString(), plan_id]);
        }
      }
      return reply.send({ status: true, msg: "Unstake recorded successfully" });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.post('/staking/claim-reward', async (request, reply) => {
    try {
      const { user_address, stake_id, reward_amount, tx_hash } = request.body;
      if (!user_address || !stake_id || !reward_amount || !tx_hash) return reply.send({ status: false, msg: "Missing required fields" });
      const [existing] = await fastify.mysql.query("SELECT id FROM staking_reward_history WHERE tx_hash = ?", [tx_hash]);
      if (existing && existing.length > 0) return reply.send({ status: true, msg: "Reward claim already recorded" });
      await fastify.mysql.query("INSERT INTO staking_reward_history (user_address, stake_id, reward_amount, tx_hash) VALUES (?, ?, ?, ?)", [user_address, stake_id, reward_amount, tx_hash]);
      const [stakeRows] = await fastify.mysql.query("SELECT id FROM staking_records WHERE id = ?", [stake_id]);
      if (stakeRows && stakeRows.length > 0) {
        // reward_claimed is this stake's own reward, not a running total. It used
        // to add to whatever the row already held, and the figure it is handed
        // comes from calculateReward, which the contract keeps per (user, level)
        // and not per stake - so every later withdrawal inherited the earlier
        // ones and the column climbed 80, 160, 240...
        // withdraw() releases the stake and its reward in one transaction, so
        // this hash is also the stake's withdrawal hash
        await fastify.mysql.query(
          "UPDATE staking_records SET reward_claimed = ?, status = 'unstaked', unstake_tx_hash = COALESCE(unstake_tx_hash, ?), updated_at = NOW() WHERE id = ?",
          [String(reward_amount), tx_hash, stake_id]
        );
      }
      return reply.send({ status: true, msg: "Withdrawal recorded successfully" });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return reply.send({ status: true, msg: "Reward claim already recorded" });
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.get('/staking/user/:address', async (request, reply) => {
    try {
      const { address } = request.params;
      let checksumAddress;
      try { checksumAddress = stakingEthers.getAddress(address); } catch (e) {
        return reply.code(400).send({ status: false, msg: 'Invalid address' });
      }

      // ── Step 1: Trigger Background Sync (Don't await) ────────────────
      // We limit background sync to once every 30 seconds per user to save RPC calls
      const now = Date.now();
      const lastSync = fastify.userSyncs?.[checksumAddress] || 0;

      if (now - lastSync > 30000) {
        if (!fastify.userSyncs) fastify.userSyncs = {};
        fastify.userSyncs[checksumAddress] = now;

        (async () => {
          try {
            const provider = await getWorkingStakingProvider();
            const contract = new stakingEthers.Contract(process.env.STAKING_CONTRACT_ADDRESS || '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb', JSON.parse(stakingFs.readFileSync(stakingPath.join(__dirname, "../abi's/staking.json"), 'utf8')), provider);

            // 1. Replay this user's Staking events so every stake keeps its own
            //    row, even when the browser never reached POST /staking/stake.
            //    Staking/Withdraw declare no indexed parameters, so they cannot be
            //    filtered by address at the RPC level - fetch all and match here.
            try {
              const currentBlock = await provider.getBlockNumber();
              const fromBlock = Math.max(0, currentBlock - 50000);
              const [stakingLogs, withdrawLogs] = await Promise.all([
                contract.queryFilter(contract.filters.Staking(), fromBlock, currentBlock).catch(() => []),
                contract.queryFilter(contract.filters.Withdraw(), fromBlock, currentBlock).catch(() => [])
              ]);
              const isMine = (log) => String(log.args?.userAddress || '').toLowerCase() === checksumAddress.toLowerCase();
              // Kept as logs (not just block numbers) so the withdrawal that closed
              // a stake can be recorded with its own transaction hash
              const myWithdraws = withdrawLogs.filter(isMine).sort((a, b) => a.blockNumber - b.blockNumber);

              for (const log of stakingLogs.filter(isMine)) {
                const level = Number(log.args.level || 1);
                const amt = stakingEthers.formatEther(log.args.amount);
                const endtime = Number(log.args.endtime || 0);
                const endAt = endtime > 0 ? new Date(endtime * 1000) : null;
                const startAt = endtime > 180 ? new Date((endtime - 180) * 1000) : new Date();
                // A stake counts as withdrawn only if a Withdraw came after it
                const withdrawLog = myWithdraws.find(w => w.blockNumber >= log.blockNumber);
                const status = withdrawLog ? 'unstaked' : (endAt && new Date() > endAt ? 'completed' : 'active');

                await fastify.mysql.query(
                  `INSERT INTO staking_records (user_address, amount, plan_id, plan_name, apy, duration_seconds, stake_tx_hash, start_at, end_at, status, chain_stake_index, unstake_tx_hash)
                   VALUES (?, ?, 1, 'GOLD', 8, 180, ?, ?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = VALUES(status), end_at = VALUES(end_at), plan_name = 'GOLD', unstake_tx_hash = COALESCE(unstake_tx_hash, VALUES(unstake_tx_hash))`,
                  [checksumAddress, amt, log.transactionHash, startAt, endAt, status, level, withdrawLog ? withdrawLog.transactionHash : null]
                ).catch(e => console.error('[Staking sync] event INSERT error:', e.message));
              }
            } catch (e) {
              console.warn('[Staking sync] event replay error:', e.message);
            }

            // 2. Refresh the current on-chain state. getUserDetails keeps one slot
            //    per (user, level), so it only describes the newest stake - scope
            //    the write to that row and never to the whole history.
            try {
              const raw = await contract.getUserDetails(checksumAddress, 1);
              const tuple = raw && raw[0];
              if (tuple) {
                const rawAmount = tuple[1];
                const rawWithdraw = tuple[5];
                const isActive = Boolean(tuple[6]);
                const initialTime = Number(tuple[2]);
                const endTime = Number(tuple[3]);
                const reward = stakingEthers.formatEther(tuple[4] || 0n);

                if (rawAmount > 0n || rawWithdraw > 0n) {
                  const amt = stakingEthers.formatEther(rawAmount);
                  const startAt = initialTime > 0 ? new Date(initialTime * 1000) : new Date();
                  const endAt = endTime > 0 ? new Date(endTime * 1000) : null;
                  let status = 'active';
                  if (rawAmount === 0n && rawWithdraw > 0n) {
                    status = 'unstaked';
                  } else if (!isActive) {
                    status = 'unstaked';
                  } else if (endAt && new Date() > endAt) {
                    status = 'completed';
                  }

                  // Newest record for this user+level only
                  const [existing] = await fastify.mysql.query(
                    "SELECT id FROM staking_records WHERE LOWER(user_address) = LOWER(?) AND chain_stake_index = 1 ORDER BY start_at DESC, id DESC LIMIT 1",
                    [checksumAddress]
                  ).catch(() => [[]]);

                  if (existing && existing.length > 0) {
                    // After a withdrawal the on-chain amount drops to 0, so keep
                    // the recorded stake amount instead of zeroing the history
                    if (rawAmount > 0n) {
                      await fastify.mysql.query(
                        "UPDATE staking_records SET amount = ?, status = ?, reward_claimed = ?, start_at = ?, end_at = ?, plan_name = 'GOLD', updated_at = NOW() WHERE id = ?",
                        [amt, status, reward, startAt, endAt, existing[0].id]
                      ).catch(e => console.error('[Staking sync] UPDATE error:', e.message));
                    } else {
                      await fastify.mysql.query(
                        "UPDATE staking_records SET status = ?, reward_claimed = ?, plan_name = 'GOLD', updated_at = NOW() WHERE id = ?",
                        [status, reward, existing[0].id]
                      ).catch(e => console.error('[Staking sync] UPDATE error:', e.message));
                    }
                  } else if (rawAmount > 0n) {
                    // No row at all (stake older than the event window) - record it
                    // under a deterministic placeholder hash
                    const txHash = `chain-sync-${checksumAddress.toLowerCase()}-1-${initialTime}`;
                    await fastify.mysql.query(
                      `INSERT INTO staking_records (user_address, amount, plan_id, plan_name, apy, duration_seconds, stake_tx_hash, start_at, end_at, status, chain_stake_index)
                       VALUES (?, ?, 1, 'GOLD', 8, 180, ?, ?, ?, ?, 1)
                       ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = VALUES(status), end_at = VALUES(end_at), plan_name = 'GOLD', reward_claimed = ?`,
                      [checksumAddress, amt, txHash, startAt, endAt, status, reward]
                    ).catch(e => console.error('[Staking sync] INSERT error:', e.message));
                  }
                }
              }
            } catch (e) {
              console.warn('[Staking sync] getUserDetails error:', e.message);
            }
          } catch (e) {
            fastify.log.warn('Background sync error: ' + e.message);
          }
        })().catch(() => { });
      }

      // ── Step 2: Return data from DB immediately ───────────────────────
      const statusFilter = request.query.status || 'all';
      let query = "SELECT * FROM staking_records WHERE LOWER(user_address) = LOWER(?)";
      const params = [checksumAddress];
      // 'completed' = lock expired but tokens are still in the contract, so it
      // belongs with the active stakes; only 'unstaked' is really finished
      if (statusFilter === 'active') query += " AND status IN ('active','completed')";
      else if (statusFilter === 'completed') query += " AND status = 'unstaked'";
      query += " ORDER BY created_at DESC, id DESC";

      const [rows] = await fastify.mysql.query(query, params);
      const stakes = Array.isArray(rows) ? rows : [];

      const processed = stakes.map((s) => ({
        ...s,
        pending_reward: '0',
        start_at: toUtcISOString(s.start_at),
        end_at: s.end_at ? toUtcISOString(s.end_at) : null,
        created_at: toUtcISOString(s.created_at),
      }));

      return reply.send({ status: true, stakes: processed });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.get('/staking/rewards/:address', async (request, reply) => {
    try {
      const [rows] = await fastify.mysql.query("SELECT * FROM staking_reward_history WHERE LOWER(user_address) = LOWER(?) ORDER BY created_at DESC", [request.params.address]);
      const rewards = Array.isArray(rows) ? rows : [];
      return reply.send({ status: true, rewards: rewards.map(r => ({ ...r, created_at: toUtcISOString(r.created_at) })) });
    } catch (err) {
      return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
    }
  });

  fastify.get('/staking/contract-info', async (request, reply) => {
    try {
      // The staking contract exposes no aggregate stake total (no totalStaked()
      // in abi's/staking.json), so it is summed from our own records instead.
      const contract = await getWorkingStakingContract();
      const totalPlans = Number(await contract.totalPlans());

      const [rows] = await fastify.mysql.query(
        "SELECT COALESCE(SUM(CAST(amount AS DECIMAL(65,18))), 0) AS total FROM staking_records WHERE status IN ('active','completed')"
      );

      return reply.send({
        status: true,
        contractAddress: process.env.STAKING_CONTRACT_ADDRESS || '0x5F5B51defEF8F508212042AE15f2ee4ABb21dfcb',
        totalPlans,
        totalStaked: String(rows?.[0]?.total ?? 0),
      });
    } catch (err) {
      console.error('staking/contract-info error:', err);
      return reply.code(500).send({ status: false, msg: 'Failed to fetch contract info' });
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

  // One provider for every vesting call. Building a new JsonRpcProvider per
  // request threw away ethers' request batching, so parallel reads went out as
  // separate round trips.
  let vestingProviderInstance = null;
  async function getVestingProvider() {
    if (vestingProviderInstance) return vestingProviderInstance;
    for (const url of stakingRpcUrls) {
      try {
        vestingProviderInstance = new stakingEthers.JsonRpcProvider(url, undefined, { staticNetwork: true });
        return vestingProviderInstance;
      } catch (_) { }
    }
    return stakingProvider;
  }

  let vestingAbiCache = null;
  function getVestingAbi() {
    if (!vestingAbiCache) {
      vestingAbiCache = JSON.parse(stakingFs.readFileSync(stakingPath.join(__dirname, "../abi's/vesting.json"), 'utf8'));
    }
    return vestingAbiCache;
  }

  const VESTING_ADDRESS = process.env.VESTING_CONTRACT_ADDRESS || '0xBd4Ae52CE44A42FC7794938000Bb3147fC037B12';
  async function getVestingContract() {
    return new stakingEthers.Contract(VESTING_ADDRESS, getVestingAbi(), await getVestingProvider());
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
        const totalAmount = stakingEthers.formatEther(details.totalAmount);
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
            totalAmount: stakingEthers.formatEther(details.totalAmount),
            claimedAmount: stakingEthers.formatEther(details.claimedAmount),
            remainingToClaim: stakingEthers.formatEther(details.remainingToClaim),
            claimableNow: stakingEthers.formatEther(details.claimableNow),
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
          totalAmount: stakingEthers.formatEther(details.totalAmount),
          claimedAmount: stakingEthers.formatEther(details.claimedAmount),
          remainingToClaim: stakingEthers.formatEther(details.remainingToClaim),
          claimableNow: stakingEthers.formatEther(details.claimableNow),
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
        const total = parseFloat(stakingEthers.formatEther(details.totalAmount));
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
  // CMS - Public API (no auth required)
  // ========================================
  fastify.get('/cms/sections', async (request, reply) => {
    try {
      const [rows] = await fastify.mysql.query(
        'SELECT id, section_key, title, subtitle, description, image_url, button_text, button_link, display_order FROM cms_sections WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
      );

      // Build full image URLs so they are directly clickable/usable
      const baseUrl = `${request.protocol}://${request.host}`;
      const sections = (rows || []).map(row => ({
        ...row,
        image_url: row.image_url ? `${baseUrl}${row.image_url}` : null
      }));

      return reply.send({ status: true, sections });
    } catch (err) {
      console.error('Public CMS fetch error:', err);
      return reply.code(500).send({ status: false, msg: 'Failed to fetch CMS sections' });
    }
  });
};
