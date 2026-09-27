-- =====================================================
-- COMPREHENSIVE DATABASE ANALYSIS
-- =====================================================
-- Run this to get a complete overview of your database structure
-- and identify duplications, conflicts, and issues

\echo '========================================='
\echo 'DATABASE COMPREHENSIVE ANALYSIS'
\echo '========================================='
\echo ''

-- =====================================================
-- SECTION 1: ALL TABLES OVERVIEW
-- =====================================================

\echo '=== ALL TABLES IN DATABASE ==='
SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN tablename LIKE 'guepex_%' THEN 'Guepex API'
    WHEN tablename IN ('orders', 'order_items', 'order_history') THEN 'Orders'
    WHEN tablename IN ('products', 'product_images', 'product_attributes') THEN 'Products'
    WHEN tablename IN ('users', 'addresses') THEN 'Users'
    WHEN tablename IN ('warehouses', 'stock', 'stock_movement') THEN 'Inventory'
    WHEN tablename IN ('promotions', 'promotion_products') THEN 'Promotions'
    WHEN tablename IN ('reviews', 'favorites') THEN 'Reviews'
    WHEN tablename IN ('returns', 'return_items') THEN 'Returns'
    ELSE 'Other'
  END as category
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY category, tablename;

\echo ''
\echo '=== ALL VIEWS IN DATABASE ==='
SELECT 
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

\echo ''
\echo ''

-- =====================================================
-- SECTION 2: DETAILED TABLE STRUCTURE
-- =====================================================

\echo '=== SHIPPING/LOCATION TABLES - DETAILED STRUCTURE ==='
\echo ''
\echo '--- GUEPEX_WILAYAS ---'
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'guepex_wilayas'
ORDER BY ordinal_position;

\echo ''
\echo '--- GUEPEX_COMMUNES ---'
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'guepex_communes'
ORDER BY ordinal_position;

\echo ''
\echo '--- GUEPEX_CENTERS ---'
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'guepex_centers'
ORDER BY ordinal_position;

\echo ''
\echo '--- GUEPEX_SHIPPING_FEES ---'
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'guepex_shipping_fees'
ORDER BY ordinal_position;

\echo ''
\echo '--- GUEPEX_COMMUNE_FEES ---'
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'guepex_commune_fees'
ORDER BY ordinal_position;

\echo ''
\echo ''

-- =====================================================
-- SECTION 3: ORDERS TABLE STRUCTURE
-- =====================================================

\echo '=== ORDERS TABLE - DETAILED STRUCTURE ==='
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default,
  CASE 
    WHEN column_name LIKE '%wilaya%' OR column_name LIKE '%commune%' THEN 'Shipping Location'
    WHEN column_name LIKE '%tracking%' OR column_name LIKE '%guepex%' THEN 'Guepex Integration'
    WHEN column_name LIKE '%price%' OR column_name LIKE '%amount%' THEN 'Pricing'
    WHEN column_name LIKE '%status%' THEN 'Status'
    ELSE 'Other'
  END as field_category
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY 
  CASE field_category
    WHEN 'Shipping Location' THEN 1
    WHEN 'Guepex Integration' THEN 2
    WHEN 'Pricing' THEN 3
    WHEN 'Status' THEN 4
    ELSE 5
  END,
  ordinal_position;

\echo ''
\echo ''

-- =====================================================
-- SECTION 4: PRODUCTS TABLE STRUCTURE
-- =====================================================

\echo '=== PRODUCTS TABLE - DETAILED STRUCTURE ==='
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default,
  CASE 
    WHEN column_name LIKE '%weight%' OR column_name LIKE '%dimension%' OR column_name LIKE '%length%' OR column_name LIKE '%width%' OR column_name LIKE '%height%' THEN 'Physical'
    WHEN column_name LIKE '%price%' THEN 'Pricing'
    WHEN column_name LIKE '%stock%' THEN 'Inventory'
    ELSE 'Other'
  END as field_category
FROM information_schema.columns
WHERE table_name = 'products'
ORDER BY ordinal_position;

\echo ''
\echo ''

-- =====================================================
-- SECTION 5: WAREHOUSES TABLE STRUCTURE
-- =====================================================

\echo '=== WAREHOUSES TABLE - DETAILED STRUCTURE ==='
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'warehouses'
ORDER BY ordinal_position;

\echo ''
\echo ''

-- =====================================================
-- SECTION 6: ALL FOREIGN KEY CONSTRAINTS
-- =====================================================

\echo '=== ALL FOREIGN KEY CONSTRAINTS ==='
SELECT 
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo ''

-- =====================================================
-- SECTION 7: IDENTIFY POTENTIAL ISSUES
-- =====================================================

\echo '=== POTENTIAL ISSUES ANALYSIS ==='
\echo ''

\echo '--- 1. Tables with boolean stored as SMALLINT ---'
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'smallint'
  AND (column_name LIKE '%deliverable%' OR column_name LIKE '%has_%')
ORDER BY table_name, column_name;

