const router = require("express").Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

// Keep existing functionality if needed
const axios = require("axios");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = "-1003714441392";

router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { photo_url } = req.body;

    if (!photo_url) {
      return res.status(400).json({ message: "photo_url required" });
    }

    if (BOT_TOKEN && GROUP_ID) {
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
      ).catch(console.error);
    }

    res.json({ message: "Verification request sent via Telegram" });
  } catch (err) {
    console.error("Old Verification error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// NEW POST /api/verification/submit (multipart)
router.post(
  "/submit",
  authMiddleware,
  upload.fields([
    { name: "front_image", maxCount: 1 },
    { name: "back_image", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.id;

      if (!req.files || !req.files.front_image || !req.files.back_image) {
        return res.status(400).json({ message: "Both front_image and back_image are required." });
      }

      // Check if user already has a pending verification
      const existing = await pool.query(
        "SELECT id FROM student_verifications WHERE user_id = $1 AND status = 'pending'",
        [userId]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: "You already have a pending verification request." });
      }

      // Convert image buffers to Data URLs (base64) for Serverless DB storage
      const frontMime = req.files.front_image[0].mimetype;
      const frontBase64 = req.files.front_image[0].buffer.toString('base64');
      const frontImageUrl = `data:${frontMime};base64,${frontBase64}`;

      const backMime = req.files.back_image[0].mimetype;
      const backBase64 = req.files.back_image[0].buffer.toString('base64');
      const backImageUrl = `data:${backMime};base64,${backBase64}`;

      await pool.query(
        `INSERT INTO student_verifications (user_id, front_image_url, back_image_url)
         VALUES ($1, $2, $3)`,
        [userId, frontImageUrl, backImageUrl]
      );

      res.status(201).json({ message: "Verification submitted successfully." });
    } catch (err) {
      console.error("Submit verification error:", err);
      res.status(500).json({ message: "Server error", detail: err.message, stack: err.stack });
    }
  }
);

module.exports = router;
