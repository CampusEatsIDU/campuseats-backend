const { Pool } = require("pg");

const isLocalhost = process.env.DATABASE_URL && (
  process.env.DATABASE_URL.includes("localhost") ||
  process.env.DATABASE_URL.includes("127.0.0.1")
);

// Log connection attempt (masking password)
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  console.log(`[Postgres] Connecting to ${url.host}${url.pathname}`);
} else {
  console.error('[Postgres] DATABASE_URL is NOT SET');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[Postgres Pool Error]', err);
});

module.exports = pool;