import express from 'express';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError } from '../src/shared/errors/index.js';
import db from '../src/db/postgres.js';
import { logger, auditLogger } from '../src/shared/utils/logger.js';
import { logStockAdjustment, logStockReservation, logStockRelease } from '../src/shared/utils/stockMovementsLogger.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Batch-enrich stock rows with product & warehouse info using two bulk queries
 * instead of N+1 individual queries per stock item.
 *
 * Accepts either a single stock object or an array of stock objects.
 * Always returns an array.
 */
const enrichStockData = async (stocks) => {
  const stockList = Array.isArray(stocks) ? stocks : [stocks];

  if (stockList.length === 0) return [];

  // Collect unique IDs to fetch everything in just three queries
  const warehouseIds = [...new Set(stockList.map((s) => s.warehouse_id).filter(Boolean))];
  const productIds   = [...new Set(stockList.map((s) => s.product_id).filter(Boolean))];
  const variantIds   = [...new Set(stockList.map((s) => s.variant_id).filter(Boolean))];

  // Parallel bulk lookups
  const [warehouses, products, variants] = await Promise.all([
    warehouseIds.length
      ? db.queryMany(
          `SELECT id, warehouse_name, location_address
             FROM warehouses
            WHERE id = ANY($1::int[])`,
          [warehouseIds]
        )
      : [],
    productIds.length
      ? db.queryMany(
          `SELECT id, product_name, sku
             FROM products
            WHERE id = ANY($1::int[])`,
          [productIds]
        )
      : [],
    variantIds.length
      ? db.queryMany(
          `SELECT id, variant_name, sku AS variant_sku, current_price
             FROM product_variants
            WHERE id = ANY($1::int[])`,
          [variantIds]
        )
      : [],
  ]);

  // Build lookup maps for O(1) access
  const warehouseMap = Object.fromEntries(warehouses.map((w) => [w.id, w]));
  const productMap   = Object.fromEntries(products.map((p) => [p.id, p]));
  const variantMap   = Object.fromEntries(variants.map((v) => [v.id, v]));

  return stockList.map((item) => {
    const warehouse    = warehouseMap[item.warehouse_id];
    const product      = productMap[item.product_id];
    const variant      = variantMap[item.variant_id];
    const quantity     = item.quantity ?? 0;
    const reserved     = item.reserved_quantity ?? 0;
    const reorderLevel = item.reorder_level ?? 0;

    return {
      stock_id:           item.id,
      product_id:         item.product_id,
      product_name:       product?.product_name       || 'Unknown Product',
      product_sku:        product?.sku                || '',
      variant_id:         item.variant_id              || null,
      variant_name:       variant?.variant_name        || null,
      variant_sku:        variant?.variant_sku         || null,
      variant_price:      variant?.current_price       || null,
      warehouse_id:       item.warehouse_id,
      warehouse_name:     warehouse?.warehouse_name   || 'Unknown Warehouse',
      warehouse_location: warehouse?.location_address || '',
      quantity,
      reserved_quantity:  reserved,
      quantity_available: quantity - reserved,
      reorder_level:      reorderLevel,
      is_low_stock:       quantity <= reorderLevel,
      last_updated:       item.updated_at || item.created_at,
      created_at:         item.created_at,
    };
  });
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/inventory/stats
// ⚠️  Declared BEFORE /:id so Express never tries to parse "stats" as an ID.
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const statsQuery = `
    SELECT
      COUNT(DISTINCT p.id)                                                AS total_items,
      SUM(COALESCE(s.quantity, 0))                                        AS total_quantity,
      SUM(COALESCE(s.reserved_quantity, 0))                               AS total_reserved,
      COUNT(DISTINCT p.id)
        FILTER (WHERE s.quantity <= s.reorder_level)                      AS low_stock_items,
      COUNT(DISTINCT p.id)
        FILTER (WHERE COALESCE(s.quantity, 0) = 0)                        AS out_of_stock_items
    FROM products p
    LEFT JOIN stock s ON p.id = s.product_id
    WHERE p.deleted_at IS NULL
      AND p.is_active = true
  `;

  const stats = await db.queryOne(statsQuery);

  res.json({
    totalItems:      parseInt(stats.total_items        || 0),
    totalQuantity:   parseInt(stats.total_quantity     || 0),
    totalReserved:   parseInt(stats.total_reserved     || 0),
    lowStockItems:   parseInt(stats.low_stock_items    || 0),
    outOfStockItems: parseInt(stats.out_of_stock_items || 0),
  });
}));

