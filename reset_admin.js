require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./src/config/db');

async function main() {
    const phone = 'superadmin';
    const password = 'Admin2026!';
    const hash = await bcrypt.hash(password, 10);

    try {
        // Update existing superadmin account (ID 9)
        const result = await pool.query(
            "UPDATE users SET password = $1, status = 'active', full_name = 'Super Admin' WHERE phone = $2 RETURNING id, phone",
            [hash, phone]
        );

        if (result.rows.length > 0) {
            console.log('SUCCESS! SuperAdmin password reset.');
            console.log('');
            console.log('=== LOGIN CREDENTIALS ===');
            console.log('Phone/Login: superadmin');
            console.log('Password:    Admin2026!');
            console.log('=========================');
        } else {
            console.log('Account not found, creating new one...');
            const ins = await pool.query(
                "INSERT INTO users (phone, password, role, full_name, status) VALUES ($1, $2, 'superadmin', 'Super Admin', 'active') RETURNING id, phone",
                [phone, hash]
            );
            console.log('SUCCESS! SuperAdmin created.');
            console.log('');
            console.log('=== LOGIN CREDENTIALS ===');
            console.log('Phone/Login: superadmin');
            console.log('Password:    Admin2026!');
            console.log('=========================');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        pool.end();
    }
}

main();
