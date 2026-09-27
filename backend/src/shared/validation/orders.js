// validation/orders.js - FIXED VERSION
import { z } from 'zod';
import { paginationSchema, priceSchema, addressSchema, sortOrderSchema } from './common.js';

/**
 * Order validation schemas
 */

// Order status enum
export const orderStatusEnum = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);

// Payment status enum
export const paymentStatusEnum = z.enum([
  'pending',
  'paid',
  'failed',
  'refunded',
]);

// Payment method enum (Algeria-specific)
export const paymentMethodEnum = z.enum([
  'cod', // Cash on Delivery
  'cib', // CIB card
  'edahabia', // EDAHABIA card
  'bank_transfer',
]);

// Order item
const orderItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(100),
  price: priceSchema.optional(), // Price at time of order
});

// FIXED: Custom ID parameter schema for orders that accepts both numeric and order number format
const orderIdParamSchema = z.object({
  id: z.string().refine(
    (val) => {
      // Accept numeric strings (e.g., "123")
      if (/^\d+$/.test(val)) return true;
      // Accept order number format (e.g., "ORD-000123")
      if (/^ORD-\d+$/.test(val)) return true;
      return false;
    },
    { message: 'Invalid order ID format. Must be numeric or in format ORD-XXXXXX' }
  ),
});

// Create order (customer checkout)
export const createOrderSchema = z.object({
  body: z.object({
    // Contact info
    email: z.string().email(),
    phone: z.string().min(10).max(20),
    
    // Shipping address
    shippingAddress: addressSchema,
    
    // Billing address (optional, defaults to shipping)
    billingAddress: addressSchema.optional(),
    
    // Order items
    items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
    
    // Payment
    paymentMethod: paymentMethodEnum,
    
    // Optional fields
    customerNotes: z.string().max(1000).optional(),
    couponCode: z.string().max(50).optional(),
  }),
});

// Update order status (admin)
export const updateOrderStatusSchema = z.object({
  params: orderIdParamSchema, // FIXED: Use custom schema
  body: z.object({
    status: orderStatusEnum,
    notes: z.string().max(500).optional(),
  }),
});

// Update payment status (admin)
export const updatePaymentStatusSchema = z.object({
  params: orderIdParamSchema, // FIXED: Use custom schema
  body: z.object({
    paymentStatus: paymentStatusEnum,
    transactionId: z.string().max(100).optional(),
    notes: z.string().max(500).optional(),
  }),
});

// Get orders (admin listing)
export const getOrdersSchema = z.object({
  query: z.object({
    status: orderStatusEnum.optional(),
    paymentStatus: paymentStatusEnum.optional(),
    userId: z.coerce.number().int().positive().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    minTotal: z.coerce.number().min(0).optional(),
    maxTotal: z.coerce.number().min(0).optional(),
    search: z.string().max(100).optional(), // Search by order number, customer name, email
    sortBy: z.enum(['createdAt', 'total', 'status']).default('createdAt'),
    sortOrder: sortOrderSchema,
    ...paginationSchema.shape,
  }),
});

// Get single order - FIXED
export const getOrderSchema = z.object({
  params: orderIdParamSchema, // FIXED: Use custom schema instead of idParamSchema
});

// Cancel order
export const cancelOrderSchema = z.object({
  params: orderIdParamSchema, // FIXED: Use custom schema
  body: z.object({
    reason: z.string().min(10, 'Please provide a reason for cancellation').max(500),
  }),
});

// Add tracking info
export const addTrackingSchema = z.object({
  params: orderIdParamSchema, // FIXED: Use custom schema
  body: z.object({
    carrier: z.string().min(2).max(100),
    trackingNumber: z.string().min(5).max(100),
    estimatedDelivery: z.coerce.date().optional(),
  }),
});

export default {
  orderStatusEnum,
  paymentStatusEnum,
  paymentMethodEnum,
  createOrderSchema,
  updateOrderStatusSchema,
  updatePaymentStatusSchema,
  getOrdersSchema,
  getOrderSchema,
  cancelOrderSchema,
  addTrackingSchema,
};