// GET /api/inventory/warehouses/all
// ⚠️  Declared BEFORE /:id for the same routing reason.
router.get('/warehouses/all', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const warehouses = await db.queryMany(
    'SELECT * FROM warehouses WHERE deleted_at IS NULL ORDER BY warehouse_name'
  );
  res.json(warehouses);
}));

// GET /api/inventory
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { warehouse_id, product_id, low_stock } = req.query;

  let query = 'SELECT * FROM stock WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (warehouse_id) {
    query += ` AND warehouse_id = $${paramIndex++}`;
    params.push(parseInt(warehouse_id));
  }

  if (product_id) {
    query += ` AND product_id = $${paramIndex++}`;
    params.push(parseInt(product_id));
  }

  if (low_stock === 'true') {
    query += ' AND quantity <= reorder_level';
  }

  query += ' ORDER BY updated_at DESC';

  const stocks   = await db.queryMany(query, params);
  const enriched = await enrichStockData(stocks);

  res.json(enriched);
}));

// GET /api/inventory/:id
router.get('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stockId = parseInt(req.params.id);

  const stock = await db.queryOne('SELECT * FROM stock WHERE id = $1', [stockId]);
  if (!stock) throw new NotFoundError('Stock item not found');

  const [enriched] = await enrichStockData(stock);
  res.json(enriched);
}));

// PUT /api/inventory/:id/adjust
router.put('/:id/adjust', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stockId    = parseInt(req.params.id);
  const adjustment = parseInt(req.body.adjustment);
  const { reason, type } = req.body;

  if (isNaN(adjustment) || adjustment === 0) {
    throw new ValidationError([{
      field:   'adjustment',
      message: 'A non-zero numeric adjustment amount is required',
    }]);
  }

  const stock = await db.queryOne('SELECT * FROM stock WHERE id = $1', [stockId]);
  if (!stock) throw new NotFoundError('Stock item not found');

  let newQuantity;
  switch (type) {
    case 'set':
      newQuantity = adjustment;
      break;
    case 'remove':
      newQuantity = stock.quantity - Math.abs(adjustment);
      break;
    case 'add':
    default:
      newQuantity = stock.quantity + adjustment;
      break;
  }

  // Guard 1: result cannot be negative
  if (newQuantity < 0) {
    throw new ValidationError([{
      field:   'adjustment',
      message: `Adjustment would result in negative stock (current: ${stock.quantity})`,
    }]);
  }

  // Guard 2: result cannot fall below already-reserved units
  if (newQuantity < stock.reserved_quantity) {
    throw new ValidationError([{
      field:   'quantity',
      message: `Cannot reduce below reserved quantity (${stock.reserved_quantity})`,
    }]);
  }

  logger.info({
    action:           'stock_adjustment_initiated',
    stock_id:         stockId,
    product_id:       stock.product_id,
    warehouse_id:     stock.warehouse_id,
    current_quantity: stock.quantity,
    adjustment,
    new_quantity:     newQuantity,
    reason,
  }, `[Inventory] Adjusting stock ${adjustment > 0 ? '+' : ''}${adjustment} units`);

  await db.transaction(async (client) => {
    await client.query(
      'UPDATE stock SET quantity = $1, updated_at = NOW() WHERE id = $2',
      [newQuantity, stockId]
    );

    await client.query(
      `SELECT record_stock_movement(
         $1::INTEGER, $2::INTEGER, $3::INTEGER, $4::INTEGER, $5::stock_movement_type,
         $6::INTEGER, $7::TEXT, 'manual'::VARCHAR, NULL::INTEGER,
         NULL::INTEGER, NULL::INTEGER, 0::DECIMAL, NULL::DECIMAL,
         NULL::INTEGER, NULL::TEXT, NULL::JSONB
       )`,
      [
        stockId,
        stock.product_id,
        stock.variant_id,
        stock.warehouse_id,
        adjustment > 0 ? 'in' : 'out',
        Math.abs(adjustment),
        reason || 'Manual adjustment',
      ]
    );
  });

  auditLogger.info({
    action:          'stock_adjusted',
    stock_id:        stockId,
    product_id:      stock.product_id,
    warehouse_id:    stock.warehouse_id,
    quantity_before: stock.quantity,
    quantity_after:  newQuantity,
    adjustment,
    reason:          reason || 'Manual adjustment',
    user_id:         req.user?.id,
    timestamp:       new Date().toISOString(),
  }, `[Inventory] Stock adjusted: ${stock.quantity} → ${newQuantity}`);

  const updated    = await db.queryOne('SELECT * FROM stock WHERE id = $1', [stockId]);
  // enrichStockData already resolves product/warehouse names — no extra queries needed
  const [enriched] = await enrichStockData(updated);

  logStockAdjustment({
    stock_id:        stockId,
    product_id:      stock.product_id,
    product_name:    enriched.product_name,
    warehouse_id:    stock.warehouse_id,
    warehouse_name:  enriched.warehouse_name,
    quantity_before: stock.quantity,
    quantity_after:  newQuantity,
    adjustment,
    reason:          reason || 'Manual adjustment',
    user_id:         req.user?.id,
  });

  res.json({
    success: true,
    message: 'Stock adjusted successfully',
    stock:   enriched,
  });
}));

