-- =====================================================
-- FINAL DATABASE VERIFICATION
-- =====================================================
-- Comprehensive check after all fixes applied

\echo '========================================='
\echo 'FINAL DATABASE VERIFICATION'
\echo '========================================='
\echo ''

-- =====================================================
-- SECTION 1: TABLE & COLUMN EXISTENCE
-- =====================================================

\echo '=== 1. CRITICAL TABLES CHECK ==='
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'guepex_wilayas') 
    THEN '[OK] guepex_wilayas exists'
    ELSE '[FAIL] guepex_wilayas missing'
  END as check
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'guepex_communes') 
    THEN '[OK] guepex_communes exists'
    ELSE '[FAIL] guepex_communes missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'guepex_shipping_fees') 
    THEN '[OK] guepex_shipping_fees exists'
    ELSE '[FAIL] guepex_shipping_fees missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'guepex_commune_fees') 
    THEN '[OK] guepex_commune_fees exists'
    ELSE '[FAIL] guepex_commune_fees missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'products') 
    THEN '[OK] products exists'
    ELSE '[FAIL] products missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'orders') 
    THEN '[OK] orders exists'
    ELSE '[FAIL] orders missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'warehouses') 
    THEN '[OK] warehouses exists'
    ELSE '[FAIL] warehouses missing'
  END;

\echo ''
\echo '=== 2. CRITICAL VIEWS CHECK ==='
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'wilayas') 
    THEN '[OK] wilayas view exists'
    ELSE '[FAIL] wilayas view missing'
  END as check
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'communes') 
    THEN '[OK] communes view exists'
    ELSE '[FAIL] communes view missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'shipping_fees') 
    THEN '[OK] shipping_fees view exists'
    ELSE '[FAIL] shipping_fees view missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'commune_fees') 
    THEN '[OK] commune_fees view exists'
    ELSE '[FAIL] commune_fees view missing'
  END;

\echo ''
\echo '=== 3. PRODUCTS DIMENSION COLUMNS CHECK ==='
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'length_cm'
    ) 
    THEN '[OK] products.length_cm exists'
    ELSE '[FAIL] products.length_cm missing'
  END as check
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'width_cm'
    ) 
    THEN '[OK] products.width_cm exists'
    ELSE '[FAIL] products.width_cm missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'height_cm'
    ) 
    THEN '[OK] products.height_cm exists'
    ELSE '[FAIL] products.height_cm missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'weight_kg'
    ) 
    THEN '[OK] products.weight_kg exists'
    ELSE '[FAIL] products.weight_kg missing'
  END;

\echo ''

-- =====================================================
-- SECTION 2: FOREIGN KEY CONSTRAINTS
-- =====================================================

\echo '=== 4. CRITICAL FOREIGN KEYS CHECK ==='
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_orders_delivery_wilaya'
    ) 
    THEN '[OK] fk_orders_delivery_wilaya exists'
    ELSE '[FAIL] fk_orders_delivery_wilaya missing'
  END as check
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_orders_delivery_commune'
    ) 
    THEN '[OK] fk_orders_delivery_commune exists'
    ELSE '[FAIL] fk_orders_delivery_commune missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_orders_commune'
    ) 
    THEN '[OK] fk_orders_commune exists'
    ELSE '[FAIL] fk_orders_commune missing'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_warehouses_wilaya'
    ) 
    THEN '[OK] fk_warehouses_wilaya exists'
    ELSE '[FAIL] fk_warehouses_wilaya missing'
  END;

\echo ''

-- =====================================================
-- SECTION 3: DATA INTEGRITY
-- =====================================================

\echo '=== 5. DATA COUNTS ==='
SELECT 
  'Guepex Wilayas' as entity,
  COUNT(*)::text as count,
  CASE WHEN COUNT(*) >= 58 THEN '[OK]' ELSE '[WARN]' END as status
FROM guepex_wilayas
UNION ALL
SELECT 
  'Guepex Communes',
  COUNT(*)::text,
  CASE WHEN COUNT(*) >= 1500 THEN '[OK]' ELSE '[WARN]' END
FROM guepex_communes
UNION ALL
SELECT 
  'Guepex Centers',
  COUNT(*)::text,
  CASE WHEN COUNT(*) >= 100 THEN '[OK]' ELSE '[WARN]' END
FROM guepex_centers
UNION ALL
SELECT 
  'Shipping Fees',
  COUNT(*)::text,
  CASE WHEN COUNT(*) > 0 THEN '[OK]' ELSE '[FAIL]' END
FROM guepex_shipping_fees
UNION ALL
SELECT 
  'Commune Fees',
  COUNT(*)::text,
  CASE WHEN COUNT(*) > 0 THEN '[OK]' ELSE '[FAIL]' END
FROM guepex_commune_fees
UNION ALL
SELECT 
  'Products',
  COUNT(*)::text,
  CASE WHEN COUNT(*) > 0 THEN '[OK]' ELSE '[WARN]' END
FROM products
WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Products with dimensions',
  COUNT(*)::text,
  CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) 
       THEN '[OK]' ELSE '[WARN]' END
FROM products
WHERE deleted_at IS NULL 
  AND length_cm IS NOT NULL 
  AND width_cm IS NOT NULL 
  AND height_cm IS NOT NULL
