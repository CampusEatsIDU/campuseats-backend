/**
 * CampusEats Courier Service
 * Handles all courier business logic with race-condition protection using DB transactions
 */

const pool = require('../config/db');
const bcrypt = require('bcrypt');

class CourierService {

    // ──────────────────────────────────────────────
    // AUTH & PROFILE
    // ──────────────────────────────────────────────

    async getCourierByTelegramId(telegramId) {
        const res = await pool.query('SELECT * FROM couriers WHERE telegram_id = $1', [telegramId]);
        return res.rows[0] || null;
    }

    async getCourierById(courierId) {
        const res = await pool.query('SELECT * FROM couriers WHERE id = $1', [courierId]);
        return res.rows[0] || null;
    }

    async login(phone, password, telegramId) {
        const res = await pool.query('SELECT * FROM couriers WHERE phone = $1', [phone]);
        const courier = res.rows[0];
        if (!courier) return { success: false, message: 'Phone number not found' };

        const isMatch = await bcrypt.compare(password, courier.password_hash);
        if (!isMatch) return { success: false, message: 'Incorrect password' };

        if (courier.status !== 'active') return { success: false, message: 'Account is blocked or inactive' };

        // Save telegram_id if provided
        if (telegramId) {
            await pool.query('UPDATE couriers SET telegram_id = $1 WHERE id = $2', [telegramId, courier.id]);
        }

        // Audit log
        await this._auditLog('COURIER_LOGIN', courier.id, { phone, telegram_id: telegramId });

        return { success: true, courier: { ...courier, telegram_id: telegramId } };
    }

    async getCourierStats(courierId) {
        const res = await pool.query('SELECT * FROM couriers WHERE id = $1', [courierId]);
        return res.rows[0] || {};
    }

    // ──────────────────────────────────────────────
    // ONLINE / OFFLINE
    // ──────────────────────────────────────────────

    async setOnline(courierId, isOnline) {
        // Cannot go online if blocked
        const check = await pool.query('SELECT status, cash_on_hand FROM couriers WHERE id = $1', [courierId]);
        if (check.rows.length === 0) throw new Error('Courier not found');
        if (check.rows[0].status !== 'active') throw new Error('Blocked couriers cannot go online');

        const res = await pool.query(
            'UPDATE couriers SET is_online = $1 WHERE id = $2 RETURNING *',
            [isOnline, courierId]
        );
        await this._auditLog(isOnline ? 'COURIER_ONLINE' : 'COURIER_OFFLINE', courierId, {});
        return res.rows[0];
    }

    // ──────────────────────────────────────────────
    // ORDERS
    // ──────────────────────────────────────────────

    async getActiveOrder(courierId) {
        const res = await pool.query(`
            SELECT o.*, 
                   co.id as co_id, 
                   co.sla_status as co_sla_status,
                   co.earnings,
                   u.full_name as user_name,
                   u.phone as user_phone
            FROM orders o
            JOIN courier_orders co ON o.id = co.order_id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.courier_id = $1
              AND o.delivery_status NOT IN ('delivered', 'cancelled', 'attention_required')
            ORDER BY co.assigned_at DESC
            LIMIT 1
        `, [courierId]);
        return res.rows[0] || null;
    }

    /**
     * Accept an order with full transaction + race condition prevention
     */
    async acceptOffer(orderId, courierId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Lock the row to prevent race conditions
            const orderCheck = await client.query(
                'SELECT id, courier_id, delivery_status, status FROM orders WHERE id = $1 FOR UPDATE',
                [orderId]
            );

            if (orderCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Order not found' };
            }

            const order = orderCheck.rows[0];

            // Prevent duplicate accept
            if (order.courier_id !== null) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Order already accepted by another courier' };
            }

            if (order.status === 'cancelled') {
                await client.query('ROLLBACK');
                return { success: false, message: 'Order was cancelled' };
            }

