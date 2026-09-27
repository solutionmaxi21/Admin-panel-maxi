import { z } from 'zod';
import { paginationSchema, idParamSchema, priceSchema, phoneSchema, addressSchema } from './common.js';

/**
 * Return/Refund validation schemas
 */

// Get returns (Admin)
export const getReturnsSchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled']).optional(),
    type: z.enum(['refund', 'exchange', 'repair']).optional(),
    orderId: z.coerce.number().int().positive().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    search: z.string().max(100).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'amount']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    ...paginationSchema.shape,
  }),
});

// Get return by ID
export const getReturnSchema = z.object({
  params: idParamSchema,
});

// Create return request (Customer)
export const createReturnSchema = z.object({
  body: z.object({
    orderId: z.coerce.number().int().positive(),
    items: z.array(z.object({
      orderItemId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1),
      reason: z.enum([
        'defective',
        'wrong_item',
        'damaged',
        'not_as_described',
        'changed_mind',
        'better_price',
        'other'
      ]),
      description: z.string().min(10, 'Please provide more details').max(1000),
      images: z.array(z.string().url()).max(5).optional(),
    })).min(1, 'At least one item is required'),
    type: z.enum(['refund', 'exchange', 'repair']).default('refund'),
    preferredResolution: z.enum(['original_payment', 'store_credit', 'exchange']).optional(),
    pickupAddress: addressSchema.optional(),
    contactPhone: phoneSchema,
  }),
});

// Update return request (Customer - limited)
export const updateReturnCustomerSchema = z.object({
  params: idParamSchema,
  body: z.object({
    description: z.string().min(10).max(1000).optional(),
    images: z.array(z.string().url()).max(5).optional(),
    pickupAddress: addressSchema.optional(),
    contactPhone: phoneSchema.optional(),
  }),
});

// Process return (Admin)
export const processReturnSchema = z.object({
  params: idParamSchema,
  body: z.object({
    status: z.enum(['approved', 'rejected', 'processing', 'completed', 'cancelled']),
    adminNotes: z.string().max(1000).optional(),
    rejectionReason: z.string().max(500).optional(),
    refundAmount: priceSchema.optional(),
    refundMethod: z.enum(['original_payment', 'store_credit', 'bank_transfer']).optional(),
    restockItems: z.boolean().optional(),
    exchangeProductId: z.coerce.number().int().positive().optional(),
    trackingNumber: z.string().max(100).optional(),
  }).refine((data) => {
    if (data.status === 'rejected' && !data.rejectionReason) {
      return false;
    }
    return true;
  }, {
    message: 'Rejection reason is required when rejecting a return',
    path: ['rejectionReason'],
  }),
});

// Cancel return (Customer/Admin)
export const cancelReturnSchema = z.object({
  params: idParamSchema,
  body: z.object({
    reason: z.string().min(5).max(500),
  }),
});

// Add return note (Admin)
export const addReturnNoteSchema = z.object({
  params: idParamSchema,
  body: z.object({
    note: z.string().min(3).max(1000),
    isInternal: z.boolean().default(true),
  }),
});

// Upload return images (Customer)
export const uploadReturnImagesSchema = z.object({
  params: idParamSchema,
  body: z.object({
    images: z.array(z.string().url()).min(1).max(5),
  }),
});

export default {
  getReturnsSchema,
  getReturnSchema,
  createReturnSchema,
  updateReturnCustomerSchema,
  processReturnSchema,
  cancelReturnSchema,
  addReturnNoteSchema,
  uploadReturnImagesSchema,
};
