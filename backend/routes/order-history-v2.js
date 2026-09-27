import express from 'express';
import db from '../src/db/postgres.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../src/shared/errors/index.js';

const router = express.Router();

/**
 * GET /api/order-history
 * List order history events with filters
 * Accessible by admin only
 */
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const {
    orderId,
    eventType,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sortBy = 'changed_at',
    sortOrder = 'DESC'
  } = req.query;
  
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;
  
  const validSortFields = ['changed_at', 'id', 'order_id', 'status'];
  const validSortOrders = ['ASC', 'DESC'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'changed_at';
  const sortDir = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  
  console.log(`[ORDER HISTORY] Admin ${req.user.userId} querying order history with filters:`, {
    orderId, eventType, startDate, endDate, page: pageNum, limit: limitNum
  });
  
  let query = `
    SELECT 
      oh.id as order_history_id,
      oh.order_id,
      oh.status,
      oh.notes,
      oh.changed_at,
      oh.changed_by,
      u.first_name,
      u.last_name,
      u.email,
      u.role,
      o.order_number,
      o.user_id as customer_user_id
    FROM order_history oh
    LEFT JOIN users u ON oh.changed_by = u.id
    LEFT JOIN orders o ON oh.order_id = o.id
    WHERE 1=1
  `;
  
  const params = [];
  let paramCount = 0;
  
  if (orderId) {
    paramCount++;
    query += ` AND oh.order_id = $${paramCount}`;
    params.push(parseInt(orderId));
  }
  
  if (eventType) {
    paramCount++;
    query += ` AND oh.status = $${paramCount}`;
    params.push(eventType);
  }
  
  if (startDate) {
    paramCount++;
    query += ` AND oh.changed_at >= $${paramCount}`;
    params.push(new Date(startDate).toISOString());
  }
  
  if (endDate) {
    paramCount++;
    query += ` AND oh.changed_at <= $${paramCount}`;
    params.push(new Date(endDate).toISOString());
  }
  
  const countQuery = query.replace(/SELECT.*FROM/i, 'SELECT COUNT(*) as total FROM');
  const countResult = await db.queryOne(countQuery, params);
  const total = parseInt(countResult.total);
  
  query += ` ORDER BY oh.${sortField} ${sortDir} LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limitNum, offset);
  
  const events = await db.queryMany(query, params);
  
  const enrichedEvents = events.map(event => ({
    orderHistoryId: event.order_history_id,
    orderId: event.order_id,
    orderNumber: event.order_number || `ORD-${event.order_id}`,
    status: event.status,
    notes: event.notes,
    changedAt: event.changed_at,
    changedBy: event.changed_by,
    changedByName: event.first_name ? `${event.first_name} ${event.last_name}` : 'System',
    changedByEmail: event.email || null,
    changedByRole: event.role || 'system',
    customerUserId: event.customer_user_id
  }));
  
  console.log(`[ORDER HISTORY] Retrieved ${events.length} events out of ${total} total`);
  
  res.json({
    data: enrichedEvents,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: total,
      totalPages: Math.ceil(total / limitNum),
      hasNextPage: pageNum < Math.ceil(total / limitNum),
      hasPrevPage: pageNum > 1
    },
    filters: {
      orderId: orderId || null,
      eventType: eventType || null,
      startDate: startDate || null,
      endDate: endDate || null,
      sortBy: sortField,
      sortOrder: sortDir
    },
    reportedAt: new Date().toISOString()
  });
}));

/**
 * GET /api/order-history/:orderId
 * Get order status history
 * Accessible by admin or order owner
 */
router.get('/:orderId', authenticateToken, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  
  // Verify order exists and check authorization
  const order = await db.queryOne(
    'SELECT id, user_id FROM orders WHERE id = $1',
    [orderId]
  );
  
  if (!order) {
    throw new NotFoundError('Order not found');
  }
  
  // Security check: user must own the order or be admin
  if (req.user.role !== 'admin' && order.user_id !== req.user.userId) {
    throw new ForbiddenError('Access denied. You do not have permission to view this order history.');
  }
  
  // Get order history with user details
  const query = `
    SELECT 
      oh.id as order_history_id,
      oh.order_id,
      oh.status,
      oh.notes,
      oh.changed_at,
      oh.changed_by,
      u.first_name,
      u.last_name,
      u.email,
      u.role
    FROM order_history oh
    LEFT JOIN users u ON oh.changed_by = u.id
    WHERE oh.order_id = $1
    ORDER BY oh.changed_at ASC
  `;
  
  const timeline = await db.queryMany(query, [orderId]);
  
  const enrichedTimeline = timeline.map(item => ({
    order_history_id: item.order_history_id,
    order_id: item.order_id,
    status: item.status,
    notes: item.notes,
    changed_at: item.changed_at,
    changed_by: item.changed_by,
    changed_by_name: item.first_name ? `${item.first_name} ${item.last_name}` : 'System',
    changed_by_email: item.email || null,
    changed_by_role: item.role || 'system'
  }));
  
  res.json(enrichedTimeline);
}));

/**
 * POST /api/order-history
 * Add order history event (admin only)
 */
router.post('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { order_id, status, payment_status, notes } = req.body;
  
  if (!order_id || !status) {
    throw new ValidationError('order_id and status are required');
  }
  
  // Verify order exists
  const order = await db.queryOne(
    'SELECT id, current_status, payment_status FROM orders WHERE id = $1',
    [parseInt(order_id)]
  );
  
  if (!order) {
    throw new NotFoundError('Order not found');
  }
  
  // Start transaction
  await db.transaction(async (client) => {
    // Insert history record
    const historyQuery = `
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
    
    const newEvent = await client.query(historyQuery, [
      parseInt(order_id),
      status,
      notes || `Status changed to ${status}`,
      req.user.userId
    ]);
    
    // Update order status
    const updateQuery = `
      UPDATE orders
      SET current_status = $1,
          payment_status = COALESCE($2, payment_status),
          updated_at = NOW()
      WHERE id = $3
    `;
    
    await client.query(updateQuery, [
      status,
      payment_status || null,
      parseInt(order_id)
    ]);
    
    return newEvent.rows[0];
  });
  
  // Fetch enriched event with user details
  const enrichedQuery = `
    SELECT 
      oh.id as order_history_id,
      oh.order_id,
      oh.status,
      oh.notes,
      oh.changed_at,
      oh.changed_by,
      u.first_name,
      u.last_name,
      u.email,
      u.role
    FROM order_history oh
    LEFT JOIN users u ON oh.changed_by = u.id
    WHERE oh.order_id = $1
    ORDER BY oh.changed_at DESC
    LIMIT 1
  `;
  
  const enriched = await db.queryOne(enrichedQuery, [parseInt(order_id)]);
  
  res.status(201).json({
    order_history_id: enriched.order_history_id,
    order_id: enriched.order_id,
    status: enriched.status,
    notes: enriched.notes,
    changed_at: enriched.changed_at,
    changed_by: enriched.changed_by,
    changed_by_name: enriched.first_name ? `${enriched.first_name} ${enriched.last_name}` : 'System',
    changed_by_email: enriched.email || null,
    changed_by_role: enriched.role || 'system'
  });
}));

export default router;
