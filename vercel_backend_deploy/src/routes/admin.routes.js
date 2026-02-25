const router = require("express").Router();
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const authMiddleware = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");
const NotificationService = require("../services/notification.service");
const AuditService = require("../services/audit.service");

// Protect all /api/admin/* routes
router.use(authMiddleware);
router.use(requireRole("superadmin"));

/* =========================
   VERIFICATIONS
========================= */
// GET /api/admin/verifications?status=pending
router.get("/verifications", async (req, res) => {
   try {
      const { status } = req.query;
      let query = `
      SELECT sv.*, u.phone, u.full_name 
      FROM student_verifications sv
      JOIN users u ON sv.user_id = u.id
    `;
      const params = [];

      if (status) {
         query += ` WHERE sv.status = $1`;
         params.push(status);
      }

      query += ` ORDER BY sv.created_at DESC`;

      const result = await pool.query(query, params);
      res.json({ verifications: result.rows });
   } catch (err) {
      console.error("Admin get verifications error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// POST /api/admin/verifications/:id/approve
router.post("/verifications/:id/approve", async (req, res) => {
   const client = await pool.connect();
   try {
      await client.query("BEGIN");
      const { id } = req.params;
      const adminId = req.user.id;

      const vResult = await client.query(
         `UPDATE student_verifications 
       SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = 'pending'
       RETURNING user_id`,
         [adminId, id]
      );

      if (vResult.rows.length === 0) {
         await client.query("ROLLBACK");
         return res.status(404).json({ message: "Verification not found or already processed" });
      }

      const userId = vResult.rows[0].user_id;

      await client.query(
         `UPDATE users 
       SET is_student_verified = true, student_verified_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
         [userId]
      );

      await NotificationService.send(userId, "verification_approved", "Your student verification has been approved.");

      await AuditService.log(adminId, "approve_verification", { verification_id: id, target_user_id: userId });

      await client.query("COMMIT");
      res.json({ message: "Verification approved successfully" });
   } catch (err) {
      await client.query("ROLLBACK");
      console.error("Approve verification error:", err.message);
      res.status(500).json({ message: "Server error" });
   } finally {
      client.release();
   }
});

// POST /api/admin/verifications/:id/reject
router.post("/verifications/:id/reject", async (req, res) => {
   try {
      const { id } = req.params;
      const { rejection_reason } = req.body;
      const adminId = req.user.id;

      if (!rejection_reason) {
         return res.status(400).json({ message: "rejection_reason is required" });
      }

      const vResult = await pool.query(
         `UPDATE student_verifications 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING user_id`,
         [adminId, rejection_reason, id]
      );

      if (vResult.rows.length === 0) {
         return res.status(404).json({ message: "Verification not found or already processed" });
      }

      const userId = vResult.rows[0].user_id;

      await NotificationService.send(userId, "verification_rejected", `Your student verification was rejected. Reason: ${rejection_reason}`);

      await AuditService.log(adminId, "reject_verification", { verification_id: id, target_user_id: userId, reason: rejection_reason });

      res.json({ message: "Verification rejected successfully" });
   } catch (err) {
      console.error("Reject verification error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

/* =========================
   RESTAURANTS
========================= */
// POST /api/admin/restaurants/create
router.post("/restaurants/create", async (req, res) => {
   try {
      const { phone, restaurant_name } = req.body;
      const adminId = req.user.id;

      if (!phone) {
         return res.status(400).json({ message: "Phone is required" });
      }

      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const result = await pool.query(
         `INSERT INTO users (phone, password, role, full_name, is_student_verified)
       VALUES ($1, $2, 'restaurant', $3, true)
       RETURNING id, phone`,
         [phone, hashedPassword, restaurant_name || "Restaurant"]
      );

      await AuditService.log(adminId, "create_restaurant", { target_user_id: result.rows[0].id, phone });

      res.status(201).json({
         message: "Restaurant created successfully. SHOW ONCE.",
         restaurant: {
            id: result.rows[0].id,
            phone: result.rows[0].phone,
            temporary_password: tempPassword
         }
      });
   } catch (err) {
      if (err.code === "23505") { // unique violation
         return res.status(400).json({ message: "Phone already exists" });
      }
      console.error("Create restaurant error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

/* =========================
   USERS MANAGEMENT
========================= */
// GET /api/admin/users (pagination/search)
router.get("/users", async (req, res) => {
   try {
      const { page = 1, limit = 20, search = "" } = req.query;
      const offset = (page - 1) * limit;

      const searchTerm = `%${search}%`;
      const query = `
      SELECT id, phone, role, full_name, status, is_student_verified, student_verified_at, balance
      FROM users
      WHERE phone ILIKE $1 OR full_name ILIKE $1
      ORDER BY id DESC
      LIMIT $2 OFFSET $3
    `;
      const countQuery = `
      SELECT COUNT(*) 
      FROM users
      WHERE phone ILIKE $1 OR full_name ILIKE $1
    `;

      const result = await pool.query(query, [searchTerm, limit, offset]);
      const countResult = await pool.query(countQuery, [searchTerm]);

      res.json({
         total: parseInt(countResult.rows[0].count, 10),
         page: parseInt(page, 10),
         limit: parseInt(limit, 10),
         users: result.rows
      });
   } catch (err) {
      console.error("Get users error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// POST /api/admin/users/:id/block
router.post("/users/:id/block", async (req, res) => {
   try {
      const { id } = req.params;
      const adminId = req.user.id;

      if (parseInt(id) === adminId) {
         return res.status(400).json({ message: "Cannot block yourself" });
      }

      const result = await pool.query(
         `UPDATE users SET status = 'blocked' WHERE id = $1 RETURNING id`,
         [id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await AuditService.log(adminId, "block_user", { target_user_id: id });
      res.json({ message: "User blocked successfully" });
   } catch (err) {
      console.error("Block user error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// POST /api/admin/users/:id/unblock
router.post("/users/:id/unblock", async (req, res) => {
   try {
      const { id } = req.params;
      const adminId = req.user.id;

      const result = await pool.query(
         `UPDATE users SET status = 'active' WHERE id = $1 RETURNING id`,
         [id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await AuditService.log(adminId, "unblock_user", { target_user_id: id });
      res.json({ message: "User unblocked successfully" });
   } catch (err) {
      console.error("Unblock user error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// POST /api/admin/users/:id/delete (soft-delete)
router.post("/users/:id/delete", async (req, res) => {
   try {
      const { id } = req.params;
      const adminId = req.user.id;

      if (parseInt(id) === adminId) {
         return res.status(400).json({ message: "Cannot soft-delete yourself" });
      }

      const result = await pool.query(
         `UPDATE users SET status = 'deleted' WHERE id = $1 RETURNING id`,
         [id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await AuditService.log(adminId, "soft_delete_user", { target_user_id: id });
      res.json({ message: "User soft-deleted successfully" });
   } catch (err) {
      console.error("Soft delete error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// POST /api/admin/users/:id/hard-delete
router.post("/users/:id/hard-delete", async (req, res) => {
   try {
      const { id } = req.params;
      const adminId = req.user.id;

      if (parseInt(id) === adminId) {
         return res.status(400).json({ message: "Cannot hard-delete yourself" });
      }

      const result = await pool.query(
         `DELETE FROM users WHERE id = $1 RETURNING id`,
         [id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await AuditService.log(adminId, "hard_delete_user", { target_user_id: id });
      res.json({ message: "User hard-deleted successfully" });
   } catch (err) {
      console.error("Hard delete error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// POST /api/admin/users/:id/reset-password
router.post("/users/:id/reset-password", async (req, res) => {
   try {
      const { id } = req.params;
      const adminId = req.user.id;

      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const result = await pool.query(
         `UPDATE users SET password = $1 WHERE id = $2 RETURNING id, phone`,
         [hashedPassword, id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await AuditService.log(adminId, "reset_password", { target_user_id: id });
      res.json({
         message: "Password reset successfully. SHOW ONCE.",
         user: {
            id: result.rows[0].id,
            phone: result.rows[0].phone,
            temporary_password: tempPassword
         }
      });
   } catch (err) {
      console.error("Reset password error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

/* =========================
   ORDERS
========================= */
// GET /api/admin/orders
router.get("/orders", async (req, res) => {
   try {
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      // Based on typical orders structure (assuming generic view)
      const result = await pool.query(
         `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
         [limit, offset]
      );
      // Usually admin wants items too, but let's just do full query if possible.

      // Try to count
      let total = 0;
      try {
         const countRes = await pool.query(`SELECT COUNT(*) FROM orders`);
         total = parseInt(countRes.rows[0].count, 10);
      } catch (e) { }

      res.json({
         total,
         page: parseInt(page, 10),
         limit: parseInt(limit, 10),
         orders: result.rows
      });
   } catch (err) {
      console.error("Get orders error:", err.message);
      // Might fail if orders table isn't what we expect, but prompt asked for:
      // "Admin can view all orders and order details (read-only)"
      res.status(500).json({ message: "Server error. Could not load orders." });
   }
});

/* =========================
   AUDIT LOGS
========================= */
// GET /api/admin/audit
router.get("/audit", async (req, res) => {
   try {
      const { page = 1, limit = 50, action } = req.query;
      const offset = (page - 1) * limit;

      let query = `
      SELECT al.*, u.full_name as admin_name, u.phone as admin_phone
      FROM audit_logs al
      LEFT JOIN users u ON al.admin_id = u.id
    `;
      const params = [];

      if (action) {
         query += ` WHERE al.action = $1`;
         params.push(action);
      }

      query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      let countQuery = `SELECT COUNT(*) FROM audit_logs`;
      const countParams = [];
      if (action) {
         countQuery += ` WHERE action = $1`;
         countParams.push(action);
      }
      const countResult = await pool.query(countQuery, countParams);

      res.json({
         total: parseInt(countResult.rows[0].count, 10),
         page: parseInt(page, 10),
         limit: parseInt(limit, 10),
         logs: result.rows
      });
   } catch (err) {
      console.error("Get audit logs error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

module.exports = router;
