/**
 * Dashboard Routes - PostgreSQL Version
 * Provides dashboard statistics with optimized queries
 */

import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { MetadataService, ProductService, OrderService } from '../src/services/index.js';
import db from '../src/db/postgres.js';

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Get comprehensive dashboard statistics
 * Optimized with single query aggregations
 */
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // Execute all stat queries in parallel for performance
  const [
    dashboardStats,
    productStats,
    orderStats
  ] = await Promise.all([
    MetadataService.getDashboardStats(),
    ProductService.getProductStats(),
    OrderService.getOrderStats('month')
  ]);

  // Get low stock and out of stock counts
  const stockQuery = `
    SELECT
      COUNT(DISTINCT p.id) FILTER (WHERE s.quantity > 0 AND s.quantity <= 10) as low_stock,
      COUNT(DISTINCT p.id) FILTER (WHERE s.product_id IS NULL OR s.quantity = 0) as out_of_stock
    FROM products p
    LEFT JOIN stock s ON p.id = s.product_id
    WHERE p.deleted_at IS NULL AND p.is_active = true
  `;
  const stockStats = await db.queryOne(stockQuery);

  res.json({
    products: {
      total: parseInt(dashboardStats.total_products),
      active: parseInt(dashboardStats.active_products),
      categories: parseInt(dashboardStats.total_categories),
      lowStock: parseInt(stockStats.low_stock),
      outOfStock: parseInt(stockStats.out_of_stock),
      avgPrice: parseFloat(productStats.avg_price).toFixed(2),
      recentlyAdded: parseInt(productStats.products_added_last_30_days)
    },
    orders: {
      total: parseInt(orderStats.total_orders),
      pending: parseInt(orderStats.pending_orders),
      processing: parseInt(orderStats.processing_orders),
      shipped: parseInt(orderStats.shipped_orders),
      delivered: parseInt(orderStats.delivered_orders),
      cancelled: parseInt(orderStats.cancelled_orders),
      monthly: parseInt(orderStats.month_orders),
      prevMonthly: parseInt(orderStats.prev_month_orders)
    },
    revenue: {
      total: parseFloat(orderStats.total_revenue).toFixed(2),
      average: parseFloat(orderStats.avg_order_value).toFixed(2),
      monthly: parseFloat(orderStats.monthly_revenue).toFixed(2),
      period: parseFloat(orderStats.period_revenue).toFixed(2),
      prevMonthly: parseFloat(orderStats.prev_monthly_revenue || 0).toFixed(2),
      prevPeriod: parseFloat(orderStats.prev_period_revenue || 0).toFixed(2)
    },
    customers: {
      total: parseInt(dashboardStats.total_users),
      newThisMonth: parseInt(dashboardStats.new_users_this_month)
    },
    inventory: {
      totalStock: parseInt(dashboardStats.total_stock_quantity),
      outOfStockProducts: parseInt(dashboardStats.out_of_stock_products)
    },
    reviews: {
      total: parseInt(dashboardStats.total_reviews),
      averageRating: parseFloat(dashboardStats.average_rating).toFixed(1)
    }
  });
}));

/**
 * GET /api/dashboard/recent-orders
 * Get recent orders for dashboard
 */
router.get('/recent-orders', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const query = `
    SELECT 
      o.id,
      o.order_number,
      o.user_id,
      u.username,
      u.email,
      u.full_name,
      o.total_amount as total,
      o.current_status as status,
      o.payment_status,
      o.payment_method,
      o.ordered_at as created_at,
      COUNT(oi.id) as item_count
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    GROUP BY o.id, o.order_number, o.user_id, o.current_status, o.payment_status, o.payment_method, o.ordered_at, o.total_amount, u.username, u.email, u.full_name
    ORDER BY o.ordered_at DESC
    LIMIT $1
  `;

  const orders = await db.queryMany(query, [limit]);

  // Transform orders to include customerName
  const transformedOrders = orders.map(order => ({
    ...order,
    orderNumber: order.order_number,
    customerName: order.full_name || order.email || order.username || 'Guest'
  }));

  res.json(transformedOrders);
}));

/**
 * GET /api/dashboard/top-products
 * Get top selling products
 */
