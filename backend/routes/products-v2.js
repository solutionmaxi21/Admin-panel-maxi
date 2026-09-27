/**
 * Products Routes - PostgreSQL Version
 * Secure, performant product management with service layer
 */

import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { upload } from '../src/shared/middleware/upload.js';
import { validate } from '../src/shared/middleware/validate.js';
import {
  productFiltersSchema,
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  deleteProductSchema
} from '../src/shared/validation/index.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ConflictError } from '../src/shared/errors/index.js';
import { ProductService } from '../src/services/index.js';

const router = express.Router();

// ============ IMAGE UPLOAD ROUTE ============

/**
 * POST /api/products/upload
 * Upload product image for draft/temporary storage
 * Admin only - for use during product creation
 */
router.post('/upload', authenticateToken, requireAdmin, ...upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('Image file is required');
  }

  // Get protocol and host from request to construct full URL
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3001';
  // Files are stored under backend/uploads/products via upload middleware
  const relativePath = `/uploads/products/${req.file.filename}`;
  const fullUrl = `${protocol}://${host}${relativePath}`;

  console.log('[Upload Endpoint] File uploaded successfully', {
    filename: req.file.filename,
    size: req.file.size,
    protocol,
    host,
    fullUrl,
    relativePath
  });

  res.json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: fullUrl,  // Send full URL so frontend can load from backend
      relativePath: relativePath,  // Also include relative path for reference
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    }
  });
}));

// ============ SKU VALIDATION ROUTE ============

/**
 * POST /api/products/validate-sku
 * Check if SKU already exists
 * Rate limited at middleware level
 */
router.post('/validate-sku', authenticateToken, asyncHandler(async (req, res) => {
  const { sku, product_id } = req.body;

  if (!sku) {
    throw new ValidationError('SKU is required');
  }

  // Validate SKU format
  const skuRegex = /^[A-Za-z0-9-_]+$/;
  if (!skuRegex.test(sku)) {
    return res.json({
      available: false,
      sku: sku,
      message: 'SKU can only contain letters, numbers, hyphens, and underscores'
    });
  }

  const exists = await ProductService.skuExists(sku, product_id);

  res.json({
    available: !exists,
    sku: sku,
    message: exists ? 'SKU already exists' : 'SKU available'
  });
}));

// ============ PUBLIC STOREFRONT ROUTES ============

/**
 * GET /api/products/storefront
 * Get products for public storefront with filters and pagination
 * No authentication required
 */
router.get('/storefront', validate(productFiltersSchema), asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    category_id,
    min_price,
    max_price,
    search,
    sort_by,
    sort_order,
    in_stock_only
  } = req.query;

  const result = await ProductService.getStorefrontProducts({
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20,
    category_id: category_id ? parseInt(category_id) : null,
    min_price: min_price ? parseFloat(min_price) : null,
    max_price: max_price ? parseFloat(max_price) : null,
    search,
    sort_by: sort_by || 'created_at',
    sort_order: sort_order || 'DESC',
    in_stock_only: in_stock_only === 'true'
  });

  res.json(result);
}));

/**
 * GET /api/products/storefront/:id
 * Get single product details for storefront
 * No authentication required
 */
router.get('/storefront/:id', validate(getProductSchema), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const product = await ProductService.getProductById(productId);

  if (!product || !product.is_active) {
    throw new NotFoundError('Product not found');
  }

  res.json(product);
}));

// ============ ADMIN ROUTES (Protected) ============

/**
 * GET /api/products
 * Get all products for admin with filters
 * Requires authentication
 */
router.get('/', authenticateToken, requireAdmin, validate(productFiltersSchema), asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    category_id,
    supplier_id,
    search,
    is_active,
    includeDeleted,
    onlyDeleted,
    includeInactive,
    sort_by,
    sort_order,
    stock_filter
  } = req.query;

  const filters = {
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50,
    category_id: category_id ? parseInt(category_id) : null,
    supplier_id: supplier_id ? parseInt(supplier_id) : null,
    search,
    is_active,
    includeDeleted,
    onlyDeleted,
    includeInactive,
    sort_by,
    sort_order,
    stock_filter: stock_filter || null
  };

  const result = await ProductService.getAdminProducts(filters);
  res.json(result);
}));

