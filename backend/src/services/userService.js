/**
 * User Service Layer
 * Handles user operations with security best practices
 */

import db from '../db/postgres.js';
import bcrypt from 'bcrypt';
import { ValidationError, NotFoundError, UnauthorizedError } from '../shared/errors/index.js';

class UserService {
  /**
   * Create new user with hashed password
   * @param {object} userData
   * @returns {Promise<object>}
   */
  async createUser(userData) {
    // Check if email or username already exists
    const existingUser = await db.queryOne(
      `SELECT id FROM users 
       WHERE (email = $1 OR username = $2) AND deleted_at IS NULL`,
      [userData.email, userData.username]
    );

    if (existingUser) {
      throw new ValidationError('Email or username already exists');
    }

    // Guard against sequence drift that can trigger "users_pkey" violations
    // when the users table has been seeded with explicit ids.
    await db.query(
      "SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 0) + 1, false)"
    );

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    const query = `
      INSERT INTO users (
        username, email, password_hash, first_name, last_name,
        phone, role
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, email, first_name, last_name, phone, role, created_at
    `;

    return await db.queryOne(query, [
      userData.username,
      userData.email,
      hashedPassword,
      userData.first_name || null,
      userData.last_name || null,
      userData.phone || null,
      userData.role || 'customer'
    ]);
  }

