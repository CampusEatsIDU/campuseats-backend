const router = require("express").Router();
const axios = require("axios");
const pool = require("../config/db");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/* =================================
   WEBHOOK (Telegram calls this)
================================= */
router.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    console.log("Telegram update:", JSON.stringify(update));

    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text;

      if (text === "/start") {
        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: "\ud83c\udf54 Welcome to CampusEats!\n\nPlease choose an option:",
            reply_markup: {
              inline_keyboard: [
                [{ text: "\ud83d\udcf1 Order Food", callback_data: "order" }],
                [{ text: "\ud83d\udccb My Orders", callback_data: "my_orders" }],
                [{ text: "\u2139\ufe0f Help", callback_data: "help" }]
              ]
            }
          }
        );
      }
    }

    if (update.callback_query) {
      const callback = update.callback_query;
      const data = callback.data;
      const chatId = callback.message.chat.id;
      const messageId = callback.message.message_id;

      if (data.startsWith("approve_")) {
        const userId = data.split("_")[1];
        await pool.query(
          "UPDATE users SET is_verified = true WHERE id = $1",
          [userId]
        );
        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`,
          {
            chat_id: chatId,
            message_id: messageId,
            text: `\u2705 User ${userId} VERIFIED`
          }
        );
      }

      if (data.startsWith("reject_")) {
        const userId = data.split("_")[1];
        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`,
          {
            chat_id: chatId,
            message_id: messageId,
            text: `\u274c User ${userId} REJECTED`
          }
        );
      }

      await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`,
        { callback_query_id: callback.id }
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Telegram webhook error:", err);
    res.sendStatus(200);
  }
});

/* =================================
   SYNC USER FROM TELEGRAM
================================= */
router.post("/sync", async (req, res) => {
  try {
    const { telegram_id, username, first_name, last_name, language } = req.body;

    await pool.query(
      `INSERT INTO users (telegram_id, full_name, role, status)
       VALUES ($1, $2, 'user', 'active')
       ON CONFLICT (telegram_id) DO UPDATE
       SET full_name = COALESCE(EXCLUDED.full_name, users.full_name)`,
      [telegram_id, [first_name, last_name].filter(Boolean).join(' ') || username]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Sync error details:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =================================
   GET ORDERS BY TELEGRAM ID
================================= */
router.get("/orders", async (req, res) => {
  try {
    const { telegram_id } = req.query;
    if (!telegram_id) {
      return res.status(400).json({ message: "telegram_id required" });
    }

    // Find user by telegram_id
    const userResult = await pool.query(
      "SELECT id FROM users WHERE telegram_id = $1",
      [telegram_id]
    );
    if (userResult.rows.length === 0) {
      return res.json({ orders: [] });
    }

    const userId = userResult.rows[0].id;

    const ordersResult = await pool.query(
      `SELECT o.*, u.full_name as restaurant_name
       FROM orders o
       LEFT JOIN users u ON o.restaurant_id = u.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get items for each order
    const orders = [];
    for (const order of ordersResult.rows) {
      const itemsResult = await pool.query(
        "SELECT * FROM order_items WHERE order_id = $1",
        [order.id]
      );
      orders.push({ ...order, items: itemsResult.rows });
    }

    res.json({ orders });
  } catch (err) {
    console.error("Telegram orders error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =================================
   GET BALANCE BY TELEGRAM ID
================================= */
router.get("/balance", async (req, res) => {
  try {
    const { telegram_id } = req.query;
    if (!telegram_id) {
      return res.status(400).json({ message: "telegram_id required" });
    }

    const result = await pool.query(
      "SELECT balance FROM users WHERE telegram_id = $1",
      [telegram_id]
    );
    if (result.rows.length === 0) {
      return res.json({ balance: 0 });
    }

    res.json({ balance: parseFloat(result.rows[0].balance) || 0 });
  } catch (err) {
    console.error("Telegram balance error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =================================
   UPDATE USER PREFERENCES FROM BOT
================================= */
router.post("/update-preferences", async (req, res) => {
  try {
    const { telegram_id, phone, city, language } = req.body;
    if (!telegram_id) {
      return res.status(400).json({ message: "telegram_id required" });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (phone) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (city) {
      updates.push(`city = $${paramIndex++}`);
      values.push(city);
    }
    if (language) {
      updates.push(`language = $${paramIndex++}`);
      values.push(language);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(telegram_id);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE telegram_id = $${paramIndex}`,
      values
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Update preferences error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
