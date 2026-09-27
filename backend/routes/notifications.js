/**
 * Notification Routes
 * REST API endpoints for notification management
 * Fully authenticated with JWT
 */

import express from 'express';
import NotificationService from '../src/services/NotificationService.js';
import { authenticateToken } from '../src/shared/middleware/auth.js';
import { optionalAuth } from '../src/shared/middleware/auth.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/notifications
 * Get paginated notifications for authenticated user
 * Query params:
 *   - limit: Number of items (default: 20, max: 100)
 *   - cursor: Pagination cursor (ID)
 *   - filter: 'all' | 'unread' | 'read' (default: 'all')
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { limit = 20, cursor, filter = 'all' } = req.query;

  // Validate limit - handle negative/invalid values
  let parsedLimit = parseInt(limit) || 20;
  if (parsedLimit < 1) parsedLimit = 20;
  parsedLimit = Math.min(parsedLimit, 100);

  const result = await NotificationService.getUserNotifications(userId, {
    limit: parsedLimit,
    cursor: cursor ? parseInt(cursor) : undefined,
    filter,
  });

  res.json({
    success: true,
    data: result.notifications,
    pagination: {
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      limit: parsedLimit,
    },
  });
}));

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications for authenticated user
 * Lightweight endpoint for badge updates
 */
router.get('/unread-count', asyncHandler(async (req, res) => {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated',
      unreadCount: 0,
    });
  }

  const userId = req.user.userId;
  const count = await NotificationService.getUnreadCount(userId);

  res.json({
    success: true,
    unreadCount: count,
  });
}));

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const notificationId = parseInt(req.params.id);

  if (!notificationId) {
    return res.status(400).json({
      success: false,
      error: 'Invalid notification ID',
    });
  }

  const result = await NotificationService.markAsRead(
    notificationId,
    userId
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      success: false,
      error: 'Notification not found',
    });
  }

  res.json({
    success: true,
    message: 'Notification marked as read',
  });
}));

/**
 * PATCH /api/notifications/mark-all-read
 * Mark all notifications as read for authenticated user
 */
router.patch('/mark-all-read', asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await NotificationService.markAllAsRead(userId);

  res.json({
    success: true,
    message: `${result.rowCount || 0} notifications marked as read`,
    count: result.rowCount || 0,
  });
}));

/**
 * DELETE /api/notifications/:id
 * Delete a single notification
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const notificationId = parseInt(req.params.id);

  if (!notificationId) {
    return res.status(400).json({
      success: false,
      error: 'Invalid notification ID',
    });
  }

  const result = await NotificationService.deleteNotification(
    notificationId,
    userId
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      success: false,
      error: 'Notification not found',
    });
  }

  res.json({
    success: true,
    message: 'Notification deleted',
  });
}));

/**
 * GET /api/notifications/preferences
 * Get notification preferences for authenticated user
 */
router.get('/preferences', asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const prefs = await NotificationService.getOrCreatePreference(userId);

  res.json({
    success: true,
    data: prefs,
  });
}));

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences for authenticated user
 */
router.patch('/preferences', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const updates = req.body;

  // Whitelist allowed fields
  const allowedFields = [
    'email_on_order',
    'email_on_shipment',
    'email_on_delivery',
    'email_on_return',
    'in_app_enabled',
  ];

  const sanitizedUpdates = {};
  allowedFields.forEach((field) => {
    if (field in updates) {
      sanitizedUpdates[field] = updates[field];
    }
  });

  if (Object.keys(sanitizedUpdates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No valid fields to update',
    });
  }

  const prefs = await NotificationService.updatePreference(
    userId,
    sanitizedUpdates
  );

  res.json({
    success: true,
    data: prefs,
    message: 'Preferences updated',
  });
}));

export default router;
