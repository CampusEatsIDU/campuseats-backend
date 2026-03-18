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

const HOST = '::';

// Start the server
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);

  // Test DB connection immediately
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('❌ Database connection failed at startup:', err);
    } else {
      console.log('✅ Database connected successfully');
    }
  });
});

server.on('error', (err) => {
  console.error('❌ Server startup error:', err.message);
});

// Export for Vercel
module.exports = app;