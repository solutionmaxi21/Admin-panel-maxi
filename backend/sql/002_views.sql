-- Active Views - Automatically filter soft-deleted records
-- These views provide a clean interface to query only active records

-- Active Products View
CREATE OR REPLACE VIEW active_products AS
SELECT *
FROM products
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_products IS 'Products that have not been soft-deleted';

-- Active Categories View
CREATE OR REPLACE VIEW active_categories AS
SELECT *
FROM categories
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_categories IS 'Categories that have not been soft-deleted';

-- Active Users View
CREATE OR REPLACE VIEW active_users AS
SELECT *
FROM users
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_users IS 'Users that have not been soft-deleted';

-- Active Orders View
CREATE OR REPLACE VIEW active_orders AS
SELECT *
FROM orders
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_orders IS 'Orders that have not been soft-deleted';

-- Active Suppliers View
CREATE OR REPLACE VIEW active_suppliers AS
SELECT *
FROM suppliers
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_suppliers IS 'Suppliers that have not been soft-deleted';

-- Active Warehouses View
CREATE OR REPLACE VIEW active_warehouses AS
SELECT *
FROM warehouses
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_warehouses IS 'Warehouses that have not been soft-deleted';

-- Active Promotions View
CREATE OR REPLACE VIEW active_promotions AS
SELECT *
FROM promotions
WHERE deleted_at IS NULL
  AND CURRENT_TIMESTAMP BETWEEN start_date AND end_date;

COMMENT ON VIEW active_promotions IS 'Currently active promotions (not deleted and within date range)';

-- Active Reviews View
CREATE OR REPLACE VIEW active_reviews AS
SELECT *
FROM reviews
WHERE deleted_at IS NULL
  AND status = 'approved';

COMMENT ON VIEW active_reviews IS 'Approved reviews that have not been soft-deleted';

-- =====================================================
-- AGGREGATE VIEWS
-- =====================================================

-- Product Summary with Stock
CREATE OR REPLACE VIEW product_summary AS
SELECT 
    p.id,
    p.sku,
    p.product_name,
    p.current_price,
    p.sale_price,
    p.is_active,
    p.is_featured,
    c.category_name,
    s.name AS supplier_name,
    COALESCE(SUM(st.quantity_available), 0) AS total_stock,
    COALESCE(AVG(r.rating), 0) AS avg_rating,
    COUNT(DISTINCT r.id) AS review_count
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN suppliers s ON p.supplier_id = s.id
LEFT JOIN stock st ON p.id = st.product_id
LEFT JOIN reviews r ON p.id = r.product_id AND r.status = 'approved' AND r.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, c.category_name, s.name;

COMMENT ON VIEW product_summary IS 'Product overview with stock levels and ratings';

-- Order Summary
CREATE OR REPLACE VIEW order_summary AS
SELECT 
    o.id,
    o.order_number,
    o.user_id,
    u.email AS user_email,
    u.full_name AS user_name,
    o.total_amount,
    o.current_status,
    o.payment_status,
    o.ordered_at,
    o.delivered_at,
    COUNT(oi.id) AS item_count,
    SUM(oi.quantity) AS total_items
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.deleted_at IS NULL
GROUP BY o.id, u.email, u.full_name;

COMMENT ON VIEW order_summary IS 'Order overview with user details and item counts';

-- Low Stock Alert
CREATE OR REPLACE VIEW low_stock_alert AS
SELECT 
    p.id AS product_id,
    p.sku,
    p.product_name,
    w.warehouse_name,
    st.quantity,
    st.reserved_quantity,
    st.quantity_available,
    st.reorder_level
FROM stock st
JOIN products p ON st.product_id = p.id
JOIN warehouses w ON st.warehouse_id = w.id
WHERE st.quantity_available <= COALESCE(st.reorder_level, 10)
  AND p.is_active = true
  AND p.deleted_at IS NULL
ORDER BY st.quantity_available ASC;

COMMENT ON VIEW low_stock_alert IS 'Products with stock at or below reorder level';

-- =====================================================
-- STATISTICS VIEWS
-- =====================================================

-- Product Statistics
CREATE OR REPLACE VIEW product_statistics AS
SELECT 
    COUNT(*) AS total_products,
    COUNT(*) FILTER (WHERE is_active = true) AS active_products,
    COUNT(*) FILTER (WHERE is_featured = true) AS featured_products,
    COUNT(DISTINCT category_id) AS total_categories,
    AVG(current_price) AS avg_price,
    MIN(current_price) AS min_price,
    MAX(current_price) AS max_price
FROM products
WHERE deleted_at IS NULL;

COMMENT ON VIEW product_statistics IS 'Overall product catalog statistics';

-- Order Statistics
CREATE OR REPLACE VIEW order_statistics AS
SELECT 
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE current_status = 'pending') AS pending_orders,
    COUNT(*) FILTER (WHERE current_status = 'processing') AS processing_orders,
    COUNT(*) FILTER (WHERE current_status = 'shipped') AS shipped_orders,
    COUNT(*) FILTER (WHERE current_status = 'delivered') AS delivered_orders,
    COUNT(*) FILTER (WHERE payment_status = 'unpaid') AS unpaid_orders,
    SUM(total_amount) AS total_revenue,
    AVG(total_amount) AS avg_order_value
FROM orders
WHERE deleted_at IS NULL;

COMMENT ON VIEW order_statistics IS 'Overall order and revenue statistics';

-- User Statistics
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE role = 'customer') AS customers,
    COUNT(*) FILTER (WHERE role = 'admin') AS admins,
    COUNT(*) FILTER (WHERE role = 'warehouse_staff') AS warehouse_staff,
    COUNT(*) FILTER (WHERE is_active = true) AS active_users,
    COUNT(*) FILTER (WHERE last_login > CURRENT_TIMESTAMP - INTERVAL '30 days') AS active_last_30_days
FROM users
WHERE deleted_at IS NULL;

COMMENT ON VIEW user_statistics IS 'User demographics and activity statistics';
