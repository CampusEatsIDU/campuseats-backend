/** 
 * Bot Sessions table to handle conversations on serverless platforms (Vercel)
 * This allows the bot to remember state between independent HTTP requests
 */
CREATE TABLE IF NOT EXISTS bot_sessions (
    chat_id BIGINT PRIMARY KEY,
    step VARCHAR(50),
    data JSONB DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for expiration cleanup if needed
CREATE INDEX IF NOT EXISTS idx_bot_sessions_updated ON bot_sessions(updated_at);
