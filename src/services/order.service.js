const pool = require("../config/db");

const createOrder = async (data) => {
  const { user_id, total_price, delivery_address, latitude, longitude } = data;

  const result = await pool.query(
    `INSERT INTO orders 
      (user_id, total_price, delivery_address, latitude, longitude, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [user_id, total_price, delivery_address, latitude, longitude]
  );

  return result.rows[0];
};

const updateStatus = async (id, status) => {
  const result = await pool.query(
    `UPDATE orders
     SET status = $1
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );

  return result.rows[0];
};

module.exports = {
  createOrder,
  updateStatus
};
