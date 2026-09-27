-- Fix the products table sequence
-- This resets the auto-increment to start after the highest existing ID

SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM products), false);
