const router = require("express").Router();
const orderService = require("../services/order.service");
const authMiddleware = require("../middleware/auth.middleware");

/* =========================
   CREATE ORDER
========================= */

router.post("/", authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id;

    const {
      total_price,
      delivery_address,
      latitude,
      longitude
    } = req.body;

    if (!total_price || !delivery_address) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const order = await orderService.createOrder({
      user_id,
      total_price,
      delivery_address,
      latitude,
      longitude
    });

    res.status(201).json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   UPDATE ORDER STATUS
========================= */

router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const updatedOrder = await orderService.updateStatus(orderId, status);

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(updatedOrder);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
