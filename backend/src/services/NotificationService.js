/**
 * NotificationService
 * Manages in-app notifications using direct PostgreSQL queries
 * Cost-optimized: cursor pagination, auto-cleanup, minimal database footprint, count caching
 */

import db from '../db/postgres.js';

// Simple in-memory cache for unread counts (reduces DB hits from polling)
const unreadCountCache = new Map();
const CACHE_TTL_MS = 10000; // 10 seconds cache

class NotificationService {
  /**
   * Create a notification for a user
   * @param {Object} params
   * @param {number} params.userId - User ID
   * @param {string} params.type - Notification type (ORDER_STATUS, RETURN_UPDATE, etc)
   * @param {string} params.title - Notification title
   * @param {string} params.message - Notification message
   * @param {string} [params.actionUrl] - URL to navigate to when clicked
   * @param {string} [params.relatedEntityType] - Type of related entity (order, return, review)
   * @param {number} [params.relatedEntityId] - ID of related entity
   * @returns {Promise<Object>} Created notification
   */
  static async create({
    userId,
    type,
    title,
    message,
    actionUrl = null,
    relatedEntityType = null,
    relatedEntityId = null,
  }) {
    try {
      // Check user preferences - only create if in-app is enabled
      const prefsQuery = `
        SELECT in_app_enabled FROM notification_preferences
        WHERE user_id = $1
      `;
      const prefsResult = await db.queryOne(prefsQuery, [userId]);

      // If preferences exist and in-app is disabled, skip
      if (prefsResult && !prefsResult.in_app_enabled) {
        return null;
      }

      const query = `
        INSERT INTO notifications (
          user_id, type, title, message, action_url,
          related_entity_type, related_entity_id, is_read, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, NOW(), NOW())
        RETURNING *
      `;

      const notification = await db.queryOne(query, [
        userId,
        type,
        title,
        message,
        actionUrl,
        relatedEntityType,
        relatedEntityId,
      ]);

      // Invalidate cache for this user
      unreadCountCache.delete(userId);

      return notification;
    } catch (error) {
      console.error('NotificationService.create error:', error);
      throw error;
    }
  }

