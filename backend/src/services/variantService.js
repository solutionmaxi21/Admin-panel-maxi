/**
 * Variant Service Layer
 * Handles all product variant operations with safety-first approach.
 *
 * During the dual-write migration period, every write to stock/order_items
 * populates BOTH product_id AND variant_id for backward compatibility.
 */

import db from '../db/postgres.js';
import { ValidationError, NotFoundError, ConflictError } from '../shared/errors/index.js';
import { generateEAN13ForVariant, formatBarcodeForDisplay } from '../utils/barcodeUtils.js';

class VariantService {
  /**
   * Get all active variants for a product
   * @param {number} productId
   * @returns {Promise<Array>}
   */
  async getVariantsByProductId(productId) {
    const query = `
      SELECT
        pv.*,
        COALESCE(
          (SELECT SUM(s.quantity) FROM stock s WHERE s.variant_id = pv.id), 0
        ) AS total_stock,
        COALESCE(
          (SELECT SUM(s.reserved_quantity) FROM stock s WHERE s.variant_id = pv.id), 0
        ) AS total_reserved,
        (SELECT s.warehouse_id FROM stock s WHERE s.variant_id = pv.id ORDER BY s.quantity DESC LIMIT 1) AS warehouse_id,
        (SELECT w.warehouse_name FROM stock s JOIN warehouses w ON w.id = s.warehouse_id WHERE s.variant_id = pv.id ORDER BY s.quantity DESC LIMIT 1) AS warehouse_name,
        sup.name AS supplier_name
      FROM product_variants pv
      LEFT JOIN suppliers sup ON sup.id = pv.supplier_id
      WHERE pv.product_id = $1
        AND pv.deleted_at IS NULL
      ORDER BY pv.display_order, pv.id
    `;

    const rows = await db.queryMany(query, [productId]);
    return rows.map(this._transformVariant);
  }

  /**
   * Get a single variant by ID
   * @param {number} variantId
   * @returns {Promise<object|null>}
   */
  async getVariantById(variantId) {
    const query = `
      SELECT
        pv.*,
        p.product_name,
        p.brand,
        p.category_id,
        COALESCE(
          (SELECT SUM(s.quantity) FROM stock s WHERE s.variant_id = pv.id), 0
        ) AS total_stock,
        COALESCE(
          (SELECT SUM(s.reserved_quantity) FROM stock s WHERE s.variant_id = pv.id), 0
        ) AS total_reserved
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = $1
        AND pv.deleted_at IS NULL
    `;

    const row = await db.queryOne(query, [variantId]);
    return row ? this._transformVariant(row) : null;
  }

  /**
   * Get the default variant for a product
   * @param {number} productId
   * @returns {Promise<object|null>}
   */
  async getDefaultVariant(productId) {
    const query = `
      SELECT pv.*
      FROM product_variants pv
      WHERE pv.product_id = $1
        AND pv.is_default = true
        AND pv.deleted_at IS NULL
    `;

    const row = await db.queryOne(query, [productId]);
    return row ? this._transformVariant(row) : null;
  }

