// src/shared/validation/promotions.js - FIXED VERSION
import { z } from 'zod';
import { paginationSchema, priceSchema, bilingualFieldSchema, bilingualFieldOptionalSchema } from './common.js';

/**
 * Promotion validation schemas
 */

// FIXED: Custom ID parameter schema for promotions that accepts both numeric and promo-XXX format
const promotionIdParamSchema = z.object({
  id: z.string().refine(
    (val) => {
      // Accept numeric strings (e.g., "1", "2")
      if (/^\d+$/.test(val)) return true;
      // Accept promotion ID format (e.g., "promo-001", "promo-002")
      if (/^promo-\d+$/i.test(val)) return true;
      return false;
    },
    { message: 'Invalid promotion ID format. Must be numeric or in format promo-XXX' }
  ),
});

// Get promotions
export const getPromotionsSchema = z.object({
  query: z.object({
    includeDeleted: z.coerce.boolean().optional(),
    onlyDeleted: z.coerce.boolean().optional(),
    status: z.enum(['active', 'inactive', 'scheduled', 'expired']).optional(),
    type: z.enum(['percentage', 'fixed', 'bogo', 'shipping', 'bundle']).optional(),
    search: z.string().max(100).optional(),
    sortBy: z.enum(['name', 'startDate', 'endDate', 'discountValue']).default('startDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    ...paginationSchema.shape,
  }),
});

// Get promotion by ID or code - FIXED
export const getPromotionSchema = z.object({
  params: promotionIdParamSchema, // FIXED: Use custom schema
});

// Validate coupon code (public)
export const validateCouponSchema = z.object({
  body: z.object({
    code: z.string().min(3, 'Coupon code is required').max(50),
    cartTotal: priceSchema,
    productIds: z.array(z.coerce.number().int().positive()).optional(),
    categoryIds: z.array(z.coerce.number().int().positive()).optional(),
    collectionIds: z.array(z.coerce.number().int().positive()).optional(),
  }),
});

// Create promotion (Admin)
export const createPromotionSchema = z.object({
  body: z.object({
    // Bilingual name field - accepts both string and {fr, ar} object
    name: bilingualFieldSchema(3, 100),
    // Bilingual description field
    description: bilingualFieldOptionalSchema(500),
    code: z.string()
      .min(3)
      .max(50)
      .regex(/^[A-Z0-9-_]+$/i, 'Code must be alphanumeric with hyphens or underscores only')
      .optional(),
    type: z.enum(['percentage', 'fixed', 'bogo', 'shipping', 'bundle']).optional(),
    discountType: z.enum(['percentage', 'fixed', 'free_shipping']).optional(),
    discountValue: z.coerce.number().min(0),
    maxDiscount: priceSchema.optional(),
    minOrderAmount: priceSchema.optional(),
    minimumOrderAmount: priceSchema.optional(),
    maximumOrderAmount: priceSchema.optional(),
    applicableCategories: z.array(z.coerce.number().int().positive()).optional(),
    applicableProducts: z.array(z.coerce.number().int().positive()).optional(),
    applicableCollections: z.array(z.coerce.number().int().positive()).optional(),
    usageLimit: z.coerce.number().int().min(0).optional(),
    maxUses: z.coerce.number().int().min(0).optional(),
    usageLimitPerUser: z.coerce.number().int().min(0).optional(),
    maxUsesPerUser: z.coerce.number().int().min(0).optional(),
    startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
    endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
    isActive: z.boolean().default(true),
    applicableTo: z.enum(['all', 'categories', 'products', 'collections', 'users']).default('all'),
    applicableIds: z.array(z.coerce.number().int().positive()).optional(),
    excludedProductIds: z.array(z.coerce.number().int().positive()).optional(),
    excludedCategoryIds: z.array(z.coerce.number().int().positive()).optional(),
    conditions: z.object({
      firstOrderOnly: z.boolean().optional(),
      newUsersOnly: z.boolean().optional(),
      minQuantity: z.coerce.number().int().min(1).optional(),
    }).optional(),
  }).refine((data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return end > start;
  }, {
    message: 'End date must be after start date',
    path: ['endDate'],
  }).refine((data) => {
    const discountType = data.discountType || data.type;
    if (discountType === 'percentage' && data.discountValue > 100) {
      return false;
    }
    return true;
  }, {
    message: 'Percentage discount cannot exceed 100%',
    path: ['discountValue'],
  }),
});

// Update promotion (Admin) - FIXED
export const updatePromotionSchema = z.object({
  params: promotionIdParamSchema, // FIXED: Use custom schema
  body: z.object({
    // Bilingual name field - accepts both string and {fr, ar} object
    name: bilingualFieldSchema(3, 100).optional(),
    // Bilingual description field
    description: bilingualFieldOptionalSchema(500),
    code: z.string()
      .min(3)
      .max(50)
      .regex(/^[A-Z0-9-_]+$/i)
      .optional(),
    type: z.enum(['percentage', 'fixed', 'bogo', 'shipping', 'bundle']).optional(),
    discountType: z.enum(['percentage', 'fixed', 'free_shipping']).optional(),
    discountValue: z.coerce.number().min(0).optional(),
    maxDiscount: priceSchema.optional(),
    minOrderAmount: priceSchema.optional(),
    minimumOrderAmount: priceSchema.optional(),
    maximumOrderAmount: priceSchema.optional(),
    applicableCategories: z.array(z.coerce.number().int().positive()).optional(),
    applicableProducts: z.array(z.coerce.number().int().positive()).optional(),
    applicableCollections: z.array(z.coerce.number().int().positive()).optional(),
    usageLimit: z.coerce.number().int().min(0).optional(),
    maxUses: z.coerce.number().int().min(0).optional(),
    usageLimitPerUser: z.coerce.number().int().min(0).optional(),
    maxUsesPerUser: z.coerce.number().int().min(0).optional(),
    startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
    endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
    isActive: z.boolean().optional(),
    applicableTo: z.enum(['all', 'categories', 'products', 'collections', 'users']).optional(),
    applicableIds: z.array(z.coerce.number().int().positive()).optional(),
    excludedProductIds: z.array(z.coerce.number().int().positive()).optional(),
    excludedCategoryIds: z.array(z.coerce.number().int().positive()).optional(),
    conditions: z.object({
      firstOrderOnly: z.boolean().optional(),
      newUsersOnly: z.boolean().optional(),
      minQuantity: z.coerce.number().int().min(1).optional(),
    }).optional(),
  }),
});

// Delete promotion (Admin) - FIXED
export const deletePromotionSchema = z.object({
  params: promotionIdParamSchema, // FIXED: Use custom schema
});

// Apply promotion to products (Admin) - FIXED
export const applyPromotionSchema = z.object({
  params: promotionIdParamSchema, // FIXED: Use custom schema
  body: z.object({
    productIds: z.array(z.coerce.number().int().positive()).min(1),
  }),
});

// Remove promotion from products (Admin) - FIXED
export const removePromotionSchema = z.object({
  params: promotionIdParamSchema, // FIXED: Use custom schema
  body: z.object({
    productIds: z.array(z.coerce.number().int().positive()).min(1),
  }),
});

export default {
  getPromotionsSchema,
  getPromotionSchema,
  validateCouponSchema,
  createPromotionSchema,
  updatePromotionSchema,
  deletePromotionSchema,
  applyPromotionSchema,
  removePromotionSchema,
};