const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

/* =========================
HELPER: Normalize phone
========================= */
function normalizePhone(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/\s+/g, "");
  if (/^\+998\d{9}$/.test(cleaned)) return cleaned;
  if (/^998\d{9}$/.test(cleaned)) return `+${cleaned}`;

  // Allow alphanumeric usernames for restaurant partners / admins
  if (cleaned.length >= 4 && !/^\d+$/.test(cleaned)) return cleaned;

  return null;
}

/* =========================
SIGN UP
========================= */
router.post("/signup", async (req, res) => {
  try {
    const { phone, password, fullName } = req.body;
    if (!phone || !password || !fullName) {
      return res.status(400).json({ message: "Phone, password and full name required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const phoneNorm = normalizePhone(phone);

    if (!phoneNorm) {
      return res.status(400).json({ message: "Invalid phone format" });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phoneNorm]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (phone, password, role, full_name)
       VALUES ($1, $2, 'user', $3)
       RETURNING id, phone, role, full_name`,
      [phoneNorm, hashedPassword, fullName]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.status(201).json({
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        fullName: user.full_name
      },
      token
    });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
SIGN IN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const phoneNorm = normalizePhone(phone);

    if (!phoneNorm) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const result = await pool.query(
      "SELECT id, phone, password, role, full_name, balance, is_student_verified, status FROM users WHERE phone = $1",
      [phoneNorm]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];

    // Check if user is blocked or deleted
    if (user.status === "blocked") {
      return res.status(403).json({ message: "Your account has been blocked. Contact admin." });
    }
    if (user.status === "deleted") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.json({
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        fullName: user.full_name,
        balance: user.balance,
        is_student_verified: user.is_student_verified,
        status: user.status
      },
      token
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
GET USER INFO
========================= */
router.get("/me", require("../middleware/auth.middleware"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, phone, role, full_name, balance, is_student_verified FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("ME ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
FORGOT PASSWORD
========================= */
router.post("/forgot-password", async (req, res) => {
  return res.json({
    message: "If you forgot your password, contact admin: @CampusEats"
  });
});

module.exports = router;