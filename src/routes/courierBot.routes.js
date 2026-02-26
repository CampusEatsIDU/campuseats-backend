/**
 * Courier Bot Webhook Route
 * Receives updates from Telegram when in webhook mode (production/Vercel)
 */

const router = require('express').Router();
const { bot } = require('../bot/courierBot');

// POST /api/courier-bot/webhook
// Telegram sends all updates here
router.post('/webhook', (req, res) => {
    try {
        if (bot && typeof bot.processUpdate === 'function') {
            bot.processUpdate(req.body);
        }
        res.sendStatus(200);
    } catch (err) {
        console.error('[Webhook] Error processing update:', err.message);
        res.sendStatus(200); // Always return 200 to Telegram to avoid retries
    }
});

// GET /api/courier-bot/webhook — health check
router.get('/webhook', (req, res) => {
    res.json({ status: 'Courier Bot webhook active', timestamp: new Date().toISOString() });
});

module.exports = router;