            // Check courier is not already delivering
            const activeCheck = await client.query(`
                SELECT id FROM orders 
                WHERE courier_id = $1 
                  AND delivery_status NOT IN ('delivered', 'cancelled')
            `, [courierId]);

            if (activeCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'You are already delivering another order' };
            }

            const earnings = 15000; // Can be configurable per order later

            // Assign courier + set SLA deadline
            await client.query(`
                UPDATE orders 
                SET courier_id = $1,
                    delivery_status = 'accepted',
                    sla_delivery_deadline = NOW() + INTERVAL '35 minutes'
                WHERE id = $2
            `, [courierId, orderId]);

            // Create courier_orders record
            await client.query(`
                INSERT INTO courier_orders (order_id, courier_id, accepted_at, earnings, assigned_at)
                VALUES ($1, $2, NOW(), $3, NOW())
            `, [orderId, courierId, earnings]);

            await client.query('COMMIT');

            await this._auditLog('ORDER_ACCEPTED', courierId, { order_id: orderId, earnings });
            return { success: true, earnings };

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[acceptOffer]', err.message);
            return { success: false, message: err.message };
        } finally {
            client.release();
        }
    }

    /**
     * Update order delivery status (state machine)
     */
    async updateOrderStatus(orderId, courierId, newStatus) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const orderCheck = await client.query(
                'SELECT * FROM orders WHERE id = $1 AND courier_id = $2 FOR UPDATE',
                [orderId, courierId]
            );

            if (orderCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Order not assigned to you' };
            }

            const order = orderCheck.rows[0];

            // Validate state transitions
            const validTransitions = {
                'accepted': ['picked_up'],
                'picked_up': ['on_way'],
                'on_way': ['delivered'],
            };

            if (validTransitions[order.delivery_status] && !validTransitions[order.delivery_status].includes(newStatus)) {
                await client.query('ROLLBACK');
                return { success: false, message: `Cannot transition from ${order.delivery_status} to ${newStatus}` };
            }

            await client.query(
                'UPDATE orders SET delivery_status = $1 WHERE id = $2',
                [newStatus, orderId]
            );

            // Update courier_orders timestamps
            if (newStatus === 'picked_up') {
                await client.query(
                    'UPDATE courier_orders SET picked_up_at = NOW() WHERE order_id = $1 AND courier_id = $2',
                    [orderId, courierId]
                );
            } else if (newStatus === 'delivered') {
                await client.query(
                    'UPDATE courier_orders SET delivered_at = NOW() WHERE order_id = $1 AND courier_id = $2',
                    [orderId, courierId]
                );

                // Get earnings for this order
                const co = await client.query(
                    'SELECT earnings FROM courier_orders WHERE order_id = $1 AND courier_id = $2',
                    [orderId, courierId]
                );
                const earnings = co.rows[0] ? Number(co.rows[0].earnings) : 15000;

                // Update sla_status
                const slaCheck = order.sla_delivery_deadline
                    ? (new Date() <= new Date(order.sla_delivery_deadline) ? 'on_time' : 'breached')
                    : 'on_time';

                await client.query(
                    'UPDATE courier_orders SET sla_status = $1 WHERE order_id = $2 AND courier_id = $3',
                    [slaCheck, orderId, courierId]
                );

                // Add earnings, increment completed_orders, set back online
                await client.query(`
                    UPDATE couriers 
                    SET completed_orders = completed_orders + 1,
                        total_earnings = total_earnings + $1,
                        is_online = true
                    WHERE id = $2
                `, [earnings, courierId]);
            }

            await client.query('COMMIT');
            await this._auditLog('ORDER_STATUS_UPDATED', courierId, { order_id: orderId, new_status: newStatus });
            return { success: true };

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[updateOrderStatus]', err.message);
            return { success: false, message: err.message };
        } finally {
            client.release();
        }
    }

    // ──────────────────────────────────────────────
    // CASH MANAGEMENT
    // ──────────────────────────────────────────────

    async markCashReceived(orderId, courierId, amount) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const orderCheck = await client.query(
                'SELECT * FROM orders WHERE id = $1 AND courier_id = $2 FOR UPDATE',
                [orderId, courierId]
            );

            if (orderCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Order not assigned to you' };
            }

            if (orderCheck.rows[0].payment_status === 'paid') {
                await client.query('ROLLBACK');
                return { success: false, message: 'Already marked as paid' };
            }

            await client.query('UPDATE orders SET payment_status = $1 WHERE id = $2', ['paid', orderId]);
            await client.query('UPDATE couriers SET cash_on_hand = cash_on_hand + $1 WHERE id = $2', [amount, courierId]);
            await client.query(
                'INSERT INTO cash_movements (courier_id, order_id, type, amount) VALUES ($1, $2, $3, $4)',
                [courierId, orderId, 'cash_collected', amount]
            );

            await client.query('COMMIT');
            await this._auditLog('CASH_RECEIVED', courierId, { order_id: orderId, amount });
            return { success: true };
        } catch (err) {
            await client.query('ROLLBACK');
            return { success: false, message: err.message };
        } finally {
            client.release();
        }
    }

    async submitCash(courierId, amount) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const courCheck = await client.query(
                'SELECT cash_on_hand FROM couriers WHERE id = $1 FOR UPDATE',
                [courierId]
            );

            if (courCheck.rows.length === 0) throw new Error('Courier not found');
            if (Number(courCheck.rows[0].cash_on_hand) < amount) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Insufficient cash on hand' };
            }

            await client.query('UPDATE couriers SET cash_on_hand = cash_on_hand - $1 WHERE id = $2', [amount, courierId]);
            await client.query(
                'INSERT INTO cash_movements (courier_id, type, amount, status) VALUES ($1, $2, $3, $4)',
                [courierId, 'cash_submitted', amount, 'pending']
            );

            await client.query('COMMIT');
            await this._auditLog('CASH_SUBMITTED', courierId, { amount });
            return { success: true };
        } catch (err) {
            await client.query('ROLLBACK');
            return { success: false, message: err.message };
        } finally {
            client.release();
        }
    }

    // ──────────────────────────────────────────────
    // SOS / INCIDENTS
    // ──────────────────────────────────────────────

    async createSOS(courierId, orderId, reason) {
        try {
            await pool.query(
                'INSERT INTO courier_incidents (courier_id, order_id, reason, status) VALUES ($1, $2, $3, $4)',
                [courierId, orderId || null, reason, 'open']
            );

            if (orderId && orderId !== 'none') {
                await pool.query(
                    'UPDATE orders SET delivery_status = $1 WHERE id = $2',
                    ['attention_required', orderId]
                );
            }

            await this._auditLog('SOS_CREATED', courierId, { order_id: orderId, reason });
            return { success: true };
        } catch (err) {
            console.error('[createSOS]', err.message);
            return { success: false, message: err.message };
        }
    }

    // ──────────────────────────────────────────────
    // RATING
    // ──────────────────────────────────────────────

    /**
     * Apply a new rating to a courier using weighted average
     */
    async applyRating(courierId, newRating) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(
                'SELECT rating, total_ratings FROM couriers WHERE id = $1 FOR UPDATE',
                [courierId]
            );

            if (res.rows.length === 0) throw new Error('Courier not found');

            const { rating: oldRating, total_ratings: totalRatings } = res.rows[0];
            const updatedRating = (Number(oldRating) * totalRatings + newRating) / (totalRatings + 1);

            await client.query(
                'UPDATE couriers SET rating = $1, total_ratings = total_ratings + 1 WHERE id = $2',
                [updatedRating, courierId]
            );

            await client.query('COMMIT');
            return { success: true, newRating: updatedRating };
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[applyRating]', err.message);
            return { success: false };
        } finally {
            client.release();
        }
    }

    // ──────────────────────────────────────────────
    // SUPERADMIN: COURIER MANAGEMENT
    // ──────────────────────────────────────────────

    async createCourier(phone, password, fullName = null) {
        const passwordHash = await bcrypt.hash(password, 10);
        const res = await pool.query(
            'INSERT INTO couriers (phone, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, phone, full_name, status, rating, created_at',
            [phone, passwordHash, fullName]
        );
        return res.rows[0];
    }

    async listCouriers({ page = 1, limit = 50, search = '', status = '' }) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${search}%`;

        let query = `
            SELECT c.*, 
                   (SELECT COUNT(*) FROM orders WHERE courier_id = c.id AND delivery_status NOT IN ('delivered','cancelled')) as active_orders
            FROM couriers c
            WHERE (c.phone ILIKE $1 OR COALESCE(c.full_name,'') ILIKE $1)
        `;
        const params = [searchTerm];
        let idx = 2;

        if (status) {
            query += ` AND c.status = $${idx}`;
            params.push(status);
            idx++;
        }

        query += ` ORDER BY c.id DESC LIMIT $${idx} OFFSET $${idx + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        let countQuery = `SELECT COUNT(*) FROM couriers c WHERE (c.phone ILIKE $1 OR COALESCE(c.full_name,'') ILIKE $1)`;
        const countParams = [searchTerm];
        if (status) {
            countQuery += ` AND c.status = $2`;
            countParams.push(status);
        }
        const countResult = await pool.query(countQuery, countParams);

        return {
            total: parseInt(countResult.rows[0].count, 10),
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            couriers: result.rows
        };
    }

    async blockCourier(courierId) {
        const res = await pool.query(
            'UPDATE couriers SET status = $1, is_online = false WHERE id = $2 RETURNING id, phone, status',
            ['blocked', courierId]
        );
        return res.rows[0];
    }

    async unblockCourier(courierId) {
        const res = await pool.query(
            'UPDATE couriers SET status = $1 WHERE id = $2 RETURNING id, phone, status',
            ['active', courierId]
        );
        return res.rows[0];
    }

    async resetCourierPassword(courierId, newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const res = await pool.query(
            'UPDATE couriers SET password_hash = $1 WHERE id = $2 RETURNING id, phone',
            [passwordHash, courierId]
        );
        return res.rows[0];
    }

    async getCourierDetail(courierId) {
        const courier = await pool.query('SELECT * FROM couriers WHERE id = $1', [courierId]);
        if (courier.rows.length === 0) return null;

        const orders = await pool.query(
            'SELECT * FROM courier_orders WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 20',
            [courierId]
        );

        const incidents = await pool.query(
            'SELECT * FROM courier_incidents WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 10',
            [courierId]
        );

        const cashMovements = await pool.query(
            'SELECT * FROM cash_movements WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 20',
            [courierId]
        );

        const slaBreaches = await pool.query(
            'SELECT COUNT(*) as count FROM courier_orders WHERE courier_id = $1 AND sla_status = $2',
            [courierId, 'breached']
        );

        return {
            courier: courier.rows[0],
            orders: orders.rows,
            incidents: incidents.rows,
            cashMovements: cashMovements.rows,
            slaBreachCount: parseInt(slaBreaches.rows[0].count)
        };
    }

    async confirmCashSubmission(cashMovementId) {
        const res = await pool.query(
            'UPDATE cash_movements SET status = $1 WHERE id = $2 AND type = $3 RETURNING *',
            ['approved', cashMovementId, 'cash_submitted']
        );
        return res.rows[0];
    }

    // ──────────────────────────────────────────────
    // INTERNAL HELPERS
    // ──────────────────────────────────────────────

    async _auditLog(action, courierId, details) {
        try {
            await pool.query(
                'INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, $2, $3)',
                [courierId, `COURIER_${action}`, JSON.stringify({ ...details, courier_id: courierId })]
            );
        } catch {
            // Audit logging failures should not break main flow
        }
    }
}

module.exports = new CourierService();
