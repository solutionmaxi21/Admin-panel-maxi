/**
 * Order Service Layer
 * Handles order operations with ACID transactions and security
 */

import db from '../db/postgres.js';
import { ValidationError, NotFoundError } from '../shared/errors/index.js';
import CacheManager from './cacheManager.js';

class OrderService {
  // Note: Order creation is handled directly in orders-v2.js routes
  // with full shipping calculation, promotion, and multi-warehouse logic.

  /**
   * Get order by ID with all details (optimized JOIN)
   * @param {number} orderId
   * @param {number} userId - For authorization check
   * @param {boolean} isAdmin - Admin can see all orders
   * @returns {Promise<object|null>}
   */
  async getOrderById(orderId, userId, isAdmin = false) {
    const query = `
      SELECT 
        o.*,
        u.username,
        u.email,
        w.name as wilaya_name,
        c.name as commune_name,
        json_agg(DISTINCT jsonb_build_object(
          'item_id', oi.id,
          'product_id', oi.product_id,
          'product_name', p.product_name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'line_total', oi.line_total
        )) FILTER (WHERE oi.id IS NOT NULL) as items,
        json_agg(DISTINCT jsonb_build_object(
          'id', oh.id,
          'status', oh.status,
          'notes', oh.notes,
          'changed_at', oh.changed_at
        ) ORDER BY oh.changed_at DESC) FILTER (WHERE oh.id IS NOT NULL) as history
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN wilayas w ON o.shipping_wilaya_id = w.id
      LEFT JOIN communes c ON o.shipping_commune_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN order_history oh ON o.id = oh.order_id
      WHERE o.id = $1
        ${!isAdmin ? 'AND o.user_id = $2' : ''}
      GROUP BY o.id, u.username, u.email, w.name, c.name
    `;

    const params = isAdmin ? [orderId] : [orderId, userId];

    // Cache for 15 minutes (orders don't change frequently)
    // Cache is invalidated when order status changes
    return await CacheManager.getOrFetch(`order:${orderId}`, async () => {
      return await db.queryOne(query, params);
    }, 900);
  }

