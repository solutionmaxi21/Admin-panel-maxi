import { z } from 'zod';
import { paginationSchema, idParamSchema } from './common.js';

/**
 * Review validation schemas
 */

// Create review
export const createReviewSchema = z.object({
  body: z.object({
    productId: z.coerce.number().int().positive(),
    rating: z.coerce.number().int().min(1).max(5),
    title: z.string().min(3).max(100).optional(),
    reviewTitle: z.string().min(3).max(100).optional(),
    comment: z.string().min(10, 'Review must be at least 10 characters').max(2000).optional(),
    reviewText: z.string().min(10, 'Review must be at least 10 characters').max(2000).optional(),
  }).refine(data => data.comment || data.reviewText, {
    message: 'Review text is required (either comment or reviewText)',
  }),
});

// Update review
export const updateReviewSchema = z.object({
  params: idParamSchema,
  body: z.object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    title: z.string().min(3).max(100).optional(),
    comment: z.string().min(10).max(2000).optional(),
  }),
});

// Get reviews for product
export const getProductReviewsSchema = z.object({
  params: z.object({
    productId: z.coerce.number().int().positive(),
  }),
  query: z.object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    sortBy: z.enum(['createdAt', 'rating', 'helpful']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    ...paginationSchema.shape,
  }),
});

// Admin: Moderate review
export const moderateReviewSchema = z.object({
  params: idParamSchema,
  body: z.object({
    status: z.enum(['approved', 'rejected', 'pending']),
    moderationNote: z.string().max(500).optional(),
  }),
});

// Mark review as helpful
export const markHelpfulSchema = z.object({
  params: idParamSchema,
});

// Get all reviews (Admin)
export const getReviewsSchema = z.object({
  query: z.object({
    includeDeleted: z.coerce.boolean().optional(),
    onlyDeleted: z.coerce.boolean().optional(),
    search: z.string().max(100).optional(),
    status: z.enum(['approved', 'rejected', 'pending', 'all']).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    verified: z.enum(['true', 'false']).optional(),
    productId: z.coerce.number().int().positive().optional(),
    sortBy: z.enum(['createdAt', 'rating', 'helpfulCount', 'updatedAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    ...paginationSchema.shape,
  }),
});

// Get single review (Admin) - accepts both numeric ID and "rev-XXX" format
// Get single review (Admin) - Optimized with preprocessing
export const getReviewSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^rev-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid review ID' })
    )
  }),
});

// Update review status (Admin) - Optimized with preprocessing
export const updateReviewStatusSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^rev-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid review ID' })
    )
  }),
  body: z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
  }),
});

// Delete review (Admin) - Optimized with preprocessing
export const deleteReviewSchema = z.object({
  params: z.object({
    id: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const match = val.match(/^rev-(\d+)$/);
          if (match) return parseInt(match[1], 10);
          const num = parseInt(val, 10);
          if (!isNaN(num)) return num;
        }
        return val;
      },
      z.number().int().positive({ message: 'Invalid review ID' })
    )
  }),
});

export default {
  createReviewSchema,
  updateReviewSchema,
  getProductReviewsSchema,
  moderateReviewSchema,
  markHelpfulSchema,
  getReviewsSchema,
  getReviewSchema,
  updateReviewStatusSchema,
  deleteReviewSchema,
};
