/**
 * Guepex Order Status Polling Service
 * Alternative to webhooks when backend is not publicly accessible
 * Periodically checks Guepex API for order status updates
 */

import guepexAPI from './guepex-api.js';
import guepexShipmentService from './guepex-shipment.js';
import db from '../db/postgres.js';

class GuepexPollingService {
  constructor() {
    this.pollingInterval = null;
    this.isPolling = false;
    this.pollFrequency = 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Start polling for order updates
   */
  start(intervalMinutes = 5) {
    if (this.isPolling) {
      console.log('[Guepex Polling] Already running');
      return;
    }

    this.pollFrequency = intervalMinutes * 60 * 1000;
    this.isPolling = true;

    console.log(`[Guepex Polling] Started - checking every ${intervalMinutes} minutes`);

    // Run immediately
    this.pollOrderUpdates();

    // Then run at intervals
    this.pollingInterval = setInterval(() => {
      this.pollOrderUpdates();
    }, this.pollFrequency);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.isPolling = false;
      console.log('[Guepex Polling] Stopped');
    }
  }

  /**
   * Poll Guepex API for order status updates
   */
  async pollOrderUpdates() {
    if (!this.isPolling) return;

    const startTime = Date.now();
    console.log('[Guepex Polling] Checking for updates...');

    try {
      // Get orders with active Guepex shipments from PostgreSQL
      const result = await db.query(`
        SELECT * FROM orders 
        WHERE tracking_number IS NOT NULL 
        AND current_status NOT IN ('delivered', 'cancelled')
      `);
      const activeOrders = result.rows;

      if (activeOrders.length === 0) {
        console.log('[Guepex Polling] No active shipments to check');
        return;
      }

      console.log(`[Guepex Polling] Checking ${activeOrders.length} active shipments`);

      let updatedCount = 0;
      let errorCount = 0;

      for (const order of activeOrders) {
        try {
          // Fetch current shipment status from Guepex
          const shipment = await guepexAPI.getParcel(order.tracking_number);

          // Check if status changed
          const currentStatus = this.mapGuepexStatusToOrderStatus(shipment.last_status);
          
          if (currentStatus !== order.current_status) {
            console.log(`[Guepex Polling] Status changed for ${order.order_number}: ${order.current_status} → ${currentStatus}`);

            // Update order using the same logic as webhooks
            await guepexShipmentService.updateOrderFromWebhook({
              tracking: order.tracking_number,
              last_status: shipment.last_status,
              status_reason: shipment.reason,
              occurred_at: new Date().toISOString()
            });

            updatedCount++;
          }

          // Small delay to respect rate limits
          await this.sleep(100);

        } catch (error) {
          errorCount++;
          console.error(`[Guepex Polling] Failed to check ${order.order_number}:`, error.message);
          
          // If rate limited, stop polling this cycle
          if (error.message.includes('rate limit') || error.message.includes('429')) {
            console.warn('[Guepex Polling] Rate limited - stopping this cycle');
            break;
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Guepex Polling] Complete - ${updatedCount} updated, ${errorCount} errors, ${duration}ms`);

    } catch (error) {
      console.error('[Guepex Polling] Polling cycle error:', error);
    }
  }

  /**
   * Map Guepex status to order status
   */
  mapGuepexStatusToOrderStatus(guepexStatus) {
    const statusMap = {
      'pending': 'pending',
      'pickup_scheduled': 'processing',
      'picked_up': 'processing',
      'in_hub': 'in_transit',
      'in_transit': 'in_transit',
      'out_for_delivery': 'out_for_delivery',
      'delivered': 'delivered',
      'failed_delivery': 'failed_delivery',
      'returned': 'returned',
      'returned_to_sender': 'returned',
      'cancelled': 'cancelled'
    };

    return statusMap[guepexStatus] || 'processing';
  }

  /**
   * Poll specific order by tracking number
   */
  async pollOrder(trackingNumber) {
    try {
      console.log(`[Guepex Polling] Checking order ${trackingNumber}`);

      const shipment = await guepexAPI.getParcel(trackingNumber);

      await guepexShipmentService.updateOrderFromWebhook({
        tracking: trackingNumber,
        last_status: shipment.last_status,
        status_reason: shipment.reason,
        occurred_at: new Date().toISOString()
      });

      return shipment;

    } catch (error) {
      console.error(`[Guepex Polling] Failed to poll ${trackingNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Get polling status
   */
  getStatus() {
    return {
      isPolling: this.isPolling,
      pollFrequencyMinutes: this.pollFrequency / 60000,
      pollFrequencyMs: this.pollFrequency
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const guepexPollingService = new GuepexPollingService();

export default guepexPollingService;