router.get('/top-products', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const period = req.query.period || 'all'; // day, week, month, year, all

  const intervalMap = {
    day: '1 day',
    week: '7 days',
    month: '30 days',
    year: '365 days',
    all: '100 years' // effectively all-time
  };

  const interval = intervalMap[period] || '100 years';

  const query = `
    SELECT 
      p.id as product_id,
      p.product_name as name,
      p.sku,
      p.current_price,
      SUM(oi.quantity) as total_sold,
      SUM(oi.line_total) as total_revenue,
      COUNT(DISTINCT oi.order_id) as order_count
    FROM products p
    INNER JOIN order_items oi ON p.id = oi.product_id
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE o.ordered_at >= NOW() - INTERVAL '${interval}'
      AND o.current_status IN ('shipped', 'delivered')
      AND p.deleted_at IS NULL
      AND p.is_active = true
    GROUP BY p.id, p.product_name, p.sku, p.current_price
    ORDER BY total_sold DESC
    LIMIT $1
  `;

  const products = await db.queryMany(query, [limit]);

  // Transform products to match frontend expectations
  const transformedProducts = products.map(product => ({
    id: product.product_id,
    name: product.name,
    sku: product.sku,
    price: product.current_price,
    salesCount: parseInt(product.total_sold),
    revenue: parseFloat(product.total_revenue),
    orderCount: parseInt(product.order_count)
  }));

  res.json(transformedProducts);
}));

/**
 * GET /api/dashboard/revenue-chart
 * Get revenue data for chart (daily/weekly/monthly)
 * Alias for sales-chart for backward compatibility
 */
router.get('/revenue-chart', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const period = req.query.period || 'week';

  // Smart grouping based on period
  let interval, trunc;

  switch (period) {
    case 'day':
      interval = '1 day';
      trunc = 'hour';
      break;
    case 'week':
      interval = '7 days';
      trunc = 'day';
      break;
    case 'month':
      interval = '30 days';
      trunc = 'day';
      break;
    case 'year':
      interval = '365 days';
      trunc = 'month';
      break;
    default:
      interval = '7 days';
      trunc = 'day';
  }

  const query = `
    SELECT 
      DATE_TRUNC('${trunc}', ordered_at) as period,
      COUNT(*) as orders,
      COALESCE(SUM(subtotal - discount_amount), 0) as revenue
    FROM orders
    WHERE ordered_at >= NOW() - INTERVAL '${interval}'
      AND current_status IN ('shipped', 'delivered')
    GROUP BY DATE_TRUNC('${trunc}', ordered_at)
    ORDER BY DATE_TRUNC('${trunc}', ordered_at) ASC
  `;

  const data = await db.queryMany(query);

  // Format dates for frontend
  const formattedData = data.map(row => ({
    date: row.period,
    orders: parseInt(row.orders),
    revenue: parseFloat(row.revenue)
  }));

  res.json(formattedData);
}));

/**
 * GET /api/dashboard/sales-chart
 * Get sales data for chart (primary endpoint)
 */
router.get('/sales-chart', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const period = req.query.period || 'week';

  // Smart grouping based on period
  let interval, trunc, whereClause;

  switch (period) {
    case 'day':
      interval = '1 day';
      trunc = 'hour';
      whereClause = `ordered_at >= NOW() - INTERVAL '1 day'`;
      break;
    case 'week':
      interval = '7 days';
      trunc = 'day';
      whereClause = `ordered_at >= NOW() - INTERVAL '7 days'`;
      break;
    case 'month':
      interval = '30 days';
      trunc = 'day';
      whereClause = `ordered_at >= NOW() - INTERVAL '30 days'`;
      break;
    case 'year':
      interval = '365 days';
      trunc = 'month';
      whereClause = `ordered_at >= NOW() - INTERVAL '365 days'`;
      break;
    case 'all':
      trunc = 'month';
      whereClause = '1=1'; // No date filter
      break;
    default:
      interval = '7 days';
      trunc = 'day';
      whereClause = `ordered_at >= NOW() - INTERVAL '7 days'`;
  }

  const query = `
    SELECT 
      DATE_TRUNC('${trunc}', ordered_at) as period,
      COUNT(*) as orders,
      COALESCE(SUM(subtotal - discount_amount), 0) as revenue
    FROM orders
    WHERE ${whereClause}
      AND current_status IN ('shipped', 'delivered')
    GROUP BY DATE_TRUNC('${trunc}', ordered_at)
    ORDER BY DATE_TRUNC('${trunc}', ordered_at) ASC
  `;

  const data = await db.queryMany(query);

  // Format dates for frontend
  const formattedData = data.map(row => ({
    date: row.period,
    orders: parseInt(row.orders),
    revenue: parseFloat(row.revenue)
  }));

  res.json(formattedData);
}));

