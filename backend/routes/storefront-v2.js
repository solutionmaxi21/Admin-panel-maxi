import express from 'express';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError } from '../src/shared/errors/index.js';
import ProductService from '../src/services/productService.js';
import db from '../src/db/postgres.js';

const router = express.Router();

/**
 * GET /api/storefront/products
 * Public endpoint - Get products for storefront with filters
 */
router.get('/products', asyncHandler(async (req, res) => {
  // Parse category - can be ID (number) or slug (string)
  let categoryId = null;
  if (req.query.category) {
    const isNumeric = /^\d+$/.test(req.query.category);
    if (isNumeric) {
      categoryId = parseInt(req.query.category);
    } else {
      // If slug provided, query to find the category ID
      const categoryQuery = `SELECT id FROM categories WHERE category_slug = $1 AND deleted_at IS NULL`;
      const categoryResult = await db.queryOne(categoryQuery, [req.query.category]);
      if (categoryResult) {
        categoryId = categoryResult.id;
      }
    }
  }

  // Parse collection - can be ID (number) or slug (string)
  let collectionId = null;
  if (req.query.collection) {
    const isNumeric = /^\d+$/.test(req.query.collection);
    if (isNumeric) {
      collectionId = parseInt(req.query.collection);
    } else {
      const collectionQuery = `SELECT id FROM collections WHERE collection_slug = $1 AND deleted_at IS NULL AND is_active = true`;
      const collectionResult = await db.queryOne(collectionQuery, [req.query.collection]);
      if (collectionResult) {
        collectionId = collectionResult.id;
      }
    }
  }

  const filters = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    category_id: categoryId,
    collection_id: collectionId,
    min_price: req.query.minPrice ? parseFloat(req.query.minPrice) : null,
    max_price: req.query.maxPrice ? parseFloat(req.query.maxPrice) : null,
    search: req.query.search,
    sort_by: req.query.sortBy === 'price-asc' ? 'current_price' : 
             req.query.sortBy === 'price-desc' ? 'current_price' :
             req.query.sortBy === 'newest' ? 'created_at' :
             req.query.sortBy === 'rating' ? 'average_rating' : 'created_at',
    sort_order: req.query.sortBy === 'price-asc' ? 'ASC' : 'DESC',
    in_stock_only: req.query.inStock === 'true'
  };

  // Brand filter
  if (req.query.brand) {
    filters.brand = req.query.brand;
  }

  const result = await ProductService.getStorefrontProducts(filters);
  
  // Transform to storefront format for compatibility
  const products = result.products.map(p => ({
    product_id: p.id,
    id: p.id,
    product_name: p.product_name,
    brand: p.brand,
    sku: p.sku,
    category_id: p.category_id,
    category_name: p.category_name,
    category_slug: p.category_slug,
    current_price: parseFloat(p.current_price),
    sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
    short_description: p.short_description,
    full_description: p.description || '',
    images: p.images || [],
    total_stock: parseInt(p.total_stock) || 0,
    is_active: p.is_active,
    average_rating: parseFloat(p.average_rating) || 0,
    review_count: parseInt(p.review_count) || 0,
    created_at: p.created_at
  }));

  res.json({
    products,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages
  });
}));

/**
 * GET /api/storefront/products/featured
 * Get featured/top-rated products
 */
router.get('/products/featured', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 8;
  
  const result = await ProductService.getStorefrontProducts({
    limit,
    sort_by: 'average_rating',
    sort_order: 'DESC',
    page: 1
  });

  const products = result.products.map(p => ({
    product_id: p.id,
    id: p.id,
    product_name: p.product_name,
    brand: p.brand,
    sku: p.sku,
    category_id: p.category_id,
    category_name: p.category_name,
    category_slug: p.category_slug,
    current_price: parseFloat(p.current_price),
    sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
    short_description: p.short_description,
    images: p.images || [],
    total_stock: parseInt(p.total_stock) || 0,
    average_rating: parseFloat(p.average_rating) || 0,
    review_count: parseInt(p.review_count) || 0,
    created_at: p.created_at
  }));

  res.json({ products });
}));

