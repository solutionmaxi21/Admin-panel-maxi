import express from 'express';
import db from '../src/db/postgres.js';
import MetadataService from '../src/services/metadataService.js';
import CacheManager from '../src/services/cacheManager.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import { authLimiter } from '../src/shared/middleware/rateLimiter.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ConflictError } from '../src/shared/errors/index.js';
import {
  getPromotionsSchema,
  getPromotionSchema,
  createPromotionSchema,
  updatePromotionSchema,
  deletePromotionSchema
} from '../src/shared/validation/index.js';

const router = express.Router();

const parseApplicableIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((id) => parseInt(id, 10)).filter(Number.isFinite);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => parseInt(item.trim(), 10))
      .filter(Number.isFinite);
  }
  return [];
};

function parsePromotionId(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return NaN;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const match = raw.match(/^promo-(\d+)$/i);
  if (match) return parseInt(match[1], 10);
  return NaN;
}

// ============ PUBLIC STOREFRONT ROUTES ============

/**
 * GET /api/promotions/active
 * Get active promotions (public)
 */
router.get('/active', asyncHandler(async (req, res) => {
  const promotions = await MetadataService.getPromotions();

  const activePromotions = promotions
    .filter(p => {
      const now = new Date();
      const startDate = new Date(p.start_date);
      const endDate = new Date(p.end_date);
      return startDate <= now && endDate >= now;
    })
    .map(p => ({
      promotion_id: p.id,
      promotion_name: p.promotion_name,
      description: p.description,
      coupon_code: p.promotion_code,
      discount_type: p.discount_type,
      discount_percentage: p.discount_type === 'percentage' ? p.discount_value : null,
      discount_amount: p.discount_type === 'fixed' ? p.discount_value : null,
      min_order_amount: p.min_order_amount,
      start_date: p.start_date,
      end_date: p.end_date
    }));

  res.json({ promotions: activePromotions });
}));

/**
 * POST /api/promotions/validate
 * Validate a coupon code (public)
 */
router.post('/validate', authLimiter, asyncHandler(async (req, res) => {
  const { code, orderTotal, productIds = [], categoryIds = [], collectionIds = [] } = req.body;

  if (!code || !orderTotal) {
    throw new ValidationError('Code and orderTotal are required');
  }

  const query = `
    SELECT * FROM promotions
    WHERE LOWER(promotion_code) = LOWER($1)
      AND deleted_at IS NULL
      AND start_date <= NOW()
      AND end_date >= NOW()
  `;

  const promotion = await db.queryOne(query, [code]);

  if (!promotion) {
    return res.json({
      valid: false,
      error: 'Invalid or expired coupon code'
    });
  }

  if (promotion.max_uses && promotion.current_uses >= promotion.max_uses) {
    return res.json({
      valid: false,
      error: 'Coupon usage limit reached'
    });
  }

  if (promotion.min_order_amount && orderTotal < promotion.min_order_amount) {
    return res.json({
      valid: false,
      error: `Minimum order amount of ${promotion.min_order_amount} DZD required`
    });
  }

  const applicableTo = (promotion.applicable_to || 'ALL').toUpperCase();
  let isScopeMatched = true;

  if (applicableTo === 'CATEGORIES') {
    const applicableCategories = Array.isArray(promotion.applicable_categories) ? promotion.applicable_categories : [];
    if (applicableCategories.length === 0) {
      isScopeMatched = true;
    } else if (categoryIds.length > 0) {
      isScopeMatched = categoryIds.some((id) => applicableCategories.includes(id));
    } else {
      isScopeMatched = false;
    }
  }

  if (applicableTo === 'PRODUCTS') {
    const applicableProducts = parseApplicableIds(promotion.applicable_products);
    if (applicableProducts.length === 0) {
      isScopeMatched = true;
    } else if (productIds.length > 0) {
      isScopeMatched = productIds.some((id) => applicableProducts.includes(id));
    } else {
      isScopeMatched = false;
    }
  }

  if (applicableTo === 'COLLECTIONS') {
    const applicableCollections = parseApplicableIds(promotion.applicable_collections);
    if (applicableCollections.length === 0) {
      isScopeMatched = true;
    } else if (collectionIds.length > 0) {
      isScopeMatched = collectionIds.some((id) => applicableCollections.includes(id));
    } else if (productIds.length > 0) {
      const matchedProducts = await db.queryMany(
        `
          SELECT DISTINCT cp.product_id
          FROM collection_products cp
          JOIN collections c ON c.id = cp.collection_id
          WHERE cp.collection_id = ANY($1::int[])
            AND cp.product_id = ANY($2::int[])
            AND c.deleted_at IS NULL
            AND c.is_active = true
        `,
        [applicableCollections, productIds]
      );
      isScopeMatched = matchedProducts.length > 0;
    } else {
      isScopeMatched = false;
    }
  }

  if (!isScopeMatched) {
    return res.json({
      valid: false,
      error: 'Coupon does not apply to current cart items'
    });
  }

  let discount = 0;
  if (promotion.discount_type === 'percentage') {
    discount = (orderTotal * promotion.discount_value) / 100;
  } else if (promotion.discount_type === 'fixed') {
    discount = promotion.discount_value;
  }

  res.json({
    valid: true,
    promotion: {
      promotion_id: promotion.id,
      promotion_code: promotion.promotion_code,
      promotion_name: promotion.promotion_name,
      description: promotion.description,
      discount_type: promotion.discount_type,
      discount_value: promotion.discount_value,
      applicable_to: promotion.applicable_to,
      applicable_collections: parseApplicableIds(promotion.applicable_collections)
    },
    discount: Math.min(discount, orderTotal)
  });
}));

