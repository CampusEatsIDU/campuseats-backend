const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/auth.middleware");

// Get user balance
router.get("/balance", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT balance FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ balance: parseFloat(result.rows[0].balance) || 0 });
  } catch (err) {
    console.error("Wallet balance error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get cashback transaction history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ct.*, o.restaurant_id
       FROM cashback_transactions ct
       LEFT JOIN orders o ON ct.order_id = o.id
       WHERE ct.user_id = $1
       ORDER BY ct.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error("Wallet history error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Apply wallet balance to an order
router.post("/apply", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, order_id } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    await client.query("BEGIN");

    // Check user balance
    const userResult = await client.query(
      "SELECT balance FROM users WHERE id = $1 FOR UPDATE",
      [req.user.id]
    );
    const currentBalance = parseFloat(userResult.rows[0]?.balance) || 0;

    if (currentBalance < amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Deduct balance
    await client.query(
      "UPDATE users SET balance = balance - $1 WHERE id = $2",
      [amount, req.user.id]
    );

    // Record transaction
    await client.query(
      `INSERT INTO cashback_transactions (user_id, order_id, amount, type, description)
       VALUES ($1, $2, $3, 'debit', $4)`,
      [req.user.id, order_id, amount, `Applied to order #${order_id}`]
    );

    // Update order discount
    if (order_id) {
      await client.query(
        "UPDATE orders SET discount_amount = COALESCE(discount_amount, 0) + $1 WHERE id = $2",
        [amount, order_id]
      );
    }

    await client.query("COMMIT");

    const newBalance = currentBalance - amount;
    res.json({ success: true, new_balance: newBalance });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Wallet apply error:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

module.exports = router;
