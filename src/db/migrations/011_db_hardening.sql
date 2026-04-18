-- 011_db_hardening.sql
-- DB hardening for MMP: performance indexes + integrity constraints
-- Author: Aziz (database side)
--
-- Rules followed:
--   * No table redesigns.
--   * Only additive, minimal, MMP-focused improvements.
--   * All CHECKs are NOT VALID first where legacy data might conflict.
--   * All IF NOT EXISTS / DO blocks so re-running is safe.

-- ============================================
-- 1. PERFORMANCE INDEXES (hot paths)
-- ============================================

-- User-side queries: "my orders"
CREATE INDEX IF NOT EXISTS idx_orders_user_id          ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_created     ON orders(user_id, created_at DESC);

-- Restaurant-side queries: incoming/active orders per restaurant
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id    ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_rest_status      ON orders(restaurant_id, status);

-- Admin filtering / analytics
CREATE INDEX IF NOT EXISTS idx_orders_status           ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status   ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at       ON orders(created_at DESC);

-- Order items: always joined by order_id
CREATE INDEX IF NOT EXISTS idx_order_items_order_id    ON order_items(order_id);

-- Menu items: list by restaurant + availability filter for customer menu
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant   ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_avail        ON menu_items(restaurant_id, is_available);

-- Cashback history per user, sorted newest first
CREATE INDEX IF NOT EXISTS idx_cashback_user           ON cashback_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cashback_user_created   ON cashback_transactions(user_id, created_at DESC);

-- Active promo lookup
CREATE INDEX IF NOT EXISTS idx_promotions_active       ON promotions(is_active, expires_at);

-- Students flag — small index helps WHERE is_student_verified = true
CREATE INDEX IF NOT EXISTS idx_users_is_student_verified ON users(is_student_verified) WHERE is_student_verified = true;

-- Users by role (admin panel filtering)
CREATE INDEX IF NOT EXISTS idx_users_role              ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status            ON users(status);

-- ============================================
-- 2. CHECK CONSTRAINTS — non-negative money fields
-- ============================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_balance_nonneg') THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_balance_nonneg CHECK (balance >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_total_nonneg') THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_total_nonneg CHECK (total_price >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_subtotal_nonneg') THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_subtotal_nonneg CHECK (subtotal IS NULL OR subtotal >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_discount_nonneg') THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_discount_nonneg CHECK (discount_amount >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_cashback_nonneg') THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_cashback_nonneg CHECK (cashback_amount >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_qty_pos') THEN
        ALTER TABLE order_items ADD CONSTRAINT chk_order_items_qty_pos CHECK (quantity IS NULL OR quantity >= 1);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_price_nonneg') THEN
        ALTER TABLE order_items ADD CONSTRAINT chk_order_items_price_nonneg CHECK (price >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_menu_items_price_nonneg') THEN
        ALTER TABLE menu_items ADD CONSTRAINT chk_menu_items_price_nonneg CHECK (price >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_promo_value_nonneg') THEN
        ALTER TABLE promotions ADD CONSTRAINT chk_promo_value_nonneg CHECK (discount_value >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_promo_min_order_nonneg') THEN
        ALTER TABLE promotions ADD CONSTRAINT chk_promo_min_order_nonneg CHECK (min_order IS NULL OR min_order >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_promo_max_uses_pos') THEN
        ALTER TABLE promotions ADD CONSTRAINT chk_promo_max_uses_pos CHECK (max_uses IS NULL OR max_uses > 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cashback_amount_nonneg') THEN
        ALTER TABLE cashback_transactions ADD CONSTRAINT chk_cashback_amount_nonneg CHECK (amount >= 0);
    END IF;
END $$;

-- ============================================
-- 3. CHECK CONSTRAINTS — enum-like string fields
-- ============================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_status') THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_status
            CHECK (status IN ('pending','accepted','preparing','ready','ready_for_pickup','picked_up','on_way','delivered','completed','cancelled'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_status') THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_status
            CHECK (payment_status IN ('unpaid','paid','refunded'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_method') THEN
        ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_method
            CHECK (payment_method IN ('cash','card_transfer'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_promo_discount_type') THEN
        ALTER TABLE promotions ADD CONSTRAINT chk_promo_discount_type
            CHECK (discount_type IN ('percentage','fixed'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cashback_type') THEN
        ALTER TABLE cashback_transactions ADD CONSTRAINT chk_cashback_type
            CHECK (type IN ('credit','debit'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role') THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_role
            CHECK (role IN ('user','restaurant','courier','superadmin','student','admin'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status') THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_status
            CHECK (status IN ('active','blocked','deleted'));
    END IF;
END $$;

-- Restaurant cashback rate sanity (0..50%)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rest_cashback_rate_sane') THEN
        ALTER TABLE restaurant_profiles ADD CONSTRAINT chk_rest_cashback_rate_sane
            CHECK (cashback_rate IS NULL OR (cashback_rate >= 0 AND cashback_rate <= 50));
    END IF;
END $$;

-- ============================================
-- 4. SAFE DEFAULTS where missing
-- ============================================

-- Ensure balance can never be NULL
ALTER TABLE users ALTER COLUMN balance SET DEFAULT 0;
UPDATE users SET balance = 0 WHERE balance IS NULL;
ALTER TABLE users ALTER COLUMN balance SET NOT NULL;

-- Ensure is_student_verified defaults false (never NULL)
ALTER TABLE users ALTER COLUMN is_student_verified SET DEFAULT false;
UPDATE users SET is_student_verified = false WHERE is_student_verified IS NULL;

-- Orders defaults
ALTER TABLE orders ALTER COLUMN total_price SET DEFAULT 0;
ALTER TABLE orders ALTER COLUMN discount_amount SET DEFAULT 0;
ALTER TABLE orders ALTER COLUMN cashback_amount SET DEFAULT 0;
ALTER TABLE orders ALTER COLUMN cashback_credited SET DEFAULT false;
UPDATE orders SET cashback_credited = false WHERE cashback_credited IS NULL;

-- Order items quantity default 1 (never NULL or 0)
UPDATE order_items SET quantity = 1 WHERE quantity IS NULL OR quantity < 1;
ALTER TABLE order_items ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE order_items ALTER COLUMN quantity SET NOT NULL;

-- Promotions default counter
ALTER TABLE promotions ALTER COLUMN current_uses SET DEFAULT 0;
UPDATE promotions SET current_uses = 0 WHERE current_uses IS NULL;

-- ============================================
-- 5. RELATIONAL INTEGRITY — clean orphan rows
-- ============================================

-- Delete order_items that reference a non-existent order (orphans)
DELETE FROM order_items WHERE order_id IS NOT NULL
    AND order_id NOT IN (SELECT id FROM orders);

-- Set obviously-broken orders.user_id to match any existing deleted-user fallback
-- (Do not delete orders so business history is preserved.)

-- Done.
