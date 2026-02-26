const pool = require("../config/db");

const createOrder = async (data) => {
  const { user_id, restaurant_id, total_price, delivery_address, latitude, longitude, items } = data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create Order
    const orderResult = await client.query(
      `INSERT INTO orders 
        (user_id, restaurant_id, total_price, delivery_address, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [user_id, restaurant_id, total_price, delivery_address, latitude, longitude]
    );

    const order = orderResult.rows[0];

    // 2. Create Order Items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id, item_name, quantity, price)
           VALUES ($1, $2, $3, $4)`,
          [order.id, item.name, item.qty, item.price]
        );
      }
    }

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updateStatus = async (id, status) => {
  const result = await pool.query(
    `UPDATE orders
     SET status = $1, 
         payment_method = COALESCE(payment_method, 'cash')
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );

  const order = result.rows[0];

  if (order && status === 'ready_for_pickup') {
    // Proactively broadcast to couriers
    try {
      const { broadcastOrderToCouriers } = require("../bot/courierBot");
      broadcastOrderToCouriers(order);
    } catch (e) {
      console.error("Failed to broadcast order:", e);
    }
  }

  return order;
};

module.exports = {
  createOrder,
  updateStatus
};
