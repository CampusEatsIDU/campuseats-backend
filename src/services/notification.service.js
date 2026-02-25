const pool = require("../config/db");

class NotificationService {
    static async send(userId, type, message) {
        try {
            await pool.query(
                "INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)",
                [userId, type, message]
            );
            // In a real app, you might also push to FCM, WebSocket, or Telegram here
        } catch (error) {
            console.error("Failed to send notification:", error);
        }
    }
}

module.exports = NotificationService;
