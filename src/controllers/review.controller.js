const pool = require("../config/db");

exports.createReview = async (req, res) => {
  try {
    const { telegram_id, username, phone, message } = req.body;

    const result = await pool.query(
      `INSERT INTO reviews (telegram_id, username, phone, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [telegram_id, username, phone, message]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create review" });
  }
};
