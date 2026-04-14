-- MMP Migration: Promotions system and cashback tracking
-- Run this migration against the PostgreSQL database

-- Promotions table for promo codes
CREATE TABLE IF NOT EXISTS promotions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
    discount_value NUMERIC(10,2) NOT NULL,
    min_order NUMERIC(10,2) DEFAULT 0,
    max_uses INT DEFAULT NULL,
    current_uses INT DEFAULT 0,
    students_only BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track cashback credit/debit transactions
CREATE TABLE IF NOT EXISTS cashback_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    order_id INT REFERENCES orders(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'credit',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add order price breakdown columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_credited BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);

-- Ensure balance column exists on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) DEFAULT 0;

-- Add phone and city columns for telegram bot preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
