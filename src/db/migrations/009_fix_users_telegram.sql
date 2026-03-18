-- Migration 009: Fix users table for Telegram sync
-- Adds missing columns required for bot user registration

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'ru';

-- Index for fast lookups by telegram_id
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
