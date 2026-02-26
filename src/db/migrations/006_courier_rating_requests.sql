-- Rating requests sent to customers after delivery
CREATE TABLE IF NOT EXISTS courier_rating_requests (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    courier_id INT REFERENCES couriers(id) ON DELETE CASCADE,
    user_telegram_id BIGINT,         -- customer's telegram_id (from users table)
    rating_message_id BIGINT,        -- telegram message_id to track the rating message
    rating INT,                      -- 1-5 stars, NULL until rated
    status VARCHAR(50) DEFAULT 'pending', -- 'pending' / 'rated'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rated_at TIMESTAMP
);

-- Add sla_status to orders if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sla_status VARCHAR(50);

-- Add name column to couriers for display purposes
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Add courier rating to courier_orders
ALTER TABLE courier_orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_courier_rating_order ON courier_rating_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_rating_courier ON courier_rating_requests(courier_id);
CREATE INDEX IF NOT EXISTS idx_couriers_telegram ON couriers(telegram_id);
CREATE INDEX IF NOT EXISTS idx_couriers_online ON couriers(is_online, status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
