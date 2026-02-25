const pool = require("../config/db");
const jwt = require("jsonwebtoken");

async function findOrCreateUser(telegramId, username) {
  const [users] = await pool.query(
    "SELECT * FROM users WHERE telegram_id = ?",
    [telegramId]
  );

  if (users.length > 0) return users[0];

  const [result] = await pool.query(
    "INSERT INTO users (telegram_id, username, role, is_verified) VALUES (?, ?, 'student', FALSE)",
    [telegramId, username]
  );

  const [newUser] = await pool.query(
    "SELECT * FROM users WHERE id = ?",
    [result.insertId]
  );

  return newUser[0];
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
