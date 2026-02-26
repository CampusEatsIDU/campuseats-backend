require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./src/config/db");

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, "src/db/migrations/005_courier_schema.sql");
        const sql = fs.readFileSync(sqlPath, "utf-8");
        await pool.query(sql);
        console.log("Migration 005_courier_schema executed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

runMigration();
