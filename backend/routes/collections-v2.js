import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import {
  getCollectionsSchema,
  getCollectionSchema,
  createCollectionSchema,
  updateCollectionSchema,
  deleteCollectionSchema,
  collectionProductsSchema,
  reorderCollectionProductsSchema,
} from '../src/shared/validation/index.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError } from '../src/shared/errors/index.js';
import { generateBilingualSlug } from '../src/shared/utils/index.js';
import { categoryUpload } from '../src/shared/middleware/categoryUpload.js';
import db from '../src/db/postgres.js';

const router = express.Router();

const toPublicUrl = (req, relativePath) => {
  if (!relativePath || typeof relativePath !== 'string') return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  if (!relativePath.startsWith('/')) return relativePath;
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3001';
  return `${protocol}://${host}${relativePath}`;
};

const coerceUploadRelativePath = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname) return coerceUploadRelativePath(parsed.pathname);
  } catch {
    // ignore invalid URL parsing
  }

  if (trimmed.startsWith('/uploads/categories/')) return trimmed;
  return trimmed;
};

const normalizeCollectionRow = (req, row) => ({
  ...row,
  collection_id: row.id,
  collection_name: row.collection_name || { fr: '', ar: '' },
  collection_slug: row.collection_slug,
  description: row.description || { fr: '', ar: '' },
  tagline: row.tagline || { fr: '', ar: '' },
  icon: row.icon || '',
  gradient: row.gradient || '',
  banner_image: toPublicUrl(req, row.banner_image) || '',
  thumbnail_image: toPublicUrl(req, row.thumbnail_image) || '',
  benefits: row.benefits || { fr: [], ar: [] },
  meta_title: row.meta_title || '',
  meta_description: row.meta_description || '',
  banner_image_url: toPublicUrl(req, row.banner_image) || '',
  thumbnail_image_url: toPublicUrl(req, row.thumbnail_image) || '',
  product_count: parseInt(row.product_count || 0),
});

const ensureParentLevel = async (parentCollectionId) => {
  if (!parentCollectionId) return 1;

  const parent = await db.queryOne(
    'SELECT id, level FROM collections WHERE id = $1 AND deleted_at IS NULL',
    [parentCollectionId]
  );

  if (!parent) {
    throw new ValidationError([{ field: 'parentId', message: 'Parent collection not found' }]);
  }

  return parseInt(parent.level, 10) + 1;
};

// GET /api/collections
router.get('/', validate(getCollectionsSchema), asyncHandler(async (req, res) => {
  const { includeDeleted, search, parentId, isActive } = req.query;

  let query = `
    SELECT
      c.*,
      (
        SELECT COUNT(*)
        FROM collection_products cp
        JOIN products p ON p.id = cp.product_id
        WHERE cp.collection_id = c.id
          AND p.deleted_at IS NULL
      ) as product_count
    FROM collections c
  `;

  const conditions = [];
  const params = [];

  if (includeDeleted !== true) {
    conditions.push('c.deleted_at IS NULL');
  }

  if (typeof isActive === 'boolean') {
    params.push(isActive);
    conditions.push(`c.is_active = $${params.length}`);
  }

  if (parentId === null) {
    conditions.push('c.parent_collection_id IS NULL');
  } else if (parentId) {
    params.push(parentId);
    conditions.push(`c.parent_collection_id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      c.collection_name->>'fr' ILIKE $${params.length}
      OR c.collection_name->>'ar' ILIKE $${params.length}
      OR c.collection_slug ILIKE $${params.length}
    )`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ' ORDER BY c.sort_order ASC, c.id ASC';

  const rows = await db.queryMany(query, params);
  res.json(rows.map((row) => normalizeCollectionRow(req, row)));
}));

// GET /api/collections/slug/:slug
router.get('/slug/:slug', validate(getCollectionSchema), asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const row = await db.queryOne(
    `
      SELECT
        c.*,
        (
          SELECT COUNT(*)
          FROM collection_products cp
          JOIN products p ON p.id = cp.product_id
          WHERE cp.collection_id = c.id
            AND p.deleted_at IS NULL
        ) as product_count
      FROM collections c
      WHERE c.collection_slug = $1
        AND c.deleted_at IS NULL
      LIMIT 1
    `,
    [slug]
  );

  if (!row) {
    throw new NotFoundError('Collection not found');
  }

  res.json(normalizeCollectionRow(req, row));
}));

