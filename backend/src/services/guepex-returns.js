/**
 * Guepex Returns Service
 * 
 * Handles customer-initiated return pickup scheduling and tracking
 * Uses Guepex API to create reverse parcels (customer → warehouse)
 * 
 * Return Flow:
 * 1. Customer requests return → status: 'requested'
 * 2. Admin approves return → status: 'approved'
 * 3. Admin schedules pickup → Creates Guepex parcel, pickup_status: 'scheduled'
 * 4. Guepex picks up from customer → pickup_status: 'picked_up'
 * 5. Package arrives at warehouse → pickup_status: 'received', status: 'completed'
 * 
 * Note: Store pays return shipping (freeshipping: true)
 */

import guepexClient from './guepex-api.js';
import NotificationService from './NotificationService.js';
import db from '../db/postgres.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GuepexReturnsService {
  /**
   * Warehouse configuration
   * Returns go back to the original warehouse the order shipped from
   */
  getWarehouseConfig(warehouseId) {
    const warehouses = {
      1: {
        name: 'Algiers Warehouse',
        wilaya_id: 16,
        wilaya_name: 'Alger',
        address: 'Zone Industrielle, Alger',
        phone: '0555000001'
      },
      2: {
        name: 'Harrouch Warehouse',
        wilaya_id: 21,
        wilaya_name: 'Skikda',
        address: 'Centre Harrouch, Skikda',
        phone: '0555000002'
      }
    };
    return warehouses[warehouseId] || warehouses[1];
  }

  /**
   * Load commune data
   */
  async loadCommune(communeId) {
    try {
      const result = await db.queryOne(
        'SELECT * FROM communes WHERE id = $1',
        [communeId]
      );
      return result;
    } catch (error) {
      console.error('[Guepex Returns] Failed to load commune:', error.message);
      return null;
    }
  }

  /**
   * Load wilaya data
   */
  async loadWilaya(wilayaId) {
    try {
      const result = await db.queryOne(
        'SELECT * FROM wilayas WHERE id = $1',
        [wilayaId]
      );
      return result;
    } catch (error) {
      console.error('[Guepex Returns] Failed to load wilaya:', error.message);
      return null;
    }
  }

  /**
   * Validate phone number
   */
  validatePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
      return { valid: false, error: 'Phone number is required' };
    }
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (!cleaned.startsWith('0')) {
      return { valid: false, error: 'Phone must start with 0' };
    }
    if (cleaned.length !== 10 && cleaned.length !== 9) {
      return { valid: false, error: 'Phone must be 10 digits (mobile) or 9 digits (landline)' };
    }
    if (!/^\d+$/.test(cleaned)) {
      return { valid: false, error: 'Phone must contain only digits' };
    }
    return { valid: true, formatted: cleaned };
  }

  /**
   * Create a return pickup parcel with Guepex
   * Creates a REVERSE parcel where:
   * - Sender = Customer (pickup from their address)
   * - Receiver = Warehouse (delivery destination)
   * 
   * @param {number} returnId - The return request ID
   * @param {Object} options - Additional options
   * @returns {Object} Created parcel info with tracking number
   */
  async scheduleReturnPickup(returnId, options = {}) {
    // Find the return request
    const returnRequest = await db.queryOne(
      'SELECT * FROM returns WHERE id = $1',
      [returnId]
    );

    if (!returnRequest) {
      throw new Error(`Return ${returnId} not found`);
    }

    // Check return is approved
    if (returnRequest.status !== 'approved') {
      throw new Error(`Return must be approved before scheduling pickup. Current status: ${returnRequest.status}`);
    }

    // Check if pickup already scheduled
    if (returnRequest.guepex_tracking_number) {
      throw new Error(`Return pickup already scheduled. Tracking: ${returnRequest.guepex_tracking_number}`);
    }

    // Get the original order
    const order = await db.queryOne(
      'SELECT * FROM orders WHERE id = $1',
      [returnRequest.order_id]
    );

    if (!order) {
      throw new Error(`Original order ${returnRequest.order_id} not found`);
    }

    // Get customer info
    const user = await db.queryOne(
      'SELECT * FROM users WHERE id = $1',
      [order.user_id]
    );

    if (!user) {
      throw new Error(`User not found for order ${order.order_number}`);
    }

    // Parse customer shipping address (pickup location)
    let customerAddress;
    try {
      customerAddress = typeof order.shipping_snapshot === 'string'
        ? JSON.parse(order.shipping_snapshot)
        : order.shipping_snapshot;
    } catch (error) {
      throw new Error(`Invalid shipping address for order ${order.order_number}`);
    }

    // Validate customer phone
    const customerPhone = order.customer_phone || user.phone;
    const phoneValidation = this.validatePhoneNumber(customerPhone);
    if (!phoneValidation.valid) {
      throw new Error(`Invalid customer phone: ${phoneValidation.error}`);
    }

    // Get customer location (wilaya/commune)
    const customerCommuneId = order.delivery_commune_id;
    const customerCommune = await this.loadCommune(customerCommuneId);
    if (!customerCommune) {
      throw new Error(`Customer commune ${customerCommuneId} not found`);
    }
    const customerWilaya = await this.loadWilaya(customerCommune.wilaya_id);

    // Determine return warehouse (same as original shipping warehouse)
    const returnWarehouseId = order.warehouse_id || 1;
    const warehouse = this.getWarehouseConfig(returnWarehouseId);

    // Get return items description
    const returnItems = await db.query(
      'SELECT * FROM return_items WHERE return_id = $1',
      [returnId]
    );

    const orderItems = await db.query(
      `SELECT oi.*, p.product_name 
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    const productDescriptions = [];

    for (const returnItem of returnItems.rows) {
      const orderItem = orderItems.rows.find(oi => oi.id === returnItem.order_item_id);
      if (orderItem && orderItem.product_name) {
        productDescriptions.push(`${returnItem.quantity}x ${orderItem.product_name}`);
      }
    }

    const productList = productDescriptions.join(', ') || 'Return items';

    // Build REVERSE parcel (Customer → Warehouse)
    // Note: Sender is customer, receiver is warehouse
    const parcel = {
      order_id: returnRequest.return_number,  // Use return number as order_id

      // SENDER = Customer (pickup from)
      from_wilaya_name: customerWilaya?.name || customerAddress.state,

      // RECEIVER = Warehouse (delivery to) 
      firstname: 'Algerian Hardware',
      familyname: 'Store',
      contact_phone: warehouse.phone,
      address: warehouse.address,
      to_commune_name: warehouse.wilaya_name,  // Warehouse commune
      to_wilaya_name: warehouse.wilaya_name,   // Warehouse wilaya

      // Package details
      product_list: `RETURN: ${productList}`,
      price: 0,  // No COD for returns
      do_insurance: false,
      declared_value: returnRequest.refund_amount,

      // Dimensions (estimate for returns)
      length: 40,
      width: 30,
      height: 20,
      weight: 2,

      // Shipping config - STORE PAYS
      freeshipping: true,

      // Not stop desk for returns (pickup from customer address)
      is_stopdesk: false,
      stopdesk_id: null,

      // No exchange for returns
      has_exchange: false,
      product_to_collect: null
    };

    console.log(`[Guepex Returns] Creating return parcel for ${returnRequest.return_number}...`);
    console.log(`[Guepex Returns] Pickup from: ${customerWilaya?.name || customerAddress.state}`);
    console.log(`[Guepex Returns] Deliver to: ${warehouse.name}`);

    // Create parcel via Guepex API
    const response = await guepexClient.createParcels([parcel]);

    // Check response
    const parcelResult = response.data?.[returnRequest.return_number];
    if (!parcelResult?.success) {
      const errorMsg = parcelResult?.message || 'Failed to create return parcel';
      throw new Error(errorMsg);
    }

    // Update return record
    await db.query(`
      UPDATE returns
      SET guepex_tracking_number = $1,
          guepex_label_url = $2,
          return_warehouse_id = $3,
          pickup_status = 'scheduled',
          pickup_scheduled_at = NOW(),
          shipment_status = 'En préparation',
          updated_at = NOW()
      WHERE id = $4
    `, [parcelResult.tracking, parcelResult.label, returnWarehouseId, returnId]);

    console.log(`[Guepex Returns] ✓ Return pickup scheduled: ${parcelResult.tracking}`);

    return {
      success: true,
      return_id: returnId,
      return_number: returnRequest.return_number,
      tracking_number: parcelResult.tracking,
      label_url: parcelResult.label,
      warehouse: warehouse.name,
      pickup_from: customerWilaya?.name || customerAddress.state
    };
  }

  /**
   * Get tracking history for a return
   */
  async getReturnTracking(returnId) {
    const returnRequest = await db.queryOne(
      'SELECT * FROM returns WHERE id = $1',
      [returnId]
    );

    if (!returnRequest) {
      throw new Error(`Return ${returnId} not found`);
    }

    if (!returnRequest.guepex_tracking_number) {
      return {
        tracking_number: null,
        pickup_status: returnRequest.pickup_status,
        history: []
      };
    }

    try {
      const response = await guepexClient.getHistory(returnRequest.guepex_tracking_number);
      return {
        tracking_number: returnRequest.guepex_tracking_number,
        pickup_status: returnRequest.pickup_status,
        shipment_status: returnRequest.shipment_status,
        history: response.data?.data || []
      };
    } catch (error) {
      console.error('[Guepex Returns] Failed to get tracking:', error.message);
      return {
        tracking_number: returnRequest.guepex_tracking_number,
        pickup_status: returnRequest.pickup_status,
        shipment_status: returnRequest.shipment_status,
        history: [],
        error: error.message
      };
    }
  }

  /**
   * Update return from webhook status update
   */
  async updateReturnFromWebhook(webhookData) {
    const { tracking, last_status, status_reason, occurred_at } = webhookData;
    const timestamp = occurred_at || new Date().toISOString();

    // Find return by tracking number
    const returnRequest = await db.queryOne(
      'SELECT * FROM returns WHERE guepex_tracking_number = $1',
      [tracking]
    );

    if (!returnRequest) {
      // Not a return parcel, might be regular order
      return null;
    }

    console.log(`[Guepex Returns] Webhook: ${tracking} → ${last_status}`);

    // Update pickup status based on Guepex status
    const pickupStatusMap = {
      'En préparation': 'scheduled',
      'Expédié': 'picked_up',
      'Sorti en livraison': 'picked_up',
      'En transit': 'in_transit',
      'Retour vers centre': 'in_transit',
      'Retourné au centre': 'in_transit',
      'Retour transfert': 'in_transit',
      'Retour groupé': 'in_transit',
      'Retour à retirer': 'arriving',
      'Retour vers vendeur': 'arriving',
      'Livré': 'received',
      'Retourné au vendeur': 'received'
    };

    const newPickupStatus = pickupStatusMap[last_status];

    // Handle specific status transitions
    if (last_status === 'Expédié' || last_status === 'Sorti en livraison') {
      await db.query(`
        UPDATE returns
        SET shipment_status = $1,
            shipment_status_reason = $2,
            pickup_status = $3,
            picked_up_at = COALESCE(picked_up_at, $4),
            updated_at = $4
        WHERE id = $5
      `, [last_status, status_reason, newPickupStatus || returnRequest.pickup_status, timestamp, returnRequest.id]);
    } else if (last_status === 'Livré' || last_status === 'Retourné au vendeur') {
      // Auto-complete the return when package received
      await db.query(`
        UPDATE returns
        SET shipment_status = $1,
            shipment_status_reason = $2,
            pickup_status = 'received',
            received_at = $3,
            status = CASE 
              WHEN status = 'approved' THEN 'completed'
              ELSE status
            END,
            processed_at = CASE
              WHEN status = 'approved' THEN $3
              ELSE processed_at
            END,
            updated_at = $3
        WHERE id = $4
      `, [last_status, status_reason, timestamp, returnRequest.id]);

      console.log(`[Guepex Returns] ✓ Return ${returnRequest.return_number} completed`);
    } else {
      // Standard update
      await db.query(`
        UPDATE returns
        SET shipment_status = $1,
            shipment_status_reason = $2,
            pickup_status = $3,
            updated_at = $4
        WHERE id = $5
      `, [last_status, status_reason, newPickupStatus || returnRequest.pickup_status, timestamp, returnRequest.id]);
    }

    // Fetch updated record
    const updated = await db.queryOne(
      'SELECT * FROM returns WHERE id = $1',
      [returnRequest.id]
    );

    // Send customer notification for key status changes
    // We need the user_id from the original order
    if (updated) {
      const order = await db.queryOne('SELECT user_id FROM orders WHERE id = $1', [updated.order_id]);

      if (order && order.user_id) {
        const notificationTypes = {
          'Expédié': {
            type: 'RETURN_PICKED_UP',
            title: 'Return Picked Up / تم استلام المرتجع',
            message: `Your return #${updated.return_number} has been picked up by Guepex.`
          },
          'Sorti en livraison': {
            type: 'RETURN_PICKED_UP',
            title: 'Return Picked Up / تم استلام المرتجع',
            message: `Your return #${updated.return_number} has been picked up by Guepex.`
          },
          'Livré': {
            type: 'RETURN_RECEIVED',
            title: 'Return Received / وصل المرتجع',
            message: `Your return #${updated.return_number} has been received at our warehouse and is being processed.`
          },
          'Retourné au vendeur': {
            type: 'RETURN_RECEIVED',
            title: 'Return Received / وصل المرتجع',
            message: `Your return #${updated.return_number} has been received at our warehouse and is being processed.`
          }
        };

        const notifData = notificationTypes[last_status];
        if (notifData) {
          await NotificationService.create({
            userId: order.user_id,
            ...notifData,
            actionUrl: `/profile/returns/${updated.id}`,
            relatedEntityType: 'return',
            relatedEntityId: updated.id
          }).catch(err => console.error(`[Guepex Returns Webhook] Notification failed for ${last_status}:`, err.message));
        }
      }
    }

    return updated;
  }

  /**
   * Get return parcel status mapping
   */
  getStatusMapping() {
    return {
      'scheduled': { label: 'Pickup Scheduled', color: 'blue' },
      'picked_up': { label: 'Picked Up', color: 'blue' },
      'in_transit': { label: 'In Transit', color: 'orange' },
      'arriving': { label: 'Arriving at Warehouse', color: 'orange' },
      'received': { label: 'Received at Warehouse', color: 'green' }
    };
  }
}

// Export singleton
const guepexReturnsService = new GuepexReturnsService();
export default guepexReturnsService;
