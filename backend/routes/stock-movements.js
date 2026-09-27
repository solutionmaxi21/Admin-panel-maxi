import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError } from '../src/shared/errors/index.js';
import db from '../src/db/postgres.js';
import { logger, auditLogger } from '../src/shared/utils/logger.js';
import {
  logWarehouseTransfer,
  logTransferError,
  logCostAnalysis,
  readRecentLogs,
  getLogStats
} from '../src/shared/utils/stockMovementsLogger.js';

const router = express.Router();

// Helper function to calculate optimal warehouse for transfers
const calculateTransferCost = async (fromWarehouseId, toWarehouseId, quantity, productId) => {
  // Get warehouse locations
  const warehouses = await db.queryMany(
    `SELECT w.id, w.warehouse_name, w.location_address, gw.id as wilaya_id
     FROM warehouses w
     LEFT JOIN guepex_wilayas gw ON w.wilaya_id = gw.id
     WHERE w.id = ANY($1)`,
    [[fromWarehouseId, toWarehouseId]]
  );

  const fromWarehouse = warehouses.find(w => w.id === fromWarehouseId);
  const toWarehouse = warehouses.find(w => w.id === toWarehouseId);

  if (!fromWarehouse || !toWarehouse) {
    throw new NotFoundError('One or both warehouses not found');
  }

  // Get product weight for shipping calculation
  const product = await db.queryOne(
    'SELECT weight_kg, current_price FROM products WHERE id = $1',
    [productId]
  );

  // Calculate base transfer cost
  // Factors: distance (zone-based), weight, quantity
  let baseCost = 0;
  
  // Same wilaya = low cost
  if (fromWarehouse.wilaya_id === toWarehouse.wilaya_id) {
    baseCost = 200; // Base 200 DZD for same wilaya
  } else {
    // Different wilaya - estimate based on zones (simplified)
    baseCost = 500; // Base 500 DZD for different wilaya
  }

  // Add weight-based cost
  const weight = (product?.weight_kg || 1) * quantity;
  const weightCost = weight * 50; // 50 DZD per kg

  // Add handling cost per item
  const handlingCost = quantity * 20; // 20 DZD per item

  const totalCost = baseCost + weightCost + handlingCost;

  return {
    baseCost,
    weightCost,
    handlingCost,
    totalCost,
    fromWarehouse: fromWarehouse.warehouse_name,
    toWarehouse: toWarehouse.warehouse_name
  };
};

