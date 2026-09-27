import { z } from 'zod';
import { paginationSchema, idParamSchema, slugParamSchema, bilingualFieldSchema, bilingualFieldOptionalSchema } from './common.js';

const benefitsSchema = z.union([
  z.object({
    fr: z.array(z.string().min(1).max(160)).optional().default([]),
    ar: z.array(z.string().min(1).max(160)).optional().default([])
  }),
  z.array(z.string().min(1).max(160)).optional()
]).optional();

export const getCollectionsSchema = z.object({
  query: z.object({
    includeDeleted: z.coerce.boolean().optional(),
    tree: z.coerce.boolean().optional(),
    search: z.string().max(200).optional(),
    parentId: z.coerce.number().int().positive().nullable().optional(),
    isActive: z.coerce.boolean().optional(),
    ...paginationSchema.shape,
  }),
});

export const getCollectionSchema = z.object({
  params: z.union([idParamSchema, slugParamSchema]),
});

export const createCollectionSchema = z.object({
  body: z.object({
    name: bilingualFieldSchema(2, 120),
    collection_name: bilingualFieldSchema(2, 120).optional(),
    slug: z.string().min(2).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    description: bilingualFieldOptionalSchema(1000),
    tagline: bilingualFieldOptionalSchema(250),
    icon: z.string().max(100).optional(),
    gradient: z.string().max(200).optional(),
    bannerImage: z.string().max(500).optional(),
    thumbnailImage: z.string().max(500).optional(),
    benefits: benefitsSchema,
    parentId: z.coerce.number().int().positive().nullable().optional(),
    parent_collection_id: z.coerce.number().int().positive().nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    metaTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(160).optional(),
  }),
});

export const updateCollectionSchema = z.object({
  params: idParamSchema,
  body: z.object({
    name: bilingualFieldSchema(2, 120).optional(),
    collection_name: bilingualFieldSchema(2, 120).optional(),
    slug: z.string().min(2).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    description: bilingualFieldOptionalSchema(1000),
    tagline: bilingualFieldOptionalSchema(250),
    icon: z.string().max(100).optional(),
    gradient: z.string().max(200).optional(),
    bannerImage: z.string().max(500).optional(),
    thumbnailImage: z.string().max(500).optional(),
    benefits: benefitsSchema,
    parentId: z.coerce.number().int().positive().nullable().optional(),
    parent_collection_id: z.coerce.number().int().positive().nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    metaTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(160).optional(),
  }),
});

export const deleteCollectionSchema = z.object({
  params: idParamSchema,
});

export const collectionProductsSchema = z.object({
  params: idParamSchema,
  body: z.object({
    productIds: z.array(z.coerce.number().int().positive()).min(1),
  }),
});

export const reorderCollectionProductsSchema = z.object({
  params: idParamSchema,
  body: z.object({
    items: z.array(z.object({
      productId: z.coerce.number().int().positive(),
      sortOrder: z.coerce.number().int().min(0),
    })).min(1),
  }),
});

export default {
  getCollectionsSchema,
  getCollectionSchema,
  createCollectionSchema,
  updateCollectionSchema,
  deleteCollectionSchema,
  collectionProductsSchema,
  reorderCollectionProductsSchema,
};
