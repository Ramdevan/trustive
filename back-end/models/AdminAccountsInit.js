const bcrypt = require('bcrypt');

const DEFAULT_OWNERS = [
    { name: "Owner 1 (Primary Treasury)", email: "owner1@trustive.com", wallet: "0x861b38d9E97ebE86883A55eB4b2b70cca795785E", role: "owner" },
    { name: "Owner 2 (Governance)", email: "owner2@trustive.com", wallet: "0xb01507c1661C22404D2371Ae9043Dc715663EB22", role: "owner" },
    { name: "Owner 3 (Security)", email: "owner3@trustive.com", wallet: "0x0bAaaD913DE9567dEb71368296d56a84a22C949d", role: "owner" }
];

const DEFAULT_ADMINS = [
    { name: "Admin 1 (Lead Operations)", email: "admin1@trustive.com", wallet: "0x3300f29508D7D04c75C55BeF8F56bC822E30A2D3", role: "admin" },
    { name: "Admin 2 (Sales Operations)", email: "admin2@trustive.com", wallet: "0x88A4f903D778Eee639fE1987fBD89c2892594471", role: "admin" },
    { name: "Admin 3 (Pricing & Tokens)", email: "admin3@trustive.com", wallet: "0x61c3810A04AdeabeE2ABdCa465Af5BB389C979Df", role: "admin" },
    { name: "Admin 4 (Compliance & Users)", email: "admin4@trustive.com", wallet: "0x55451A3f10D392BEa6A19DD9Fb366c17d462A5d2", role: "admin" },
    { name: "Admin 5 (Vesting & Audits)", email: "admin5@trustive.com", wallet: "0x724318431F8ce8a22e464c7057dECB474d603EeD", role: "admin" }
];

async function initAdminAccounts(mysql) {
    try {
        await mysql.query(`
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('owner', 'admin') NOT NULL,
                assigned_wallet VARCHAR(66) DEFAULT NULL,
                two_fa_secret VARCHAR(255) DEFAULT NULL,
                two_fa_enabled TINYINT(1) DEFAULT 0,
                status TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Check if any accounts exist
        const [existing] = await mysql.query("SELECT COUNT(*) AS cnt FROM admin_accounts");
        if (existing[0]?.cnt === 0) {
            const ownerPass = await bcrypt.hash("Owner@123", 10);
            const adminPass = await bcrypt.hash("Admin@123", 10);

            for (const o of DEFAULT_OWNERS) {
                await mysql.query(
                    `INSERT INTO admin_accounts (name, email, password, role, assigned_wallet)
                     VALUES (?, ?, ?, ?, ?)`,
                    [o.name, o.email, ownerPass, o.role, o.wallet]
                );
            }

            for (const a of DEFAULT_ADMINS) {
                await mysql.query(
                    `INSERT INTO admin_accounts (name, email, password, role, assigned_wallet)
                     VALUES (?, ?, ?, ?, ?)`,
                    [a.name, a.email, adminPass, a.role, a.wallet]
                );
            }
            console.log("✅ Seeded 3 Owner and 5 Admin accounts into admin_accounts table.");
        }
    } catch (err) {
        console.error("⚠️ Failed to initialize admin_accounts table:", err.message);
    }
}

module.exports = {
    initAdminAccounts,
    DEFAULT_OWNERS,
    DEFAULT_ADMINS
};