/**
 * GET /api/storefront/collections
 * Public endpoint - Active collections for homepage/landing pages
 */
router.get('/collections', asyncHandler(async (req, res) => {
  const rootOnly = req.query.rootOnly === 'true';

  const conditions = ['c.deleted_at IS NULL', 'c.is_active = true'];
  if (rootOnly) {
    conditions.push('c.parent_collection_id IS NULL');
  }

  const query = `
    SELECT
      c.*,
      (
        SELECT COUNT(*)
        FROM collection_products cp
        JOIN products p ON p.id = cp.product_id
        WHERE cp.collection_id = c.id
          AND p.deleted_at IS NULL
          AND p.is_active = true
      ) as product_count
    FROM collections c
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.sort_order ASC, c.id ASC
  `;

  const collections = await db.queryMany(query);
  res.json({ collections });
}));

/**
 * GET /api/storefront/collections/:slug
 * Public endpoint - Collection details + products (paginated)
 */
router.get('/collections/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const collection = await db.queryOne(
    `
      SELECT c.*
      FROM collections c
      WHERE c.collection_slug = $1
        AND c.deleted_at IS NULL
        AND c.is_active = true
      LIMIT 1
    `,
    [slug]
  );

  if (!collection) {
    throw new NotFoundError('Collection not found');
  }

  const productsResult = await ProductService.getStorefrontProducts({
    page,
    limit,
    collection_id: collection.id,
    sort_by: req.query.sortBy === 'price-asc' ? 'current_price' :
      req.query.sortBy === 'price-desc' ? 'current_price' :
      req.query.sortBy === 'newest' ? 'created_at' :
      req.query.sortBy === 'rating' ? 'average_rating' : 'created_at',
    sort_order: req.query.sortBy === 'price-asc' ? 'ASC' : 'DESC',
  });

  const products = productsResult.products.map(p => ({
    product_id: p.id,
    id: p.id,
    product_name: p.product_name,
    brand: p.brand,
    sku: p.sku,
    category_id: p.category_id,
    category_name: p.category_name,
    category_slug: p.category_slug,
    current_price: parseFloat(p.current_price),
    sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
    short_description: p.short_description,
    full_description: p.description || '',
    images: p.images || [],
    total_stock: parseInt(p.total_stock) || 0,
    is_active: p.is_active,
    average_rating: parseFloat(p.average_rating) || 0,
    review_count: parseInt(p.review_count) || 0,
    created_at: p.created_at
  }));

  const children = await db.queryMany(
    `
      SELECT c.*
      FROM collections c
      WHERE c.parent_collection_id = $1
        AND c.deleted_at IS NULL
        AND c.is_active = true
      ORDER BY c.sort_order ASC, c.id ASC
    `,
    [collection.id]
  );

  res.json({
    collection,
    children,
    products,
    total: productsResult.total,
    page: productsResult.page,
    limit: productsResult.limit,
    totalPages: productsResult.totalPages
  });
}));

/**
 * GET /api/storefront/collections/:slug/children
 * Public endpoint - Child collections
 */
router.get('/collections/:slug/children', asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const parent = await db.queryOne(
    'SELECT id FROM collections WHERE collection_slug = $1 AND deleted_at IS NULL AND is_active = true',
    [slug]
  );

  if (!parent) {
    throw new NotFoundError('Collection not found');
  }

  const children = await db.queryMany(
    `
      SELECT c.*
      FROM collections c
      WHERE c.parent_collection_id = $1
        AND c.deleted_at IS NULL
        AND c.is_active = true
      ORDER BY c.sort_order ASC, c.id ASC
    `,
    [parent.id]
  );

  res.json({ children });
}));

/**
 * GET /api/storefront/products/new
 * Get new arrivals
 */
