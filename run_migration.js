require("dotenv").config();
const pool = require("./src/config/db");
const fs = require("fs");
const path = require("path");

async function migrate() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, "src/db/migrations/001_superadmin_schema.sql"), "utf-8");
        await pool.query(sql);
        console.log("Migration executed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
