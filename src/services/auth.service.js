const pool = require("../config/db");
const jwt = require("jsonwebtoken");

async function findOrCreateUser(telegramId, username) {
  const result = await pool.query(
    "SELECT * FROM users WHERE telegram_id = $1",
    [telegramId]
  );

  if (result.rows.length > 0) return result.rows[0];

  const insertResult = await pool.query(
    `INSERT INTO users (telegram_id, full_name, role, status)
     VALUES ($1, $2, 'user', 'active')
     ON CONFLICT (telegram_id) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING *`,
    [telegramId, username || 'Telegram User']
  );

  return insertResult.rows[0];
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

module.exports = { findOrCreateUser, generateToken };
