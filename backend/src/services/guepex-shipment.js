/**
 * Guepex Shipment Service
 * 
 * Handles parcel creation and management with Guepex API
 * Implements all validation rules from Guepex documentation
 * 
 * CRITICAL RULES (from Guepex docs):
 * - Must send parcels as ARRAY (even for single parcel)
 * - Phone format: Must start with 0, 9 digits (mobile) or 8 digits (landline)
 * - If is_stopdesk=true, stopdesk_id is REQUIRED
 * - If has_exchange=true, product_to_collect is REQUIRED
 * - Can only edit/delete when status is "En préparation"
 * - order_id must be unique per request
 */

import guepexClient, {
  GuepexError,
  GuepexValidationError,
  GuepexNetworkError,
  GuepexTimeoutError
} from './guepex-api.js';
import NotificationService from './NotificationService.js';
import db from '../db/postgres.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GuepexShipmentService {
  /**
   * Validate phone number according to Guepex rules
   * Must start with 0 and contain 9 digits (mobile) or 8 digits (landline)
   * Also handles international format +213 which gets converted to 0
   */
  validatePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
      return { valid: false, error: 'Phone number is required' };
    }

    let cleaned = phone.replace(/[\s\-\(\)]/g, ''); // Remove formatting

    // Convert +213 format to local format (0)
    // +213 followed by 9 digits becomes 0 + those 9 digits
    if (cleaned.startsWith('+213')) {
      cleaned = '0' + cleaned.slice(4);
    } else if (cleaned.startsWith('213') && cleaned.length >= 12) {
      cleaned = '0' + cleaned.slice(3);
    }

    // Must start with 0
    if (!cleaned.startsWith('0')) {
      return { valid: false, error: 'Phone must start with 0 or +213' };
    }

    // Must be 10 digits (mobile) or 9 digits (landline)
    if (cleaned.length !== 10 && cleaned.length !== 9) {
      return {
        valid: false,
        error: 'Phone must be 10 digits (mobile) or 9 digits (landline)'
      };
    }

    // Must be all digits
    if (!/^\d+$/.test(cleaned)) {
      return { valid: false, error: 'Phone must contain only digits' };
    }

    return { valid: true, formatted: cleaned };
  }

  /**
   * Load commune data to get names
   * @private
   */
  async loadCommune(communeId) {
    try {
      const communesPath = path.join(__dirname, '../../../database/shipping/communes.json');
      const data = await fs.readFile(communesPath, 'utf8');
      const parsed = JSON.parse(data);

      const commune = parsed.data.find(c => c.id === communeId);
      return commune;
    } catch (error) {
      console.error('[Guepex Shipment] Failed to load commune:', error.message);
      return null;
    }
  }

  /**
   * Load wilaya data to get names
   * @private
   */
  async loadWilaya(wilayaId) {
    try {
      const wilayasPath = path.join(__dirname, '../../../database/shipping/wilayas.json');
      const data = await fs.readFile(wilayasPath, 'utf8');
      const parsed = JSON.parse(data);

      const wilaya = parsed.data.find(w => w.id === wilayaId);
      return wilaya;
    } catch (error) {
      console.error('[Guepex Shipment] Failed to load wilaya:', error.message);
      return null;
    }
  }

  /**
   * Find commune by name and wilaya name (for home delivery without commune_id)
   * @private
   */
  async findCommuneByName(cityName, wilayaName) {
    try {
      // Load wilayas to find wilaya_id
      const wilayasPath = path.join(__dirname, '../../../database/shipping/wilayas.json');
      const wilayasData = await fs.readFile(wilayasPath, 'utf8');
      const wilayasParsed = JSON.parse(wilayasData);

      // Find wilaya by name (case-insensitive)
      const normalizedWilayaName = wilayaName?.toLowerCase().trim();
      const wilaya = wilayasParsed.data.find(w =>
        w.name?.toLowerCase().trim() === normalizedWilayaName ||
        w.ar_name?.toLowerCase().trim() === normalizedWilayaName
      );

      if (!wilaya) {
        console.warn(`[Guepex Shipment] Wilaya not found: ${wilayaName}`);
        return null;
      }

      // Load communes and find by name within the wilaya
      const communesPath = path.join(__dirname, '../../../database/shipping/communes.json');
      const communesData = await fs.readFile(communesPath, 'utf8');
      const communesParsed = JSON.parse(communesData);

      const normalizedCityName = cityName?.toLowerCase().trim();
      const commune = communesParsed.data.find(c =>
        c.wilaya_id === wilaya.id && (
          c.name?.toLowerCase().trim() === normalizedCityName ||
          c.ar_name?.toLowerCase().trim() === normalizedCityName
        )
      );

      if (commune) {
        console.log(`[Guepex Shipment] Found commune: ${commune.name} (ID: ${commune.id}) in wilaya ${wilaya.name}`);
        return commune;
      }

      // If exact match not found, try partial match
      const partialMatch = communesParsed.data.find(c =>
        c.wilaya_id === wilaya.id && (
          c.name?.toLowerCase().includes(normalizedCityName) ||
          normalizedCityName?.includes(c.name?.toLowerCase())
        )
      );

      if (partialMatch) {
        console.log(`[Guepex Shipment] Found commune (partial match): ${partialMatch.name} (ID: ${partialMatch.id}) in wilaya ${wilaya.name}`);
        return partialMatch;
      }

      console.warn(`[Guepex Shipment] Commune not found: ${cityName} in wilaya ${wilayaName}`);
      return null;
    } catch (error) {
      console.error('[Guepex Shipment] Failed to find commune by name:', error.message);
      return null;
    }
  }

  /**
   * Format order data into Guepex parcel format
   * @private
   */
  async formatParcelFromOrder(order, options = {}) {
    const {
      warehouseWilayaId = 16, // Default: Algiers
      warehouseWilayaName = 'Alger',
      prepaidAmount = 0
    } = options;

    // Parse shipping address
    let shippingAddress = {};
    try {
      if (order.shipping_snapshot) {
        shippingAddress = typeof order.shipping_snapshot === 'string'
          ? JSON.parse(order.shipping_snapshot)
          : order.shipping_snapshot;
      }
    } catch (error) {
      throw new Error(`Invalid shipping address for order ${order.order_number}`);
    }

    // Validate phone number - priority: order.customer_phone > shippingAddress.phone > order.user_phone
    const phoneNumber = order.customer_phone || shippingAddress.phone || order.user_phone;
    const phoneValidation = this.validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      throw new Error(`Invalid phone number for order ${order.order_number}: ${phoneValidation.error}`);
    }

    // Get commune and wilaya names
    let commune = null;
    let wilaya = null;

    if (order.delivery_commune_id) {
      // Try to load commune by ID first
      commune = await this.loadCommune(order.delivery_commune_id);
    }

    // Fallback: find commune by city/wilaya name from shipping_snapshot (for home delivery)
    if (!commune && shippingAddress.city && shippingAddress.state) {
      console.log(`[Guepex Shipment] No commune_id for order ${order.order_number}, trying to find by name: ${shippingAddress.city}, ${shippingAddress.state}`);
      commune = await this.findCommuneByName(shippingAddress.city, shippingAddress.state);
    }

    if (!commune) {
      console.error(`[Guepex Shipment] Commune lookup failed for order ${order.order_number}`);
      console.error(`[Guepex Shipment] Data - delivery_commune_id: ${order.delivery_commune_id}`);
      console.error(`[Guepex Shipment] Data - shipping_snapshot:`, JSON.stringify(shippingAddress));

      throw new Error(`Commune ${order.delivery_commune_id || 'null'} not found for order ${order.order_number}. City: ${shippingAddress.city || 'N/A'}, State: ${shippingAddress.state || 'N/A'}`);
    }

    wilaya = await this.loadWilaya(commune.wilaya_id);
    if (!wilaya) {
      throw new Error(`Wilaya ${commune.wilaya_id} not found`);
    }

    // Get order items for product description with correct column names
    const orderItems = await db.query(
      `SELECT oi.*, 
              p.product_name, 
              p.weight_kg,
              p.length_cm,
              p.width_cm,
              p.height_cm
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    const productDescriptions = [];

    for (const item of orderItems.rows) {
      if (item.product_name) {
        productDescriptions.push(`${item.quantity}x ${item.product_name}`);
      }
    }

    const productList = productDescriptions.join(', ') || 'Order items';

    // Determine delivery type
    const isStopDesk = order.delivery_type === 'stopdesk' || false;
    const stopdeskId = isStopDesk ? order.delivery_center_id : null;

    if (isStopDesk && !stopdeskId) {
      throw new Error(`Stop desk ID required for order ${order.order_number}`);
    }

    // Calculate total weight and dimensions using correct column names
    let totalWeight = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let maxHeight = 0;

    for (const item of orderItems.rows) {
      // Use weight_kg from products table
      const itemWeight = parseFloat(item.weight_kg) || 0;
      if (itemWeight > 0) {
        totalWeight += itemWeight * item.quantity;
      }
      // Use dimension columns from products table
      maxLength = Math.max(maxLength, parseFloat(item.length_cm) || 0);
      maxWidth = Math.max(maxWidth, parseFloat(item.width_cm) || 0);
      maxHeight = Math.max(maxHeight, parseFloat(item.height_cm) || 0);
    }

    // Build parcel object according to Guepex API spec
    // IMPORTANT: Guepex COD limit is 150,000 DA
    const GUEPEX_MAX_COD = 150000;
    const isCOD = order.payment_method === 'cod';
    const orderTotal = Math.round(order.total_amount);
    const codAmount = isCOD ? Math.max(0, orderTotal - prepaidAmount) : 0;

    // Validate COD limit after prepayment
    if (codAmount > GUEPEX_MAX_COD) {
      const minimumPrepayment = orderTotal - GUEPEX_MAX_COD;
      throw new Error(
        `Order ${order.order_number}: COD amount ${codAmount} DA exceeds Guepex limit (${GUEPEX_MAX_COD} DA). ` +
        `Customer must prepay at least ${minimumPrepayment} DA via CCP/bank transfer. ` +
        `Current prepaid: ${prepaidAmount} DA, Remaining: ${codAmount} DA.`
      );
    }

    // Log prepayment details
    if (prepaidAmount > 0) {
      console.log(`[Guepex Shipment] Order ${order.order_number}:`, {
        total: orderTotal,
        prepaid: prepaidAmount,
        cod: codAmount
      });
    }

    const parcel = {
      order_id: order.order_number, // Use order number as unique identifier
      from_wilaya_name: warehouseWilayaName,
      firstname: order.customer_first_name || shippingAddress.firstName || 'Customer',
      familyname: order.customer_last_name || shippingAddress.lastName || '',
      contact_phone: phoneValidation.formatted,
      address: shippingAddress.address_line_1 || shippingAddress.address || 'Address',
      to_commune_name: commune.name,
      to_wilaya_name: wilaya.name,
      product_list: productList,
      price: codAmount, // Remaining balance to collect (after prepayment)
      do_insurance: false, // Can be configured per order
      declared_value: Math.min(Math.round(order.subtotal), GUEPEX_MAX_COD), // Capped at 150k DA (Guepex limit)
      length: Math.round(maxLength) || 30,
      width: Math.round(maxWidth) || 25,
      height: Math.round(maxHeight) || 10,
      weight: Math.round(totalWeight) || 1,
      freeshipping: false, // Customer pays delivery fee
      is_stopdesk: isStopDesk,
      has_exchange: false
    };

    // Log parcel details for debugging
    console.log(`[Guepex Shipment] Parcel data:`, {
      order_id: parcel.order_id,
      price: parcel.price,
      declared_value: parcel.declared_value,
      subtotal: order.subtotal,
      total_amount: order.total_amount
    });

    // Add stopdesk_id if required
    if (isStopDesk) {
      parcel.stopdesk_id = stopdeskId;
    }

    // Add product_to_collect if exchange enabled
    if (parcel.has_exchange) {
      parcel.product_to_collect = 'Return items'; // Should come from order data
    }

    return parcel;
  }

  /**
   * Create shipment for single order
   */
  async createShipment(orderId, options = {}) {
    console.log(`[Guepex Shipment] Creating shipment for order ${orderId}...`);

    const order = await db.queryOne(
      `SELECT o.*, 
              u.email as customer_email, u.first_name as customer_first_name, u.last_name as customer_last_name,
              u.phone as user_phone,
              c.name as commune_name, c.wilaya_id
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN communes c ON o.delivery_commune_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Validate order status
    if (order.phone_confirmation_status !== 'confirmed') {
      throw new Error('Order must be phone-confirmed before shipping');
    }

    if (order.tracking_number) {
      throw new Error('Order already has tracking number - shipment already created');
    }

    // Format parcel (pass prepaidAmount from options)
    const parcel = await this.formatParcelFromOrder(order, {
      warehouseWilayaId: order.warehouse_source === 'harrouch' ? 21 : 16,
      warehouseWilayaName: order.warehouse_source === 'harrouch' ? 'Skikda' : 'Alger',
      prepaidAmount: options.prepaidAmount || 0
    });

    // Create parcel via Guepex API (must be array)
    const response = await guepexClient.createParcels([parcel]);

    // Parse response
    const result = response.data[order.order_number];

    if (!result) {
      throw new Error('No response from Guepex API');
    }

    if (!result.success) {
      throw new Error(result.message || 'Failed to create parcel');
    }

    // Update order with tracking info
    const prepaidAmount = options.prepaidAmount || 0;
    const codAmount = Math.max(0, Math.round(order.total_amount) - prepaidAmount);

    await db.query(`
      UPDATE orders
      SET tracking_number = $1,
          guepex_import_id = $2,
          guepex_label_url = $3,
          guepex_created_at = NOW(),
          carrier = 'Guepex',
          shipment_status = 'En préparation',
          current_status = 'processing',
          prepaid_amount = $4,
          cod_amount = $5,
          updated_at = NOW()
      WHERE id = $6
    `, [result.tracking, result.import_id, result.label, prepaidAmount, codAmount, orderId]);

    // Record in order history with detailed information
    const deliveryTypeText = order.delivery_type === 'stopdesk' ? 'Stop Desk' : 'Home Delivery';
    const paymentDetails = prepaidAmount > 0
      ? `\nPrepaid: ${prepaidAmount} DA (COD: ${codAmount} DA)`
      : '';

    // Ensure sequence is synced
    await db.query(`
      SELECT setval('order_history_id_seq', 
        GREATEST((SELECT MAX(id) FROM order_history), 1))
    `);

    await db.query(`
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES ($1, 'processing', $2, $3, NOW())
    `, [
      orderId,
      `Guepex shipment created successfully.\nTracking Number: ${result.tracking}\nDelivery Type: ${deliveryTypeText}${paymentDetails}\nLabel URL: ${result.label}`,
      options.userId || null
    ]);

    console.log(`[Guepex Shipment] ✓ Created shipment ${result.tracking} for order ${order.order_number}`);

    // Fetch updated order
    const updatedOrder = await db.queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);

    return {
      success: true,
      tracking: result.tracking,
      importId: result.import_id,
      labelUrl: result.label,
      order: updatedOrder
    };
  }

  /**
   * Create shipments for multiple orders (batch)
   * More efficient - uses 1 API call for up to 50 orders
   */
  async createBatchShipments(orderIds, options = {}) {
    console.log(`[Guepex Shipment] Creating batch shipment for ${orderIds.length} orders...`);

    if (orderIds.length > 50) {
      throw new Error('Maximum 50 orders per batch (Guepex API limit)');
    }

    const parcels = [];
    const orderMap = {};

    // Fetch all orders
    const orders = await db.query(
      `SELECT o.*, 
              u.email as customer_email, u.first_name as customer_first_name, u.last_name as customer_last_name,
              u.phone as user_phone,
              c.name as commune_name, c.wilaya_id
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN communes c ON o.delivery_commune_id = c.id
       WHERE o.id = ANY($1)`,
      [orderIds]
    );

    // Format all parcels
    for (const order of orders.rows) {
      if (order.phone_confirmation_status !== 'confirmed') {
        console.warn(`[Guepex Shipment] Order ${order.order_number} not confirmed - skipping`);
        continue;
      }

      if (order.tracking_number) {
        console.warn(`[Guepex Shipment] Order ${order.order_number} already shipped - skipping`);
        continue;
      }

      try {
        const parcel = await this.formatParcelFromOrder(order, {
          warehouseWilayaId: order.warehouse_source === 'harrouch' ? 21 : 16,
          warehouseWilayaName: order.warehouse_source === 'harrouch' ? 'Skikda' : 'Alger'
        });

        parcels.push(parcel);
        orderMap[order.order_number] = order;
      } catch (error) {
        console.error(`[Guepex Shipment] Error formatting order ${order.order_number}:`, error.message);
        continue;
      }
    }

    if (parcels.length === 0) {
      throw new Error('No valid orders to ship');
    }

    // Create all parcels in one API call
    const response = await guepexClient.createParcels(parcels);

    // Process results
    const results = {
      success: [],
      failed: []
    };

    // Ensure sequence is synced before batch insert
    await db.query(`
      SELECT setval('order_history_id_seq', 
        GREATEST((SELECT MAX(id) FROM order_history), 1))
    `);

    for (const [orderNumber, result] of Object.entries(response.data)) {
      const order = orderMap[orderNumber];

      if (!order) continue;

      if (result.success) {
        // Update order in PostgreSQL
        await db.query(`
          UPDATE orders
          SET tracking_number = $1,
              tracking_number = $1,
              guepex_import_id = $2,
              guepex_label_url = $3,
              guepex_created_at = NOW(),
              carrier = 'Guepex',
              shipment_status = 'En préparation',
              current_status = 'processing',
              updated_at = NOW()
          WHERE id = $4
        `, [result.tracking, result.import_id, result.label, order.id]);

        // Record in history
        await db.query(`
          INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
          VALUES ($1, 'processing', $2, $3, NOW())
        `, [order.id, `Guepex shipment created (batch). Tracking: ${result.tracking}`, options.userId || null]);

        results.success.push({
          orderId: order.id,
          orderNumber: orderNumber,
          tracking: result.tracking
        });
      } else {
        results.failed.push({
          orderId: order.id,
          orderNumber: orderNumber,
          error: result.message
        });
      }
    }

    console.log(`[Guepex Shipment] ✓ Batch complete: ${results.success.length} success, ${results.failed.length} failed`);

    return results;
  }

  /**
   * Get tracking history for order
   */
  async getTrackingHistory(tracking) {
    console.log(`[Guepex Shipment] Fetching tracking history for ${tracking}...`);

    const response = await guepexClient.getHistory(tracking);
    return response.data.data || [];
  }

  /**
   * Expanded status mapping for Guepex statuses
   * Includes all delivery and return flow statuses
   */
  getStatusMapping() {
    return {
      // === PRE-SHIPMENT ===
      'Pas encore expédié': { orderStatus: 'processing', isReturn: false, label: 'Not Yet Shipped' },
      'A vérifier': { orderStatus: 'processing', isReturn: false, label: 'To Verify' },
      'En préparation': { orderStatus: 'processing', isReturn: false, label: 'Preparing' },
      'Pas encore ramassé': { orderStatus: 'processing', isReturn: false, label: 'Not Yet Picked Up' },
      'Prêt à expédier': { orderStatus: 'processing', isReturn: false, label: 'Ready to Ship' },
      'En passation': { orderStatus: 'processing', isReturn: false, label: 'Handover in Progress' },
      'Ramassé': { orderStatus: 'shipped', isReturn: false, label: 'Picked Up by Courier' },

      // === IN TRANSIT ===
      'Bloqué': { orderStatus: 'shipped', isReturn: false, label: 'Blocked' },
      'Débloqué': { orderStatus: 'shipped', isReturn: false, label: 'Unblocked' },
      'Transfert': { orderStatus: 'shipped', isReturn: false, label: 'Transfer' },
      'Expédié': { orderStatus: 'shipped', isReturn: false, label: 'Shipped' },
      'Centre': { orderStatus: 'shipped', isReturn: false, label: 'At Center' },
      'En localisation': { orderStatus: 'shipped', isReturn: false, label: 'Being Located' },
      'Vers Wilaya': { orderStatus: 'shipped', isReturn: false, label: 'Heading to Wilaya' },
      'En transit': { orderStatus: 'shipped', isReturn: false, label: 'In Transit' },
      'Reçu à Wilaya': { orderStatus: 'shipped', isReturn: false, label: 'Received at Wilaya' },

      // === OUT FOR DELIVERY ===
      'En attente du client': { orderStatus: 'shipped', isReturn: false, label: 'Awaiting Customer' },
      'Prêt pour livreur': { orderStatus: 'shipped', isReturn: false, label: 'Ready for Courier' },
      'Sorti en livraison': { orderStatus: 'shipped', isReturn: false, label: 'Out for Delivery' },

      // === DELIVERY OUTCOME ===
      'En attente': { orderStatus: 'shipped', isReturn: false, label: 'On Hold' },
      'En alerte': { orderStatus: 'shipped', isReturn: false, isFailure: true, label: 'Alert' },
      'Alerte résolue': { orderStatus: 'shipped', isReturn: false, label: 'Alert Resolved' },
      'Tentative échouée': { orderStatus: 'shipped', isReturn: false, isFailure: true, label: 'Delivery Attempt Failed' },
      'Livré': { orderStatus: 'delivered', isReturn: false, label: 'Delivered' },
      'Echèc livraison': { orderStatus: 'shipped', isReturn: false, isFailure: true, label: 'Delivery Failed' },

      // === RETURN FLOW (Automatic - Failed Delivery) ===
      'Retour vers centre': { orderStatus: 'returning', isReturn: true, label: 'Returning to Center' },
      'Retourné au centre': { orderStatus: 'returning', isReturn: true, label: 'At Local Center' },
      'Retour transfert': { orderStatus: 'returning', isReturn: true, label: 'Return in Transit' },
      'Retour groupé': { orderStatus: 'returning', isReturn: true, label: 'Grouped Return' },
      'Retour à retirer': { orderStatus: 'returning', isReturn: true, label: 'Ready for Pickup' },
      'Retour vers vendeur': { orderStatus: 'returning', isReturn: true, label: 'Returning to Seller' },
      'Retourné au vendeur': { orderStatus: 'returned', isReturn: true, isFinal: true, label: 'Returned to Seller' },

      // === EXCHANGE FLOW ===
      'Echange échoué': { orderStatus: 'cancelled', isReturn: true, label: 'Exchange Failed' }
    };
  }

  /**
   * Get human-readable reason for failed delivery
   */
  getFailureReasonLabel(reason) {
    const reasonMap = {
      'Téléphone injoignable': 'Phone unreachable',
      'Client ne répond pas': 'Customer not responding',
      'Faux numéro': 'Wrong phone number',
      'Client absent (reporté)': 'Customer absent - rescheduled',
      'Client absent (échoué)': 'Customer absent - failed',
      'Annulé par le client': 'Cancelled by customer',
      'Commande double': 'Duplicate order',
      'Le client n\'a pas commandé': 'Customer did not order',
      'Produit erroné': 'Wrong product',
      'Produit manquant': 'Missing product',
      'Produit cassé ou défectueux': 'Damaged/defective product',
      'Client incapable de payer': 'Customer unable to pay',
      'Wilaya erronée': 'Wrong wilaya',
      'Commune erronée': 'Wrong commune',
      'Client no-show': 'Customer no-show',
      'Adresse non livrable': 'Undeliverable address',
      'Document manquant': 'Missing document',
      'Produit interdit': 'Prohibited product',
      'Produit dangereux': 'Dangerous product',
      'Fausse déclaration': 'False declaration'
    };
    return reasonMap[reason] || reason;
  }

  /**
   * Update order status from Guepex webhook data
   * Handles complete return flow with inventory restoration
   */
  async updateOrderFromWebhook(webhookData) {
    const { tracking, last_status, status_reason, event_id, occurred_at } = webhookData;
    const timestamp = occurred_at || new Date().toISOString();

    console.log(`[Guepex Shipment] Webhook: ${tracking} → ${last_status}${status_reason ? ` (${status_reason})` : ''}`);

    // Find order by tracking number (check both columns for consistency)
    const order = await db.queryOne(
      'SELECT * FROM orders WHERE tracking_number = $1 OR guepex_tracking_number = $1',
      [tracking]
    );

    if (!order) {
      console.warn(`[Guepex Shipment] No order found for tracking ${tracking}`);
      return null;
    }

    const statusMapping = this.getStatusMapping();
    const statusInfo = statusMapping[last_status];

    // Store previous status for comparison
    const previousStatus = order.current_status;
    const previousShipmentStatus = order.shipment_status;

    // Determine new order status
    let newStatus = statusInfo ? statusInfo.orderStatus : order.current_status;
    let historyNotes = '';

    // === HANDLE RETURN FLOW ===
    if (statusInfo?.isReturn) {
      // Build descriptive history note
      const reasonLabel = status_reason ? ` - ${this.getFailureReasonLabel(status_reason)}` : '';
      historyNotes = `Package returning: ${statusInfo.label}${reasonLabel}`;

      // === FINAL RETURN: Restore inventory ===
      if (statusInfo.isFinal && last_status === 'Retourné au vendeur') {
        console.log(`[Guepex Return] Order ${order.order_number} returned - restoring inventory...`);

        // Restore inventory to original warehouse
        const restoredItems = await this.restoreInventoryPG(order.id);

        // Update order fields
        await db.query(`
          UPDATE orders
          SET returned_at = $1,
              inventory_restored = true,
              payment_status = CASE 
                WHEN payment_status = 'paid' THEN 'refund_pending'
                ELSE 'cancelled'
              END,
              current_status = 'returned',
              shipment_status = $2,
              shipment_status_reason = $3,
              updated_at = $1
          WHERE id = $4
        `, [timestamp, last_status, status_reason, order.id]);

        // Update return record with warehouse receipt
        await db.query(`
          UPDATE returns
          SET received_at = $1,
              status = CASE WHEN status = 'approved' THEN 'approved' ELSE status END,
              notes = COALESCE(notes, '') || E'\nPackage received at warehouse. Inventory restored.'
          WHERE order_id = $2 AND received_at IS NULL
        `, [timestamp, order.id]);

        newStatus = 'returned';
        historyNotes = `Package returned to warehouse. ${restoredItems.length} item(s) restored to inventory.`;
        if (status_reason) {
          historyNotes += ` Reason: ${this.getFailureReasonLabel(status_reason)}`;
        }

        console.log(`[Guepex Return] ✓ Order ${order.order_number} fully returned, inventory restored`);
      } else {
        // Update return tracking fields AND current_status to 'returning'
        await db.query(`
          UPDATE orders
          SET return_initiated_at = COALESCE(return_initiated_at, $1),
              current_status = $5,
              is_returning = true,
              shipment_status = $2,
              shipment_status_reason = $3,
              updated_at = $1
          WHERE id = $4
        `, [timestamp, last_status, status_reason, order.id, newStatus]);

        // Auto-create return record for delivery failure
        const existingReturn = await db.queryOne(
          'SELECT id FROM returns WHERE order_id = $1',
          [order.id]
        );

        if (!existingReturn) {
          // Generate return number
          const yearStr = new Date().getFullYear();
          const countResult = await db.query(
            `SELECT COUNT(*) as count FROM returns WHERE EXTRACT(YEAR FROM requested_at) = $1`,
            [yearStr]
          );
          const nextNum = parseInt(countResult.rows[0].count) + 1;
          const returnNumber = `RET-${yearStr}-${String(nextNum).padStart(6, '0')}`;

          const failureReason = status_reason 
            ? `Delivery failure: ${this.getFailureReasonLabel(status_reason)}`
            : `Delivery failure: ${statusInfo.label}`;

          // Get order items total for refund amount
          const orderItemsResult = await db.query(
            'SELECT SUM(line_total) as total FROM order_items WHERE order_id = $1',
            [order.id]
          );
          const refundAmount = parseFloat(orderItemsResult.rows[0]?.total) || 0;

          // Create return record
          const newReturn = await db.queryOne(`
            INSERT INTO returns (order_id, return_number, return_reason, status, refund_amount, notes, requested_at, user_id)
            VALUES ($1, $2, $3, 'approved', $4, $5, $6, $7)
            RETURNING id
          `, [
            order.id,
            returnNumber,
            failureReason,
            refundAmount,
            `Auto-created from Guepex delivery failure. Tracking: ${tracking}`,
            timestamp,
            order.user_id
          ]);

          // Create return items from all order items
          const orderItems = await db.query(
            'SELECT id, quantity FROM order_items WHERE order_id = $1',
            [order.id]
          );
          for (const item of orderItems.rows) {
            await db.query(`
              INSERT INTO return_items (return_id, order_item_id, quantity, condition, notes)
              VALUES ($1, $2, $3, 'opened', 'Delivery failure - auto return')
            `, [newReturn.id, item.id, item.quantity]);
          }

          console.log(`[Guepex Return] Auto-created return ${returnNumber} for order ${order.order_number}`);
        }
      }
    }

    // === HANDLE DELIVERY SUCCESS ===
    else if (last_status === 'Livré') {
      await db.query(`
        UPDATE orders
        SET delivered_at = $1,
            current_status = 'delivered',
            shipment_status = $2,
            payment_status = CASE 
              WHEN payment_method = 'cod' THEN 'paid'
              ELSE payment_status
            END,
            paid_at = CASE 
              WHEN payment_method = 'cod' THEN $1
              ELSE paid_at
            END,
            updated_at = $1
        WHERE id = $3
      `, [timestamp, last_status, order.id]);

      newStatus = 'delivered';
      historyNotes = 'Package delivered successfully';
    }

    // === HANDLE DELIVERY FAILURE (Not yet returning) ===
    else if (statusInfo?.isFailure) {
      const reasonLabel = status_reason ? this.getFailureReasonLabel(status_reason) : 'Unknown reason';
      historyNotes = `Delivery attempt failed: ${reasonLabel}`;

      // Only increment delivery_attempts if status actually changed (idempotent)
      const shouldIncrementAttempts = last_status !== previousShipmentStatus;

      await db.query(`
        UPDATE orders
        SET delivery_attempts = CASE 
              WHEN $6 THEN COALESCE(delivery_attempts, 0) + 1 
              ELSE delivery_attempts 
            END,
            last_failure_reason = $1,
            shipment_status = $2,
            shipment_status_reason = $3,
            updated_at = $4
        WHERE id = $5
      `, [status_reason, last_status, status_reason, timestamp, order.id, shouldIncrementAttempts]);
    }

    // === STANDARD STATUS UPDATE ===
    else {
      historyNotes = `Shipment status: ${statusInfo?.label || last_status}`;

      await db.query(`
        UPDATE orders
        SET shipment_status = $1,
            shipment_status_reason = $2,
            current_status = $3,
            updated_at = $4
        WHERE id = $5
      `, [last_status, status_reason, newStatus || order.current_status, timestamp, order.id]);
    }

    // Record in order history (always record status changes)
    if (last_status !== previousShipmentStatus) {
      // Ensure sequence is ahead of current max to avoid duplicate key errors in legacy data
      await db.query(`
        SELECT setval(
          pg_get_serial_sequence('order_history', 'id'),
          GREATEST(COALESCE(MAX(id), 0) + 1, nextval(pg_get_serial_sequence('order_history', 'id'))),
          false
        )
        FROM order_history;
      `);

      await db.query(`
        INSERT INTO order_history (order_id, status, notes, changed_at)
        VALUES ($1, $2, $3, $4)
      `, [order.id, newStatus || order.current_status, historyNotes, timestamp]);

      // Send customer notification for key status changes
      if (order.user_id) {
        const notificationTypes = {
          'Expédié': {
            type: 'ORDER_SHIPPED',
            title: 'Order Shipped / تم الشحن',
            message: `Your order #${order.order_number} has been shipped! Tracking: ${tracking}`
          },
          'Sorti en livraison': {
            type: 'ORDER_OUT_FOR_DELIVERY',
            title: 'Out for Delivery / طلبك في الطريق',
            message: `Good news! Your order #${order.order_number} is out for delivery today.`
          },
          'Livré': {
            type: 'ORDER_DELIVERED',
            title: 'Order Delivered / تم التوصيل',
            message: `Your order #${order.order_number} has been delivered. Thank you for shopping with us!`
          },
          'Retourné au vendeur': {
            type: 'ORDER_RETURNED',
            title: 'Order Returned / تم إرجاع الطلب',
            message: `Your order #${order.order_number} has been returned to our warehouse.`
          }
        };

        const notifData = notificationTypes[last_status];
        if (notifData) {
          await NotificationService.create({
            userId: order.user_id,
            ...notifData,
            actionUrl: `/profile/orders/${order.id}`,
            relatedEntityType: 'order',
            relatedEntityId: order.id
          }).catch(err => console.error(`[Guepex Webhook] Notification failed for ${last_status}:`, err.message));
        }
      }
    }

    console.log(`[Guepex Webhook] ✅ Order ${order.order_number} updated: ${previousStatus} → ${newStatus || order.current_status}`);

    return order;
  }

  /**
   * Restore inventory for returned order (PostgreSQL version)
   * Uses 'stock' table to match the rest of the application
   */
  async restoreInventoryPG(orderId) {
    // Get order to determine warehouse if not on items
    const order = await db.queryOne('SELECT warehouse_id FROM orders WHERE id = $1', [orderId]);

    const items = await db.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [orderId]
    );

    const restoredItems = [];
    for (const item of items.rows) {
      // Use item's warehouse_id or fall back to order's warehouse_id
      const warehouseId = item.warehouse_id || order?.warehouse_id;

      if (!warehouseId) {
        console.warn(`[Guepex Return] No warehouse_id for order_item ${item.id} - skipping stock restore`);
        continue;
      }

      // Resolve variant_id from order item (or fallback to default variant)
      let variantId = item.variant_id;
      if (!variantId) {
        const defaultVariant = await db.queryOne(
          'SELECT id FROM product_variants WHERE product_id = $1 AND is_default = true AND deleted_at IS NULL',
          [item.product_id]
        );
        variantId = defaultVariant?.id;
      }

      if (!variantId) {
        console.warn(`[Guepex Return] No variant_id for order_item ${item.id} - skipping stock restore`);
        continue;
      }

      // Update stock table using variant_id (consistent with rest of app)
      const result = await db.query(`
        UPDATE stock
        SET quantity = quantity + $1, updated_at = NOW()
        WHERE variant_id = $2 AND warehouse_id = $3
        RETURNING id, quantity
      `, [item.quantity, variantId, warehouseId]);

      if (result.rows.length > 0) {
        restoredItems.push({
          productId: item.product_id,
          variantId: variantId,
          warehouseId: warehouseId,
          quantity: item.quantity,
          newStockLevel: result.rows[0].quantity
        });
        console.log(`[Guepex Return] Restored ${item.quantity} units of variant ${variantId} (product ${item.product_id}) to warehouse ${warehouseId}`);
      } else {
        // If no stock record exists, create one
        await db.query(`
          INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [item.product_id, variantId, warehouseId, item.quantity]);

        restoredItems.push({
          productId: item.product_id,
          variantId: variantId,
          warehouseId: warehouseId,
          quantity: item.quantity,
          newStockLevel: item.quantity
        });
        console.log(`[Guepex Return] Created stock entry for variant ${variantId} (product ${item.product_id}) in warehouse ${warehouseId}`);
      }
    }

    return restoredItems;
  }
}

// Export singleton
const guepexShipmentService = new GuepexShipmentService();
export default guepexShipmentService;
