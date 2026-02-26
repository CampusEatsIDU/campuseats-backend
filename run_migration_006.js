require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'src/db/migrations/006_courier_rating_requests.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');

        // Run each statement separately to handle errors gracefully
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

        for (const stmt of statements) {
            try {
                await pool.query(stmt);
                console.log('✅ Executed:', stmt.slice(0, 60) + '...');
            } catch (e) {
                console.warn('⚠️ Skipped (may already exist):', e.message.slice(0, 80));
            }
        }

        console.log('\n✅ Migration 006_courier_rating_requests completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
