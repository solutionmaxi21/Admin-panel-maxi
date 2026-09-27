import express from 'express';
import db from '../src/db/postgres.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../src/shared/errors/index.js';
import NotificationService from '../src/services/NotificationService.js';

const router = express.Router();

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];

async function assertAdminOrReturnOwner(req, returnId) {
  if (req.user?.role === 'admin') return;

  const row = await db.queryOne(
    `SELECT o.user_id
     FROM returns r
     JOIN orders o ON r.order_id = o.id
     WHERE r.id = $1`,
    [returnId]
  );

  if (!row) throw new NotFoundError('Return not found');
  if (row.user_id !== req.user?.userId) {
    throw new ForbiddenError('Access denied');
  }
}

function transformReturnRow(row) {
  return {
    return_id: row.id,
    return_number: row.return_number,
    order_id: row.order_id,
    order_number: row.order_number || 'N/A',
    customer_name: row.first_name && row.last_name
      ? `${row.first_name} ${row.last_name}`
      : 'Unknown',
    customer_email: row.email || 'N/A',
    customer_phone: row.phone || 'N/A',
    return_reason: row.return_reason,
    status: row.status,
    refund_amount: parseFloat(row.refund_amount) || 0,
    notes: row.notes,
    requested_at: row.requested_at,
    processed_at: row.processed_at,
    created_at: row.created_at || row.requested_at,
    received_at: row.received_at || null,
  };
}

async function transformReturn(returnData, includeDetails = false) {
  const row = await db.queryOne(`
    SELECT 
      r.*,
      o.order_number,
      u.first_name,
      u.last_name,
      u.email,
      u.phone
    FROM returns r
    LEFT JOIN orders o ON r.order_id = o.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE r.id = $1
  `, [returnData.id]);

  if (!row) {
    throw new NotFoundError('Return not found');
  }

  const transformed = transformReturnRow(row);

  if (includeDetails) {
    const items = await db.queryMany(`
      SELECT 
        ri.id as return_item_id,
        ri.quantity,
        ri.condition,
        ri.notes,
        oi.product_id,
        oi.unit_price,
        p.product_name
      FROM return_items ri
      LEFT JOIN order_items oi ON ri.order_item_id = oi.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE ri.return_id = $1
    `, [returnData.id]);

    transformed.items = items.map(item => ({
      return_item_id: item.return_item_id,
      product_id: item.product_id,
      product_name: item.product_name || 'Unknown Product',
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_price) || 0,
      total_price: (parseFloat(item.unit_price) || 0) * item.quantity,
      condition: item.condition,
      notes: item.notes
    }));
  }

  return transformed;
}

// GET /api/returns - List all returns with filters
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { search, status, startDate, endDate } = req.query;

  let query = `
    SELECT 
      r.*,
      o.order_number,
      u.first_name,
      u.last_name,
      u.email,
      u.phone
    FROM returns r
    LEFT JOIN orders o ON r.order_id = o.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 0;

  if (search) {
    paramCount++;
    query += ` AND (
      r.return_number ILIKE $${paramCount} OR
      r.return_reason ILIKE $${paramCount} OR
      r.notes ILIKE $${paramCount}
    )`;
    params.push(`%${search}%`);
  }

  if (status) {
    paramCount++;
    query += ` AND r.status = $${paramCount}`;
    params.push(status);
  }

  if (startDate) {
    paramCount++;
    query += ` AND r.requested_at >= $${paramCount}`;
    params.push(startDate);
  }

  if (endDate) {
    paramCount++;
    query += ` AND r.requested_at <= $${paramCount}`;
    params.push(endDate);
  }

  query += ' ORDER BY r.requested_at DESC';

  const returns = await db.queryMany(query, params);

  res.json(returns.map(transformReturnRow));
}));

// GET /api/returns/stats - Get return statistics
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const statusRow = await db.queryOne(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COALESCE(SUM(refund_amount) FILTER (WHERE status IN ('completed', 'approved')), 0) as total_refund_amount,
      COALESCE(SUM(refund_amount) FILTER (WHERE status IN ('pending', 'approved')), 0) as pending_refund_amount
    FROM returns
  `);

  const stats = {
    total: parseInt(statusRow.total),
    pending: parseInt(statusRow.pending),
    approved: parseInt(statusRow.approved),
    rejected: parseInt(statusRow.rejected),
    completed: parseInt(statusRow.completed),
    cancelled: parseInt(statusRow.cancelled),
    total_refund_amount: parseFloat(statusRow.total_refund_amount),
    pending_refund_amount: parseFloat(statusRow.pending_refund_amount)
  };

  const reasons = await db.queryMany(`
    SELECT 
      SPLIT_PART(return_reason, ' - ', 1) as reason,
      COUNT(*) as count
    FROM returns
    GROUP BY SPLIT_PART(return_reason, ' - ', 1)
    ORDER BY count DESC
  `);

  stats.by_reason = {};
  reasons.forEach(row => {
    stats.by_reason[row.reason || 'Other'] = parseInt(row.count);
  });

  res.json(stats);
}));