// ============ ADMIN ROUTES ============

/**
 * GET /api/promotions
 * Get all promotions (admin)
 */
router.get('/', authenticateToken, requireAdmin, validate(getPromotionsSchema), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, includeDeleted, onlyDeleted } = req.query;

  let conditions = [];
  if (onlyDeleted) {
    conditions = ['deleted_at IS NOT NULL'];
  } else if (!includeDeleted) {
    conditions = ['deleted_at IS NULL'];
  }
  const params = [];
  let paramCount = 1;

  if (status === 'active') {
    conditions.push('start_date <= NOW() AND end_date >= NOW()');
  } else if (status === 'expired') {
    conditions.push('end_date < NOW()');
  } else if (status === 'upcoming') {
    conditions.push('start_date > NOW()');
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const query = `
    SELECT 
      id as promotion_id,
      promotion_code,
      promotion_name,
      description,
      discount_type,
      discount_value,
      min_order_amount,
      max_uses,
      current_uses,
      start_date,
      end_date,
      created_at,
      deleted_at
    FROM promotions
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM promotions
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
  `;

  const [promotions, countResult] = await Promise.all([
    db.queryMany(query, [parseInt(limit), offset]),
    db.queryOne(countQuery, params)
  ]);

  res.json({
    promotions,
    total: parseInt(countResult.total),
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(countResult.total / parseInt(limit))
  });
}));

/**
 * GET /api/promotions/:id
 * Get single promotion (admin)
 */
router.get('/:id', authenticateToken, requireAdmin, validate(getPromotionSchema), asyncHandler(async (req, res) => {
  const promotionId = parsePromotionId(req.params.id);
  if (Number.isNaN(promotionId)) {
    throw new ValidationError([{ field: 'id', message: 'Invalid promotion id' }]);
  }

  const promotion = await db.queryOne(
    `SELECT * FROM promotions WHERE id = $1 AND deleted_at IS NULL`,
    [promotionId]
  );

  if (!promotion) {
    throw new NotFoundError('Promotion not found');
  }

  res.json({
    promotion_id: promotion.id,
    promotion_code: promotion.promotion_code,
    promotion_name: promotion.promotion_name,
    description: promotion.description,
    discount_type: promotion.discount_type,
    discount_value: promotion.discount_value,
    min_order_amount: promotion.min_order_amount,
    applicable_to: promotion.applicable_to,
    applicable_categories: promotion.applicable_categories || [],
    applicable_collections: parseApplicableIds(promotion.applicable_collections),
    max_uses: promotion.max_uses,
    current_uses: promotion.current_uses,
    start_date: promotion.start_date,
    end_date: promotion.end_date,
    created_at: promotion.created_at
  });
}));

/**
 * POST /api/promotions
 * Create new promotion (admin)
 */
