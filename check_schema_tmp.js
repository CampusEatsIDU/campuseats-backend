require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'student_verifications';
        `);
        console.log("student_verifications columns:");
        console.table(res.rows);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        pool.end();
    }
}
main();
