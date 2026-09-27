// src/shared/middleware/rateLimiter.js - OPTIMIZED VERSION
import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware configurations
 */

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Read-only API rate limiter (GET requests)
 * High limits to allow for polling and navigation
 */
export const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 20000 : 10000, // 10,000 requests per 15 min (~11 req/sec)
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many read requests. Please slow down.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Write API rate limiter (POST, PUT, DELETE, PATCH)
 * Stricter limits to prevent abuse and spam
 */
export const apiLimiter = rateLimit({
  windowMs: isDevelopment
    ? 1 * 60 * 1000 // Dev: 1 minute
    : (parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000), // Prod: 15 minutes
  max: isDevelopment
    ? 10000 // Dev: essentially unlimited
    : (parseInt(process.env.RATE_LIMIT_MAX) || 3000), // Prod: 3000 requests (~3 req/sec)
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Strict rate limiter for Login endpoints
 * Very restrictive window (1 minute) to stop brute force storms instantly
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 100 : 5, // 5 attempts per minute per IP
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Please try again in 1 minute.',
    },
  },
  standardHeaders: true, // Returns Retry-After header
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failures!
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * General Auth rate limiter (Signup, Verify, etc)
 * Broader window but strict count
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes (was 1 hour)
  max: isDevelopment ? 1000 : 10, // 10 attempts per 15 min
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for password reset requests
 * Prevent email enumeration and spam
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 100 : 5, // 5 requests per hour (increased from 3)
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password reset requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for sensitive operations (account deletion, etc.)
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 100 : 10, // 10 sensitive operations per hour
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sensitive operations. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for token refresh endpoint
 * Prevents token replay/brute-force attacks
 */
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 100 : 10, // 10 refreshes per minute per IP
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many refresh requests. Please try again shortly.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

export default {
  readLimiter,
  apiLimiter,
  loginLimiter,
  authLimiter,
  passwordResetLimiter,
  sensitiveLimiter,
  refreshLimiter,
};