const { Pool } = require('pg');
const pool = new Pool({
    connectionString: 'postgresql://juratbek:Messi0105@postgresql-juratbek.alwaysdata.net:5432/juratbek_odoo_db',
    ssl: { rejectUnauthorized: false }
});

const alterQuery = `
  ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
`;

pool.query(alterQuery).then(res => {
    console.log('Altered table users successfully');
    pool.end();
}).catch(err => {
    console.error(err);
    pool.end();
});