// PUT /api/inventory/:id/reserve
router.put('/:id/reserve', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stockId  = parseInt(req.params.id);
  const quantity = parseInt(req.body.quantity);

  if (isNaN(quantity) || quantity <= 0) {
    throw new ValidationError([{ field: 'quantity', message: 'Valid positive quantity required' }]);
  }

  // SELECT FOR UPDATE locks the row for the transaction duration, preventing
  // two simultaneous requests from both reading the same available balance and
  // both succeeding — which would cause silent over-reservation.
  const updated = await db.transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM stock WHERE id = $1 FOR UPDATE',
      [stockId]
    );
    const stock = rows[0] ?? null;

    if (!stock) throw new NotFoundError('Stock item not found');

    const available = stock.quantity - stock.reserved_quantity;
    if (available < quantity) {
      throw new ValidationError([{
        field:   'quantity',
        message: `Insufficient available stock. Available: ${available}`,
      }]);
    }

    const result = await client.query(
      `UPDATE stock
          SET reserved_quantity = reserved_quantity + $1,
              updated_at        = NOW()
        WHERE id = $2
    RETURNING *`,
      [quantity, stockId]
    );

    return result.rows[0];
  });

  const [enriched] = await enrichStockData(updated);

  logStockReservation({
    stock_id:       stockId,
    product_id:     updated.product_id,
    product_name:   enriched.product_name,
    warehouse_id:   updated.warehouse_id,
    warehouse_name: enriched.warehouse_name,
    quantity,
    user_id:        req.user?.id,
  });

  res.json({
    success: true,
    message: 'Stock reserved successfully',
    stock:   enriched,
  });
}));

// PUT /api/inventory/:id/release
router.put('/:id/release', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stockId  = parseInt(req.params.id);
  const quantity = parseInt(req.body.quantity);

  if (isNaN(quantity) || quantity <= 0) {
    throw new ValidationError([{ field: 'quantity', message: 'Valid positive quantity required' }]);
  }

  // Same SELECT FOR UPDATE pattern — prevents double-release race conditions.
  const updated = await db.transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM stock WHERE id = $1 FOR UPDATE',
      [stockId]
    );
    const stock = rows[0] ?? null;

    if (!stock) throw new NotFoundError('Stock item not found');

    if (stock.reserved_quantity < quantity) {
      throw new ValidationError([{
        field:   'quantity',
        message: `Cannot release more than reserved (${stock.reserved_quantity})`,
      }]);
    }

    const result = await client.query(
      `UPDATE stock
          SET reserved_quantity = reserved_quantity - $1,
              updated_at        = NOW()
        WHERE id = $2
    RETURNING *`,
      [quantity, stockId]
    );

    return result.rows[0];
  });

  const [enriched] = await enrichStockData(updated);

  logStockRelease({
    stock_id:       stockId,
    product_id:     updated.product_id,
    product_name:   enriched.product_name,
    warehouse_id:   updated.warehouse_id,
    warehouse_name: enriched.warehouse_name,
    quantity,
    user_id:        req.user?.id,
    reason:         'Manual release',
  });

  res.json({
    success: true,
    message: 'Stock released successfully',
    stock:   enriched,
  });
}));

export default router;