router.post('/', authenticateToken, requireAdmin, validate(createPromotionSchema), asyncHandler(async (req, res) => {
  const {
    code,
    name,
    description,
    discountType,
    discountValue,
    minOrderAmount,
    maxUses,
    applicableTo,
    applicableCategories,
    applicableCollections,
    startDate,
    endDate
  } = req.body;
  const promotionCode = code;
  const promotionName = name;

  // Check for duplicate code
  const existing = await db.queryOne(
    'SELECT id FROM promotions WHERE LOWER(promotion_code) = LOWER($1) AND deleted_at IS NULL',
    [promotionCode]
  );

  if (existing) {
    throw new ValidationError('Promotion code already exists');
  }

  const query = `
    INSERT INTO promotions (
      promotion_code, promotion_name, description, discount_type, 
      discount_value, min_order_amount, applicable_to, applicable_categories, applicable_collections, max_uses,
      current_uses, start_date, end_date, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::applicable_to, $8, $9, $10, 0, $11, $12, NOW())
    RETURNING *
  `;

  const normalizedApplicableTo = applicableTo ? String(applicableTo).toUpperCase() : 'ALL';
  const normalizedApplicableCollections = Array.isArray(applicableCollections) && applicableCollections.length > 0
    ? applicableCollections
    : null;

  const promotion = await db.queryOne(query, [
    promotionCode,
    promotionName,
    description || null,
    discountType,
    discountValue,
    minOrderAmount || null,
    normalizedApplicableTo,
    applicableCategories && applicableCategories.length > 0 ? applicableCategories : null,
    normalizedApplicableCollections,
    maxUses || null,
    startDate,
    endDate
  ]);

  // Invalidate promotion caches after creation
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('promotions');

  res.status(201).json({
    message: 'Promotion created successfully',
    promotion: {
      promotion_id: promotion.id,
      promotion_code: promotion.promotion_code,
      discount_type: promotion.discount_type,
      discount_value: promotion.discount_value,
      applicable_to: promotion.applicable_to,
      applicable_categories: promotion.applicable_categories || []
    }
  });
}));

/**
 * PUT /api/promotions/:id
 * Update promotion (admin)
 */
router.put('/:id', authenticateToken, requireAdmin, validate(updatePromotionSchema), asyncHandler(async (req, res) => {
  const promotionId = parsePromotionId(req.params.id);
  if (Number.isNaN(promotionId)) {
    throw new ValidationError([{ field: 'id', message: 'Invalid promotion id' }]);
  }
  const {
    name,
    description,
    discountType,
    discountValue,
    minOrderAmount,
    maxUses,
    applicableTo,
    applicableCategories,
    applicableCollections,
    startDate,
    endDate
  } = req.body;

  const normalizedApplicableTo = applicableTo ? String(applicableTo).toUpperCase() : null;
  const normalizedApplicableCollections = Array.isArray(applicableCollections)
    ? (applicableCollections.length > 0 ? applicableCollections : null)
    : undefined;
  const promotionName = name;

  const query = `
    UPDATE promotions
    SET promotion_name = COALESCE($1, promotion_name),
        description = COALESCE($2, description),
        discount_type = COALESCE($3, discount_type),
        discount_value = COALESCE($4, discount_value),
        min_order_amount = COALESCE($5, min_order_amount),
        applicable_to = COALESCE($6::applicable_to, applicable_to),
        applicable_categories = CASE WHEN $7::INTEGER[] IS NOT NULL THEN $7::INTEGER[] ELSE applicable_categories END,
        applicable_collections = CASE WHEN $8::INTEGER[] IS NOT NULL THEN $8::INTEGER[] ELSE applicable_collections END,
        max_uses = COALESCE($9, max_uses),
        start_date = COALESCE($10, start_date),
        end_date = COALESCE($11, end_date),
        updated_at = NOW()
      WHERE id = $12 AND deleted_at IS NULL
    RETURNING *
  `;

  const promotion = await db.queryOne(query, [
    promotionName,
    description,
    discountType,
    discountValue,
    minOrderAmount,
    normalizedApplicableTo,
    applicableCategories && applicableCategories.length > 0 ? applicableCategories : null,
    normalizedApplicableCollections,
    maxUses,
    startDate,
    endDate,
    promotionId
  ]);

  if (!promotion) {
    throw new NotFoundError('Promotion not found');
  }

  // Invalidate promotion caches after update
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('promotions');

  res.json({
    message: 'Promotion updated successfully',
    promotion: {
      promotion_id: promotion.id,
      promotion_code: promotion.promotion_code,
      applicable_to: promotion.applicable_to,
      applicable_collections: parseApplicableIds(promotion.applicable_collections),
      applicable_categories: promotion.applicable_categories || []
    }
  });
}));

