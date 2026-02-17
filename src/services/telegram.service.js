const axios = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;

function tgApi() {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is missing");
  return `https://api.telegram.org/bot${BOT_TOKEN}`;
}

async function sendVerificationToGroup({ userId, photoUrl }) {
  if (!GROUP_ID) throw new Error("TELEGRAM_GROUP_ID is missing");

  const text =
    `🧾 Verification request\n` +
    `User ID: ${userId}\n` +
    `Photo: ${photoUrl}`;

  // callback_data обязательно короткий, поэтому шифруем только action+userId
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `ver:approve:${userId}` },
        { text: "❌ Reject", callback_data: `ver:reject:${userId}` },
      ],
      [{ text: "📷 Request new photo", callback_data: `ver:retry:${userId}` }],
    ],
  };

  // Отправим фото + подпись + кнопки
  const url = `${tgApi()}/sendPhoto`;

  const resp = await axios.post(url, {
    chat_id: GROUP_ID,
    photo: photoUrl,
    caption: text,
    reply_markup: keyboard,
  });

  return resp.data;
}

async function answerCallbackQuery(callback_query_id, text) {
  const url = `${tgApi()}/answerCallbackQuery`;
  return axios.post(url, {
    callback_query_id,
    text,
    show_alert: false,
  });
}

async function editMessageCaption(chatId, messageId, newCaption) {
  const url = `${tgApi()}/editMessageCaption`;
  return axios.post(url, {
    chat_id: chatId,
    message_id: messageId,
    caption: newCaption,
  });
}

module.exports = {
  sendVerificationToGroup,
  answerCallbackQuery,
  editMessageCaption,
};
