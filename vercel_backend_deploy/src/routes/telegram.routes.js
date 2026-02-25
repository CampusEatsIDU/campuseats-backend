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

    // MESSAGE HANDLER
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text;

      if (text === "/start") {
        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: "🍔 Welcome to CampusEats!\n\nPlease choose an option:",
            reply_markup: {
              inline_keyboard: [
                [{ text: "📱 Order Food", callback_data: "order" }],
                [{ text: "📋 My Orders", callback_data: "my_orders" }],
                [{ text: "ℹ️ Help", callback_data: "help" }]
              ]
            }
          }
        );
      }
    }

    // CALLBACK BUTTON HANDLER
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
            text: `✅ User ${userId} VERIFIED`
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
            text: `❌ User ${userId} REJECTED`
          }
        );
      }

      await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`,
        {
          callback_query_id: callback.id
        }
      );
    }
   
    res.sendStatus(200);
  } catch (err) {
    console.error("Telegram webhook error:", err.message);
    res.sendStatus(200);
  }
});

// Sync endpoint
router.post("/sync", async (req, res) => {
  try {
    const { telegram_id, username, first_name, last_name, language } = req.body;
    
    await pool.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name, language) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (telegram_id) DO UPDATE 
       SET username = $2, first_name = $3, last_name = $4, language = $5`,
      [telegram_id, username, first_name, last_name, language]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error("Sync error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