/**
 * GET /api/dashboard/order-status-distribution
 * Get order status distribution for pie chart
 */
router.get('/order-status-distribution', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const period = req.query.period || 'month';

  const intervalMap = {
    day: '1 day',
    week: '7 days',
    month: '30 days',
    year: '365 days',
    all: '100 years' // Effectively all time
  };

  const interval = intervalMap[period] || '30 days';

  const query = `
    SELECT 
      current_status as order_status,
      COUNT(*) as count,
      SUM(subtotal - discount_amount) as total_value
    FROM orders
    WHERE ordered_at >= NOW() - INTERVAL '${interval}'
    GROUP BY current_status
    ORDER BY count DESC
  `;

  const distribution = await db.queryMany(query);
  res.json(distribution);
}));

/**
 * GET /api/dashboard/category-sales
 * Get sales by category
 */
router.get('/category-sales', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const period = req.query.period || 'all';

  const intervalMap = {
    week: '7 days',
    month: '30 days',
    year: '365 days',
    all: '100 years' // effectively all-time
  };

  const interval = intervalMap[period] || '100 years';

  const query = `
    SELECT 
      c.id as category_id,
      c.category_name as name,
      COUNT(DISTINCT oi.order_id) as order_count,
      SUM(oi.quantity) as units_sold,
      SUM(oi.line_total) as revenue
    FROM categories c
    INNER JOIN products p ON c.id = p.category_id
    INNER JOIN order_items oi ON p.id = oi.product_id
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE o.ordered_at >= NOW() - INTERVAL '${interval}'
      AND o.current_status IN ('shipped', 'delivered')
      AND p.deleted_at IS NULL
      AND p.is_active = true
    GROUP BY c.id, c.category_name
    ORDER BY revenue DESC
  `;

  const categorySales = await db.queryMany(query);

  // Calculate total revenue for percentages
  const totalRevenue = categorySales.reduce((sum, item) => sum + parseFloat(item.revenue || 0), 0);

  // Transform to camelCase and include percentage
  const transformedData = categorySales.map(item => {
    const revenue = parseFloat(item.revenue || 0);
    return {
      // New camelCase fields (Mobile)
      categoryId: item.category_id,
      categoryName: item.name,
      totalSales: revenue,
      percentage: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,

      // Backward compatibility fields (Web Admin)
      category_id: item.category_id,
      name: item.name,
      revenue: revenue
    };
  });

  res.json(transformedData);
}));

/**
 * GET /api/dashboard/low-stock-alert
 * Get products with low stock levels
 */
router.get('/low-stock-alert', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;

  const query = `
    SELECT 
      p.id as product_id,
      p.product_name as name,
      p.sku,
      s.quantity as current_stock,
      $1 as threshold,
      w.warehouse_name as warehouse
    FROM products p
    INNER JOIN stock s ON p.id = s.product_id
    LEFT JOIN warehouses w ON s.warehouse_id = w.id
    WHERE s.quantity > 0 
      AND s.quantity <= $1
      AND p.is_active = true
      AND p.deleted_at IS NULL
    ORDER BY s.quantity ASC
    LIMIT 50
  `;

  const lowStockProducts = await db.queryMany(query, [threshold]);
  res.json(lowStockProducts);
}));

/**
 * GET /api/dashboard/recent-reviews
 * Get recent product reviews
 */
router.get('/recent-reviews', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const query = `
    SELECT 
      r.id as review_id,
      r.product_id,
      p.product_name,
      r.user_id,
      u.username,
      r.rating,
      r.review_text as comment,
      r.created_at
    FROM reviews r
    LEFT JOIN products p ON r.product_id = p.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.deleted_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT $1
  `;

  const reviews = await db.queryMany(query, [limit]);
  res.json(reviews);
}));

export default router;
