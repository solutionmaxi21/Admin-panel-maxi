-- Migration: Add return and intermediate order statuses
-- Date: 2026-01-04
-- Description: Add missing order statuses for Guepex return flow

-- Add new values to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'returning';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'failed_delivery';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'in_transit';

-- Note: PostgreSQL enum values cannot be removed once added
-- New statuses:
-- - returning: Package is being returned to seller after failed delivery
-- - returned: Package has been returned to seller (final state)
-- - failed_delivery: Delivery attempt failed (customer unavailable, refused, etc.)
-- - out_for_delivery: Package is out for delivery
-- - in_transit: Package is in transit between centers

-- The complete order_status flow now includes:
-- 1. pending -> processing -> shipped -> delivered (successful delivery)
-- 2. pending -> processing -> shipped -> failed_delivery -> returning -> returned (failed delivery)
-- 3. pending -> processing -> cancelled (order cancelled)
