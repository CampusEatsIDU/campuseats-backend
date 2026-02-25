const Router = require("express");
const pool = require("../config/db");

const router = new Router();

/*
POST /api/reviews
Создание нового отзыва
*/
router.post("/", async (req, res) => {
  try {
    const { telegram_id, username, phone, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const newReview = await pool.query(
      `
      INSERT INTO reviews (telegram_id, username, phone, message)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
      `,
      [telegram_id, username, phone, message]
    );

    res.status(201).json({
      message: "Review created successfully",
      review: newReview.rows[0]
    });

  } catch (err) {
    console.error("Review creation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
GET /api/reviews
Получение всех отзывов (для админа)
*/
router.get("/", async (req, res) => {
  try {
    const reviews = await pool.query(
      "SELECT * FROM reviews ORDER BY created_at DESC"
    );

    res.json(reviews.rows);
  } catch (err) {
    console.error("Get reviews error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
