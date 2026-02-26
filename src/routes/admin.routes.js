const router = require("express").Router();
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const authMiddleware = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");
const NotificationService = require("../services/notification.service");
const AuditService = require("../services/audit.service");

// ═══════════════════════════════════════════
// PROTECT ALL /api/admin/* ROUTES
// ═══════════════════════════════════════════
router.use(authMiddleware);
router.use(requireRole("superadmin"));

// ═══════════════════════════════════════════
// DASHBOARD ANALYTICS
// ═══════════════════════════════════════════
router.get("/dashboard", async (req, res) => {
   try {
      // Total users (exclude superadmins from user count)
      const usersResult = await pool.query(
         "SELECT COUNT(*) as total FROM users WHERE role != 'superadmin'"
      );
      const totalUsers = parseInt(usersResult.rows[0].total, 10);

      // Total restaurants
      const restResult = await pool.query(
         "SELECT COUNT(*) as total FROM users WHERE role = 'restaurant'"
      );
      const totalRestaurants = parseInt(restResult.rows[0].total, 10);

      // Total orders
      let totalOrders = 0;
      let totalRevenue = 0;
      try {
         const ordersResult = await pool.query("SELECT COUNT(*) as total, COALESCE(SUM(total_price), 0) as revenue FROM orders");
         totalOrders = parseInt(ordersResult.rows[0].total, 10);
         totalRevenue = parseFloat(ordersResult.rows[0].revenue) || 0;
      } catch (e) {
         // orders table might not have data yet
      }

      // Verified students %
      const verifiedResult = await pool.query(
         "SELECT COUNT(*) FILTER (WHERE is_student_verified = true) as verified, COUNT(*) as total FROM users WHERE role = 'user'"
      );
      const verifiedStudents = parseInt(verifiedResult.rows[0].verified, 10);
      const totalStudents = parseInt(verifiedResult.rows[0].total, 10);
      const verifiedPercent = totalStudents > 0 ? Math.round((verifiedStudents / totalStudents) * 100) : 0;

      // Blocked accounts %
      const blockedResult = await pool.query(
         "SELECT COUNT(*) FILTER (WHERE status = 'blocked') as blocked, COUNT(*) as total FROM users WHERE role != 'superadmin'"
      );
      const blockedAccounts = parseInt(blockedResult.rows[0].blocked, 10);
      const blockedPercent = totalUsers > 0 ? Math.round((blockedAccounts / totalUsers) * 100) : 0;

      // Pending verifications
      const pendingResult = await pool.query(
         "SELECT COUNT(*) as total FROM student_verifications WHERE status = 'pending'"
      );
      const pendingVerifications = parseInt(pendingResult.rows[0].total, 10);

      // Recent audit logs count
      const auditResult = await pool.query("SELECT COUNT(*) as total FROM audit_logs");
      const totalLogs = parseInt(auditResult.rows[0].total, 10);

      // Users registered today
      let newUsersToday = 0;
      try {
         const todayResult = await pool.query(
            "SELECT COUNT(*) as total FROM users WHERE created_at >= CURRENT_DATE"
         );
         newUsersToday = parseInt(todayResult.rows[0].total, 10);
      } catch (e) { }

      res.json({
         totalUsers,
         totalRestaurants,
         totalOrders,
         totalRevenue,
         verifiedStudents,
         verifiedPercent,
         blockedAccounts,
         blockedPercent,
         pendingVerifications,
         totalLogs,
         newUsersToday,
         totalStudents
      });
   } catch (err) {
      console.error("Dashboard error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// ═══════════════════════════════════════════
// VERIFICATIONS
// ═══════════════════════════════════════════

// GET /api/admin/verifications?status=pending
router.get("/verifications", async (req, res) => {
   try {
      const { status, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

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

      query += ` ORDER BY sv.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Count
      let countQuery = `SELECT COUNT(*) FROM student_verifications sv`;
      const countParams = [];
      if (status) {
         countQuery += ` WHERE sv.status = $1`;
         countParams.push(status);
      }
      const countResult = await pool.query(countQuery, countParams);

      res.json({
         total: parseInt(countResult.rows[0].count, 10),
         page: parseInt(page, 10),
         limit: parseInt(limit, 10),
         verifications: result.rows
      });
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

      await NotificationService.send(
         userId,
         "VERIFICATION_APPROVED",
         "Your student verification has been approved! You now have access to student discounts."
      );

      await AuditService.log(adminId, "VERIFICATION_APPROVED", {
         verification_id: parseInt(id),
         target_user_id: userId
      });

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

      await NotificationService.send(
         userId,
         "VERIFICATION_REJECTED",
         `Your student verification was rejected. Reason: ${rejection_reason}. You can resubmit with corrected photos.`
      );

      await AuditService.log(adminId, "VERIFICATION_REJECTED", {
         verification_id: parseInt(id),
         target_user_id: userId,
         reason: rejection_reason
      });

      res.json({ message: "Verification rejected successfully" });
   } catch (err) {
      console.error("Reject verification error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// ═══════════════════════════════════════════
// RESTAURANTS
// ═══════════════════════════════════════════

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
         `INSERT INTO users (phone, password, role, full_name, is_student_verified, status)
         VALUES ($1, $2, 'restaurant', $3, true, 'active')
         RETURNING id, phone`,
         [phone, hashedPassword, restaurant_name || "Restaurant"]
      );

      await AuditService.log(adminId, "RESTAURANT_CREATED", {
         target_user_id: result.rows[0].id,
         phone
      });

      await NotificationService.send(
         result.rows[0].id,
         "RESTAURANT_CREATED",
         `Welcome to CampusEats! Your restaurant account has been created.`
      );

      res.status(201).json({
         message: "Restaurant created successfully. SAVE THE PASSWORD - SHOWN ONCE ONLY.",
         restaurant: {
            id: result.rows[0].id,
            phone: result.rows[0].phone,
            temporary_password: tempPassword
         }
      });
   } catch (err) {
      if (err.code === "23505") {
         return res.status(400).json({ message: "Phone already exists" });
      }
      console.error("Create restaurant error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// GET /api/admin/restaurants - list all restaurants with stats
router.get("/restaurants", async (req, res) => {
   try {
      const { page = 1, limit = 50, search = "" } = req.query;
      const offset = (page - 1) * limit;
      const searchTerm = `%${search}%`;

      const result = await pool.query(
         `SELECT u.id, u.phone, u.full_name, u.status, u.created_at
          FROM users u
          WHERE u.role = 'restaurant' AND (u.phone ILIKE $1 OR u.full_name ILIKE $1)
          ORDER BY u.id DESC
          LIMIT $2 OFFSET $3`,
         [searchTerm, limit, offset]
      );

      const countResult = await pool.query(
         `SELECT COUNT(*) FROM users WHERE role = 'restaurant' AND (phone ILIKE $1 OR full_name ILIKE $1)`,
         [searchTerm]
      );

      // Get order stats for each restaurant
      const restaurants = [];
      for (const rest of result.rows) {
         let orderCount = 0;
         let totalRevenue = 0;
         try {
            const stats = await pool.query(
               `SELECT COUNT(*) as order_count, COALESCE(SUM(total_price), 0) as revenue
                FROM orders WHERE restaurant_id = $1`,
               [rest.id]
            );
            orderCount = parseInt(stats.rows[0].order_count, 10);
            totalRevenue = parseFloat(stats.rows[0].revenue) || 0;
         } catch (e) { }

         restaurants.push({
            ...rest,
            order_count: orderCount,
            total_revenue: totalRevenue
         });
      }

      res.json({
         total: parseInt(countResult.rows[0].count, 10),
         page: parseInt(page, 10),
         limit: parseInt(limit, 10),
         restaurants
      });
   } catch (err) {
      console.error("Get restaurants error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// ═══════════════════════════════════════════
// USERS MANAGEMENT
// ═══════════════════════════════════════════

// GET /api/admin/users (pagination/search)
router.get("/users", async (req, res) => {
   try {
      const { page = 1, limit = 20, search = "", role = "", status = "" } = req.query;
      const offset = (page - 1) * limit;

      const searchTerm = `%${search}%`;
      let query = `
         SELECT id, phone, role, full_name, status, is_student_verified, 
                student_verified_at, balance, created_at, is_blocked, is_banned
         FROM users
         WHERE (phone ILIKE $1 OR full_name ILIKE $1)
      `;
      const params = [searchTerm];
      let paramIdx = 2;

      if (role) {
         query += ` AND role = $${paramIdx}`;
         params.push(role);
         paramIdx++;
      }

      if (status) {
         query += ` AND status = $${paramIdx}`;
         params.push(status);
         paramIdx++;
      }

      query += ` ORDER BY id DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(parseInt(limit), offset);

      // Count query
      let countQuery = `
         SELECT COUNT(*) FROM users
         WHERE (phone ILIKE $1 OR full_name ILIKE $1)
      `;
      const countParams = [searchTerm];
      let countIdx = 2;

      if (role) {
         countQuery += ` AND role = $${countIdx}`;
         countParams.push(role);
         countIdx++;
      }

      if (status) {
         countQuery += ` AND status = $${countIdx}`;
         countParams.push(status);
         countIdx++;
      }

      const result = await pool.query(query, params);
      const countResult = await pool.query(countQuery, countParams);

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

// GET /api/admin/users/:id - single user details
router.get("/users/:id", async (req, res) => {
   try {
      const { id } = req.params;

      const userResult = await pool.query(
         `SELECT id, phone, role, full_name, status, is_student_verified, 
                 student_verified_at, balance, created_at, is_blocked, is_banned
          FROM users WHERE id = $1`,
         [id]
      );

      if (userResult.rows.length === 0) {
         return res.status(404).json({ message: "User not found" });
      }

      const user = userResult.rows[0];

      // Get order history
      let orders = [];
      try {
         const ordersResult = await pool.query(
            `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [id]
         );
         orders = ordersResult.rows;
      } catch (e) { }

      // Get verification history
      const verifications = await pool.query(
         `SELECT * FROM student_verifications WHERE user_id = $1 ORDER BY created_at DESC`,
         [id]
      );

      // Get notifications
      const notifications = await pool.query(
         `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
         [id]
      );

      res.json({
         user,
         orders,
         verifications: verifications.rows,
         notifications: notifications.rows
      });
   } catch (err) {
      console.error("Get user detail error:", err.message);
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

      // Don't allow blocking other superadmins
      const targetUser = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
      if (targetUser.rows.length > 0 && targetUser.rows[0].role === "superadmin") {
         return res.status(400).json({ message: "Cannot block a superadmin" });
      }

      const result = await pool.query(
         `UPDATE users SET status = 'blocked' WHERE id = $1 RETURNING id`,
         [id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await NotificationService.send(id, "USER_BLOCKED", "Your account has been blocked by an administrator.");
      await AuditService.log(adminId, "USER_BLOCKED", { target_user_id: parseInt(id) });

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

      await NotificationService.send(id, "USER_UNBLOCKED", "Your account has been unblocked.");
      await AuditService.log(adminId, "USER_UNBLOCKED", { target_user_id: parseInt(id) });

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

      const targetUser = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
      if (targetUser.rows.length > 0 && targetUser.rows[0].role === "superadmin") {
         return res.status(400).json({ message: "Cannot delete a superadmin" });
      }

      const result = await pool.query(
         `UPDATE users SET status = 'deleted' WHERE id = $1 RETURNING id`,
         [id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await AuditService.log(adminId, "USER_DELETED", { target_user_id: parseInt(id), type: "soft" });

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

      const targetUser = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
      if (targetUser.rows.length > 0 && targetUser.rows[0].role === "superadmin") {
         return res.status(400).json({ message: "Cannot hard-delete a superadmin" });
      }

      const result = await pool.query(
         `DELETE FROM users WHERE id = $1 RETURNING id`,
         [id]
      );

      if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

      await AuditService.log(adminId, "USER_DELETED", { target_user_id: parseInt(id), type: "hard" });

      res.json({ message: "User hard-deleted permanently" });
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

      await NotificationService.send(
         parseInt(id),
         "PASSWORD_RESET",
         "Your password has been reset by an administrator. Please contact admin for the new password."
      );
      await AuditService.log(adminId, "PASSWORD_RESET", { target_user_id: parseInt(id) });

      res.json({
         message: "Password reset successfully. SAVE THE PASSWORD - SHOWN ONCE ONLY.",
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

// POST /api/admin/users/:id/change-role
router.post("/users/:id/change-role", async (req, res) => {
   try {
      const { id } = req.params;
      const { newRole } = req.body;
      const adminId = req.user.id;

      if (parseInt(id) === adminId) {
         return res.status(400).json({ message: "Cannot change your own role" });
      }

      const validRoles = ["user", "restaurant"];
      if (!validRoles.includes(newRole)) {
         return res.status(400).json({ message: "Invalid role. Allowed: user, restaurant" });
      }

      const oldUser = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
      if (oldUser.rows.length === 0) return res.status(404).json({ message: "User not found" });

      if (oldUser.rows[0].role === "superadmin") {
         return res.status(400).json({ message: "Cannot change superadmin role" });
      }

      const oldRole = oldUser.rows[0].role;

      await pool.query(
         `UPDATE users SET role = $1 WHERE id = $2`,
         [newRole, id]
      );

      await AuditService.log(adminId, "ROLE_CHANGED", {
         target_user_id: parseInt(id),
         old_role: oldRole,
         new_role: newRole
      });

      await NotificationService.send(
         parseInt(id),
         "ROLE_CHANGED",
         `Your role has been changed from ${oldRole} to ${newRole}.`
      );

      res.json({ message: `Role changed from ${oldRole} to ${newRole}` });
   } catch (err) {
      console.error("Change role error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// ═══════════════════════════════════════════
// ORDERS (read-only)
// ═══════════════════════════════════════════
router.get("/orders", async (req, res) => {
   try {
      const { page = 1, limit = 50, user_id, restaurant_id, status, date_from, date_to } = req.query;
      const offset = (page - 1) * limit;

      let query = `
         SELECT o.*, 
                u.full_name as user_name, u.phone as user_phone,
                r.full_name as restaurant_name
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         LEFT JOIN users r ON o.restaurant_id = r.id
         WHERE 1=1
      `;
      const params = [];
      let paramIdx = 1;

      if (user_id) {
         query += ` AND o.user_id = $${paramIdx}`;
         params.push(user_id);
         paramIdx++;
      }

      if (restaurant_id) {
         query += ` AND o.restaurant_id = $${paramIdx}`;
         params.push(restaurant_id);
         paramIdx++;
      }

      if (status) {
         query += ` AND o.status = $${paramIdx}`;
         params.push(status);
         paramIdx++;
      }

      if (date_from) {
         query += ` AND o.created_at >= $${paramIdx}`;
         params.push(date_from);
         paramIdx++;
      }

      if (date_to) {
         query += ` AND o.created_at <= $${paramIdx}`;
         params.push(date_to);
         paramIdx++;
      }

      query += ` ORDER BY o.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(parseInt(limit), offset);

      const result = await pool.query(query, params);

      // Count with same filters
      let countQuery = `SELECT COUNT(*) FROM orders o WHERE 1=1`;
      const countParams = [];
      let cIdx = 1;

      if (user_id) {
         countQuery += ` AND o.user_id = $${cIdx}`;
         countParams.push(user_id);
         cIdx++;
      }
      if (restaurant_id) {
         countQuery += ` AND o.restaurant_id = $${cIdx}`;
         countParams.push(restaurant_id);
         cIdx++;
      }
      if (status) {
         countQuery += ` AND o.status = $${cIdx}`;
         countParams.push(status);
         cIdx++;
      }
      if (date_from) {
         countQuery += ` AND o.created_at >= $${cIdx}`;
         countParams.push(date_from);
         cIdx++;
      }
      if (date_to) {
         countQuery += ` AND o.created_at <= $${cIdx}`;
         countParams.push(date_to);
         cIdx++;
      }

      let total = 0;
      try {
         const countResult = await pool.query(countQuery, countParams);
         total = parseInt(countResult.rows[0].count, 10);
      } catch (e) { }

      res.json({
         total,
         page: parseInt(page, 10),
         limit: parseInt(limit, 10),
         orders: result.rows
      });
   } catch (err) {
      console.error("Get orders error:", err.message);
      res.status(500).json({ message: "Server error. Could not load orders." });
   }
});

// GET /api/admin/orders/:id - single order detail
router.get("/orders/:id", async (req, res) => {
   try {
      const { id } = req.params;

      const orderResult = await pool.query(
         `SELECT o.*, 
                 u.full_name as user_name, u.phone as user_phone,
                 r.full_name as restaurant_name
          FROM orders o
          LEFT JOIN users u ON o.user_id = u.id
          LEFT JOIN users r ON o.restaurant_id = r.id
          WHERE o.id = $1`,
         [id]
      );

      if (orderResult.rows.length === 0) {
         return res.status(404).json({ message: "Order not found" });
      }

      // Get order items
      let items = [];
      try {
         const itemsResult = await pool.query(
            "SELECT * FROM order_items WHERE order_id = $1",
            [id]
         );
         items = itemsResult.rows;
      } catch (e) { }

      res.json({
         order: orderResult.rows[0],
         items
      });
   } catch (err) {
      console.error("Get order detail error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// ═══════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════
router.get("/audit", async (req, res) => {
   try {
      const { page = 1, limit = 50, action } = req.query;
      const result = await AuditService.getLogs({ page, limit, action });
      res.json(result);
   } catch (err) {
      console.error("Get audit logs error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// ═══════════════════════════════════════════
// NOTIFICATIONS (admin view)
// ═══════════════════════════════════════════
router.get("/notifications", async (req, res) => {
   try {
      const { page = 1, limit = 50 } = req.query;
      const result = await NotificationService.getAll({ page: parseInt(page), limit: parseInt(limit) });
      res.json(result);
   } catch (err) {
      console.error("Get notifications error:", err.message);
      res.status(500).json({ message: "Server error" });
   }
});

// ═══════════════════════════════════════════
// COURIER MANAGEMENT (SuperAdmin)
// ═══════════════════════════════════════════
const courierService = require('../services/courier.service');

// GET /api/admin/couriers — list all couriers with stats
router.get('/couriers', async (req, res) => {
   try {
      const { page = 1, limit = 50, search = '', status = '' } = req.query;
      const result = await courierService.listCouriers({
         page: parseInt(page),
         limit: parseInt(limit),
         search,
         status
      });
      res.json(result);
   } catch (err) {
      console.error('List couriers error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// POST /api/admin/couriers — create courier with generated temporary password
router.post('/couriers', async (req, res) => {
   try {
      const { full_name, phone, transport_type, city } = req.body;

      if (!full_name || !phone) {
         return res.status(400).json({ message: 'full_name and phone are required' });
      }

      // Check if phone already exists
      const exists = await pool.query('SELECT id FROM couriers WHERE phone = $1', [phone]);
      if (exists.rows.length > 0) {
         return res.status(400).json({ message: 'Phone already registered as courier' });
      }

      // Generate 8-digit numeric temporary password
      const tempPassword = String(Math.floor(10000000 + Math.random() * 90000000));

      const courier = await courierService.createCourier(phone, tempPassword, full_name);

      await AuditService.log(req.user.id, 'COURIER_CREATED', {
         courier_id: courier.id,
         phone,
         full_name,
         transport_type: transport_type || null,
         city: city || null
      });

      res.status(201).json({
         message: 'Courier created successfully. SAVE THE PASSWORD - SHOWN ONCE ONLY.',
         courier: {
            id: courier.id,
            full_name: courier.full_name,
            phone: courier.phone,
            status: courier.status,
            rating: courier.rating,
            created_at: courier.created_at,
            temporary_password: tempPassword
         }
      });
   } catch (err) {
      console.error('Create courier error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// Legacy: POST /api/admin/couriers/create — keep for backward compatibility
router.post('/couriers/create', async (req, res) => {
   try {
      const { phone, password, full_name } = req.body;
      if (!phone || !password) {
         return res.status(400).json({ message: 'Phone and password are required' });
      }

      const exists = await pool.query('SELECT id FROM couriers WHERE phone = $1', [phone]);
      if (exists.rows.length > 0) {
         return res.status(400).json({ message: 'Phone already registered as courier' });
      }

      const courier = await courierService.createCourier(phone, password, full_name);

      await AuditService.log(req.user.id, 'COURIER_CREATED', {
         courier_id: courier.id,
         phone,
         full_name
      });

      res.status(201).json({
         message: 'Courier created successfully',
         courier: {
            id: courier.id,
            phone: courier.phone,
            full_name: courier.full_name,
            status: courier.status,
            rating: courier.rating,
            created_at: courier.created_at,
            temporary_password: password
         }
      });
   } catch (err) {
      console.error('Create courier error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// GET /api/admin/couriers/:id — courier detail
router.get('/couriers/:id', async (req, res) => {
   try {
      const detail = await courierService.getCourierDetail(req.params.id);
      if (!detail) return res.status(404).json({ message: 'Courier not found' });
      res.json(detail);
   } catch (err) {
      console.error('Courier detail error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// POST /api/admin/couriers/:id/block
router.post('/couriers/:id/block', async (req, res) => {
   try {
      const courier = await courierService.blockCourier(req.params.id);
      if (!courier) return res.status(404).json({ message: 'Courier not found' });

      await AuditService.log(req.user.id, 'COURIER_BLOCKED', { courier_id: req.params.id });

      // Notify the courier via bot
      try {
         const { bot } = require('../bot/courierBot');
         const courierData = await pool.query('SELECT telegram_id FROM couriers WHERE id = $1', [req.params.id]);
         const tgId = courierData.rows[0]?.telegram_id;
         if (tgId) {
            bot.sendMessage(tgId, '🚫 Your courier account has been *blocked* by the administrator.\nContact SuperAdmin for more information.', { parse_mode: 'Markdown' }).catch(() => { });
         }
      } catch { }

      res.json({ message: 'Courier blocked', courier });
   } catch (err) {
      console.error('Block courier error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// POST /api/admin/couriers/:id/unblock
router.post('/couriers/:id/unblock', async (req, res) => {
   try {
      const courier = await courierService.unblockCourier(req.params.id);
      if (!courier) return res.status(404).json({ message: 'Courier not found' });

      await AuditService.log(req.user.id, 'COURIER_UNBLOCKED', { courier_id: req.params.id });

      // Notify the courier
      try {
         const { bot } = require('../bot/courierBot');
         const courierData = await pool.query('SELECT telegram_id FROM couriers WHERE id = $1', [req.params.id]);
         const tgId = courierData.rows[0]?.telegram_id;
         if (tgId) {
            bot.sendMessage(tgId, '✅ Your courier account has been *unblocked*.\nYou can now go online and receive orders.', { parse_mode: 'Markdown' }).catch(() => { });
         }
      } catch { }

      res.json({ message: 'Courier unblocked', courier });
   } catch (err) {
      console.error('Unblock courier error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// PATCH /api/admin/couriers/:id/status — unified status change (active / blocked)
router.patch('/couriers/:id/status', async (req, res) => {
   try {
      const { status } = req.body;
      const { id } = req.params;

      if (!status || !['active', 'blocked'].includes(status)) {
         return res.status(400).json({ message: "Invalid status. Allowed: 'active', 'blocked'" });
      }

      let courier;

      if (status === 'blocked') {
         courier = await courierService.blockCourier(id);
         if (!courier) return res.status(404).json({ message: 'Courier not found' });

         await AuditService.log(req.user.id, 'COURIER_BLOCKED', { courier_id: parseInt(id) });

         // Notify the courier via bot (same as /block)
         try {
            const { bot } = require('../bot/courierBot');
            const courierData = await pool.query('SELECT telegram_id FROM couriers WHERE id = $1', [id]);
            const tgId = courierData.rows[0]?.telegram_id;
            if (tgId) {
               bot.sendMessage(
                  tgId,
                  '🚫 Your courier account has been *blocked* by the administrator.\nContact SuperAdmin for more information.',
                  { parse_mode: 'Markdown' }
               ).catch(() => { });
            }
         } catch { }
      } else {
         courier = await courierService.unblockCourier(id);
         if (!courier) return res.status(404).json({ message: 'Courier not found' });

         await AuditService.log(req.user.id, 'COURIER_UNBLOCKED', { courier_id: parseInt(id) });

         // Notify the courier (same as /unblock)
         try {
            const { bot } = require('../bot/courierBot');
            const courierData = await pool.query('SELECT telegram_id FROM couriers WHERE id = $1', [id]);
            const tgId = courierData.rows[0]?.telegram_id;
            if (tgId) {
               bot.sendMessage(
                  tgId,
                  '✅ Your courier account has been *unblocked*.\nYou can now go online and receive orders.',
                  { parse_mode: 'Markdown' }
               ).catch(() => { });
            }
         } catch { }
      }

      res.json({ message: 'Courier status updated', courier });
   } catch (err) {
      console.error('Update courier status error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// POST /api/admin/couriers/:id/reset-password
router.post('/couriers/:id/reset-password', async (req, res) => {
   try {
      // Generate new 8-digit numeric temporary password
      const newPassword = String(Math.floor(10000000 + Math.random() * 90000000));
      const courier = await courierService.resetCourierPassword(req.params.id, newPassword);
      if (!courier) return res.status(404).json({ message: 'Courier not found' });

      await AuditService.log(req.user.id, 'COURIER_PASSWORD_RESET', { courier_id: req.params.id });

      res.json({
         message: 'Password reset successfully. SAVE THE PASSWORD — SHOWN ONCE ONLY.',
         courier: {
            id: courier.id,
            phone: courier.phone,
            temporary_password: newPassword
         }
      });
   } catch (err) {
      console.error('Reset courier password error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// GET /api/admin/couriers/incidents — all open SOS incidents
router.get('/courier-incidents', async (req, res) => {
   try {
      const { status = 'open', page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(`
         SELECT ci.*, 
                c.phone as courier_phone, c.full_name as courier_name,
                o.delivery_address, o.total_price
         FROM courier_incidents ci
         LEFT JOIN couriers c ON ci.courier_id = c.id
         LEFT JOIN orders o ON ci.order_id = o.id
         WHERE ci.status = $1
         ORDER BY ci.created_at DESC
         LIMIT $2 OFFSET $3
      `, [status, limit, offset]);

      const countResult = await pool.query(
         'SELECT COUNT(*) FROM courier_incidents WHERE status = $1',
         [status]
      );

      res.json({
         total: parseInt(countResult.rows[0].count),
         incidents: result.rows
      });
   } catch (err) {
      console.error('Get incidents error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

// POST /api/admin/courier-incidents/:id/resolve
router.post('/courier-incidents/:id/resolve', async (req, res) => {
   try {
      const result = await pool.query(
         "UPDATE courier_incidents SET status = 'resolved' WHERE id = $1 RETURNING *",
         [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: 'Incident not found' });

      await AuditService.log(req.user.id, 'INCIDENT_RESOLVED', { incident_id: req.params.id });
      res.json({ message: 'Incident resolved', incident: result.rows[0] });
   } catch (err) {
      res.status(500).json({ message: 'Server error' });
   }
});

// GET /api/admin/courier-sla-breaches — orders with SLA breaches
router.get('/courier-sla-breaches', async (req, res) => {
   try {
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(`
         SELECT o.id, o.delivery_status, o.sla_delivery_deadline, o.created_at,
                c.phone as courier_phone, c.full_name as courier_name, c.rating as courier_rating
         FROM orders o
         LEFT JOIN couriers c ON o.courier_id = c.id
         WHERE o.sla_status = 'breached'
         ORDER BY o.sla_delivery_deadline DESC
         LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const countResult = await pool.query("SELECT COUNT(*) FROM orders WHERE sla_status = 'breached'");

      res.json({
         total: parseInt(countResult.rows[0].count),
         breaches: result.rows
      });
   } catch (err) {
      res.status(500).json({ message: 'Server error' });
   }
});

// GET /api/admin/cash-submissions — pending cash submissions from couriers
router.get('/cash-submissions', async (req, res) => {
   try {
      const { status = 'pending' } = req.query;

      const result = await pool.query(`
         SELECT cm.*, c.phone as courier_phone, c.full_name as courier_name, c.cash_on_hand
         FROM cash_movements cm
         LEFT JOIN couriers c ON cm.courier_id = c.id
         WHERE cm.type = 'cash_submitted' AND cm.status = $1
         ORDER BY cm.created_at DESC
      `, [status]);

      res.json({ submissions: result.rows });
   } catch (err) {
      res.status(500).json({ message: 'Server error' });
   }
});

// POST /api/admin/cash-submissions/:id/confirm
router.post('/cash-submissions/:id/confirm', async (req, res) => {
   try {
      const movement = await courierService.confirmCashSubmission(req.params.id);
      if (!movement) return res.status(404).json({ message: 'Cash movement not found or already processed' });

      await AuditService.log(req.user.id, 'CASH_SUBMISSION_CONFIRMED', {
         movement_id: req.params.id,
         amount: movement.amount,
         courier_id: movement.courier_id
      });

      // Notify courier
      try {
         const { bot } = require('../bot/courierBot');
         const courierData = await pool.query('SELECT telegram_id, full_name, phone FROM couriers WHERE id = $1', [movement.courier_id]);
         const tgId = courierData.rows[0]?.telegram_id;
         if (tgId) {
            bot.sendMessage(
               tgId,
               `✅ *Cash Submission Confirmed!*\n\nAmount: *${Number(movement.amount).toLocaleString('uz-UZ')} UZS*\nThe administrator has confirmed your cash submission.`,
               { parse_mode: 'Markdown' }
            ).catch(() => { });
         }
      } catch { }

      res.json({ message: 'Cash submission confirmed', movement });
   } catch (err) {
      res.status(500).json({ message: 'Server error' });
   }
});

// GET /api/admin/courier-dashboard — consolidated courier stats
router.get('/courier-dashboard', async (req, res) => {
   try {
      const totalCouriers = await pool.query('SELECT COUNT(*) FROM couriers');
      const onlineCouriers = await pool.query("SELECT COUNT(*) FROM couriers WHERE is_online = true AND status = 'active'");
      const activeDeliveries = await pool.query("SELECT COUNT(*) FROM orders WHERE delivery_status NOT IN ('delivered','cancelled') AND courier_id IS NOT NULL");
      const slaBreaches = await pool.query("SELECT COUNT(*) FROM orders WHERE sla_status = 'breached'");
      const openIncidents = await pool.query("SELECT COUNT(*) FROM courier_incidents WHERE status = 'open'");
      const pendingCash = await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE type = 'cash_submitted' AND status = 'pending'");
      const totalCashOnHand = await pool.query("SELECT COALESCE(SUM(cash_on_hand), 0) as total FROM couriers");
      const avgRating = await pool.query("SELECT ROUND(AVG(rating)::numeric, 2) as avg FROM couriers WHERE completed_orders > 0");

      res.json({
         totalCouriers: parseInt(totalCouriers.rows[0].count),
         onlineCouriers: parseInt(onlineCouriers.rows[0].count),
         activeDeliveries: parseInt(activeDeliveries.rows[0].count),
         slaBreaches: parseInt(slaBreaches.rows[0].count),
         openIncidents: parseInt(openIncidents.rows[0].count),
         pendingCashSubmissions: parseFloat(pendingCash.rows[0].total),
         totalCashOnHand: parseFloat(totalCashOnHand.rows[0].total),
         avgCourierRating: parseFloat(avgRating.rows[0].avg) || 5.0
      });
   } catch (err) {
      console.error('Courier dashboard error:', err.message);
      res.status(500).json({ message: 'Server error' });
   }
});

module.exports = router;

