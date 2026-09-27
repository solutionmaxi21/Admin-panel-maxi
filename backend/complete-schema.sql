-- ==========================================
-- MaxiStore Complete Database Schema
-- PostgreSQL 15+ Compatible
-- ==========================================

-- Drop existing tables (if recreating)
-- Uncomment below if you need to start fresh
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS notification_preferences CASCADE;
-- DROP TABLE IF EXISTS favorites CASCADE;
-- DROP TABLE IF EXISTS order_history CASCADE;
-- DROP TABLE IF EXISTS return_items CASCADE;
-- DROP TABLE IF EXISTS returns CASCADE;
-- DROP TABLE IF EXISTS order_items CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS reviews CASCADE;
-- DROP TABLE IF EXISTS shipping_rates CASCADE;
-- DROP TABLE IF EXISTS shipping_zone_wilayas CASCADE;
-- DROP TABLE IF EXISTS shipping_zones CASCADE;
-- DROP TABLE IF EXISTS communes CASCADE;
-- DROP TABLE IF EXISTS wilayas CASCADE;
-- DROP TABLE IF EXISTS addresses CASCADE;
-- DROP TABLE IF EXISTS coupon_usage CASCADE;
-- DROP TABLE IF EXISTS coupons CASCADE;
-- DROP TABLE IF EXISTS promotion_products CASCADE;
-- DROP TABLE IF EXISTS promotions CASCADE;
-- DROP TABLE IF EXISTS stock_movements CASCADE;
-- DROP TABLE IF EXISTS product_images CASCADE;
-- DROP TABLE IF EXISTS products CASCADE;
-- DROP TABLE IF EXISTS categories CASCADE;
-- DROP TABLE IF EXISTS suppliers CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- ==========================================
-- USERS & AUTHENTICATION
-- ==========================================

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(200),
    phone VARCHAR(20),
    user_type VARCHAR(50),
    avatar VARCHAR(500),
    role VARCHAR(20) DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'ADMIN', 'MANAGER', 'STAFF')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    refresh_token VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    verification_token VARCHAR(255),
    verification_expires TIMESTAMP,
    email_verified BOOLEAN DEFAULT false,
    google_id VARCHAR(255),
    reset_token_hash VARCHAR(255),
    reset_expires_at TIMESTAMP
);

-- ==========================================
-- ADDRESSES
-- ==========================================

