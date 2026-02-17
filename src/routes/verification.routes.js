const router = require("express").Router();
const axios = require("axios");
const authMiddleware = require("../middleware/auth.middleware");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = "-1003714441392"; // твоя группа

router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { photo_url } = req.body;

    if (!photo_url) {
      return res.status(400).json({ message: "photo_url required" });
    }

    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      {
        chat_id: GROUP_ID,
        photo: photo_url,
        caption: `📸 Verification request\nUser ID: ${userId}`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Approve", callback_data: `approve_${userId}` },
              { text: "❌ Reject", callback_data: `reject_${userId}` }
            ]
          ]
        }
      }
    );

    res.json({ message: "Verification request sent" });

  } catch (err) {
    console.error("Verification error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
