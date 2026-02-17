const pool = require("../config/db");

function normalizeUsername(username) {
  if (!username) return null;
  return username.startsWith("@") ? username : `@${username}`;
}

exports.syncTelegramUser = async (req, res) => {
  try {
    const {
      telegram_id,
      username,
      first_name,
      last_name,
      photo_url,
      phone,
      language,
      city,
      role,
    } = req.body || {};

    if (!telegram_id) {
      return res.status(400).json({ error: "telegram_id is required" });
    }

    // Валидации (минимальные, чтобы не падать)
    const safeLang = language && ["ru", "uz", "en"].includes(language) ? language : "ru";

    // phone — только если начинается с +998 и длина разумная
    const safePhone =
      phone && /^\+998\d{9}$/.test(phone) ? phone : null;

    const safeCity = city && String(city).length <= 50 ? String(city) : null;

    const safeUsername = normalizeUsername(username);

    // 1) пробуем найти пользователя по telegram_id
    const existing = await pool.query(
      `SELECT id, email, role FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegram_id]
    );

    // Если не найден — создаём "telegram user"
    // ВАЖНО: у тебя в таблице users email/password NOT NULL.
    // Значит нужно создать "тех" email/password для телеги.
    // Позже можно будет заменить на нормальную схему.
    if (existing.rows.length === 0) {
      const tgEmail = `tg_${telegram_id}@telegram.local`;
      const tgPassword = "telegram_auth_no_password"; // заглушка (НЕ используется для входа)

      const inserted = await pool.query(
        `
        INSERT INTO users (email, password, role, telegram_id, username, first_name, last_name, photo_url, phone, language, city)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, email, role, telegram_id, username, first_name, last_name, photo_url, phone, language, city, created_at
        `,
        [
          tgEmail,
          tgPassword,
          role || "user",
          telegram_id,
          safeUsername,
          first_name || null,
          last_name || null,
          photo_url || null,
          safePhone,
          safeLang,
          safeCity,
        ]
      );

      return res.status(201).json({
        message: "User created (telegram)",
        user: inserted.rows[0],
      });
    }

    // Если найден — обновляем только telegram-поля/настройки
    const updated = await pool.query(
      `
      UPDATE users
      SET
        username = COALESCE($2, username),
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        photo_url = COALESCE($5, photo_url),
        phone = COALESCE($6, phone),
        language = COALESCE($7, language),
        city = COALESCE($8, city)
      WHERE telegram_id = $1
      RETURNING id, email, role, telegram_id, username, first_name, last_name, photo_url, phone, language, city, created_at
      `,
      [
        telegram_id,
        safeUsername,
        first_name || null,
        last_name || null,
        photo_url || null,
        safePhone,
        safeLang,
        safeCity,
      ]
    );

    return res.json({
      message: "User updated (telegram)",
      user: updated.rows[0],
    });
  } catch (err) {
    console.error("syncTelegramUser error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
