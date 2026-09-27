import pino from 'pino';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = join(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Stock movements log file path
const stockMovementsLogPath = join(logsDir, 'stock-movements.log');

/**
 * Dedicated logger for stock movements
 * Logs to both console and file for comprehensive audit trail
 */
const stockMovementsLogger = pino({
  level: 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'stock-movements',
    env: process.env.NODE_ENV || 'development'
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
}, pino.destination({
  dest: stockMovementsLogPath,
  sync: true, // Synchronous writes for audit trail integrity
  mkdir: true
}));

/**
 * Log stock movement event
 * @param {string} type - Movement type (transfer, adjustment, in, out, etc.)
 * @param {object} data - Movement data
 */
export const logStockMovement = (type, data) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    movement_type: type,
    ...data
  };

  stockMovementsLogger.info(logEntry, `Stock Movement: ${type}`);
  
  return logEntry;
};

/**
 * Log warehouse transfer
 */
export const logWarehouseTransfer = (data) => {
  return logStockMovement('transfer', {
    action: 'warehouse_transfer',
    product_id: data.product_id,
    product_name: data.product_name,
    from_warehouse_id: data.from_warehouse_id,
    from_warehouse_name: data.from_warehouse_name,
    to_warehouse_id: data.to_warehouse_id,
    to_warehouse_name: data.to_warehouse_name,
    quantity: data.quantity,
    transfer_cost: data.transfer_cost,
    cost_breakdown: data.cost_breakdown,
    reason: data.reason,
    notes: data.notes,
    user_id: data.user_id,
    movement_ids: data.movement_ids
  });
};

/**
 * Log stock adjustment
 */
export const logStockAdjustment = (data) => {
  return logStockMovement('adjustment', {
    action: 'stock_adjustment',
    stock_id: data.stock_id,
    product_id: data.product_id,
    product_name: data.product_name,
    warehouse_id: data.warehouse_id,
    warehouse_name: data.warehouse_name,
    quantity_before: data.quantity_before,
    quantity_after: data.quantity_after,
    adjustment: data.adjustment,
    reason: data.reason,
    user_id: data.user_id,
    movement_id: data.movement_id
  });
};

/**
 * Log stock reservation (for orders)
 */
export const logStockReservation = (data) => {
  return logStockMovement('reservation', {
    action: 'stock_reserved',
    stock_id: data.stock_id,
    product_id: data.product_id,
    product_name: data.product_name,
    warehouse_id: data.warehouse_id,
    quantity: data.quantity,
    order_id: data.order_id,
    order_number: data.order_number,
    user_id: data.user_id
  });
};

/**
 * Log stock release (cancelled order)
 */
export const logStockRelease = (data) => {
  return logStockMovement('release', {
    action: 'stock_released',
    stock_id: data.stock_id,
    product_id: data.product_id,
    product_name: data.product_name,
    warehouse_id: data.warehouse_id,
    quantity: data.quantity,
    order_id: data.order_id,
    order_number: data.order_number,
    reason: data.reason,
    user_id: data.user_id
  });
};

/**
 * Log stock in (purchase, return from customer)
 */
export const logStockIn = (data) => {
  return logStockMovement('in', {
    action: 'stock_in',
    stock_id: data.stock_id,
    product_id: data.product_id,
    product_name: data.product_name,
    warehouse_id: data.warehouse_id,
    warehouse_name: data.warehouse_name,
    quantity: data.quantity,
    quantity_before: data.quantity_before,
    quantity_after: data.quantity_after,
    reason: data.reason,
    reference_type: data.reference_type,
    reference_id: data.reference_id,
    unit_cost: data.unit_cost,
    total_value: data.total_value,
    user_id: data.user_id
  });
};

/**
 * Log stock out (sale, damage, loss)
 */
export const logStockOut = (data) => {
  return logStockMovement('out', {
    action: 'stock_out',
    stock_id: data.stock_id,
    product_id: data.product_id,
    product_name: data.product_name,
    warehouse_id: data.warehouse_id,
    warehouse_name: data.warehouse_name,
    quantity: data.quantity,
    quantity_before: data.quantity_before,
    quantity_after: data.quantity_after,
    reason: data.reason,
    reference_type: data.reference_type,
    reference_id: data.reference_id,
    user_id: data.user_id
  });
};

/**
 * Log damaged stock
 */
export const logDamagedStock = (data) => {
  return logStockMovement('damaged', {
    action: 'stock_damaged',
    stock_id: data.stock_id,
    product_id: data.product_id,
    product_name: data.product_name,
    warehouse_id: data.warehouse_id,
    quantity: data.quantity,
    damage_reason: data.reason,
    damage_type: data.damage_type,
    user_id: data.user_id,
    notes: data.notes
  });
};

/**
 * Log cost analysis query
 */
export const logCostAnalysis = (data) => {
  stockMovementsLogger.info({
    action: 'cost_analysis_queried',
    date_range: data.date_range,
    total_transfer_cost: data.total_transfer_cost,
    movement_count: data.movement_count,
    avg_cost: data.avg_cost,
    user_id: data.user_id,
    timestamp: new Date().toISOString()
  }, 'Cost Analysis Query');
};

/**
 * Log low stock alert
 */
export const logLowStockAlert = (data) => {
  stockMovementsLogger.warn({
    action: 'low_stock_alert',
    stock_id: data.stock_id,
    product_id: data.product_id,
    product_name: data.product_name,
    warehouse_id: data.warehouse_id,
    warehouse_name: data.warehouse_name,
    current_quantity: data.current_quantity,
    reorder_level: data.reorder_level,
    timestamp: new Date().toISOString()
  }, `Low Stock Alert: ${data.product_name} (${data.current_quantity} units)`);
};

/**
 * Log stock transfer error
 */
export const logTransferError = (error, data) => {
  stockMovementsLogger.error({
    action: 'transfer_error',
    error_message: error.message,
    error_stack: error.stack,
    product_id: data.product_id,
    from_warehouse_id: data.from_warehouse_id,
    to_warehouse_id: data.to_warehouse_id,
    quantity: data.quantity,
    user_id: data.user_id,
    timestamp: new Date().toISOString()
  }, `Transfer Error: ${error.message}`);
};

/**
 * Get stock movements log file path
 */
export const getLogFilePath = () => stockMovementsLogPath;

/**
 * Read recent log entries
 * @param {number} lines - Number of lines to read (default: 100)
 */
export const readRecentLogs = (lines = 100) => {
  try {
    if (!fs.existsSync(stockMovementsLogPath)) {
      return [];
    }

    const content = fs.readFileSync(stockMovementsLogPath, 'utf8');
    const allLines = content.split('\n').filter(line => line.trim());
    const recentLines = allLines.slice(-lines);
    
    return recentLines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch (error) {
    stockMovementsLogger.error({ error }, 'Error reading log file');
    return [];
  }
};

/**
 * Get log statistics
 */
export const getLogStats = () => {
  try {
    if (!fs.existsSync(stockMovementsLogPath)) {
      return {
        exists: false,
        size: 0,
        lines: 0,
        lastModified: null
      };
    }

    const stats = fs.statSync(stockMovementsLogPath);
    const content = fs.readFileSync(stockMovementsLogPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim()).length;

    return {
      exists: true,
      size: stats.size,
      sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
      lines,
      lastModified: stats.mtime,
      path: stockMovementsLogPath
    };
  } catch (error) {
    stockMovementsLogger.error({ error }, 'Error getting log stats');
    return {
      exists: false,
      error: error.message
    };
  }
};

export default stockMovementsLogger;
