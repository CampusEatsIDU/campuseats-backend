-- Add bot_state column to couriers to support stateless bot operation on Vercel
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS bot_state JSONB DEFAULT '{}';

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_couriers_telegram ON couriers(telegram_id);
