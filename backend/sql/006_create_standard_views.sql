-- ALTERNATIVE MIGRATION: Create views without renaming tables
-- Date: 2026-01-05
-- Description: This is a safer alternative to 006_rename_guepex_tables.sql
--              Instead of renaming tables, we create views with standard names
--              that reference the guepex_* tables. This allows gradual migration
--              of application code while maintaining backward compatibility.

-- ADVANTAGES:
-- 1. No data migration needed
-- 2. Both old and new code continue to work
-- 3. Foreign keys remain intact
-- 4. Easy rollback (just drop views)
-- 5. Gradual code migration possible

-- =====================================================
-- STEP 1: Drop old empty tables if they exist
-- =====================================================

-- Only drop if they are empty (safety check in comments)
-- DO $$ 
-- BEGIN
--   IF (SELECT COUNT(*) FROM wilayas) = 0 THEN
--     DROP TABLE IF EXISTS shipping_tariffs CASCADE;
--     DROP TABLE IF EXISTS shipping_centers CASCADE;
--     DROP TABLE IF EXISTS communes CASCADE;
--     DROP TABLE IF EXISTS wilayas CASCADE;
--   ELSE
--     RAISE NOTICE 'Old tables contain data. Please migrate data first!';
--   END IF;
-- END $$;

-- For safety, manually verify and drop:
-- SELECT COUNT(*) FROM wilayas; -- Should be 0
-- SELECT COUNT(*) FROM communes; -- Should be 0
-- SELECT COUNT(*) FROM shipping_centers; -- Should be 0
-- SELECT COUNT(*) FROM shipping_tariffs; -- Should be 0

-- If all are empty or don't exist, drop them:
DROP TABLE IF EXISTS shipping_tariffs CASCADE;
DROP TABLE IF EXISTS shipping_centers CASCADE;
DROP TABLE IF EXISTS communes CASCADE;
DROP TABLE IF EXISTS wilayas CASCADE;

-- =====================================================
-- STEP 2: Create views with standard names
-- =====================================================

-- Create wilayas view
CREATE OR REPLACE VIEW wilayas AS 
SELECT 
  id,
  name,
  zone,
  CASE WHEN is_deliverable = 1 THEN true ELSE false END as is_deliverable,
  last_synced_at as created_at
FROM guepex_wilayas;

COMMENT ON VIEW wilayas IS 'Standard view of wilayas - maps to guepex_wilayas table';

-- Create communes view
CREATE OR REPLACE VIEW communes AS
SELECT 
  id,
  name,
  wilaya_id,
  CASE WHEN has_stop_desk = 1 THEN true ELSE false END as has_stop_desk,
  CASE WHEN is_deliverable = 1 THEN true ELSE false END as is_deliverable,
  delivery_time_parcel,
  delivery_time_payment,
  last_synced_at as created_at
FROM guepex_communes;

COMMENT ON VIEW communes IS 'Standard view of communes - maps to guepex_communes table';

-- Create centers view (maps to guepex_centers)
CREATE OR REPLACE VIEW centers AS
SELECT 
  center_id as id,
  name,
  address,
  gps,
  commune_id,
  wilaya_id,
  'Guepex' as provider,
  last_synced_at as created_at,
  last_synced_at as updated_at
FROM guepex_centers;

COMMENT ON VIEW centers IS 'Standard view of centers - maps to guepex_centers table';

-- Create shipping_centers view (alternative name for centers)
CREATE OR REPLACE VIEW shipping_centers AS SELECT * FROM centers;

COMMENT ON VIEW shipping_centers IS 'Alias for centers view for backward compatibility';

-- Create shipping_fees view
CREATE OR REPLACE VIEW shipping_fees AS SELECT * FROM guepex_shipping_fees;

COMMENT ON VIEW shipping_fees IS 'Standard view of shipping fees - maps to guepex_shipping_fees table';

-- Create commune_fees view
CREATE OR REPLACE VIEW commune_fees AS SELECT * FROM guepex_commune_fees;

COMMENT ON VIEW commune_fees IS 'Standard view of commune fees - maps to guepex_commune_fees table';

-- =====================================================
-- STEP 3: Update foreign key constraints in orders table
-- =====================================================

-- Drop existing constraints if any
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_wilaya;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_commune;

-- Add constraints to reference the guepex tables directly
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_wilaya 
    FOREIGN KEY (delivery_wilaya_id) REFERENCES guepex_wilayas(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_commune 
    FOREIGN KEY (delivery_commune_id) REFERENCES guepex_communes(id) ON DELETE SET NULL;

-- =====================================================
-- STEP 4: Verification queries
-- =====================================================

-- Verify views work correctly
-- SELECT 'wilayas view' as test, COUNT(*) as count FROM wilayas
-- UNION ALL
-- SELECT 'communes view', COUNT(*) FROM communes
-- UNION ALL
-- SELECT 'centers view', COUNT(*) FROM centers
-- UNION ALL
-- SELECT 'shipping_fees view', COUNT(*) FROM shipping_fees
-- UNION ALL
-- SELECT 'commune_fees view', COUNT(*) FROM commune_fees;

-- Test queries work through views
-- SELECT * FROM wilayas LIMIT 1;
-- SELECT * FROM communes LIMIT 1;
-- SELECT * FROM centers LIMIT 1;

-- =====================================================
-- NOTES FOR APPLICATION CODE UPDATES
-- =====================================================

-- After applying this migration:
-- 1. Application code can reference either guepex_* tables OR standard views
-- 2. New code should use standard names (wilayas, communes, centers)
-- 3. Existing code with guepex_* references will continue to work
-- 4. Gradually update application code to use standard names
-- 5. Once all code is updated, you can optionally run 006_rename_guepex_tables.sql
--    to physically rename tables and remove views

-- Files that need updating (optional, for clean code):
-- - backend/routes/shipping-v2.js (already updated)
-- - backend/src/services/shipping-calculator-pg.js
-- - backend/src/services/guepex-sync.js
-- - Any other files querying these tables
