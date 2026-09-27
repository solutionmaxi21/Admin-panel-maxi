-- Migration: Add Guepex shipping integration fields to orders table
-- This adds all fields needed for complete Guepex functionality

-- Add missing columns to orders table
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS customer_notes TEXT,
  ADD COLUMN IF NOT EXISTS delivery_wilaya_id INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_commune_id INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS delivery_center_id INTEGER,
  ADD COLUMN IF NOT EXISTS shipping_details JSONB,
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS guepex_import_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS guepex_created_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS carrier VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipment_status VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipment_status_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_returning BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_initiated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS inventory_restored BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS prepaid_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone_confirmation_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS phone_confirmed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS phone_confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone_confirmation_notes TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS guepex_payment_id VARCHAR(100);

-- Add missing columns to order_history table
ALTER TABLE order_history
  ADD COLUMN IF NOT EXISTS guepex_status VARCHAR(100),
  ADD COLUMN IF NOT EXISTS guepex_reason TEXT,
  ADD COLUMN IF NOT EXISTS event_id VARCHAR(100);

-- Add foreign key constraints to reference Guepex tables
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS fk_orders_delivery_wilaya,
  DROP CONSTRAINT IF EXISTS fk_orders_delivery_commune;

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_wilaya 
    FOREIGN KEY (delivery_wilaya_id) REFERENCES guepex_wilayas(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_orders_delivery_commune 
    FOREIGN KEY (delivery_commune_id) REFERENCES guepex_communes(id) ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_guepex_tracking ON orders(guepex_tracking_number) WHERE guepex_tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_phone_confirmation ON orders(phone_confirmation_status) WHERE phone_confirmation_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_shipment_status ON orders(shipment_status) WHERE shipment_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_commune ON orders(delivery_commune_id) WHERE delivery_commune_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone) WHERE customer_phone IS NOT NULL;

-- Comment documentation
COMMENT ON COLUMN orders.customer_phone IS 'Customer phone number extracted from delivery notes or user profile';
COMMENT ON COLUMN orders.delivery_type IS 'Type of delivery: home, stopdesk, etc.';
COMMENT ON COLUMN orders.delivery_commune_id IS 'Guepex commune ID for delivery';
COMMENT ON COLUMN orders.delivery_wilaya_id IS 'Guepex wilaya ID for delivery';
COMMENT ON COLUMN orders.tracking_number IS 'Main tracking number (usually same as guepex_tracking_number)';
COMMENT ON COLUMN orders.guepex_tracking_number IS 'Guepex API tracking number';
COMMENT ON COLUMN orders.guepex_import_id IS 'Guepex import batch ID';
COMMENT ON COLUMN orders.shipment_status IS 'Current Guepex shipment status (raw from API)';
COMMENT ON COLUMN orders.is_returning IS 'Whether the order is in return flow';
COMMENT ON COLUMN orders.inventory_restored IS 'Whether stock was restored after return';
COMMENT ON COLUMN orders.phone_confirmation_status IS 'Phone confirmation status: pending, confirmed, failed';
COMMENT ON COLUMN orders.prepaid_amount IS 'Amount paid upfront (CCP/bank transfer)';
COMMENT ON COLUMN orders.cod_amount IS 'Amount to collect on delivery (after prepayment)';

COMMENT ON COLUMN order_history.guepex_status IS 'Raw Guepex status from webhook';
COMMENT ON COLUMN order_history.guepex_reason IS 'Guepex reason code (for failures)';
COMMENT ON COLUMN order_history.event_id IS 'Guepex webhook event ID for tracking';