/**
 * DELETE /api/promotions/:id
 * Delete promotion (admin)
 */
router.delete('/:id', authenticateToken, requireAdmin, validate(deletePromotionSchema), asyncHandler(async (req, res) => {
  const promotionId = parsePromotionId(req.params.id);
  if (Number.isNaN(promotionId)) {
    throw new ValidationError([{ field: 'id', message: 'Invalid promotion id' }]);
  }

  const result = await db.queryOne(
    'UPDATE promotions SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [promotionId]
  );

  if (!result) {
    throw new NotFoundError('Promotion not found');
  }

  // Invalidate promotion caches after deletion
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('promotions');

  res.json({ message: 'Promotion deleted successfully' });
}));

/**
 * POST /api/promotions/:id/restore
 * Restore promotion from trash (admin)
 */
router.post('/:id/restore', authenticateToken, requireAdmin, validate(getPromotionSchema), asyncHandler(async (req, res) => {
  const promotionId = parsePromotionId(req.params.id);
  if (Number.isNaN(promotionId)) {
    throw new ValidationError([{ field: 'id', message: 'Invalid promotion id' }]);
  }

  const promotion = await db.queryOne('SELECT id, promotion_code, deleted_at FROM promotions WHERE id = $1', [promotionId]);
  if (!promotion) throw new NotFoundError('Promotion not found');
  if (!promotion.deleted_at) {
    return res.json({ success: true, message: 'Promotion is already active' });
  }

  const conflict = await db.queryOne(
    'SELECT id FROM promotions WHERE LOWER(promotion_code) = LOWER($1) AND id != $2 AND deleted_at IS NULL',
    [promotion.promotion_code, promotionId]
  );
  if (conflict) {
    throw new ConflictError('Cannot restore promotion: an active promotion with the same code already exists');
  }

  const restored = await db.queryOne('UPDATE promotions SET deleted_at = NULL WHERE id = $1 RETURNING *', [promotionId]);

  // Invalidate promotion caches after restoration
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('promotions');

  res.json({
    success: true,
    promotion: {
      promotion_id: restored.id,
      promotion_code: restored.promotion_code,
      promotion_name: restored.promotion_name,
      deleted_at: restored.deleted_at
    }
  });
}));

/**
 * DELETE /api/promotions/:id/hard
 * Permanently delete promotion (only from trash) (admin)
 */
router.delete('/:id/hard', authenticateToken, requireAdmin, validate(getPromotionSchema), asyncHandler(async (req, res) => {
  const promotionId = parsePromotionId(req.params.id);
  if (Number.isNaN(promotionId)) {
    throw new ValidationError([{ field: 'id', message: 'Invalid promotion id' }]);
  }

  const promotion = await db.queryOne('SELECT id, deleted_at FROM promotions WHERE id = $1', [promotionId]);
  if (!promotion) throw new NotFoundError('Promotion not found');
  if (!promotion.deleted_at) {
    throw new ValidationError([{ field: 'promotion', message: 'Promotion must be in trash before permanent deletion' }]);
  }

  await db.query('DELETE FROM promotions WHERE id = $1', [promotionId]);
  res.json({ success: true, message: 'Promotion permanently deleted' });
}));

/**
 * GET /api/promotions/stats/summary
 * Get promotion statistics (admin)
 */
router.get('/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      COUNT(*) as total_promotions,
      COUNT(*) FILTER (WHERE start_date <= NOW() AND end_date >= NOW()) as active_promotions,
      COUNT(*) FILTER (WHERE end_date < NOW()) as expired_promotions,
      COUNT(*) FILTER (WHERE start_date > NOW()) as upcoming_promotions,
      SUM(current_uses) as total_uses
    FROM promotions
    WHERE deleted_at IS NULL
  `;

  const stats = await db.queryOne(query);

  res.json({
    total: parseInt(stats.total_promotions),
    active: parseInt(stats.active_promotions),
    expired: parseInt(stats.expired_promotions),
    scheduled: parseInt(stats.upcoming_promotions),
    totalUses: parseInt(stats.total_uses) || 0
  });
}));

export default router;