CREATE TABLE addresses (
    address_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    address_type VARCHAR(20) DEFAULT 'shipping' CHECK (address_type IN ('shipping', 'billing')),
    full_name VARCHAR(200),
    phone VARCHAR(20),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Algeria',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SHIPPING (Guepex Integration)
-- ==========================================

CREATE TABLE wilayas (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE communes (
    id SERIAL PRIMARY KEY,
    wilaya_id INTEGER REFERENCES wilayas(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    postal_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipping_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    base_price DECIMAL(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipping_zone_wilayas (
    id SERIAL PRIMARY KEY,
    shipping_zone_id INTEGER REFERENCES shipping_zones(id) ON DELETE CASCADE,
    wilaya_id INTEGER REFERENCES wilayas(id) ON DELETE CASCADE,
    UNIQUE(shipping_zone_id, wilaya_id)
);

CREATE TABLE shipping_rates (
    id SERIAL PRIMARY KEY,
    commune_id INTEGER REFERENCES communes(id) ON DELETE CASCADE,
    home_delivery_price DECIMAL(10, 2),
    desk_delivery_price DECIMAL(10, 2),
    is_stopdesk_available BOOLEAN DEFAULT false,
    delivery_time VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SUPPLIERS
-- ==========================================

CREATE TABLE suppliers (
    supplier_id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(200),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- CATEGORIES
-- ==========================================

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    name_fr VARCHAR(100),
    slug VARCHAR(100) UNIQUE,
    description TEXT,
    parent_id INTEGER REFERENCES categories(category_id) ON DELETE SET NULL,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PRODUCTS
-- ==========================================

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    name_fr VARCHAR(255),
    slug VARCHAR(255) UNIQUE,
    description TEXT,
    description_ar TEXT,
    description_fr TEXT,
    category_id INTEGER REFERENCES categories(category_id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(supplier_id) ON DELETE SET NULL,
    
    -- Pricing
    cost_price DECIMAL(10, 2),
    retail_price DECIMAL(10, 2) NOT NULL,
    wholesale_price DECIMAL(10, 2),
    sale_price DECIMAL(10, 2),
    discount_percentage DECIMAL(5, 2) DEFAULT 0,
    
    -- Inventory
    stock_quantity INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 0,
    max_stock_level INTEGER,
    reorder_point INTEGER DEFAULT 0,
    
    -- Physical properties
    weight DECIMAL(10, 2),
    dimensions VARCHAR(100),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    is_new BOOLEAN DEFAULT false,
    
    -- Images
    main_image VARCHAR(500),
    thumbnail VARCHAR(500),
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    meta_keywords TEXT,
    
    -- Stats
    views_count INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    rating DECIMAL(3, 2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE product_images (
    image_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INVENTORY TRACKING
-- ==========================================

CREATE TABLE stock_movements (
    movement_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'DAMAGE', 'TRANSFER')),
    quantity INTEGER NOT NULL,
    reference_id INTEGER,
    reference_type VARCHAR(50),
    notes TEXT,
    user_id INTEGER REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PROMOTIONS & COUPONS
-- ==========================================

CREATE TABLE promotions (
    promotion_id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value DECIMAL(10, 2) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE promotion_products (
    id SERIAL PRIMARY KEY,
    promotion_id INTEGER REFERENCES promotions(promotion_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    UNIQUE(promotion_id, product_id)
);

CREATE TABLE coupons (
    coupon_id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value DECIMAL(10, 2) NOT NULL,
    min_purchase_amount DECIMAL(10, 2) DEFAULT 0,
    max_discount_amount DECIMAL(10, 2),
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE coupon_usage (
    id SERIAL PRIMARY KEY,
    coupon_id INTEGER REFERENCES coupons(coupon_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    order_id INTEGER,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ORDERS
-- ==========================================

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'on_hold')),
    
    -- Customer info
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20) NOT NULL,
    
    -- Shipping info
    shipping_address TEXT NOT NULL,
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(100) DEFAULT 'Algeria',
    commune_id INTEGER REFERENCES communes(id),
    wilaya_id INTEGER REFERENCES wilayas(id),
    shipping_method VARCHAR(50),
    shipping_snapshot JSONB,
    
    -- Billing info
    billing_address TEXT,
    billing_city VARCHAR(100),
    billing_state VARCHAR(100),
    billing_postal_code VARCHAR(20),
    billing_country VARCHAR(100) DEFAULT 'Algeria',
    
    -- Guepex tracking
    guepex_tracking_number VARCHAR(100),
    guepex_order_id VARCHAR(100),
    guepex_status VARCHAR(50),
    guepex_response JSONB,
    guepex_last_update TIMESTAMP,
    
    -- Prices
    subtotal DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    coupon_code VARCHAR(50),
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) DEFAULT 0,
    
    -- Payment
    payment_method VARCHAR(50) DEFAULT 'cod',
    payment_status VARCHAR(50) DEFAULT 'pending',
    paid_amount DECIMAL(10, 2) DEFAULT 0,
    
    -- Notes
    customer_notes TEXT,
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE TABLE order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ORDER HISTORY (Tracking Changes)
-- ==========================================

CREATE TABLE order_history (
    history_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id),
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- RETURNS
-- ==========================================

CREATE TABLE returns (
    return_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    return_number VARCHAR(50) UNIQUE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    refund_amount DECIMAL(10, 2),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE return_items (
    return_item_id SERIAL PRIMARY KEY,
    return_id INTEGER REFERENCES returns(return_id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- REVIEWS
-- ==========================================

CREATE TABLE reviews (
    review_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- FAVORITES / WISHLIST
-- ==========================================

CREATE TABLE favorites (
    favorite_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- ==========================================
-- NOTIFICATIONS
-- ==========================================

CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE TABLE notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE UNIQUE,
    email_orders BOOLEAN DEFAULT true,
    email_promotions BOOLEAN DEFAULT true,
    email_updates BOOLEAN DEFAULT true,
    push_orders BOOLEAN DEFAULT true,
    push_promotions BOOLEAN DEFAULT false,
    push_updates BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_tracking ON orders(guepex_tracking_number);
CREATE INDEX idx_orders_date ON orders(created_at);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_communes_wilaya ON communes(wilaya_id);
CREATE INDEX idx_shipping_rates_commune ON shipping_rates(commune_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

-- ==========================================
-- INSERT DEFAULT DATA
-- ==========================================

-- Default admin user (password: admin123)
INSERT INTO users (username, email, password_hash, first_name, last_name, full_name, role, is_active, email_verified)
VALUES (
    'admin',
    'admin@maxistore.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5lw7BKe6p0KUG',
    'Admin',
    'User',
    'Admin User',
    'ADMIN',
    true,
    true
);

-- Algerian Wilayas
INSERT INTO wilayas (code, name, name_ar) VALUES
('01', 'Adrar', 'أدرار'),
('02', 'Chlef', 'الشلف'),
('03', 'Laghouat', 'الأغواط'),
('04', 'Oum El Bouaghi', 'أم البواقي'),
('05', 'Batna', 'باتنة'),
('06', 'Béjaïa', 'بجاية'),
('07', 'Biskra', 'بسكرة'),
('08', 'Béchar', 'بشار'),
('09', 'Blida', 'البليدة'),
('10', 'Bouira', 'البويرة'),
('11', 'Tamanrasset', 'تمنراست'),
('12', 'Tébessa', 'تبسة'),
('13', 'Tlemcen', 'تلمسان'),
('14', 'Tiaret', 'تيارت'),
('15', 'Tizi Ouzou', 'تيزي وزو'),
('16', 'Alger', 'الجزائر'),
('17', 'Djelfa', 'الجلفة'),
('18', 'Jijel', 'جيجل'),
('19', 'Sétif', 'سطيف'),
('20', 'Saïda', 'سعيدة'),
('21', 'Skikda', 'سكيكدة'),
('22', 'Sidi Bel Abbès', 'سيدي بلعباس'),
('23', 'Annaba', 'عنابة'),
('24', 'Guelma', 'قالمة'),
('25', 'Constantine', 'قسنطينة'),
('26', 'Médéa', 'المدية'),
('27', 'Mostaganem', 'مستغانم'),
('28', 'M''Sila', 'المسيلة'),
('29', 'Mascara', 'معسكر'),
('30', 'Ouargla', 'ورقلة'),
('31', 'Oran', 'وهران'),
('32', 'El Bayadh', 'البيض'),
('33', 'Illizi', 'إليزي'),
('34', 'Bordj Bou Arréridj', 'برج بوعريريج'),
('35', 'Boumerdès', 'بومرداس'),
('36', 'El Tarf', 'الطارف'),
('37', 'Tindouf', 'تندوف'),
('38', 'Tissemsilt', 'تيسمسيلت'),
('39', 'El Oued', 'الوادي'),
('40', 'Khenchela', 'خنشلة'),
('41', 'Souk Ahras', 'سوق أهراس'),
('42', 'Tipaza', 'تيبازة'),
('43', 'Mila', 'ميلة'),
('44', 'Aïn Defla', 'عين الدفلى'),
('45', 'Naâma', 'النعامة'),
('46', 'Aïn Témouchent', 'عين تموشنت'),
('47', 'Ghardaïa', 'غرداية'),
('48', 'Relizane', 'غليزان');

-- Sample categories
INSERT INTO categories (name, name_ar, name_fr, slug, is_active, display_order) VALUES
('Quincaillerie', 'أدوات', 'Hardware', 'quincaillerie', true, 1),
('Électricité', 'كهرباء', 'Electrical', 'electricite', true, 2),
('Plomberie', 'سباكة', 'Plumbing', 'plomberie', true, 3),
('Peinture', 'طلاء', 'Paint', 'peinture', true, 4),
('Outillage', 'أدوات', 'Tools', 'outillage', true, 5);

-- ==========================================
-- DONE!
-- ==========================================

SELECT 'Database schema created successfully!' as message;
SELECT 'Default admin user: admin@maxistore.com / password: admin123' as info;
SELECT COUNT(*) as total_wilayas FROM wilayas;
