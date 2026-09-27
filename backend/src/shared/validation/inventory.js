import { z } from 'zod';
import { paginationSchema, idParamSchema, priceSchema } from './common.js';

/**
 * Inventory validation schemas
 */

// Get stock items
export const getStockSchema = z.object({
  query: z.object({
    warehouseId: z.coerce.number().int().positive().optional(),
    productId: z.coerce.number().int().positive().optional(),
    lowStock: z.coerce.boolean().optional(),
    outOfStock: z.coerce.boolean().optional(),
    search: z.string().max(100).optional(),
    sortBy: z.enum(['quantity', 'productName', 'lastUpdated']).default('lastUpdated'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    ...paginationSchema.shape,
  }),
});

// Update stock
export const updateStockSchema = z.object({
  params: idParamSchema,
  body: z.object({
    quantity: z.coerce.number().int().min(0),
    reason: z.string().min(3).max(200),
    type: z.enum(['adjustment', 'restock', 'damage', 'return', 'sale', 'transfer']),
    notes: z.string().max(500).optional(),
  }),
});

// Add stock (Admin)
export const addStockSchema = z.object({
  body: z.object({
    productId: z.coerce.number().int().positive(),
    warehouseId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
    costPrice: priceSchema.optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    batchNumber: z.string().max(50).optional(),
    expiryDate: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
  }),
});

// Transfer stock between warehouses
export const transferStockSchema = z.object({
  body: z.object({
    productId: z.coerce.number().int().positive(),
    fromWarehouseId: z.coerce.number().int().positive(),
    toWarehouseId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1),
    notes: z.string().max(500).optional(),
  }).refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: 'Cannot transfer to the same warehouse',
    path: ['toWarehouseId'],
  }),
});

// Bulk stock update
export const bulkStockUpdateSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      productId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(0),
      warehouseId: z.coerce.number().int().positive().optional(),
    })).min(1, 'At least one item is required').max(100, 'Maximum 100 items per bulk update'),
    reason: z.string().min(3).max(200),
    type: z.enum(['adjustment', 'restock', 'damage']),
  }),
});

// Get stock history
export const getStockHistorySchema = z.object({
  params: z.object({
    productId: z.coerce.number().int().positive(),
  }),
  query: z.object({
    warehouseId: z.coerce.number().int().positive().optional(),
    type: z.enum(['adjustment', 'restock', 'damage', 'return', 'sale', 'transfer']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    ...paginationSchema.shape,
  }),
});

// Warehouse schemas
export const getWarehousesSchema = z.object({
  query: z.object({
    isActive: z.coerce.boolean().optional(),
    ...paginationSchema.shape,
  }),
});

export const createWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/),
    address: z.string().min(5).max(200),
    city: z.string().min(2).max(100),
    wilaya: z.string().min(2).max(100),
    phone: z.string().max(20).optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  }),
});

export const updateWarehouseSchema = z.object({
  params: idParamSchema,
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    address: z.string().min(5).max(200).optional(),
    city: z.string().min(2).max(100).optional(),
    wilaya: z.string().min(2).max(100).optional(),
    phone: z.string().max(20).optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  }),
});

export default {
  getStockSchema,
  updateStockSchema,
  addStockSchema,
  transferStockSchema,
  bulkStockUpdateSchema,
  getStockHistorySchema,
  getWarehousesSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
};
