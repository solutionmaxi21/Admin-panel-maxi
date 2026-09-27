-- PostgreSQL Database Schema for Algerian Hardware E-Commerce
-- Generated: 2025-12-30
-- Migration from JSON to PostgreSQL

-- Enable UUID extension for potential future use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ENUM TYPES
-- =====================================================

CREATE TYPE user_role AS ENUM ('admin', 'customer', 'warehouse_staff');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE payment_status AS ENUM ('paid', 'unpaid', 'refunded', 'partial');
CREATE TYPE payment_method AS ENUM ('cod', 'card', 'bank_transfer', 'other');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE return_status AS ENUM ('requested', 'approved', 'rejected', 'completed', 'cancelled');
CREATE TYPE return_condition AS ENUM ('unopened', 'opened', 'defective', 'damaged');
CREATE TYPE pickup_status AS ENUM ('scheduled', 'picked_up', 'in_transit', 'delivered', 'failed');
CREATE TYPE discount_type AS ENUM ('fixed', 'percentage', 'free_shipping');
CREATE TYPE image_type AS ENUM ('primary', 'secondary', 'gallery', 'product');

-- =====================================================
-- REFERENCE TABLES (Shipping)
-- =====================================================
-- NOTE: These tables are DEPRECATED and replaced by guepex_* tables in 005_guepex_shipping_tables.sql
-- The guepex_* tables are actively synced with the Guepex API and should be used instead.
-- These definitions are commented out to prevent duplication and conflicts.
-- See: backend/sql/005_guepex_shipping_tables.sql for active shipping tables

/*
-- DEPRECATED: Use guepex_wilayas instead
-- Wilayas (Provinces)
CREATE TABLE wilayas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    zone SMALLINT NOT NULL CHECK (zone BETWEEN 1 AND 4),
    is_deliverable BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DEPRECATED: Use guepex_communes instead
-- Communes (Cities/Towns)
CREATE TABLE communes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE RESTRICT,
    has_stop_desk BOOLEAN DEFAULT false,
    is_deliverable BOOLEAN DEFAULT true,
    delivery_time_parcel SMALLINT, -- Days
    delivery_time_payment SMALLINT, -- Days
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, wilaya_id)
);

-- DEPRECATED: Use guepex_centers instead
-- Shipping Centers (Delivery agencies)
CREATE TABLE shipping_centers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    gps VARCHAR(100), -- "lat,lng"
    commune_id INTEGER REFERENCES communes(id) ON DELETE SET NULL,
    wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE RESTRICT,
    provider VARCHAR(50), -- 'Yalidine', 'Guepex', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- DEPRECATED: Use guepex_shipping_fees and guepex_commune_fees instead
-- Shipping Tariffs (Fees)
CREATE TABLE shipping_tariffs (
    id SERIAL PRIMARY KEY,
    from_wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE CASCADE,
    to_wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE CASCADE,
    to_commune_id INTEGER REFERENCES communes(id) ON DELETE CASCADE,
    zone SMALLINT NOT NULL,
    express_home DECIMAL(8,2),
    express_desk DECIMAL(8,2),
    economic_home DECIMAL(8,2),
    economic_desk DECIMAL(8,2),
    retour_fee DECIMAL(8,2),
    cod_percentage DECIMAL(5,2),
    insurance_percentage DECIMAL(5,2),
    oversize_fee DECIMAL(8,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(from_wilaya_id, to_wilaya_id, to_commune_id)
);
*/

-- =====================================================
-- CORE ENTITIES
-- =====================================================

-- Suppliers
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Categories (Hierarchical)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    category_name JSONB NOT NULL, -- {"fr": "...", "ar": "..."}
    category_slug VARCHAR(255) NOT NULL UNIQUE,
    description JSONB, -- {"fr": "...", "ar": "..."}
    category_image VARCHAR(500),
    level SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(255),
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'customer',
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    avatar_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    verification_token VARCHAR(255),
    verification_expires TIMESTAMP WITH TIME ZONE
);