  /**
   * Mark a notification as read
   * @param {number} notificationId
   * @param {number} userId - For security verification
   * @returns {Promise<Object>} Update result
   */
  static async markAsRead(notificationId, userId) {
    try {
      const query = `
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `;

      const result = await db.query(query, [notificationId, userId]);

      // Invalidate cache
      unreadCountCache.delete(userId);

      return result;
    } catch (error) {
      console.error('NotificationService.markAsRead error:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {number} userId
   * @returns {Promise<Object>} Count of updated notifications
   */
  static async markAllAsRead(userId) {
    try {
      const query = `
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND is_read = FALSE
      `;

      const result = await db.query(query, [userId]);

      // Invalidate cache
      unreadCountCache.delete(userId);

      return result;
    } catch (error) {
      console.error('NotificationService.markAllAsRead error:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count for a user (with caching)
   * @param {number} userId
   * @returns {Promise<number>} Count of unread notifications
   */
  static async getUnreadCount(userId) {
    try {
      // Check cache first
      const cached = unreadCountCache.get(userId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.count;
      }

      const query = `
        SELECT COUNT(*) as count FROM notifications
        WHERE user_id = $1 AND is_read = FALSE
      `;

      const result = await db.queryOne(query, [userId]);
      const count = parseInt(result?.count) || 0;

      // Cache the result
      unreadCountCache.set(userId, { count, timestamp: Date.now() });

      return count;
    } catch (error) {
      console.error('NotificationService.getUnreadCount error:', error);
      return 0;
    }
  }

  /**
   * Get paginated notifications for a user (cursor-based for cost optimization)
   * @param {number} userId
   * @param {Object} options
   * @param {number} [options.limit=20] - Items per page
   * @param {number} [options.cursor] - Cursor ID for pagination
   * @param {string} [options.filter] - 'all', 'unread', 'read'
   * @returns {Promise<Object>} Paginated notifications
   */
  static async getUserNotifications(userId, options = {}) {
    try {
      // Validate and sanitize limit to prevent SQL errors
      let limit = parseInt(options.limit) || 20;
      if (limit < 1) limit = 20; // Default to 20 for negative/zero values
      if (limit > 100) limit = 100; // Cap at 100

      const cursor = options.cursor;
      const filter = options.filter || 'all';

      let whereClause = 'WHERE n.user_id = $1';
      let params = [userId];

      if (filter === 'unread') {
        whereClause += ' AND n.is_read = FALSE';
      } else if (filter === 'read') {
        whereClause += ' AND n.is_read = TRUE';
      }

      if (cursor) {
        whereClause += ` AND n.id < $2`;
        params.push(cursor);
      }

      // Add limit parameter
      const limitParamIndex = params.length + 1;
      params.push(limit);

      const query = `
        SELECT * FROM notifications n
        ${whereClause}
        ORDER BY n.created_at DESC
        LIMIT $${limitParamIndex}
      `;

      const notifications = await db.queryMany(query, params);

      // Get next cursor if needed
      const nextCursor =
        notifications.length === limit ? notifications[limit - 1]?.id : null;

      return {
        notifications,
        nextCursor,
        hasMore: nextCursor !== null,
      };
    } catch (error) {
      console.error('NotificationService.getUserNotifications error:', error);
      throw error;
    }
  }

  /**
   * Delete a notification
   * @param {number} notificationId
   * @param {number} userId - For security verification
   * @returns {Promise<Object>} Delete result
   */
  static async deleteNotification(notificationId, userId) {
    try {
      const query = `
        DELETE FROM notifications
        WHERE id = $1 AND user_id = $2
      `;

      const result = await db.query(query, [notificationId, userId]);
      return result;
    } catch (error) {
      console.error('NotificationService.deleteNotification error:', error);
      throw error;
    }
  }

  /**
   * Clean up old read notifications (cost optimization - run daily via cron)
   * Deletes read notifications older than 30 days
   * @param {number} [daysOld=30]
   * @returns {Promise<Object>} Count of deleted notifications
   */
  static async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const query = `
        DELETE FROM notifications
        WHERE is_read = TRUE AND created_at < $1
      `;

      const result = await db.query(query, [cutoffDate]);
      console.log(
        `NotificationService: Cleaned up ${result.rowCount || 0} old notifications`
      );
      return result;
    } catch (error) {
      console.error('NotificationService.cleanupOldNotifications error:', error);
      throw error;
    }
  }

  /**
   * Notify all admin users
   * @param {Object} notificationData - Notification details
   * @param {string} notificationData.type - Notification type
   * @param {string} notificationData.title - Notification title
   * @param {string} notificationData.message - Notification message
   * @param {string} [notificationData.actionUrl] - URL to navigate to
   * @param {string} [notificationData.relatedEntityType] - Related entity type
   * @param {number} [notificationData.relatedEntityId] - Related entity ID
   * @returns {Promise<Object>} Count of created notifications
   */
  static async notifyAdmins(notificationData) {
    try {
      // Get all active admin user IDs.
      // `role` can be an enum type, so cast to text before case normalization.
      const adminQuery = `
        SELECT id FROM users 
        WHERE LOWER(role::text) = 'admin'
        AND COALESCE(is_active, TRUE) = TRUE
        AND deleted_at IS NULL
      `;
      const admins = await db.queryMany(adminQuery);

      if (!admins || admins.length === 0) {
        console.log('NotificationService: No active admins found to notify');
        return { rowCount: 0 };
      }

      const adminIds = admins.map(a => a.id);
      const result = await this.createBulk(adminIds, notificationData);

      console.log(`NotificationService: Notified ${adminIds.length} admins`);
      return result;
    } catch (error) {
      console.error('NotificationService.notifyAdmins error:', error);
      throw error;
    }
  }

  /**
   * Create bulk notifications (for admin broadcasts)
   * @param {Array} userIds
   * @param {Object} notificationData
   * @returns {Promise<Object>} Count of created notifications
   */
  static async createBulk(userIds, notificationData) {
    try {
      // Use multi-row insert for efficiency
      const values = userIds.map((_, index) => {
        const paramIndex = index * 7;
        return `($${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, FALSE, NOW(), NOW())`;
      }).join(',');

      const params = [];
      userIds.forEach(userId => {
        params.push(
          userId,
          notificationData.type,
          notificationData.title,
          notificationData.message,
          notificationData.actionUrl || null,
          notificationData.relatedEntityType || null,
          notificationData.relatedEntityId || null
        );
      });

      const query = `
        INSERT INTO notifications (
          user_id, type, title, message, action_url,
          related_entity_type, related_entity_id, is_read, created_at, updated_at
        ) VALUES ${values}
      `;

      const result = await db.query(query, params);
      console.log(
        `NotificationService: Created ${result.rowCount || 0} bulk notifications`
      );
      return result;
    } catch (error) {
      console.error('NotificationService.createBulk error:', error);
      throw error;
    }
  }

  /**
   * Get notification preference for a user (or create default)
   * @param {number} userId
   * @returns {Promise<Object>} User's notification preferences
   */
  static async getOrCreatePreference(userId) {
    try {
      let query = `
        SELECT * FROM notification_preferences
        WHERE user_id = $1
      `;
      let prefs = await db.queryOne(query, [userId]);

      if (!prefs) {
        query = `
          INSERT INTO notification_preferences (
            user_id, email_on_order, email_on_shipment,
            email_on_delivery, email_on_return, in_app_enabled,
            created_at, updated_at
          ) VALUES ($1, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW())
          RETURNING *
        `;
        prefs = await db.queryOne(query, [userId]);
      }

      return prefs;
    } catch (error) {
      console.error('NotificationService.getOrCreatePreference error:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   * @param {number} userId
   * @param {Object} updates - Partial preference object
   * @returns {Promise<Object>} Updated preferences
   */
  static async updatePreference(userId, updates) {
    try {
      // Build SET clause dynamically
      const allowedFields = [
        'email_on_order',
        'email_on_shipment',
        'email_on_delivery',
        'email_on_return',
        'in_app_enabled',
      ];

      const setClauses = [];
      const params = [];
      let paramIndex = 1;

      for (const field of allowedFields) {
        if (field in updates) {
          setClauses.push(`${field} = $${paramIndex}`);
          params.push(updates[field]);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        // No updates needed, return existing prefs
        const query = `
          SELECT * FROM notification_preferences
          WHERE user_id = $1
        `;
        return await db.queryOne(query, [userId]);
      }

      setClauses.push(`updated_at = NOW()`);
      params.push(userId);

      const query = `
        INSERT INTO notification_preferences (
          user_id, email_on_order, email_on_shipment,
          email_on_delivery, email_on_return, in_app_enabled,
          created_at, updated_at
        ) VALUES ($${paramIndex}, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          ${setClauses.join(', ')}
        RETURNING *
      `;

      const prefs = await db.queryOne(query, params);
      return prefs;
    } catch (error) {
      console.error('NotificationService.updatePreference error:', error);
      throw error;
    }
  }
}

export default NotificationService;

