--
-- Migration: Add barcode field to products table
-- Date: 2026-01-15
-- Description: Adds barcode column for product identification and scanning
--

-- Step 1: Add barcode column to products table
ALTER TABLE public.products 
ADD COLUMN barcode VARCHAR(255);

-- Step 2: Create unique constraint on barcode (allowing NULLs)
ALTER TABLE public.products 
ADD CONSTRAINT products_barcode_key UNIQUE (barcode);

-- Step 3: Create index on barcode for fast lookups
CREATE INDEX idx_products_barcode ON public.products USING btree (barcode);

-- Step 4: Create compound index for searching by barcode (active products)
CREATE INDEX idx_products_barcode_active ON public.products 
USING btree (barcode, is_active) 
WHERE (deleted_at IS NULL);

-- Step 5: Backfill barcode with SKU values (optional - can be done via application layer later)
-- This ensures all existing products have a barcode value for backward compatibility
UPDATE public.products 
SET barcode = sku 
WHERE barcode IS NULL AND deleted_at IS NULL;

-- Step 6: Add comment to document the barcode column
COMMENT ON COLUMN public.products.barcode IS 'Barcode/EAN-13 identifier for product scanning and inventory management';

-- Rollback script (if needed):
-- ALTER TABLE public.products DROP CONSTRAINT products_barcode_key;
-- DROP INDEX IF EXISTS idx_products_barcode;
-- DROP INDEX IF EXISTS idx_products_barcode_active;
-- ALTER TABLE public.products DROP COLUMN barcode;
