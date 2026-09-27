/**
 * Barcode Routes - PostgreSQL Version
 * Handles barcode generation, validation, scanning, and lookup
 */

import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError } from '../src/shared/errors/index.js';
import { ProductService } from '../src/services/index.js';
import {
  validateBarcode,
  normalizeBarcode,
  isValidEAN13,
  generateEAN13,
  formatBarcodeForDisplay,
  getBarcodeConfig
} from '../src/utils/barcodeUtils.js';

const router = express.Router();

// ============ BARCODE VALIDATION ROUTE ============

/**
 * POST /api/products/validate-barcode
 * Check if barcode already exists and is valid format
 * Admin only - used during product creation/editing
 */
router.post('/validate-barcode', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { barcode, product_id } = req.body;

  if (!barcode) {
    throw new ValidationError('Barcode is required');
  }

  // Validate barcode format
  const validation = validateBarcode(barcode);

  if (!validation.valid) {
    return res.json({
      available: false,
      barcode: barcode,
      format: validation.format,
      message: validation.error
    });
  }

  // Check if barcode already exists in database
  const exists = await ProductService.barcodeExists(validation.barcode, product_id);

  res.json({
    available: !exists,
    barcode: validation.barcode,
    format: validation.format,
    normalized: normalizeBarcode(validation.barcode),
    displayFormat: formatBarcodeForDisplay(validation.barcode),
    message: exists ? 'Barcode already exists' : 'Barcode available',
    valid: true
  });
}));

// ============ BARCODE GENERATION ROUTE ============

/**
 * POST /api/products/:id/generate-barcode
 * Generate new EAN-13 barcode for product
 * Admin only
 */
router.post('/:id/generate-barcode', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);

  if (!productId || productId <= 0) {
    throw new ValidationError('Valid product ID is required');
  }

  // Verify product exists
  const product = await ProductService.getProductByIdAdmin(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Generate new EAN-13 barcode
  const newBarcode = generateEAN13(productId);

  // Update product with new barcode
  const updated = await ProductService.updateProductBarcode(productId, newBarcode);

  res.json({
    success: true,
    message: 'Barcode generated successfully',
    data: {
      product_id: productId,
      barcode: newBarcode,
      format: 'EAN-13',
      displayFormat: formatBarcodeForDisplay(newBarcode),
      product_name: updated.product_name,
      sku: updated.sku
    }
  });
}));

// ============ BARCODE LOOKUP ROUTES ============

/**
 * GET /api/products/by-barcode/:barcode
 * Look up product by barcode (for admin scanning/inventory)
 * ADMIN ONLY - restricted to admin panel operations
 */
router.get('/by-barcode/:barcode', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { barcode } = req.params;

  if (!barcode) {
    throw new ValidationError('Barcode is required');
  }

  // Normalize barcode for lookup
  const normalizedBarcode = normalizeBarcode(barcode);

  // Look up product by barcode
  const product = await ProductService.getProductByBarcode(normalizedBarcode);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found with this barcode',
      barcode: normalizedBarcode
    });
  }

  res.json({
    success: true,
    message: 'Product found',
    data: product
  });
}));

// ============ BARCODE BULK OPERATIONS ============

/**
 * POST /api/products/generate-barcodes/batch
 * Generate barcodes for multiple products
 * Admin only - used by QuickReceiveProductsPage
 */
router.post('/generate-barcodes/batch', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { product_ids } = req.body;

  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    throw new ValidationError('product_ids must be a non-empty array');
  }

  if (product_ids.length > 500) {
    throw new ValidationError('Cannot generate barcodes for more than 500 products at once');
  }

  // Generate barcodes for all products
  const results = await ProductService.generateBarcodesForProducts(product_ids);

  res.json({
    success: true,
    message: `Generated barcodes for ${results.length} products`,
    count: results.length,
    data: results
  });
}));

/**
 * GET /api/products/barcode-search
 * Search products by barcode or SKU (combined search)
 * ADMIN ONLY - for admin panel search/scan integration
 */
router.get('/barcode-search', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query || query.length < 3) {
    return res.status(400).json({
      success: false,
      message: 'Search query must be at least 3 characters'
    });
  }

  const normalized = normalizeBarcode(query);

  // Search by barcode OR SKU
  const results = await ProductService.searchProductsByBarcodeOrSku(normalized);

  // If exactly one product is found, return it directly to match frontend expectation
  // of receiving a ProductDetail object on successful barcode scan
  if (results.length === 1) {
    return res.json(results[0]);
  }

  res.json({
    success: true,
    query: normalized,
    count: results.length,
    data: results
  });
}));

export default router;
