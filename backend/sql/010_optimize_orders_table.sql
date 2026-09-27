-- ============================================
-- MIGRATION 010: Orders Table Optimization
-- Date: 2026-01-05
-- Purpose: Clean up redundant columns, add ENUMs, improve integrity
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Create ENUM Types
-- ============================================

-- Phone confirmation status ENUM
CREATE TYPE phone_confirmation_status AS ENUM (
  'pending',
  'confirmed', 
  'failed'
);

-- Delivery type ENUM
CREATE TYPE delivery_type_enum AS ENUM (
  'home',
  'stopdesk'
);

-- ============================================
-- STEP 2: Verify Data Before Changes
-- ============================================

-- Check for any unexpected phone_confirmation_status values
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM orders
  WHERE phone_confirmation_status IS NOT NULL
    AND phone_confirmation_status NOT IN ('pending', 'confirmed', 'failed');
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % orders with invalid phone_confirmation_status values', invalid_count;
  END IF;
END $$;

-- Check for any unexpected delivery_type values
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM orders
  WHERE delivery_type IS NOT NULL
    AND delivery_type NOT IN ('home', 'stopdesk', 'stop_desk');
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % orders with invalid delivery_type values', invalid_count;
  END IF;
END $$;

-- Verify commune_id migration is complete
DO $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM orders
  WHERE commune_id IS NOT NULL
    AND delivery_commune_id IS NOT NULL
    AND commune_id != delivery_commune_id;
  
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Found % orders where commune_id != delivery_commune_id', conflict_count;
  END IF;
END $$;

-- Verify tracking number columns are in sync
DO $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM orders
  WHERE tracking_number IS NOT NULL
    AND guepex_tracking_number IS NOT NULL
    AND tracking_number != guepex_tracking_number;
  
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Found % orders where tracking_number != guepex_tracking_number', conflict_count;
  END IF;
END $$;

-- ============================================
-- STEP 3: Data Migration
-- ============================================

-- Normalize delivery_type values (stop_desk -> stopdesk)
UPDATE orders
SET delivery_type = 'stopdesk'
WHERE delivery_type IN ('stop_desk', 'Stop_Desk', 'STOP_DESK');

-- Ensure any NULL delivery_commune_id are filled from commune_id
UPDATE orders
SET delivery_commune_id = commune_id
WHERE commune_id IS NOT NULL
  AND delivery_commune_id IS NULL;

-- Copy tracking_number to guepex_tracking_number if missing
UPDATE orders
SET guepex_tracking_number = tracking_number
WHERE tracking_number IS NOT NULL
  AND guepex_tracking_number IS NULL;

-- ============================================
-- STEP 4: Convert VARCHAR to ENUM
-- ============================================

-- Convert phone_confirmation_status to ENUM
ALTER TABLE orders 
  ALTER COLUMN phone_confirmation_status 
  TYPE phone_confirmation_status 
  USING phone_confirmation_status::phone_confirmation_status;

-- Convert delivery_type to ENUM
ALTER TABLE orders 
  ALTER COLUMN delivery_type 
  TYPE delivery_type_enum 
  USING CASE 
    WHEN delivery_type IS NULL THEN NULL
    ELSE delivery_type::delivery_type_enum 
  END;

-- ============================================
-- STEP 5: Remove Deprecated Columns
-- ============================================

-- Drop deprecated commune_id column and its index
DROP INDEX IF EXISTS idx_orders_commune;
ALTER TABLE orders DROP COLUMN IF EXISTS commune_id;

-- Drop deprecated tracking_number column and its index
DROP INDEX IF EXISTS idx_orders_tracking;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_number;

-- Rename guepex_tracking_number to tracking_number
ALTER TABLE orders RENAME COLUMN guepex_tracking_number TO tracking_number;

-- Recreate index with new column name
CREATE INDEX idx_orders_tracking ON orders(tracking_number) 
  WHERE tracking_number IS NOT NULL;

-- ============================================
-- STEP 6: Add Missing Foreign Key
-- ============================================

