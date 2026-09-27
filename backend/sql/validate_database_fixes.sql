-- Database Validation Script
-- Run this after applying migrations to verify everything works correctly

-- =====================================================
-- SECTION 1: Table and View Existence Check
-- =====================================================

\echo '=== Checking Table and View Existence ==='

SELECT 
  table_name, 
  table_type,
  CASE 
    WHEN table_type = 'BASE TABLE' THEN 'OK Table'
    WHEN table_type = 'VIEW' THEN 'OK View'
    ELSE table_type
  END as type_display
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'wilayas', 'communes', 'centers', 'shipping_centers',
    'guepex_wilayas', 'guepex_communes', 'guepex_centers',
    'shipping_fees', 'guepex_shipping_fees',
    'commune_fees', 'guepex_commune_fees',
    'shipping_sync_log', 'guepex_sync_log'
  )
ORDER BY table_name;

-- Expected Results After View Migration:
-- guepex_wilayas     | BASE TABLE | OK Table
-- guepex_communes    | BASE TABLE | OK Table
-- guepex_centers     | BASE TABLE | OK Table
-- guepex_shipping_fees | BASE TABLE | OK Table
-- guepex_commune_fees | BASE TABLE | OK Table
-- guepex_sync_log    | BASE TABLE | OK Table
-- wilayas           | VIEW       | OK View
-- communes          | VIEW       | OK View
-- centers           | VIEW       | OK View
-- shipping_centers  | VIEW       | OK View (alias)
-- shipping_fees     | VIEW       | OK View
-- commune_fees      | VIEW       | OK View

\echo ''
\echo '=== Checking for Deprecated Tables (should not exist) ==='

SELECT 
  tablename,
  'FAIL - Should be dropped or commented out' as status
FROM pg_tables 
WHERE schemaname = 'public'
  AND tablename IN ('shipping_tariffs')
  AND tablename NOT LIKE 'guepex_%';

-- Expected: No rows (or only if old tables still exist)

-- =====================================================
-- SECTION 2: Foreign Key Constraints Check
-- =====================================================

\echo ''
\echo '=== Checking Foreign Key Constraints on Orders Table ==='

SELECT 
  conname as constraint_name,
  conrelid::regclass as from_table,
  confrelid::regclass as to_table,
  pg_get_constraintdef(oid) as definition,
  CASE 
    WHEN confrelid::regclass::text LIKE 'guepex_%' THEN 'OK References guepex table'
    ELSE 'WARN Check reference'
  END as status
FROM pg_constraint 
WHERE contype = 'f' 
  AND conrelid = 'orders'::regclass 
  AND (conname LIKE '%wilaya%' OR conname LIKE '%commune%')
ORDER BY conname;

-- Expected Results:
-- fk_orders_delivery_commune | orders | guepex_communes | FOREIGN KEY ... | OK References guepex table
-- fk_orders_delivery_wilaya  | orders | guepex_wilayas  | FOREIGN KEY ... | OK References guepex table

-- =====================================================
-- SECTION 3: Data Count Verification
-- =====================================================

\echo ''
\echo '=== Data Count Verification ==='

SELECT 
  'guepex_wilayas' as table_name,
  COUNT(*) as row_count,
  CASE 
    WHEN COUNT(*) >= 48 THEN 'OK Has data (48 wilayas)'
    WHEN COUNT(*) > 0 THEN 'WARN Partial data'
    ELSE 'FAIL No data - needs Guepex sync'
  END as status
FROM guepex_wilayas

UNION ALL

SELECT 
  'guepex_communes',
  COUNT(*),
  CASE 
    WHEN COUNT(*) >= 1000 THEN 'OK Has data (1000+ communes)'
    WHEN COUNT(*) > 0 THEN 'WARN Partial data'
    ELSE 'FAIL No data - needs Guepex sync'
  END
FROM guepex_communes

UNION ALL

SELECT 
  'guepex_centers',
  COUNT(*),
  CASE 
    WHEN COUNT(*) > 0 THEN 'OK Has centers'
    ELSE 'WARN No centers - check Guepex sync'
  END
FROM guepex_centers

UNION ALL

SELECT 
  'guepex_shipping_fees',
  COUNT(*),
  CASE 
    WHEN COUNT(*) > 0 THEN 'OK Has shipping fees'
    ELSE 'WARN No fees - needs Guepex sync'
  END
FROM guepex_shipping_fees

UNION ALL

SELECT 
  'guepex_commune_fees',
  COUNT(*),
  CASE 
    WHEN COUNT(*) > 0 THEN 'OK Has commune fees'
    ELSE 'WARN No commune fees - needs Guepex sync'
  END
FROM guepex_commune_fees;

-- =====================================================
-- SECTION 4: View Functionality Test
-- =====================================================

\echo ''
\echo '=== Testing View Queries ==='

-- Test wilayas view
SELECT 
  'wilayas view' as test,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN 'OK Working' ELSE 'FAIL Empty' END as status
FROM wilayas;

-- Test communes view  
SELECT 
  'communes view' as test,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN 'OK Working' ELSE 'FAIL Empty' END as status
FROM communes;

-- Test centers view
SELECT 
  'centers view' as test,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN 'OK Working' ELSE 'WARN Empty (may be normal)' END as status