// GET /api/returns/stats/summary - Dashboard stats
router.get('/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const stats = await db.queryOne(`
    SELECT 
      COUNT(*) as total_returns,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_returns,
      COUNT(*) FILTER (WHERE status = 'approved') as approved_returns,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_returns,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_returns,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_returns,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())) as returns_this_month,
      COALESCE(SUM(refund_amount), 0) as total_refund_amount,
      COALESCE(AVG(refund_amount), 0) as average_refund,
      COUNT(*) FILTER (WHERE received_at IS NOT NULL) as received_count
    FROM returns
  `);

  const orderStats = await db.queryOne(`
    SELECT 
      COUNT(DISTINCT id) as total_orders,
      COUNT(DISTINCT id) FILTER (WHERE id IN (
        SELECT DISTINCT order_id FROM returns
      )) as orders_with_returns
    FROM orders
    WHERE current_status = 'delivered' 
      AND created_at >= DATE_TRUNC('month', NOW() - INTERVAL '3 months')
  `);

  if (!stats) {
    return res.json({
      totalReturns: 0,
      pendingReturns: 0,
      approvedReturns: 0,
      completedReturns: 0,
      rejectedReturns: 0,
      cancelledReturns: 0,
      returnsThisMonth: 0,
      totalRefundAmount: 0,
      averageRefund: 0,
      ordersWithReturns: 0,
      totalOrders: 0,
      returnPercentage: 0,
      receivedCount: 0
    });
  }

  const totalOrders = parseInt(orderStats.total_orders);
  const ordersWithReturns = parseInt(orderStats.orders_with_returns);
  const returnPercentage = totalOrders > 0 ? Math.round((ordersWithReturns / totalOrders) * 100) : 0;

  res.json({
    totalReturns: parseInt(stats.total_returns),
    pendingReturns: parseInt(stats.pending_returns),
    approvedReturns: parseInt(stats.approved_returns),
    completedReturns: parseInt(stats.completed_returns),
    rejectedReturns: parseInt(stats.rejected_returns),
    cancelledReturns: parseInt(stats.cancelled_returns),
    returnsThisMonth: parseInt(stats.returns_this_month),
    totalRefundAmount: parseFloat(stats.total_refund_amount).toFixed(2),
    averageRefund: parseFloat(stats.average_refund).toFixed(2),
    ordersWithReturns,
    totalOrders,
    returnPercentage,
    statusBreakdown: {
      pending: parseInt(stats.pending_returns),
      approved: parseInt(stats.approved_returns),
      completed: parseInt(stats.completed_returns),
      rejected: parseInt(stats.rejected_returns),
      cancelled: parseInt(stats.cancelled_returns)
    },
    receivedCount: parseInt(stats.received_count),
    reportedAt: new Date().toISOString()
  });
}));

// GET /api/returns/:id - Get return details
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const returnId = parseInt(req.params.id);
  await assertAdminOrReturnOwner(req, returnId);

  const returnData = await db.queryOne('SELECT * FROM returns WHERE id = $1', [returnId]);

  if (!returnData) {
    throw new NotFoundError('Return not found');
  }

  const transformed = await transformReturn(returnData, true);
  res.json(transformed);
}));

// PUT /api/returns/:id/status - Update return status (admin only)
router.put('/:id/status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const returnId = parseInt(req.params.id);
  const { status, notes } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const result = await db.transaction(async (client) => {
    const checkResult = await client.query('SELECT * FROM returns WHERE id = $1', [returnId]);

    if (checkResult.rows.length === 0) {
      throw new NotFoundError('Return not found');
    }

    const returnData = checkResult.rows[0];

    const updates = ['status = $2'];
    const params = [returnId, status];
    let paramCount = 2;

    if (notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
    }

    if (status !== 'pending' && !returnData.processed_at) {
      paramCount++;
      updates.push(`processed_at = $${paramCount}`);
      params.push(new Date());
    }

    const updateResult = await client.query(`
      UPDATE returns 
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    return { updated: updateResult.rows[0], returnData };
  });

  try {
    const order = await db.queryOne(
      'SELECT user_id, order_number FROM orders WHERE id = $1',
      [result.returnData.order_id]
    );

    if (order) {
      let title, message;
      if (status === 'approved') {
        title = 'Return Approved';
        message = `Your return request #${result.returnData.return_number} has been approved.`;
      } else if (status === 'rejected') {
        title = 'Return Rejected';
        message = `Your return request #${result.returnData.return_number} has been rejected.${notes ? ` Reason: ${notes}` : ''}`;
      }

      if (title) {
        await NotificationService.create({
          userId: order.user_id,
          type: 'RETURN_UPDATE',
          title,
          message,
          actionUrl: `/returns/${result.returnData.id}`,
          relatedEntityType: 'return',
          relatedEntityId: result.returnData.id,
        });
      }
    }
  } catch (notificationError) {
    console.error('[Notification] Failed to create status notification:', notificationError);
  }

  const transformed = await transformReturn(result.updated, true);
  res.json(transformed);
}));

