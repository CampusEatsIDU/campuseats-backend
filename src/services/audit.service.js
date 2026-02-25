const pool = require("../config/db");

class AuditService {
    static async log(adminId, action, details) {
        try {
            await pool.query(
                "INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, $2, $3)",
                [adminId, action, JSON.stringify(details)]
            );
        } catch (error) {
            console.error("Failed to log audit action:", error);
        }
    }
}

module.exports = AuditService;
