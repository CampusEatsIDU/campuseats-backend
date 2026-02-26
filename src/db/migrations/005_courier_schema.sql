CREATE TABLE IF NOT EXISTS couriers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    telegram_id BIGINT UNIQUE,
    status VARCHAR(50) DEFAULT 'active', -- 'active' / 'blocked'
    is_online BOOLEAN DEFAULT false,
    rating FLOAT DEFAULT 5.0,
    total_ratings INT DEFAULT 0,
    completed_orders INT DEFAULT 0,
    cash_on_hand NUMERIC DEFAULT 0,
    total_earnings NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courier_orders (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    courier_id INT REFERENCES couriers(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    picked_up_at TIMESTAMP,
    delivered_at TIMESTAMP,
    earnings NUMERIC DEFAULT 0,
    sla_status VARCHAR(50), -- 'on_time', 'breached'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_movements (
    id SERIAL PRIMARY KEY,
    courier_id INT REFERENCES couriers(id) ON DELETE CASCADE,
    order_id INT REFERENCES orders(id) ON DELETE SET NULL,
    type VARCHAR(50), -- 'cash_collected' / 'cash_submitted'
    amount NUMERIC,
    status VARCHAR(50) DEFAULT 'completed', -- 'pending', 'approved'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courier_incidents (
    id SERIAL PRIMARY KEY,
    courier_id INT REFERENCES couriers(id) ON DELETE CASCADE,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    reason VARCHAR(255),
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS courier_id INT REFERENCES couriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sla_delivery_deadline TIMESTAMP,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash', -- 'cash' / 'card_transfer'
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';
