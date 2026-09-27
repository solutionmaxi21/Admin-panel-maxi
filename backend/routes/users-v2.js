import express from 'express';
import db from '../src/db/postgres.js';
import UserService from '../src/services/userService.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../src/shared/errors/index.js';
import {
  getUsersSchema,
  getUserSchema,
  createUserSchema,
  updateUserSchema,
  deleteUserSchema
} from '../src/shared/validation/index.js';

const router = express.Router();

// ========================================
// User Addresses (Authenticated Users)
// ========================================

/**
 * GET /api/users/addresses
 * Get user's addresses
 */
router.get('/addresses', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const isAdmin = req.user.role === 'admin';

  let query, params;
  if (isAdmin) {
    query = `
      SELECT * FROM addresses 
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    params = [];
  } else {
    query = `
      SELECT * FROM addresses 
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY is_default DESC, created_at DESC
    `;
    params = [userId];
  }

  const addresses = await db.queryMany(query, params);

  const transformed = addresses.map(addr => ({
    id: addr.id,
    userId: addr.user_id,
    firstName: addr.first_name,
    lastName: addr.last_name,
    addressLine1: addr.address_line_1,
    addressLine2: addr.address_line_2,
    city: addr.city,
    state: addr.state_province,
    postalCode: addr.postal_code,
    country: addr.country,
    phone: addr.phone,
    isDefault: addr.is_default,
    createdAt: addr.created_at,
    updatedAt: addr.updated_at
  }));

  res.json(transformed);
}));

/**
 * POST /api/users/addresses
 * Create new address
 */
router.post('/addresses', authenticateToken, asyncHandler(async (req, res) => {
  const { firstName, lastName, addressLine1, addressLine2, city, state, postalCode, country, phone, isDefault } = req.body;

  if (!firstName || !lastName || !addressLine1 || !city || !state || !postalCode || !country || !phone) {
    throw new ValidationError('All address fields except addressLine2 are required');
  }

  await db.transaction(async (client) => {
    // If setting as default, unset others
    if (isDefault) {
      await client.query(
        'UPDATE addresses SET is_default = false WHERE user_id = $1',
        [req.user.userId]
      );
    }

    const query = `
      INSERT INTO addresses (
        user_id, first_name, last_name, address_line_1, address_line_2,
        city, state_province, postal_code, country, phone, is_default, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `;

    const result = await client.query(query, [
      req.user.userId, firstName, lastName, addressLine1, addressLine2 || null,
      city, state, postalCode, country, phone, isDefault || false
    ]);

    return result.rows[0];
  });

  const newAddress = await db.queryOne(
    'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [req.user.userId]
  );

  res.json({
    id: newAddress.id,
    isDefault: newAddress.is_default,
    firstName: newAddress.first_name,
    lastName: newAddress.last_name
  });
}));

/**
 * PUT /api/users/addresses/:id
 * Update address
 */
router.put('/addresses/:id', authenticateToken, asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.id);
  const { firstName, lastName, addressLine1, addressLine2, city, state, postalCode, country, phone, isDefault } = req.body;

  const address = await db.queryOne(
    'SELECT * FROM addresses WHERE id = $1 AND deleted_at IS NULL',
    [addressId]
  );

  if (!address) {
    throw new NotFoundError('Address not found');
  }

  if (address.user_id !== req.user.userId && req.user.role !== 'admin') {
    throw new ForbiddenError('You can only update your own addresses');
  }

  await db.transaction(async (client) => {
    if (isDefault) {
      await client.query(
        'UPDATE addresses SET is_default = false WHERE user_id = $1 AND id != $2',
        [address.user_id, addressId]
      );
    }

    const query = `
      UPDATE addresses
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          address_line_1 = COALESCE($3, address_line_1),
          address_line2 = $4,
          city = COALESCE($5, city),
          state_province = COALESCE($6, state_province),
          postal_code = COALESCE($7, postal_code),
          country = COALESCE($8, country),
          phone = COALESCE($9, phone),
          is_default = COALESCE($10, is_default),
          updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `;

    const result = await client.query(query, [
      firstName, lastName, addressLine1, addressLine2 !== undefined ? addressLine2 : address.address_line2,
      city, state, postalCode, country, phone, isDefault, addressId
    ]);

    return result.rows[0];
  });

  res.json({ id: addressId, isDefault });
}));

/**
 * DELETE /api/users/addresses/:id
 * Delete address
 */
router.delete('/addresses/:id', authenticateToken, asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.id);

  const address = await db.queryOne(
    'SELECT user_id FROM addresses WHERE id = $1 AND deleted_at IS NULL',
    [addressId]
  );

  if (!address) {
    throw new NotFoundError('Address not found');
  }

  if (address.user_id !== req.user.userId && req.user.role !== 'admin') {
    throw new ForbiddenError('You can only delete your own addresses');
  }

  await db.query('UPDATE addresses SET deleted_at = NOW() WHERE id = $1', [addressId]);

  res.json({ success: true });
}));

/**
 * POST /api/users/addresses/:id/default
 * Set address as default
 */
router.post('/addresses/:id/default', authenticateToken, asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.id);

  const address = await db.queryOne(
    'SELECT user_id FROM addresses WHERE id = $1',
    [addressId]
  );

  if (!address) {
    throw new NotFoundError('Address not found');
  }

  if (address.user_id !== req.user.userId && req.user.role !== 'admin') {
    throw new ForbiddenError('You can only modify your own addresses');
  }

  await db.transaction(async (client) => {
    await client.query(
      'UPDATE addresses SET is_default = false WHERE user_id = $1',
      [address.user_id]
    );
    await client.query(
      'UPDATE addresses SET is_default = true WHERE id = $1',
      [addressId]
    );
  });

  res.json({ success: true });
}));

// ========================================
// User Profile (Authenticated Users)
// ========================================

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const user = await UserService.getUserById(req.user.userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    userId: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at,
    lastLogin: user.last_login
  });
}));

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;

  const updates = {};
  if (firstName) updates.first_name = firstName;
  if (lastName) updates.last_name = lastName;
  if (phone) updates.phone = phone;

  const updated = await UserService.updateUser(req.user.userId, updates);

  res.json({
    message: 'Profile updated successfully',
    user: {
      userId: updated.id,
      firstName: updated.first_name,
      lastName: updated.last_name,
      email: updated.email,
      phone: updated.phone
    }
  });
}));

/**
 * POST /api/users/change-password
 * Change password
 */
router.post('/change-password', authenticateToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  // Validate password strength
  const { validatePasswordStrength } = await import('../src/shared/utils/password.js');
  const validation = validatePasswordStrength(newPassword);
  if (!validation.isValid) {
    throw new ValidationError(validation.errors.join(', '));
  }

  await UserService.changePassword(req.user.userId, currentPassword, newPassword);

  res.json({ message: 'Password changed successfully' });
}));

// ========================================
// Admin Routes (User Management)
// ========================================

/**
 * GET /api/users
 * Get all users (admin)
 */
router.get('/', authenticateToken, requireAdmin, validate(getUsersSchema), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, role, status, includeDeleted, onlyDeleted } = req.query;

  const filters = { page, limit };
  if (search) filters.search = search;
  if (role) filters.role = role;
  if (status) filters.is_active = status === 'active';
  if (includeDeleted !== undefined) filters.includeDeleted = includeDeleted;
  if (onlyDeleted !== undefined) filters.onlyDeleted = onlyDeleted;

  const result = await UserService.getUsers(filters);

  res.json({
    users: result.users,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages
  });
}));

/**
 * POST /api/users
 * Create new user (admin)
 */
router.post('/', authenticateToken, requireAdmin, validate(createUserSchema), asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, phone, role } = req.body;

  const userData = {
    email,
    password,
    first_name: firstName,
    last_name: lastName,
    phone,
    role: role || 'customer',
    is_active: true
  };

  const user = await UserService.createUser(userData);

  res.status(201).json({
    message: 'User created successfully',
    user: {
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    }
  });
}));

/**
 * GET /api/users/:id
 * Get single user (admin)
 */
router.get('/:id', authenticateToken, requireAdmin, validate(getUserSchema), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  const user = await UserService.getUserById(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Get additional stats and related data
  const statsQuery = `
    SELECT 
      (SELECT COUNT(*) FROM orders WHERE user_id = $1 AND deleted_at IS NULL) as order_count,
      (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = $1 AND current_status = 'delivered' AND deleted_at IS NULL) as total_spent,
      (SELECT COUNT(*) FROM reviews WHERE user_id = $1 AND deleted_at IS NULL) as review_count,
      (SELECT COUNT(*) FROM favorites WHERE user_id = $1) as wishlist_count
  `;

  const stats = await db.queryOne(statsQuery, [userId]);

  // Get recent orders
  const ordersQuery = `
    SELECT id, order_number as "orderNumber", total_amount as total, current_status as status, ordered_at as "createdAt"
    FROM orders 
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY ordered_at DESC
    LIMIT 10
  `;
  const orders = await db.queryMany(ordersQuery, [userId]);

  // Get recent reviews
  const reviewsQuery = `
    SELECT r.id, r.rating, r.review_text as comment, r.status, r.created_at as "createdAt"
    FROM reviews r
    WHERE r.user_id = $1 AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT 10
  `;
  const reviews = await db.queryMany(reviewsQuery, [userId]);

  // Get addresses
  const addressesQuery = `
    SELECT id, first_name as "firstName", last_name as "lastName", phone, address_line_1 as street, city, state_province as state, postal_code as "postalCode", country, is_default as "isDefault"
    FROM addresses
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY is_default DESC, created_at DESC
  `;
  const addresses = await db.queryMany(addressesQuery, [userId]);

  res.json({
    userId: user.id,
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.is_active,
    is_active: user.is_active,
    orderCount: parseInt(stats.order_count),
    total_orders: parseInt(stats.order_count),
    totalSpent: parseFloat(stats.total_spent),
    total_spent: parseFloat(stats.total_spent),
    reviewCount: parseInt(stats.review_count),
    wishlistCount: parseInt(stats.wishlist_count),
    createdAt: user.created_at,
    created_at: user.created_at,
    lastLogin: user.last_login,
    last_login: user.last_login,
    orders: orders,
    reviews: reviews,
    addresses: addresses,
    address: addresses.length > 0 ? addresses[0] : null
  });
}));

/**
 * PUT /api/users/:id
 * Update user (admin)
 */
router.put('/:id', authenticateToken, requireAdmin, validate(updateUserSchema), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const { firstName, lastName, phone, role, isActive } = req.body;

  const updates = {};
  if (firstName) updates.first_name = firstName;
  if (lastName) updates.last_name = lastName;
  if (phone) updates.phone = phone;
  if (role) updates.role = role;
  if (isActive !== undefined) updates.is_active = isActive;

  const updated = await UserService.updateUser(userId, updates);

  res.json({
    message: 'User updated successfully',
    user: {
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      isActive: updated.is_active
    }
  });
}));

/**
 * DELETE /api/users/:id
 * Delete user (admin)
 */
router.delete('/:id', authenticateToken, requireAdmin, validate(deleteUserSchema), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  await db.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [userId]);

  res.json({ message: 'User deleted successfully' });
}));

/**
 * POST /api/users/:id/restore
 * Restore user from trash (admin)
 */
router.post('/:id/restore', authenticateToken, requireAdmin, validate(getUserSchema), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  const user = await db.queryOne('SELECT id, email, deleted_at FROM users WHERE id = $1', [userId]);
  if (!user) throw new NotFoundError('User not found');
  if (!user.deleted_at) {
    return res.json({ success: true, message: 'User is already active' });
  }

  const conflict = await db.queryOne(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2 AND deleted_at IS NULL',
    [user.email, userId]
  );
  if (conflict) {
    throw new ConflictError('Cannot restore user: an active user with the same email already exists');
  }

  await db.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [userId]);
  res.json({ success: true, message: 'User restored successfully' });
}));

/**
 * DELETE /api/users/:id/hard
 * Permanently delete user (only from trash) (admin)
 */
router.delete('/:id/hard', authenticateToken, requireAdmin, validate(getUserSchema), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  const user = await db.queryOne('SELECT id, deleted_at FROM users WHERE id = $1', [userId]);
  if (!user) throw new NotFoundError('User not found');
  if (!user.deleted_at) {
    throw new ValidationError([{ field: 'user', message: 'User must be in trash before permanent deletion' }]);
  }

  const ordersCount = await db.queryOne('SELECT COUNT(*) as count FROM orders WHERE user_id = $1', [userId]);
  if (parseInt(ordersCount.count) > 0) {
    throw new ConflictError('Cannot permanently delete user: user has orders');
  }

  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  res.json({ success: true, message: 'User permanently deleted' });
}));

/**
 * GET /api/users/stats/summary
 * Get user statistics (admin)
 */
router.get('/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE is_active = true) as active_users,
      COUNT(*) FILTER (WHERE is_active = false) as inactive_users,
      COUNT(*) FILTER (WHERE role = 'customer') as customers,
      COUNT(*) FILTER (WHERE role = 'admin') as admins,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_this_month,
      COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '7 days') as active_last_week
    FROM users
    WHERE deleted_at IS NULL
  `;

  const stats = await db.queryOne(query);

  res.json({
    total: parseInt(stats.total_users),
    active: parseInt(stats.active_users),
    inactive: parseInt(stats.inactive_users),
    customers: parseInt(stats.customers),
    admins: parseInt(stats.admins),
    newThisMonth: parseInt(stats.new_users_this_month),
    activeLastWeek: parseInt(stats.active_last_week)
  });
}));

