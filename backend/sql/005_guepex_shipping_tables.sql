-- Migration: Add Guepex shipping data tables
-- Date: 2026-01-04
-- Description: Create tables for wilayas, communes, centers, and shipping fees

-- =============================================
-- WILAYAS (Provinces)
-- =============================================
CREATE TABLE IF NOT EXISTS guepex_wilayas (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  zone INTEGER NOT NULL CHECK (zone >= 1 AND zone <= 5),
  is_deliverable SMALLINT NOT NULL DEFAULT 1 CHECK (is_deliverable IN (0, 1)),
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_guepex_wilayas_deliverable ON guepex_wilayas(is_deliverable);
CREATE INDEX IF NOT EXISTS idx_guepex_wilayas_zone ON guepex_wilayas(zone);

-- =============================================
-- COMMUNES (Cities/Districts)
-- =============================================
CREATE TABLE IF NOT EXISTS guepex_communes (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  wilaya_id INTEGER NOT NULL REFERENCES guepex_wilayas(id) ON DELETE CASCADE,
  has_stop_desk SMALLINT NOT NULL DEFAULT 0 CHECK (has_stop_desk IN (0, 1)),
  is_deliverable SMALLINT NOT NULL DEFAULT 1 CHECK (is_deliverable IN (0, 1)),
  delivery_time_parcel INTEGER DEFAULT 5,
  delivery_time_payment INTEGER DEFAULT 5,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wilaya_id, name)
);

CREATE INDEX IF NOT EXISTS idx_guepex_communes_wilaya ON guepex_communes(wilaya_id);
CREATE INDEX IF NOT EXISTS idx_guepex_communes_deliverable ON guepex_communes(is_deliverable);
CREATE INDEX IF NOT EXISTS idx_guepex_communes_stop_desk ON guepex_communes(has_stop_desk);

-- =============================================
-- CENTERS (Guepex/Yalidine Agencies)
-- =============================================
CREATE TABLE IF NOT EXISTS guepex_centers (
  center_id INTEGER PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  gps VARCHAR(100),
  commune_id INTEGER NOT NULL REFERENCES guepex_communes(id) ON DELETE CASCADE,
  wilaya_id INTEGER NOT NULL REFERENCES guepex_wilayas(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guepex_centers_commune ON guepex_centers(commune_id);
CREATE INDEX IF NOT EXISTS idx_guepex_centers_wilaya ON guepex_centers(wilaya_id);

-- =============================================
-- SHIPPING FEES (From-To Wilaya Routes)
-- =============================================
CREATE TABLE IF NOT EXISTS guepex_shipping_fees (
  id SERIAL PRIMARY KEY,
  from_wilaya_id INTEGER NOT NULL REFERENCES guepex_wilayas(id) ON DELETE CASCADE,
  to_wilaya_id INTEGER NOT NULL REFERENCES guepex_wilayas(id) ON DELETE CASCADE,
  zone INTEGER NOT NULL CHECK (zone >= 1 AND zone <= 5),
  retour_fee INTEGER NOT NULL DEFAULT 250,
  cod_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.75,
  insurance_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  oversize_fee INTEGER NOT NULL DEFAULT 100,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_wilaya_id, to_wilaya_id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_fees_from ON guepex_shipping_fees(from_wilaya_id);
CREATE INDEX IF NOT EXISTS idx_shipping_fees_to ON guepex_shipping_fees(to_wilaya_id);
CREATE INDEX IF NOT EXISTS idx_shipping_fees_route ON guepex_shipping_fees(from_wilaya_id, to_wilaya_id);

-- =============================================
-- COMMUNE FEES (Detailed per-commune pricing)
-- =============================================
CREATE TABLE IF NOT EXISTS guepex_commune_fees (
  id SERIAL PRIMARY KEY,
  from_wilaya_id INTEGER NOT NULL REFERENCES guepex_wilayas(id) ON DELETE CASCADE,
  to_commune_id INTEGER NOT NULL REFERENCES guepex_communes(id) ON DELETE CASCADE,
  express_home INTEGER NOT NULL,
  express_desk INTEGER NOT NULL,
  economic_home INTEGER NOT NULL,
  economic_desk INTEGER NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_wilaya_id, to_commune_id)
);

CREATE INDEX IF NOT EXISTS idx_commune_fees_from ON guepex_commune_fees(from_wilaya_id);
CREATE INDEX IF NOT EXISTS idx_commune_fees_to ON guepex_commune_fees(to_commune_id);
CREATE INDEX IF NOT EXISTS idx_commune_fees_route ON guepex_commune_fees(from_wilaya_id, to_commune_id);

-- =============================================
-- SYNC LOG (Track data synchronization)
-- =============================================
CREATE TABLE IF NOT EXISTS guepex_sync_log (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  wilayas_count INTEGER DEFAULT 0,
  communes_count INTEGER DEFAULT 0,
  centers_count INTEGER DEFAULT 0,
  fees_count INTEGER DEFAULT 0,
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_log_type ON guepex_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_date ON guepex_sync_log(synced_at DESC);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE guepex_wilayas IS 'Algerian provinces/wilayas from Guepex API';
COMMENT ON TABLE guepex_communes IS 'Algerian communes/cities from Guepex API';
COMMENT ON TABLE guepex_centers IS 'Guepex/Yalidine delivery centers';
COMMENT ON TABLE guepex_shipping_fees IS 'Base shipping fees between wilayas';
COMMENT ON TABLE guepex_commune_fees IS 'Detailed commune-level delivery fees';
COMMENT ON TABLE guepex_sync_log IS 'Track Guepex data synchronization history';
