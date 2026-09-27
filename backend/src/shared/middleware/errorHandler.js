// middleware/errorHandler.js - FIXED VERSION
import { AppError, ValidationError } from '../errors/index.js';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

/**
 * Global error handling middleware
 * Handles all errors and returns consistent JSON responses
 */
export const errorHandler = (err, req, res, next) => {
  // Use request-specific logger if available, fall back to main logger
   if (err.statusCode === 401 && (req.path.includes('/auth/me') || req.path.includes('/auth/refresh'))) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
  const log = req.log || logger;
  
  // Log error with context
  if (process.env.NODE_ENV !== 'test') {
    const errorContext = {
      err,
      path: req.path,
      method: req.method,
      requestId: req.id,
      userId: req.user?.id,
    };
    
    // Log at appropriate level based on status code
    if (err instanceof AppError && err.statusCode < 500) {
      log.warn(errorContext, `Client error: ${err.message}`);
    } else {
      log.error(errorContext, `Server error: ${err.message}`);
    }
  }

  // Handle Zod validation errors - FIXED
  if (err instanceof ZodError) {
    // ZodError uses 'issues' or 'errors' property
    const zodErrors = err.issues || err.errors || [];
    const errors = zodErrors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));
    
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors,
      },
    });
  }

  // Handle our custom AppError
  if (err instanceof AppError) {
    const response = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    // Include validation details if present
    if (err instanceof ValidationError && err.errors?.length > 0) {
      response.error.details = err.errors;
    }

    // Include details for other error types that have them
    if (err.details) {
      response.error.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired',
      },
    });
  }

  // Handle Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds the maximum limit',
      },
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UNEXPECTED_FILE',
        message: 'Unexpected file field',
      },
    });
  }

  // Handle unexpected errors
  // In production, don't leak error details
  const isProduction = process.env.NODE_ENV === 'production';
  
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction 
        ? 'An unexpected error occurred. Please try again later.' 
        : err.message || 'Internal server error',
      ...(isProduction ? {} : { stack: err.stack }), // Include stack in dev
    },
  });
};

/**
 * 404 Not Found handler
 * Catches all unmatched routes
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};