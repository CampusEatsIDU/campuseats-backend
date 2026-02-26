-- Migration 003: Restaurant Panel Schema

-- 1. Create restaurant_profiles table
CREATE TABLE IF NOT EXISTS restaurant_profiles (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    address TEXT,
    phone VARCHAR(50),
    working_hours JSONB DEFAULT '{"monday": {"open":"09:00","close":"22:00"}, "tuesday": {"open":"09:00","close":"22:00"}, "wednesday": {"open":"09:00","close":"22:00"}, "thursday": {"open":"09:00","close":"22:00"}, "friday": {"open":"09:00","close":"23:00"}, "saturday": {"open":"10:00","close":"23:00"}, "sunday": {"open":"10:00","close":"22:00"}}'::jsonb,
    delivery_radius NUMERIC(5,2) DEFAULT 5.0,
    min_order NUMERIC(10,2) DEFAULT 0.0,
    delivery_fee NUMERIC(10,2) DEFAULT 0.0,
    is_open BOOLEAN DEFAULT true,
    cashback_rate NUMERIC(5,2) DEFAULT 0.0,
    platform_fee_rate NUMERIC(5,2) DEFAULT 10.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create menu_items table
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    restaurant_id INT REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    category VARCHAR(100) DEFAULT 'Main Course',
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Enhance orders table (just in case they need to be linked directly to restaurants, but we already have restaurant_id)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'restaurant_id') THEN
        ALTER TABLE orders ADD COLUMN restaurant_id INT REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