\echo ''
\echo '--- 2. Missing foreign key constraints (orphaned columns) ---'
SELECT 
  c.table_name,
  c.column_name,
  c.data_type,
  'Should reference ' || 
    CASE 
      WHEN c.column_name LIKE '%wilaya_id%' THEN 'guepex_wilayas(id)'
      WHEN c.column_name LIKE '%commune_id%' THEN 'guepex_communes(id)'
      WHEN c.column_name LIKE '%user_id%' THEN 'users(id)'
      WHEN c.column_name LIKE '%product_id%' THEN 'products(id)'
      WHEN c.column_name LIKE '%category_id%' THEN 'categories(id)'
      WHEN c.column_name LIKE '%warehouse_id%' THEN 'warehouses(id)'
      ELSE 'check manually'
    END as suggested_reference
FROM information_schema.columns c
LEFT JOIN (
  SELECT 
    kcu.table_name,
    kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
) fk ON c.table_name = fk.table_name AND c.column_name = fk.column_name
WHERE c.table_schema = 'public'
  AND c.column_name LIKE '%_id'
  AND c.column_name NOT IN ('id', 'external_id', 'guepex_import_id', 'event_id', 'tracking_id')
  AND fk.column_name IS NULL
ORDER BY c.table_name, c.column_name;

\echo ''
\echo '--- 3. Duplicate table names (base vs prefixed) ---'
SELECT 
  t1.tablename as table1,
  t2.tablename as table2,
  'Potential duplicate' as issue
FROM pg_tables t1
JOIN pg_tables t2 
  ON t1.tablename = REPLACE(t2.tablename, 'guepex_', '')
WHERE t1.schemaname = 'public' 
  AND t2.schemaname = 'public'
  AND t1.tablename != t2.tablename
ORDER BY t1.tablename;

\echo ''
\echo '--- 4. Views pointing to non-existent tables ---'
WITH view_deps AS (
  SELECT DISTINCT
    v.viewname,
    d.refobjid::regclass::text as referenced_table
  FROM pg_views v
  JOIN pg_depend d ON d.objid = v.viewname::regclass::oid
  WHERE v.schemaname = 'public'
)
SELECT * FROM view_deps
WHERE NOT EXISTS (
  SELECT 1 FROM pg_tables t 
  WHERE t.schemaname = 'public' 
  AND t.tablename = referenced_table
)
ORDER BY viewname;

\echo ''
\echo ''

-- =====================================================
-- SECTION 8: DATA INTEGRITY CHECKS
-- =====================================================

\echo '=== DATA INTEGRITY CHECKS ==='
\echo ''

\echo '--- 1. Orders with invalid delivery locations ---'
SELECT 
  COUNT(*) as count,
  'Orders with invalid wilaya_id' as issue
FROM orders
WHERE delivery_wilaya_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM guepex_wilayas WHERE id = orders.delivery_wilaya_id
  )
UNION ALL
SELECT 
  COUNT(*),
  'Orders with invalid commune_id'
FROM orders
WHERE delivery_commune_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM guepex_communes WHERE id = orders.delivery_commune_id
  );

\echo ''
\echo '--- 2. Products with physical dimension issues ---'
SELECT 
  COUNT(*) as count,
  'Products missing weight' as issue
FROM products
WHERE weight IS NULL OR weight = 0
UNION ALL
SELECT 
  COUNT(*),
  'Products missing dimensions'
FROM products
WHERE length IS NULL OR width IS NULL OR height IS NULL;

\echo ''
\echo '--- 3. Warehouses without location reference ---'
SELECT 
  id,
  name,
  wilaya_id,
  'No FK to wilayas' as issue
FROM warehouses
WHERE wilaya_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM guepex_wilayas WHERE id = warehouses.wilaya_id
  );

\echo ''
\echo ''

-- =====================================================
-- SECTION 9: INDEX ANALYSIS
-- =====================================================

\echo '=== INDEX ANALYSIS ==='
\echo ''

\echo '--- All indexes on shipping/location tables ---'
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    tablename LIKE 'guepex_%' 
    OR tablename IN ('wilayas', 'communes', 'centers')
  )
ORDER BY tablename, indexname;

\echo ''
\echo '--- Missing indexes on foreign keys ---'
SELECT 
  tc.table_name,
  kcu.column_name,
  'Missing index on FK' as recommendation
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE schemaname = 'public'
      AND tablename = tc.table_name
      AND indexdef LIKE '%' || kcu.column_name || '%'
  )
ORDER BY tc.table_name, kcu.column_name;

\echo ''
\echo ''

-- =====================================================
-- SECTION 10: SUMMARY & RECOMMENDATIONS
-- =====================================================

\echo '=== DATABASE HEALTH SUMMARY ==='
\echo ''

SELECT 
  'Total Tables' as metric,
  COUNT(*)::text as value
FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Total Views',
  COUNT(*)::text
FROM pg_views WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Foreign Key Constraints',
  COUNT(*)::text
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'
UNION ALL
SELECT 
  'Guepex Wilayas',
  COUNT(*)::text
FROM guepex_wilayas
UNION ALL
SELECT 
  'Guepex Communes',
  COUNT(*)::text
FROM guepex_communes
UNION ALL
SELECT 
  'Guepex Centers',
  COUNT(*)::text
FROM guepex_centers
UNION ALL
SELECT 
  'Total Products',
  COUNT(*)::text
FROM products
UNION ALL
SELECT 
  'Total Orders',
  COUNT(*)::text
FROM orders;

\echo ''
\echo '========================================='
\echo 'ANALYSIS COMPLETE'
\echo '========================================='