/**
 * GET /api/products/:id
 * Get single product by ID (admin view)
 * Requires authentication
 */
router.get('/:id', authenticateToken, requireAdmin, validate(getProductSchema), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const product = await ProductService.getProductByIdAdmin(productId);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  res.json(product);
}));

/**
 * POST /api/products/:id/restore
 * Restore soft-deleted product
 * Requires admin authentication
 */
router.post('/:id/restore', authenticateToken, requireAdmin, validate(getProductSchema), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const userId = req.user.userId;

  try {
    const restored = await ProductService.restoreProduct(productId, userId);
    res.json({ message: 'Product restored successfully', restored });
  } catch (err) {
    if (err instanceof ConflictError) throw err;
    throw err;
  }
}));

/**
 * DELETE /api/products/:id/hard
 * Permanently delete product (must already be soft-deleted)
 * Requires admin authentication
 */
router.delete('/:id/hard', authenticateToken, requireAdmin, validate(getProductSchema), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const deleted = await ProductService.hardDeleteProduct(productId);
  res.json({ message: 'Product permanently deleted', deleted });
}));

/**
 * POST /api/products
 * Create new product
 * Requires admin authentication
 */
router.post('/', authenticateToken, requireAdmin, validate(createProductSchema), asyncHandler(async (req, res) => {
  const productData = req.body;
  const userId = req.user.userId;

  // Validate SKU doesn't exist
  const skuExists = await ProductService.skuExists(productData.sku);
  if (skuExists) {
    throw new ValidationError([], 'SKU already exists');
  }

  // Transform camelCase to snake_case for database
  const transformedData = {
    product_name: productData.name,
    sku: productData.sku,
    brand: productData.brand,
    category_id: productData.categoryId,
    supplier_id: productData.supplierId,
    current_price: productData.price || productData.currentPrice,
    sale_price: productData.salePrice,
    cost_price: productData.costPrice,
    short_description: productData.shortDescription,
    description: productData.fullDescription || productData.description,
    is_active: productData.isActive !== false,
    weight_kg: productData.weight || productData.weightKg,
    length_cm: productData.length || productData.lengthCm,
    width_cm: productData.width || productData.widthCm,
    height_cm: productData.height || productData.heightCm,
    dimensions: productData.dimensions,
    warranty_months: productData.warrantyMonths,
    model_number: productData.modelNumber,
    meta_title: productData.metaTitle,
    meta_description: productData.metaDescription,
    tags: Array.isArray(productData.tags) ? productData.tags.join(',') : (productData.tags || null),
    is_featured: productData.featured || false,
    images: productData.images,
    attributes: productData.attributes,
    stock: productData.stock || 0,
    warehouse_id: productData.warehouseId || 1,
    reorder_level: productData.reorderLevel || productData.lowStockThreshold || 5,
    serial_number: productData.serialNumber || null,
    variants: productData.variants || []
  };

  const product = await ProductService.createProduct(transformedData, userId);

  // Auto-generate barcode on creation
  let barcode = null;
  try {
    const { generateEAN13 } = await import('../src/utils/barcodeUtils.js');
    barcode = generateEAN13(product.id);
    await ProductService.updateProductBarcode(product.id, barcode);
    product.barcode = barcode;
  } catch (barcodeError) {
    console.error('Failed to auto-generate barcode:', barcodeError);
  }

  res.status(201).json({
    message: 'Product created successfully',
    product,
    barcode: barcode || null
  });
}));

/**
 * PUT /api/products/:id
 * Update existing product
 * Requires admin authentication
 */
