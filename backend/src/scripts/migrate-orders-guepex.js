/**
 * Migration script to add Guepex-related fields to existing orders
 * 
 * New fields:
 * - phone_confirmation_status: 'pending' | 'confirmed' | 'failed'
 * - phone_confirmed_at: ISO timestamp
 * - phone_confirmed_by: user_id of admin who confirmed
 * - confirmation_notes: Text notes from phone call
 * - tracking_number: Guepex tracking (yal-XXXXX)
 * - guepex_import_id: Batch import ID
 * - guepex_label_url: PDF label URL
 * - carrier: 'Guepex'
 * - shipment_status: Guepex status in French
 * - estimated_delivery: ISO timestamp
 * - warehouse_source: 'algiers' | 'harrouch'
 * - delivery_commune_id: Commune ID for shipping
 * - delivery_center_id: Stop desk center ID (if applicable)
 * - delivery_type: 'home' | 'stop_desk'
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateOrders() {
  const ordersPath = path.join(__dirname, '../../../database/orders/orders.json');
  
  try {
    console.log('[Order Migration] Reading orders...');
    const data = await fs.readFile(ordersPath, 'utf8');
    const orders = JSON.parse(data);

    console.log(`[Order Migration] Found ${orders.length} orders`);

    let updatedCount = 0;

    for (const order of orders) {
      let needsUpdate = false;

      // Add phone confirmation fields
      if (!('phone_confirmation_status' in order)) {
        // Set based on current status
        if (order.current_status === 'delivered' || order.current_status === 'shipped') {
          order.phone_confirmation_status = 'confirmed';
          order.phone_confirmed_at = order.ordered_at;
        } else if (order.current_status === 'cancelled') {
          order.phone_confirmation_status = 'failed';
        } else {
          order.phone_confirmation_status = 'pending';
        }
        needsUpdate = true;
      }

      if (!('phone_confirmed_by' in order)) {
        order.phone_confirmed_by = null;
        needsUpdate = true;
      }

      if (!('confirmation_notes' in order)) {
        order.confirmation_notes = null;
        needsUpdate = true;
      }

      // Add Guepex tracking fields
      if (!('tracking_number' in order)) {
        order.tracking_number = null;
        needsUpdate = true;
      }

      if (!('guepex_import_id' in order)) {
        order.guepex_import_id = null;
        needsUpdate = true;
      }

      if (!('guepex_label_url' in order)) {
        order.guepex_label_url = null;
        needsUpdate = true;
      }

      if (!('carrier' in order)) {
        order.carrier = null;
        needsUpdate = true;
      }

      if (!('shipment_status' in order)) {
        order.shipment_status = null;
        needsUpdate = true;
      }

      if (!('estimated_delivery' in order)) {
        order.estimated_delivery = null;
        needsUpdate = true;
      }

      // Add warehouse and delivery fields
      if (!('warehouse_source' in order)) {
        order.warehouse_source = 'algiers'; // Default
        needsUpdate = true;
      }

      if (!('delivery_commune_id' in order)) {
        order.delivery_commune_id = null; // Will need to be set
        needsUpdate = true;
      }

      if (!('delivery_center_id' in order)) {
        order.delivery_center_id = null;
        needsUpdate = true;
      }

      if (!('delivery_type' in order)) {
        order.delivery_type = 'home'; // Default
        needsUpdate = true;
      }

      // Ensure payment_method exists
      if (!('payment_method' in order)) {
        order.payment_method = 'cod'; // Default for Algeria
        needsUpdate = true;
      }

      if (needsUpdate) {
        updatedCount++;
      }
    }

    // Backup original file
    const backupPath = ordersPath + '.backup-' + Date.now();
    await fs.copyFile(ordersPath, backupPath);
    console.log(`[Order Migration] Backup created: ${backupPath}`);

    // Save updated orders
    await fs.writeFile(ordersPath, JSON.stringify(orders, null, 2));
    console.log(`[Order Migration] ✓ Updated ${updatedCount} orders with Guepex fields`);

  } catch (error) {
    console.error('[Order Migration] Error:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateOrders()
    .then(() => {
      console.log('[Order Migration] Complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Order Migration] Failed:', error);
      process.exit(1);
    });
}

export default migrateOrders;
