const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const errorMiddleware = require("./middleware/error.middleware");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

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

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
   res.json({ status: "OK" });
});

app.use(errorMiddleware);

module.exports = app;
