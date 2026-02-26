-- Migration 002: Full SuperAdmin Schema
-- Fixes schema mismatches and adds missing tables/columns

-- ============================================
-- 1. Fix student_verifications table
-- ============================================
ALTER TABLE student_verifications ADD COLUMN IF NOT EXISTS front_image_url TEXT;
ALTER TABLE student_verifications ADD COLUMN IF NOT EXISTS back_image_url TEXT;
-- Migrate data from file_url to front_image_url if needed
UPDATE student_verifications SET front_image_url = file_url WHERE front_image_url IS NULL AND file_url IS NOT NULL;

-- ============================================
-- 2. Create orders table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    restaurant_id INT REFERENCES users(id) ON DELETE SET NULL,
    total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    delivery_address TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    status VARCHAR(30) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. Create order_items table if not exists
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    item_name VARCHAR(255),
    quantity INT DEFAULT 1,
    price NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. Ensure users table has all needed columns
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_student_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS student_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ============================================
-- 5. Fix audit_logs - ensure 'details' column exists (code uses 'details')
-- ============================================
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
-- Copy data from metadata to details if metadata has data and details doesn't
UPDATE audit_logs SET details = metadata WHERE details IS NULL AND metadata IS NOT NULL;
