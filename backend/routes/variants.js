/**
 * Product Variants API Routes
 * CRUD operations for product variants.
 *
 * All routes require admin authentication.
 */

import express from 'express';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { ValidationError } from '../src/shared/errors/index.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import variantService from '../src/services/variantService.js';

const router = express.Router();

// -------------------------------------------------------
// GET /api/products/:productId/variants
// List all active variants for a product
// -------------------------------------------------------
router.get('/products/:productId/variants', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) throw new ValidationError('Invalid product ID');

  const variants = await variantService.getVariantsByProductId(productId);

  res.json({
    success: true,
    product_id: productId,
    count: variants.length,
    variants,
  });
}));

// -------------------------------------------------------
// GET /api/variants/:id
// Get a single variant by ID
// -------------------------------------------------------
router.get('/variants/:id', asyncHandler(async (req, res) => {
  const variantId = parseInt(req.params.id);
  if (isNaN(variantId)) throw new ValidationError('Invalid variant ID');

  const variant = await variantService.getVariantById(variantId);
  if (!variant) {
    return res.status(404).json({ success: false, message: 'Variant not found' });
  }

  res.json({ success: true, variant });
}));

// -------------------------------------------------------
// POST /api/products/:productId/variants
// Create a new variant for a product
// -------------------------------------------------------
router.post('/products/:productId/variants', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  if (isNaN(productId)) throw new ValidationError('Invalid product ID');

  const { variant_name, sku, barcode, cost_price, wholesale_price, current_price,
          sale_price, weight_kg, is_default, is_active, display_order, metadata,
          stock, warehouse_id, supplier_id } = req.body;

  if (!sku) throw new ValidationError('SKU is required');
  if (current_price == null || current_price < 0) throw new ValidationError('Valid current_price is required');

  const variant = await variantService.createVariant(productId, {
    variant_name, sku, barcode,
    cost_price, wholesale_price, current_price, sale_price,
    weight_kg, is_default, is_active, display_order, metadata,
    stock, warehouse_id, supplier_id,
  });

  res.status(201).json({ success: true, variant });
}));

// -------------------------------------------------------
// PUT /api/variants/:id
// Update a variant
// -------------------------------------------------------
router.put('/variants/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const variantId = parseInt(req.params.id);
  if (isNaN(variantId)) throw new ValidationError('Invalid variant ID');

  const variant = await variantService.updateVariant(variantId, req.body);

  res.json({ success: true, variant });
}));

// -------------------------------------------------------
// DELETE /api/variants/:id
// Soft-delete a variant (cannot delete last or default)
// -------------------------------------------------------
router.delete('/variants/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const variantId = parseInt(req.params.id);
  if (isNaN(variantId)) throw new ValidationError('Invalid variant ID');

  await variantService.deleteVariant(variantId);

  res.json({ success: true, message: 'Variant deleted' });
}));

// -------------------------------------------------------
// PUT /api/products/:productId/variants/:variantId/set-default
// Set a variant as the default
// -------------------------------------------------------
router.put('/products/:productId/variants/:variantId/set-default', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  const variantId = parseInt(req.params.variantId);

  if (isNaN(productId)) throw new ValidationError('Invalid product ID');
  if (isNaN(variantId)) throw new ValidationError('Invalid variant ID');

  const variant = await variantService.setDefaultVariant(productId, variantId);

  res.json({ success: true, variant });
}));

// -------------------------------------------------------
// POST /api/variants/:id/generate-barcode
// Generate a unique EAN-13 barcode for a variant
// -------------------------------------------------------
router.post('/variants/:id/generate-barcode', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const variantId = parseInt(req.params.id);
  if (isNaN(variantId)) throw new ValidationError('Invalid variant ID');

  const result = await variantService.generateBarcode(variantId);

  res.json({
    success: true,
    message: 'Barcode generated successfully',
    barcode: result.barcode,
    format: result.format,
    displayFormat: result.displayFormat,
    variant: result.variant,
  });
}));

// -------------------------------------------------------
// GET /api/variants/barcode/:barcode
// Look up a variant by barcode
// -------------------------------------------------------
router.get('/variants/barcode/:barcode', asyncHandler(async (req, res) => {
  const { barcode } = req.params;
  if (!barcode) throw new ValidationError('Barcode is required');

  const variant = await variantService.getVariantByBarcode(barcode);
  if (!variant) {
    return res.status(404).json({ success: false, message: 'Variant not found' });
  }

  res.json({ success: true, variant });
}));

export default router;