// Manually verify user (admin only)
router.patch('/:id/verify-email', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);

  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const success = await UserService.manuallyVerifyUser(userId);

  if (!success) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    message: 'User email verified successfully',
    userId
  });
}));

/**
 * GET /api/users/stats/summary
 * Get user statistics for dashboard
 * Requires admin authentication
 */
router.get('/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log(`[USER STATS] Admin ${req.user.userId} requested user statistics summary`);

  const query = `
    SELECT 
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE is_active = true) as active_users,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())) as new_users_this_month,
      COUNT(*) FILTER (WHERE role = 'customer') as customer_count,
      COUNT(*) FILTER (WHERE role = 'admin') as admin_count,
      COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '7 days') as active_last_7_days,
      COUNT(*) FILTER (WHERE last_login >= NOW() - INTERVAL '30 days') as active_last_30_days
    FROM users
    WHERE deleted_at IS NULL
  `;

  const stats = await db.queryOne(query);

  if (!stats) {
    return res.json({
      totalUsers: 0,
      activeUsers: 0,
      newUsersThisMonth: 0,
      customerCount: 0,
      adminCount: 0,
      activeLast7Days: 0,
      activeLast30Days: 0
    });
  }

  console.log('[USER STATS] Statistics retrieved successfully');

  res.json({
    totalUsers: parseInt(stats.total_users),
    activeUsers: parseInt(stats.active_users),
    newUsersThisMonth: parseInt(stats.new_users_this_month),
    customerCount: parseInt(stats.customer_count),
    adminCount: parseInt(stats.admin_count),
    activeLast7Days: parseInt(stats.active_last_7_days),
    activeLast30Days: parseInt(stats.active_last_30_days),
    reportedAt: new Date().toISOString()
  });
}));

export default router;
