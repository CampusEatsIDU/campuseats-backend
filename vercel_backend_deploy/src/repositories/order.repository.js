const db = require("../config/db");

exports.createOrder = async (data) => {
  const [result] = await db.execute(
    `INSERT INTO orders 
    (user_id, total_amount, payment_method, delivery_lat, delivery_lng) 
    VALUES (?, ?, ?, ?, ?)`,
    [
      data.user_id,
      data.total_amount,
      data.payment_method,
      data.delivery_lat,
      data.delivery_lng,
    ]
  );

  return result.insertId;
};

exports.getOrderById = async (id) => {
  const [rows] = await db.execute(
    "SELECT * FROM orders WHERE id = ?",
    [id]
  );
  return rows[0];
};

exports.updateStatus = async (id, status, coins) => {
  await db.execute(
    `UPDATE orders 
     SET status = ?, coins_earned = ? 
     WHERE id = ?`,
    [status, coins, id]
  );
};
