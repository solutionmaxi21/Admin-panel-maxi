-- Add awaiting_confirmation status to order_status enum
ALTER TYPE order_status ADD VALUE 'awaiting_confirmation' BEFORE 'pending';
