require("dotenv").config();
const app = require("./app");
const pool = require("./config/db");

const PORT = process.env.PORT || 5000;

// Initialize Courier Bot system (stateless)
try {
  require("./bot/courierBot");
  const { startSLAWorker } = require("./bot/slaWorker");
  if (process.env.NODE_ENV !== "production") {
    startSLAWorker();
  }
} catch (e) {
  console.error("Failed to start Courier Bot components:", e);
}

// In development, handle app.listen manually
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;