-- Check for orphaned delivery_center_id references first
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphaned_count
  FROM orders
  WHERE delivery_center_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM guepex_centers WHERE center_id = orders.delivery_center_id
    );
  
  IF orphaned_count > 0 THEN
    RAISE WARNING 'Found % orders with invalid delivery_center_id, setting to NULL', orphaned_count;
    UPDATE orders SET delivery_center_id = NULL
    WHERE delivery_center_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM guepex_centers WHERE center_id = orders.delivery_center_id
      );
  END IF;
END $$;

-- Add FK constraint for delivery_center_id
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_center
    FOREIGN KEY (delivery_center_id)
    REFERENCES guepex_centers(center_id)
    ON DELETE SET NULL;

-- Add index for delivery center
CREATE INDEX idx_orders_delivery_center 
ON orders(delivery_center_id) 
WHERE delivery_center_id IS NOT NULL;

-- ============================================
-- STEP 7: Add Documentation Comments
-- ============================================

COMMENT ON COLUMN orders.shipping_snapshot IS 
  'IMMUTABLE: Complete shipping address snapshot at time of order creation. Preserves historical data even if customer updates their profile. Use delivery_commune_id/delivery_wilaya_id for current queries and joins.';

COMMENT ON COLUMN orders.customer_phone IS 
  'Denormalized phone number for quick access. Synced from shipping address at order creation. Use this for display; use user.phone for updates.';

COMMENT ON COLUMN orders.delivery_type IS 
  'Delivery method selected by customer: home (livraison à domicile) or stopdesk (livraison au bureau/point relais)';

COMMENT ON COLUMN orders.phone_confirmation_status IS 
  'Status of phone verification by admin: pending (awaiting call), confirmed (customer verified), failed (unreachable/cancelled)';

-- ============================================
-- STEP 8: Verify Final State
-- ============================================

-- Verify all changes were successful
DO $$
BEGIN
  -- Check tracking_number column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'tracking_number'
  ) THEN
    RAISE EXCEPTION 'tracking_number column missing after migration';
  END IF;

  -- Check guepex_tracking_number doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'guepex_tracking_number'
  ) THEN
    RAISE EXCEPTION 'guepex_tracking_number column still exists after migration';
  END IF;

  -- Check commune_id doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'commune_id'
  ) THEN
    RAISE EXCEPTION 'commune_id column still exists after migration';
  END IF;

  -- Check ENUM types were created
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'phone_confirmation_status'
  ) THEN
    RAISE EXCEPTION 'phone_confirmation_status ENUM type not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'delivery_type_enum'
  ) THEN
    RAISE EXCEPTION 'delivery_type_enum ENUM type not created';
  END IF;

  RAISE NOTICE 'Migration 010 completed successfully';
END $$;

COMMIT;

-- ============================================
-- ROLLBACK SCRIPT (Keep for reference, do NOT run)
-- ============================================
/*
BEGIN;

-- Restore tracking_number as separate column
ALTER TABLE orders RENAME COLUMN tracking_number TO guepex_tracking_number;
ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(50);
UPDATE orders SET tracking_number = guepex_tracking_number WHERE guepex_tracking_number IS NOT NULL;
DROP INDEX idx_orders_tracking;
CREATE INDEX idx_orders_tracking ON orders(tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX idx_orders_guepex_tracking ON orders(guepex_tracking_number) WHERE guepex_tracking_number IS NOT NULL;

-- Restore commune_id
ALTER TABLE orders ADD COLUMN commune_id INTEGER;
UPDATE orders SET commune_id = delivery_commune_id WHERE delivery_commune_id IS NOT NULL;
ALTER TABLE orders ADD CONSTRAINT fk_orders_commune FOREIGN KEY (commune_id) REFERENCES guepex_communes(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_commune ON orders(commune_id) WHERE commune_id IS NOT NULL;

-- Convert ENUMs back to VARCHAR
ALTER TABLE orders ALTER COLUMN phone_confirmation_status TYPE VARCHAR(20) USING phone_confirmation_status::text;
ALTER TABLE orders ALTER COLUMN delivery_type TYPE VARCHAR(50) USING delivery_type::text;

-- Drop ENUM types
DROP TYPE IF EXISTS phone_confirmation_status;
DROP TYPE IF EXISTS delivery_type_enum;

-- Remove FK and index for delivery_center_id
DROP INDEX IF EXISTS idx_orders_delivery_center;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_center;

COMMIT;
*/