// POST /api/stock-movements/transfer - Transfer stock between warehouses
router.post('/transfer', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  let {
    product_id,
    variant_id,
    from_warehouse_id,
    to_warehouse_id,
    quantity,
    reason,
    notes,
    created_by
  } = req.body;

  // If variant_id not provided, resolve default variant from product_id
  if (!variant_id && product_id) {
    const defaultVariant = await db.queryOne(
      'SELECT id FROM product_variants WHERE product_id = $1 ORDER BY id ASC LIMIT 1',
      [product_id]
    );
    if (defaultVariant) {
      variant_id = defaultVariant.id;
    }
  }

  // Log transfer initiation
  logger.info({
    action: 'stock_transfer_initiated',
    product_id,
    from_warehouse_id,
    to_warehouse_id,
    quantity,
    user_id: created_by || req.user?.id
  }, '[Stock Movement] Transfer initiated');

  // Validation
  if (!product_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
    throw new ValidationError([{
      field: 'required',
      message: 'product_id, from_warehouse_id, to_warehouse_id, and quantity are required'
    }]);
  }

  if (from_warehouse_id === to_warehouse_id) {
    throw new ValidationError([{
      field: 'warehouses',
      message: 'Source and destination warehouses must be different'
    }]);
  }

  if (quantity <= 0) {
    throw new ValidationError([{
      field: 'quantity',
      message: 'Quantity must be greater than 0'
    }]);
  }

  // Calculate transfer cost
  const costBreakdown = await calculateTransferCost(
    parseInt(from_warehouse_id),
    parseInt(to_warehouse_id),
    parseInt(quantity),
    parseInt(product_id)
  );

  logger.info({
    action: 'transfer_cost_calculated',
    product_id,
    cost_breakdown: costBreakdown
  }, `[Stock Movement] Transfer cost: ${costBreakdown.totalCost} DZD`);

  // Start transaction
  let result;
  try {
    result = await db.transaction(async (client) => {
    // Check source warehouse stock
    const sourceStock = await client.queryOne(
      `SELECT s.*, p.product_name, pv.cost_price 
       FROM stock s
       INNER JOIN product_variants pv ON s.variant_id = pv.id
       INNER JOIN products p ON pv.product_id = p.id
       WHERE s.variant_id = $1 AND s.warehouse_id = $2`,
      [variant_id, from_warehouse_id]
    );

    if (!sourceStock) {
      throw new NotFoundError('Product not found in source warehouse');
    }

    const available = sourceStock.quantity - sourceStock.reserved_quantity;
    if (available < quantity) {
      throw new ValidationError([{
        field: 'quantity',
        message: `Insufficient stock. Available: ${available}, Requested: ${quantity}`
      }]);
    }

    // Check if destination warehouse has stock record
    let destStock = await client.queryOne(
      'SELECT * FROM stock WHERE variant_id = $1 AND warehouse_id = $2',
      [variant_id, to_warehouse_id]
    );

    // Create destination stock record if doesn't exist
    if (!destStock) {
      await client.query(
        `INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, 0, 0, NOW(), NOW())`,
        [product_id, variant_id, to_warehouse_id]
      );
      
      destStock = await client.queryOne(
        'SELECT * FROM stock WHERE variant_id = $1 AND warehouse_id = $2',
        [variant_id, to_warehouse_id]
      );
    }

    // Update source warehouse (decrease quantity)
    await client.query(
      'UPDATE stock SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
      [quantity, sourceStock.id]
    );

    // Update destination warehouse (increase quantity)
    await client.query(
      'UPDATE stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
      [quantity, destStock.id]
    );

    // Record movement OUT from source warehouse
    const movementOutId = await client.queryOne(
      `INSERT INTO stock_movements (
        stock_id, product_id, variant_id, warehouse_id, movement_type, quantity,
        quantity_before, quantity_after,
        from_warehouse_id, to_warehouse_id, transfer_cost,
        reason, reference_type, unit_cost, total_value,
        created_by, notes, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, 'transfer_out', $5,
        $6, $6 - $5,
        $7, $8, $9,
        $10, 'transfer', $11, $11 * $5,
        $12, $13, $14, NOW()
      ) RETURNING id`,
      [
        sourceStock.id,
        product_id,
        variant_id,
        from_warehouse_id,
        quantity,
        sourceStock.quantity,
        from_warehouse_id,
        to_warehouse_id,
        costBreakdown.totalCost,
        reason || 'Warehouse transfer',
        sourceStock.cost_price || 0,
        created_by || null,
        notes || null,
        JSON.stringify({ costBreakdown })
      ]
    );

    // Record movement IN to destination warehouse
    const movementInId = await client.queryOne(
      `INSERT INTO stock_movements (
        stock_id, product_id, variant_id, warehouse_id, movement_type, quantity,
        quantity_before, quantity_after,
        from_warehouse_id, to_warehouse_id, transfer_cost,
        reason, reference_type, unit_cost, total_value,
        created_by, notes, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, 'transfer_in', $5,
        $6, $6 + $5,
        $7, $8, $9,
        $10, 'transfer', $11, $11 * $5,
        $12, $13, $14, NOW()
      ) RETURNING id`,
      [
        destStock.id,
        product_id,
        variant_id,
        to_warehouse_id,
        quantity,
        destStock.quantity,
        from_warehouse_id,
        to_warehouse_id,
        costBreakdown.totalCost,
        reason || 'Warehouse transfer',
        sourceStock.cost_price || 0,
        created_by || null,
        notes || null,
        JSON.stringify({ costBreakdown, linkedMovementOut: movementOutId.id })
      ]
    );

    return {
      movementOutId: movementOutId.id,
      movementInId: movementInId.id,
      costBreakdown
    };
  });
  } catch (error) {
    // Log transfer error to dedicated log
    logTransferError(error, {
      product_id,
      from_warehouse_id,
      to_warehouse_id,
      quantity,
      user_id: created_by || req.user?.id
    });
    throw error; // Re-throw to be handled by error handler
  }

  // Get product and warehouse names for detailed logging
  const product = await db.queryOne('SELECT product_name FROM products WHERE id = $1', [product_id]);
  const warehouses = await db.queryMany(
    'SELECT id, warehouse_name FROM warehouses WHERE id = ANY($1)',
    [[from_warehouse_id, to_warehouse_id]]
  );
  const fromWarehouse = warehouses.find(w => w.id === parseInt(from_warehouse_id));
  const toWarehouse = warehouses.find(w => w.id === parseInt(to_warehouse_id));

  // Log to dedicated stock movements log file
  logWarehouseTransfer({
    product_id,
    product_name: product?.product_name,
    from_warehouse_id,
    from_warehouse_name: fromWarehouse?.warehouse_name,
    to_warehouse_id,
    to_warehouse_name: toWarehouse?.warehouse_name,
    quantity,
    transfer_cost: costBreakdown.totalCost,
    cost_breakdown: costBreakdown,
    reason,
    notes,
    user_id: created_by || req.user?.id,
    movement_ids: {
      movement_out: result.movementOutId,
      movement_in: result.movementInId
    }
  });

  // Audit log for successful transfer
  auditLogger.info({
    action: 'stock_transferred',
    product_id,
    from_warehouse_id,
    to_warehouse_id,
    quantity,
    movement_out_id: result.movementOutId,
    movement_in_id: result.movementInId,
    transfer_cost: costBreakdown.totalCost,
    user_id: created_by || req.user?.id,
    reason,
    timestamp: new Date().toISOString()
  }, `[Stock Movement] Transfer completed: ${quantity} units from warehouse ${from_warehouse_id} to ${to_warehouse_id}`);

  logger.info({
    action: 'stock_transfer_completed',
    product_id,
    quantity,
    cost: costBreakdown.totalCost,
    movements: [result.movementOutId, result.movementInId]
  }, '[Stock Movement] Transfer successful');

  res.json({
    success: true,
    message: 'Stock transferred successfully',
    transfer: {
      product_id,
      from_warehouse_id,
      to_warehouse_id,
      quantity,
      ...result
    }
  });
}));

