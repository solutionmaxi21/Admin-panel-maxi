-- Migration: Rename guepex_* tables to standard names
-- Date: 2026-01-05
-- Description: Consolidate duplicate table structure by renaming guepex_* tables
--              to standard names (wilayas, communes, centers, shipping_fees, commune_fees)
--              This resolves conflicts between legacy schema and Guepex API tables

-- IMPORTANT: Run this migration ONLY after confirming:
-- 1. guepex_* tables contain all necessary data from Guepex API sync
-- 2. No active references to old wilayas/communes/shipping_centers tables
-- 3. Backup database before executing

-- =====================================================
-- STEP 1: Drop old tables if they exist (they should be commented out in 001_schema.sql)
-- =====================================================

-- Drop old tables and their dependencies
DROP TABLE IF EXISTS shipping_tariffs CASCADE;
DROP TABLE IF EXISTS shipping_centers CASCADE;
DROP TABLE IF EXISTS communes CASCADE;
DROP TABLE IF EXISTS wilayas CASCADE;

-- =====================================================
-- STEP 2: Rename guepex_* tables to standard names
-- =====================================================

-- Rename wilayas table
ALTER TABLE IF EXISTS guepex_wilayas RENAME TO wilayas;
ALTER INDEX IF EXISTS idx_guepex_wilayas_deliverable RENAME TO idx_wilayas_deliverable;
ALTER INDEX IF EXISTS idx_guepex_wilayas_zone RENAME TO idx_wilayas_zone;

-- Rename communes table
ALTER TABLE IF EXISTS guepex_communes RENAME TO communes;
ALTER INDEX IF EXISTS idx_guepex_communes_wilaya RENAME TO idx_communes_wilaya;
ALTER INDEX IF EXISTS idx_guepex_communes_deliverable RENAME TO idx_communes_deliverable;
ALTER INDEX IF EXISTS idx_guepex_communes_stop_desk RENAME TO idx_communes_stop_desk;

-- Rename centers table
ALTER TABLE IF EXISTS guepex_centers RENAME TO centers;
ALTER INDEX IF EXISTS idx_guepex_centers_commune RENAME TO idx_centers_commune;
ALTER INDEX IF EXISTS idx_guepex_centers_wilaya RENAME TO idx_centers_wilaya;

-- Rename shipping fees table
ALTER TABLE IF EXISTS guepex_shipping_fees RENAME TO shipping_fees;
ALTER INDEX IF EXISTS idx_shipping_fees_from RENAME TO idx_shipping_fees_from_wilaya;
ALTER INDEX IF EXISTS idx_shipping_fees_to RENAME TO idx_shipping_fees_to_wilaya;
ALTER INDEX IF EXISTS idx_shipping_fees_route RENAME TO idx_shipping_fees_wilaya_route;

-- Rename commune fees table
ALTER TABLE IF EXISTS guepex_commune_fees RENAME TO commune_fees;
ALTER INDEX IF EXISTS idx_commune_fees_from RENAME TO idx_commune_fees_from_wilaya;
ALTER INDEX IF EXISTS idx_commune_fees_to RENAME TO idx_commune_fees_to_commune;
ALTER INDEX IF EXISTS idx_commune_fees_route RENAME TO idx_commune_fees_commune_route;

-- Rename sync log table
ALTER TABLE IF EXISTS guepex_sync_log RENAME TO shipping_sync_log;
ALTER INDEX IF EXISTS idx_sync_log_type RENAME TO idx_shipping_sync_log_type;
ALTER INDEX IF EXISTS idx_sync_log_date RENAME TO idx_shipping_sync_log_date;

-- =====================================================
-- STEP 3: Update foreign key constraint names in orders table
-- =====================================================

-- Drop old constraints with guepex prefix
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_wilaya;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_commune;