router.get('/products/new', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 8;
  
  const result = await ProductService.getStorefrontProducts({
    limit,
    sort_by: 'created_at',
    sort_order: 'DESC',
    page: 1
  });

  const products = result.products.map(p => ({
    product_id: p.id,
    id: p.id,
    product_name: p.product_name,
    brand: p.brand,
    sku: p.sku,
    category_id: p.category_id,
    category_name: p.category_name,
    category_slug: p.category_slug,
    current_price: parseFloat(p.current_price),
    sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
    short_description: p.short_description,
    images: p.images || [],
    total_stock: parseInt(p.total_stock) || 0,
    average_rating: parseFloat(p.average_rating) || 0,
    review_count: parseInt(p.review_count) || 0,
    created_at: p.created_at
  }));

  res.json({ products });
}));

/**
 * GET /api/storefront/products/:id
 * Get single product details
 */
router.get('/products/:id', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id);
  const product = await ProductService.getProductById(productId);

  if (!product || !product.is_active) {
    throw new NotFoundError('Product not found');
  }

  // Fetch per-variant stock
  const variantStockQuery = `
    SELECT pv.id as variant_id, COALESCE(SUM(s.quantity), 0) as total_stock
    FROM product_variants pv
    LEFT JOIN stock s ON s.variant_id = pv.id
    WHERE pv.product_id = $1 AND pv.deleted_at IS NULL
    GROUP BY pv.id
  `;
  const variantStocks = await db.queryMany(variantStockQuery, [product.id]);
  const stockMap = Object.fromEntries(variantStocks.map(v => [v.variant_id, parseInt(v.total_stock)]));

  // Transform to storefront format
  const transformed = {
    product_id: product.id,
    id: product.id,
    product_name: product.product_name,
    brand: product.brand,
    sku: product.sku,
    category_id: product.category_id,
    category_name: product.category_name,
    category_slug: product.category_slug,
    current_price: parseFloat(product.current_price),
    sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
    short_description: product.short_description,
    full_description: product.description || '',
    images: product.imageObjects || [],
    attributes: product.attributes || [],
    total_stock: parseInt(product.total_stock) || 0,
    is_active: product.is_active,
    average_rating: parseFloat(product.average_rating) || 0,
    review_count: parseInt(product.review_count) || 0,
    created_at: product.created_at,
    warranty_months: product.warranty_months || null,
    variants: (product.variants || [])
      .filter(v => v.is_active)
      .map(v => ({
        id: v.id,
        variant_name: v.variant_name,
        current_price: parseFloat(v.current_price),
        sale_price: v.sale_price ? parseFloat(v.sale_price) : null,
        is_default: v.is_default,
        display_order: v.display_order,
        metadata: v.metadata,
        total_stock: stockMap[v.id] || 0,
      })),
  };

  res.json(transformed);
}));

/**
 * GET /api/storefront/brands
 * Get all unique brands from active products
 */
router.get('/brands', asyncHandler(async (req, res) => {
  const query = `
    SELECT DISTINCT brand
    FROM products
    WHERE brand IS NOT NULL 
      AND brand != ''
      AND deleted_at IS NULL
      AND is_active = true
    ORDER BY brand ASC
  `;

  const result = await db.queryMany(query);
  const brands = result.map(row => row.brand);

  res.json({ brands });
}));

/**
 * GET /api/storefront/brands/top
 * Get top/most-used brands from active products
 */
router.get('/brands/top', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 12;

  const query = `
    SELECT brand, COUNT(*) as product_count
    FROM products
    WHERE brand IS NOT NULL 
      AND brand != ''
      AND deleted_at IS NULL
      AND is_active = true
    GROUP BY brand
    ORDER BY product_count DESC, brand ASC
    LIMIT $1
  `;

  const result = await db.queryMany(query, [limit]);
  const brands = result.map(row => row.brand);

  res.json({ brands });
}));

export default router;
