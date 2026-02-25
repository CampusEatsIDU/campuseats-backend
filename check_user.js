const { Pool } = require('pg');
const pool = new Pool({
    connectionString: 'postgresql://juratbek:Messi0105@postgresql-juratbek.alwaysdata.net:5432/juratbek_odoo_db',
    ssl: { rejectUnauthorized: false }
});

pool.query("SELECT * FROM users WHERE phone = '+99894'").then(res => {
    console.log(res.rows);
    pool.end();
}).catch(err => {
    console.error(err);
    pool.end();
});
