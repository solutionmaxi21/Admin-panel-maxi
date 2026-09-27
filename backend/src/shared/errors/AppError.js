/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Indicates this is a known, handled error
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Invalid input or malformed request
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * 409 Conflict - Resource already exists or state conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * 422 Unprocessable Entity - Validation errors
 */
export class ValidationError extends AppError {
  constructor(errors = [], message = 'Validation failed') {
    super(message, 422, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * 409 Conflict - Stock not available
 */
export class OutOfStockError extends AppError {
  constructor(productName, requested, available, warehouseName) {
    const message = `Insufficient stock for ${productName}. Requested: ${requested}, Available: ${available}`;
    super(message, 409, 'OUT_OF_STOCK');
    this.details = {
      productName,
      requested,
      available,
      warehouse: warehouseName
    };
  }
}

/**
 * 422 Order not cancellable
 */
export class OrderNotCancellableError extends AppError {
  constructor(currentStatus, orderNumber) {
    const message = `Order cannot be cancelled. Current status: ${currentStatus}`;
    super(message, 422, 'ORDER_NOT_CANCELLABLE');
    this.details = {
      currentStatus,
      orderNumber
    };
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMITED');
  }
}

/**
 * 500 Internal Server Error - Unexpected errors
 */
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 500, 'INTERNAL_ERROR');
    this.isOperational = false; // Indicates unexpected error
  }
}

export default {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  OutOfStockError,
  OrderNotCancellableError,
  RateLimitError,
  InternalError,
};
