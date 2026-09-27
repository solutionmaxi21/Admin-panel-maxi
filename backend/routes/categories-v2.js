import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import { getCategoriesSchema, getCategorySchema, createCategorySchema, updateCategorySchema, deleteCategorySchema } from '../src/shared/validation/index.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ConflictError } from '../src/shared/errors/index.js';
import { generateBilingualSlug } from '../src/shared/utils/index.js';
import { categoryUpload } from '../src/shared/middleware/categoryUpload.js';
import CacheManager from '../src/services/cacheManager.js';
import db from '../src/db/postgres.js';

const router = express.Router();

async function ensureCategoriesIdSequenceAligned() {
  // If categories.id is SERIAL/BIGSERIAL, this prevents duplicate key errors after manual inserts/deletes.
  // Sets sequence to MAX(id), so nextval() yields MAX(id)+1.
  await db.query(
    "SELECT setval(pg_get_serial_sequence('categories','id'), COALESCE((SELECT MAX(id) FROM categories), 0), true)"
  );
}

const coerceCategoryUploadRelativePath = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // If full URL, extract pathname
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname) return coerceCategoryUploadRelativePath(parsed.pathname);
  } catch {
    // ignore
  }

  if (trimmed.startsWith('/uploads/categories/')) return trimmed;

  // Legacy/defensive: bare filename
  const filenameMatch = trimmed.match(/(category-\d+-\d+\.(png|jpe?g|webp|gif))$/i);
  if (filenameMatch) {
    return `/uploads/categories/${filenameMatch[1]}`;
  }

  return trimmed;
};

const toPublicUrl = (req, relativePath) => {
  if (!relativePath || typeof relativePath !== 'string') return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  if (!relativePath.startsWith('/')) return relativePath;
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3001';
  return `${protocol}://${host}${relativePath}`;
};

// Helper to build category tree
function buildCategoryTree(categories) {
  const categoryMap = {};
  const tree = [];

  categories.forEach(cat => {
    categoryMap[cat.id] = { ...cat, children: [] };
  });

  categories.forEach(cat => {
    if (cat.parent_category_id === null) {
      tree.push(categoryMap[cat.id]);
    } else if (categoryMap[cat.parent_category_id]) {
      categoryMap[cat.parent_category_id].children.push(categoryMap[cat.id]);
    }
  });

  return tree;
}

// Helper to get category with product count
async function enrichCategoryWithStats(category) {
  const productCount = await db.queryOne(
    'SELECT COUNT(*) as count FROM products WHERE category_id = $1 AND deleted_at IS NULL',
    [category.id]
  );

  return {
    ...category,
    product_count: parseInt(productCount.count)
  };
}

