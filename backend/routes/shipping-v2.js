/**
 * Shipping Data Routes
 * 
 * Provides access to Guepex reference data from PostgreSQL
 * (wilayas, communes, centers) for the frontend
 * 
 * Also handles Guepex webhooks for real-time parcel status updates
 */

import express from 'express';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import guepexSync from '../src/services/guepex-sync.js';
import guepexClient, { GuepexAPIClient } from '../src/services/guepex-api.js';
import guepexShipmentService from '../src/services/guepex-shipment.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import db from '../src/db/postgres.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
const dataDir = path.join(__dirname, '../../database/shipping');

// Store processed event IDs to prevent duplicates (in-memory, consider Redis for production)
const processedEventIds = new Set();
const MAX_PROCESSED_EVENTS = 10000;

// GET all wilayas
router.get('/wilayas', asyncHandler(async (req, res) => {
  const wilayas = await db.queryMany(
    'SELECT * FROM guepex_wilayas ORDER BY id ASC'
  );

  if (!wilayas || wilayas.length === 0) {
    return res.status(503).json({
      success: false,
      error: 'Shipping data not available.',
      needsSync: true
    });
  }

  res.json({
    success: true,
    data: wilayas,
    lastUpdated: new Date().toISOString()
  });
}));

// GET communes (all or filtered by wilaya)
router.get('/communes', asyncHandler(async (req, res) => {
  const { wilayaId, hasStopDesk, isDeliverable } = req.query;

  let query = 'SELECT * FROM guepex_communes WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (wilayaId) {
    query += ` AND wilaya_id = $${paramIndex++}`;
    params.push(parseInt(wilayaId));
  }

  if (hasStopDesk === 'true') {
    query += ` AND has_stop_desk = 1`;
  }

  if (isDeliverable === 'true') {
    query += ` AND is_deliverable = 1`;
  }

  query += ' ORDER BY name ASC';

  const communes = await db.queryMany(query, params);

  if (!communes || communes.length === 0) {
    return res.status(503).json({
      success: false,
      error: 'Commune data not available.',
      needsSync: true
    });
  }

  res.json({
    success: true,
    data: communes,
    lastUpdated: new Date().toISOString(),
    filtered: !!wilayaId,
    total: communes.length
  });
}));

