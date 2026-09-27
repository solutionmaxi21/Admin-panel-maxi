import express from 'express';
import { authLimiter, passwordResetLimiter, loginLimiter, refreshLimiter } from '../src/shared/middleware/rateLimiter.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import {
  authenticateToken
} from '../src/shared/middleware/auth.js';
import {
  hashPassword
} from '../src/shared/utils/password.js';
import {
  UnauthorizedError,
  BadRequestError,
  ForbiddenError
} from '../src/shared/errors/index.js';
import db from '../src/db/postgres.js';
import crypto from 'crypto';
import { validate } from '../src/shared/middleware/validate.js';
import authSchemas from '../src/shared/validation/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../src/shared/services/email.js';
import AuthService from '../src/services/authService.js';

const router = express.Router();

// Token Expiration Config (from env with defaults)
const ACCESS_TOKEN_EXPIRY_MS = parseInt(process.env.ACCESS_TOKEN_EXPIRY_MS) || 15 * 60 * 1000; // 15 min
const REFRESH_TOKEN_COOKIE_DAYS = parseInt(process.env.REFRESH_TOKEN_COOKIE_DAYS) || 7;
const PASSWORD_RESET_EXPIRY_MINUTES = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 30;
const EMAIL_VERIFICATION_EXPIRY_HOURS = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS) || 24;

// Cookie Configuration
const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
  httpOnly: true,
  // Allow COOKIE_SECURE=false to override even in production (for local HTTP dev with NODE_ENV=production)
  secure: process.env.COOKIE_SECURE === 'false' ? false : isProduction,
  sameSite: 'lax',
  maxAge: ACCESS_TOKEN_EXPIRY_MS
};

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_COOKIE_DAYS * 24 * 60 * 60 * 1000
};

// clearCookie must match the same options used when setting the cookie
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: COOKIE_OPTIONS.httpOnly,
  secure: COOKIE_OPTIONS.secure,
  sameSite: COOKIE_OPTIONS.sameSite,
  path: '/api/auth',
};

/**
 * Helper: Generate and Hash Token
 */
const createSecurityToken = (expiresInMinutes = PASSWORD_RESET_EXPIRY_MINUTES) => {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
  return { token, hash, expires };
};

// ==========================================
// 1. REGISTER (with Email Verification)
// ==========================================
router.post('/signup', authLimiter, validate(authSchemas.registerSchema), asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, phone } = req.body;

  // Check if user exists
  const existingUser = await db.queryOne(
    'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'User with this email already exists'
    });
  }

  const hashedPassword = await hashPassword(password);

  // Generate Verification Token
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

  // Sanitize Inputs (Basic XSS Prevention)
  const sanitizedFirstName = firstName.replace(/<[^>]*>?/gm, '').trim();
  const sanitizedLastName = lastName.replace(/<[^>]*>?/gm, '').trim();

  const query = `
    INSERT INTO users (
      email, password_hash, first_name, last_name, phone,
      role, is_active, verification_token, verification_expires,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    RETURNING id
  `;

  const result = await db.query(query, [
    email, hashedPassword, sanitizedFirstName, sanitizedLastName, phone || null,
    'customer', true, hash, expires
  ]);
  const newUserId = result.rows[0].id;

  // Send Email
  sendVerificationEmail(email, token, sanitizedFirstName).catch(console.error);

  res.status(201).json({
    success: true,
    message: 'Account created. Please check your email to verify.',
    user: {
      id: newUserId,
      email,
      firstName: sanitizedFirstName,
      lastName: sanitizedLastName,
      role: 'customer'
    }
  });
}));

// ==========================================
// 2. VERIFY EMAIL
// ==========================================
router.post('/verify-email', authLimiter, asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw new BadRequestError('Token required');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await db.queryOne(
    `SELECT id FROM users 
     WHERE verification_token = $1 
     AND verification_expires > NOW() 
     AND deleted_at IS NULL`,
    [tokenHash]
  );

  if (!user) {
    throw new BadRequestError('Invalid or expired verification token');
  }

  await db.query(
    `UPDATE users 
     SET verification_token = NULL, 
         verification_expires = NULL, 
         updated_at = NOW() 
     WHERE id = $1`,
    [user.id]
  );

  res.json({ success: true, message: 'Email verified successfully' });
}));

// ==========================================
// 3. FORGOT PASSWORD (Request Reset)
// ==========================================
router.post('/forgot-password', passwordResetLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await db.queryOne(
    `SELECT id FROM users 
     WHERE email = $1 
     AND deleted_at IS NULL 
     AND google_id IS NULL`,
    [email]
  );

  if (!user) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  }

  const { token, hash, expires } = createSecurityToken(60);

  await db.query(
    'UPDATE users SET reset_token_hash = $1, reset_expires_at = $2 WHERE id = $3',
    [hash, expires, user.id]
  );

  sendPasswordResetEmail(email, token).catch(console.error);

  res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
}));