// POST /api/returns/:id/refund - Process refund (admin only)
router.post('/:id/refund', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const returnId = parseInt(req.params.id);
  const { refund_amount, notes } = req.body;

  const result = await db.transaction(async (client) => {
    const checkResult = await client.query('SELECT * FROM returns WHERE id = $1', [returnId]);

    if (checkResult.rows.length === 0) {
      throw new NotFoundError('Return not found');
    }

    const returnData = checkResult.rows[0];

    if (returnData.status !== 'approved') {
      throw new ValidationError('Return must be approved before processing refund');
    }

    const updates = ['status = $2', 'processed_at = $3'];
    const params = [returnId, 'completed', new Date()];
    let paramCount = 3;

    if (refund_amount !== undefined) {
      paramCount++;
      updates.push(`refund_amount = $${paramCount}`);
      params.push(refund_amount);
    }

    if (notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
    }

    const updateResult = await client.query(`
      UPDATE returns 
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    return { updated: updateResult.rows[0], returnData };
  });

  try {
    const order = await db.queryOne(
      'SELECT user_id, order_number FROM orders WHERE id = $1',
      [result.returnData.order_id]
    );

    if (order) {
      await NotificationService.create({
        userId: order.user_id,
        type: 'RETURN_UPDATE',
        title: 'Refund Processed',
        message: `Your refund of ${refund_amount || result.returnData.refund_amount} DZD has been processed for return #${result.returnData.return_number}.`,
        actionUrl: `/returns/${result.returnData.id}`,
        relatedEntityType: 'return',
        relatedEntityId: result.returnData.id,
      });
    }
  } catch (notificationError) {
    console.error('[Notification] Failed to create refund notification:', notificationError);
  }

  const transformed = await transformReturn(result.updated, true);
  res.json(transformed);
}));

