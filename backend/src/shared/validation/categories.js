import { z } from 'zod';
import { paginationSchema, idParamSchema, slugParamSchema, bilingualFieldSchema, bilingualFieldOptionalSchema } from './common.js';

/**
 * Category validation schemas
 */

// Get categories
export const getCategoriesSchema = z.object({
  query: z.object({
    includeDeleted: z.coerce.boolean().optional(),
    onlyDeleted: z.coerce.boolean().optional(),
    tree: z.coerce.boolean().optional(),
    search: z.string().max(200).optional(),
    parentId: z.coerce.number().int().positive().nullable().optional(),
    includeChildren: z.coerce.boolean().default(false),
    includeProductCount: z.coerce.boolean().default(false),
    ...paginationSchema.shape,
  }),
});

// Get category by ID or slug
export const getCategorySchema = z.object({
  params: z.union([idParamSchema, slugParamSchema]),
});

// Create category (Admin)
export const createCategorySchema = z.object({
  body: z.object({
    // Bilingual name field - accepts both string and {fr, ar} object
    name: bilingualFieldSchema(2, 100),
    category_name: bilingualFieldSchema(2, 100).optional(), // Alternative field name
    slug: z.string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only')
      .optional(),
    // Bilingual description field
    description: bilingualFieldOptionalSchema(500),
    parentId: z.coerce.number().int().positive().nullable().optional(),
    parent_category_id: z.coerce.number().int().positive().nullable().optional(), // Alternative field name
    image: z.string().url().optional(),
    icon: z.string().max(50).optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).default(0),
    metaTitle: z.string().max(60).optional(),
    metaDescription: z.string().max(160).optional(),
  }),
});

// Update category (Admin)
export const updateCategorySchema = z.object({
  params: idParamSchema,
  body: z.object({
    // Bilingual name field - accepts both string and {fr, ar} object
    name: bilingualFieldSchema(2, 100).optional(),
    category_name: bilingualFieldSchema(2, 100).optional(), // Alternative field name
    slug: z.string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    // Bilingual description field
    description: bilingualFieldOptionalSchema(500),
    parentId: z.coerce.number().int().positive().nullable().optional(),
    parent_category_id: z.coerce.number().int().positive().nullable().optional(), // Alternative field name
    image: z.string().url().optional(),
    icon: z.string().max(50).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    metaTitle: z.string().max(60).optional(),
    metaDescription: z.string().max(160).optional(),
  }),
});

// Delete category (Admin)
export const deleteCategorySchema = z.object({
  params: idParamSchema,
  query: z.object({
    moveProductsTo: z.coerce.number().int().positive().optional(),
    deleteProducts: z.coerce.boolean().default(false),
  }),
});

// Reorder categories (Admin)
export const reorderCategoriesSchema = z.object({
  body: z.object({
    categories: z.array(z.object({
      id: z.coerce.number().int().positive(),
      sortOrder: z.coerce.number().int().min(0),
    })).min(1),
  }),
});

export default {
  getCategoriesSchema,
  getCategorySchema,
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema,
  reorderCategoriesSchema,
};
