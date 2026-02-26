const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Use SSL if DATABASE_URL contains it or if we are in production
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("sslmode=no-verify")
    ? { rejectUnauthorized: false }
    : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false),
});

module.exports = pool;