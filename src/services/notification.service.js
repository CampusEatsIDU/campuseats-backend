const pool = require("../config/db");

class NotificationService {
    /**
     * Send a notification to a user
     * @param {number} userId - Target user ID
     * @param {string} type - Notification type
     * @param {string} message - Notification message
     */
    static async send(userId, type, message) {
        try {
            await pool.query(
                "INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)",
                [userId, type, message]
            );
        } catch (error) {
            console.error("Failed to send notification:", error.message);
        }
    }

    /**
     * Get notifications for a user
     */
    static async getForUser(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
        const offset = (page - 1) * limit;
        let query = `SELECT * FROM notifications WHERE user_id = $1`;
        const params = [userId];

        if (unreadOnly) {
            query += ` AND is_read = false`;
        }

        query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(notificationId, userId) {
        await pool.query(
            "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
            [notificationId, userId]
        );
    }

    /**
     * Get all notifications (admin view)
     */
    static async getAll({ page = 1, limit = 50 } = {}) {
        const offset = (page - 1) * limit;
        const result = await pool.query(
            `SELECT n.*, u.full_name, u.phone 
             FROM notifications n
             LEFT JOIN users u ON n.user_id = u.id
             ORDER BY n.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await pool.query("SELECT COUNT(*) FROM notifications");

        return {
            total: parseInt(countResult.rows[0].count, 10),
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            notifications: result.rows
        };
    }
}

module.exports = NotificationService;