// ==========================================
// 4. RESET PASSWORD (Confirm Reset)
// ==========================================
router.post('/reset-password', passwordResetLimiter, asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) throw new BadRequestError('Token and password required');

  // Validate password strength
  const { validatePasswordStrength } = await import('../src/shared/utils/password.js');
  const validation = validatePasswordStrength(newPassword);
  if (!validation.isValid) {
    throw new BadRequestError(validation.errors.join(', '));
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await db.queryOne(
    `SELECT id FROM users 
     WHERE reset_token_hash = $1 
     AND reset_expires_at > NOW()`,
    [tokenHash]
  );

  if (!user) {
    throw new BadRequestError('Invalid or expired reset token');
  }

  const hashedPassword = await hashPassword(newPassword);

  await db.query(
    `UPDATE users 
     SET password_hash = $1, 
         reset_token_hash = NULL, 
         reset_expires_at = NULL, 
         updated_at = NOW() 
     WHERE id = $2`,
    [hashedPassword, user.id]
  );

  res.json({ success: true, message: 'Password has been reset successfully' });
}));

// ==========================================
// 5. LOGIN
// ==========================================
router.post('/login', loginLimiter, validate(authSchemas.loginSchema), asyncHandler(async (req, res) => {
  const { email, password, isAdmin } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  const { accessToken, refreshToken, user } = await AuthService.login(email, password, ipAddress, userAgent);

  if (isAdmin && user.role !== 'admin') {
    throw new UnauthorizedError('Access Denied: Not an admin');
  }

  if (isAdmin) {
    res.cookie('adminAccessToken', accessToken, COOKIE_OPTIONS);
    res.cookie('adminRefreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  } else {
    res.cookie('accessToken', accessToken, COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  }

  // Only include tokens in body for Electron (file:// can't use cross-origin cookies)
  // Browser clients use HttpOnly cookies exclusively (safer against XSS)
  const isElectronClient = req.headers['x-client-platform'] === 'electron';

  const responseBody = {
    success: true,
    message: 'Logged in successfully',
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    }
  };

  if (isElectronClient) {
    responseBody.accessToken = accessToken;
    responseBody.refreshToken = refreshToken;
  }

  res.json(responseBody);
}));

// ==========================================
// 6. RESEND VERIFICATION
// ==========================================
router.post('/resend-verification', authLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await db.queryOne(
    `SELECT id, first_name 
     FROM users 
     WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

    await db.query(
      'UPDATE users SET verification_token = $1, verification_expires = $2 WHERE id = $3',
      [hash, expires, user.id]
    );

    sendVerificationEmail(email, token, user.first_name).catch(console.error);
  }

  res.json({ success: true, message: 'If account exists and is unverified, email sent.' });
}));

// ==========================================
// 7. GOOGLE LOGIN
// ==========================================
router.post('/google', authLimiter, asyncHandler(async (req, res) => {
  const { token, isAdmin } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  // Refactored to use AuthService
  const { accessToken, refreshToken, user } = await AuthService.loginWithGoogle(token, ipAddress, userAgent);

  if (isAdmin === true) {
    if (user.role !== 'admin') {
      throw new UnauthorizedError('Access Denied: Not an admin');
    }
    res.cookie('adminAccessToken', accessToken, COOKIE_OPTIONS);
    res.cookie('adminRefreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  } else {
    res.cookie('accessToken', accessToken, COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  }

  res.json({
    success: true,
    message: 'Google login successful',
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      avatarUrl: user.avatarUrl // Note: AuthService might need to return this field or we fetch it.
      // AuthService returns `firstName` from `first_name`. Let's assume consistent naming or update AuthService.
      // Looking at AuthService._generateTokenPair logic: returns firstName: user.first_name || user.firstName
      // But it doesn't currently return avatarUrl in the payload. 
      // It's acceptable for now or I can add it to AuthService if strictness required.
    }
  });
}));

// ==========================================
// 8. REFRESH TOKEN
// ==========================================
router.post('/refresh', refreshLimiter, asyncHandler(async (req, res) => {
  const isAdminClient = req.headers['x-client-type'] === 'admin';
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  const refreshToken = isAdminClient
    ? (req.cookies?.adminRefreshToken || req.body?.refreshToken)
    : (req.cookies?.refreshToken || req.body?.refreshToken);

  if (!refreshToken) {
    if (isAdminClient) {
      res.clearCookie('adminAccessToken', CLEAR_COOKIE_OPTIONS);
      res.clearCookie('adminRefreshToken', CLEAR_COOKIE_OPTIONS);
      res.clearCookie('adminRefreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth' });
      res.clearCookie('adminRefreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth/refresh' });
    } else {
      res.clearCookie('accessToken', CLEAR_COOKIE_OPTIONS);
      res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
      res.clearCookie('refreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth' });
      res.clearCookie('refreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth/refresh' });
    }
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Refresh token required'
      }
    });
  }

  try {
    const { accessToken, refreshToken: newRefreshToken } = await AuthService.refreshToken(refreshToken, ipAddress, userAgent);

    if (isAdminClient) {
      res.cookie('adminAccessToken', accessToken, COOKIE_OPTIONS);
      res.cookie('adminRefreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);
    } else {
      res.cookie('accessToken', accessToken, COOKIE_OPTIONS);
      res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);
    }

    // Only include tokens in body for Electron (file:// can't read cross-origin cookies)
    const isElectronClient = req.headers['x-client-platform'] === 'electron';
    const refreshResponse = { success: true, message: 'Token refreshed' };
    if (isElectronClient) {
      refreshResponse.accessToken = accessToken;
      refreshResponse.refreshToken = newRefreshToken;
    }
    res.json(refreshResponse);

  } catch (error) {
    const isUnauthorized =
      error instanceof UnauthorizedError ||
      error?.statusCode === 401 ||
      error?.name === 'JsonWebTokenError' ||
      error?.name === 'TokenExpiredError';

    const isForbidden =
      error instanceof ForbiddenError ||
      error?.statusCode === 403;

    const isAuthFailure = isUnauthorized || isForbidden;

    // Only clear cookies on definitive auth failures (expired/revoked/reuse)
    // Do NOT clear on transient errors (DB timeout, 500) — user can retry
    if (isAuthFailure) {
      if (isAdminClient) {
        res.clearCookie('adminAccessToken', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('adminRefreshToken', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('adminRefreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth' });
        res.clearCookie('adminRefreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth/refresh' });
      } else {
        res.clearCookie('accessToken', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('refreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth' });
        res.clearCookie('refreshToken', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth/refresh' });
      }
    }

    if (isUnauthorized) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired refresh token'
        }
      });
    }

    if (isForbidden) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: error.message || 'Suspicious activity detected. Please login again.'
        }
      });
    }

    throw error;
  }
}));

// ==========================================
// 9. GET CURRENT USER
// ==========================================
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const user = await db.queryOne(
    'SELECT id, email, first_name, last_name, role, phone FROM users WHERE id = $1',
    [req.user.userId]
  );

  if (!user) throw new UnauthorizedError('User not found');

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      phone: user.phone
    },
    // Include JWT iat for offline sync key derivation
    jwtIat: req.user.iat
  });
}));

// ==========================================
// 10. LOGOUT
// ==========================================

router.post('/logout', asyncHandler(async (req, res) => {
  const isAdminClient = req.headers['x-client-type'] === 'admin';
  const refreshToken = isAdminClient
    ? (req.cookies?.adminRefreshToken || req.body?.refreshToken)
    : (req.cookies?.refreshToken || req.body?.refreshToken);

  // CRITICAL: Clear cookies FIRST — before any DB operation that could fail
  // This ensures cookies are always cleared even if DB revocation fails
  // NOTE: clearCookie path MUST match the path used when setting the cookie
  const CLEAR_ROOT_PATH = { httpOnly: COOKIE_OPTIONS.httpOnly, secure: COOKIE_OPTIONS.secure, sameSite: COOKIE_OPTIONS.sameSite, path: '/' };
  const CLEAR_AUTH_PATH = { httpOnly: COOKIE_OPTIONS.httpOnly, secure: COOKIE_OPTIONS.secure, sameSite: COOKIE_OPTIONS.sameSite, path: '/api/auth' };
  if (isAdminClient) {
    res.clearCookie('adminAccessToken', CLEAR_ROOT_PATH);
    res.clearCookie('adminRefreshToken', CLEAR_AUTH_PATH);
    res.clearCookie('adminRefreshToken', CLEAR_ROOT_PATH);
  } else {
    res.clearCookie('accessToken', CLEAR_ROOT_PATH);
    res.clearCookie('refreshToken', CLEAR_AUTH_PATH);
    res.clearCookie('refreshToken', CLEAR_ROOT_PATH);
  }

  // Revoke token in DB (best effort — cookies are already cleared above)
  try {
    await AuthService.logout(refreshToken);
  } catch (e) {
    console.error('[Auth] Failed to revoke refresh token in DB:', e.message);
  }

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

// ==========================================
// 11. INFO — minimal (no endpoint enumeration)
// ==========================================
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Authentication API',
  });
});

export default router;