router.put('/:id', authenticateToken, requireAdmin, validate(updateProductSchema), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const updates = req.body;
  const userId = req.user.userId;

  // If SKU is being updated, check it doesn't exist
  if (updates.sku) {
    const skuExists = await ProductService.skuExists(updates.sku, productId);
    if (skuExists) {
      throw new ValidationError([], 'SKU already exists');
    }
  }

  // Transform camelCase to snake_case for database
  const transformedUpdates = {};

  if (updates.name !== undefined) transformedUpdates.product_name = updates.name;
  if (updates.sku !== undefined) transformedUpdates.sku = updates.sku;
  if (updates.brand !== undefined) transformedUpdates.brand = updates.brand;
  if (updates.categoryId !== undefined) transformedUpdates.category_id = updates.categoryId;
  if (updates.supplierId !== undefined) transformedUpdates.supplier_id = updates.supplierId;
  if (updates.price !== undefined) transformedUpdates.current_price = updates.price;
  if (updates.currentPrice !== undefined) transformedUpdates.current_price = updates.currentPrice;
  if (updates.salePrice !== undefined) transformedUpdates.sale_price = updates.salePrice;
  if (updates.costPrice !== undefined) transformedUpdates.cost_price = updates.costPrice;
  if (updates.shortDescription !== undefined) transformedUpdates.short_description = updates.shortDescription;
  if (updates.description !== undefined) transformedUpdates.description = updates.description;
  if (updates.fullDescription !== undefined) transformedUpdates.description = updates.fullDescription;
  if (updates.isActive !== undefined) transformedUpdates.is_active = updates.isActive;
  if (updates.weight !== undefined) transformedUpdates.weight_kg = updates.weight;
  if (updates.weightKg !== undefined) transformedUpdates.weight_kg = updates.weightKg;
  if (updates.length !== undefined) transformedUpdates.length_cm = updates.length;
  if (updates.lengthCm !== undefined) transformedUpdates.length_cm = updates.lengthCm;
  if (updates.width !== undefined) transformedUpdates.width_cm = updates.width;
  if (updates.widthCm !== undefined) transformedUpdates.width_cm = updates.widthCm;
  if (updates.height !== undefined) transformedUpdates.height_cm = updates.height;
  if (updates.heightCm !== undefined) transformedUpdates.height_cm = updates.heightCm;
  if (updates.dimensions !== undefined) transformedUpdates.dimensions = updates.dimensions;
  if (updates.warrantyMonths !== undefined) transformedUpdates.warranty_months = updates.warrantyMonths;
  if (updates.modelNumber !== undefined) transformedUpdates.model_number = updates.modelNumber;
  if (updates.serialNumber !== undefined) transformedUpdates.serial_number = updates.serialNumber;
  if (updates.metaTitle !== undefined) transformedUpdates.meta_title = updates.metaTitle;
  if (updates.metaDescription !== undefined) transformedUpdates.meta_description = updates.metaDescription;
  if (updates.tags !== undefined) transformedUpdates.tags = Array.isArray(updates.tags) ? updates.tags.join(',') : updates.tags;
  if (updates.featured !== undefined) transformedUpdates.is_featured = updates.featured;
  if (updates.stock !== undefined) transformedUpdates.stock = parseInt(updates.stock);
  if (updates.warehouseId !== undefined) transformedUpdates.warehouse_id = updates.warehouseId;
  if (updates.reorderLevel !== undefined || updates.lowStockThreshold !== undefined) {
    transformedUpdates.reorder_level = updates.reorderLevel ?? updates.lowStockThreshold;
  }
  if (updates.images !== undefined) transformedUpdates.images = updates.images;
  if (updates.attributes !== undefined) transformedUpdates.attributes = updates.attributes;
  if (updates.variants !== undefined) transformedUpdates.variants = updates.variants;

  const product = await ProductService.updateProduct(productId, transformedUpdates, userId);

  res.json({
    message: 'Product updated successfully',
    product
  });
}));

/**
 * DELETE /api/products/:id
 * Soft delete product
 * Requires admin authentication
 */
