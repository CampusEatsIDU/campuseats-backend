const pool = require("../config/db");

class AuditService {
    /**
     * Log an admin action for audit trail
     * @param {number} adminId - The admin performing the action
     * @param {string} action - Action type (e.g. VERIFICATION_APPROVED, USER_BLOCKED)
     * @param {object} details - Additional details about the action
     */
    static async log(adminId, action, details = {}) {
        try {
            // Try inserting with 'details' column first (our migration ensures it exists)
            await pool.query(
                `INSERT INTO audit_logs (admin_id, action, details, metadata)
                 VALUES ($1, $2, $3, $3)`,
                [adminId, action, JSON.stringify(details)]
            );
        } catch (error) {
            // Fallback: try just details
            try {
                await pool.query(
                    `INSERT INTO audit_logs (admin_id, action, details)
                     VALUES ($1, $2, $3)`,
                    [adminId, action, JSON.stringify(details)]
                );
            } catch (e2) {
                // Final fallback: try metadata only
                try {
                    await pool.query(
                        `INSERT INTO audit_logs (admin_id, action, metadata)
                         VALUES ($1, $2, $3)`,
                        [adminId, action, JSON.stringify(details)]
                    );
                } catch (e3) {
                    console.error("Failed to log audit action:", e3.message);
                }
            }
        }
    }

    /**
     * Get audit logs with pagination and optional filtering
     */
    static async getLogs({ page = 1, limit = 50, action = null }) {
        const offset = (page - 1) * limit;
        const params = [];
        let whereClause = "";

        if (action) {
            whereClause = " WHERE al.action = $1";
            params.push(action);
        }

        const query = `
            SELECT al.*, u.full_name as admin_name, u.phone as admin_phone
            FROM audit_logs al
            LEFT JOIN users u ON al.admin_id = u.id
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Count
        let countQuery = `SELECT COUNT(*) FROM audit_logs al`;
        const countParams = [];
        if (action) {
            countQuery += ` WHERE al.action = $1`;
            countParams.push(action);
        }
        const countResult = await pool.query(countQuery, countParams);

        return {
            total: parseInt(countResult.rows[0].count, 10),
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            logs: result.rows
        };
    }
}

module.exports = AuditService;
