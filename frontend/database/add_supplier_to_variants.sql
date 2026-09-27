-- =============================================================
-- Migration: Variant Stock, Warehouse & Supplier Fixes
-- Run this BEFORE deploying the updated backend code.
-- =============================================================

-- 1. Add supplier_id column to product_variants (Phase 3)
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);

CREATE INDEX IF NOT EXISTS idx_product_variants_supplier
  ON product_variants(supplier_id);

-- 2. Backfill: ensure every active variant has at least one stock row (Phase 5)
--    Variants created via the old variantService.createVariant() are missing stock rows.
INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
SELECT pv.product_id, pv.id, 1, 0, 5
FROM product_variants pv
LEFT JOIN stock s ON s.variant_id = pv.id
WHERE s.id IS NULL
  AND pv.deleted_at IS NULL;

-- 3. Backfill supplier_id from product-level supplier (optional convenience)
--    Sets each variant's supplier to the product's supplier if not already set.
UPDATE product_variants pv
SET supplier_id = p.supplier_id
FROM products p
WHERE pv.product_id = p.id
  AND pv.supplier_id IS NULL
  AND p.supplier_id IS NOT NULL
  AND pv.deleted_at IS NULL;
