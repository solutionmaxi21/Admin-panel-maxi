/**
 * Product Service Layer
 * Handles all product-related database operations with security and performance optimizations
 */

import db from '../db/postgres.js';
import { ValidationError, NotFoundError, ConflictError } from '../shared/errors/index.js';
import CacheManager from './cacheManager.js';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_BACKEND_URL = 'http://localhost:3001';

const coerceProductUploadRelativePath = (value) => {
  if (!value) return null;

  // If it's an absolute URL, extract pathname.
  let pathname = value;
  try {
    const parsed = new URL(value);
    pathname = parsed.pathname;
  } catch {
    // Not a URL; treat as path.
  }

  // Only normalize our uploads paths.
  if (!pathname.startsWith('/uploads/')) {
    return value;
  }

  // Canonical location for product uploads.
  if (pathname.startsWith('/uploads/products/')) {
    return pathname;
  }

  // Legacy: /uploads/<product-...> should be /uploads/products/<product-...>
  const filename = pathname.split('/').pop();
  if (filename && filename.startsWith('product-')) {
    return `/uploads/products/${filename}`;
  }

  return pathname;
};

const toPublicImageUrl = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('http')) return value;

  const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
  const relative = coerceProductUploadRelativePath(value);

  if (relative && typeof relative === 'string' && relative.startsWith('/uploads/')) {
    // Attempt to locate the file in multiple common locations
    const cleaned = relative.replace(/^\//, '');
    const possiblePaths = [
      path.join(process.cwd(), 'backend', cleaned),
      path.join(process.cwd(), cleaned),
      path.resolve(__dirname, '../../', cleaned) // Assuming we are in src/services
    ];

    try {
      let exists = false;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          exists = true;
          break;
        }
      }

      if (exists) {
        return `${backendUrl}${relative}`;
      }
    } catch (err) {
      // On error, fall back to base URL anyway as browser might still find it
    }

    // Even if local check fails, return the full URL as 404 is better than nothing
    // or return the placeholder if we are strictly sure it's missing
    return `${backendUrl}${relative}`;
  }
  return relative;
};

class ProductService {
  /**
   * Check if SKU exists (with rate limiting consideration)
   * @param {string} sku - Product SKU to check
   * @param {number} excludeId - Product ID to exclude from check (for updates)
   * @returns {Promise<boolean>}
   */
  async skuExists(sku, excludeId = null) {
    // Parameterized query prevents SQL injection
    const query = excludeId
      ? `SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(sku) = LOWER($1) AND id != $2 AND deleted_at IS NULL)`
      : `SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(sku) = LOWER($1) AND deleted_at IS NULL)`;

    const params = excludeId ? [sku, excludeId] : [sku];
    const result = await db.queryOne(query, params);
    return result.exists;
  }

