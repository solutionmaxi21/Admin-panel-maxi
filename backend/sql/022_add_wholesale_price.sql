-- Migration: Add wholesale_price column to products table
-- Date: 2026-02-03
-- Description: Add wholesale price (prix de gros) field for bulk purchases

-- Add wholesale_price column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2);

-- Add comment for documentation
COMMENT ON COLUMN products.wholesale_price IS 'Wholesale price for bulk purchases (prix de gros)';

-- Optional: Add check constraint to ensure wholesale price is not negative
ALTER TABLE products 
ADD CONSTRAINT products_wholesale_price_check CHECK (wholesale_price IS NULL OR wholesale_price >= 0);
