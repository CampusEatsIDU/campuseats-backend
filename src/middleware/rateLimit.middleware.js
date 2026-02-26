/**
 * Simple in-memory rate limiter middleware
 * No external dependencies needed
 */

const rateLimitStore = new Map();

function rateLimit({ windowMs = 60000, max = 100, message = "Too many requests, please try again later." } = {}) {
    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }

        const record = rateLimitStore.get(key);

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
            return next();
        }

        record.count++;

        if (record.count > max) {
            res.set("Retry-After", Math.ceil((record.resetTime - now) / 1000));
            return res.status(429).json({ message });
        }

        next();
    };
}

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore) {
        if (now > value.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 300000);

module.exports = rateLimit;
