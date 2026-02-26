const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const errorMiddleware = require("./middleware/error.middleware");
const rateLimit = require("./middleware/rateLimit.middleware");
const pool = require("./config/db"); // Added pool

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting: 200 requests per minute per IP
app.use(rateLimit({ windowMs: 60000, max: 200 }));

/* =========================
   STATIC FILES
========================= */
const path = require("path");
// Serve uploaded images securely
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
   res.json({
      message: "CampusEats API is running",
      env: process.env.NODE_ENV,
      webhook_url: process.env.WEBHOOK_URL ? "SET" : "NOT SET",
      polling: process.env.ALLOW_POLLING === "true" ? "ENABLED" : "DISABLED",
      version: "Stateless-Bot-V6-Final"
   });
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/orders", require("./routes/order.routes"));
app.use("/api/verification", require("./routes/verification.routes"));
app.use("/api/telegram", require("./routes/telegram.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use("/api/restaurant", require("./routes/restaurant.routes"));
app.use("/api/courier", require("./routes/courier.routes"));

// Inline bot webhook to avoid file loading issues on Vercel
app.post("/bot-webhook", async (req, res) => {
   try {
      console.log('[Webhook] Update received:', JSON.stringify(req.body));
      const { handleUpdate } = require("./bot/courierBot");

      // CRITICAL: Await the update processing to keep Vercel lambda alive
      if (handleUpdate) {
         await handleUpdate(req.body);
         console.log('[Webhook] Update processed successfully');
      } else {
         console.error('[Webhook] handleUpdate not found in courierBot');
      }

      res.sendStatus(200);
   } catch (err) {
      console.error('[Webhook] Error:', err.message, err.stack);
      res.sendStatus(200); // Always 200 to Telegram
   }
});

app.get("/bot-webhook", (req, res) => {
   res.json({ status: "Courier Bot webhook active", timestamp: new Date().toISOString() });
});

app.get("/test-db", async (req, res) => {
   try {
      const dbUrl = process.env.DATABASE_URL || 'NONE';
      const result = await pool.query('SELECT NOW()');
      res.json({ success: true, time: result.rows[0], url_prefix: dbUrl.substring(0, 15) + '...' });
   } catch (err) {
      res.status(500).json({ success: false, error: err.message, stack: err.stack });
   }
});

app.get("/set-webhook", async (req, res) => {
   try {
      const { bot } = require("./bot/courierBot");
      const baseUrl = process.env.WEBHOOK_URL || 'https://campuseats-backend.vercel.app';
      const url = `${baseUrl}/bot-webhook`;
      console.log('[Webhook] Setting to:', url);
      const result = await bot.setWebHook(url);
      res.json({ success: true, url, result });
   } catch (err) {
      res.status(500).json({ success: false, error: err.message });
   }
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
   res.json({ status: "Stateless-Bot-V6-Final", timestamp: new Date().toISOString() });
});

app.use(errorMiddleware);

module.exports = app;
