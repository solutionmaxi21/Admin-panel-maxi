import { z } from 'zod';
import { paginationSchema, idParamSchema, priceSchema, phoneSchema } from './common.js';

/**
 * Supplier validation schemas
 */

// Get suppliers
export const getSuppliersSchema = z.object({
  query: z.object({
    includeDeleted: z.coerce.boolean().optional(),
    onlyDeleted: z.coerce.boolean().optional(),
    status: z.enum(['active', 'inactive', 'pending']).optional(),
    search: z.string().max(100).optional(),
    sortBy: z.enum(['name', 'createdAt', 'totalOrders']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    ...paginationSchema.shape,
  }),
});

// Get supplier by ID
export const getSupplierSchema = z.object({
  params: idParamSchema,
});

// Create supplier
export const createSupplierSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Supplier name must be at least 2 characters').max(255),
    contact_email: z.string().trim().email('Invalid email address').min(1, 'Email is required'),
    contact_phone: z.string().trim().max(20).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
  }),
});

// Update supplier
export const updateSupplierSchema = z.object({
  params: idParamSchema,
  body: z.object({
    name: z.string().trim().min(2).max(255).optional(),
    contact_email: z.string().trim().email('Invalid email address').optional(),
    contact_phone: z.string().trim().max(20).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
  }),
});

// Delete supplier
export const deleteSupplierSchema = z.object({
  params: idParamSchema,
});

// Create purchase order
export const createPurchaseOrderSchema = z.object({
  body: z.object({
    supplierId: z.coerce.number().int().positive(),
    items: z.array(z.object({
      productId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1),
      unitPrice: priceSchema,
    })).min(1, 'At least one item is required'),
    expectedDeliveryDate: z.string().datetime().optional(),
    shippingAddress: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
  }),
});

// Update purchase order status
export const updatePurchaseOrderSchema = z.object({
  params: idParamSchema,
  body: z.object({
    status: z.enum(['draft', 'sent', 'confirmed', 'shipped', 'received', 'cancelled']),
    notes: z.string().max(1000).optional(),
    receivedItems: z.array(z.object({
      productId: z.coerce.number().int().positive(),
      quantityReceived: z.coerce.number().int().min(0),
      notes: z.string().max(200).optional(),
    })).optional(),
  }),
});

export default {
  getSuppliersSchema,
  getSupplierSchema,
  createSupplierSchema,
  updateSupplierSchema,
  deleteSupplierSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
};
