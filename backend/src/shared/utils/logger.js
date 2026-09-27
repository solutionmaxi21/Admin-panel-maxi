import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

/**
 * Pino Logger Configuration
 * 
 * Features:
 * - Structured JSON logging
 * - Request ID tracking for correlation
 * - Sensitive data redaction
 * - Log levels based on environment
 * 
 * For pretty printing in development, run:
 * node server.js | npx pino-pretty
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

// Paths to redact sensitive data
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.confirmPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'res.headers["set-cookie"]',
  'user.password',
  'user.refreshToken',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.creditCard',
  '*.cardNumber',
  '*.cvv',
];

// Logger configuration
const loggerConfig = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Redact sensitive information
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  
  // Base context included in all logs
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'algerian-hardware-api',
  },
  
  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Custom serializers
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        host: req.headers.host,
      },
      remoteAddress: req.ip || req.connection?.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.getHeader?.('content-type'),
        'content-length': res.getHeader?.('content-length'),
      },
    }),
    err: pino.stdSerializers.err,
  },
  
  // Format errors nicely
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      ...bindings,
    }),
  },
};

// Development: Pretty print to console
// Production: JSON output (can be piped to log aggregator)

// Create the logger instance - simple approach without transport for stability
export const logger = pino(loggerConfig);

/**
 * Generate a unique request ID
 */
export const generateRequestId = () => uuidv4();

/**
 * Create a child logger with request context
 * @param {object} context - Additional context to include
 */
export const createChildLogger = (context) => {
  return logger.child(context);
};

/**
 * Request logging middleware
 * Adds request ID and logs request/response
 */
export const requestLogger = (req, res, next) => {
  // Generate or use existing request ID
  req.id = req.headers['x-request-id'] || generateRequestId();
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.id);
  
  // Create child logger with request context
  req.log = logger.child({ requestId: req.id });
  
  // Log request start
  const startTime = Date.now();
  req.log.info({
    event: 'request.start',
    msg: 'Incoming request',
    req
  });
  
  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' 
                   : res.statusCode >= 400 ? 'warn' 
                   : 'info';
    
    req.log[logLevel]({
      event: 'request.completed',
      msg: 'Request completed',
      res,
      duration,
      userId: req.user?.id,
    });
  });
  
  // Log if connection is closed before response
  res.on('close', () => {
    if (!res.writableEnded) {
      req.log.warn({
        event: 'request.aborted',
        msg: 'Request aborted by client',
        req
      });
    }
  });
  
  next();
};

/**
 * Log security events (login attempts, auth failures, etc.)
 */
export const securityLogger = logger.child({ type: 'security' });

/**
 * Log audit events (data changes, admin actions, etc.)
 */
export const auditLogger = logger.child({ type: 'audit' });

/**
 * Log performance metrics
 */
export const performanceLogger = logger.child({ type: 'performance' });

/**
 * Helper to log errors with stack trace
 */
export const logError = (error, context = {}) => {
  logger.error({
    err: error,
    ...context,
  }, error.message || 'An error occurred');
};

/**
 * Helper to log security events
 */
export const logSecurityEvent = (event, details = {}) => {
  securityLogger.warn({
    event,
    ...details,
    timestamp: new Date().toISOString(),
  }, `Security event: ${event}`);
};

/**
 * Helper to log audit events
 */
export const logAuditEvent = (action, details = {}) => {
  auditLogger.info({
    action,
    ...details,
    timestamp: new Date().toISOString(),
  }, `Audit: ${action}`);
};

export default logger;