// POST /api/returns - Create new return request
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { order_id, return_reason, notes, items } = req.body;

  if (!order_id || !return_reason || !items || items.length === 0) {
    throw new ValidationError('Missing required fields: order_id, return_reason, items');
  }

  const order = await db.queryOne(
    'SELECT id, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL',
    [order_id]
  );
  if (!order) {
    throw new ValidationError('Order not found');
  }
  if (req.user.role !== 'admin' && order.user_id !== req.user.userId) {
    throw new ForbiddenError('You can only create returns for your own orders');
  }

  const newReturn = await db.transaction(async (client) => {
    const yearStr = new Date().getFullYear();
    const countResult = await client.query(
      `SELECT COUNT(*) as count FROM returns WHERE EXTRACT(YEAR FROM requested_at) = $1`,
      [yearStr]
    );
    const nextNum = parseInt(countResult.rows[0].count) + 1;
    const returnNumber = `RET-${yearStr}-${String(nextNum).padStart(6, '0')}`;

    const orderItemIds = items.map(i => i.order_item_id);
    const validItems = await client.query(
      `SELECT id, quantity, unit_price FROM order_items WHERE id = ANY($1::int[]) AND order_id = $2`,
      [orderItemIds, order_id]
    );
    const validItemMap = Object.fromEntries(validItems.rows.map(r => [r.id, r]));

    for (const item of items) {
      const dbItem = validItemMap[item.order_item_id];
      if (!dbItem) {
        throw new ValidationError(`Order item ${item.order_item_id} does not belong to this order`);
      }
      if (item.quantity > dbItem.quantity) {
        throw new ValidationError(`Return quantity exceeds ordered quantity for item ${item.order_item_id}`);
      }
    }

    const refundAmount = items.reduce((sum, item) => {
      const dbItem = validItemMap[item.order_item_id];
      return sum + (parseFloat(dbItem.unit_price) * item.quantity);
    }, 0);

    const returnResult = await client.query(`
      INSERT INTO returns (
        order_id, return_number, return_reason, status, 
        refund_amount, notes, requested_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [order_id, returnNumber, return_reason, 'pending', refundAmount, notes || '', new Date()]);

    const created = returnResult.rows[0];

    for (const item of items) {
      await client.query(`
        INSERT INTO return_items (return_id, order_item_id, quantity, condition, notes)
        VALUES ($1, $2, $3, $4, $5)
      `, [created.id, item.order_item_id, item.quantity, item.condition || 'opened', item.notes || '']);
    }

    return created;
  });

  try {
    const orderInfo = await db.queryOne(
      'SELECT user_id, order_number FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderInfo) {
      await NotificationService.create({
        userId: orderInfo.user_id,
        type: 'RETURN_UPDATE',
        title: 'Return Request Submitted',
        message: `Your return request #${newReturn.return_number} for order #${orderInfo.order_number} has been submitted. We will review it shortly.`,
        actionUrl: `/returns/${newReturn.id}`,
        relatedEntityType: 'return',
        relatedEntityId: newReturn.id,
      });

      await NotificationService.notifyAdmins({
        type: 'NEW_RETURN',
        title: 'New Return Request / طلب إرجاع جديد',
        message: `Return request #${newReturn.return_number} for order #${orderInfo.order_number}. Reason: ${return_reason}. Amount: ${newReturn.refund_amount} DZD`,
        actionUrl: `/returns/${newReturn.id}`,
        relatedEntityType: 'return',
        relatedEntityId: newReturn.id,
      });
    }
  } catch (notificationError) {
    console.error('[Notification] Failed to create return notification:', notificationError);
  }

  const transformed = await transformReturn(newReturn, true);
  res.status(201).json(transformed);
}));

// DELETE /api/returns/:id - Delete return (only pending returns)
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const returnId = parseInt(req.params.id);

  await db.transaction(async (client) => {
    const checkResult = await client.query('SELECT status FROM returns WHERE id = $1', [returnId]);

    if (checkResult.rows.length === 0) {
      throw new NotFoundError('Return not found');
    }

    if (checkResult.rows[0].status !== 'pending') {
      throw new ValidationError('Only pending returns can be deleted');
    }

    await client.query('DELETE FROM return_items WHERE return_id = $1', [returnId]);
    await client.query('DELETE FROM returns WHERE id = $1', [returnId]);
  });

  res.json({ message: 'Return deleted successfully' });
}));

// POST /api/returns/:id/confirm-receipt - Confirm return received at warehouse
router.post('/:id/confirm-receipt', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const returnId = parseInt(req.params.id);

  const updated = await db.transaction(async (client) => {
    const checkResult = await client.query('SELECT * FROM returns WHERE id = $1', [returnId]);

    if (checkResult.rows.length === 0) {
      throw new NotFoundError('Return not found');
    }

    const returnData = checkResult.rows[0];

    const result = await client.query(`
      UPDATE returns 
      SET received_at = $2
      WHERE id = $1
      RETURNING *
    `, [returnId, new Date()]);

    return result.rows[0];
  });

  const transformed = await transformReturn(updated, true);
  res.json({ success: true, data: transformed });
}));

export default router;
