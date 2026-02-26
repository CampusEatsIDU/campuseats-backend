const { Pool } = require("pg");

const isLocalhost = process.env.DATABASE_URL && (
  process.env.DATABASE_URL.includes("localhost") ||
  process.env.DATABASE_URL.includes("127.0.0.1")
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[Postgres Pool Error]', err.message);
});

module.exports = pool;