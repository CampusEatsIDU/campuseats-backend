const crypto = require("crypto");
const pool = require("../config/db");
const jwt = require("jsonwebtoken");

exports.telegramAuth = async (req, res) => {
  try {
    const data = req.body;

    if (!data.hash) {
      return res.status(400).json({ error: "No hash provided" });
    }

    /* ===============================
       1. VERIFY TELEGRAM SIGNATURE
    =============================== */

    const secret = crypto
      .createHash("sha256")
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();

    const checkString = Object.keys(data)
      .filter((key) => key !== "hash")
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join("\n");

    const hmac = crypto
      .createHmac("sha256", secret)
      .update(checkString)
      .digest("hex");

    if (hmac !== data.hash) {
      return res.status(403).json({ error: "Invalid Telegram signature" });
    }

    /* ===============================
       2. CHECK AUTH DATE (anti-replay)
    =============================== */

    const now = Math.floor(Date.now() / 1000);
    if (now - data.auth_date > 86400) {
      return res.status(403).json({ error: "Auth data is too old" });
    }

    /* ===============================
       3. FIND OR CREATE USER
    =============================== */

    const { id, username, first_name, last_name, photo_url } = data;

    let userResult = await pool.query(
      "SELECT * FROM users WHERE telegram_id = $1",
      [id]
    );

    let user;

    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        `
        INSERT INTO users 
        (telegram_id, username, first_name, last_name, photo_url, role, email, password)
        VALUES ($1,$2,$3,$4,$5,'user',NULL,NULL)
        RETURNING *
        `,
        [id, username, first_name, last_name, photo_url]
      );

      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    /* ===============================
       4. ISSUE JWT
    =============================== */

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        telegram_id: user.telegram_id
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Telegram auth failed" });
  }
};