router.delete('/:id', authenticateToken, requireAdmin, validate(deleteProductSchema), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const userId = req.user.userId;

  const deleted = await ProductService.deleteProduct(productId, userId);

  if (!deleted) {
    throw new NotFoundError('Product not found');
  }

  res.json({
    message: 'Product deleted successfully'
  });
}));

/**
 * POST /api/products/:id/images
 * Upload product images
 * Requires admin authentication
 */
router.post('/:id/images', authenticateToken, requireAdmin, ...upload.array('images', 10), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);

  // Verify product exists
  const product = await ProductService.getProductById(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Process uploaded files
  const imageUrls = req.files.map(file => ({
    image_url: `/uploads/${file.filename}`,
    image_type: 'product'
  }));

  // Note: You'll need to add an addProductImages method to ProductService
  // For now, return the URLs
  res.json({
    message: 'Images uploaded successfully',
    images: imageUrls
  });
}));

/**
 * POST /api/products/bulk-delete
 * Delete multiple products at once
 * Requires admin authentication
 */
router.post('/bulk-delete', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { productIds } = req.body;
  const userId = req.user.userId;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ValidationError('productIds must be a non-empty array');
  }

  if (productIds.length > 500) {
    throw new ValidationError('Maximum 500 products can be deleted at once');
  }

  const validIds = productIds.filter(id => Number.isInteger(parseInt(id)));
  if (validIds.length !== productIds.length) {
    throw new ValidationError('All product IDs must be valid integers');
  }

  console.log(`[BULK DELETE] User ${userId} attempting to delete ${validIds.length} products`);

  const deletedIds = [];
  const failedIds = [];

  for (const productId of validIds) {
    try {
      const product = await db.queryOne(
        'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
        [productId]
      );

      if (!product) {
        failedIds.push({ id: productId, reason: 'Product not found' });
        continue;
      }

      const activeOrders = await db.queryOne(
        `SELECT COUNT(*) as order_count FROM order_items oi
         INNER JOIN orders o ON oi.order_id = o.id
         WHERE oi.product_id = $1 AND o.current_status IN ('pending', 'processing', 'shipped')`,
        [productId]
      );

      if (parseInt(activeOrders.order_count) > 0) {
        failedIds.push({ id: productId, reason: 'Product has active orders' });
        continue;
      }

      await db.queryOne(
        `UPDATE products SET deleted_at = NOW(), updated_by = $1 
         WHERE id = $2 RETURNING id`,
        [userId, productId]
      );

      console.log(`[BULK DELETE] Deleted product ${productId}`);
      deletedIds.push(productId);

    } catch (error) {
      console.error(`[BULK DELETE] Error deleting product ${productId}:`, error.message);
      failedIds.push({ id: productId, reason: error.message });
    }
  }

  res.json({
    success: true,
    message: `Deleted ${deletedIds.length} products${failedIds.length > 0 ? `, ${failedIds.length} failed` : ''}`,
    deletedCount: deletedIds.length,
    failedCount: failedIds.length,
    deletedIds: deletedIds,
    failed: failedIds.length > 0 ? failedIds : null
  });
}));

/**
 * POST /api/products/bulk-receive
 * Bulk receive products for warehouse intake
 * Creates new products with minimal data (is_active=false) or updates stock for existing products
 * Requires admin authentication
 */
router.post('/bulk-receive', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { products } = req.body;
  const userId = req.user.userId;

  if (!Array.isArray(products) || products.length === 0) {
    throw new ValidationError([], 'Products array is required');
  }

  // Limit batch size to 500 items for performance
  if (products.length > 500) {
    throw new ValidationError([], 'Maximum 500 products per batch. Please split into smaller batches.');
  }

  const results = await ProductService.bulkReceiveProducts(products, userId);

  res.status(201).json({
    message: `Processed ${results.summary.total} products: ${results.summary.created} created, ${results.summary.updated} updated, ${results.summary.errors} errors`,
    results
  });
}));

/**
 * GET /api/products/stats
 * Get product statistics for dashboard
 * Requires admin authentication
 */
router.get('/admin/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stats = await ProductService.getProductStats();
  res.json(stats);
}));

export default router;