// GET /api/collections/trash — list soft-deleted collections
// IMPORTANT: must be defined BEFORE /:id to avoid Express routing conflicts
router.get('/trash', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { search } = req.query;
  const params = [];
  let query = `
    SELECT
      c.*,
      (
        SELECT COUNT(*)
        FROM collection_products cp
        JOIN products p ON p.id = cp.product_id
        WHERE cp.collection_id = c.id
          AND p.deleted_at IS NULL
      ) as product_count
    FROM collections c
    WHERE c.deleted_at IS NOT NULL
  `;

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (
      c.collection_name->>'fr' ILIKE $${params.length}
      OR c.collection_name->>'ar' ILIKE $${params.length}
      OR c.collection_slug ILIKE $${params.length}
    )`;
  }

  query += ' ORDER BY c.deleted_at DESC';

  const rows = await db.queryMany(query, params);
  res.json(rows.map((row) => normalizeCollectionRow(req, row)));
}));

// GET /api/collections/:id
router.get('/:id', validate(getCollectionSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.queryOne(
    `
      SELECT
        c.*,
        (
          SELECT COUNT(*)
          FROM collection_products cp
          JOIN products p ON p.id = cp.product_id
          WHERE cp.collection_id = c.id
            AND p.deleted_at IS NULL
        ) as product_count
      FROM collections c
      WHERE c.id = $1
        AND c.deleted_at IS NULL
      LIMIT 1
    `,
    [id]
  );

  if (!row) {
    throw new NotFoundError('Collection not found');
  }

  res.json(normalizeCollectionRow(req, row));
}));

// POST /api/collections/upload
router.post('/upload', authenticateToken, requireAdmin, ...categoryUpload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError([], 'Image file is required');
  }

  const relativePath = `/uploads/categories/${req.file.filename}`;

  res.json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: toPublicUrl(req, relativePath),
      relativePath,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
    }
  });
}));

// POST /api/collections
router.post('/', authenticateToken, requireAdmin, validate(createCollectionSchema), asyncHandler(async (req, res) => {
  const {
    name,
    collection_name,
    description,
    tagline,
    icon,
    gradient,
    bannerImage,
    thumbnailImage,
    benefits,
    parentId,
    parent_collection_id,
    sortOrder,
    isActive,
    metaTitle,
    metaDescription,
  } = req.body;

  const collectionName = name || collection_name;
  const parentCollectionId = parentId ?? parent_collection_id ?? null;
  const level = await ensureParentLevel(parentCollectionId);
  const slug = generateBilingualSlug(collectionName);

  if (!slug) {
    throw new ValidationError([{ field: 'name', message: 'Collection name is required' }]);
  }

  const existingSlug = await db.queryOne(
    'SELECT id, deleted_at FROM collections WHERE collection_slug = $1',
    [slug]
  );

  if (existingSlug) {
    const message = existingSlug.deleted_at
      ? 'A collection with a similar name exists in trash. Restore it or choose a different name.'
      : 'Collection with similar name already exists';
    throw new ValidationError([{ field: 'slug', message }]);
  }

  const inserted = await db.queryOne(
    `
      INSERT INTO collections (
        parent_collection_id,
        collection_name,
        collection_slug,
        description,
        tagline,
        icon,
        gradient,
        banner_image,
        thumbnail_image,
        benefits,
        level,
        sort_order,
        is_active,
        meta_title,
        meta_description
      ) VALUES (
        $1, $2::jsonb, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15
      )
      RETURNING *
    `,
    [
      parentCollectionId,
      JSON.stringify(collectionName),
      slug,
      description ? JSON.stringify(description) : null,
      tagline ? JSON.stringify(tagline) : null,
      icon || null,
      gradient || null,
      coerceUploadRelativePath(bannerImage),
      coerceUploadRelativePath(thumbnailImage),
      benefits ? JSON.stringify(benefits) : null,
      level,
      sortOrder ?? 0,
      typeof isActive === 'boolean' ? isActive : true,
      metaTitle || null,
      metaDescription || null,
    ]
  );

  res.status(201).json(normalizeCollectionRow(req, inserted));
}));

// PUT /api/collections/:id
router.put('/:id', authenticateToken, requireAdmin, validate(updateCollectionSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db.queryOne('SELECT * FROM collections WHERE id = $1 AND deleted_at IS NULL', [id]);

  if (!existing) {
    throw new NotFoundError('Collection not found');
  }

  const {
    name,
    collection_name,
    description,
    tagline,
    icon,
    gradient,
    bannerImage,
    thumbnailImage,
    benefits,
    parentId,
    parent_collection_id,
    sortOrder,
    isActive,
    metaTitle,
    metaDescription,
  } = req.body;

  const collectionName = name || collection_name || existing.collection_name;
  const parentCollectionId = parentId ?? parent_collection_id ?? existing.parent_collection_id;
  const slug = generateBilingualSlug(collectionName) || existing.collection_slug;
  const level = await ensureParentLevel(parentCollectionId);

  const slugConflict = await db.queryOne(
    'SELECT id, deleted_at FROM collections WHERE collection_slug = $1 AND id != $2',
    [slug, id]
  );

  if (slugConflict) {
    const message = slugConflict.deleted_at
      ? 'A collection with a similar name exists in trash. Restore it or choose a different name.'
      : 'Collection slug already exists';
    throw new ValidationError([{ field: 'slug', message }]);
  }

  const updated = await db.queryOne(
    `
      UPDATE collections
      SET
        parent_collection_id = $1,
        collection_name = $2::jsonb,
        collection_slug = $3,
        description = $4::jsonb,
        tagline = $5::jsonb,
        icon = $6,
        gradient = $7,
        banner_image = $8,
        thumbnail_image = $9,
        benefits = $10::jsonb,
        level = $11,
        sort_order = $12,
        is_active = $13,
        meta_title = $14,
        meta_description = $15,
        updated_at = NOW()
      WHERE id = $16
      RETURNING *
    `,
    [
      parentCollectionId,
      JSON.stringify(collectionName),
      slug,
      description !== undefined ? (description ? JSON.stringify(description) : null) : existing.description,
      tagline !== undefined ? (tagline ? JSON.stringify(tagline) : null) : existing.tagline,
      icon !== undefined ? icon : existing.icon,
      gradient !== undefined ? gradient : existing.gradient,
      bannerImage !== undefined ? coerceUploadRelativePath(bannerImage) : existing.banner_image,
      thumbnailImage !== undefined ? coerceUploadRelativePath(thumbnailImage) : existing.thumbnail_image,
      benefits !== undefined ? (benefits ? JSON.stringify(benefits) : null) : existing.benefits,
      level,
      sortOrder !== undefined ? sortOrder : existing.sort_order,
      isActive !== undefined ? isActive : existing.is_active,
      metaTitle !== undefined ? metaTitle : existing.meta_title,
      metaDescription !== undefined ? metaDescription : existing.meta_description,
      id,
    ]
  );

  res.json(normalizeCollectionRow(req, updated));
}));


// POST /api/collections/:id/restore — restore a soft-deleted collection
router.post('/:id/restore', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = await db.queryOne('SELECT id FROM collections WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
  if (!existing) {
    throw new NotFoundError('Collection not found in trash');
  }

  await db.query('UPDATE collections SET deleted_at = NULL, is_active = true, updated_at = NOW() WHERE id = $1', [id]);

  res.json({ success: true, message: 'Collection restored successfully' });
}));

// DELETE /api/collections/:id/hard — permanently delete a soft-deleted collection
router.delete('/:id/hard', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = await db.queryOne('SELECT id FROM collections WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
  if (!existing) {
    throw new NotFoundError('Collection not found in trash');
  }

  // Remove product associations first
  await db.query('DELETE FROM collection_products WHERE collection_id = $1', [id]);
  await db.query('DELETE FROM collections WHERE id = $1', [id]);

  res.json({ success: true, message: 'Collection permanently deleted' });
}));

// DELETE /api/collections/:id (soft delete)
router.delete('/:id', authenticateToken, requireAdmin, validate(deleteCollectionSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = await db.queryOne('SELECT id FROM collections WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) {
    throw new NotFoundError('Collection not found');
  }

  await db.query('UPDATE collections SET deleted_at = NOW(), is_active = false WHERE id = $1', [id]);

  res.json({
    success: true,
    message: 'Collection deleted successfully'
  });
}));

// GET /api/collections/:id/products
router.get('/:id/products', validate(getCollectionSchema), asyncHandler(async (req, res) => {
  const collectionId = parseInt(req.params.id, 10);

  const collection = await db.queryOne('SELECT id FROM collections WHERE id = $1 AND deleted_at IS NULL', [collectionId]);
  if (!collection) {
    throw new NotFoundError('Collection not found');
  }

  const products = await db.queryMany(
    `
      SELECT
        p.*, cp.sort_order as collection_sort_order,
        c.category_name,
        c.category_slug,
        (
          SELECT json_agg(json_build_object('image_url', pi2.image_url, 'image_type', pi2.image_type) ORDER BY pi2.display_order)
          FROM product_images pi2
          WHERE pi2.product_id = p.id
          LIMIT 3
        ) as images
      FROM collection_products cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE cp.collection_id = $1
        AND p.deleted_at IS NULL
      ORDER BY cp.sort_order ASC, cp.id ASC
    `,
    [collectionId]
  );

  res.json({ products });
}));

// POST /api/collections/:id/products
router.post('/:id/products', authenticateToken, requireAdmin, validate(collectionProductsSchema), asyncHandler(async (req, res) => {
  const collectionId = parseInt(req.params.id, 10);
  const { productIds } = req.body;

  const collection = await db.queryOne('SELECT id FROM collections WHERE id = $1 AND deleted_at IS NULL', [collectionId]);
  if (!collection) {
    throw new NotFoundError('Collection not found');
  }

  for (const productId of productIds) {
    await db.query(
      `
        INSERT INTO collection_products (collection_id, product_id)
        VALUES ($1, $2)
        ON CONFLICT (collection_id, product_id) DO NOTHING
      `,
      [collectionId, productId]
    );
  }

  res.json({
    success: true,
    message: 'Products added to collection successfully'
  });
}));

// DELETE /api/collections/:id/products
router.delete('/:id/products', authenticateToken, requireAdmin, validate(collectionProductsSchema), asyncHandler(async (req, res) => {
  const collectionId = parseInt(req.params.id, 10);
  const { productIds } = req.body;

  await db.query(
    'DELETE FROM collection_products WHERE collection_id = $1 AND product_id = ANY($2::int[])',
    [collectionId, productIds]
  );

  res.json({
    success: true,
    message: 'Products removed from collection successfully'
  });
}));

// PUT /api/collections/:id/products/reorder
router.put('/:id/products/reorder', authenticateToken, requireAdmin, validate(reorderCollectionProductsSchema), asyncHandler(async (req, res) => {
  const collectionId = parseInt(req.params.id, 10);
  const { items } = req.body;

  const client = await db.beginTransaction();
  try {
    for (const item of items) {
      await client.query(
        `
          UPDATE collection_products
          SET sort_order = $1
          WHERE collection_id = $2 AND product_id = $3
        `,
        [item.sortOrder, collectionId, item.productId]
      );
    }
    await db.commit(client);
  } catch (error) {
    await db.rollback(client);
    throw error;
  }

  res.json({
    success: true,
    message: 'Collection products reordered successfully'
  });
}));

export default router;
