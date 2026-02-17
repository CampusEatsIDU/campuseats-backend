const orderService = require("../services/order.service");

exports.createOrder = async (req, res, next) => {
  try {
    const result = await orderService.createOrder(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const result = await orderService.updateStatus(orderId, status);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
