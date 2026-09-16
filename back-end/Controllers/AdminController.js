const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const { getProvider, withFailover, invalidateProvider } = require('../Utils/rpcProvider');
const bcrypt = require('bcrypt');

module.exports = async function (fastify, opts) {
    const { toUtcISOString, formatForMySQL, updateSaleStatuses } = require('./timeUtils');

    // JWT authentication hook.
    // The public list is matched against the resolved route, not a substring of
    // the request URL: `url.includes('/verify')` also matched /verify-2fa and
    // left it open to anyone.
    const PUBLIC_ROUTES = new Set(['/login', '/get-owner-address', '/verify']);

    const adminRouteOf = (request) => {
        const url = request.routeOptions?.url || request.url.split('?')[0];
        return url.replace(/^\/api\/admin/, '') || '/';
    };

    fastify.addHook('preHandler', async (request, reply) => {
        if (request.method === 'OPTIONS') return;
        if (PUBLIC_ROUTES.has(adminRouteOf(request))) return;

        try {
            await request.jwtVerify();
        } catch (err) {
            return reply.code(401).send({ status: false, msg: 'Unauthorized: Invalid or missing token' });
        }

        // Every token is signed with the same secret, so without this check a
        // plain user's login token opened the whole admin API.
        if (!request.user?.isAdmin) {
            return reply.code(403).send({ status: false, msg: 'Forbidden: admin access required' });
        }
    });

    fastify.get('/verify', async (req, reply) => {
        try {
            await req.jwtVerify();
            if (!req.user?.isAdmin) return reply.code(403).send({ status: false, msg: 'Forbidden' });
            return { status: true, msg: 'Authorized' };
        } catch (err) {
            return reply.code(401).send({ status: false, msg: 'Unauthorized' });
        }
    });

    // RPC provider – uses centralized Utils/rpcProvider.js with 5-endpoint
    // rotational failover. getWorkingProvider is an alias for compatibility.
    const getWorkingProvider = getProvider;

    // Generic Cache for View Calls
    const _viewCache = new Map();
    const CACHE_TTL = 30000; // 30 seconds

    async function getCachedCall(key, fetcher) {
        const cached = _viewCache.get(key);
        if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
        const data = await fetcher();
        _viewCache.set(key, { data, time: Date.now() });
        return data;
    }

    async function getOnChainTokenPrice() {
        try {
            const [rows] = await fastify.mysql.query("SELECT ico_contract FROM settings LIMIT 1");
            const settings = rows[0];
            if (!settings?.ico_contract) return null;

            const simpleAbi = [{ "inputs": [], "name": "tokenAmountPerUSD", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }];
            return await withFailover(async (provider) => {
                const contract = new ethers.Contract(settings.ico_contract, simpleAbi, provider);
                const onChain = await contract.tokenAmountPerUSD();
                const tokensPerUSD = parseFloat(onChain.toString()) / (10 ** 18);
                return tokensPerUSD > 0 ? (1 / tokensPerUSD) : 0;
            });
        } catch (err) {
            console.error('getOnChainTokenPrice error:', err.message);
            return null;
        }
    }

    async function getICOContractBalance() {
        try {
            const [settingsRows] = await fastify.mysql.query("SELECT contract_address, ico_contract, ico_remaining_tokens FROM settings LIMIT 1");
            const currentSettings = settingsRows[0] || {};
            const tokenAddr = currentSettings.contract_address || process.env.TRUSTIVE_TOKEN_ADDRESS || process.env.TOKEN_ADDRESS || '0xe12F60d7c0bc493b033c789Aa533E772541041eA';
            const icoAddr = currentSettings.ico_contract || process.env.ICO_CONTRACT_ADDRESS || '0x300C8EEB80Af24FF831015cF667f670077Fe1564';

            if (tokenAddr && icoAddr) {
                try {
                    return await withFailover(async (provider) => {
                        const tokenContract = new ethers.Contract(
                            tokenAddr,
                            ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
                            provider
                        );
                        const [balWei, decimals] = await Promise.all([
                            tokenContract.balanceOf(icoAddr),
                            tokenContract.decimals().catch(() => 18)
                        ]);
                        return parseFloat(ethers.formatUnits(balWei, decimals));
                    });
                } catch (_) {
                    // All RPCs failed – fall through to DB fallback
                }
                if (currentSettings.ico_remaining_tokens) {
                    return parseFloat(currentSettings.ico_remaining_tokens);
                }
            }
            return null;
        } catch (err) {
            console.error('getICOContractBalance error:', err.message);
            return null;
        }
    }

    // Ensure kyc_status & profile_pic columns exist in users
    try {
        const [userCols] = await fastify.mysql.query("SHOW COLUMNS FROM users");
        const userColNames = userCols.map(c => c.Field || c.field);
        if (!userColNames.includes('kyc_status')) {
            await fastify.mysql.query("ALTER TABLE users ADD COLUMN kyc_status VARCHAR(50) DEFAULT 'unverified'");
            console.log("Added kyc_status column to users");
        }
        if (!userColNames.includes('profile_pic')) {
            await fastify.mysql.query("ALTER TABLE users ADD COLUMN profile_pic VARCHAR(500) DEFAULT NULL");
            console.log("Added profile_pic column to users");
        }
    } catch (err) {
        console.error("users migration error:", err.message);
    }

    // Ensure settings has the columns the ICO stats queries select. The live
    // table predates ico_remaining_tokens, and its absence made every
    // getICOContractBalance call fail before it could read the contract.
    try {
        const [settingsCols] = await fastify.mysql.query("SHOW COLUMNS FROM settings");
        const settingsColNames = settingsCols.map(c => c.Field || c.field);
        if (!settingsColNames.includes('ico_remaining_tokens')) {
            await fastify.mysql.query("ALTER TABLE settings ADD COLUMN ico_remaining_tokens VARCHAR(255) DEFAULT '0'");
            console.log("Added ico_remaining_tokens column to settings");
        }
    } catch (err) {
        console.error("settings migration error:", err.message);
    }

    // The admin password was stored and compared in plain text. Hash whatever is
    // there now so the existing password keeps working, then every comparison
    // below goes through bcrypt.
    const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
    try {
        const [pwRows] = await fastify.mysql.query("SELECT id, admin_password FROM settings LIMIT 1");
        const current = pwRows[0];
        if (current && current.admin_password && !isBcryptHash(current.admin_password)) {
            const hashed = await bcrypt.hash(current.admin_password, 10);
            await fastify.mysql.query("UPDATE settings SET admin_password = ? WHERE id = ?", [hashed, current.id]);
            console.log("Hashed the plaintext admin_password in settings");
        }
    } catch (err) {
        console.error("admin password hash migration error:", err.message);
    }

    // Same shape as the user-side rules in UserController.
    const validateAdminPassword = (password) => {
        if (typeof password !== 'string' || password.length < 8 || password.length > 15)
            return 'Password must be between 8 and 15 characters';
        if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
        if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
        if (!/[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/~`]/.test(password))
            return 'Password must contain at least one special character';
        return null;
    };

    // ========================================
    // Login
    // ========================================
    fastify.post('/login', {
        schema: {
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                    twoFaCode: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        try {
            const { email, password, twoFaCode } = req.body;
            const [rows] = await fastify.mysql.query("SELECT admin_email, admin_password, admin_two_fa_secret, admin_two_fa_enabled FROM settings LIMIT 1");
            const settings = rows[0];

            if (!settings || email !== settings.admin_email) {
                return reply.send({ status: false, msg: 'Invalid email or password' });
            }
            const passwordOk = settings.admin_password
                ? await bcrypt.compare(password, settings.admin_password)
                : false;
            if (!passwordOk) {
                return reply.send({ status: false, msg: 'Invalid email or password' });
            }

            // Check if 2FA is enabled
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
                if (!verified) {
                    return reply.send({ status: false, msg: 'Invalid 2FA code' });
                }
            }

            const token = fastify.jwt.sign({ email, isAdmin: true }, { expiresIn: '24h' });
            return reply.send({ status: true, data: { email, name: 'ADMIN', token } });
        } catch (err) {
            console.error('Admin login error:', err);
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    // ========================================
    // Change Admin Password
    // ========================================
    fastify.post('/change-password', async (req, reply) => {
        try {
            const { currentPassword, newPassword } = req.body || {};
            if (!currentPassword || !newPassword)
                return reply.send({ status: false, msg: 'Current and new passwords are required' });

            const invalid = validateAdminPassword(newPassword);
            if (invalid) return reply.send({ status: false, msg: invalid });

            const [rows] = await fastify.mysql.query("SELECT id, admin_password FROM settings LIMIT 1");
            const settings = rows[0];

            if (!settings) return reply.send({ status: false, msg: 'Settings not found' });
            const currentOk = settings.admin_password
                ? await bcrypt.compare(currentPassword, settings.admin_password)
                : false;
            if (!currentOk) {
                return reply.send({ status: false, msg: 'Current password is incorrect' });
            }

            const hashed = await bcrypt.hash(newPassword, 10);
            await fastify.mysql.query("UPDATE settings SET admin_password = ? WHERE id = ?", [hashed, settings.id]);
            return reply.send({ status: true, msg: "Password changed successfully" });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    // ========================================
    // 2FA Admin Endpoints
    // ========================================
    fastify.post('/generate-2fa', async (req, reply) => {
        try {
            const speakeasy = require('speakeasy');
            const qrcode = require('qrcode');

            // Re-keying while 2FA is on would hand the second factor to whoever
            // holds the session token — the same thing disable-2fa guards.
            const [currentRows] = await fastify.mysql.query("SELECT admin_two_fa_enabled FROM settings LIMIT 1");
            if (currentRows[0]?.admin_two_fa_enabled) {
                return reply.send({ status: false, msg: '2FA is already enabled. Disable it first to set up a new device.' });
            }

            const secret = speakeasy.generateSecret({ name: `Trustive Admin (${process.env.DB_NAME || 'Main'})` });
            const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

            // Store temporary secret until verified
            await fastify.mysql.query("UPDATE settings SET admin_two_fa_secret = ? WHERE id = (SELECT id FROM (SELECT id FROM settings LIMIT 1) t)", [secret.base32]);

            return reply.send({ status: true, secret: secret.base32, qrCode: qrCodeUrl });
        } catch (err) {
            console.error('Generate 2FA error:', err);
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    fastify.post('/verify-2fa', async (req, reply) => {
        try {
            const { code } = req.body;
            const [rows] = await fastify.mysql.query("SELECT id, admin_two_fa_secret FROM settings LIMIT 1");
            const settings = rows[0];

            if (!settings || !settings.admin_two_fa_secret) {
                return reply.send({ status: false, msg: '2FA not initialized' });
            }

            const speakeasy = require('speakeasy');
            const verified = speakeasy.totp.verify({
                secret: settings.admin_two_fa_secret,
                encoding: 'base32',
                token: (code || '').toString().trim(),
                window: 1
            });

            if (verified) {
                await fastify.mysql.query("UPDATE settings SET admin_two_fa_enabled = 1 WHERE id = ?", [settings.id]);
                return reply.send({ status: true, msg: '2FA enabled successfully' });
            } else {
                return reply.send({ status: false, msg: 'Invalid code. Please try again.' });
            }
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    // Turning admin 2FA off costs the admin password plus a live authenticator
    // code, with a lockout so the six-digit code cannot be walked through.
    const DISABLE_MAX_ATTEMPTS = 5;
    const DISABLE_LOCKOUT_MS = 15 * 60 * 1000;
    let disable2faAttempts = { count: 0, lockedAt: 0 };

    const disableLockRemaining = () => {
        if (disable2faAttempts.count < DISABLE_MAX_ATTEMPTS) return 0;
        const remaining = disable2faAttempts.lockedAt + DISABLE_LOCKOUT_MS - Date.now();
        if (remaining <= 0) {
            disable2faAttempts = { count: 0, lockedAt: 0 };
            return 0;
        }
        return remaining;
    };

    fastify.post('/disable-2fa', async (req, reply) => {
        try {
            const lockedFor = disableLockRemaining();
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
                "SELECT id, admin_password, admin_two_fa_secret, admin_two_fa_enabled FROM settings LIMIT 1"
            );
            const settings = rows[0];
            if (!settings) return reply.send({ status: false, msg: 'Settings not found' });
            if (!settings.admin_two_fa_enabled) return reply.send({ status: false, msg: '2FA is not enabled' });

            const speakeasy = require('speakeasy');
            const passwordOk = settings.admin_password
                ? await bcrypt.compare(password, settings.admin_password)
                : false;
            const codeOk = !!settings.admin_two_fa_secret && speakeasy.totp.verify({
                secret: settings.admin_two_fa_secret,
                encoding: 'base32',
                token: code.toString().trim(),
                window: 1
            });

            // Reported together so a wrong password cannot be told from a wrong code
            if (!passwordOk || !codeOk) {
                disable2faAttempts.count += 1;
                if (disable2faAttempts.count >= DISABLE_MAX_ATTEMPTS) disable2faAttempts.lockedAt = Date.now();
                const left = Math.max(0, DISABLE_MAX_ATTEMPTS - disable2faAttempts.count);
                // Deliberately not a 401: the admin client treats that as an
                // expired session and logs the user straight out.
                return reply.send({
                    status: false,
                    msg: left > 0
                        ? `Incorrect password or authenticator code. ${left} attempt(s) left.`
                        : 'Too many failed attempts. Disabling 2FA is locked for 15 minutes.'
                });
            }

            disable2faAttempts = { count: 0, lockedAt: 0 };
            await fastify.mysql.query("UPDATE settings SET admin_two_fa_enabled = 0, admin_two_fa_secret = NULL WHERE id = ?", [settings.id]);
            return reply.send({ status: true, msg: '2FA disabled successfully' });
        } catch (err) {
            console.error('Admin disable 2FA error:', err);
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    fastify.get('/2fa-status', async (req, reply) => {
        try {
            const [rows] = await fastify.mysql.query("SELECT admin_two_fa_enabled FROM settings LIMIT 1");
            return reply.send({ status: true, enabled: !!rows[0]?.admin_two_fa_enabled });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    // ========================================
    // Get Owner Address
    // ========================================
    fastify.get('/get-owner-address', async (req, reply) => {
        try {
            const [rows] = await fastify.mysql.query("SELECT owner_address FROM settings LIMIT 1");
            const settings = rows[0];
            const ownerAddress = settings?.owner_address || process.env.OWNER_WALLET;
            return reply.send({ status: true, owner_address: ownerAddress });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    // ========================================
    // Reset Password
    // ========================================
    // The owner address is public (get-owner-address hands it out), so naming it
    // proved nothing. The caller now has to sign for it.
    fastify.post('/reset-password', async (req, reply) => {
        try {
            const { newPassword, address, signature, timestamp } = req.body || {};
            if (!newPassword || !address || !signature || !timestamp) {
                return reply.send({ status: false, msg: 'newPassword, address, timestamp and signature are required' });
            }

            const invalid = validateAdminPassword(newPassword);
            if (invalid) return reply.send({ status: false, msg: invalid });

            const age = Date.now() - Number(timestamp);
            if (!Number.isFinite(age) || age < -60000 || age > 10 * 60 * 1000) {
                return reply.send({ status: false, msg: 'Signature has expired. Please sign again.' });
            }

            const [rows] = await fastify.mysql.query("SELECT id, owner_address FROM settings LIMIT 1");
            const settings = rows[0];
            if (!settings || !settings.owner_address || address.toLowerCase() !== settings.owner_address.toLowerCase()) {
                return reply.send({ status: false, msg: 'Unauthorized wallet address' });
            }

            let signer;
            try {
                try {
                    signer = ethers.verifyMessage(`Trustive admin password reset:${timestamp}`, signature);
                } catch {
                    signer = ethers.verifyMessage(`Trustive password reset:${timestamp}`, signature);
                }
            } catch (e) {
                return reply.send({ status: false, msg: 'Invalid signature' });
            }
            if (signer.toLowerCase() !== settings.owner_address.toLowerCase()) {
                return reply.send({ status: false, msg: 'Invalid signature' });
            }

            const hashed = await bcrypt.hash(newPassword, 10);
            await fastify.mysql.query("UPDATE settings SET admin_password = ? WHERE id = ?", [hashed, settings.id]);
            return reply.send({ status: true, msg: "Password reset successful" });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    // ========================================
    // ICO Purchases On-Chain Sync Helper
    // ========================================
    const ICO_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/ico.json"), 'utf8'));
    let lastIcoPurchasesSyncTime = 0;
    async function syncIcoPurchasesFromChain(mysql, force = false) {
        const now = Date.now();
        if (!force && now - lastIcoPurchasesSyncTime < 30000) return;
        lastIcoPurchasesSyncTime = now;
        try {
            const provider = await getWorkingProvider();
            const [settingsRows] = await mysql.query("SELECT ico_contract FROM settings LIMIT 1");
            const icoAddr = settingsRows[0]?.ico_contract || process.env.ICO_CONTRACT_ADDRESS || '0x300C8EEB80Af24FF831015cF667f670077Fe1564';
            const icoContract = new ethers.Contract(icoAddr, ICO_ABI, provider);

            const currentBlock = await provider.getBlockNumber();
            const startBlock = Math.max(0, currentBlock - 50000);
            const filter = icoContract.filters.TokenPurchased();
            const CHUNK_SIZE = 10000;
            let logs = [];
            for (let i = startBlock; i < currentBlock; i += CHUNK_SIZE) {
                const to = Math.min(i + CHUNK_SIZE, currentBlock);
                try {
                    const chunk = await icoContract.queryFilter(filter, i, to);
                    logs = logs.concat(chunk);
                } catch (e) { }
            }

            for (const log of logs) {
                const txHash = log.transactionHash;
                const recipient = log.args[0];
                const trustiveTokens = ethers.formatEther(log.args[1]);

                let createdAt = new Date();
                let paymentType = 'BNB';
                let cryptoValue = '0.001';
                let usdValue = '2.50';

                try {
                    const [tx, block] = await Promise.all([
                        provider.getTransaction(txHash).catch(() => null),
                        provider.getBlock(log.blockNumber).catch(() => null)
                    ]);
                    if (block) createdAt = new Date(block.timestamp * 1000);
                    if (tx) {
                        const nativeVal = parseFloat(ethers.formatEther(tx.value));
                        if (nativeVal > 0) {
                            paymentType = 'BNB';
                            cryptoValue = nativeVal.toString();
                            usdValue = (nativeVal * 700).toFixed(2);
                        } else {
                            paymentType = 'USDT';
                            cryptoValue = '1';
                            usdValue = '1.00';
                        }
                    }
                } catch (e) { }

                await mysql.query("INSERT IGNORE INTO users (wallet_address) VALUES (?)", [recipient]);
                await mysql.query(
                    `INSERT INTO ico_purchases (address, crypto_value, payment_type, ptc_tokens, trans_hash, usd_value_of_crypto, sale_type, status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?)
                     ON DUPLICATE KEY UPDATE ptc_tokens = VALUES(ptc_tokens), status = 'success'`,
                    [recipient, cryptoValue, paymentType, trustiveTokens, txHash, usdValue, 'PRESALE', createdAt]
                );
            }
        } catch (e) {
            console.error("syncIcoPurchasesFromChain error:", e.message);
        }
    }

    // ========================================
    // Dashboard
    // ========================================
    fastify.get('/dashboard', async (request, reply) => {
        try {
            updateSaleStatuses(fastify.mysql).catch(() => {});
            syncIcoPurchasesFromChain(fastify.mysql).catch(() => {});

            const [
                [statsRows],
                [activeSaleRows],
                [lastTxRows],
                [historyRows]
            ] = await Promise.all([
                fastify.mysql.query(`
                    SELECT
                        (SELECT COUNT(*) FROM users) AS total_users,
                        (SELECT COUNT(*) FROM ico_purchases WHERE status IN ('success', 'paid')) AS total_transactions,
                        (SELECT COUNT(*) FROM ico_purchases WHERE status IN ('success', 'paid')) AS successful_transactions,
                        (SELECT COUNT(*) FROM ico_purchases WHERE status = 'failed') AS failed_transactions,
                        (SELECT COALESCE(SUM(ptc_tokens), 0) FROM ico_purchases WHERE status IN ('success', 'paid')) AS purchased_tokens,
                        (SELECT COALESCE(SUM(CAST(token_quantity AS DECIMAL(30,8))), 0) FROM token_sales) AS total_ico_allocation,
                        (SELECT COALESCE(SUM(CAST(token_quantity AS DECIMAL(30,8))), 0) FROM token_sales) - (SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(30,8))), 0) FROM ico_purchases WHERE status IN ('success', 'paid')) AS total_ico_remaining,
                        (SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(36,18))), 0) FROM vesting_schedules WHERE status = 'active') AS tokens_in_vesting;
                `),
                fastify.mysql.query(`
                    SELECT *,
                    CASE
                        WHEN UTC_TIMESTAMP() BETWEEN start_at AND end_at THEN 'active'
                        WHEN UTC_TIMESTAMP() < start_at THEN 'scheduled'
                        ELSE 'ended'
                    END AS computed_status
                    FROM token_sales
                    WHERE status = 'active' OR (UTC_TIMESTAMP() BETWEEN start_at AND end_at)
                    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, start_at DESC
                    LIMIT 1;
                `),
                fastify.mysql.query(`
                    SELECT ip.id, ip.address, ip.ptc_tokens, ip.created_at, ip.sale_type, ip.payment_type, ip.usd_value_of_crypto, ip.trans_hash, COALESCE(u.name, ip.address) as username
                    FROM ico_purchases ip
                    LEFT JOIN users u ON ip.address = u.wallet_address
                    WHERE ip.status IN ('success', 'paid')
                    ORDER BY ip.created_at DESC
                    LIMIT 5;
                `),
                fastify.mysql.query(`
                    SELECT id, setting_key, old_value, new_value, changed_by, transaction_hash, timestamp
                    FROM payment_settings_history
                    ORDER BY timestamp DESC
                    LIMIT 5;
                `)
            ]);

            let activeSale = activeSaleRows[0] || null;

            if (!activeSale) {
                const [upcomingRows] = await fastify.mysql.query(`
                    SELECT *, 'scheduled' AS computed_status
                    FROM token_sales WHERE UTC_TIMESTAMP() < start_at ORDER BY start_at ASC LIMIT 1;
                `);
                activeSale = upcomingRows[0] || null;
            }

            if (!activeSale) {
                const [latestRows] = await fastify.mysql.query(`
                    SELECT *, 'ended' AS computed_status
                    FROM token_sales ORDER BY end_at DESC LIMIT 1;
                `);
                activeSale = latestRows[0] || null;
            }

            if (activeSale) {
                try {
                    if (activeSale.computed_status === 'scheduled' || !activeSale.start_at || !activeSale.end_at) {
                        activeSale.total_tokens_sold = 0;
                        activeSale.available_tokens = Number(activeSale.token_quantity || 0);
                    } else {
                        const [soldRows] = await fastify.mysql.query(
                            `SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(30,8))), 0) AS total_tokens_sold
                             FROM ico_purchases
                             WHERE status IN ('success', 'paid') 
                               AND (created_at BETWEEN ? AND ?)`,
                            [activeSale.start_at, activeSale.end_at]
                        );
                        const sold = parseFloat(soldRows[0]?.total_tokens_sold || 0);
                        activeSale.total_tokens_sold = sold;
                        activeSale.available_tokens = Math.max(0, Number(activeSale.token_quantity || 0) - sold);
                    }
                    activeSale.start_at_utc = toUtcISOString(activeSale.start_at);
                    activeSale.end_at_utc = toUtcISOString(activeSale.end_at);
                } catch (e) {
                    activeSale.total_tokens_sold = 0;
                    activeSale.available_tokens = Number(activeSale.token_quantity || 0);
                }
            }

            let currentSettings = {};
            let contractBal = null;

            // Fetch live remaining tokens from ICO contract and sync to DB
            try {
                const [settingsRows] = await fastify.mysql.query("SELECT * FROM settings LIMIT 1");
                currentSettings = settingsRows[0] || {};
                const tokenAddr = currentSettings.contract_address || process.env.TRUSTIVE_TOKEN_ADDRESS || process.env.TOKEN_ADDRESS || '0xe12F60d7c0bc493b033c789Aa533E772541041eA';
                const icoAddr = currentSettings.ico_contract || process.env.ICO_CONTRACT_ADDRESS || '0x300C8EEB80Af24FF831015cF667f670077Fe1564';

                if (tokenAddr && icoAddr) {
                    try {
                        contractBal = await withFailover(async (provider) => {
                            const tokenContract = new ethers.Contract(
                                tokenAddr,
                                [
                                    'function balanceOf(address) view returns (uint256)',
                                    'function decimals() view returns (uint8)'
                                ],
                                provider
                            );
                            const [balWei, decimals] = await Promise.all([
                                tokenContract.balanceOf(icoAddr),
                                tokenContract.decimals().catch(() => 18)
                            ]);
                            return parseFloat(ethers.formatUnits(balWei, decimals));
                        });
                    } catch (_) {
                        // All RPCs failed
                    }

                    if (contractBal !== null && statsRows && statsRows[0]) {
                        statsRows[0].total_ico_remaining = contractBal;
                        await fastify.mysql.query("UPDATE settings SET ico_remaining_tokens = ? WHERE id = ?", [contractBal.toString(), currentSettings.id || 1]).catch(() => {});
                    } else if (currentSettings.ico_remaining_tokens !== undefined && currentSettings.ico_remaining_tokens !== null && parseFloat(currentSettings.ico_remaining_tokens) > 0) {
                        if (statsRows && statsRows[0]) {
                            statsRows[0].total_ico_remaining = parseFloat(currentSettings.ico_remaining_tokens) || 0;
                        }
                    }
                }
            } catch (contractErr) {
                console.warn('Dashboard contract balance fetch error:', contractErr.message);
            }

            const statsObj = (statsRows && statsRows[0]) ? statsRows[0] : {};

            return reply.send({
                status: true,
                settings: currentSettings,
                stats: {
                    ...statsObj,
                    total_ico_remaining: statsObj.total_ico_remaining !== undefined && statsObj.total_ico_remaining !== null
                        ? parseFloat(statsObj.total_ico_remaining)
                        : (contractBal !== null ? contractBal : 0),
                },
                activeSale: activeSale,
                lastTransactions: Array.isArray(lastTxRows) ? lastTxRows.map(tx => ({ ...tx, created_at_utc: toUtcISOString(tx.created_at) })) : [],
                history: Array.isArray(historyRows) ? historyRows.map(h => ({ ...h, timestamp_utc: toUtcISOString(h.timestamp) })) : []
            });
        } catch (err) {
            console.error('Error in /dashboard:', err);
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    // ========================================
    // Users List
    // ========================================
    const getUsersHandler = async (request, reply) => {
        try {
            const [rows] = await fastify.mysql.query(`
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    u.wallet_address,
                    u.profile_pic,
                    COALESCE(u.kyc_status, 'unverified') AS kyc_status,
                    COALESCE(SUM(ip.ptc_tokens), 0) AS ptc_tokens_purchased,
                    COALESCE(SUM(ip.usd_value_of_crypto), 0) AS total_usd_invested
                FROM users u
                LEFT JOIN ico_purchases ip ON LOWER(u.wallet_address) = LOWER(ip.address COLLATE utf8mb4_unicode_ci) AND LOWER(ip.status) = 'success'
                GROUP BY u.id
                ORDER BY total_usd_invested DESC;
            `);

            const [globalVestingStats] = await fastify.mysql.query(`
                SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(36,18))), 0) as total_vested
                FROM vesting_schedules
                WHERE status = 'active'
            `);

            // Attach on-chain balances (subset/limited if needed, but doing all for now)
            const trustiveTokenAddress = process.env.TRUSTIVE_TOKEN_ADDRESS || '0xe12F60d7c0bc493b033c789Aa533E772541041eA';
            let provider = null;
            try { provider = await getWorkingProvider(); } catch (e) { }

            const usersWithOnChain = await Promise.all(rows.map(async (u) => {
                if (provider && u.wallet_address) {
                    try {
                        const contract = new ethers.Contract(trustiveTokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
                        const val = await contract.balanceOf(u.wallet_address);
                        return { ...u, ptc_tokens_purchased: ethers.formatEther(val) };
                    } catch (e) {
                        return u;
                    }
                }
                return u;
            }));

            return reply.send({
                status: true,
                users: usersWithOnChain,
                globalStats: {
                    total_vested: (globalVestingStats && globalVestingStats[0]) ? globalVestingStats[0].total_vested : 0
                }
            });
        } catch (err) {
            console.error('Error in /users:', err);
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    };

    fastify.get('/users', getUsersHandler);
    fastify.get('/users-list', getUsersHandler);

    // GET /user-profile/id/:userId — detailed user stats by user ID (for users without wallet)
    fastify.get('/user-profile/id/:userId', async (request, reply) => {
        try {
            const { userId } = request.params;
            const [userRows] = await fastify.mysql.query(
                "SELECT id, name, email, wallet_address, profile_pic FROM users WHERE id = ? LIMIT 1",
                [userId]
            );
            if (!userRows || userRows.length === 0) {
                return reply.code(404).send({ status: false, msg: 'User not found' });
            }
            const user = userRows[0];

            // If user has a wallet address, redirect logic to use it
            if (user.wallet_address) {
                // Reuse the address-based lookup
                request.params.address = user.wallet_address;
                // Fall through — but to keep it simple, we duplicate the logic with the address
                const address = user.wallet_address;
                const [
                    [balanceRows],
                    [vestingRows],
                    [purchaseRows]
                ] = await Promise.all([
                    fastify.mysql.query(
                        "SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(36,18))), 0) AS balance FROM ico_purchases WHERE LOWER(address) = LOWER(?) AND status = 'success'",
                        [address]
                    ),
                    fastify.mysql.query(
                        "SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(36,18))), 0) AS total_vested FROM vesting_schedules WHERE LOWER(beneficiary) = LOWER(?) AND status = 'active'",
                        [address]
                    ),
                    fastify.mysql.query(
                        "SELECT payment_type, COALESCE(SUM(CAST(crypto_value AS DECIMAL(36,18))), 0) AS total FROM ico_purchases WHERE LOWER(address) = LOWER(?) AND status = 'success' GROUP BY payment_type",
                        [address]
                    )
                ]);

                const cryptoTotals = {};
                (purchaseRows || []).forEach(r => { cryptoTotals[r.payment_type] = r.total; });

                let onChainBalance = '0';
                try {
                    const trustiveTokenAddress = process.env.TRUSTIVE_TOKEN_ADDRESS || '0xe12F60d7c0bc493b033c789Aa533E772541041eA';
                    const provider = await getWorkingProvider();
                    const contract = new ethers.Contract(trustiveTokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
                    const val = await contract.balanceOf(address);
                    onChainBalance = ethers.formatEther(val);
                } catch (err) {
                    onChainBalance = balanceRows[0]?.balance || 0;
                }

                // Query referral bonus
                let referralBonus = '0';
                try {
                    const [refRows] = await fastify.mysql.query(
                        "SELECT COALESCE(SUM(CAST(referrer_bonus AS DECIMAL(36,18))), 0) AS ref_bonus FROM ico_purchases WHERE LOWER(referrer_address) = LOWER(?) AND status = 'success'",
                        [address]
                    );
                    referralBonus = parseFloat(refRows[0]?.ref_bonus || 0).toString();
                } catch (_) { }

                return reply.send({
                    status: true,
                    stats: {
                        balance: onChainBalance,
                        total_vested: vestingRows[0]?.total_vested || 0,
                        total_bnb: parseFloat(cryptoTotals['BNB'] || 0).toString(),
                        total_usdt: (parseFloat(cryptoTotals['USDT'] || 0) + parseFloat(cryptoTotals['USDC'] || 0)).toString(),
                        unclaimed_boxes: 0,
                        nft_assets: 0,
                        referral_bonus: referralBonus,
                        profile_pic: user.profile_pic || null
                    }
                });
            }

            // User has no wallet — check if user has PTC_REF_ID and earned bonus
            let noWalletRefBonus = '0';
            try {
                const [uRows] = await fastify.mysql.query('SELECT PTC_REF_ID FROM users WHERE id = ?', [userId]);
                if (uRows && uRows[0]?.PTC_REF_ID) {
                    const [refRows] = await fastify.mysql.query(
                        "SELECT COALESCE(SUM(CAST(ip.referrer_bonus AS DECIMAL(36,18))), 0) AS ref_bonus FROM ico_purchases ip WHERE ip.address IN (SELECT wallet_address FROM users WHERE referred_by = ? AND wallet_address IS NOT NULL) AND ip.status = 'success'",
                        [uRows[0].PTC_REF_ID]
                    );
                    noWalletRefBonus = parseFloat(refRows[0]?.ref_bonus || 0).toString();
                }
            } catch (_) { }

            return reply.send({
                status: true,
                stats: {
                    balance: '0',
                    total_vested: '0',
                    total_bnb: '0',
                    total_usdt: '0',
                    unclaimed_boxes: 0,
                    nft_assets: 0,
                    referral_bonus: noWalletRefBonus,
                    profile_pic: user.profile_pic || null
                }
            });
        } catch (err) {
            console.error('Error in /user-profile/id/:userId:', err);
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    // GET /user-profile/:address — detailed user stats for admin modal
    fastify.get('/user-profile/:address', async (request, reply) => {
        try {
            const { address } = request.params;
            const [
                [userRows],
                [balanceRows],
                [vestingRows],
                [purchaseRows]
            ] = await Promise.all([
                // User basic info
                fastify.mysql.query("SELECT profile_pic FROM users WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1", [address]),
                // Trustive Balance from success purchases
                fastify.mysql.query(
                    "SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(36,18))), 0) AS balance FROM ico_purchases WHERE LOWER(address) = LOWER(?) AND status = 'success'",
                    [address]
                ),
                // Vesting stats
                fastify.mysql.query(
                    "SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(36,18))), 0) AS total_vested FROM vesting_schedules WHERE LOWER(beneficiary) = LOWER(?) AND status = 'active'",
                    [address]
                ),
                // Crypto totals (BNB, USDT/USDC)
                fastify.mysql.query(
                    "SELECT payment_type, COALESCE(SUM(CAST(crypto_value AS DECIMAL(36,18))), 0) AS total FROM ico_purchases WHERE LOWER(address) = LOWER(?) AND status = 'success' GROUP BY payment_type",
                    [address]
                )
            ]);

            const cryptoTotals = {};
            (purchaseRows || []).forEach(r => {
                cryptoTotals[r.payment_type] = r.total;
            });

            // On-chain Trustive Balance
            let onChainBalance = '0';
            try {
                const trustiveTokenAddress = process.env.TRUSTIVE_TOKEN_ADDRESS || '0xe12F60d7c0bc493b033c789Aa533E772541041eA';
                const provider = await getWorkingProvider();
                const contract = new ethers.Contract(trustiveTokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
                const val = await contract.balanceOf(address);
                onChainBalance = ethers.formatEther(val);
            } catch (err) {
                console.error('On-chain balance fetch failed:', err.message);
                onChainBalance = balanceRows[0]?.balance || 0; // fallback to db sum
            }

            // Query referral bonus
            let referralBonus = '0';
            try {
                const [refRows] = await fastify.mysql.query(
                    "SELECT COALESCE(SUM(CAST(referrer_bonus AS DECIMAL(36,18))), 0) AS ref_bonus FROM ico_purchases WHERE LOWER(referrer_address) = LOWER(?) AND status = 'success'",
                    [address]
                );
                referralBonus = parseFloat(refRows[0]?.ref_bonus || 0).toString();
            } catch (_) { }

            return reply.send({
                status: true,
                stats: {
                    balance: onChainBalance,
                    total_vested: vestingRows[0]?.total_vested || 0,
                    total_bnb: parseFloat(cryptoTotals['BNB'] || 0).toString(),
                    total_usdt: (parseFloat(cryptoTotals['USDT'] || 0) + parseFloat(cryptoTotals['USDC'] || 0)).toString(),
                    unclaimed_boxes: 0, // Placeholder
                    nft_assets: 0,      // Placeholder
                    referral_bonus: referralBonus,
                    profile_pic: userRows[0]?.profile_pic || null
                }
            });
        } catch (err) {
            console.error('Error in /user-profile/:address:', err);
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    // ========================================
    // Sales CRUD
    // ========================================
    fastify.get('/getActiveSales', async (req, res) => {
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
            return res.send({ status: true, sale });
        } catch (err) {
            return res.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    fastify.get('/getAllActiveSales', async (req, res) => {
        try {
            await updateSaleStatuses(fastify.mysql);
            const [rows] = await fastify.mysql.query(`
                SELECT ts.*,
                CASE
                    WHEN UTC_TIMESTAMP() BETWEEN ts.start_at AND ts.end_at THEN 'active'
                    WHEN UTC_TIMESTAMP() < ts.start_at THEN 'scheduled'
                    ELSE 'ended'
                END AS computed_status,
                (
                    SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(30,8))), 0)
                    FROM ico_purchases
                    WHERE status IN ('success', 'paid')
                      AND (created_at BETWEEN ts.start_at AND ts.end_at)
                ) as total_tokens_sold
                FROM token_sales ts
                ORDER BY ts.created_at DESC;
            `);

            const normalizedSales = Array.isArray(rows) ? rows : (rows ? [rows] : []);
            const salesWithTotals = normalizedSales.map((sale) => {
                const sold = sale.computed_status === 'scheduled' ? 0 : parseFloat(sale.total_tokens_sold || 0);
                return {
                    ...sale,
                    total_tokens_sold: sold,
                    available_tokens: Math.max(0, Number(sale.token_quantity || 0) - sold),
                    start_at_utc: toUtcISOString(sale.start_at),
                    end_at_utc: toUtcISOString(sale.end_at),
                };
            });

            const [globalRows] = await fastify.mysql.query(
                "SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(30,8))), 0) AS global_sold FROM ico_purchases WHERE status IN ('success', 'paid')"
            );
            const globalSold = parseFloat(globalRows[0]?.global_sold || 0);
            const icoBalance = await getICOContractBalance();

            return res.send({ status: true, sales: salesWithTotals, global_sold: globalSold, ico_balance: icoBalance });
        } catch (err) {
            return res.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    fastify.post("/createSale", async (req, res) => {
        try {
            const { name, quantity, minimum, maximum, start_at, end_at } = req.body;
            const type = req.body.type || 'PRESALE';
            if (!name || !quantity || !minimum || !maximum || !start_at || !end_at) {
                return res.send({ status: false, msg: "All fields are required" });
            }

            const minNum = parseFloat(minimum);
            const maxNum = parseFloat(maximum);
            const requestedQty = parseFloat(quantity);

            if (isNaN(minNum) || minNum <= 0) {
                return res.send({ status: false, msg: "Minimum purchase must be greater than 0" });
            }
            if (isNaN(maxNum) || maxNum <= minNum) {
                return res.send({ status: false, msg: "Maximum purchase must be greater than minimum purchase" });
            }
            if (isNaN(requestedQty) || requestedQty <= 0) {
                return res.send({ status: false, msg: "Invalid token allocation amount" });
            }
            if (minNum > requestedQty) {
                return res.send({ status: false, msg: `Minimum purchase (${minNum.toLocaleString()} Trustive) cannot exceed phase allocation (${requestedQty.toLocaleString()} Trustive)` });
            }
            if (maxNum > requestedQty) {
                return res.send({ status: false, msg: `Maximum purchase (${maxNum.toLocaleString()} Trustive) cannot exceed phase allocation (${requestedQty.toLocaleString()} Trustive)` });
            }
            if (new Date(start_at) >= new Date(end_at)) {
                return res.send({ status: false, msg: "End date & time must be after start date & time" });
            }

            // Check against live ICO contract token balance
            const contractBal = await getICOContractBalance();
            if (contractBal !== null && requestedQty > contractBal) {
                return res.send({
                    status: false,
                    msg: `Allocated tokens (${requestedQty.toLocaleString()} Trustive) cannot exceed the available tokens in the ICO contract (${contractBal.toLocaleString(undefined, { maximumFractionDigits: 4 })} Trustive).`
                });
            }

            // Fetch current price from contract instead of body
            let price = await getOnChainTokenPrice();
            if (price === null) price = 0; // Fallback or handle error

            const mysqlStartAt = formatForMySQL(start_at);
            const mysqlEndAt = formatForMySQL(end_at);

            // Guard against duplicate rapid submissions
            const [existing] = await fastify.mysql.query(
                "SELECT id FROM token_sales WHERE name = ? AND start_at = ? LIMIT 1",
                [name, mysqlStartAt]
            );
            if (existing && existing.length > 0) {
                return res.send({ status: false, msg: "A phase with this name and start time already exists" });
            }

            await fastify.mysql.query(
                `INSERT INTO token_sales (type, name, token_quantity, price, minimum_purchase, maximum_purchase, start_at, end_at, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? <= UTC_TIMESTAMP() AND ? >= UTC_TIMESTAMP() THEN 'active' ELSE 'scheduled' END)`,
                [type, name, quantity, price, minimum, maximum, mysqlStartAt, mysqlEndAt, mysqlStartAt, mysqlEndAt]
            );
            await updateSaleStatuses(fastify.mysql);
            return res.send({ status: true, msg: "Sale created successfully", price });
        } catch (err) {
            console.error('createSale error:', err);
            return res.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    fastify.post("/updateSale", async (req, res) => {
        try {
            const { id, name, quantity, minimum, maximum, start_at, end_at, status, price } = req.body;
            const type = req.body.type || 'PRESALE';
            if (!id || !name || quantity === undefined || !minimum || !maximum || !start_at || !end_at) {
                return res.send({ status: false, msg: "All fields are required" });
            }

            const minNum = parseFloat(minimum);
            const maxNum = parseFloat(maximum);
            const requestedQty = parseFloat(quantity);

            if (isNaN(minNum) || minNum <= 0) {
                return res.send({ status: false, msg: "Minimum purchase must be greater than 0" });
            }
            if (isNaN(maxNum) || maxNum <= minNum) {
                return res.send({ status: false, msg: "Maximum purchase must be greater than minimum purchase" });
            }
            if (isNaN(requestedQty) || requestedQty <= 0) {
                return res.send({ status: false, msg: "Invalid token allocation amount" });
            }
            if (minNum > requestedQty) {
                return res.send({ status: false, msg: `Minimum purchase (${minNum.toLocaleString()} Trustive) cannot exceed phase allocation (${requestedQty.toLocaleString()} Trustive)` });
            }
            if (maxNum > requestedQty) {
                return res.send({ status: false, msg: `Maximum purchase (${maxNum.toLocaleString()} Trustive) cannot exceed phase allocation (${requestedQty.toLocaleString()} Trustive)` });
            }
            if (new Date(start_at) >= new Date(end_at)) {
                return res.send({ status: false, msg: "End date & time must be after start date & time" });
            }

            // Check if sale has already ended
            const [existingRows] = await fastify.mysql.query(
                `SELECT *, CASE WHEN UTC_TIMESTAMP() > end_at THEN 'ended' ELSE status END AS computed_status FROM token_sales WHERE id = ?`,
                [id]
            );
            if (existingRows && existingRows.length > 0) {
                if (existingRows[0].status === 'ended' || existingRows[0].computed_status === 'ended') {
                    return res.send({ status: false, msg: "Cannot edit a sale phase that has already ended" });
                }
            }

            // Check against live ICO contract token balance
            const contractBal = await getICOContractBalance();
            if (contractBal !== null && requestedQty > contractBal) {
                return res.send({
                    status: false,
                    msg: `Allocated tokens (${requestedQty.toLocaleString()} Trustive) cannot exceed the available tokens in the ICO contract (${contractBal.toLocaleString(undefined, { maximumFractionDigits: 4 })} Trustive).`
                });
            }

            const mysqlStartAt = formatForMySQL(start_at);
            const mysqlEndAt = formatForMySQL(end_at);

            await fastify.mysql.query(
                `UPDATE token_sales
                 SET type = ?, name = ?, token_quantity = ?, minimum_purchase = ?, maximum_purchase = ?, price = ?, start_at = ?, end_at = ?, status = ?
                 WHERE id = ?`,
                [type, name, quantity, minimum, maximum, price, mysqlStartAt, mysqlEndAt, status, id]
            );
            await updateSaleStatuses(fastify.mysql);
            return res.send({ status: true, msg: "Sale updated successfully" });
        } catch (err) {
            return res.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    // POST /forceStopSale — Immediately end an active sale phase and promote scheduled sales
    const forceStopSaleHandler = async (req, res) => {
        try {
            const { id } = req.body;
            if (!id) return res.send({ status: false, msg: "Sale ID is required" });

            await fastify.mysql.query(
                `UPDATE token_sales 
                 SET status = 'ended', end_at = UTC_TIMESTAMP() 
                 WHERE id = ?`,
                [id]
            );

            // Promote any scheduled sales whose start time has arrived
            await updateSaleStatuses(fastify.mysql);

            return res.send({ status: true, msg: "Sale phase stopped immediately" });
        } catch (err) {
            console.error('Error in /forceStopSale:', err);
            return res.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    };

    fastify.post("/forceStopSale", forceStopSaleHandler);
    fastify.post("/stopSale", forceStopSaleHandler);

    fastify.get('/getSaledata/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const [rows] = await fastify.mysql.query(`SELECT * FROM token_sales WHERE id = ? LIMIT 1`, [id]);
            if (!rows || rows.length === 0) return res.code(404).send({ status: false, msg: 'Sale not found' });
            const sale = rows[0];
            const [soldRows] = await fastify.mysql.query(
                `SELECT COALESCE(SUM(CAST(ptc_tokens AS DECIMAL(30,8))), 0) AS total_tokens_sold
                 FROM ico_purchases WHERE status IN ('success', 'paid') AND (created_at BETWEEN ? AND ?)`,
                [sale.start_at, sale.end_at]
            );
            const totalSoldValue = parseFloat(soldRows[0]?.total_tokens_sold || 0);
            return res.send({
                status: true,
                sale: {
                    ...sale,
                    total_tokens_sold: totalSoldValue,
                    start_at_utc: toUtcISOString(sale.start_at),
                    end_at_utc: toUtcISOString(sale.end_at)
                }
            });
        } catch (err) {
            return res.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    fastify.delete("/deleteSale/:id", async (req, reply) => {
        try {
            const id = req.params.id;
            const [rows] = await fastify.mysql.query(
                "SELECT id, start_at, end_at, status FROM token_sales WHERE id = ? LIMIT 1",
                [id]
            );
            if (!rows || rows.length === 0) {
                return reply.send({ status: false, msg: "Sale not found" });
            }

            const sale = rows[0];
            const now = new Date();
            const start = new Date(sale.start_at);
            const end = new Date(sale.end_at);
            const isActive = (sale.status === 'active') || (start <= now && now <= end);

            if (isActive) {
                return reply.send({ status: false, msg: "Cannot delete an active sale phase while it is live" });
            }

            await fastify.mysql.query("DELETE FROM token_sales WHERE id = ?", [id]);
            await updateSaleStatuses(fastify.mysql);
            return { status: true, msg: "Sale deleted successfully" };
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Failed to delete sale" });
        }
    });

    fastify.post("/deleteSale", async (req, reply) => {
        try {
            const { id } = req.body;
            if (!id) return reply.code(400).send({ status: false, msg: "Sale ID required" });

            const [rows] = await fastify.mysql.query(
                "SELECT id, start_at, end_at, status FROM token_sales WHERE id = ? LIMIT 1",
                [id]
            );
            if (!rows || rows.length === 0) {
                return reply.send({ status: false, msg: "Sale not found" });
            }

            const sale = rows[0];
            const now = new Date();
            const start = new Date(sale.start_at);
            const end = new Date(sale.end_at);
            const isActive = (sale.status === 'active') || (start <= now && now <= end);

            if (isActive) {
                return reply.send({ status: false, msg: "Cannot delete an active sale phase while it is live" });
            }

            await fastify.mysql.query("DELETE FROM token_sales WHERE id = ?", [id]);
            await updateSaleStatuses(fastify.mysql);
            return reply.send({ status: true, msg: "Sale deleted successfully" });
        } catch (err) {
            console.error('deleteSale POST error:', err);
            return reply.code(500).send({ status: false, msg: "Failed to delete sale" });
        }
    });

    // ========================================
    // Transaction Details (Admin)
    // ========================================
    fastify.get('/getTransactionDetails', async (request, reply) => {
        try {
            syncIcoPurchasesFromChain(fastify.mysql).catch(() => {});
            const [rows] = await fastify.mysql.query(`
                SELECT ip.id, ip.address, ip.crypto_value, ip.payment_type, ip.ptc_tokens, ip.trans_hash, ip.usd_value_of_crypto, ip.sale_type, ip.status, ip.created_at, u.name as username
                FROM ico_purchases ip
                LEFT JOIN users u ON LOWER(ip.address) = LOWER(u.wallet_address COLLATE utf8mb4_unicode_ci)
                ORDER BY ip.created_at DESC
            `);
            return reply.send({ status: true, transactions: rows });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    fastify.post('/cancelPurchase', async (request, reply) => {
        try {
            const { id } = request.body;
            if (!id) return reply.send({ status: false, msg: "Purchase ID required" });

            const [result] = await fastify.mysql.query(
                "UPDATE ico_purchases SET status = 'canceled' WHERE id = ?",
                [id]
            );

            if (result.affectedRows === 0) {
                return reply.send({ status: false, msg: "Purchase not found" });
            }

            return reply.send({ status: true, msg: "Purchase canceled successfully" });
        } catch (err) {
            console.error('cancelPurchase error:', err);
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    // ========================================
    // Settings
    // ========================================
    fastify.get("/settings", async (request, reply) => {
        const [rows] = await fastify.mysql.query("SELECT * FROM settings LIMIT 1");
        if (!rows || rows.length === 0) return reply.send({ status: false, msg: "No settings found" });
        // The password hash and the TOTP secret have no business in a settings
        // payload: handing the secret out would let a reader mint valid codes.
        const { admin_password, admin_two_fa_secret, ...safe } = rows[0];
        return reply.send({ status: true, data: safe });
    });

    fastify.post("/updateSettings", async (request, reply) => {
        try {
            const data = request.body || {};

            const saveFileFromBase64 = (base64DataUrl, destDir, filenamePrefix) => {
                if (!base64DataUrl || typeof base64DataUrl !== "string") return null;
                const matches = base64DataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
                if (!matches) return null;
                const b64 = matches[2];
                const mime = matches[1];
                const ext = mime.split("/")[1] || "bin";
                const filename = `${filenamePrefix}_${Date.now()}.${ext}`;
                const absDir = path.resolve(__dirname, destDir);
                fs.mkdirSync(absDir, { recursive: true });
                const absPath = path.join(absDir, filename);
                fs.writeFileSync(absPath, Buffer.from(b64, "base64"));
                return `/uploads/${filename}`;
            };

            const [rows] = await fastify.mysql.query("SELECT * FROM settings LIMIT 1");
            const existing = (rows && rows.length > 0) ? rows[0] : null;

            const updateData = {};

            if (data.site_logo?.startsWith("data:")) updateData.site_logo = saveFileFromBase64(data.site_logo, "../../public/uploads", "site_logo");
            if (data.whitepaper?.startsWith("data:")) updateData.whitepaper = saveFileFromBase64(data.whitepaper, "../../public/uploads", "whitepaper");
            if (data.token_logo?.startsWith("data:")) updateData.token_logo = saveFileFromBase64(data.token_logo, "../../public/uploads", "token_logo");

            const allowedFields = [
                'site_name', 'owner_address', 'kyc_enabled',
                'token_name', 'token_symbol', 'chain', 'token_decimal',
                'contract_address', 'crypto_decimal', 'fiat_decimal',
                'ico_contract', 'usdt_address', 'usdc_address', 'bnb_address',
                'vesting_contract',
                'moonpay_enabled', 'moonpay_api_key', 'moonpay_secret_key', 'moonpay_environment',
                'admin_email', 'admin_password'
            ];

            allowedFields.forEach(f => {
                if (data[f] !== undefined && data[f] !== null) {
                    updateData[f] = data[f];
                }
            });

            // The form leaves this blank to keep the current password; anything
            // typed is stored hashed, never as given.
            if (typeof updateData.admin_password === 'string') {
                const typed = updateData.admin_password.trim();
                if (!typed) {
                    delete updateData.admin_password;
                } else {
                    const invalid = validateAdminPassword(typed);
                    if (invalid) return reply.send({ status: false, msg: invalid });
                    updateData.admin_password = await bcrypt.hash(typed, 10);
                }
            }

            if (Object.keys(updateData).length === 0) {
                return reply.send({ status: true, msg: "No changes detected" });
            }

            if (existing) {
                const keys = Object.keys(updateData);
                const sql = `UPDATE settings SET ${keys.map(k => `\`${k}\` = ?`).join(', ')} WHERE id = ?`;
                const params = [...keys.map(k => updateData[k]), existing.id];
                await fastify.mysql.query(sql, params);
            } else {
                const keys = Object.keys(updateData);
                const sql = `INSERT INTO settings (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
                const params = keys.map(k => updateData[k]);
                await fastify.mysql.query(sql, params);
            }

            return reply.send({ status: true, msg: "Settings updated successfully" });
        } catch (err) {
            console.error('CRITICAL UPDATE ERROR:', err);
            return reply.code(500).send({ status: false, msg: "Error updating settings: " + err.message });
        }
    });

    // ========================================
    // Token Price
    // ========================================
    fastify.post("/updateTokenPrice", async (req, res) => {
        try {
            let { price, tx_hash } = req.body || {};
            if (!price) price = req.query?.price;
            if (!price) return res.code(400).send({ status: false, msg: "Price is required" });

            const [saleRows] = await fastify.mysql.query("SELECT price FROM token_sales WHERE status = 'active' LIMIT 1");
            const activeSale = saleRows[0];
            const oldPrice = activeSale?.price || "0";

            const updateResult = await fastify.mysql.query("UPDATE token_sales SET price = ? WHERE status = 'active'", [price]);
            if (updateResult && updateResult.affectedRows === 0) {
                await fastify.mysql.query("UPDATE token_sales SET price = ? ORDER BY id DESC LIMIT 1", [price]);
            }

            await fastify.mysql.query(
                `INSERT INTO payment_settings_history (setting_key, old_value, new_value, changed_by, transaction_hash) VALUES (?, ?, ?, ?, ?)`,
                ['token_price', String(oldPrice || '0'), String(price), 'Admin', tx_hash || null]
            );

            return res.send({ status: true, msg: "Price Updated Successfully" });
        } catch (err) {
            return res.code(500).send({ status: false, msg: "Error updating price: " + err.message });
        }
    });

    // ========================================
    // Payment Settings
    // ========================================
    fastify.get("/payment-settings", async (request, reply) => {
        try {
            const [rows] = await fastify.mysql.query("SELECT ico_contract, usdt_address, usdc_address, bnb_address, vesting_contract, referral_contract, referral_level1, moonpay_enabled, moonpay_api_key, moonpay_secret_key, moonpay_environment FROM settings LIMIT 1");
            const settings = rows[0] || {};

            // Fetch live Referral Contract balance
            let referralContractBalance = '0';
            try {
                const refContractAddr = settings.referral_contract || '0x66ae3C6846C0a340936B127BBBec4f3FC2C08935';
                const tokenAddr = process.env.TRUSTIVE_TOKEN_ADDRESS || '0xe12F60d7c0bc493b033c789Aa533E772541041eA';
                const provider = await getWorkingProvider();
                const tokenContract = new ethers.Contract(tokenAddr, ['function balanceOf(address) view returns (uint256)'], provider);
                const bal = await tokenContract.balanceOf(refContractAddr);
                referralContractBalance = ethers.formatEther(bal);
            } catch (balErr) {
                console.warn('Error fetching referral contract balance:', balErr.message);
            }

            // Fetch current active token sale price matching user dashboard
            await updateSaleStatuses(fastify.mysql);
            const [activeSaleRows] = await fastify.mysql.query(`
                SELECT price FROM token_sales 
                WHERE status = 'active' OR (UTC_TIMESTAMP() BETWEEN start_at AND end_at)
                ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, start_at DESC 
                LIMIT 1
            `);
            let activePrice = activeSaleRows[0]?.price ? parseFloat(activeSaleRows[0].price) : null;
            if (activePrice === null || isNaN(activePrice)) {
                const [latestSale] = await fastify.mysql.query("SELECT price FROM token_sales ORDER BY id DESC LIMIT 1");
                activePrice = latestSale[0]?.price ? parseFloat(latestSale[0].price) : null;
            }
            if (activePrice === null || isNaN(activePrice)) {
                activePrice = await getOnChainTokenPrice();
            }

            const tokensPerUsd = (activePrice && activePrice > 0) ? (1 / activePrice) : null;
            return reply.send({
                status: true,
                settings,
                referral_contract_balance: referralContractBalance,
                current_price: {
                    usd_per_token: activePrice,
                    tokens_per_usd: tokensPerUsd
                }
            });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    fastify.post("/payment-settings", async (request, reply) => {
        try {
            const data = request.body;
            const [rows] = await fastify.mysql.query("SELECT * FROM settings LIMIT 1");
            const existing = rows[0];
            const oldData = existing || {};

            if (existing) {
                await fastify.mysql.query(
                    "UPDATE settings SET ico_contract = ?, usdt_address = ?, usdc_address = ?, bnb_address = ?, vesting_contract = ?, referral_contract = ?, referral_level1 = ?, moonpay_enabled = ?, moonpay_api_key = ?, moonpay_secret_key = ?, moonpay_environment = ? WHERE id = ?",
                    [
                        data.ico_contract, data.usdt_address, data.usdc_address, data.bnb_address, data.vesting_contract,
                        data.referral_contract !== undefined ? data.referral_contract : existing.referral_contract,
                        data.referral_level1 !== undefined ? data.referral_level1 : existing.referral_level1,
                        data.moonpay_enabled !== undefined ? (data.moonpay_enabled ? 1 : 0) : existing.moonpay_enabled,
                        data.moonpay_api_key !== undefined ? data.moonpay_api_key : existing.moonpay_api_key,
                        data.moonpay_secret_key !== undefined ? data.moonpay_secret_key : existing.moonpay_secret_key,
                        data.moonpay_environment !== undefined ? data.moonpay_environment : existing.moonpay_environment,
                        existing.id
                    ]
                );
            } else {
                await fastify.mysql.query(
                    "INSERT INTO settings (ico_contract, usdt_address, usdc_address, bnb_address, vesting_contract, referral_contract, referral_level1, moonpay_enabled, moonpay_api_key, moonpay_secret_key, moonpay_environment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        data.ico_contract, data.usdt_address, data.usdc_address, data.bnb_address, data.vesting_contract,
                        data.referral_contract || '0x66ae3C6846C0a340936B127BBBec4f3FC2C08935',
                        data.referral_level1 || 5.00,
                        data.moonpay_enabled !== undefined ? (data.moonpay_enabled ? 1 : 0) : 1,
                        data.moonpay_api_key || 'pk_test_123',
                        data.moonpay_secret_key || null,
                        data.moonpay_environment || 'sandbox'
                    ]
                );
            }

            const keys = ['ico_contract', 'usdt_address', 'usdc_address', 'bnb_address', 'vesting_contract', 'referral_contract', 'referral_level1', 'moonpay_enabled', 'moonpay_api_key', 'moonpay_secret_key', 'moonpay_environment'];
            for (const key of keys) {
                if (data[key] !== undefined && data[key] !== oldData[key]) {
                    await fastify.mysql.query(
                        `INSERT INTO payment_settings_history (setting_key, old_value, new_value, changed_by) VALUES (?, ?, ?, ?)`,
                        [key, String(oldData[key] !== undefined ? oldData[key] : 'NULL'), String(data[key]), 'Admin']
                    );
                }
            }

            return reply.send({ status: true, msg: "Settings updated" });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    fastify.get('/getPaymentSettingsHistory', async (request, reply) => {
        try {
            const [records] = await fastify.mysql.query('SELECT * FROM payment_settings_history ORDER BY timestamp DESC LIMIT 20');
            return reply.send({ status: true, data: records });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    // ========================================
    // Withdraw History
    // ========================================
    fastify.get('/getWithdrawHistory', async (req, res) => {
        try {
            await fastify.mysql.query(`CREATE TABLE IF NOT EXISTS admin_withdraw (
                id INT AUTO_INCREMENT PRIMARY KEY,
                to_address VARCHAR(255) NOT NULL,
                coin VARCHAR(50) NOT NULL,
                amount DECIMAL(36,18) NOT NULL,
                tx_hash VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`).catch(() => { });

            const [results] = await fastify.mysql.query('SELECT * FROM admin_withdraw ORDER BY created_at DESC');
            const normalized = Array.isArray(results) ? results.map(r => ({ ...r, amount: r.amount.toString(), created_at: toUtcISOString(r.created_at) })) : [];
            return res.send({ status: true, data: normalized });
        } catch (err) {
            return res.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    fastify.post('/createWithdraw', async (req, res) => {
        try {
            const { to_address, coin, amount, tx_hash } = req.body;
            if (!to_address || !coin || !amount || !tx_hash) {
                return res.send({ status: false, msg: "All fields are required" });
            }
            await fastify.mysql.query(
                'INSERT INTO admin_withdraw (to_address, coin, amount, tx_hash) VALUES (?, ?, ?, ?)',
                [to_address, coin, amount.replace(/,/g, ''), tx_hash]
            );
            return res.send({ status: true, msg: "Withdrawal recorded successfully" });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.send({ status: true, msg: "Withdrawal already recorded" });
            }
            return res.code(500).send({ status: false, msg: "Internal Server Error" });
        }
    });

    // ========================================
    // Fetch & Sync On-Chain Price
    // ========================================
    fastify.get('/fetchAndUpdatePrice', async (req, res) => {
        try {
            const priceFloat = await getOnChainTokenPrice();
            if (priceFloat === null) return res.code(400).send({ status: false, msg: 'Sync failed: could not fetch price' });

            await fastify.mysql.query("UPDATE token_sales SET price = ? WHERE status = 'active'", [priceFloat]);
            return res.send({ status: true, msg: 'Price synced', price: priceFloat });
        } catch (err) {
            return res.code(500).send({ status: false, msg: 'Sync failed', error: err.message });
        }
    });

    // ========================================
    // Vesting - Admin Routes
    // ========================================
    const vestingFs = require('fs');
    const vestingPath = require('path');
    // Vesting uses the same centralized RPC provider with failover
    // (no static provider – avoids stale connection errors)

    // Ensure vesting table exists
    await fastify.mysql.query(`CREATE TABLE IF NOT EXISTS vesting_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY, beneficiary VARCHAR(255) NOT NULL,
        total_amount VARCHAR(255) NOT NULL, cliff_months INT NOT NULL,
        vesting_months INT NOT NULL, start_at DATETIME NOT NULL,
        tx_hash VARCHAR(255), vesting_index INT DEFAULT 0,
        status ENUM('active','revoked') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`).catch(() => { });

    // Stop a lagging RPC read from filing two schedules under one vesting index.
    // The duplicates already in the table are cleared by
    // scripts/fix_vesting_duplicates.js, which also adds this key.
    try {
        const [vestIdx] = await fastify.mysql.query("SHOW INDEX FROM vesting_schedules");
        const hasKey = vestIdx.some(i => (i.Key_name || i.key_name) === 'unique_beneficiary_index');
        if (!hasKey) {
            await fastify.mysql.query("ALTER TABLE vesting_schedules ADD UNIQUE KEY unique_beneficiary_index (beneficiary, vesting_index)");
            console.log("Added unique_beneficiary_index to vesting_schedules");
        }
    } catch (err) {
        // Fails while duplicates remain — run scripts/fix_vesting_duplicates.js --apply
        console.error("vesting_schedules unique key migration error:", err.message);
    }

    async function getVestingContract() {
        const addr = process.env.VESTING_CONTRACT_ADDRESS || '0x393858957f0193b6aC9781f8b033E9196e37bdd4';
        const abi = JSON.parse(vestingFs.readFileSync(vestingPath.join(__dirname, "../abi's/vesting.json"), 'utf8'));
        const provider = await getProvider();
        return new ethers.Contract(addr, abi, provider);
    }

    fastify.get('/vestings', async (request, reply) => {
        try {
            const page = parseInt(request.query.page) || 1;
            const limit = parseInt(request.query.limit) || 10;
            const search = request.query.search || '';
            const offset = (page - 1) * limit;
            let countQuery = "SELECT COUNT(*) as total FROM vesting_schedules vs";
            let dataQuery = `
                SELECT vs.*, u.name as username
                FROM vesting_schedules vs
                LEFT JOIN users u ON LOWER(vs.beneficiary) = LOWER(u.wallet_address) COLLATE utf8mb4_general_ci
            `;
            const queryParams = [];
            let whereClauses = [];

            if (search) {
                whereClauses.push("(LOWER(vs.beneficiary) LIKE LOWER(?) OR LOWER(vs.tx_hash) LIKE LOWER(?))");
                queryParams.push(`%${search}%`, `%${search}%`);
            }

            if (whereClauses.length > 0) {
                const combined = " WHERE " + whereClauses.join(" AND ");
                countQuery += combined;
                dataQuery += combined;
            }
            dataQuery += " ORDER BY vs.start_at DESC LIMIT ? OFFSET ?";
            const countParams = [...queryParams];
            queryParams.push(limit, offset);
            const [countResult] = await fastify.mysql.query(countQuery, countParams);
            const totalPages = Math.ceil(((countResult[0]?.total) || 0) / limit);
            const [rows] = await fastify.mysql.query(dataQuery, queryParams);
            const vestings = Array.isArray(rows) ? rows : [];
            console.log(`Admin Vesting Request: Found ${vestings.length} records in DB`);

            // Per-period claim receipts, so the admin detail view can show the
            // same breakdown the user sees
            const [claimRows] = await fastify.mysql.query(
                "SELECT beneficiary, vesting_index, period_index, amount, tx_hash, created_at FROM vesting_claims ORDER BY period_index ASC"
            ).catch(() => [[]]);
            const claimsByKey = new Map();
            for (const c of (claimRows || [])) {
                const key = `${c.beneficiary.toLowerCase()}:${c.vesting_index}`;
                if (!claimsByKey.has(key)) claimsByKey.set(key, []);
                claimsByKey.get(key).push({
                    period_index: c.period_index,
                    amount: c.amount,
                    tx_hash: c.tx_hash,
                    created_at: toUtcISOString(c.created_at)
                });
            }
            const contract = await getVestingContract();
            const processed = await Promise.all(vestings.map(async (v) => {
                const index = v.vesting_index !== null ? v.vesting_index : 0;
                const cacheKey = `v_${v.beneficiary}_${index}`;
                let onChainDetails = null;
                let displayStatus = 'successful';
                try {
                    // Short timeout for list view calls
                    const details = await getCachedCall(cacheKey, async () => {
                        return await Promise.race([
                            contract.getVestingDetails(v.beneficiary, index),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                        ]);
                    });
                    const rowClaimed = parseFloat(ethers.formatEther(details.claimedAmount));
                    const total = parseFloat(ethers.formatEther(details.totalAmount));
                    const rowClaimable = parseFloat(ethers.formatEther(details.claimableNow));
                    const cliffRemaining = Number(details.cliffRemaining);
                    if (rowClaimed >= (total - 0.0001) && total > 0) displayStatus = 'claimed';
                    else if (rowClaimable > 0) displayStatus = 'claimable';
                    else if (cliffRemaining > 0) displayStatus = 'cliff';
                    else displayStatus = 'locked';
                    onChainDetails = {
                        totalAmount: total.toString(), claimedAmount: rowClaimed.toString(),
                        remainingToClaim: ethers.formatEther(details.remainingToClaim),
                        claimableNow: rowClaimable.toString(), cliffRemaining: cliffRemaining.toString(),
                        vestingRemaining: details.vestingRemaining.toString(), cliffMonths: details.cliffMonths.toString(),
                        vestingMonths: details.vestingMonths.toString(), startTimestamp: details.startTimestamp.toString(),
                        monthsElapsed: details.monthsElapsed.toString()
                    };

                    try {
                        const info = await getCachedCall(`p_${v.beneficiary}_${index}`, async () => contract.getPeriodInfo(v.beneficiary, index));
                        onChainDetails.claimedPeriods = info.claimedPeriods.toString();
                        onChainDetails.unlockedPeriods = info.unlockedPeriods.toString();
                        onChainDetails.claimablePeriods = info.claimablePeriods.toString();
                    } catch (e) { /* older schedules, fall back to deriving it */ }
                } catch (e) {
                    displayStatus = v.status === 'active' ? 'successful' : 'revoked';
                }
                return {
                    ...v, index, details: onChainDetails,
                    claims: claimsByKey.get(`${v.beneficiary.toLowerCase()}:${index}`) || [],
                    start_at: toUtcISOString(v.start_at), created_at: toUtcISOString(v.created_at),
                    display_status: displayStatus
                };
            }));
            processed.sort((a, b) => new Date(b.start_at) - new Date(a.start_at));
            return reply.send({ status: true, vestings: processed, totalPages, currentPage: page });
        } catch (err) {
            console.error('Error fetching vestings:', err);
            return reply.code(500).send({ status: false, msg: 'Internal Server Error: ' + err.message });
        }
    });

    fastify.get('/vesting/sync', async (request, reply) => {
        try {
            const contract = await getVestingContract();
            const [users] = await fastify.mysql.query("SELECT wallet_address FROM users WHERE wallet_address IS NOT NULL AND wallet_address != ''");

            let syncCount = 0;
            const userList = Array.isArray(users) ? users : [];

            for (const user of userList) {
                const addr = user.wallet_address;
                try {
                    const count = Number(await contract.getVestingCount(addr));
                    for (let i = 0; i < count; i++) {
                        const details = await contract.getVestingDetails(addr, i);

                        // Check if already in DB
                        const [rows] = await fastify.mysql.query(
                            "SELECT id, status, tx_hash FROM vesting_schedules WHERE beneficiary = ? AND vesting_index = ?",
                            [addr, i]
                        );
                        const existing = rows && rows.length > 0 ? rows[0] : null;

                        const totalAmount = ethers.formatEther(details.totalAmount);
                        const cliffMonths = Number(details.cliffMonths);
                        const vestingMonths = Number(details.vestingMonths);
                        const startAt = new Date(Number(details.startTimestamp) * 1000);

                        if (!existing) {
                            // Fetch real hash from events if possible
                            let bestHash = null;
                            try {
                                const filter = contract.filters.TokenVested(addr);
                                // Look back 20,000 blocks (~16 hours on BSC) to find the creation event
                                const events = await contract.queryFilter(filter, -20000);
                                if (events && events.length > i) {
                                    bestHash = events[i].transactionHash;
                                } else if (events && events.length > 0) {
                                    bestHash = events[events.length - 1].transactionHash;
                                }
                            } catch (e) { }

                            await fastify.mysql.query(
                                "INSERT IGNORE INTO vesting_schedules (beneficiary, total_amount, cliff_months, vesting_months, start_at, tx_hash, vesting_index, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')",
                                [addr, totalAmount, cliffMonths, vestingMonths, startAt, bestHash, i]
                            );
                            syncCount++;
                        } else {
                            // Update status if it was revoked or missing
                            if (existing.status === 'revoked' || !existing.tx_hash || existing.tx_hash === 'HIDDEN_RECORD' || existing.tx_hash === 'SYSTEM-SYNC' || existing.tx_hash === 'ON-CHAIN-SYNC' || existing.tx_hash === 'ON-CHAIN' || existing.tx_hash === 'SYNCED') {
                                const fields = ["status = 'active'", "total_amount = ?", "start_at = ?"];
                                const params = [totalAmount, startAt];
                                if (bestHash) {
                                    fields.push("tx_hash = ?");
                                    params.push(bestHash);
                                }
                                params.push(existing.id);
                                await fastify.mysql.query(
                                    `UPDATE vesting_schedules SET ${fields.join(', ')} WHERE id = ?`,
                                    params
                                );
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error syncing for ${addr}:`, e.message);
                }
            }

            return reply.send({ status: true, msg: `Synchronized ${syncCount} new records from blockchain.` });
        } catch (err) {
            console.error('Global vesting sync error:', err);
            return reply.code(500).send({ status: false, msg: 'Sync failed: ' + err.message });
        }
    });

    fastify.get('/vesting/settings', async (request, reply) => {
        try {
            const vestingAddr = process.env.VESTING_CONTRACT_ADDRESS || '0x393858957f0193b6aC9781f8b033E9196e37bdd4';
            const VESTING_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/vesting.json"), 'utf8'));
            const provider = await getWorkingProvider();
            const contract = new ethers.Contract(vestingAddr, VESTING_ABI, provider);

            const multipleEnabled = await contract.multipleVesting();
            const maxLimit = await contract.maxVestingLimit();

            return reply.send({ status: true, multipleVesting: multipleEnabled, maxLimit: maxLimit.toString() });
        } catch (err) {
            return reply.send({ status: false, multipleVesting: false, maxLimit: '0' });
        }
    });

    // POST /vesting/toggle-multiple  (legacy route name)
    // POST /vesting/settings/toggle  (canonical route name — admin frontend uses this)
    const _vestingToggleHandler = async (request, reply) => {
        try {
            const { enabled } = request.body;
            if (typeof enabled !== 'boolean')
                return reply.send({ status: false, msg: "enabled must be boolean" });
            const VESTING_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/vesting.json"), 'utf8'));
            const iface = new ethers.Interface(VESTING_ABI);
            const calldata = iface.encodeFunctionData('setMultipleVesting', [enabled]);
            return reply.send({
                status: true,
                contractAddress: process.env.VESTING_CONTRACT_ADDRESS || '0x393858957f0193b6aC9781f8b033E9196e37bdd4',
                calldata
            });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: 'Failed to encode: ' + err.message });
        }
    };
    fastify.post('/vesting/toggle-multiple', _vestingToggleHandler);
    fastify.post('/vesting/settings/toggle', _vestingToggleHandler);

    // POST /vesting/add-on-chain — encode `vest(beneficiary, amount, cliffMonths, vestingMonths)` calldata
    // Admin frontend sends minutes; conversion to periods (÷2) is done on the frontend before calling this.
    // cliffMonths and vestingMonths here are already in CONTRACT UNITS (1 unit = 2 real minutes).
    fastify.post('/vesting/add-on-chain', async (request, reply) => {
        try {
            const { beneficiary, amount, cliffMonths, vestingMonths } = request.body;
            if (!beneficiary || !amount || vestingMonths === undefined)
                return reply.send({ status: false, msg: "beneficiary, amount, and vestingMonths are required" });
            if (!ethers.isAddress(beneficiary))
                return reply.send({ status: false, msg: "Beneficiary is not a valid wallet address" });

            // The contract reverts a second vest() for an address while multiple vesting
            // is off, and it reverts past maxVestingLimit while it is on. Check both here
            // so the admin never gets as far as signing a doomed tx in MetaMask.
            try {
                const vestingContract = await getVestingContract();
                const [multipleEnabled, existingCount, maxLimit] = await Promise.all([
                    vestingContract.multipleVesting(),
                    vestingContract.getVestingCount(beneficiary),
                    vestingContract.maxVestingLimit()
                ]);
                const count = Number(existingCount);
                if (!multipleEnabled && count > 0) {
                    return reply.send({
                        status: false,
                        code: 'MULTIPLE_VESTING_DISABLED',
                        msg: 'This address already has a vesting schedule. Enable Multiple Vesting before vesting to it again.'
                    });
                }
                if (multipleEnabled && Number(maxLimit) > 0 && count >= Number(maxLimit)) {
                    return reply.send({
                        status: false,
                        code: 'MAX_VESTING_LIMIT',
                        msg: `This address already has ${count} vesting schedules, the maximum allowed is ${maxLimit}.`
                    });
                }
            } catch (e) {
                // A failed RPC read must not block vesting; the contract still enforces the rule.
                console.warn('add-on-chain: vesting pre-check failed:', e.message);
            }

            const VESTING_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, "../abi's/vesting.json"), 'utf8'));
            const iface = new ethers.Interface(VESTING_ABI);
            // amount is in Trustive tokens → convert to 18-decimal wei
            const amountWei = ethers.parseEther(String(amount));
            const calldata = iface.encodeFunctionData('vest', [
                beneficiary,
                amountWei,
                BigInt(cliffMonths || 0),
                BigInt(vestingMonths)
            ]);
            return reply.send({
                status: true,
                contractAddress: process.env.VESTING_CONTRACT_ADDRESS || '0x393858957f0193b6aC9781f8b033E9196e37bdd4',
                calldata,
                params: { beneficiary, amount, cliffMonths, vestingMonths }
            });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: 'Failed to encode vest tx: ' + err.message });
        }
    });

    fastify.post('/createVesting', async (request, reply) => {
        try {
            const { beneficiary, amount, cliff_months, vesting_months, tx_hash } = request.body;
            if (!beneficiary || amount === undefined || amount === "" || cliff_months === undefined || vesting_months === undefined)
                return reply.send({ status: false, msg: "Missing required fields" });

            // Determine vesting index for this user from the contract, not the DB count
            // (since we might have deleted historical non-legit records from DB).
            // Wait for the vest tx first: reading the count while the node is
            // still a block behind returns a stale value, and the row then lands
            // on the previous vesting's index.
            const contract = await getVestingContract();
            if (tx_hash) {
                try {
                    const provider = await getProvider();
                    await provider.waitForTransaction(tx_hash, 1, 60000);
                } catch (e) {
                    console.warn('createVesting: waiting for tx failed:', e.message);
                }
            }
            const onChainCount = await contract.getVestingCount(beneficiary);
            const nextIdx = Number(onChainCount) - 1; // The contract just added it, so it's the last one

            await fastify.mysql.query(
                `INSERT INTO vesting_schedules (beneficiary, total_amount, cliff_months, vesting_months, start_at, tx_hash, vesting_index)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount), cliff_months = VALUES(cliff_months),
                   vesting_months = VALUES(vesting_months), tx_hash = VALUES(tx_hash), status = 'active'`,
                [beneficiary, amount, cliff_months, vesting_months, new Date(), tx_hash || '', nextIdx >= 0 ? nextIdx : 0]
            );
            return reply.send({ status: true, msg: "Vesting recorded successfully" });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    fastify.post('/revokeVesting', async (request, reply) => {
        try {
            const { beneficiary, index } = request.body;
            if (!beneficiary) return reply.send({ status: false, msg: "Beneficiary required" });

            let query = "UPDATE vesting_schedules SET status = 'revoked' WHERE beneficiary = ?";
            let params = [beneficiary];

            if (index !== undefined) {
                query += " AND vesting_index = ?";
                params.push(index);
            }

            await fastify.mysql.query(query, params);
            return reply.send({ status: true, msg: "Vesting status updated to revoked" });
        } catch (err) {
            return reply.code(500).send({ status: false, msg: 'Internal Server Error' });
        }
    });

    // ========================================
    // CMS Section Management
    // ========================================

    // Helper: Save base64 image to disk
    const saveCmsImage = (base64DataUrl, filenamePrefix) => {
        if (!base64DataUrl || typeof base64DataUrl !== 'string') return null;
        const matches = base64DataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches) return null;
        const b64 = matches[2];
        const mime = matches[1];
        const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const filename = `${filenamePrefix}_${Date.now()}.${ext}`;
        const absDir = path.resolve(__dirname, '../public/uploads/cms');
        fs.mkdirSync(absDir, { recursive: true });
        const absPath = path.join(absDir, filename);
        fs.writeFileSync(absPath, Buffer.from(b64, 'base64'));
        return `/uploads/cms/${filename}`;
    };

    // GET /cms/sections - List all CMS sections (admin: includes inactive)
    fastify.get('/cms/sections', async (request, reply) => {
        try {
            const [rows] = await fastify.mysql.query(
                'SELECT * FROM cms_sections ORDER BY display_order ASC, id ASC'
            );
            return reply.send({ status: true, sections: rows || [] });
        } catch (err) {
            console.error('CMS list error:', err);
            return reply.code(500).send({ status: false, msg: 'Failed to fetch CMS sections' });
        }
    });

    // POST /cms/sections - Create a new CMS section
    fastify.post('/cms/sections', async (request, reply) => {
        try {
            const data = request.body || {};

            if (!data.section_key) {
                return reply.code(400).send({ status: false, msg: 'section_key is required' });
            }

            // Check for duplicate section_key
            const [existing] = await fastify.mysql.query(
                'SELECT id FROM cms_sections WHERE section_key = ?', [data.section_key]
            );
            if (existing && existing.length > 0) {
                return reply.code(400).send({ status: false, msg: 'A section with this key already exists' });
            }

            // Handle image upload (base64)
            let imageUrl = null;
            if (data.image && data.image.startsWith('data:')) {
                imageUrl = saveCmsImage(data.image, data.section_key);
            }

            await fastify.mysql.query(
                `INSERT INTO cms_sections (section_key, title, subtitle, description, image_url, button_text, button_link, display_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.section_key,
                    data.title || null,
                    data.subtitle || null,
                    data.description || null,
                    imageUrl,
                    data.button_text || null,
                    data.button_link || null,
                    data.display_order || 0,
                    data.is_active !== undefined ? data.is_active : 1
                ]
            );

            return reply.send({ status: true, msg: 'CMS section created successfully' });
        } catch (err) {
            console.error('CMS create error:', err);
            return reply.code(500).send({ status: false, msg: 'Failed to create CMS section' });
        }
    });

    // POST /cms/sections/update/:id - Update a CMS section
    fastify.post('/cms/sections/update/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const data = request.body || {};

            const [existing] = await fastify.mysql.query('SELECT * FROM cms_sections WHERE id = ?', [id]);
            if (!existing || existing.length === 0) {
                return reply.code(404).send({ status: false, msg: 'Section not found' });
            }

            // If section_key is being changed, check for duplicates
            if (data.section_key && data.section_key !== existing[0].section_key) {
                const [dup] = await fastify.mysql.query(
                    'SELECT id FROM cms_sections WHERE section_key = ? AND id != ?', [data.section_key, id]
                );
                if (dup && dup.length > 0) {
                    return reply.code(400).send({ status: false, msg: 'A section with this key already exists' });
                }
            }

            // Handle image update
            let imageUrl = existing[0].image_url;
            if (data.image && data.image.startsWith('data:')) {
                // Delete old image if it exists
                if (existing[0].image_url) {
                    const oldPath = path.resolve(__dirname, '..', 'public', existing[0].image_url.replace(/^\//, ''));
                    if (fs.existsSync(oldPath)) {
                        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
                    }
                }
                imageUrl = saveCmsImage(data.image, data.section_key || existing[0].section_key);
            } else if (data.image === null || data.image === '') {
                // Clear image
                if (existing[0].image_url) {
                    const oldPath = path.resolve(__dirname, '..', 'public', existing[0].image_url.replace(/^\//, ''));
                    if (fs.existsSync(oldPath)) {
                        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
                    }
                }
                imageUrl = null;
            }

            const updateFields = {
                section_key: data.section_key || existing[0].section_key,
                title: data.title !== undefined ? data.title : existing[0].title,
                subtitle: data.subtitle !== undefined ? data.subtitle : existing[0].subtitle,
                description: data.description !== undefined ? data.description : existing[0].description,
                image_url: imageUrl,
                button_text: data.button_text !== undefined ? data.button_text : existing[0].button_text,
                button_link: data.button_link !== undefined ? data.button_link : existing[0].button_link,
                display_order: data.display_order !== undefined ? data.display_order : existing[0].display_order,
                is_active: data.is_active !== undefined ? data.is_active : existing[0].is_active
            };

            const keys = Object.keys(updateFields);
            const sql = `UPDATE cms_sections SET ${keys.map(k => `\`${k}\` = ?`).join(', ')} WHERE id = ?`;
            const params = [...keys.map(k => updateFields[k]), id];
            await fastify.mysql.query(sql, params);

            return reply.send({ status: true, msg: 'CMS section updated successfully' });
        } catch (err) {
            console.error('CMS update error:', err);
            return reply.code(500).send({ status: false, msg: 'Failed to update CMS section' });
        }
    });

    // POST /cms/sections/delete/:id - Delete a CMS section
    fastify.post('/cms/sections/delete/:id', async (request, reply) => {
        try {
            const { id } = request.params;

            const [existing] = await fastify.mysql.query('SELECT * FROM cms_sections WHERE id = ?', [id]);
            if (!existing || existing.length === 0) {
                return reply.code(404).send({ status: false, msg: 'Section not found' });
            }

            // Delete associated image file
            if (existing[0].image_url) {
                const imgPath = path.resolve(__dirname, '..', 'public', existing[0].image_url.replace(/^\//, ''));
                if (fs.existsSync(imgPath)) {
                    try { fs.unlinkSync(imgPath); } catch (e) { /* ignore */ }
                }
            }

            await fastify.mysql.query('DELETE FROM cms_sections WHERE id = ?', [id]);
            return reply.send({ status: true, msg: 'CMS section deleted successfully' });
        } catch (err) {
            console.error('CMS delete error:', err);
            return reply.code(500).send({ status: false, msg: 'Failed to delete CMS section' });
        }
    });
};