// GET centers (stop desks) - all or filtered by wilaya
router.get('/centers', asyncHandler(async (req, res) => {
  const { wilayaId } = req.query;

  let query = `
    SELECT 
      sc.center_id,
      sc.name,
      sc.address,
      sc.gps,
      sc.commune_id,
      sc.wilaya_id,
      'Guepex' as provider,
      c.name as commune_name,
      w.name as wilaya_name,
      sc.last_synced_at as created_at,
      sc.last_synced_at as updated_at
    FROM guepex_centers sc
    LEFT JOIN guepex_communes c ON sc.commune_id = c.id
    LEFT JOIN guepex_wilayas w ON sc.wilaya_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (wilayaId) {
    query += ' AND sc.wilaya_id = $1';
    params.push(parseInt(wilayaId));
  }

  query += ' ORDER BY sc.name ASC';

  const centers = await db.queryMany(query, params);

  if (!centers || centers.length === 0) {
    return res.status(503).json({
      success: false,
      error: 'Centers data not available.',
      needsSync: true
    });
  }

  res.json({
    success: true,
    data: centers,
    lastUpdated: new Date().toISOString(),
    filtered: !!wilayaId,
    total: centers.length
  });
}));

// GET sync status (Admin only)
router.get('/sync-status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const status = await guepexSync.getStatus();

  res.json({
    success: true,
    data: status
  });
}));

// POST trigger manual sync (Admin only)
router.post('/sync', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { type } = req.body; // 'full' or 'quick'

  const syncPromise = type === 'quick' 
    ? guepexSync.quickSync()
    : guepexSync.syncAll();

  res.json({
    success: true,
    message: `${type === 'quick' ? 'Quick' : 'Full'} sync started`,
    note: 'Sync is running in background. Check sync-status for progress.'
  });

  syncPromise
    .then(() => console.log('[Shipping Data] Sync completed'))
    .catch(error => console.error('[Shipping Data] Sync failed:', error));
}));

// GET sync logs (Admin only)
router.get('/sync-logs', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  try {
    const logFile = path.join(dataDir, 'sync-log.json');
    const data = await fs.readFile(logFile, 'utf8');
    const logs = JSON.parse(data);

    res.json({
      success: true,
      data: Array.isArray(logs) ? logs : []
    });
  } catch (error) {
    res.json({
      success: true,
      data: []
    });
  }
}));

// ============================================================================
// GUEPEX WEBHOOK HANDLER
// ============================================================================

/**
 * Guepex Webhook Endpoint
 * 
 * Handles both:
 * 1. CRC validation (GET with ?subscribe&crc_token) - Required for webhook subscription
 * 2. Event notifications (POST with signature verification)
 * 
 * Event Types:
 * - parcel_created: New parcel created
 * - parcel_edited: Parcel details updated
 * - parcel_deleted: Parcel deleted
 * - parcel_status_updated: Delivery status changed
 * - parcel_payment_updated: Payment status changed
 * 
 * Security:
 * - Signature verification using X-YALIDINE-SIGNATURE header
 * - HMAC-SHA256 with shared secret
 * - Duplicate event prevention using event_id
 */
router.all('/webhook', 
  // Use raw body parser for signature verification
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    
    // ========================================
    // CRC VALIDATION (Required for webhook subscription)
    // ========================================
    // Guepex sends GET request with ?subscribe&crc_token to validate endpoint
    if (req.method === 'GET' && req.query.subscribe !== undefined && req.query.crc_token) {
      console.log('[Guepex Webhook] CRC validation request received');
      
      // Must return the crc_token exactly as received
      res.set('Content-Type', 'text/plain');
      return res.status(200).send(req.query.crc_token);
    }

    // ========================================
    // REJECT NON-POST REQUESTS
    // ========================================
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        allowed: ['GET (with subscribe & crc_token)', 'POST']
      });
    }

    // ========================================
    // SIGNATURE VERIFICATION
    // ========================================
    const signature = req.headers[GuepexAPIClient.WEBHOOK_SIGNATURE_HEADER] || 
                      req.headers['x_yalidine_signature'] ||
                      req.headers['http_x_yalidine_signature'];
    
    const rawBody = req.body; // Buffer because of express.raw()
    
    if (!guepexClient.verifyWebhookSignature(rawBody, signature)) {
      console.warn('[Guepex Webhook] Invalid signature - rejecting request');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // ========================================
    // PARSE PAYLOAD
    // ========================================
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (error) {
      console.error('[Guepex Webhook] Invalid JSON payload:', error.message);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const { type, events } = payload;

    if (!type || !Array.isArray(events)) {
      console.error('[Guepex Webhook] Invalid payload structure');
      return res.status(400).json({ error: 'Invalid payload structure' });
    }

    console.log(`[Guepex Webhook] Received ${events.length} ${type} event(s)`);

    // ========================================
    // RESPOND IMMEDIATELY (Best practice: < 10 seconds)
    // ========================================
    // Send 200 response immediately, process events asynchronously
    res.status(200).json({ received: true, event_count: events.length });

    // ========================================
    // PROCESS EVENTS ASYNCHRONOUSLY
    // ========================================
    setImmediate(async () => {
      for (const event of events) {
        const { event_id, occurred_at, data } = event;

        // Skip duplicate events
        if (processedEventIds.has(event_id)) {
          console.log(`[Guepex Webhook] Skipping duplicate event: ${event_id}`);
          continue;
        }

        // Track processed events (with size limit)
        if (processedEventIds.size >= MAX_PROCESSED_EVENTS) {
          // Remove oldest entries (convert to array, slice, convert back)
          const entries = Array.from(processedEventIds);
          entries.slice(0, MAX_PROCESSED_EVENTS / 2).forEach(id => processedEventIds.delete(id));
        }
        processedEventIds.add(event_id);

        try {
          switch (type) {
            case 'parcel_status_updated':
              await handleParcelStatusUpdated(data, occurred_at, event_id);
              break;

            case 'parcel_payment_updated':
              await handleParcelPaymentUpdated(data, occurred_at, event_id);
              break;

            case 'parcel_created':
              await handleParcelCreated(data, occurred_at, event_id);
              break;

            case 'parcel_edited':
              await handleParcelEdited(data, occurred_at, event_id);
              break;

            case 'parcel_deleted':
              await handleParcelDeleted(data, occurred_at, event_id);
              break;

            default:
              console.warn(`[Guepex Webhook] Unknown event type: ${type}`);
          }
        } catch (error) {
          console.error(`[Guepex Webhook] Error processing event ${event_id}:`, error.message);
          // Log for monitoring but don't fail - event was already acknowledged
          await logWebhookError(event_id, type, error);
        }
      }
    });
  })
);

// ============================================================================
// WEBHOOK EVENT HANDLERS
// ============================================================================

/**
 * Handle parcel_status_updated events
 * Most important webhook - updates delivery status
 */
async function handleParcelStatusUpdated(data, occurredAt, eventId) {
  const { tracking, status, reason } = data;
  
  console.log(`[Guepex Webhook] Status update: ${tracking} → ${status}${reason ? ` (${reason})` : ''}`);

  await guepexShipmentService.updateOrderFromWebhook({
    tracking,
    last_status: status,
    status_reason: reason,
    event_id: eventId,
    occurred_at: occurredAt
  });
}

/**
 * Handle parcel_payment_updated events
 * Updates payment status for COD orders
 */
async function handleParcelPaymentUpdated(data, occurredAt, eventId) {
  const { tracking, status, payment_id } = data;
  
  console.log(`[Guepex Webhook] Payment update: ${tracking} → ${status} (payment_id: ${payment_id})`);

  // Find order by tracking
  const order = await db.queryOne(
    'SELECT * FROM orders WHERE tracking_number = $1 OR guepex_tracking_number = $1',
    [tracking]
  );

  if (!order) {
    console.warn(`[Guepex Webhook] No order found for tracking: ${tracking}`);
    return;
  }

  // Only process payment updates for COD orders
  if (order.payment_method !== 'cod') {
    console.log(`[Guepex Webhook] Skipping payment update for non-COD order ${order.order_number} (method: ${order.payment_method})`);
    return;
  }

  // Don't regress if already paid and delivered
  if (order.payment_status === 'paid' && order.current_status === 'delivered') {
    console.log(`[Guepex Webhook] Order ${order.order_number} already delivered and paid - skipping payment update`);
    return;
  }

  // Update payment status based on Guepex payment status
  // Statuses: not-ready, ready, receivable, payed
  let newPaymentStatus = order.payment_status;
  
  switch (status) {
    case 'payed':
      newPaymentStatus = 'paid';
      break;
    case 'receivable':
      newPaymentStatus = 'processing';
      break;
    case 'ready':
      newPaymentStatus = 'pending';
      break;
  }

  if (newPaymentStatus !== order.payment_status) {
    await db.query(`
      UPDATE orders 
      SET payment_status = $1,
          guepex_payment_id = $2,
          paid_at = CASE WHEN $1 = 'paid' THEN $3 ELSE paid_at END,
          updated_at = $3
      WHERE id = $4
    `, [newPaymentStatus, payment_id, occurredAt, order.id]);

    // Record in order history
    await db.query(`
      INSERT INTO order_history (order_id, status, notes, changed_at)
      VALUES ($1, $2, $3, $4)
    `, [
      order.id, 
      order.current_status, 
      `Payment status updated: ${status}${payment_id ? ` (ID: ${payment_id})` : ''}`,
      occurredAt
    ]);

    console.log(`[Guepex Webhook] ✓ Order ${order.order_number} payment: ${order.payment_status} → ${newPaymentStatus}`);
  }
}

/**
 * Handle parcel_created events
 * Confirms parcel was successfully registered with Guepex
 */
async function handleParcelCreated(data, occurredAt, eventId) {
  const { order_id, tracking, label, import_id } = data;
  
  console.log(`[Guepex Webhook] Parcel created: ${order_id} → ${tracking}`);

  // order_id from Guepex is our order_number
  const order = await db.queryOne(
    'SELECT * FROM orders WHERE order_number = $1',
    [order_id]
  );

  if (!order) {
    console.warn(`[Guepex Webhook] No order found for order_id: ${order_id}`);
    return;
  }

  // Update order with Guepex details
  await db.query(`
    UPDATE orders
    SET tracking_number = COALESCE(tracking_number, $1),
        guepex_tracking_number = $1,
        guepex_import_id = $2,
        guepex_label_url = $3,
        guepex_created_at = $4,
        updated_at = $4
    WHERE id = $5
  `, [tracking, import_id, label, occurredAt, order.id]);

  console.log(`[Guepex Webhook] ✓ Order ${order_id} linked to tracking ${tracking}`);
}

/**
 * Handle parcel_edited events
 * Confirms parcel details were updated
 */
async function handleParcelEdited(data, occurredAt, eventId) {
  const { tracking, label } = data;
  
  console.log(`[Guepex Webhook] Parcel edited: ${tracking}`);

  // Update label URL if changed
  if (label) {
    await db.query(`
      UPDATE orders
      SET guepex_label_url = $1,
          updated_at = $2
      WHERE tracking_number = $3 OR guepex_tracking_number = $3
    `, [label, occurredAt, tracking]);
  }
}

/**
 * Handle parcel_deleted events
 * Parcel was cancelled/deleted from Guepex
 */
async function handleParcelDeleted(data, occurredAt, eventId) {
  const { tracking } = data;
  
  console.log(`[Guepex Webhook] Parcel deleted: ${tracking}`);

  const order = await db.queryOne(
    'SELECT * FROM orders WHERE tracking_number = $1 OR guepex_tracking_number = $1',
    [tracking]
  );

  if (!order) {
    console.warn(`[Guepex Webhook] No order found for deleted tracking: ${tracking}`);
    return;
  }

  // Record the deletion but don't automatically cancel the order
  // (admin should review and decide)
  await db.query(`
    INSERT INTO order_history (order_id, status, notes, changed_at)
    VALUES ($1, $2, $3, $4)
  `, [
    order.id,
    order.current_status,
    `Guepex parcel deleted (tracking: ${tracking}). Review required.`,
    occurredAt
  ]);

  console.log(`[Guepex Webhook] ⚠ Order ${order.order_number} parcel deleted from Guepex - review required`);
}

/**
 * Log webhook errors for monitoring
 */
async function logWebhookError(eventId, eventType, error) {
  try {
    // Could store in a webhook_errors table for monitoring
    console.error(`[Guepex Webhook Error] Event: ${eventId}, Type: ${eventType}, Error: ${error.message}`);
    
    // Optional: Store in database for admin review
    // await db.query(`
    //   INSERT INTO webhook_errors (event_id, event_type, error_message, created_at)
    //   VALUES ($1, $2, $3, NOW())
    // `, [eventId, eventType, error.message]);
  } catch (logError) {
    console.error('[Guepex Webhook] Failed to log error:', logError.message);
  }
}

export default router;
