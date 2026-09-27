/**
 * Metadata Routes - PostgreSQL Version
 * Provides reference data with caching for performance
 */

import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { MetadataService } from '../src/services/index.js';
import CacheManager from '../src/services/cacheManager.js';

const router = express.Router();

// ============ CATEGORIES ============

/**
 * GET /api/metadata/categories
 * Get all categories (cached)
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await CacheManager.getCategories();
  res.json(categories);
}));

/**
 * GET /api/metadata/categories/:id
 * Get category by ID
 */
router.get('/categories/:id', asyncHandler(async (req, res) => {
  const categoryId = parseInt(req.params.id);
  const category = await MetadataService.getCategoryById(categoryId);

  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }

  res.json(category);
}));

// ============ SUPPLIERS ============

/**
 * GET /api/metadata/suppliers
 * Get all suppliers
 */
router.get('/suppliers', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const suppliers = await MetadataService.getSuppliers(activeOnly);
  res.json(suppliers);
}));

// ============ WILAYAS & COMMUNES ============

/**
 * GET /api/metadata/wilayas
 * Get all wilayas (cached)
 */
router.get('/wilayas', asyncHandler(async (req, res) => {
  const wilayas = await CacheManager.getWilayas();
  res.json(wilayas);
}));

/**
 * GET /api/metadata/communes
 * Get communes by wilaya
 */
router.get('/communes', asyncHandler(async (req, res) => {
  const wilayaId = parseInt(req.query.wilaya_id);

  if (!wilayaId) {
    return res.status(400).json({ error: 'wilaya_id is required' });
  }

  const communes = await CacheManager.getCommunesByWilaya(wilayaId);
  res.json(communes);
}));

// ============ SHIPPING CENTERS ============

/**
 * GET /api/metadata/shipping-centers
 * Get shipping centers (cached)
 */
router.get('/shipping-centers', asyncHandler(async (req, res) => {
  const wilayaId = req.query.wilaya_id ? parseInt(req.query.wilaya_id) : null;
  const centers = await CacheManager.getShippingCenters(wilayaId);
  res.json(centers);
}));

// ============ SHIPPING FEE CALCULATOR ============

/**
 * POST /api/metadata/calculate-shipping
 * Calculate shipping fee
 */
router.post('/calculate-shipping', asyncHandler(async (req, res) => {
  const { from_wilaya_id, to_wilaya_id, to_commune_id, weight } = req.body;

  if (!from_wilaya_id || !to_wilaya_id || !to_commune_id) {
    return res.status(400).json({
      error: 'from_wilaya_id, to_wilaya_id, and to_commune_id are required'
    });
  }

  const fee = await MetadataService.getShippingFee(
    from_wilaya_id,
    to_wilaya_id,
    to_commune_id,
    weight || 1
  );

  if (!fee) {
    return res.status(404).json({ error: 'Shipping tariff not found' });
  }

  res.json(fee);
}));

// ============ PROMOTIONS ============

/**
 * GET /api/metadata/promotions
 * Get active promotions (cached)
 */
router.get('/promotions', asyncHandler(async (req, res) => {
  const promotions = await CacheManager.getActivePromotions();
  res.json(promotions);
}));

/**
 * GET /api/metadata/promotions/all
 * Get all promotions (admin only)
 */
router.get('/promotions/all', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const promotions = await MetadataService.getPromotions(false);
  res.json(promotions);
}));

// ============ WAREHOUSES ============

/**
 * GET /api/metadata/warehouses
 * Get warehouses (admin only)
 */
router.get('/warehouses', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log('[Metadata API] GET /warehouses - Fetching warehouses...');
  const warehouses = await MetadataService.getWarehouses();
  console.log(`[Metadata API] Returned ${warehouses.length} warehouses`);
  res.json(warehouses);
}));

// ============ GLOBAL SEARCH ============

/**
 * GET /api/metadata/search
 * Global search across entities
 */
router.get('/search', authenticateToken, asyncHandler(async (req, res) => {
  const { q, entities } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const searchEntities = entities ? entities.split(',') : ['products', 'categories'];
  const results = await MetadataService.globalSearch(q, searchEntities);

  res.json(results);
}));

// ============ BRANDS ============

/**
 * GET /api/metadata/brands
 * Get unique brands from products
 */
router.get('/brands', asyncHandler(async (req, res) => {
  const brands = await MetadataService.getBrands?.() || [];
  res.json(brands);
}));

// ============ CACHE MANAGEMENT (Admin Only) ============

/**
 * POST /api/metadata/cache/invalidate
 * Invalidate cache by pattern
 */
router.post('/cache/invalidate', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { pattern } = req.body;

  if (!pattern) {
    CacheManager.clearAll();
    return res.json({ message: 'All cache cleared' });
  }

  CacheManager.invalidate(pattern);
  res.json({ message: `Cache invalidated for pattern: ${pattern}` });
}));

/**
 * GET /api/metadata/cache/stats
 * Get cache statistics with detailed metrics
 */
router.get('/cache/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stats = CacheManager.getStats();
  const cacheKeys = CacheManager.cache.keys();

  // Group keys by prefix for better visibility
  const keysByPrefix = cacheKeys.reduce((acc, key) => {
    const prefix = key.split(':')[0];
    acc[prefix] = (acc[prefix] || 0) + 1;
    return acc;
  }, {});

  res.json({
    ...stats,
    keysByPrefix,
    totalRequests: stats.hits + stats.misses,
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external
    },
    uptime: process.uptime()
  });
}));

/**
 * GET /api/metadata/cache/keys
 * List all cached keys (admin only, for debugging)
 */
router.get('/cache/keys', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const keys = CacheManager.cache.keys();
  const keysWithTTL = keys.map(key => ({
    key,
    ttl: CacheManager.cache.getTtl(key)
  }));

  res.json({ keys: keysWithTTL, count: keys.length });
}));


export default router;
