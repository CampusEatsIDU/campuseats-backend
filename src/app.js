const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const errorMiddleware = require("./middleware/error.middleware");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

/* =========================
   ROUTES
========================= */

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/orders", require("./routes/order.routes"));
app.use("/api/verification", require("./routes/verification.routes"));
app.use("/api/telegram", require("./routes/telegram.routes"));

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

app.use(errorMiddleware);

module.exports = app;
