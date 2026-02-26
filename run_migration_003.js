require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'src/db/migrations/003_restaurant_panel.sql'), 'utf8');
        console.log("Running migration 003...");
        await pool.query(sql);
        console.log("Migration 003 successful.");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        pool.end();
    }
}

runMigration();