-- User Addresses
CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    street_address VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) NOT NULL DEFAULT 'Algeria',
    phone_number VARCHAR(20),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Warehouses
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    warehouse_name VARCHAR(255) NOT NULL,
    location_address TEXT NOT NULL,
    contact_number VARCHAR(20),
    wilaya_id INTEGER REFERENCES wilayas(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- PRODUCT CATALOG
-- =====================================================

-- Products
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    product_name VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    model_number VARCHAR(100),
    short_description VARCHAR(500),
    description TEXT,
    cost_price DECIMAL(12,2),
    wholesale_price DECIMAL(12,2),
    current_price DECIMAL(12,2) NOT NULL CHECK (current_price >= 0),
    sale_price DECIMAL(12,2) CHECK (sale_price >= 0),
    weight_kg DECIMAL(8,3),
    warranty_months SMALLINT,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    dimensions VARCHAR(100),
    tags TEXT,
    meta_title VARCHAR(255),
    meta_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Product Attributes
CREATE TABLE product_attributes (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_name JSONB NOT NULL, -- {"fr": "...", "ar": "..."}
    attribute_value TEXT NOT NULL,
    attribute_type VARCHAR(50) DEFAULT 'text',
    display_order SMALLINT DEFAULT 0
);

-- Product Images
CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    image_type image_type DEFAULT 'product',
    display_order SMALLINT DEFAULT 0,
    alt_text VARCHAR(255),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INVENTORY
-- =====================================================

-- Stock
CREATE TABLE stock (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    quantity_available INTEGER GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    reorder_level INTEGER,
    last_restocked TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(product_id, warehouse_id),
    CHECK (reserved_quantity <= quantity)
);

-- =====================================================
-- PROMOTIONS
-- =====================================================

-- Promotions
CREATE TABLE promotions (
    id SERIAL PRIMARY KEY,
    promotion_code VARCHAR(50) NOT NULL UNIQUE,
    promotion_name JSONB NOT NULL, -- {"fr": "...", "ar": "..."}
    description JSONB, -- {"fr": "...", "ar": "..."}
    discount_type discount_type NOT NULL,
    discount_value DECIMAL(12,2) NOT NULL CHECK (discount_value >= 0),
    min_order_amount DECIMAL(12,2),
    applicable_categories INTEGER[], -- Array of category IDs
    applicable_products INTEGER[], -- Array of product IDs
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    max_uses INTEGER DEFAULT 0,
    max_uses_per_user INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CHECK (end_date > start_date)
);

-- =====================================================
-- ORDERS
-- =====================================================

-- Orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
    tax_amount DECIMAL(12,2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_cost DECIMAL(12,2) DEFAULT 0 CHECK (shipping_cost >= 0),
    discount_amount DECIMAL(12,2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    current_status order_status DEFAULT 'pending',
    payment_status payment_status DEFAULT 'unpaid',
    payment_method payment_method,
    paid_amount DECIMAL(12,2),
    promotion_id INTEGER REFERENCES promotions(id) ON DELETE SET NULL,
    shipping_snapshot JSONB, -- Shipping address at time of order
    delivery_notes TEXT,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    guepex_tracking_number VARCHAR(50),
    guepex_label_url VARCHAR(500),
    ordered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Order Items
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name_snapshot VARCHAR(255),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total DECIMAL(12,2) NOT NULL CHECK (line_total >= 0),
    discount_amount DECIMAL(12,2) DEFAULT 0,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL
);

-- Order History (Status changes)
CREATE TABLE order_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status order_status NOT NULL,
    payment_status payment_status,
    notes TEXT,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- REVIEWS & ENGAGEMENT
-- =====================================================

-- Reviews
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_title VARCHAR(255),
    review_text TEXT NOT NULL,
    verified_purchase BOOLEAN NOT NULL DEFAULT false,
    status review_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP WITH TIME ZONE,
    edit_count SMALLINT DEFAULT 0,
    moderated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Favorites (Wishlist)
CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- =====================================================
-- RETURNS
-- =====================================================

-- Returns
CREATE TABLE returns (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    return_number VARCHAR(50) NOT NULL UNIQUE,
    return_reason TEXT NOT NULL,
    status return_status DEFAULT 'requested',
    refund_amount DECIMAL(12,2) NOT NULL CHECK (refund_amount >= 0),
    notes TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    guepex_tracking_number VARCHAR(50),
    guepex_label_url VARCHAR(500),
    return_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    pickup_status pickup_status,
    pickup_scheduled_at TIMESTAMP WITH TIME ZONE,
    picked_up_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    shipment_status VARCHAR(100),
    shipment_status_reason TEXT
);

-- Return Items
CREATE TABLE return_items (
    id SERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    condition return_condition DEFAULT 'opened',
    notes TEXT
);

-- =====================================================
-- SYNC LOG (Audit trail for external data)
-- =====================================================

CREATE TABLE sync_logs (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL, -- 'shipping', 'centers', 'communes', etc.
    sync_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    details JSONB,
    errors JSONB
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

-- Products
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_active ON products(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = true;

-- Orders
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(current_status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_date ON orders(ordered_at);

-- Order Items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Stock
CREATE INDEX idx_stock_product ON stock(product_id);
CREATE INDEX idx_stock_warehouse ON stock(warehouse_id);
CREATE INDEX idx_stock_low ON stock(product_id) WHERE quantity_available <= reorder_level;

-- Communes
CREATE INDEX idx_communes_wilaya ON communes(wilaya_id);
CREATE INDEX idx_communes_deliverable ON communes(is_deliverable) WHERE is_deliverable = true;

-- Shipping Tariffs
CREATE INDEX idx_tariffs_origin ON shipping_tariffs(from_wilaya_id);
CREATE INDEX idx_tariffs_destination ON shipping_tariffs(to_wilaya_id);
CREATE INDEX idx_tariffs_commune ON shipping_tariffs(to_commune_id);

-- Reviews
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_status ON reviews(status);

-- Favorites
CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_product ON favorites(product_id);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE wilayas IS 'Algerian provinces (58 total)';
COMMENT ON TABLE communes IS 'Algerian cities and towns (1541+)';
COMMENT ON TABLE shipping_centers IS 'Delivery agency locations';
COMMENT ON TABLE shipping_tariffs IS 'Shipping fees matrix (denormalized from nested JSON)';
COMMENT ON TABLE products IS 'Main product catalog';
COMMENT ON TABLE product_attributes IS 'Dynamic product specifications';
COMMENT ON TABLE stock IS 'Inventory levels per warehouse';
COMMENT ON TABLE orders IS 'Customer orders';
COMMENT ON TABLE order_history IS 'Audit trail of order status changes';
COMMENT ON TABLE returns IS 'Product returns and refunds';
COMMENT ON TABLE sync_logs IS 'External API sync history';
