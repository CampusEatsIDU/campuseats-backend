const pool = require("../config/db");
const axios = require("axios");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = "-1003714441392";

const createVerification = async (user_id, photo_url) => {
  const result = await pool.query(
    `INSERT INTO verification_requests (user_id, photo_url)
     VALUES ($1, $2)
     RETURNING *`,
    [user_id, photo_url]
  );

  const verification = result.rows[0];

  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,
    {
      chat_id: GROUP_ID,
      photo: photo_url,
      caption: `📌 Новая верификация\nUser ID: ${user_id}`,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Approve",
              callback_data: `verify_approve_${verification.id}`
            }
          ],
          [
            {
              text: "❌ Reject",
              callback_data: `verify_reject_${verification.id}`
            }
          ],
          [
            {
              text: "🔁 Request new photo",
              callback_data: `verify_retry_${verification.id}`
            }
          ]
        ]
      }
    }
  );

  return verification;
};

module.exports = {
  createVerification
};
