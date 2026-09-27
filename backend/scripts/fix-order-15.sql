-- Fix Order 15 for batch testing
-- Adds phone confirmation and commune

-- Update Order 15
UPDATE orders 
SET 
    phone_confirmation_status = 'confirmed',
    commune_id = 1601,
    updated_at = NOW()
WHERE id = 15;

-- Add history entry
INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
VALUES (15, 'processing', 'Phone confirmation set and commune assigned for batch shipment testing', 1, NOW());

-- Verify both orders are ready
SELECT 
    id,
    order_number,
    current_status,
    phone_confirmation_status,
    tracking_number,
    commune_id,
    CASE 
        WHEN tracking_number IS NOT NULL THEN '❌ Already shipped'
        WHEN phone_confirmation_status != 'confirmed' THEN '❌ Not confirmed'
        WHEN commune_id IS NULL THEN '❌ No commune'
        ELSE '✅ Ready to ship'
    END as status_check
FROM orders 
WHERE id IN (14, 15)
ORDER BY id;

-- Show what needs to be done
SELECT 
    CASE 
        WHEN (SELECT tracking_number FROM orders WHERE id = 14) IS NOT NULL 
        THEN 'Order 14: Run "Reset Order 14" endpoint in Postman'
        ELSE 'Order 14: ✅ Ready'
    END as order_14_action,
    CASE 
        WHEN (SELECT phone_confirmation_status FROM orders WHERE id = 15) != 'confirmed'
        THEN 'Order 15: ❌ Just fixed - now ready!'
        ELSE 'Order 15: ✅ Ready'
    END as order_15_action;
