import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UnauthorizedError, ForbiddenError } from '../errors/index.js';

// Token expiration configuration (from env with defaults)
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

// Get secrets from environment with validation
const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be set in environment variables and be at least 32 characters long');
  }
  return secret;
};

const getRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be set in environment variables and be at least 32 characters long');
  }
  return secret;
};

/**
 * Generate access token (short-lived)
 */
export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.userId || user.user_id || user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName || user.first_name,
      lastName: user.lastName || user.last_name,
    },
    getAccessSecret(),
    { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generate Refresh Token
 */
export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user.userId || user.user_id || user.id,
      jti: crypto.randomUUID(),
      type: 'refresh',
    },
    getRefreshSecret(),
    { algorithm: 'HS256', expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, getAccessSecret(), { algorithms: ['HS256'] });
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, getRefreshSecret(), { algorithms: ['HS256'] });
};

/**
 * Middleware to verify JWT token
 * Attaches decoded user to req.user
 */
/**
 * Middleware to verify JWT token from HTTPOnly Cookie or Authorization Header
 */
export const authenticateToken = (req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  let token = null;

  // 1. Priority: Check Authorization Header first (for API clients like Postman)
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    token = authHeader.split(' ')[1];
    if (isDev) console.log('[Auth] Using token from Authorization header');
  }

  // 2. Fallback: Check cookies (for browser clients)
  if (!token) {
    const isAdminClient = req.headers['x-client-type'] === 'admin';
    token = isAdminClient
      ? req.cookies.adminAccessToken
      : req.cookies.accessToken;
    if (token && isDev) {
      console.log('[Auth] Using token from cookie');
    }
  }

  if (!token) {
    throw new UnauthorizedError('Access token required');
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    if (isDev) console.log('[Auth] Token decoded - User:', decoded.email, 'Role:', decoded.role);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Access token has expired');
    }
    throw new UnauthorizedError('Invalid access token');
  }
};

/**
 * Optional authentication middleware
 * Attaches user if token present, but doesn't require it
 */
export const optionalAuth = (req, res, next) => {
  // Check Cookie or Header
  let token = req.cookies.accessToken;
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
  } catch (error) {
    req.user = null;
  }

  next();
};

/**
 * Middleware to check if user has required role
 * Must be used after authenticateToken
 * 
 * @param {...string} allowedRoles - Roles that are allowed access
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError('You do not have permission to access this resource');
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 * Shorthand for authorize('admin')
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) console.log('[Auth] requireAdmin check - User role:', req.user.role, 'Expected: admin');

  if (req.user.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }

  next();
};

/**
 * Middleware to check if user is accessing their own resource
 * Allows admins to access any resource
 * 
 * @param {string} paramName - Name of the route parameter containing user ID
 */
export const requireSelfOrAdmin = (paramName = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const resourceUserId = parseInt(req.params[paramName]);
    const isOwner = req.user.userId === resourceUserId;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('You can only access your own resources');
    }

    next();
  };
};

/**
 * Middleware factory to verify ownership of database resources
 * Prevents IDOR vulnerabilities by checking if the resource belongs to the current user
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.table - Database table name (e.g., 'addresses', 'orders')
 * @param {string} options.resourceIdParam - Route parameter name for resource ID (default: 'id')
 * @param {string} options.userIdColumn - Column name for user ID in table (default: 'user_id')
 * @param {string} options.resourceName - Human-readable resource name for error messages
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.delete('/addresses/:id', 
 *   authenticateToken, 
 *   verifyResourceOwnership({ table: 'addresses', resourceName: 'address' }),
 *   asyncHandler(async (req, res) => { ... })
 * );
 */
export const verifyResourceOwnership = (options) => {
  const {
    table,
    resourceIdParam = 'id',
    userIdColumn = 'user_id',
    resourceName = 'resource'
  } = options;

  return async (req, res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Admins can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    const resourceId = parseInt(req.params[resourceIdParam]);

    if (isNaN(resourceId)) {
      throw new ForbiddenError(`Invalid ${resourceName} ID`);
    }

    // Import db module dynamically to avoid circular dependency
    const db = (await import('../../db/postgres.js')).default;

    try {
      const resource = await db.queryOne(
        `SELECT ${userIdColumn} FROM ${table} WHERE id = $1 AND deleted_at IS NULL`,
        [resourceId]
      );

      if (!resource) {
        throw new ForbiddenError(`${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} not found`);
      }

      if (resource[userIdColumn] !== req.user.userId) {
        throw new ForbiddenError(`You can only access your own ${resourceName}s`);
      }

      // Attach resource to request for use in handler if needed
      req.resource = resource;
      next();
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error;
      }
      throw new ForbiddenError(`Unable to verify ${resourceName} ownership`);
    }
  };
};

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  authenticateToken,
  optionalAuth,
  authorize,
  requireAdmin,
  requireSelfOrAdmin,
};
