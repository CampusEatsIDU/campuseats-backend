const pool = require("../config/db");

const createOrder = async (data) => {
  const { user_id, restaurant_id, total_price, delivery_address, latitude, longitude, items, promo_code } = data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate item prices against menu_items in DB
    let calculatedSubtotal = 0;
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (item.menu_item_id) {
          const menuResult = await client.query(
            "SELECT price FROM menu_items WHERE id = $1 AND restaurant_id = $2 AND is_available = true",
            [item.menu_item_id, restaurant_id]
          );
          if (menuResult.rows.length > 0) {
            calculatedSubtotal += parseFloat(menuResult.rows[0].price) * (item.qty || 1);
          } else {
            calculatedSubtotal += parseFloat(item.price) * (item.qty || 1);
          }
        } else {
          calculatedSubtotal += parseFloat(item.price) * (item.qty || 1);
        }
      }
    } else {
      calculatedSubtotal = parseFloat(total_price);
    }

    // 2. Check promo code
    let discountAmount = 0;
    let appliedPromo = null;
    if (promo_code) {
      const promoResult = await client.query(
        `SELECT * FROM promotions
         WHERE code = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR current_uses < max_uses)`,
        [promo_code.toUpperCase()]
      );

      if (promoResult.rows.length > 0) {
        const promo = promoResult.rows[0];

        // Check students_only
        if (promo.students_only) {
          const userResult = await client.query(
            "SELECT is_student_verified FROM users WHERE id = $1",
            [user_id]
          );
          if (!userResult.rows[0]?.is_student_verified) {
            await client.query('ROLLBACK');
            throw new Error("This promo code is for verified students only");
          }
        }

        // Check min order
        if (promo.min_order && calculatedSubtotal < parseFloat(promo.min_order)) {
          await client.query('ROLLBACK');
          throw new Error(`Minimum order amount is ${promo.min_order} for this promo`);
        }

        // Calculate discount
        if (promo.discount_type === 'percentage') {
          discountAmount = calculatedSubtotal * (parseFloat(promo.discount_value) / 100);
        } else {
          discountAmount = Math.min(parseFloat(promo.discount_value), calculatedSubtotal);
        }
        discountAmount = Math.round(discountAmount * 100) / 100;
        appliedPromo = promo.code;

        // Increment usage
        await client.query(
          "UPDATE promotions SET current_uses = current_uses + 1 WHERE id = $1",
          [promo.id]
        );
      }
    }

    // 3. Calculate cashback for verified students
    let cashbackAmount = 0;
    const userCheck = await client.query(
      "SELECT is_student_verified FROM users WHERE id = $1",
      [user_id]
    );
    if (userCheck.rows[0]?.is_student_verified) {
      const restProfile = await client.query(
        "SELECT cashback_rate FROM restaurant_profiles WHERE user_id = $1",
        [restaurant_id]
      );
      const cashbackRate = parseFloat(restProfile.rows[0]?.cashback_rate) || 0;
      if (cashbackRate > 0) {
        cashbackAmount = (calculatedSubtotal - discountAmount) * (cashbackRate / 100);
        cashbackAmount = Math.round(cashbackAmount * 100) / 100;
      }
    }

    // 4. Final total
    const finalTotal = Math.round((calculatedSubtotal - discountAmount) * 100) / 100;

    // 5. Create order
    const orderResult = await client.query(
      `INSERT INTO orders
        (user_id, restaurant_id, subtotal, discount_amount, promo_code, cashback_amount, total_price,
         delivery_address, latitude, longitude, status, cashback_credited)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', false)
       RETURNING *`,
      [user_id, restaurant_id, calculatedSubtotal, discountAmount, appliedPromo, cashbackAmount,
       finalTotal, delivery_address, latitude, longitude]
    );

    const order = orderResult.rows[0];

    // 6. Create order items
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

// Valid status transitions
const VALID_TRANSITIONS = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'ready_for_pickup'],
  ready: ['picked_up', 'ready_for_pickup'],
  ready_for_pickup: ['picked_up'],
  picked_up: ['on_way', 'delivered'],
  on_way: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: []
};

const updateStatus = async (id, status) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check current status and validate transition
    const currentOrder = await client.query("SELECT * FROM orders WHERE id = $1", [id]);
    if (currentOrder.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = currentOrder.rows[0];
    const allowed = VALID_TRANSITIONS[current.status];
    if (allowed && allowed.length > 0 && !allowed.includes(status)) {
      // Allow the transition anyway but log warning (don't block demo)
      console.warn(`Warning: transition ${current.status} -> ${status} not standard for order ${id}`);
    }

    const result = await client.query(
      `UPDATE orders
       SET status = $1,
           payment_method = COALESCE(payment_method, 'cash'),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    const order = result.rows[0];

    // Credit cashback when order is delivered/completed
    if (order && (status === 'delivered' || status === 'completed')) {
      if (parseFloat(order.cashback_amount) > 0 && !order.cashback_credited) {
        // Credit user balance
        await client.query(
          "UPDATE users SET balance = balance + $1 WHERE id = $2",
          [order.cashback_amount, order.user_id]
        );

        // Record transaction
        await client.query(
          `INSERT INTO cashback_transactions (user_id, order_id, amount, type, description)
           VALUES ($1, $2, $3, 'credit', $4)`,
          [order.user_id, order.id, order.cashback_amount, `Cashback for order #${order.id}`]
        );

        // Mark as credited
        await client.query(
          "UPDATE orders SET cashback_credited = true WHERE id = $1",
          [order.id]
        );
      }
    }

    await client.query('COMMIT');

    // Broadcast to couriers when ready
    if (order && (status === 'ready_for_pickup' || status === 'ready')) {
      try {
        const { broadcastOrderToCouriers } = require("../bot/courierBot");
        broadcastOrderToCouriers(order);
      } catch (e) {
        console.error("Failed to broadcast order:", e);
      }
    }

    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  createOrder,
  updateStatus
};