  /**
   * Get orders with filters and pagination
   * @param {object} filters
   * @param {number} userId - null for admin
   * @returns {Promise<object>}
   */
  async getOrders(filters = {}, userId = null) {
    const {
      page = 1,
      limit = 20,
      status,
      payment_status,
      search,
      start_date,
      end_date
    } = filters;

    const validatedLimit = Math.min(Math.max(1, parseInt(limit)), 100);
    const validatedPage = Math.max(1, parseInt(page));
    const offset = (validatedPage - 1) * validatedLimit;

    const conditions = [];
    const params = [];
    let paramCount = 1;

    // User filter (for non-admin)
    if (userId) {
      conditions.push(`o.user_id = $${paramCount}`);
      params.push(userId);
      paramCount++;
    }

    if (status) {
      conditions.push(`o.current_status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (payment_status) {
      conditions.push(`o.payment_status = $${paramCount}`);
      params.push(payment_status);
      paramCount++;
    }

    if (search) {
      conditions.push(`(
        o.id::text ILIKE $${paramCount} OR
        o.order_number ILIKE $${paramCount} OR
        u.email ILIKE $${paramCount} OR
        u.username ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (start_date) {
      conditions.push(`o.ordered_at >= $${paramCount}`);
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      conditions.push(`o.ordered_at <= $${paramCount}`);
      params.push(end_date);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const ordersQuery = `
      SELECT 
        o.id as order_id,
        o.order_number,
        o.user_id,
        u.username,
        u.email,
        o.total_amount,
        o.current_status,
        o.payment_status,
        o.payment_method,
        o.ordered_at,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id, o.order_number, o.user_id, u.username, u.email
      ORDER BY o.ordered_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${whereClause}
    `;

    const [orders, countResult] = await Promise.all([
      db.queryMany(ordersQuery, [...params, validatedLimit, offset]),
      db.queryOne(countQuery, params)
    ]);

    return {
      orders,
      total: parseInt(countResult.total),
      page: validatedPage,
      limit: validatedLimit,
      totalPages: Math.ceil(parseInt(countResult.total) / validatedLimit)
    };
  }

  /**
   * Update order status with history tracking
   * @param {number} orderId
   * @param {string} newStatus
   * @param {string} notes
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async updateOrderStatus(orderId, newStatus, notes, userId) {
    // Validate status transition
    const validStatuses = [
      'awaiting_confirmation', 'pending', 'processing',
      'shipped', 'delivered', 'cancelled',
      'returning', 'returned', 'failed_delivery',
      'out_for_delivery', 'in_transit'
    ];
    if (!validStatuses.includes(newStatus)) {
      throw new ValidationError('Invalid order status');
    }

    return await db.transaction(async (client) => {
      // Update order
      const updateQuery = `
        UPDATE orders
        SET current_status = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;

      const order = await client.query(updateQuery, [newStatus, orderId]);

      if (!order.rows[0]) {
        throw new NotFoundError('Order not found');
      }

      // Add history entry
      await client.query(`
        INSERT INTO order_history (order_id, status, notes, changed_by)
        VALUES ($1, $2, $3, $4)
      `, [orderId, newStatus, notes, userId]);

      // If cancelled, restore stock (warehouse-aware)
      if (newStatus === 'cancelled') {
        await client.query(`
          UPDATE stock s
          SET quantity = quantity + oi.quantity,
              updated_at = NOW()
          FROM order_items oi
          WHERE s.variant_id = oi.variant_id
            AND s.warehouse_id = COALESCE(oi.warehouse_id, s.warehouse_id)
            AND oi.order_id = $1
        `, [orderId]);
      }

      // Invalidate order cache after status change
      CacheManager.del(`order:${orderId}`);
      CacheManager.del('orders:stats:today');
      CacheManager.del('orders:stats:week');
      CacheManager.del('orders:stats:month');
      CacheManager.del('orders:stats:year');

      return order.rows[0];
    });
  }

  /**
   * Get order statistics
   * @param {string} period - 'today', 'week', 'month', 'year'
   * @returns {Promise<object>}
   */
  async getOrderStats(period = 'month') {
    const intervalMap = {
      today: '1 day',
      week: '7 days',
      month: '30 days',
      year: '365 days'
    };

    const interval = intervalMap[period] || '30 days';

    const query = `
      SELECT
        -- All-time stats (Realized revenue starts at shipping)
        COUNT(*) FILTER (WHERE current_status IN ('shipped', 'delivered')) as total_orders,
        COALESCE(SUM(subtotal - discount_amount) FILTER (WHERE current_status IN ('shipped', 'delivered')), 0) as total_revenue,
        COALESCE(AVG(subtotal - discount_amount) FILTER (WHERE current_status IN ('shipped', 'delivered')), 0) as avg_order_value,
        
        -- Status counts (all time)
        COUNT(*) FILTER (WHERE current_status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE current_status = 'processing') as processing_orders,
        COUNT(*) FILTER (WHERE current_status = 'shipped') as shipped_orders,
        COUNT(*) FILTER (WHERE current_status = 'delivered') as delivered_orders,
        COUNT(*) FILTER (WHERE current_status = 'cancelled') as cancelled_orders,
        
        -- Period-specific stats (for trends)
        COUNT(*) FILTER (WHERE ordered_at >= NOW() - INTERVAL '${interval}' AND current_status IN ('shipped', 'delivered')) as period_orders,
        COALESCE(SUM(subtotal - discount_amount) FILTER (WHERE ordered_at >= NOW() - INTERVAL '${interval}' AND current_status IN ('shipped', 'delivered')), 0) as period_revenue,
        
        -- Current month stats
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', ordered_at) = DATE_TRUNC('month', CURRENT_DATE) AND current_status IN ('shipped', 'delivered')) as month_orders,
        COALESCE(SUM(subtotal - discount_amount) FILTER (WHERE DATE_TRUNC('month', ordered_at) = DATE_TRUNC('month', CURRENT_DATE) AND current_status IN ('shipped', 'delivered')), 0) as monthly_revenue,
        
        -- Previous month stats (for trend calculation)
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', ordered_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND current_status IN ('shipped', 'delivered')) as prev_month_orders,
        COALESCE(SUM(subtotal - discount_amount) FILTER (WHERE DATE_TRUNC('month', ordered_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND current_status IN ('shipped', 'delivered')), 0) as prev_monthly_revenue,
        
        -- Previous period stats (for trend calculation)
        COUNT(*) FILTER (WHERE ordered_at >= NOW() - INTERVAL '${interval}' * 2 AND ordered_at < NOW() - INTERVAL '${interval}' AND current_status IN ('shipped', 'delivered')) as prev_period_orders,
        COALESCE(SUM(subtotal - discount_amount) FILTER (WHERE ordered_at >= NOW() - INTERVAL '${interval}' * 2 AND ordered_at < NOW() - INTERVAL '${interval}' AND current_status IN ('shipped', 'delivered')), 0) as prev_period_revenue
      FROM orders
    `;

    // Cache Stats for 5 minutes
    return await CacheManager.getOrFetch(`orders:stats:${period}`, async () => {
      return await db.queryOne(query);
    }, 300);
  }
}

export default new OrderService();