-- Add new constraints with standard names
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_wilaya 
    FOREIGN KEY (delivery_wilaya_id) REFERENCES wilayas(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_commune 
    FOREIGN KEY (delivery_commune_id) REFERENCES communes(id) ON DELETE SET NULL;

-- =====================================================
-- STEP 4: Add table and column comments
-- =====================================================

COMMENT ON TABLE wilayas IS 'Algerian provinces (wilayas) - synced from Guepex API';
COMMENT ON TABLE communes IS 'Algerian cities/districts (communes) - synced from Guepex API';
COMMENT ON TABLE centers IS 'Guepex/Yalidine delivery centers and stop desks - synced from Guepex API';
COMMENT ON TABLE shipping_fees IS 'Wilaya-to-wilaya shipping fees - synced from Guepex API';
COMMENT ON TABLE commune_fees IS 'Detailed commune-level shipping fees - synced from Guepex API';
COMMENT ON TABLE shipping_sync_log IS 'Log of Guepex API synchronization operations';

COMMENT ON COLUMN wilayas.zone IS 'Delivery zone (1-5) for pricing calculation';
COMMENT ON COLUMN wilayas.is_deliverable IS '1 = deliverable, 0 = not deliverable';
COMMENT ON COLUMN wilayas.last_synced_at IS 'Last sync timestamp from Guepex API';

COMMENT ON COLUMN communes.has_stop_desk IS '1 = has Guepex stop desk, 0 = no stop desk';
COMMENT ON COLUMN communes.is_deliverable IS '1 = deliverable, 0 = not deliverable';
COMMENT ON COLUMN communes.delivery_time_parcel IS 'Estimated delivery time for parcel (days)';
COMMENT ON COLUMN communes.delivery_time_payment IS 'Estimated payment time (days)';

COMMENT ON COLUMN centers.center_id IS 'Guepex center ID from API';
COMMENT ON COLUMN centers.gps IS 'GPS coordinates in format: latitude,longitude';

COMMENT ON COLUMN shipping_fees.retour_fee IS 'Return fee in Algerian Dinars (DZD)';
COMMENT ON COLUMN shipping_fees.cod_percentage IS 'Cash on delivery percentage fee';
COMMENT ON COLUMN shipping_fees.insurance_percentage IS 'Insurance percentage fee';
COMMENT ON COLUMN shipping_fees.oversize_fee IS 'Oversize parcel fee in DZD';

COMMENT ON COLUMN commune_fees.express_home IS 'Express home delivery fee in DZD';
COMMENT ON COLUMN commune_fees.express_desk IS 'Express stop desk delivery fee in DZD';
COMMENT ON COLUMN commune_fees.economic_home IS 'Economic home delivery fee in DZD';
COMMENT ON COLUMN commune_fees.economic_desk IS 'Economic stop desk delivery fee in DZD';

-- =====================================================
-- STEP 5: Create views for backward compatibility (optional)
-- =====================================================

-- Create views with guepex_ prefix for legacy code compatibility
CREATE OR REPLACE VIEW guepex_wilayas AS SELECT * FROM wilayas;
CREATE OR REPLACE VIEW guepex_communes AS SELECT * FROM communes;
CREATE OR REPLACE VIEW guepex_centers AS SELECT * FROM centers;
CREATE OR REPLACE VIEW guepex_shipping_fees AS SELECT * FROM shipping_fees;
CREATE OR REPLACE VIEW guepex_commune_fees AS SELECT * FROM commune_fees;
CREATE OR REPLACE VIEW guepex_sync_log AS SELECT * FROM shipping_sync_log;

COMMENT ON VIEW guepex_wilayas IS 'Backward compatibility view - use wilayas table directly';
COMMENT ON VIEW guepex_communes IS 'Backward compatibility view - use communes table directly';
COMMENT ON VIEW guepex_centers IS 'Backward compatibility view - use centers table directly';
COMMENT ON VIEW guepex_shipping_fees IS 'Backward compatibility view - use shipping_fees table directly';
COMMENT ON VIEW guepex_commune_fees IS 'Backward compatibility view - use commune_fees table directly';
COMMENT ON VIEW guepex_sync_log IS 'Backward compatibility view - use shipping_sync_log table directly';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Uncomment to verify migration success:
-- SELECT 'wilayas' as table_name, COUNT(*) as row_count FROM wilayas
-- UNION ALL
-- SELECT 'communes', COUNT(*) FROM communes
-- UNION ALL
-- SELECT 'centers', COUNT(*) FROM centers
-- UNION ALL
-- SELECT 'shipping_fees', COUNT(*) FROM shipping_fees
-- UNION ALL
-- SELECT 'commune_fees', COUNT(*) FROM commune_fees
-- UNION ALL
-- SELECT 'shipping_sync_log', COUNT(*) FROM shipping_sync_log;
