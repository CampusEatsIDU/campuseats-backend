const router = require("express").Router();
const orderService = require("../services/order.service");
const authMiddleware = require("../middleware/auth.middleware");
const pool = require("../config/db");

/* =========================
   CREATE ORDER
========================= */

router.post("/", authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;

    const {
      total_price,
      restaurant_id,
      delivery_address,
      latitude,
      longitude,
      items,
      promo_code
    } = req.body;

    if (!total_price || !restaurant_id) {
      return res.status(400).json({ message: "Missing required fields: total_price or restaurant_id" });
    }

    const order = await orderService.createOrder({
      user_id,
      total_price,
      restaurant_id,
      delivery_address,
      latitude,
      longitude,
      items,
      promo_code
    });

    res.status(201).json(order);

  } catch (err) {
    console.error(err);
    if (err.message && (err.message.includes("promo") || err.message.includes("Minimum"))) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   GET MY ORDERS
========================= */

router.get("/my", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Get orders
    const ordersResult = await pool.query(
      `SELECT o.*,
              rp.user_id as rest_user_id,
              u.full_name as restaurant_name
       FROM orders o
       LEFT JOIN restaurant_profiles rp ON o.restaurant_id = rp.user_id
       LEFT JOIN users u ON o.restaurant_id = u.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM orders WHERE user_id = $1",
      [req.user.id]
    );

    // Get items for each order
    const orders = [];
    for (const order of ordersResult.rows) {
      const itemsResult = await pool.query(
        "SELECT * FROM order_items WHERE order_id = $1",
        [order.id]
      );
      orders.push({
        ...order,
        items: itemsResult.rows
      });
    }

    res.json({
      orders,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    });
  } catch (err) {
    console.error("Get my orders error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   VALIDATE PROMO CODE
========================= */

router.post("/validate-promo", authMiddleware, async (req, res) => {
  try {
    const { code, order_total } = req.body;
    if (!code) {
      return res.status(400).json({ valid: false, reason: "No promo code provided" });
    }

    const promoResult = await pool.query(
      `SELECT * FROM promotions
       WHERE code = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR current_uses < max_uses)`,
      [code.toUpperCase()]
    );

    if (promoResult.rows.length === 0) {
      return res.json({ valid: false, reason: "Invalid or expired promo code" });
    }

    const promo = promoResult.rows[0];

    // Check students_only
    if (promo.students_only) {
      const userResult = await pool.query(
        "SELECT is_student_verified FROM users WHERE id = $1",
        [req.user.id]
      );
      if (!userResult.rows[0]?.is_student_verified) {
        return res.json({ valid: false, reason: "This promo is for verified students only" });
      }
    }

    // Check min order
    const total = parseFloat(order_total) || 0;
    if (promo.min_order && total < parseFloat(promo.min_order)) {
      return res.json({ valid: false, reason: `Minimum order: ${promo.min_order}` });
    }

    // Calculate discount
    let discountAmount = 0;
    if (promo.discount_type === 'percentage') {
      discountAmount = total * (parseFloat(promo.discount_value) / 100);
    } else {
      discountAmount = Math.min(parseFloat(promo.discount_value), total);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    res.json({
      valid: true,
      discount_type: promo.discount_type,
      discount_value: parseFloat(promo.discount_value),
      discount_amount: discountAmount,
      description: promo.description
    });
  } catch (err) {
    console.error("Validate promo error:", err);
    res.status(500).json({ valid: false, reason: "Server error" });
  }
});

/* =========================
   UPDATE ORDER STATUS
========================= */

router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const updatedOrder = await orderService.updateStatus(orderId, status);

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(updatedOrder);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
