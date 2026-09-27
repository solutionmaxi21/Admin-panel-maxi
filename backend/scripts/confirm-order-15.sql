-- Confirm Order 15 for batch testing
-- This prepares Order 15 to be shipped alongside Order 14

-- Check current status
SELECT 
    id,
    order_number,
    current_status,
    phone_confirmation_status,
    tracking_number,
    total
FROM orders 
WHERE id = 15;

-- Update to confirmed status
UPDATE orders 
SET 
    current_status = 'processing',
    phone_confirmation_status = 'confirmed',
    updated_at = NOW()
WHERE id = 15;

-- Add history entry
INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
VALUES (15, 'processing', 'Phone confirmation successful - prepared for batch shipment testing', 1, NOW());

-- Verify update
SELECT 
    id,
    order_number,
    current_status,
    phone_confirmation_status,
    tracking_number,
    total
FROM orders 
WHERE id = 15;

-- Show both test orders ready for batch
SELECT 
    id,
    order_number,
    current_status,
    phone_confirmation_status,
    tracking_number IS NOT NULL as has_tracking,
    total
FROM orders 
WHERE id IN (14, 15)
ORDER BY id;
