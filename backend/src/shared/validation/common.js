import { z } from 'zod';

/**
 * Common validation schemas used across the application
 */

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});

// ID parameter
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Slug parameter
export const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

// Email
export const emailSchema = z.string().email('Invalid email address').max(255);

// Phone (Algerian format)
export const phoneSchema = z.string()
  .regex(/^(\+213|0)(5|6|7)[0-9]{8}$/, 'Invalid Algerian phone number')
  .optional();

// Price (in centimes to avoid floating point issues)
export const priceSchema = z.coerce.number().int().min(0);

// Sort order
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

// Date range
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'Start date must be before end date' }
);

// Search schema
export const searchSchema = z.object({
  q: z.string().min(1).max(200).optional(),
  search: z.string().min(1).max(200).optional(),
});

// Address schema (Algerian)
export const addressSchema = z.object({
  streetAddress: z.string().min(5).max(500),
  city: z.string().min(2).max(100),
  stateProvince: z.string().min(2).max(100), // Wilaya
  postalCode: z.string().regex(/^[0-9]{5}$/, 'Invalid postal code').optional(),
  country: z.string().default('Algeria'),
  isDefault: z.boolean().default(false),
});

// Bilingual field schema (supports both legacy string and new {fr, ar} format)
// Used for translatable text fields like category names, descriptions, etc.
export const bilingualFieldSchema = (minLength = 1, maxLength = 255) => z.union([
  // Legacy string format (backward compatibility)
  z.string().min(minLength).max(maxLength),
  // New bilingual object format
  z.object({
    fr: z.string().min(minLength).max(maxLength),
    ar: z.string().max(maxLength).optional().default('')
  })
]);

// Optional bilingual field (for descriptions, etc.)
export const bilingualFieldOptionalSchema = (maxLength = 500) => z.union([
  z.string().max(maxLength).optional(),
  z.object({
    fr: z.string().max(maxLength).optional().default(''),
    ar: z.string().max(maxLength).optional().default('')
  })
]).optional();

export default {
  paginationSchema,
  idParamSchema,
  slugParamSchema,
  emailSchema,
  phoneSchema,
  priceSchema,
  sortOrderSchema,
  dateRangeSchema,
  searchSchema,
  addressSchema,
  bilingualFieldSchema,
  bilingualFieldOptionalSchema,
};