UNION ALL
SELECT 
  'Products with weight',
  COUNT(*)::text,
  CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) 
       THEN '[OK]' ELSE '[WARN]' END
FROM products
WHERE deleted_at IS NULL 
  AND weight_kg IS NOT NULL 
  AND weight_kg > 0;

\echo ''
\echo '=== 6. SHIPPING CALCULATION TEST ==='

-- Test if we can calculate shipping for a sample route
SELECT 
  'Sample Shipping Calculation' as test,
  CASE 
    WHEN (
      SELECT COUNT(*) FROM guepex_commune_fees 
      WHERE from_wilaya_id = 16  -- Algiers
      LIMIT 1
    ) > 0 
    AND (
      SELECT COUNT(*) FROM guepex_shipping_fees 
      WHERE from_wilaya_id = 16
      LIMIT 1
    ) > 0
    THEN '[OK] Can calculate shipping from Algiers'
    ELSE '[FAIL] Missing shipping data for Algiers'
  END as result;

\echo ''

-- Test sample fee retrieval
SELECT 
  'Sample Commune Fee' as test,
  express_home::text || ' DZD' as express_home_fee,
  economic_home::text || ' DZD' as economic_home_fee,
  cod_percentage::text || '%' as cod_percentage,
  '[OK]' as status
FROM guepex_commune_fees
WHERE from_wilaya_id = 16
LIMIT 1;

\echo ''

-- =====================================================
-- SECTION 4: INDEX VERIFICATION
-- =====================================================

\echo '=== 7. CRITICAL INDEXES CHECK ==='
SELECT 
  tablename,
  COUNT(*) as index_count,
  CASE 
    WHEN COUNT(*) >= 3 THEN '[OK]'
    ELSE '[WARN]'
  END as status
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('guepex_wilayas', 'guepex_communes', 'guepex_shipping_fees', 
                  'guepex_commune_fees', 'products', 'orders', 'warehouses')
GROUP BY tablename
ORDER BY tablename;

\echo ''

-- =====================================================
-- SECTION 5: VIEW FUNCTIONALITY TEST
-- =====================================================

\echo '=== 8. VIEW FUNCTIONALITY TEST ==='

-- Test wilayas view
SELECT 
  'wilayas view' as view_name,
  COUNT(*)::text as record_count,
  CASE WHEN COUNT(*) >= 58 THEN '[OK]' ELSE '[FAIL]' END as status
FROM wilayas;

-- Test communes view
SELECT 
  'communes view' as view_name,
  COUNT(*)::text as record_count,
  CASE WHEN COUNT(*) >= 1500 THEN '[OK]' ELSE '[FAIL]' END as status
FROM communes;

-- Test shipping_fees view
SELECT 
  'shipping_fees view' as view_name,
  COUNT(*)::text as record_count,
  CASE WHEN COUNT(*) > 0 THEN '[OK]' ELSE '[FAIL]' END as status
FROM shipping_fees;

-- Test commune_fees view
SELECT 
  'commune_fees view' as view_name,
  COUNT(*)::text as record_count,
  CASE WHEN COUNT(*) > 0 THEN '[OK]' ELSE '[FAIL]' END as status
FROM commune_fees;

\echo ''

-- =====================================================
-- SECTION 6: POTENTIAL ISSUES CHECK
-- =====================================================

\echo '=== 9. POTENTIAL ISSUES ==='

-- Orders with invalid location references
SELECT 
  '[CRITICAL]' as severity,
  'Orders with invalid delivery_wilaya_id' as issue,
  COUNT(*)::text as count
FROM orders
WHERE delivery_wilaya_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM guepex_wilayas WHERE id = orders.delivery_wilaya_id
  );

SELECT 
  '[CRITICAL]' as severity,
  'Orders with invalid delivery_commune_id' as issue,
  COUNT(*)::text as count
FROM orders
WHERE delivery_commune_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM guepex_communes WHERE id = orders.delivery_commune_id
  );

-- Products missing critical shipping data
SELECT 
  '[WARNING]' as severity,
  'Active products missing weight' as issue,
  COUNT(*)::text as count
FROM products
WHERE deleted_at IS NULL
  AND is_active = true
  AND (weight_kg IS NULL OR weight_kg = 0);

SELECT 
  '[WARNING]' as severity,
  'Active products missing dimensions' as issue,
  COUNT(*)::text as count
FROM products
WHERE deleted_at IS NULL
  AND is_active = true
  AND (length_cm IS NULL OR width_cm IS NULL OR height_cm IS NULL);

\echo ''

-- =====================================================
-- FINAL SUMMARY
-- =====================================================

\echo '========================================='
\echo 'VERIFICATION SUMMARY'
\echo '========================================='
\echo ''

SELECT 
  'Total Tables' as metric,
  COUNT(*)::text as value
FROM pg_tables 
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Total Views',
  COUNT(*)::text
FROM pg_views 
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Total Indexes',
  COUNT(*)::text
FROM pg_indexes 
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Foreign Key Constraints',
  COUNT(*)::text
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY' 
  AND table_schema = 'public';

\echo ''
\echo '========================================='
\echo 'VERIFICATION COMPLETE'
\echo '========================================='