  /**
   * Create a new variant for a product
   * @param {number} productId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createVariant(productId, data) {
    // Verify product exists
    const product = await db.queryOne(
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [productId]
    );
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Check SKU uniqueness
    if (data.sku) {
      const skuExists = await db.queryOne(
        'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(sku) = LOWER($1) AND deleted_at IS NULL) AS exists',
        [data.sku]
      );
      if (skuExists.exists) {
        throw new ConflictError('SKU already exists');
      }
    }

    // Check barcode uniqueness
    if (data.barcode) {
      const barcodeExists = await db.queryOne(
        'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(barcode) = LOWER($1) AND deleted_at IS NULL) AS exists',
        [data.barcode]
      );
      if (barcodeExists.exists) {
        throw new ConflictError('Barcode already exists');
      }
    }

    // If this is the first variant or marked as default, handle default swap
    const isDefault = data.is_default === true;

    return await db.transaction(async (client) => {
      // If making this the default, unset existing default
      if (isDefault) {
        await client.query(
          `UPDATE product_variants SET is_default = false, updated_at = NOW()
           WHERE product_id = $1 AND is_default = true AND deleted_at IS NULL`,
          [productId]
        );
      }

      const query = `
        INSERT INTO product_variants (
          product_id, variant_name, sku, barcode,
          cost_price, wholesale_price, current_price, sale_price,
          weight_kg, is_default, is_active, display_order, metadata,
          supplier_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        RETURNING *
      `;

      const result = await client.query(query, [
        productId,
        data.variant_name || 'Default',
        data.sku,
        data.barcode || null,
        data.cost_price || null,
        data.wholesale_price || null,
        data.current_price,
        data.sale_price || null,
        data.weight_kg || null,
        isDefault,
        data.is_active !== false,
        data.display_order || 0,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.supplier_id || null,
      ]);

      const variantId = result.rows[0].id;

      // Create stock entry for this variant
      const warehouseId = data.warehouse_id || 1;
      await client.query(`
        INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        productId,
        variantId,
        warehouseId,
        parseInt(data.stock) || 0,
        data.reorder_level || 5,
      ]);

      return this._transformVariant(result.rows[0]);
    });
  }

  /**
   * Update an existing variant
   * @param {number} variantId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateVariant(variantId, data) {
    const existing = await db.queryOne(
      'SELECT * FROM product_variants WHERE id = $1 AND deleted_at IS NULL',
      [variantId]
    );
    if (!existing) {
      throw new NotFoundError('Variant not found');
    }

    // Check SKU uniqueness (if changing)
    if (data.sku && data.sku.toLowerCase() !== existing.sku.toLowerCase()) {
      const skuExists = await db.queryOne(
        'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(sku) = LOWER($1) AND id != $2 AND deleted_at IS NULL) AS exists',
        [data.sku, variantId]
      );
      if (skuExists.exists) {
        throw new ConflictError('SKU already exists');
      }
    }

    // Check barcode uniqueness (if changing)
    if (data.barcode && data.barcode !== existing.barcode) {
      const barcodeExists = await db.queryOne(
        'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(barcode) = LOWER($1) AND id != $2 AND deleted_at IS NULL) AS exists',
        [data.barcode, variantId]
      );
      if (barcodeExists.exists) {
        throw new ConflictError('Barcode already exists');
      }
    }

    // Extract stock separately — it lives in the stock table, not product_variants
    let stockValue;
    if (data.stock !== undefined) {
      const rawStock = `${data.stock}`.trim();
      if (rawStock === '') {
        stockValue = undefined;
      } else {
        const parsedStock = Number.parseInt(rawStock, 10);
        if (!Number.isFinite(parsedStock)) {
          throw new ValidationError('Stock must be a valid integer');
        }
        stockValue = parsedStock;
      }
    }

    const setClauses = [];
    const params = [];
    let paramIdx = 1;

    const allowedFields = [
      'variant_name', 'sku', 'barcode',
      'cost_price', 'wholesale_price', 'current_price', 'sale_price',
      'weight_kg', 'is_active', 'display_order', 'metadata', 'supplier_id',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        const value = field === 'metadata' && data[field] ? JSON.stringify(data[field]) : data[field];
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(value);
      }
    }

    // Allow stock-only updates (no variant fields changed)
    if (setClauses.length === 0 && stockValue === undefined) {
      throw new ValidationError('No fields to update');
    }

    let result;

    if (setClauses.length > 0) {
      setClauses.push(`updated_at = NOW()`);
      params.push(variantId);

      const query = `
        UPDATE product_variants
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIdx} AND deleted_at IS NULL
        RETURNING *
      `;

      result = await db.queryOne(query, params);
      if (!result) throw new NotFoundError('Variant not found');
    } else {
      result = existing;
    }

    // Update stock quantity and/or warehouse if provided
    const newWarehouseId = data.warehouse_id ? parseInt(data.warehouse_id) : null;
    if (stockValue !== undefined || newWarehouseId) {
      await db.transaction(async (client) => {
        const stockResult = await client.query(
          'SELECT id, warehouse_id, quantity, reserved_quantity FROM stock WHERE variant_id = $1 ORDER BY quantity DESC LIMIT 1 FOR UPDATE',
          [variantId]
        );
        const stockRow = stockResult.rows?.[0];

        if (stockRow) {
          const updates = [];
          const sParams = [];
          let sIdx = 1;

          if (stockValue !== undefined) {
            const delta = stockValue - stockRow.quantity;

            if (delta !== 0) {
              // Guard: cannot go negative
              if (stockValue < 0) {
                throw new ValidationError('Stock quantity cannot be negative');
              }
              // Guard: cannot reduce below reserved units
              const reserved = parseInt(stockRow.reserved_quantity) || 0;
              if (stockValue < reserved) {
                throw new ValidationError(`Cannot reduce stock below reserved quantity (${reserved})`);
              }

              updates.push(`quantity = $${sIdx++}`);
              sParams.push(stockValue);

              // Record the stock movement for audit trail
              await client.query(
                `INSERT INTO stock_movements (
                  stock_id, product_id, variant_id, warehouse_id,
                  movement_type, quantity, quantity_before, quantity_after,
                  reason, reference_type, reference_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                  stockRow.id,
                  existing.product_id,
                  variantId,
                  stockRow.warehouse_id,
                  delta > 0 ? 'in' : 'out',
                  Math.abs(delta),
                  stockRow.quantity,
                  stockValue,
                  'Variant stock adjustment',
                  'manual',
                  null,
                ]
              );
            }
          }

          if (newWarehouseId && newWarehouseId !== stockRow.warehouse_id) {
            updates.push(`warehouse_id = $${sIdx++}`);
            sParams.push(newWarehouseId);
          }

          if (updates.length > 0) {
            updates.push('updated_at = NOW()');
            sParams.push(stockRow.id);
            await client.query(
              `UPDATE stock SET ${updates.join(', ')} WHERE id = $${sIdx}`,
              sParams
            );
          }
        } else {
          // No stock row exists — insert one
          await client.query(`
            INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reorder_level)
            VALUES ($1, $2, $3, $4, $5)
          `, [existing.product_id, variantId, newWarehouseId || 1, stockValue || 0, 5]);

          // Record initial stock-in movement if quantity > 0
          if (stockValue > 0) {
            const newStock = await client.query(
              'SELECT id, warehouse_id FROM stock WHERE variant_id = $1 ORDER BY id DESC LIMIT 1',
              [variantId]
            );
            if (newStock.rows[0]) {
              await client.query(
                `INSERT INTO stock_movements (
                  stock_id, product_id, variant_id, warehouse_id,
                  movement_type, quantity, quantity_before, quantity_after,
                  reason, reference_type, reference_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                  newStock.rows[0].id,
                  existing.product_id,
                  variantId,
                  newStock.rows[0].warehouse_id,
                  'in',
                  stockValue,
                  0,
                  stockValue,
                  'Initial variant stock',
                  'manual',
                  null,
                ]
              );
            }
          }
        }
      });
    }

    return this._transformVariant(result);
  }

  /**
   * Soft-delete a variant
   * Cannot delete the last/default variant of a product.
   * @param {number} variantId
   * @returns {Promise<void>}
   */
  async deleteVariant(variantId) {
    const existing = await db.queryOne(
      'SELECT * FROM product_variants WHERE id = $1 AND deleted_at IS NULL',
      [variantId]
    );
    if (!existing) throw new NotFoundError('Variant not found');

    // Count active variants for this product
    const countResult = await db.queryOne(
      'SELECT COUNT(*) AS cnt FROM product_variants WHERE product_id = $1 AND deleted_at IS NULL',
      [existing.product_id]
    );

    if (parseInt(countResult.cnt) <= 1) {
      throw new ValidationError('Cannot delete the last variant of a product');
    }

    if (existing.is_default) {
      throw new ValidationError('Cannot delete the default variant. Set another variant as default first.');
    }

    // Check for active stock
    const stockResult = await db.queryOne(
      'SELECT COALESCE(SUM(quantity), 0) AS total FROM stock WHERE variant_id = $1',
      [variantId]
    );
    if (parseInt(stockResult.total) > 0) {
      throw new ValidationError(
        `Cannot delete variant with ${stockResult.total} units in stock. Transfer or adjust stock first.`
      );
    }

    await db.query(
      'UPDATE product_variants SET deleted_at = NOW(), is_active = false, updated_at = NOW() WHERE id = $1',
      [variantId]
    );
  }