// GET /api/categories - List all categories
router.get('/', validate(getCategoriesSchema), asyncHandler(async (req, res) => {
  const { tree, includeDeleted, search } = req.query;

  let query = `
    SELECT 
      c.*,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) as product_count
    FROM categories c
  `;
  const conditions = [];
  const params = [];

  if (includeDeleted !== 'true') {
    conditions.push('c.deleted_at IS NULL');
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      c.category_name->>'fr' ILIKE $${params.length} OR 
      c.category_name->>'ar' ILIKE $${params.length} OR 
      c.category_name->>'en' ILIKE $${params.length}
    )`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY c.id ASC';

  let categories = await db.queryMany(query, params);

  // Transform to match expected format
  categories = categories.map(cat => ({
    category_id: cat.id,
    id: cat.id,
    category_name: cat.category_name,
    category_slug: cat.category_slug,
    parent_category_id: cat.parent_category_id,
    description: cat.description,
    category_image: cat.category_image,
    category_image_url: toPublicUrl(req, cat.category_image),
    level: cat.level,
    product_count: parseInt(cat.product_count) || 0,
    created_at: cat.created_at
  }));

  if (tree === 'true') {
    const treeData = buildCategoryTree(categories);
    return res.json(treeData);
  }

  res.json(categories);
}));

// GET /api/categories/trash - List deleted categories (admin only)
router.get('/trash', authenticateToken, requireAdmin, validate(getCategoriesSchema), asyncHandler(async (req, res) => {
  const { tree, search } = req.query;

  let query = `
    SELECT 
      c.*,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) as product_count
    FROM categories c
  `;

  const conditions = ['c.deleted_at IS NOT NULL'];
  const params = [];
  let paramCount = 1;

  if (search) {
    conditions.push(`(
      c.category_name::text ILIKE $${paramCount} OR
      c.category_slug ILIKE $${paramCount}
    )`);
    params.push(`%${search}%`);
    paramCount++;
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ' ORDER BY c.created_at DESC';

  const rows = await db.queryMany(query, params);

  // If tree requested, reuse the existing tree builder by calling the public endpoint logic would be more complex;
  // For Trash, a flat list is sufficient and safer.
  if (tree === true) {
    // Keep behavior simple: still return flat list.
  }

  const mapped = rows.map(row => ({
    ...row,
    id: row.id,
    category_id: row.id,
    product_count: parseInt(row.product_count || 0)
  }));

  res.json(mapped);
}));

// GET /api/categories/stats - Get category statistics (admin only)
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const statsQuery = `
    SELECT 
      COUNT(*) as total_categories,
      COUNT(*) as active_categories,
      COUNT(*) FILTER (WHERE parent_category_id IS NULL) as root_categories,
      COUNT(*) FILTER (WHERE parent_category_id IS NOT NULL) as subcategories,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM products p 
        WHERE p.category_id = categories.id 
        AND p.deleted_at IS NULL
      )) as with_products,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM products p 
        WHERE p.category_id = categories.id 
        AND p.deleted_at IS NULL
      )) as empty
    FROM categories
    WHERE deleted_at IS NULL
  `;

  const stats = await db.queryOne(statsQuery);

  res.json({
    total: parseInt(stats.total_categories),
    active: parseInt(stats.active_categories),
    root: parseInt(stats.root_categories),
    root_categories: parseInt(stats.root_categories),
    subcategories: parseInt(stats.subcategories),
    sub_categories: parseInt(stats.subcategories),
    withProducts: parseInt(stats.with_products),
    categories_with_products: parseInt(stats.with_products),
    empty: parseInt(stats.empty),
    empty_categories: parseInt(stats.empty)
  });
}));

/**
 * POST /api/categories/upload
 * Upload category image
 * Admin only
 */
router.post('/upload', authenticateToken, requireAdmin, ...categoryUpload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError([], 'Image file is required');
  }

  const relativePath = `/uploads/categories/${req.file.filename}`;
  const fullUrl = toPublicUrl(req, relativePath);

  res.json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: fullUrl,
      relativePath,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
    }
  });
}));

// GET /api/categories/:id - Get single category
router.get('/:id', validate(getCategorySchema), asyncHandler(async (req, res) => {
  const categoryId = parseInt(req.params.id);

  const category = await db.queryOne(
    'SELECT * FROM categories WHERE id = $1 AND deleted_at IS NULL',
    [categoryId]
  );

  if (!category) {
    throw new NotFoundError('Category not found');
  }

  const enriched = await enrichCategoryWithStats({
    category_id: category.id,
    id: category.id,
    ...category
  });

  res.json({
    ...enriched,
    category_image_url: toPublicUrl(req, enriched.category_image)
  });
}));

// POST /api/categories - Create new category
router.post('/', authenticateToken, requireAdmin, validate(createCategorySchema), asyncHandler(async (req, res) => {
  const {
    name,
    category_name,
    description,
    parentId,
    parent_category_id,
    image,
  } = req.body;

  const categoryName = name || category_name;
  const parentCategoryId = parentId ?? parent_category_id ?? null;
  const categoryImage = coerceCategoryUploadRelativePath(image);

  // Check if parent exists
  if (parentCategoryId) {
    const parent = await db.queryOne('SELECT id, level FROM categories WHERE id = $1 AND deleted_at IS NULL', [parentCategoryId]);
    if (!parent) {
      throw new ValidationError([{ field: 'parentCategoryId', message: 'Parent category not found' }]);
    }
  }

  const slug = generateBilingualSlug(categoryName);
  if (!slug) {
    throw new ValidationError([{ field: 'name', message: 'Category name is required' }]);
  }

  const existingSlug = await db.queryOne(
    'SELECT id FROM categories WHERE category_slug = $1 AND deleted_at IS NULL',
    [slug]
  );
  if (existingSlug) {
    throw new ValidationError([{ field: 'slug', message: 'Category with similar name already exists' }]);
  }

  // Compute level
  let level = 1;
  if (parentCategoryId) {
    const parent = await db.queryOne('SELECT level FROM categories WHERE id = $1 AND deleted_at IS NULL', [parentCategoryId]);
    level = (parent?.level || 0) + 1;
  }

  const query = `
    INSERT INTO categories (
      parent_category_id,
      category_name,
      category_slug,
      description,
      category_image,
      level
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const insertParams = [
    parentCategoryId,
    categoryName,
    slug,
    description || null,
    categoryImage,
    level,
  ];

  let newCategory;
  try {
    newCategory = await db.queryOne(query, insertParams);
  } catch (err) {
    // Handle misaligned SERIAL sequence causing duplicate primary key on insert.
    if (err?.code === '23505' && err?.constraint === 'categories_pkey') {
      await ensureCategoriesIdSequenceAligned();
      newCategory = await db.queryOne(query, insertParams);
    } else {
      throw err;
    }
  }

  // Invalidate metadata caches after category creation
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('categories');

  res.status(201).json({
    category_id: newCategory.id,
    id: newCategory.id,
    ...newCategory,
    category_image_url: toPublicUrl(req, newCategory.category_image)
  });
}));

