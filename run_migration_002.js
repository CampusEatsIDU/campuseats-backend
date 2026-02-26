require('dotenv').config();
const pool = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function migrate() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'src/db/migrations/002_superadmin_full.sql'), 'utf-8');
        await pool.query(sql);
        console.log('Migration 002 executed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