  /**
   * Authenticate user (rate limiting should be applied at route level)
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>}
   */
  async authenticateUser(email, password) {
    // Get user with password hash
    const user = await db.queryOne(
      `SELECT id, username, email, password_hash, first_name, last_name, 
              phone, role, is_active, email_verified
       FROM users 
       WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );

    if (!user) {
      // Use generic message to prevent user enumeration
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('Account is disabled');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Update last login
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Remove password hash from returned object
    delete user.password_hash;
    return user;
  }

  /**
   * Get user by ID (excluding sensitive data)
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getUserById(userId) {
    const query = `
      SELECT 
        id, username, email, first_name, last_name,
        phone, role, is_active, email_verified, created_at, last_login
      FROM users
      WHERE id = $1 AND deleted_at IS NULL
    `;

    return await db.queryOne(query, [userId]);
  }

  /**
   * Get user with addresses
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getUserWithAddresses(userId) {
    const query = `
      SELECT 
        u.id, u.username, u.email, u.first_name, u.last_name,
        u.phone, u.role, u.is_active, u.email_verified,
        json_agg(
          json_build_object(
            'address_id', a.id,
            'address_line', a.address_line,
            'wilaya_id', a.wilaya_id,
            'commune_id', a.commune_id,
            'postal_code', a.postal_code,
            'is_default', a.is_default
          )
        ) FILTER (WHERE a.id IS NOT NULL) as addresses
      FROM users u
      LEFT JOIN addresses a ON u.id = a.user_id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id
    `;

    return await db.queryOne(query, [userId]);
  }

  /**
   * Update user profile
   * @param {number} userId
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async updateUser(userId, updates) {
    const allowedFields = ['first_name', 'last_name', 'phone'];
    const updateFields = [];
    const params = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateFields.push('updated_at = NOW()');
    params.push(userId);

    const query = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING id, username, email, first_name, last_name, phone, role
    `;

    const user = await db.queryOne(query, params);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /**
   * Change user password
   * @param {number} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<boolean>}
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Get current password hash
    const user = await db.queryOne(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );

    return true;
  }

  /**
   * Get users with filters (admin only)
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getUsers(filters = {}) {
    const {
      page = 1,
      limit = 20,
      role,
      is_active,
      search,
      includeDeleted = false,
      onlyDeleted = false
    } = filters;

    const validatedLimit = Math.min(Math.max(1, parseInt(limit)), 100);
    const validatedPage = Math.max(1, parseInt(page));
    const offset = (validatedPage - 1) * validatedLimit;

    const conditions = [];
    if (onlyDeleted) {
      conditions.push('u.deleted_at IS NOT NULL');
    } else if (!includeDeleted) {
      conditions.push('u.deleted_at IS NULL');
    }
    const params = [];
    let paramCount = 1;

    if (role) {
      conditions.push(`u.role = $${paramCount}`);
      params.push(role);
      paramCount++;
    }

    if (is_active !== undefined) {
      conditions.push(`u.is_active = $${paramCount}`);
      params.push(is_active);
      paramCount++;
    }

    if (search) {
      conditions.push(`(
        u.email ILIKE $${paramCount} OR
        u.username ILIKE $${paramCount} OR
        u.first_name ILIKE $${paramCount} OR
        u.last_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = conditions.join(' AND ');

    const usersQuery = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.first_name, 
        u.last_name,
        u.full_name,
        u.phone, 
        u.role, 
        u.is_active, 
        u.email_verified, 
        u.created_at, 
        u.last_login,
        u.deleted_at,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(CASE WHEN o.current_status = 'delivered' THEN o.total_amount ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id AND o.deleted_at IS NULL
      WHERE ${whereClause}
      GROUP BY u.id, u.username, u.email, u.first_name, u.last_name, u.full_name, 
               u.phone, u.role, u.is_active, u.email_verified, u.created_at, u.last_login, u.deleted_at
      ORDER BY u.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      WHERE ${whereClause}
    `;

    const [users, countResult] = await Promise.all([
      db.queryMany(usersQuery, [...params, validatedLimit, offset]),
      db.queryOne(countQuery, params)
    ]);

    // Transform data for frontend compatibility
    const transformedUsers = users.map(user => ({
      ...user,
      name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email,
      fullName: user.full_name,
      total_orders: parseInt(user.total_orders) || 0,
      total_spent: parseFloat(user.total_spent) || 0
    }));

    return {
      users: transformedUsers,
      total: parseInt(countResult.total),
      page: validatedPage,
      limit: validatedLimit,
      totalPages: Math.ceil(parseInt(countResult.total) / validatedLimit)
    };
  }

  /**
   * Soft delete user
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteUser(userId) {
    const result = await db.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [userId]
    );

    return result.rowCount > 0;
  }

  /**
   * Verify user email with token
   * @param {string} token
   * @returns {Promise<object>}
   */
  async verifyEmail(token) {
    // Find user with valid verification token
    const user = await db.queryOne(
      `SELECT id, email, username 
       FROM users 
       WHERE verification_token = $1 
       AND verification_expires > NOW() 
       AND deleted_at IS NULL`,
      [token]
    );

    if (!user) {
      throw new NotFoundError('Invalid or expired verification token');
    }

    // Mark email as verified and clear verification token
    await db.query(
      `UPDATE users 
       SET email_verified = TRUE,
           verification_token = NULL,
           verification_expires = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    return {
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        email_verified: true
      }
    };
  }

  /**
   * Resend verification email
   * @param {string} email
   * @returns {Promise<object>}
   */
  async resendVerificationEmail(email) {
    // Check if user exists and is not already verified
    const user = await db.queryOne(
      `SELECT id, email, username, email_verified 
       FROM users 
       WHERE email = $1 
       AND deleted_at IS NULL`,
      [email]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.email_verified) {
      throw new ValidationError('Email is already verified');
    }

    // Generate new verification token
    const crypto = await import('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update verification token
    await db.query(
      `UPDATE users 
       SET verification_token = $1,
           verification_expires = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [verificationToken, verificationExpires, user.id]
    );

    // TODO: Send verification email here
    // await emailService.sendVerificationEmail(user.email, verificationToken);

    return {
      message: 'Verification email sent successfully'
    };
  }

  /**
   * Manually verify user (admin only)
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async manuallyVerifyUser(userId) {
    const result = await db.query(
      `UPDATE users 
       SET email_verified = TRUE,
           verification_token = NULL,
           verification_expires = NULL,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    return result.rowCount > 0;
  }
}

export default new UserService();