// GET /api/stock-movements - List all stock movements
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const {
    product_id,
    warehouse_id,
    movement_type,
    from_date,
    to_date,
    limit = 100,
    offset = 0
  } = req.query;

  let query = 'SELECT * FROM v_stock_movements_detailed WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (product_id) {
    query += ` AND product_id = $${paramIndex++}`;
    params.push(parseInt(product_id));
  }

  if (warehouse_id) {
    query += ` AND warehouse_id = $${paramIndex++}`;
    params.push(parseInt(warehouse_id));
  }

  if (movement_type) {
    query += ` AND movement_type = $${paramIndex++}`;
    params.push(movement_type);
  }

  if (from_date) {
    query += ` AND created_at >= $${paramIndex++}`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND created_at <= $${paramIndex++}`;
    params.push(to_date);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit), parseInt(offset));

  const movements = await db.queryMany(query, params);

  res.json({
    movements,
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: movements.length
    }
  });
}));

// GET /api/stock-movements/transfers/summary - Get transfer summary by warehouse
router.get('/transfers/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const summary = await db.queryMany('SELECT * FROM v_warehouse_transfers_summary');
  res.json(summary);
}));

// GET /api/stock-movements/costs/analysis - Cost analysis
router.get('/costs/analysis', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { months = 6 } = req.query;

  const safeMonths = Math.max(1, Math.min(parseInt(months) || 6, 60));
  const analysis = await db.queryMany(
    `SELECT * FROM v_stock_movement_costs 
     WHERE month >= CURRENT_DATE - ($1 || ' months')::INTERVAL
     ORDER BY month DESC, total_transfer_cost DESC`,
    [safeMonths.toString()]
  );

  res.json(analysis);
}));

// GET /api/stock-movements/optimize/route - Suggest optimal warehouse for product
router.get('/optimize/route', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { product_id, variant_id, to_wilaya_id, quantity = 1 } = req.query;

  if (!product_id || !to_wilaya_id) {
    throw new ValidationError([{
      field: 'required',
      message: 'product_id and to_wilaya_id are required'
    }]);
  }

  // Find warehouses that have the product in stock
  const stockFilter = variant_id ? 's.variant_id = $1' : 's.product_id = $1';
  const stockFilterValue = variant_id ? variant_id : product_id;
  const availableWarehouses = await db.queryMany(
    `SELECT s.*, w.warehouse_name, w.location_address, w.wilaya_id,
            (s.quantity - s.reserved_quantity) as available_quantity
     FROM stock s
     INNER JOIN warehouses w ON s.warehouse_id = w.id
     WHERE ${stockFilter} 
       AND (s.quantity - s.reserved_quantity) >= $2
       AND w.deleted_at IS NULL
     ORDER BY available_quantity DESC`,
    [stockFilterValue, parseInt(quantity)]
  );

  if (availableWarehouses.length === 0) {
    return res.json({
      available: false,
      message: 'Product not available in sufficient quantity in any warehouse'
    });
  }

  // Calculate cost from each warehouse
  const costEstimates = await Promise.all(
    availableWarehouses.map(async (warehouse) => {
      // Simplified cost calculation based on wilaya proximity
      const sameWilaya = warehouse.wilaya_id === parseInt(to_wilaya_id);
      const baseCost = sameWilaya ? 200 : 500;
      
      const product = await db.queryOne(
        'SELECT weight_kg FROM products WHERE id = $1',
        [product_id]
      );
      
      const weight = (product?.weight_kg || 1) * parseInt(quantity);
      const weightCost = weight * 50;
      const handlingCost = parseInt(quantity) * 20;
      const totalCost = baseCost + weightCost + handlingCost;

      return {
        warehouse_id: warehouse.warehouse_id,
        warehouse_name: warehouse.warehouse_name,
        available_quantity: warehouse.available_quantity,
        same_wilaya: sameWilaya,
        estimated_cost: totalCost,
        cost_breakdown: {
          base: baseCost,
          weight: weightCost,
          handling: handlingCost
        }
      };
    })
  );

  // Sort by cost (cheapest first)
  costEstimates.sort((a, b) => a.estimated_cost - b.estimated_cost);

  res.json({
    available: true,
    optimal_warehouse: costEstimates[0],
    alternatives: costEstimates.slice(1),
    recommendation: costEstimates[0].same_wilaya
      ? 'Ship from local warehouse to minimize costs'
      : 'Consider consolidating stock in destination wilaya for future orders'
  });
}));

// GET /api/stock-movements/:id - Get single movement detail
router.get('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const movementId = parseInt(req.params.id);

  const movement = await db.queryOne(
    'SELECT * FROM v_stock_movements_detailed WHERE id = $1',
    [movementId]
  );

  if (!movement) {
    throw new NotFoundError('Stock movement not found');
  }

  res.json(movement);
}));

// GET /api/stock-movements/logs/recent - Get recent log entries
router.get('/logs/recent', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { lines = 100 } = req.query;
  
  logger.info({
    action: 'logs_accessed',
    requested_lines: lines,
    user_id: req.user?.id
  }, '[Stock Movement] Logs accessed');

  const logs = readRecentLogs(parseInt(lines));
  
  res.json({
    success: true,
    count: logs.length,
    logs
  });
}));

// GET /api/stock-movements/logs/stats - Get log file statistics
router.get('/logs/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stats = getLogStats();
  
  res.json({
    success: true,
    stats
  });
}));

export default router;
