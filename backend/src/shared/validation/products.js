import { z } from 'zod';
import { paginationSchema, idParamSchema, priceSchema, sortOrderSchema } from './common.js';

/**
 * Product validation schemas
 */

// Product filters for listing
export const productFiltersSchema = z.object({
  query: z.object({
    includeDeleted: z.coerce.boolean().optional(),
    onlyDeleted: z.coerce.boolean().optional(),
    includeInactive: z.coerce.boolean().optional(),
    search: z.string().max(200).optional(),
    category: z.string().optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    category_id: z.coerce.number().int().positive().optional(),
    supplier_id: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    brand: z.string().max(100).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    inStock: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
    featured: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
    isNew: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
    sortBy: z.enum(['price', 'name', 'createdAt', 'rating', 'stock']).default('createdAt'),
    sortOrder: sortOrderSchema,
    is_active: z.enum(['true', 'false', '1', '0']).optional(),
    sort_by: z.string().optional(),
    sort_order: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    stock_filter: z.enum(['in_stock', 'out_of_stock']).optional(),
    ...paginationSchema.shape,
  }),
});


// Create product
export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(200),
    sku: z.string()
      .min(3, 'SKU must be at least 3 characters')
      .max(50)
      .regex(/^[A-Za-z0-9-_]+$/, 'SKU can only contain letters, numbers, hyphens and underscores'),
    serialNumber: z.string().max(100).optional(),
    description: z.string().max(50000).optional(),
    fullDescription: z.string().max(50000).optional(),
    shortDescription: z.string().max(500).optional(),
    price: z.coerce.number().min(0),
    currentPrice: z.coerce.number().min(0).optional(),
    salePrice: z.coerce.number().min(0).optional(),
    costPrice: z.coerce.number().min(0).optional(),
    wholesalePrice: z.coerce.number().min(0).optional(),
    categoryId: z.coerce.number().int().positive(),
    supplierId: z.coerce.number().int().positive().optional(),
    brand: z.string().min(1).max(100).optional(),
    modelNumber: z.string().max(100).optional(),
    weight: z.coerce.number().min(0).optional(),
    warrantyMonths: z.coerce.number().int().min(0).optional(),
    dimensions: z.object({
      length: z.coerce.number().min(0).optional(),
      width: z.coerce.number().min(0).optional(),
      height: z.coerce.number().min(0).optional(),
    }).optional(),
    stock: z.coerce.number().int().min(0).default(0),
    warehouseId: z.coerce.number().int().positive().optional(),
    reorderLevel: z.coerce.number().int().min(0).default(5),
    lowStockThreshold: z.coerce.number().int().min(0).default(5),
    featured: z.boolean().default(false),
    isNew: z.boolean().default(true),
    isActive: z.boolean().default(true),
    metaTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(160).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    images: z.array(z.any()).optional(),
    attributes: z.array(z.any()).optional(),
    // Legacy fields
    originalPrice: z.coerce.number().min(0).optional(),
    status: z.string().optional(),
    image: z.string().optional(),
    inStock: z.boolean().optional(),
  }).passthrough(), // Allow extra fields
});

// Update product - Optimized with preprocessing
export const updateProductSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^prod-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid product ID' })
    )
  }),
  body: createProductSchema.shape.body.partial(),
});

// Get product by ID - Optimized with preprocessing
export const getProductSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^prod-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid product ID' })
    )
  }),
});

// Get product by slug
export const getProductBySlugSchema = z.object({
  params: z.object({
    slug: z.string().min(1).max(200),
  }),
});

// Product attributes
export const productAttributeSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    value: z.string().min(1).max(500),
  }),
});

// Product images
export const productImageSchema = z.object({
  params: idParamSchema,
  body: z.object({
    imageUrl: z.string().url().optional(),
    altText: z.string().max(200).optional(),
    sortOrder: z.coerce.number().int().min(0).default(0),
    isPrimary: z.boolean().default(false),
  }),
});

// Delete product - Optimized with preprocessing
export const deleteProductSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^prod-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid product ID' })
    )
  }),
});

// Bulk update products
export const bulkProductUpdateSchema = z.object({
  body: z.object({
    productIds: z.array(z.coerce.number().int().positive()).min(1).max(100),
    updates: z.object({
      isActive: z.boolean().optional(),
      featured: z.boolean().optional(),
      categoryId: z.coerce.number().int().positive().optional(),
      priceAdjustment: z.object({
        type: z.enum(['percentage', 'fixed']),
        value: z.coerce.number(),
      }).optional(),
    }),
  }),
});

// Bulk update stock
export const bulkStockUpdateSchema = z.object({
  body: z.object({
    updates: z.array(z.object({
      productId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int(),
      operation: z.enum(['set', 'add', 'subtract']).default('set'),
    })).min(1).max(100),
  }),
});

export default {
  productFiltersSchema,
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  getProductBySlugSchema,
  deleteProductSchema,
  bulkProductUpdateSchema,
  productAttributeSchema,
  productImageSchema,
  bulkStockUpdateSchema,
};