// PUT /api/categories/:id - Update category
router.put('/:id', authenticateToken, requireAdmin, validate(updateCategorySchema), asyncHandler(async (req, res) => {
  const categoryId = parseInt(req.params.id);
  const {
    name,
    category_name,
    description,
    parentId,
    parent_category_id,
    image,
    slug,
  } = req.body;

  const categoryName = name || category_name;
  const parentCategoryId = parentId ?? parent_category_id;
  const categoryImage = image === undefined ? undefined : coerceCategoryUploadRelativePath(image);

  const category = await db.queryOne(
    'SELECT * FROM categories WHERE id = $1 AND deleted_at IS NULL',
    [categoryId]
  );

  if (!category) {
    throw new NotFoundError('Category not found');
  }

  // Check if trying to set itself as parent
  if (parentCategoryId === categoryId) {
    throw new ValidationError([{ field: 'parentCategoryId', message: 'Category cannot be its own parent' }]);
  }

  // Check if parent exists
  if (parentCategoryId !== undefined && parentCategoryId !== null) {
    const parent = await db.queryOne('SELECT id, level FROM categories WHERE id = $1 AND deleted_at IS NULL', [parentCategoryId]);
    if (!parent) {
      throw new ValidationError([{ field: 'parentCategoryId', message: 'Parent category not found' }]);
    }
  }

  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (categoryName) {
    updates.push(`category_name = $${paramIndex++}`);
    params.push(categoryName);

    const nextSlug = slug || generateBilingualSlug(categoryName);
    if (nextSlug) {
      updates.push(`category_slug = $${paramIndex++}`);
      params.push(nextSlug);
    }
  } else if (slug) {
    updates.push(`category_slug = $${paramIndex++}`);
    params.push(slug);
  }

  if (description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(description);
  }

  if (categoryImage !== undefined) {
    updates.push(`category_image = $${paramIndex++}`);
    params.push(categoryImage);
  }

  if (parentCategoryId !== undefined) {
    updates.push(`parent_category_id = $${paramIndex++}`);
    params.push(parentCategoryId);

    // Update level when parent changes
    let level = 1;
    if (parentCategoryId) {
      const parent = await db.queryOne('SELECT level FROM categories WHERE id = $1 AND deleted_at IS NULL', [parentCategoryId]);
      level = (parent?.level || 0) + 1;
    }
    updates.push(`level = $${paramIndex++}`);
    params.push(level);
  }

  if (updates.length === 0) {
    return res.json({
      category_id: category.id,
      id: category.id,
      ...category
    });
  }

  params.push(categoryId);

  const query = `UPDATE categories SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
  const updated = await db.queryOne(query, params);

  // Invalidate metadata caches after category update
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('categories');

  res.json({
    category_id: updated.id,
    id: updated.id,
    ...updated,
    category_image_url: toPublicUrl(req, updated.category_image)
  });
}));

// DELETE /api/categories/:id - Delete category
router.delete('/:id', authenticateToken, requireAdmin, validate(deleteCategorySchema), asyncHandler(async (req, res) => {
  const categoryId = parseInt(req.params.id);

  const category = await db.queryOne(
    'SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL',
    [categoryId]
  );

  if (!category) {
    throw new NotFoundError('Category not found');
  }

  // Check for products in this category
  const productsInCategory = await db.queryOne(
    'SELECT COUNT(*) as count FROM products WHERE category_id = $1 AND deleted_at IS NULL',
    [categoryId]
  );

  if (parseInt(productsInCategory.count) > 0) {
    throw new ValidationError([{
      field: 'category',
      message: `Cannot delete category with ${productsInCategory.count} active products`
    }]);
  }

  // Check for subcategories
  const subcategories = await db.queryOne(
    'SELECT COUNT(*) as count FROM categories WHERE parent_category_id = $1 AND deleted_at IS NULL',
    [categoryId]
  );

  if (parseInt(subcategories.count) > 0) {
    throw new ValidationError([{
      field: 'category',
      message: `Cannot delete category with ${subcategories.count} subcategories`
    }]);
  }

  await db.query('UPDATE categories SET deleted_at = NOW() WHERE id = $1', [categoryId]);

  // Invalidate metadata caches after category deletion
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('categories');

  res.json({ success: true, message: 'Category deleted successfully' });
}));

// POST /api/categories/:id/restore - Restore category from trash
router.post('/:id/restore', authenticateToken, requireAdmin, validate(getCategorySchema), asyncHandler(async (req, res) => {
  const categoryId = parseInt(req.params.id);
  if (Number.isNaN(categoryId)) {
    throw new ValidationError([{ field: 'id', message: 'Invalid category id' }]);
  }

  const category = await db.queryOne('SELECT id, category_slug, deleted_at FROM categories WHERE id = $1', [categoryId]);
  if (!category) throw new NotFoundError('Category not found');
  if (!category.deleted_at) {
    return res.json({ success: true, message: 'Category is already active' });
  }

  const conflict = await db.queryOne(
    'SELECT id FROM categories WHERE category_slug = $1 AND id != $2 AND deleted_at IS NULL',
    [category.category_slug, categoryId]
  );
  if (conflict) {
    throw new ConflictError('Cannot restore category: an active category with the same slug already exists');
  }

  const restored = await db.queryOne(
    'UPDATE categories SET deleted_at = NULL WHERE id = $1 RETURNING *',
    [categoryId]
  );

  // Invalidate metadata caches after category restoration
  CacheManager.invalidateAllMetadata();
  CacheManager.invalidateStoreCache('categories');

  res.json({
    success: true,
    category: {
      ...restored,
      id: restored.id,
      category_id: restored.id,
      category_image_url: toPublicUrl(req, restored.category_image)
    }
  });
}));

// DELETE /api/categories/:id/hard - Permanently delete category (only from trash)
router.delete('/:id/hard', authenticateToken, requireAdmin, validate(getCategorySchema), asyncHandler(async (req, res) => {
  const categoryId = parseInt(req.params.id);
  if (Number.isNaN(categoryId)) {
    throw new ValidationError([{ field: 'id', message: 'Invalid category id' }]);
  }

  const category = await db.queryOne('SELECT id, deleted_at FROM categories WHERE id = $1', [categoryId]);
  if (!category) throw new NotFoundError('Category not found');
  if (!category.deleted_at) {
    throw new ValidationError([{ field: 'category', message: 'Category must be in trash before permanent deletion' }]);
  }

  const productsCount = await db.queryOne('SELECT COUNT(*) as count FROM products WHERE category_id = $1', [categoryId]);
  if (parseInt(productsCount.count) > 0) {
    throw new ConflictError('Cannot permanently delete category: it is referenced by products');
  }

  const childrenCount = await db.queryOne('SELECT COUNT(*) as count FROM categories WHERE parent_category_id = $1', [categoryId]);
  if (parseInt(childrenCount.count) > 0) {
    throw new ConflictError('Cannot permanently delete category: it has child categories');
  }

  await db.query('DELETE FROM categories WHERE id = $1', [categoryId]);
  res.json({ success: true, message: 'Category permanently deleted' });
}));

export default router;
