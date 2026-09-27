-- Minimal Database Schema for Guepex Shipping Only
-- Run this in pgAdmin Query Tool or psql

-- ==========================================
-- BASIC TABLES (Required for Admin Panel)
-- ==========================================

-- Users table (for admin login)
CREATE TABLE IF NOT EXISTS users (
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
    role VARCHAR(20) DEFAULT 'CUSTOMER',
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
-- SHIPPING TABLES (Guepex Integration)
-- ==========================================

-- Wilayas (Provinces)
CREATE TABLE IF NOT EXISTS wilayas (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Communes (Cities)
CREATE TABLE IF NOT EXISTS communes (
    id SERIAL PRIMARY KEY,
    wilaya_id INTEGER REFERENCES wilayas(id),
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    postal_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shipping Zones
CREATE TABLE IF NOT EXISTS shipping_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    base_price DECIMAL(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shipping Zone Wilayas (Many-to-Many)
CREATE TABLE IF NOT EXISTS shipping_zone_wilayas (
    id SERIAL PRIMARY KEY,
    shipping_zone_id INTEGER REFERENCES shipping_zones(id) ON DELETE CASCADE,
    wilaya_id INTEGER REFERENCES wilayas(id) ON DELETE CASCADE,
    UNIQUE(shipping_zone_id, wilaya_id)
);

-- Shipping Rates
CREATE TABLE IF NOT EXISTS shipping_rates (
    id SERIAL PRIMARY KEY,
    commune_id INTEGER REFERENCES communes(id),
    home_delivery_price DECIMAL(10, 2),
    desk_delivery_price DECIMAL(10, 2),
    is_stopdesk_available BOOLEAN DEFAULT false,
    delivery_time VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ORDERS TABLE (Required for Shipping)
-- ==========================================

CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    order_number VARCHAR(50) UNIQUE,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Customer info
    customer_name VARCHAR(200),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    
    -- Shipping info
    shipping_address TEXT,
    commune_id INTEGER REFERENCES communes(id),
    wilaya_id INTEGER REFERENCES wilayas(id),
    shipping_method VARCHAR(50),
    
    -- Guepex tracking
    guepex_tracking_number VARCHAR(100),
    guepex_status VARCHAR(50),
    guepex_response JSONB,
    
    -- Prices
    subtotal DECIMAL(10, 2) DEFAULT 0,
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

CREATE INDEX idx_communes_wilaya ON communes(wilaya_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_commune ON orders(commune_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_tracking ON orders(guepex_tracking_number);

-- ==========================================
-- INSERT DEFAULT ADMIN USER
-- ==========================================

-- Password: admin123
INSERT INTO users (
    username, 
    email, 
    password_hash, 
    first_name, 
    last_name, 
    full_name,
    role, 
    is_active,
    email_verified
) VALUES (
    'admin',
    'admin@maxistore.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5lw7BKe6p0KUG',
    'Admin',
    'User',
    'Admin User',
    'ADMIN',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- ==========================================
-- SAMPLE ALGERIAN WILAYAS
-- ==========================================

INSERT INTO wilayas (code, name, name_ar) VALUES
('01', 'Adrar', 'أدرار'),
('16', 'Alger', 'الجزائر'),
('09', 'Blida', 'البليدة'),
('31', 'Oran', 'وهران'),
('25', 'Constantine', 'قسنطينة')
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- DONE!
-- ==========================================

SELECT 'Schema created successfully!' as message;
