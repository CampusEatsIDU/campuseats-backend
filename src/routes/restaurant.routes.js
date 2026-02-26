const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

// Role check middleware
const restrictToRestaurant = (req, res, next) => {
  if (req.user.role !== "restaurant") {
    return res.status(403).json({ message: "Forbidden: Restaurant access only" });
  }
  next();
};

router.use(authMiddleware);
router.use(restrictToRestaurant);

// 1. Dashboard Stats
router.get("/dashboard", async (req, res) => {
  try {
    const restId = req.user.id;

    // Today Revenue and Orders
    const todayRes = await pool.query(
      `SELECT COALESCE(SUM(total_price), 0) as today_revenue, COUNT(id) as today_orders 
             FROM orders 
             WHERE restaurant_id = $1 AND DATE(created_at) = CURRENT_DATE AND status = 'completed'`,
      [restId]
    );

    // Monthly Revenue
    const monthRes = await pool.query(
      `SELECT COALESCE(SUM(total_price), 0) as monthly_revenue 
             FROM orders 
             WHERE restaurant_id = $1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND status = 'completed'`,
      [restId]
    );

    // Current Status
    const profileRes = await pool.query(
      `SELECT is_open FROM restaurant_profiles WHERE user_id = $1`,
      [restId]
    );
    const isOpen = profileRes.rows.length > 0 ? profileRes.rows[0].is_open : false;

    res.json({
      today_revenue: Number(todayRes.rows[0].today_revenue),
      today_orders: parseInt(todayRes.rows[0].today_orders),
      monthly_revenue: Number(monthRes.rows[0].monthly_revenue),
      is_open: isOpen
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 2. Menu Management
router.get("/menu", async (req, res) => {
  try {
    const restId = req.user.id;
    const menu = await pool.query(
      "SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY sort_order ASC, id DESC",
      [restId]
    );
    res.json(menu.rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/menu", upload.single("image"), async (req, res) => {
  try {
    const restId = req.user.id;
    const { name, description, price, category, is_available } = req.body;

    let imageUrl = null;
    if (req.file) {
      const mime = req.file.mimetype;
      const b64 = req.file.buffer.toString('base64');
      imageUrl = `data:${mime};base64,${b64}`;
    }

    const result = await pool.query(
      `INSERT INTO menu_items (restaurant_id, name, description, price, category, is_available, image_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [restId, name, description, price, category || 'Main', is_available !== 'false', imageUrl]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/menu/:id", upload.single("image"), async (req, res) => {
  try {
    const restId = req.user.id;
    const itemId = req.params.id;
    const { name, description, price, category, is_available } = req.body;

    const existing = await pool.query("SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2", [itemId, restId]);
    if (existing.rows.length === 0) return res.status(404).json({ message: "Menu item not found" });

    let imageUrl = existing.rows[0].image_url;
    if (req.file) {
      const mime = req.file.mimetype;
      const b64 = req.file.buffer.toString('base64');
      imageUrl = `data:${mime};base64,${b64}`;
    }

    const result = await pool.query(
      `UPDATE menu_items SET name=$1, description=$2, price=$3, category=$4, is_available=$5, image_url=$6 
             WHERE id=$7 AND restaurant_id=$8 RETURNING *`,
      [name, description, price, category, is_available !== 'false', imageUrl, itemId, restId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/menu/:id", async (req, res) => {
  try {
    const restId = req.user.id;
    const itemId = req.params.id;
    const result = await pool.query("DELETE FROM menu_items WHERE id = $1 AND restaurant_id = $2 RETURNING id", [itemId, restId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Menu item not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 3. Orders Management
router.get("/orders", async (req, res) => {
  try {
    const restId = req.user.id;
    const orders = await pool.query(
      `SELECT o.*, u.full_name as user_name, u.phone as user_phone,
                (SELECT json_agg(row_to_json(oi)) FROM order_items oi WHERE oi.order_id = o.id) as items
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.restaurant_id = $1
             ORDER BY o.created_at DESC`,
      [restId]
    );
    res.json(orders.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/orders/:id/status", async (req, res) => {
  try {
    const restId = req.user.id;
    const orderId = req.params.id;
    const { status } = req.body; // pending, accepted, preparing, ready, completed, cancelled

    const validStatuses = ['pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });

    const result = await pool.query(
      "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND restaurant_id = $3 RETURNING *",
      [status, orderId, restId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Order not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 4. Analytics
router.get("/analytics", async (req, res) => {
  try {
    const restId = req.user.id;

    // Orders per day (last 7 days)
    const dailyOrders = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
             FROM orders 
             WHERE restaurant_id = $1 AND status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '7 days'
             GROUP BY DATE(created_at) ORDER BY date ASC`,
      [restId]
    );

    // Revenue per week (last 4 weeks)
    const weeklyRev = await pool.query(
      `SELECT DATE_TRUNC('week', created_at) as week, SUM(total_price) as revenue 
             FROM orders 
             WHERE restaurant_id = $1 AND status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '4 weeks'
             GROUP BY week ORDER BY week ASC`,
      [restId]
    );

    // Top selling items
    const topItems = await pool.query(
      `SELECT oi.item_name, SUM(oi.quantity) as count 
             FROM order_items oi 
             JOIN orders o ON o.id = oi.order_id 
             WHERE o.restaurant_id = $1 AND o.status = 'completed'
             GROUP BY oi.item_name ORDER BY count DESC LIMIT 5`,
      [restId]
    );

    res.json({
      dailyOrders: dailyOrders.rows,
      weeklyRev: weeklyRev.rows,
      topItems: topItems.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 5. Restaurant Profile
router.get("/profile", async (req, res) => {
  try {
    const restId = req.user.id;
    // Ensure profile exists
    let profile = await pool.query("SELECT * FROM restaurant_profiles WHERE user_id = $1", [restId]);
    if (profile.rows.length === 0) {
      profile = await pool.query(`INSERT INTO restaurant_profiles (user_id) VALUES ($1) RETURNING *`, [restId]);
    }
    res.json(profile.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/profile", upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  try {
    const restId = req.user.id;
    const { description, address, phone, min_order, delivery_fee, working_hours } = req.body;

    let profile = await pool.query("SELECT * FROM restaurant_profiles WHERE user_id = $1", [restId]);
    if (profile.rows.length === 0) {
      profile = await pool.query(`INSERT INTO restaurant_profiles (user_id) VALUES ($1) RETURNING *`, [restId]);
    }

    let logo_url = profile.rows[0].logo_url;
    let banner_url = profile.rows[0].banner_url;

    if (req.files) {
      if (req.files.logo && req.files.logo[0]) {
        const mime = req.files.logo[0].mimetype;
        const b64 = req.files.logo[0].buffer.toString('base64');
        logo_url = `data:${mime};base64,${b64}`;
      }
      if (req.files.banner && req.files.banner[0]) {
        const mime = req.files.banner[0].mimetype;
        const b64 = req.files.banner[0].buffer.toString('base64');
        banner_url = `data:${mime};base64,${b64}`;
      }
    }

    const result = await pool.query(
      `UPDATE restaurant_profiles SET 
                description=$1, address=$2, phone=$3, min_order=$4, delivery_fee=$5, working_hours=$6, logo_url=$7, banner_url=$8, updated_at=CURRENT_TIMESTAMP
             WHERE user_id=$9 RETURNING *`,
      [description, address, phone, min_order || 0, delivery_fee || 0, working_hours || profile.rows[0].working_hours, logo_url, banner_url, restId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/profile/status", async (req, res) => {
  try {
    const restId = req.user.id;
    const { is_open } = req.body;

    // Ensure profile exists
    const count = await pool.query("SELECT 1 FROM restaurant_profiles WHERE user_id = $1", [restId]);
    if (count.rows.length === 0) {
      await pool.query("INSERT INTO restaurant_profiles (user_id, is_open) VALUES ($1, $2)", [restId, is_open]);
    } else {
      await pool.query("UPDATE restaurant_profiles SET is_open = $1 WHERE user_id = $2", [is_open, restId]);
    }
    res.json({ message: "Status updated", is_open });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
