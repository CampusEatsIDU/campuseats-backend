/**
 * CampusEats SLA Worker
 * Runs every minute to check for SLA breaches and notify parties
 */

const cron = require('node-cron');
const pool = require('../config/db');

let bot, notifySuperAdminSLABreach;

// Lazy import to avoid circular dependency
function getBot() {
    if (!bot) {
        const courierModule = require('./courierBot');
        bot = courierModule.bot;
        notifySuperAdminSLABreach = courierModule.notifySuperAdminSLABreach;
    }
    return bot;
}

const startSLAWorker = () => {
    cron.schedule('* * * * *', async () => {
        const botInstance = getBot();
        try {
            // Find orders where SLA is breached and not yet marked
            const res = await pool.query(`
                SELECT 
                    o.id, 
                    o.courier_id, 
                    o.delivery_status,
                    o.sla_delivery_deadline,
                    c.telegram_id,
                    c.phone as courier_phone,
                    c.full_name as courier_name
                FROM orders o
                LEFT JOIN couriers c ON o.courier_id = c.id
                WHERE o.delivery_status NOT IN ('delivered', 'cancelled', 'attention_required')
                  AND o.sla_status IS NULL
                  AND o.sla_delivery_deadline IS NOT NULL
                  AND o.sla_delivery_deadline < NOW()
                  AND o.courier_id IS NOT NULL
            `);

            for (const row of res.rows) {
                console.log(`[SLA Worker] Breach detected: Order #${row.id}`);

                // Mark SLA as breached
                await pool.query("UPDATE orders SET sla_status = 'breached' WHERE id = $1", [row.id]);
                await pool.query("UPDATE courier_orders SET sla_status = 'breached' WHERE order_id = $1", [row.id]);

                // Slightly reduce courier rating (penalty for breach)
                if (row.courier_id) {
                    await pool.query(
                        'UPDATE couriers SET rating = GREATEST(1.0, rating - 0.05) WHERE id = $1',
                        [row.courier_id]
                    );
                }

                // Notify the courier
                if (row.telegram_id && botInstance) {
                    botInstance.sendMessage(
                        row.telegram_id,
                        [
                            `⚠️ *SLA Alert!*`,
                            ``,
                            `Order *#${row.id}* has exceeded the 35-minute delivery time.`,
                            `Please complete the delivery as soon as possible.`,
                            `Your rating has been slightly adjusted.`,
                        ].join('\n'),
                        { parse_mode: 'Markdown' }
                    ).catch(() => { });
                }

                // Notify SuperAdmin
                try {
                    if (notifySuperAdminSLABreach) {
                        await notifySuperAdminSLABreach(row, row.telegram_id);
                    }
                } catch { }
            }

            // Also check for orders that have been in 'accepted' status for too long without pickup (10 min)
            const stuckOrders = await pool.query(`
                SELECT o.id, o.courier_id, c.telegram_id
                FROM orders o
                LEFT JOIN couriers c ON o.courier_id = c.id
                WHERE o.delivery_status = 'accepted'
                  AND o.updated_at IS NOT NULL
                  AND o.updated_at < NOW() - INTERVAL '10 minutes'
                  AND o.courier_id IS NOT NULL
            `).catch(() => ({ rows: [] }));

            for (const order of stuckOrders.rows) {
                if (order.telegram_id && botInstance) {
                    botInstance.sendMessage(
                        order.telegram_id,
                        `⏰ Reminder: Please pick up Order *#${order.id}* from the restaurant!`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => { });
                }
            }

        } catch (error) {
            console.error('[SLA Worker] Error:', error.message);
        }
    });

    console.log('[SLA Worker] Started — checking every minute');
};

module.exports = { startSLAWorker };
