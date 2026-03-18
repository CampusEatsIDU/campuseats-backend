/**
 * CampusEats Courier API Routes
 * All authenticated courier endpoints
 */

const router = require('express').Router();
const courierService = require('../services/courier.service');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ──────────────────────────────────────────────
// COURIER AUTH MIDDLEWARE
// ──────────────────────────────────────────────
const courierAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Invalid token format' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'courier') return res.status(403).json({ message: 'Access denied' });

        const courier = await courierService.getCourierById(decoded.id);
        if (!courier) return res.status(401).json({ message: 'Courier not found' });
        if (courier.status !== 'active') return res.status(403).json({ message: 'Account blocked' });

        req.courier = courier;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// ──────────────────────────────────────────────
// POST /api/courier/login
// ──────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ message: 'Phone and password required' });

        const result = await courierService.login(phone, password, null);
        if (!result.success) return res.status(401).json({ message: result.message });

        const token = jwt.sign(
            { id: result.courier.id, role: 'courier' },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            courier: {
                id: result.courier.id,
                phone: result.courier.phone,
                full_name: result.courier.full_name,
                rating: result.courier.rating,
                status: result.courier.status,
                is_online: result.courier.is_online
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/online
// ──────────────────────────────────────────────
router.post('/online', courierAuth, async (req, res) => {
    try {
        const { is_online } = req.body;
        const courier = await courierService.setOnline(req.courier.id, is_online);
        res.json({ success: true, courier });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// GET /api/courier/me
// ──────────────────────────────────────────────
router.get('/me', courierAuth, async (req, res) => {
    try {
        const stats = await courierService.getCourierStats(req.courier.id);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// GET /api/courier/active-order
// ──────────────────────────────────────────────
router.get('/active-order', courierAuth, async (req, res) => {
    try {
        const order = await courierService.getActiveOrder(req.courier.id);
        res.json({ order: order || null });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/offers/:id/accept
// ──────────────────────────────────────────────
router.post('/offers/:id/accept', courierAuth, async (req, res) => {
    try {
        const result = await courierService.acceptOffer(req.params.id, req.courier.id);
        if (result.success) res.json(result);
        else res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/order/:id/status
// ──────────────────────────────────────────────
router.post('/order/:id/status', courierAuth, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ message: 'Status required' });

        const result = await courierService.updateOrderStatus(req.params.id, req.courier.id, status);
        if (result.success) res.json(result);
        else res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/order/:id/picked-up
// ──────────────────────────────────────────────
router.post('/order/:id/picked-up', courierAuth, async (req, res) => {
    try {
        const result = await courierService.updateOrderStatus(req.params.id, req.courier.id, 'picked_up');
        if (result.success) res.json(result);
        else res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/order/:id/delivered
// ──────────────────────────────────────────────
router.post('/order/:id/delivered', courierAuth, async (req, res) => {
    try {
        const result = await courierService.updateOrderStatus(req.params.id, req.courier.id, 'delivered');
        if (result.success) res.json(result);
        else res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/order/:id/cash-received
// ──────────────────────────────────────────────
router.post('/order/:id/cash-received', courierAuth, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || isNaN(amount)) return res.status(400).json({ message: 'Valid amount required' });

        const result = await courierService.markCashReceived(req.params.id, req.courier.id, parseFloat(amount));
        if (result.success) res.json(result);
        else res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/cash/submit
// ──────────────────────────────────────────────
router.post('/cash/submit', courierAuth, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || isNaN(amount)) return res.status(400).json({ message: 'Valid amount required' });

        const result = await courierService.submitCash(req.courier.id, parseFloat(amount));
        if (result.success) res.json(result);
        else res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/courier/sos
// ──────────────────────────────────────────────
router.post('/sos', courierAuth, async (req, res) => {
    try {
        const { order_id, reason } = req.body;
        if (!reason) return res.status(400).json({ message: 'Reason required' });

        const result = await courierService.createSOS(req.courier.id, order_id, reason);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// GET /api/courier/cash-movements
// ──────────────────────────────────────────────
router.get('/cash-movements', courierAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM cash_movements WHERE courier_id = $1 ORDER BY created_at DESC LIMIT 50',
            [req.courier.id]
        );
        res.json({ movements: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
