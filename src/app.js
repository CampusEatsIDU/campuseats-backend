const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const errorMiddleware = require("./middleware/error.middleware");
const rateLimit = require("./middleware/rateLimit.middleware");

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

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/orders", require("./routes/order.routes"));
app.use("/api/verification", require("./routes/verification.routes"));
app.use("/api/telegram", require("./routes/telegram.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use("/api/restaurant", require("./routes/restaurant.routes"));
app.use("/api/courier", require("./routes/courier.routes"));

// Inline bot webhook to avoid file loading issues on Vercel
app.post("/bot-webhook", (req, res) => {
   const { bot } = require("./bot/courierBot");
   if (bot && typeof bot.processUpdate === 'function') {
      bot.processUpdate(req.body);
   }
   res.sendStatus(200);
});

app.get("/bot-webhook", (req, res) => {
   res.json({ status: "Courier Bot webhook active", timestamp: new Date().toISOString() });
});

app.get("/set-webhook", async (req, res) => {
   try {
      const { bot } = require("./bot/courierBot");
      const url = `${process.env.WEBHOOK_URL}/bot-webhook`;
      await bot.setWebHook(url);
      res.json({ success: true, url });
   } catch (err) {
      res.status(500).json({ success: false, error: err.message });
   }
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
   res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.use(errorMiddleware);

module.exports = app;