  /**
   * Get product by ID with all related data (optimized single query with JOINs)
   * @param {number} productId
   * @returns {Promise<object|null>}
   */
  async getProductById(productId) {
    // Single query with JOINs - avoids N+1 problem
    const query = `
      SELECT 
        p.*,
        c.category_name,
        c.category_slug,
        sup.name as supplier_name,
        (
          SELECT jsonb_build_object(
            'warehouse_id', st.warehouse_id,
            'quantity', st.quantity,
            'reorder_level', st.reorder_level
          )
          FROM stock st
          WHERE st.product_id = p.id
          ORDER BY st.id DESC
          LIMIT 1
        ) as stock_entry,
        (
          SELECT json_agg(jsonb_build_object(
            'image_id', pi2.id,
            'image_url', pi2.image_url,
            'url', pi2.image_url,
            'image_type', pi2.image_type,
            'display_order', pi2.display_order
          ) ORDER BY pi2.display_order, pi2.id)
          FROM product_images pi2
          WHERE pi2.product_id = p.id
        ) as images,
        (
          SELECT json_agg(jsonb_build_object(
            'attribute_id', pa2.id,
            'attribute_name', pa2.attribute_name,
            'attribute_value', pa2.attribute_value,
            'attribute_type', pa2.attribute_type,
            'display_order', pa2.display_order
          ) ORDER BY pa2.display_order, pa2.id)
          FROM product_attributes pa2
          WHERE pa2.product_id = p.id
        ) as attributes,
        (
          SELECT json_agg(jsonb_build_object(
            'id', pv.id,
            'variant_name', pv.variant_name,
            'sku', pv.sku,
            'barcode', pv.barcode,
            'cost_price', pv.cost_price,
            'wholesale_price', pv.wholesale_price,
            'current_price', pv.current_price,
            'sale_price', pv.sale_price,
            'weight_kg', pv.weight_kg,
            'is_default', pv.is_default,
            'is_active', pv.is_active,
            'display_order', pv.display_order,
            'metadata', pv.metadata
          ) ORDER BY pv.display_order, pv.id)
          FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
        ) as variants,
        COALESCE((SELECT SUM(st2.quantity) FROM stock st2 WHERE st2.product_id = p.id), 0) as total_stock,
        COALESCE((SELECT AVG(r2.rating) FROM reviews r2 WHERE r2.product_id = p.id AND r2.deleted_at IS NULL), 0) as average_rating,
        (SELECT COUNT(*) FROM reviews r3 WHERE r3.product_id = p.id AND r3.deleted_at IS NULL) as review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
      GROUP BY p.id, c.category_name, c.category_slug, sup.name
    `;

    const product = await db.queryOne(query, [productId]);

    if (!product) return null;

    const parsedTags = Array.isArray(product.tags)
      ? product.tags
      : (product.tags ? product.tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    // Transform to match frontend expectations
    return {
      id: product.id,
      name: product.product_name,
      productName: product.product_name,
      product_name: product.product_name,
      brand: product.brand,
      sku: product.sku,
      serialNumber: product.serial_number,
      serial_number: product.serial_number,
      modelNumber: product.model_number,
      model_number: product.model_number,
      categoryId: product.category_id,
      category_id: product.category_id,
      category: product.category_name,
      categoryName: product.category_name,
      category_name: product.category_name,
      categorySlug: product.category_slug,
      category_slug: product.category_slug,
      supplierId: product.supplier_id,
      supplier_id: product.supplier_id,
      supplier: product.supplier_name,
      supplierName: product.supplier_name,
      supplier_name: product.supplier_name,
      description: product.description,
      shortDescription: product.short_description,
      short_description: product.short_description,
      price: parseFloat(product.current_price),
      currentPrice: parseFloat(product.current_price),
      current_price: parseFloat(product.current_price),
      salePrice: product.sale_price ? parseFloat(product.sale_price) : null,
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      costPrice: product.cost_price ? parseFloat(product.cost_price) : null,
      cost_price: product.cost_price ? parseFloat(product.cost_price) : null,
      wholesalePrice: product.wholesale_price ? parseFloat(product.wholesale_price) : null,
      wholesale_price: product.wholesale_price ? parseFloat(product.wholesale_price) : null,
      weightKg: product.weight_kg,
      weight_kg: product.weight_kg,
      warehouseId: product.stock_entry?.warehouse_id ?? null,
      warehouse_id: product.stock_entry?.warehouse_id ?? null,
      warrantyMonths: product.warranty_months,
      warranty_months: product.warranty_months,
      isActive: product.is_active !== false,
      is_active: product.is_active !== false,
      isFeatured: product.is_featured || false,
      is_featured: product.is_featured || false,
      dimensions: product.dimensions,
      length: product.length_cm,
      width: product.width_cm,
      height: product.height_cm,
      length_cm: product.length_cm,
      width_cm: product.width_cm,
      height_cm: product.height_cm,
      tags: parsedTags,
      metaTitle: product.meta_title,
      length: product.length_cm,
      width: product.width_cm,
      height: product.height_cm,
      length_cm: product.length_cm,
      width_cm: product.width_cm,
      height_cm: product.height_cm,
      meta_title: product.meta_title,
      metaDescription: product.meta_description,
      meta_description: product.meta_description,
      stock: parseInt(product.total_stock) || 0,
      totalStock: parseInt(product.total_stock) || 0,
      total_stock: parseInt(product.total_stock) || 0,
      reorderLevel: product.stock_entry?.reorder_level ?? null,
      reorder_level: product.stock_entry?.reorder_level ?? null,
      averageRating: parseFloat(product.average_rating),
      average_rating: parseFloat(product.average_rating),
      reviewCount: parseInt(product.review_count),
      review_count: parseInt(product.review_count),
      images: (product.images || []).map(img => {
        const imageUrl = img.url || img.image_url;
        console.log('[getProductById] Image URL before conversion:', { imageUrl, startsWithHttp: imageUrl?.startsWith('http') });
        const fullUrl = toPublicImageUrl(imageUrl);
        console.log('[getProductById] Converted image URL:', { imageUrl, fullUrl });
        return fullUrl;
      }).filter(Boolean),
      imageObjects: (product.images || []).map(img => {
        const imageUrl = img.url || img.image_url;
        const fullUrl = toPublicImageUrl(imageUrl);
        return {
          ...img,
          url: fullUrl,
          image_url: fullUrl
        };
      }),
      attributes: product.attributes || [],
      variants: product.variants || [],
      rawAttributes: product.attributes || [],
      specifications: (product.attributes || []).reduce((acc, attr) => {
        // Extract the French name from JSONB for the key
        const nameKey = typeof attr.attribute_name === 'object'
          ? (attr.attribute_name.fr || attr.attribute_name.ar || 'Unknown')
          : attr.attribute_name;
        acc[nameKey] = attr.attribute_value;
        return acc;
      }, {}),
      createdAt: product.created_at,
      created_at: product.created_at,
      updatedAt: product.updated_at,
      updated_at: product.updated_at
    };
  }

  /**
   * Admin-only: Get product by ID including soft-deleted
   * @param {number} productId
   * @returns {Promise<object|null>}
   */
  async getProductByIdAdmin(productId) {
    const query = `
      SELECT 
        p.*,
        c.category_name,
        c.category_slug,
        sup.name as supplier_name,
        (
          SELECT jsonb_build_object(
            'warehouse_id', st.warehouse_id,
            'quantity', st.quantity,
            'reorder_level', st.reorder_level
          )
          FROM stock st
          WHERE st.product_id = p.id
          ORDER BY st.id DESC
          LIMIT 1
        ) as stock_entry,
        (
          SELECT json_agg(jsonb_build_object(
            'image_id', pi2.id,
            'image_url', pi2.image_url,
            'url', pi2.image_url,
            'image_type', pi2.image_type,
            'display_order', pi2.display_order
          ) ORDER BY pi2.display_order, pi2.id)
          FROM product_images pi2
          WHERE pi2.product_id = p.id
        ) as images,
        (
          SELECT json_agg(jsonb_build_object(
            'attribute_id', pa2.id,
            'attribute_name', pa2.attribute_name,
            'attribute_value', pa2.attribute_value,
            'attribute_type', pa2.attribute_type,
            'display_order', pa2.display_order
          ) ORDER BY pa2.display_order, pa2.id)
          FROM product_attributes pa2
          WHERE pa2.product_id = p.id
        ) as attributes,
        (
          SELECT json_agg(jsonb_build_object(
            'id', pv.id,
            'variant_name', pv.variant_name,
            'sku', pv.sku,
            'barcode', pv.barcode,
            'cost_price', pv.cost_price,
            'wholesale_price', pv.wholesale_price,
            'current_price', pv.current_price,
            'sale_price', pv.sale_price,
            'weight_kg', pv.weight_kg,
            'is_default', pv.is_default,
            'is_active', pv.is_active,
            'display_order', pv.display_order,
            'metadata', pv.metadata
          ) ORDER BY pv.display_order, pv.id)
          FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
        ) as variants,
        COALESCE((SELECT SUM(st2.quantity) FROM stock st2 WHERE st2.product_id = p.id), 0) as total_stock,
        COALESCE((SELECT AVG(r2.rating) FROM reviews r2 WHERE r2.product_id = p.id AND r2.deleted_at IS NULL), 0) as average_rating,
        (SELECT COUNT(*) FROM reviews r3 WHERE r3.product_id = p.id AND r3.deleted_at IS NULL) as review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      WHERE p.id = $1
      GROUP BY p.id, c.category_name, c.category_slug, sup.name
    `;

    const product = await db.queryOne(query, [productId]);
    if (!product) return null;

    const parsedTags = Array.isArray(product.tags)
      ? product.tags
      : (product.tags ? product.tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    return {
      id: product.id,
      name: product.product_name,
      productName: product.product_name,
      product_name: product.product_name,
      brand: product.brand,
      sku: product.sku,
      serialNumber: product.serial_number,
      serial_number: product.serial_number,
      modelNumber: product.model_number,
      model_number: product.model_number,
      categoryId: product.category_id,
      category_id: product.category_id,
      category: product.category_name,
      categoryName: product.category_name,
      category_name: product.category_name,
      categorySlug: product.category_slug,
      category_slug: product.category_slug,
      supplierId: product.supplier_id,
      supplier_id: product.supplier_id,
      supplier: product.supplier_name,
      supplierName: product.supplier_name,
      supplier_name: product.supplier_name,
      description: product.description,
      shortDescription: product.short_description,
      short_description: product.short_description,
      price: parseFloat(product.current_price),
      currentPrice: parseFloat(product.current_price),
      current_price: parseFloat(product.current_price),
      salePrice: product.sale_price ? parseFloat(product.sale_price) : null,
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      costPrice: product.cost_price ? parseFloat(product.cost_price) : null,
      cost_price: product.cost_price ? parseFloat(product.cost_price) : null,
      wholesalePrice: product.wholesale_price ? parseFloat(product.wholesale_price) : null,
      wholesale_price: product.wholesale_price ? parseFloat(product.wholesale_price) : null,
      weightKg: product.weight_kg,
      weight_kg: product.weight_kg,
      warehouseId: product.stock_entry?.warehouse_id ?? null,
      warehouse_id: product.stock_entry?.warehouse_id ?? null,
      warrantyMonths: product.warranty_months,
      warranty_months: product.warranty_months,
      isActive: product.is_active !== false,
      is_active: product.is_active !== false,
      isFeatured: product.is_featured || false,
      is_featured: product.is_featured || false,
      dimensions: product.dimensions,
      tags: parsedTags,
      metaTitle: product.meta_title,
      meta_title: product.meta_title,
      metaDescription: product.meta_description,
      meta_description: product.meta_description,
      stock: parseInt(product.total_stock) || 0,
      totalStock: parseInt(product.total_stock) || 0,
      total_stock: parseInt(product.total_stock) || 0,
      reorderLevel: product.stock_entry?.reorder_level ?? null,
      reorder_level: product.stock_entry?.reorder_level ?? null,
      averageRating: parseFloat(product.average_rating),
      average_rating: parseFloat(product.average_rating),
      reviewCount: parseInt(product.review_count),
      review_count: parseInt(product.review_count),
      images: (product.images || []).map(img => {
        const imageUrl = img.url || img.image_url;
        const fullUrl = toPublicImageUrl(imageUrl);
        console.log('[getProductByIdAdmin] Converted image URL:', { imageUrl, fullUrl });
        return fullUrl;
      }).filter(Boolean),
      image: (product.images && product.images.length > 0)
        ? toPublicImageUrl(product.images[0].url || product.images[0].image_url)
        : null,
      imageObjects: (product.images || []).map(img => {
        const imageUrl = img.url || img.image_url;
        const fullUrl = toPublicImageUrl(imageUrl);
        return {
          ...img,
          url: fullUrl,
          image_url: fullUrl
        };
      }),
      attributes: product.attributes || [],
      variants: product.variants || [],
      rawAttributes: product.attributes || [],
      createdAt: product.created_at,
      created_at: product.created_at,
      updatedAt: product.updated_at,
      updated_at: product.updated_at,
      deletedAt: product.deleted_at,
      deleted_at: product.deleted_at
    };
  }

  /**
   * Get products for storefront with filters and pagination
   * Performance: Uses indexes, LIMIT/OFFSET for pagination, prepared statements
   * @param {object} filters - Filter criteria
   * @returns {Promise<{products: array, total: number, page: number, limit: number}>}
   */
  async getStorefrontProducts(filters = {}) {
    const {
      page = 1,
      limit = 20,
      category_id,
      collection_id,
      min_price,
      max_price,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC',
      in_stock_only = false
    } = filters;

    // Validate pagination params to prevent abuse
    const validatedLimit = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 items per page
    const validatedPage = Math.max(1, parseInt(page));
    const offset = (validatedPage - 1) * validatedLimit;

    // Whitelist sort columns to prevent SQL injection
    const allowedSortColumns = ['created_at', 'current_price', 'product_name', 'average_rating'];
    const validatedSortBy = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const validatedSortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause dynamically with parameterized queries
    const conditions = ['p.deleted_at IS NULL', 'p.is_active = true'];
    const params = [];
    let paramCount = 1;

    if (category_id) {
      conditions.push(`p.category_id = $${paramCount}`);
      params.push(category_id);
      paramCount++;
    }

    if (collection_id) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM collection_products cp
        JOIN collections col ON col.id = cp.collection_id
        WHERE cp.product_id = p.id
          AND cp.collection_id = $${paramCount}
          AND col.deleted_at IS NULL
          AND col.is_active = true
      )`);
      params.push(collection_id);
      paramCount++;
    }

    if (min_price) {
      conditions.push(`COALESCE(p.sale_price, p.current_price) >= $${paramCount}`);
      params.push(min_price);
      paramCount++;
    }

    if (max_price) {
      conditions.push(`COALESCE(p.sale_price, p.current_price) <= $${paramCount}`);
      params.push(max_price);
      paramCount++;
    }

    if (search) {
      // Use full-text search for better performance (requires index)
      conditions.push(`(
        p.product_name ILIKE $${paramCount} OR 
        p.brand ILIKE $${paramCount} OR 
        p.short_description ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (in_stock_only) {
      conditions.push('EXISTS(SELECT 1 FROM stock s WHERE s.product_id = p.id AND s.quantity > 0)');
    }

    const whereClause = conditions.join(' AND ');

    // Main query with optimization
    const productsQuery = `
      SELECT 
        p.id,
        p.product_name,
        p.brand,
        p.sku,
        p.category_id,
        c.category_name,
        c.category_slug,
        p.current_price,
        p.sale_price,
        p.short_description,
        COALESCE((SELECT SUM(s2.quantity) FROM stock s2 WHERE s2.product_id = p.id), 0) as total_stock,
        COALESCE((SELECT AVG(r2.rating) FROM reviews r2 WHERE r2.product_id = p.id AND r2.deleted_at IS NULL), 0) as average_rating,
        (SELECT COUNT(*) FROM reviews r3 WHERE r3.product_id = p.id AND r3.deleted_at IS NULL) as review_count,
        (
          SELECT json_agg(json_build_object('image_url', pi2.image_url, 'image_type', pi2.image_type) ORDER BY pi2.display_order)
          FROM product_images pi2
          WHERE pi2.product_id = p.id 
          LIMIT 3
        ) as images
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${whereClause}
      GROUP BY p.id, c.category_name, c.category_slug
      ORDER BY ${validatedSortBy === 'average_rating' ? 'average_rating' : 'p.' + validatedSortBy} ${validatedSortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      WHERE ${whereClause}
    `;

    // Execute both queries in parallel for performance
    const [products, countResult] = await Promise.all([
      db.queryMany(productsQuery, [...params, validatedLimit, offset]),
      db.queryOne(countQuery, params)
    ]);

    // Transform products to match frontend expectations
    const transformedProducts = products.map(p => ({
      id: p.id,
      name: p.product_name,
      productName: p.product_name,
      product_name: p.product_name,
      brand: p.brand,
      sku: p.sku,
      categoryId: p.category_id,
      category_id: p.category_id,
      category: p.category_name,
      categoryName: p.category_name,
      category_name: p.category_name,
      categorySlug: p.category_slug,
      price: p.current_price ? parseFloat(p.current_price) : null,
      currentPrice: p.current_price ? parseFloat(p.current_price) : null,
      current_price: p.current_price ? parseFloat(p.current_price) : null,
      salePrice: p.sale_price ? parseFloat(p.sale_price) : null,
      sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
      shortDescription: p.short_description,
      short_description: p.short_description,
      stock: parseInt(p.total_stock),
      totalStock: parseInt(p.total_stock),
      total_stock: parseInt(p.total_stock),
      averageRating: parseFloat(p.average_rating),
      average_rating: parseFloat(p.average_rating),
      reviewCount: parseInt(p.review_count),
      review_count: parseInt(p.review_count),
      images: p.images || [],
      image: p.images && p.images.length > 0 ? p.images[0].image_url : null
    }));

    return {
      products: transformedProducts,
      total: parseInt(countResult.total),
      page: validatedPage,
      limit: validatedLimit,
      totalPages: Math.ceil(parseInt(countResult.total) / validatedLimit)
    };
  }

  /**
   * Admin-only: list products with trash/inactive controls.
   * Default behavior: excludes deleted, includes inactive.
   * @param {object} filters
   * @returns {Promise<{products: array, total: number, page: number, limit: number, totalPages: number}>}
   */
  async getAdminProducts(filters = {}) {
    const {
      page = 1,
      limit = 50,
      category_id,
      supplier_id,
      min_price,
      max_price,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC',
      stock_filter = null,   // 'in_stock' | 'out_of_stock' | null
      is_active,
      includeDeleted = false,
      onlyDeleted = false,
      includeInactive = true
    } = filters;

    const validatedLimit = Math.min(Math.max(1, parseInt(limit)), 1000);
    const validatedPage = Math.max(1, parseInt(page));
    const offset = (validatedPage - 1) * validatedLimit;

    const allowedSortColumns = ['created_at', 'current_price', 'product_name', 'average_rating', 'deleted_at'];
    const validatedSortBy = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const validatedSortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (onlyDeleted) {
      conditions.push('p.deleted_at IS NOT NULL');
    } else if (!includeDeleted) {
      conditions.push('p.deleted_at IS NULL');
    }

    // Active/inactive filtering
    if (is_active !== undefined && is_active !== null && is_active !== '') {
      const activeBool = String(is_active).toLowerCase() === 'true' || String(is_active) === '1';
      conditions.push(`p.is_active = $${paramCount++}`);
      params.push(activeBool);
    } else if (!includeInactive) {
      conditions.push('p.is_active = true');
    }

    if (category_id) {
      conditions.push(`p.category_id = $${paramCount++}`);
      params.push(category_id);
    }

    if (supplier_id) {
      conditions.push(`p.supplier_id = $${paramCount++}`);
      params.push(supplier_id);
    }

    if (min_price) {
      conditions.push(`p.current_price >= $${paramCount++}`);
      params.push(min_price);
    }

    if (max_price) {
      conditions.push(`p.current_price <= $${paramCount++}`);
      params.push(max_price);
    }

    if (search) {
      conditions.push(`(
        p.product_name ILIKE $${paramCount}
        OR p.sku ILIKE $${paramCount}
        OR p.brand ILIKE $${paramCount}
        OR p.serial_number ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    // Stock filter — must use HAVING because SUM() is an aggregate
    const havingConditions = [];
    if (stock_filter === 'in_stock') {
      havingConditions.push('COALESCE(SUM(s.quantity), 0) > 0');
    } else if (stock_filter === 'out_of_stock') {
      havingConditions.push('COALESCE(SUM(s.quantity), 0) = 0');
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';


    const productsQuery = `
      SELECT 
        p.id,
        p.product_name,
        p.brand,
        p.sku,
        p.barcode,
        p.category_id,
        p.is_active,
        p.deleted_at,
        c.category_name,
        c.category_slug,
        p.current_price,
        p.sale_price,
        p.short_description,
        COALESCE((SELECT SUM(s2.quantity) FROM stock s2 WHERE s2.product_id = p.id), 0) as total_stock,
        (
          SELECT json_agg(json_build_object('warehouse_id', s3.warehouse_id, 'quantity', s3.quantity))
          FROM stock s3
          WHERE s3.product_id = p.id AND s3.quantity > 0
        ) as warehouse_stock,
        COALESCE((SELECT AVG(r2.rating) FROM reviews r2 WHERE r2.product_id = p.id AND r2.deleted_at IS NULL), 0) as average_rating,
        (SELECT COUNT(*) FROM reviews r3 WHERE r3.product_id = p.id AND r3.deleted_at IS NULL) as review_count,
        (
          SELECT json_agg(json_build_object('image_url', pi2.image_url, 'image_type', pi2.image_type) ORDER BY pi2.display_order)
          FROM product_images pi2
          WHERE pi2.product_id = p.id 
          LIMIT 3
        ) as images
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock s ON p.id = s.product_id
      WHERE ${whereClause}
      GROUP BY p.id, c.category_name, c.category_slug
      ${havingClause}
      ORDER BY ${validatedSortBy === 'average_rating' ? 'average_rating' : 'p.' + validatedSortBy} ${validatedSortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const countQuery = havingClause
      ? `
        SELECT COUNT(*) as total FROM (
          SELECT p.id
          FROM products p
          LEFT JOIN stock s ON p.id = s.product_id
          WHERE ${whereClause}
          GROUP BY p.id
          ${havingClause}
        ) sub
      `
      : `
        SELECT COUNT(DISTINCT p.id) as total
        FROM products p
        LEFT JOIN stock s ON p.id = s.product_id
        WHERE ${whereClause}
      `;

    const [products, countResult] = await Promise.all([
      db.queryMany(productsQuery, [...params, validatedLimit, offset]),
      db.queryOne(countQuery, params)
    ]);

    const transformedProducts = products.map(p => ({
      id: p.id,
      name: p.product_name,
      productName: p.product_name,
      product_name: p.product_name,
      brand: p.brand,
      sku: p.sku,
      barcode: p.barcode,
      categoryId: p.category_id,
      category_id: p.category_id,
      category: p.category_name,
      categoryName: p.category_name,
      category_name: p.category_name,
      categorySlug: p.category_slug,
      price: p.current_price ? parseFloat(p.current_price) : null,
      currentPrice: p.current_price ? parseFloat(p.current_price) : null,
      current_price: p.current_price ? parseFloat(p.current_price) : null,
      salePrice: p.sale_price ? parseFloat(p.sale_price) : null,
      sale_price: p.sale_price ? parseFloat(p.sale_price) : null,
      shortDescription: p.short_description,
      short_description: p.short_description,
      stock: parseInt(p.total_stock),
      totalStock: parseInt(p.total_stock),
      total_stock: parseInt(p.total_stock),
      averageRating: parseFloat(p.average_rating),
      average_rating: parseFloat(p.average_rating),
      reviewCount: parseInt(p.review_count),
      review_count: parseInt(p.review_count),
      images: p.images || [],
      image: p.images && p.images.length > 0 ? p.images[0].image_url : null,
      isActive: p.is_active !== false,
      is_active: p.is_active !== false,
      deletedAt: p.deleted_at,
      deleted_at: p.deleted_at
    }));

    const total = parseInt(countResult.total);
    return {
      products: transformedProducts,
      total,
      page: validatedPage,
      limit: validatedLimit,
      totalPages: Math.ceil(total / validatedLimit)
    };
  }

  /**
   * Create new product with transaction for data integrity
   * @param {object} productData
   * @param {number} userId - ID of user creating the product
   * @returns {Promise<object>}
   */
  async createProduct(productData, userId) {
    return await db.transaction(async (client) => {
      // Insert product with all fields
      const productQuery = `
        INSERT INTO products (
          product_name, brand, sku, category_id, supplier_id,
          current_price, sale_price, cost_price, wholesale_price, short_description,
          description, is_active, weight_kg, warranty_months, model_number,
          meta_title, meta_description, tags, is_featured, serial_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `;

      const product = await client.query(productQuery, [
        productData.product_name,
        productData.brand,
        productData.sku,
        productData.category_id,
        productData.supplier_id || null,
        productData.current_price,
        productData.sale_price || null,
        productData.cost_price || null,
        productData.wholesale_price || null,
        productData.short_description || null,
        productData.description || null,
        productData.is_active !== false,
        productData.weight_kg || null,
        productData.warranty_months || null,
        productData.model_number || null,
        productData.meta_title || null,
        productData.meta_description || null,
        productData.tags || null,
        productData.is_featured || false,
        productData.serial_number || null
      ]);

      const productId = product.rows[0].id;

      // 2. Handle Variants & Stock
      if (productData.variants && productData.variants.length > 0) {
        // User created multiple variants from the inline manager
        for (let i = 0; i < productData.variants.length; i++) {
          const v = productData.variants[i];
          const variantResult = await client.query(`
            INSERT INTO product_variants (
              product_id, variant_name, sku, barcode,
              cost_price, wholesale_price, current_price, sale_price,
              weight_kg, is_default, is_active, display_order,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
            RETURNING id
          `, [
            productId,
            v.variant_name || `Variant ${i + 1}`,
            v.sku || `${productData.sku}-V${i + 1}`,
            v.barcode || null,
            v.cost_price || null,
            v.wholesale_price || null,
            v.current_price || productData.current_price,
            v.sale_price || null,
            v.weight_kg || null,
            v.is_default !== undefined ? v.is_default : i === 0,
            true, // is_active
            v.display_order || (i + 1)
          ]);

          const variantId = variantResult.rows[0].id;

          // Insert stock for this specific variant
          await client.query(`
            INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            productId,
            variantId,
            productData.warehouse_id || 1,
            v.stock || 0,
            productData.reorder_level || 5
          ]);
        }
      } else {
        // Create default variant (mirrors pricing/SKU from product)
        const variantResult = await client.query(`
          INSERT INTO product_variants (
            product_id, variant_name, sku, barcode,
            cost_price, wholesale_price, current_price, sale_price,
            weight_kg, is_default, is_active, display_order,
            created_at, updated_at
          ) VALUES ($1, 'Default', $2, $3, $4, $5, $6, $7, $8, true, $9, 0, NOW(), NOW())
          RETURNING id
        `, [
          productId,
          productData.sku,
          productData.barcode || null,
          productData.cost_price || null,
          productData.wholesale_price || null,
          productData.current_price,
          productData.sale_price || null,
          productData.weight_kg || null,
          productData.is_active !== false
        ]);

        const defaultVariantId = variantResult.rows[0].id;

        // Insert stock if provided
        if (productData.stock !== undefined || productData.warehouse_id) {
          await client.query(`
            INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            productId,
            defaultVariantId,
            productData.warehouse_id || 1,
            productData.stock || 0,
            productData.reorder_level || 5
          ]);
        }
      }

      // Insert images if provided
      if (productData.images && productData.images.length > 0) {
        console.log('[ProductService] Creating product with images:', JSON.stringify(productData.images, null, 2));

        // Align sequence to avoid duplicate key errors
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence('product_images','id'),
            GREATEST((SELECT COALESCE(MAX(id),0) FROM product_images) + 1, 1),
            false
          )
        `);

        for (let idx = 0; idx < productData.images.length; idx++) {
          const img = productData.images[idx];
          const url = img?.url || img?.image_url;
          console.log(`[ProductService] Processing image ${idx}:`, { hasImg: !!img, url, imgKeys: img ? Object.keys(img) : [] });
          if (!url) {
            console.warn(`[ProductService] Skipping image ${idx} - no URL found in:`, JSON.stringify(img));
            // Skip invalid image entries to satisfy NOT NULL constraint
            continue;
          }

          // Store only a canonical relative path for our local uploads.
          const relativePath = coerceProductUploadRelativePath(url);
          console.log(`[ProductService] Storing image_url: ${relativePath}`);

          await client.query(`
            INSERT INTO product_images (product_id, image_url, image_type, display_order)
            VALUES ($1, $2, $3, $4)
          `, [
            productId,
            relativePath,
            img.image_type || 'product',
            img.display_order || idx
          ]);
        }
      }

      // Insert attributes if provided
      if (productData.attributes && productData.attributes.length > 0) {
        // Ensure sequence is aligned to avoid duplicate key on SERIAL
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence('product_attributes','id'),
            GREATEST((SELECT COALESCE(MAX(id),0) FROM product_attributes) + 1, 1),
            false
          )
        `);

        for (const attr of productData.attributes) {
          // Handle attribute_name as JSONB (bilingual support)
          let attributeName;
          if (typeof attr.attribute_name === 'object') {
            attributeName = attr.attribute_name;
          } else if (typeof attr.name === 'object') {
            attributeName = attr.name;
          } else {
            // Convert string to bilingual format
            const nameStr = attr.attribute_name || attr.name || '';
            attributeName = { fr: nameStr, ar: nameStr };
          }

          await client.query(`
            INSERT INTO product_attributes (product_id, attribute_name, attribute_value)
            VALUES ($1, $2, $3)
          `, [
            productId,
            JSON.stringify(attributeName),
            attr.attribute_value || attr.value || ''
          ]);
        }
      }

      return product.rows[0];
    });

    // Invalidate product caches after creation
    CacheManager.invalidate('products:');
    CacheManager.invalidateStoreCache('products');
  }

  /**
   * Update product with transaction
   * @param {number} productId
   * @param {object} updates
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async updateProduct(productId, updates, userId) {
    const allowedFields = [
      'product_name', 'brand', 'sku', 'category_id', 'supplier_id',
      'current_price', 'sale_price', 'cost_price', 'wholesale_price', 'short_description',
      'description', 'is_active', 'weight_kg', 'warranty_months', 'model_number',
      'meta_title', 'meta_description', 'tags', 'is_featured', 'serial_number',
      'length_cm', 'width_cm', 'height_cm', 'dimensions'
    ];

    await db.transaction(async (client) => {
      const updateFields = [];
      const params = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramCount}`);
          params.push(value);
          paramCount++;
        }
      }

      let updatedProduct;

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = NOW()`);
        params.push(productId);

        const query = `
          UPDATE products
          SET ${updateFields.join(', ')}
          WHERE id = $${paramCount} AND deleted_at IS NULL
          RETURNING *
        `;

        const updateResult = await client.query(query, params);
        updatedProduct = updateResult.rows[0];
      } else {
        // No core product fields provided; still need to verify existence
        const productResult = await client.query(
          'SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL',
          [productId]
        );
        updatedProduct = productResult.rows[0];
      }

      if (!updatedProduct) {
        throw new NotFoundError('Product not found');
      }

      // Sync variant-related fields to default variant
      const variantFields = {};
      const variantSyncKeys = ['sku', 'cost_price', 'current_price', 'sale_price', 'wholesale_price', 'weight_kg', 'barcode'];
      for (const key of variantSyncKeys) {
        if (updates[key] !== undefined) {
          variantFields[key] = updates[key];
        }
      }

      if (Object.keys(variantFields).length > 0) {
        const vSetClauses = [];
        const vParams = [];
        let vIdx = 1;
        for (const [key, value] of Object.entries(variantFields)) {
          vSetClauses.push(`${key} = $${vIdx++}`);
          vParams.push(value);
        }
        vSetClauses.push('updated_at = NOW()');
        vParams.push(productId);
        await client.query(
          `UPDATE product_variants SET ${vSetClauses.join(', ')} WHERE product_id = $${vIdx} AND is_default = true AND deleted_at IS NULL`,
          vParams
        );
      }

      // Upsert product-level stock only when no explicit variants payload is provided.
      // When updates.variants exists, stock is managed per variant in the block below.
      if (
        (updates.stock !== undefined || updates.warehouse_id !== undefined || updates.reorder_level !== undefined)
        && !Array.isArray(updates.variants)
      ) {
        const variantsCountResult = await client.query(
          'SELECT COUNT(*)::int AS cnt FROM product_variants WHERE product_id = $1 AND deleted_at IS NULL',
          [productId]
        );
        const existingVariantCount = variantsCountResult.rows[0]?.cnt || 0;
        const incomingVariantCount = Array.isArray(updates.variants) ? updates.variants.length : null;
        const hasMultipleVariants = existingVariantCount > 1 || (incomingVariantCount !== null && incomingVariantCount > 1);

        if (!hasMultipleVariants) {
          const defaultVariant = await client.query(
            `SELECT id
             FROM product_variants
             WHERE product_id = $1 AND deleted_at IS NULL
             ORDER BY is_default DESC, display_order ASC, id ASC
             LIMIT 1`,
            [productId]
          );
          const defaultVariantId = defaultVariant.rows[0]?.id || null;

          if (defaultVariantId) {
            const stockResult = await client.query(
              'SELECT id FROM stock WHERE variant_id = $1 ORDER BY id DESC LIMIT 1',
              [defaultVariantId]
            );
            const existingStock = stockResult.rows[0];

            if (existingStock) {
              await client.query(`
                UPDATE stock
                SET
                  warehouse_id = COALESCE($2, warehouse_id),
                  quantity = COALESCE($3, quantity),
                  reorder_level = COALESCE($4, reorder_level),
                  updated_at = NOW()
                WHERE id = $1
              `, [existingStock.id, updates.warehouse_id, updates.stock, updates.reorder_level]);
            } else {
              await client.query(`
                INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
                VALUES ($1, $2, $3, $4, $5)
              `, [
                productId,
                defaultVariantId,
                updates.warehouse_id || 1,
                updates.stock || 0,
                updates.reorder_level || 5
              ]);
            }
          }
        }
      }

      // Handle variants update if provided in the payload
      if (updates.variants !== undefined && Array.isArray(updates.variants)) {
        // 1. Fetch existing variants to know what to keep/delete
        const existingVariantsResult = await client.query(
          'SELECT id, is_default FROM product_variants WHERE product_id = $1 AND deleted_at IS NULL',
          [productId]
        );
        const existingVariants = existingVariantsResult.rows;
        const incomingIds = updates.variants.map(v => v.id).filter(id => id && !String(id).startsWith('temp_'));

        // Delete variants not in the new list (except the default one to be safe, or just soft delete)
        const variantsToDelete = existingVariants.filter(ev => !incomingIds.includes(ev.id) && !ev.is_default);
        for (const vd of variantsToDelete) {
          await client.query('UPDATE product_variants SET deleted_at = NOW() WHERE id = $1', [vd.id]);
        }

        // 2. Upsert incoming variants
        for (let i = 0; i < updates.variants.length; i++) {
          const v = updates.variants[i];
          const isNew = !v.id || String(v.id).startsWith('temp_');
          const isDefault = v.is_default !== undefined ? v.is_default : existingVariants.length === 0 && i === 0;

          let targetVariantId = v.id;

          if (isNew) {
            // Insert new variant
            const rv = await client.query(`
              INSERT INTO product_variants (
                product_id, variant_name, sku, barcode,
                cost_price, wholesale_price, current_price, sale_price,
                weight_kg, is_default, is_active, display_order,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
              RETURNING id
            `, [
              productId,
              v.variant_name || `Variant ${i + 1}`,
              v.sku || `${updates.sku}-V${i + 1}`,
              v.barcode || null,
              v.cost_price || null,
              v.wholesale_price || null,
              v.current_price || updates.current_price,
              v.sale_price || null,
              v.weight_kg || null,
              isDefault,
              true,
              v.display_order || (i + 1)
            ]);
            targetVariantId = rv.rows[0].id;

            // Insert stock right away for this new variant
            await client.query(`
              INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              productId,
              targetVariantId,
              updates.warehouse_id || 1,
              v.stock || 0,
              updates.reorder_level || 5
            ]);
          } else {
            // Update existing variant
            await client.query(`
              UPDATE product_variants
              SET
                variant_name = $2, sku = $3, barcode = $4,
                cost_price = $5, wholesale_price = $6, current_price = $7, sale_price = $8,
                weight_kg = $9, is_default = $10, display_order = $11, updated_at = NOW()
              WHERE id = $1
            `, [
              v.id,
              v.variant_name,
              v.sku,
              v.barcode || null,
              v.cost_price || null,
              v.wholesale_price || null,
              v.current_price,
              v.sale_price || null,
              v.weight_kg || null,
              isDefault,
              v.display_order || (i + 1)
            ]);

            // Upsert stock for existing variant — with row locking and audit trail
            const sResult = await client.query(
              'SELECT id, quantity, reserved_quantity, warehouse_id FROM stock WHERE variant_id = $1 FOR UPDATE',
              [v.id]
            );
            if (sResult.rows.length > 0) {
              if (v.stock !== undefined) {
                const oldQty = sResult.rows[0].quantity;
                const newQty = parseInt(v.stock);
                const reserved = parseInt(sResult.rows[0].reserved_quantity) || 0;

                if (newQty < 0) {
                  throw new Error(`Stock for variant ${v.id} cannot be negative`);
                }
                if (newQty < reserved) {
                  throw new Error(`Cannot reduce variant ${v.id} stock below reserved quantity (${reserved})`);
                }

                const delta = newQty - oldQty;
                if (delta !== 0) {
                  await client.query(
                    'UPDATE stock SET quantity = $1, updated_at = NOW() WHERE id = $2',
                    [newQty, sResult.rows[0].id]
                  );
                  await client.query(
                    `INSERT INTO stock_movements (
                      stock_id, product_id, variant_id, warehouse_id,
                      movement_type, quantity, quantity_before, quantity_after,
                      reason, reference_type, reference_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [
                      sResult.rows[0].id,
                      productId,
                      v.id,
                      sResult.rows[0].warehouse_id,
                      delta > 0 ? 'in' : 'out',
                      Math.abs(delta),
                      oldQty,
                      newQty,
                      'Product update stock adjustment',
                      'manual',
                      null,
                    ]
                  );
                }
              }
            } else {
              await client.query(`
                INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
                VALUES ($1, $2, $3, $4, $5)
              `, [productId, v.id, updates.warehouse_id || 1, v.stock || 0, updates.reorder_level || 5]);
            }
          }
        }
      }

      // Replace images when provided
      if (Array.isArray(updates.images)) {
        console.log('[ProductService] UPDATE: Received images array with', updates.images.length, 'items');
        console.log('[ProductService] UPDATE: Images data:', JSON.stringify(updates.images, null, 2));

        await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
        console.log('[ProductService] UPDATE: Deleted old images for product', productId);

        // Align sequence to avoid duplicate key errors
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence('product_images','id'),
            GREATEST((SELECT COALESCE(MAX(id),0) FROM product_images) + 1, 1),
            false
          )
        `);
        console.log('[ProductService] UPDATE: Aligned product_images sequence');

        for (let idx = 0; idx < updates.images.length; idx++) {
          const img = updates.images[idx];
          const url = img?.url || img?.image_url;
          console.log(`[ProductService] UPDATE: Image ${idx} - url found: ${!!url}`, { img, url });
          if (!url) {
            console.warn(`[ProductService] UPDATE: Skipping image ${idx} - no URL found`);
            continue;
          }

          // Store only a canonical relative path for our local uploads.
          const relativePath = coerceProductUploadRelativePath(url);
          console.log(`[ProductService] UPDATE: Storing image_url: ${relativePath}`);

          // Get alt_text from various possible field names
          const altText = img?.altText || img?.alt_text || img?.altDescription || 'Product image';
          const displayOrder = img?.displayOrder || img?.display_order || idx;

          console.log(`[ProductService] UPDATE: Image ${idx} details - altText: "${altText}", displayOrder: ${displayOrder}`);

          await client.query(`
            INSERT INTO product_images (product_id, image_url, alt_text, image_type, display_order)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            productId,
            relativePath,
            altText,
            img.image_type || 'product',
            displayOrder
          ]);
        }
      }

      // Replace attributes when provided
      if (Array.isArray(updates.attributes)) {
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence('product_attributes','id'),
            GREATEST((SELECT COALESCE(MAX(id),0) FROM product_attributes) + 1, 1),
            false
          )
        `);

        await client.query('DELETE FROM product_attributes WHERE product_id = $1', [productId]);

        for (const attr of updates.attributes) {
          let attributeName;
          if (typeof attr.attribute_name === 'object') {
            attributeName = attr.attribute_name;
          } else if (typeof attr.name === 'object') {
            attributeName = attr.name;
          } else {
            const nameStr = attr.attribute_name || attr.name || '';
            attributeName = { fr: nameStr, ar: nameStr };
          }

          await client.query(`
            INSERT INTO product_attributes (product_id, attribute_name, attribute_value)
            VALUES ($1, $2, $3)
          `, [
            productId,
            JSON.stringify(attributeName),
            attr.attribute_value || attr.value || ''
          ]);
        }
      }

      return updatedProduct;
    });

    // Return hydrated product with related data
    const updatedProduct = await this.getProductById(productId);

    // Invalidate product caches after update
    CacheManager.del(`product:${productId}`);
    CacheManager.invalidate('products:');
    CacheManager.invalidateStoreCache('products');
    CacheManager.invalidateStoreCache(`products/${productId}`);

    return updatedProduct;
  }

  /**
   * Soft delete product
   * @param {number} productId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteProduct(productId, userId) {
    const query = `
      UPDATE products
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await db.queryOne(query, [productId]);

    if (result) {
      // Invalidate product caches after deletion
      CacheManager.del(`product:${productId}`);
      CacheManager.invalidate('products:');
      CacheManager.invalidateStoreCache('products');
    }

    return !!result;
  }

  /**
   * Restore a soft-deleted product
   * @param {number} productId
   * @param {number} userId
   */
  async restoreProduct(productId, userId) {
    const existing = await db.queryOne('SELECT id, sku, deleted_at FROM products WHERE id = $1', [productId]);
    if (!existing) {
      throw new NotFoundError('Product not found');
    }
    if (!existing.deleted_at) {
      return true;
    }

    const conflict = await db.queryOne(
      'SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND deleted_at IS NULL AND id <> $2',
      [existing.sku, productId]
    );
    if (conflict) {
      throw new ConflictError('Cannot restore product: SKU already exists');
    }

    const restored = await db.queryOne(
      'UPDATE products SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id',
      [productId]
    );

    if (restored) {
      // Invalidate product caches after restoration
      CacheManager.del(`product:${productId}`);
      CacheManager.invalidate('products:');
      CacheManager.invalidateStoreCache('products');
    }

    return !!restored;
  }

  /**
   * Hard delete a product (only if already soft-deleted)
   * Safety: blocks deletion if referenced by order items
   * @param {number} productId
   */
  async hardDeleteProduct(productId) {
    return await db.transaction(async (client) => {
      const existing = await client.query(
        'SELECT id, deleted_at FROM products WHERE id = $1',
        [productId]
      );
      const row = existing.rows[0];
      if (!row) {
        throw new NotFoundError('Product not found');
      }
      if (!row.deleted_at) {
        throw new ValidationError([], 'Product must be in trash before hard delete');
      }

      const orderRef = await client.query(
        'SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1',
        [productId]
      );
      if (orderRef.rows.length > 0) {
        throw new ValidationError([], 'Cannot hard delete product: referenced by orders');
      }

      await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
      await client.query('DELETE FROM product_attributes WHERE product_id = $1', [productId]);
      await client.query('DELETE FROM stock WHERE product_id = $1', [productId]);

      const deleted = await client.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);

      if (deleted.rows.length > 0) {
        CacheManager.del(`product:${productId}`);
        CacheManager.del('products:featured');
        CacheManager.del('products:new');
        CacheManager.invalidateStoreCache('products');
        CacheManager.invalidateStoreCache(`products/${productId}`);
      }

      return deleted.rows.length > 0;
    });
  }

  /**
   * Get product statistics for dashboard
   * Uses optimized aggregate queries
   * @returns {Promise<object>}
   */
  async getProductStats() {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_products,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_active = true) as active_products,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_active = false) as inactive_products,
        COUNT(DISTINCT category_id) FILTER (WHERE deleted_at IS NULL) as total_categories,
        COALESCE(AVG(current_price) FILTER (WHERE deleted_at IS NULL AND is_active = true), 0) as avg_price,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND deleted_at IS NULL) as products_added_last_30_days
      FROM products
    `;

    return await db.queryOne(query);
  }

  /**
   * Bulk receive products for warehouse intake
   * Creates or updates products and their stock in a transaction
   * @param {Array} productsData - Array of product objects with SKU, name, quantity, warehouse_id
   * @param {number} userId - User performing the operation
   * @returns {Promise<{successful: Array, failed: Array, summary: object}>}
   */
  async bulkReceiveProducts(productsData, userId) {
    const results = {
      successful: [],
      failed: [],
      summary: {
        total: productsData.length,
        created: 0,
        updated: 0,
        errors: 0
      }
    };

    return await db.transaction(async (client) => {
      for (const item of productsData) {
        try {
          const { sku, name, categoryId, supplierId, quantity, warehouseId, costPrice, currentPrice } = item;

          // Validate required fields
          if (!sku || !name || !categoryId || !warehouseId) {
            results.failed.push({
              sku: sku || 'N/A',
              error: 'Missing required fields (SKU, name, category, warehouse)'
            });
            results.summary.errors++;
            continue;
          }

          // Check if product already exists
          const existingProduct = await client.query(
            'SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND deleted_at IS NULL',
            [sku]
          );

          let productId;
          let isNewProduct = false;

          if (existingProduct.rows.length > 0) {
            // Product exists - just update stock
            productId = existingProduct.rows[0].id;
          } else {
            // Create new product with minimal data - is_active=false for incomplete products
            const productResult = await client.query(
              `INSERT INTO products (
                sku, product_name, category_id, supplier_id, 
                current_price, cost_price, is_active, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
              RETURNING id`,
              [
                sku,
                name,
                categoryId,
                supplierId || null,
                currentPrice || 0, // Placeholder price for incomplete products
                costPrice || null,
                false // Mark as inactive/incomplete
              ]
            );
            productId = productResult.rows[0].id;
            isNewProduct = true;
            results.summary.created++;
          }

          // Update or insert stock
          const stockResult = await client.query(
            `INSERT INTO stock (product_id, warehouse_id, quantity, last_restocked, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (product_id, warehouse_id)
             DO UPDATE SET 
               quantity = stock.quantity + EXCLUDED.quantity,
               last_restocked = CASE WHEN EXCLUDED.quantity > 0 THEN NOW() ELSE stock.last_restocked END,
               updated_at = NOW()
             RETURNING id, quantity`,
            [productId, warehouseId, quantity || 0]
          );

          if (!isNewProduct && (quantity || 0) > 0) {
            results.summary.updated++;
          }

          results.successful.push({
            sku,
            name,
            productId,
            quantity: quantity || 0,
            warehouseId,
            currentPrice,
            action: isNewProduct ? 'created' : ((quantity || 0) > 0 ? 'stock_added' : 'no_stock_change'),
            newStockQuantity: stockResult.rows[0].quantity
          });
        } catch (error) {
          results.failed.push({
            sku: item.sku || 'N/A',
            error: error.message
          });
          results.summary.errors++;
        }
      }

      return results;
    });
  }

  /**
   * Check if barcode exists (case-insensitive)
   * @param {string} barcode - Barcode to check
   * @param {number} excludeId - Product ID to exclude from check (for updates)
   * @returns {Promise<boolean>}
   */
  async barcodeExists(barcode, excludeId = null) {
    const query = excludeId
      ? `SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(barcode) = LOWER($1) AND id != $2 AND deleted_at IS NULL)`
      : `SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(barcode) = LOWER($1) AND deleted_at IS NULL)`;

    const params = excludeId ? [barcode, excludeId] : [barcode];
    const result = await db.queryOne(query, params);
    return result.exists;
  }

  /**
   * Get product by barcode
   * @param {string} barcode - Product barcode
   * @returns {Promise<object|null>}
   */
  async getProductByBarcode(barcode) {
    const query = `
      SELECT 
        p.id,
        p.product_name,
        p.brand,
        p.current_price,
        p.sale_price,
        p.short_description,
        p.category_id,
        c.category_name,
        c.category_slug,
        p.is_active,
        pv.id as variant_id,
        pv.variant_name,
        pv.sku,
        pv.barcode,
        pv.cost_price as variant_cost_price,
        pv.wholesale_price as variant_wholesale_price,
        pv.current_price as variant_current_price,
        pv.sale_price as variant_sale_price,
        pv.weight_kg as variant_weight_kg,
        pv.is_default as variant_is_default,
        pv.is_active as variant_is_active,
        pv.display_order as variant_display_order,
        pv.metadata as variant_metadata,
        (
          SELECT COALESCE(SUM(quantity), 0)
          FROM stock
          WHERE product_id = p.id
        ) as total_stock
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE LOWER(pv.barcode) = LOWER($1) AND p.deleted_at IS NULL AND p.is_active = true AND pv.deleted_at IS NULL
      LIMIT 1
    `;

    const result = await db.queryOne(query, [barcode]);
    return result || null;
  }

  /**
   * Update product barcode
   * @param {number} productId - Product ID
   * @param {string} barcode - New barcode value
   * @returns {Promise<object>} Updated product
   */
  async updateProductBarcode(productId, barcode) {
    // Check if barcode already exists (excluding current product)
    const exists = await this.barcodeExists(barcode, productId);
    if (exists) {
      throw new ValidationError('Barcode already exists');
    }

    const query = `
      UPDATE products
      SET barcode = $1, updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING id, sku, barcode, product_name
    `;

    const result = await db.queryOne(query, [barcode, productId]);
    if (!result) {
      throw new NotFoundError('Product not found');
    }

    return result;
  }

  /**
   * Search products by barcode or SKU
   * @param {string} query - Search query (barcode or SKU)
   * @returns {Promise<array>}
   */
  async searchProductsByBarcodeOrSku(query) {
    const searchQuery = query.toLowerCase();

    const dbQuery = `
      SELECT 
        p.id,
        p.sku,
        p.barcode,
        p.product_name,
        p.brand,
        p.current_price,
        p.category_id,
        COALESCE(SUM(s.quantity), 0) as total_stock,
        (
          SELECT json_agg(jsonb_build_object('image_url', pi2.image_url, 'image_type', pi2.image_type) ORDER BY pi2.display_order)
          FROM product_images pi2
          WHERE pi2.product_id = p.id 
          LIMIT 1
        ) as images
      FROM products p
      LEFT JOIN stock s ON p.id = s.product_id
      WHERE (LOWER(p.barcode) LIKE $1 OR LOWER(p.sku) LIKE $1)
        AND p.deleted_at IS NULL
        AND p.is_active = true
      GROUP BY p.id
      LIMIT 20
    `;

    const results = await db.queryMany(dbQuery, [`%${searchQuery}%`]);

    // Transform to match frontend expectations
    return results.map(p => ({
      ...p,
      name: p.product_name,
      currentPrice: parseFloat(p.current_price),
      totalStock: parseInt(p.total_stock),
      images: (p.images || []).map(img => toPublicImageUrl(img.image_url)).filter(Boolean)
    }));
  }

  /**
   * Generate barcodes for multiple products
   * @param {array} productIds - Array of product IDs
   * @returns {Promise<array>} Results with generated barcodes
   */
  async generateBarcodesForProducts(productIds) {
    const { generateEAN13 } = await import('../utils/barcodeUtils.js');

    const results = [];

    for (const productId of productIds) {
      try {
        // Generate EAN-13 barcode
        const barcode = generateEAN13(productId);

        // Update product with barcode
        const query = `
          UPDATE products
          SET barcode = $1, updated_at = NOW()
          WHERE id = $2 AND deleted_at IS NULL
          RETURNING id, sku, barcode, product_name, current_price
        `;

        const result = await db.queryOne(query, [barcode, productId]);

        if (result) {
          results.push({
            product_id: result.id,
            sku: result.sku,
            barcode: result.barcode,
            product_name: result.product_name,
            selling_price: result.current_price,
            success: true
          });
        }
      } catch (error) {
        results.push({
          product_id: productId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get all products with barcode information
   * @param {object} filters - Pagination and filtering options
   * @returns {Promise<object>} Products with pagination info
   */
  async getProductsWithBarcodes(filters = {}) {
    const { page = 1, limit = 50, missingOnly = false } = filters;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE deleted_at IS NULL';
    if (missingOnly) {
      whereClause += ' AND (barcode IS NULL OR barcode = \'\')';
    }

    const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
    const countResult = await db.queryOne(countQuery);

    const dataQuery = `
      SELECT 
        id,
        sku,
        barcode,
        product_name,
        category_id,
        current_price,
        is_active,
        created_at
      FROM products
      ${whereClause}
      ORDER BY id DESC
      LIMIT $1 OFFSET $2
    `;

    const products = await db.query(dataQuery, [limit, offset]);

    return {
      total: countResult.total,
      page,
      limit,
      products
    };
  }
}

export default new ProductService();
