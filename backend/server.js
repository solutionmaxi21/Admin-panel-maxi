import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';

// Load environment variables FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Database & Cache
import db from './src/db/postgres.js';
import CacheManager from './src/services/cacheManager.js';

// Security imports
import { helmetConfig, corsConfig, additionalSecurityHeaders } from './src/config/security.js';
import { apiLimiter, readLimiter } from './src/shared/middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './src/shared/middleware/errorHandler.js';
import { localeMiddleware } from './src/shared/middleware/locale.js';
import { csrfTokenSetter, csrfProtection } from './src/shared/middleware/csrf.js';

// Logger
import { logger, requestLogger, logError } from './src/shared/utils/logger.js';

// Import routes (V2 = PostgreSQL/Prisma versions)
import authRoutes from './routes/auth-v2.js';
import productRoutes from './routes/products-v2.js';
import orderRoutes from './routes/orders-v2.js';
import userRoutes from './routes/users-v2.js';
import reviewRoutes from './routes/reviews-v2.js';
import dashboardRoutes from './routes/dashboard-v2.js';
import metadataRoutes from './routes/metadata-v2.js';
import promotionRoutes from './routes/promotions-v2.js';
import returnsRoutes from './routes/returns-v2.js';
import categoriesRoutes from './routes/categories-v2.js';
import collectionsRoutes from './routes/collections-v2.js';
import suppliersRoutes from './routes/suppliers-v2.js';
import inventoryRoutes from './routes/inventory-v2.js';
import stockMovementsRoutes from './routes/stock-movements.js';
import orderHistoryRoutes from './routes/order-history-v2.js';
import storefrontRoutes from './routes/storefront-v2.js';
import shippingRoutes from './routes/shipping-v2.js';
import syncRoutes from './routes/sync-v2.js';
import barcodeRoutes from './routes/barcode-v2.js';
import constantsRoutes from './routes/constants-v2.js';
import notificationRoutes from './routes/notifications.js';
import databaseRoutes from './routes/database-v2.js';
import favoritesRoutes from './routes/favorites-v2.js';
import warehouseRoutes from './routes/warehouses.js';
import variantRoutes from './routes/variants.js';


// Guepex polling service (alternative to webhooks)
import guepexPollingService from './src/services/guepex-polling.js';
import notificationCleanupService from './src/services/notification-cleanup.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ===== TRUST PROXY =====
// Enable trust proxy for ngrok/reverse proxy environments
// Required for rate limiting and getting real client IPs
app.set('trust proxy', 1);

// ✅ SECURITY: Remove X-Powered-By header (prevents framework fingerprinting)
app.disable('x-powered-by');

// ===== SECURITY MIDDLEWARE =====
// Apply security headers (Helmet)
app.use(helmetConfig);

app.use(corsConfig);

// Additional security headers
app.use(additionalSecurityHeaders);

// ===== LOGGING =====
// Request logging middleware (adds request ID)
app.use(requestLogger);

// Apply rate limiting to all API routes
// Apply split rate limiting to API routes
app.use('/api', (req, res, next) => {
  // Auth routes have their own dedicated rate limiters - skip global limiter to avoid double-limiting
  if (req.path.startsWith('/auth/')) {
    return next();
  }
  if (req.method === 'GET') {
    return readLimiter(req, res, next);
  }
  return apiLimiter(req, res, next);
});

// ===== BODY PARSING =====
// JSON body parsing — 10MB is generous for admin DB import; most requests are <1MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ===== CSRF PROTECTION =====
// Set CSRF token cookie on every response, verify on state-changing requests
app.use(csrfTokenSetter);
app.use('/api', csrfProtection);

// ===== STATIC FILES =====
// Add CORS headers for image files to allow cross-origin loading
app.use('/uploads', (req, res, next) => {
  // Allow cross-origin loading for product images (storefront + admin)
  // Uses the same allowed origins as the main CORS config
  const origin = req.headers.origin;
  if (origin) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'];
    if (allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1')))) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  }
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ===== LOCALE DETECTION =====
// Detect user locale from Accept-Language header or query param
app.use(localeMiddleware);

// Root endpoint — minimal info (no endpoint enumeration)
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'MaxiStore Backend API',
    version: '1.0.0',
  });
});

// API info endpoint — minimal
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'MaxiStore API v1.0.0',
    status: 'operational',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', barcodeRoutes);  // Barcode routes (admin-only) - Register BEFORE productRoutes to avoid shadowing
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stock-movements', stockMovementsRoutes);
app.use('/api/order-history', orderHistoryRoutes);
app.use('/api/storefront', storefrontRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/sync', syncRoutes);  // Offline sync endpoint
app.use('/api/constants', constantsRoutes); // Shared constants endpoint
app.use('/api/notifications', notificationRoutes); // In-app notifications
app.use('/api/database', databaseRoutes); // Database import/export (admin-only)
app.use('/api/favorites', favoritesRoutes); // Favorites/wishlist endpoint
app.use('/api/warehouses', warehouseRoutes); // Warehouse management
app.use('/api', variantRoutes); // Product variants (Phase 4 of variants migration)

// Health check endpoint with database and cache status
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');

    // Public health check returns minimal info only
    const response = {
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    // Detailed diagnostics only for authenticated admins
    if (req.user?.role === 'admin') {
      const dbStart = Date.now();
      await db.query('SELECT 1');
      response.services = {
        database: {
          status: 'connected',
          responseTime: `${Date.now() - dbStart}ms`,
          pool: db.getStats()
        },
        cache: {
          status: 'active',
          ...CacheManager.getStats()
        }
      };
    }

    res.json(response);
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'error',
      message: 'Service unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

// ===== ERROR HANDLING =====
// Global error handler (must be after all routes)
app.use(errorHandler);

// 404 handler (must be last)
app.use(notFoundHandler);

// Initialize database and cache before starting server
async function startServer() {
  try {
    // Connect to PostgreSQL
    logger.info('🔌 Connecting to PostgreSQL...');
    await db.connect();
    logger.info('✅ PostgreSQL connected successfully');

    // Warm up cache with frequently accessed data
    logger.info('🔥 Warming up cache...');
    await CacheManager.warmUp();
    logger.info('✅ Cache warmed up successfully');

    // Start Express server - Listen on all network interfaces (0.0.0.0)
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
      }, `🚀 Server started on port ${PORT}`);
      logger.info(`📊 API available at http://localhost:${PORT}/api`);
      logger.info(`📡 Remote access: http://26.155.110.217:${PORT}/api`);
      logger.info(`🏥 Health check: http://localhost:${PORT}/api/health`);

      // Start Guepex polling service (checks order status every 5 minutes)
      const pollInterval = parseInt(process.env.GUEPEX_POLL_INTERVAL_MINUTES) || 5;
      guepexPollingService.start(pollInterval);
      logger.info(`📦 Guepex polling started - checking every ${pollInterval} minutes`);

      // Start Notification cleanup service
      notificationCleanupService.start();
      logger.info('🧹 Notification cleanup service started');
    });

    return server;
  } catch (error) {
    logger.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
const server = await startServer();

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logError(err, { type: 'uncaughtException' });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');

  // Stop polling service
  guepexPollingService.stop();
  notificationCleanupService.stop();

  // Close server
  server.close(async () => {
    logger.info('HTTP server closed');

    // Close database connections
    await db.close();
    logger.info('Database connections closed');

    logger.info('Process terminated.');
    process.exit(0);
  });
});

export default app;