  /**
   * Set a variant as the default for its product
   * @param {number} productId
   * @param {number} variantId
   * @returns {Promise<object>}
   */
  async setDefaultVariant(productId, variantId) {
    const variant = await db.queryOne(
      'SELECT * FROM product_variants WHERE id = $1 AND product_id = $2 AND deleted_at IS NULL',
      [variantId, productId]
    );
    if (!variant) throw new NotFoundError('Variant not found for this product');

    return await db.transaction(async (client) => {
      // Unset current default
      await client.query(
        `UPDATE product_variants SET is_default = false, updated_at = NOW()
         WHERE product_id = $1 AND is_default = true AND deleted_at IS NULL`,
        [productId]
      );

      // Set new default
      const result = await client.query(
        `UPDATE product_variants SET is_default = true, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [variantId]
      );

      return this._transformVariant(result.rows[0]);
    });
  }

  /**
   * Check if a SKU exists in variants (replaces productService.skuExists)
   * @param {string} sku
   * @param {number} excludeVariantId
   * @returns {Promise<boolean>}
   */
  async skuExists(sku, excludeVariantId = null) {
    const query = excludeVariantId
      ? 'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(sku) = LOWER($1) AND id != $2 AND deleted_at IS NULL) AS exists'
      : 'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(sku) = LOWER($1) AND deleted_at IS NULL) AS exists';

    const params = excludeVariantId ? [sku, excludeVariantId] : [sku];
    const result = await db.queryOne(query, params);
    return result.exists;
  }

  /**
   * Check if a barcode exists in variants
   * @param {string} barcode
   * @param {number} excludeVariantId
   * @returns {Promise<boolean>}
   */
  async barcodeExists(barcode, excludeVariantId = null) {
    const query = excludeVariantId
      ? 'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(barcode) = LOWER($1) AND id != $2 AND deleted_at IS NULL) AS exists'
      : 'SELECT EXISTS(SELECT 1 FROM product_variants WHERE LOWER(barcode) = LOWER($1) AND deleted_at IS NULL) AS exists';

    const params = excludeVariantId ? [barcode, excludeVariantId] : [barcode];
    const result = await db.queryOne(query, params);
    return result.exists;
  }

  /**
   * Generate a unique EAN-13 barcode for a variant and persist it.
   * @param {number} variantId
   * @returns {Promise<object>} Updated variant with new barcode
   */
  async generateBarcode(variantId) {
    const existing = await db.queryOne(
      'SELECT * FROM product_variants WHERE id = $1 AND deleted_at IS NULL',
      [variantId]
    );
    if (!existing) throw new NotFoundError('Variant not found');

    // Generate unique barcode with retry
    let barcode;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      barcode = generateEAN13ForVariant(variantId + attempts * 100000);
      const exists = await this.barcodeExists(barcode, variantId);
      if (!exists) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new ValidationError('Could not generate a unique barcode. Please try again.');
    }

    const result = await db.queryOne(
      'UPDATE product_variants SET barcode = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *',
      [barcode, variantId]
    );

    return {
      variant: this._transformVariant(result),
      barcode,
      format: 'EAN-13',
      displayFormat: formatBarcodeForDisplay(barcode),
    };
  }

  /**
   * Get variant by barcode (replaces productService.getProductByBarcode for variant lookup)
   * @param {string} barcode
   * @returns {Promise<object|null>}
   */
  async getVariantByBarcode(barcode) {
    const query = `
      SELECT
        pv.*,
        p.product_name,
        p.brand,
        p.category_id,
        c.category_name,
        COALESCE(
          (SELECT SUM(s.quantity) FROM stock s WHERE s.variant_id = pv.id), 0
        ) AS total_stock
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE LOWER(pv.barcode) = LOWER($1)
        AND pv.deleted_at IS NULL
        AND pv.is_active = true
        AND p.deleted_at IS NULL
        AND p.is_active = true
      LIMIT 1
    `;

    const row = await db.queryOne(query, [barcode]);
    return row ? this._transformVariant(row) : null;
  }

  /**
   * Transform a raw DB row into the API response shape
   * @param {object} row
   * @returns {object}
   */
  _transformVariant(row) {
    return {
      id: row.id,
      product_id: row.product_id,
      variant_name: row.variant_name,
      variantName: row.variant_name,
      sku: row.sku,
      barcode: row.barcode,
      cost_price: row.cost_price ? parseFloat(row.cost_price) : null,
      costPrice: row.cost_price ? parseFloat(row.cost_price) : null,
      wholesale_price: row.wholesale_price ? parseFloat(row.wholesale_price) : null,
      wholesalePrice: row.wholesale_price ? parseFloat(row.wholesale_price) : null,
      current_price: parseFloat(row.current_price),
      currentPrice: parseFloat(row.current_price),
      sale_price: row.sale_price ? parseFloat(row.sale_price) : null,
      salePrice: row.sale_price ? parseFloat(row.sale_price) : null,
      weight_kg: row.weight_kg ? parseFloat(row.weight_kg) : null,
      weightKg: row.weight_kg ? parseFloat(row.weight_kg) : null,
      is_default: row.is_default,
      isDefault: row.is_default,
      is_active: row.is_active,
      isActive: row.is_active,
      display_order: row.display_order,
      displayOrder: row.display_order,
      metadata: row.metadata,
      stock: row.total_stock != null ? parseInt(row.total_stock) : 0,
      total_stock: row.total_stock != null ? parseInt(row.total_stock) : 0,
      totalStock: row.total_stock != null ? parseInt(row.total_stock) : 0,
      total_reserved: row.total_reserved != null ? parseInt(row.total_reserved) : undefined,
      totalReserved: row.total_reserved != null ? parseInt(row.total_reserved) : undefined,
      warehouse_id: row.warehouse_id ? parseInt(row.warehouse_id) : null,
      warehouseId: row.warehouse_id ? parseInt(row.warehouse_id) : null,
      warehouse_name: row.warehouse_name || null,
      warehouseName: row.warehouse_name || null,
      supplier_id: row.supplier_id ? parseInt(row.supplier_id) : null,
      supplierId: row.supplier_id ? parseInt(row.supplier_id) : null,
      supplier_name: row.supplier_name || null,
      supplierName: row.supplier_name || null,
      // Pass through product info if present
      ...(row.product_name && {
        product_name: row.product_name,
        productName: row.product_name,
      }),
      ...(row.brand && { brand: row.brand }),
      ...(row.category_id && { category_id: row.category_id }),
      ...(row.category_name && { category_name: row.category_name }),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export default new VariantService();