FROM centers;

-- Test JOIN through views
SELECT 
  'wilayas-communes JOIN' as test,
  COUNT(*) as count,
  CASE WHEN COUNT(*) > 0 THEN 'OK Working' ELSE 'FAIL Failed' END as status
FROM wilayas w
INNER JOIN communes c ON c.wilaya_id = w.id;

-- =====================================================
-- SECTION 5: Sample Data Display
-- =====================================================

\echo ''
\echo '=== Sample Wilayas Data ==='

SELECT id, name, zone, is_deliverable 
FROM wilayas 
ORDER BY id 
LIMIT 5;

\echo ''
\echo '=== Sample Communes Data ==='

SELECT id, name, wilaya_id, has_stop_desk, is_deliverable
FROM communes 
ORDER BY id 
LIMIT 5;

\echo ''
\echo '=== Wilayas with Commune Counts ==='

SELECT 
  w.id,
  w.name as wilaya_name,
  w.zone,
  COUNT(c.id) as commune_count,
  SUM(CASE WHEN c.is_deliverable THEN 1 ELSE 0 END) as deliverable_communes,
  SUM(CASE WHEN c.has_stop_desk THEN 1 ELSE 0 END) as communes_with_stop_desk
FROM wilayas w
LEFT JOIN communes c ON c.wilaya_id = w.id
GROUP BY w.id, w.name, w.zone
ORDER BY w.id
LIMIT 10;

-- =====================================================
-- SECTION 6: Index Verification
-- =====================================================

\echo ''
\echo '=== Checking Important Indexes ==='

SELECT 
  tablename,
  indexname,
  indexdef,
  CASE 
    WHEN indexname LIKE 'idx_%' THEN 'OK Custom index'
    WHEN indexname LIKE '%pkey' THEN 'OK Primary key'
    ELSE 'OK Index'
  END as status
FROM pg_indexes 
WHERE schemaname = 'public'
  AND tablename IN ('guepex_wilayas', 'guepex_communes', 'guepex_centers',
                    'guepex_shipping_fees', 'guepex_commune_fees', 'orders')
  AND (indexname LIKE '%wilaya%' OR indexname LIKE '%commune%' OR indexname LIKE '%delivery%')
ORDER BY tablename, indexname;

-- =====================================================
-- SECTION 7: Orders Table Integration Check
-- =====================================================

\echo ''
\echo '=== Checking Orders Table Columns ==='

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  CASE 
    WHEN column_name IN ('delivery_wilaya_id', 'delivery_commune_id') THEN 'OK Guepex integration column'
    ELSE '- Standard column'
  END as purpose
FROM information_schema.columns 
WHERE table_name = 'orders'
  AND column_name IN (
    'delivery_wilaya_id', 
    'delivery_commune_id',
    'tracking_number',
    'guepex_tracking_number',
    'shipment_status'
  )
ORDER BY column_name;

-- =====================================================
-- SECTION 8: Potential Issues Check
-- =====================================================

\echo ''
\echo '=== Checking for Potential Issues ==='

-- Check for orders with invalid wilaya references
SELECT 
  'Orders with invalid wilaya_id' as issue,
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) = 0 THEN 'OK No issues'
    ELSE 'FAIL Found invalid references'
  END as status
FROM orders o
WHERE delivery_wilaya_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM guepex_wilayas w WHERE w.id = o.delivery_wilaya_id
  );

-- Check for orders with invalid commune references
SELECT 
  'Orders with invalid commune_id' as issue,
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) = 0 THEN 'OK No issues'
    ELSE 'FAIL Found invalid references'
  END as status
FROM orders o
WHERE delivery_commune_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM guepex_communes c WHERE c.id = o.delivery_commune_id
  );

-- Check for communes referencing non-existent wilayas
SELECT 
  'Communes with invalid wilaya_id' as issue,
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) = 0 THEN 'OK No issues'
    ELSE 'FAIL Found invalid references'
  END as status
FROM guepex_communes c
WHERE NOT EXISTS (
  SELECT 1 FROM guepex_wilayas w WHERE w.id = c.wilaya_id
);

-- =====================================================
-- SECTION 9: Performance Check
-- =====================================================

\echo ''
\echo '=== Performance: Explain Plan for Common Query ==='

EXPLAIN ANALYZE
SELECT 
  w.name as wilaya,
  c.name as commune,
  c.has_stop_desk,
  c.delivery_time_parcel
FROM wilayas w
JOIN communes c ON c.wilaya_id = w.id
WHERE w.is_deliverable = true
  AND c.is_deliverable = true
LIMIT 10;

-- =====================================================
-- SUMMARY
-- =====================================================

\echo ''
\echo '=== VALIDATION SUMMARY ==='
\echo 'If all checks show OK or WARN (warnings), the migration was successful.'
\echo 'Any FAIL indicates an issue that needs attention.'
\echo ''
\echo 'Next steps:'
\echo '1. If guepex tables are empty, run Guepex sync: npm run sync-guepex'
\echo '2. Test application endpoints: GET /api/v2/shipping/wilayas'
\echo '3. Monitor application logs for query errors'
\echo '4. Consider updating shipping-calculator-pg.js to use standard names'
