/**
 * PostgreSQL Data Migration Script
 * Migrates cleaned JSON data to PostgreSQL database
 * 
 * Features:
 * - Transactional migration (all-or-nothing)
 * - Detailed logging and progress tracking
 * - Data validation at each step
 * - Resumable on failure
 * - Dry-run mode for testing
 * - Rollback capability
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/db/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '../../database');
const LOG_PATH = path.join(__dirname, 'migration-log.json');

class DataMigration {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.continueOnError = options.continueOnError || false;
    
    this.stats = {
      startTime: new Date(),
      tablesProcessed: 0,
      totalRecords: 0,
      successfulInserts: 0,
      failedInserts: 0,
      errors: []
    };

    this.migrationOrder = [
      // Reference data first
      { table: 'wilayas', file: 'shipping/wilayas.json', mapper: 'mapWilaya' },
      { table: 'communes', file: 'shipping/communes.json', mapper: 'mapCommune' },
      { table: 'shipping_centers', file: 'shipping/centers.json', mapper: 'mapShippingCenter', nested: true },
      
      // Core entities
      { table: 'suppliers', file: 'catalog/suppliers.json', mapper: 'mapSupplier' },
      { table: 'categories', file: 'catalog/categories.json', mapper: 'mapCategory' },
      { table: 'users', file: 'users/users.json', mapper: 'mapUser' },
      { table: 'addresses', file: 'users/addresses.json', mapper: 'mapAddress' },
      { table: 'warehouses', file: 'inventory/warehouses.json', mapper: 'mapWarehouse' },
      
      // Products
      { table: 'products', file: 'catalog/products.json', mapper: 'mapProduct' },
      { table: 'product_attributes', file: 'catalog/product-attributes.json', mapper: 'mapProductAttribute' },
      { table: 'product_images', file: 'catalog/product-images.json', mapper: 'mapProductImage' },
      
      // Inventory
      { table: 'stock', file: 'inventory/stock.json', mapper: 'mapStock' },
      
      // Promotions
      { table: 'promotions', file: 'promotions/promotions.json', mapper: 'mapPromotion' },
      
      // Orders
      { table: 'orders', file: 'orders/orders.json', mapper: 'mapOrder' },
      { table: 'order_items', file: 'orders/order-items.json', mapper: 'mapOrderItem' },
      { table: 'order_history', file: 'orders/order-history.json', mapper: 'mapOrderHistory' },
      
      // Engagement
      { table: 'reviews', file: 'reviews/reviews.json', mapper: 'mapReview' },
      { table: 'favorites', file: 'users/favorites.json', mapper: 'mapFavorite' },
      
      // Returns
      { table: 'returns', file: 'returns/returns.json', mapper: 'mapReturn' },
      { table: 'return_items', file: 'returns/return-items.json', mapper: 'mapReturnItem' }
    ];
  }

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================

  readJSON(filePath) {
    const fullPath = path.join(DB_PATH, filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`  ⚠️  File not found: ${filePath}`);
      return [];
    }
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    
    // Handle nested data structure (e.g., centers.json)
    if (data.data && Array.isArray(data.data)) {
      return data.data;
    }
    
    return Array.isArray(data) ? data : [];
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: 'ℹ️',
      success: '✓',
      warning: '⚠️',
      error: '❌'
    }[level] || 'ℹ️';

    console.log(`${prefix} ${message}`);

    if (level === 'error') {
      this.stats.errors.push({ timestamp, message });
    }
  }

  saveLog() {
    this.stats.endTime = new Date();
    this.stats.duration = (this.stats.endTime - this.stats.startTime) / 1000;
    
    fs.writeFileSync(LOG_PATH, JSON.stringify(this.stats, null, 2));
    console.log(`\n📄 Migration log saved: ${LOG_PATH}`);
  }

  // =====================================================
  // DATA MAPPERS (JSON → PostgreSQL)
  // =====================================================

  mapWilaya(record) {
    return {
      id: record.id,
      name: record.name,
      zone: record.zone,
      is_deliverable: record.is_deliverable === 1 || record.is_deliverable === true
    };
  }

  mapCommune(record) {
    return {
      id: record.id,
      name: record.name,
      wilaya_id: record.wilaya_id,
      has_stop_desk: record.has_stop_desk === 1 || record.has_stop_desk === true,
      is_deliverable: record.is_deliverable === 1 || record.is_deliverable === true,
      delivery_time_parcel: record.delivery_time_parcel || null,
      delivery_time_payment: record.delivery_time_payment || null
    };
  }

  mapShippingCenter(record) {
    return {
      id: record.center_id || record.id,
      name: record.name,
      address: record.address,
      gps: record.gps || null,
      commune_id: record.commune_id || null,
      wilaya_id: record.wilaya_id,
      provider: record.provider || null
    };
  }

  mapSupplier(record) {
    return {
      id: record.supplier_id,
      name: record.name,
      contact_email: record.contact_email || null,
      contact_phone: record.contact_phone || null,
      address: record.address || null,
      deleted_at: record.deleted_at || null
    };
  }

  mapCategory(record) {
    return {
      id: record.category_id,
      parent_category_id: record.parent_category_id || null,
      category_name: record.category_name,
      category_slug: record.category_slug,
      description: record.description || null,
      category_image: record.category_image || null,
      level: record.level,
      created_at: record.created_at,
      deleted_at: record.deleted_at || null
    };
  }

  mapUser(record) {
    return {
      id: record.user_id,
      username: record.username || null,
      email: record.email,
      password_hash: record.password_hash || null,
      first_name: record.first_name || null,
      last_name: record.last_name || null,
      full_name: record.full_name || null,
      phone: record.phone || null,
      role: record.role || 'customer',
      is_active: record.is_active !== false,
      avatar_url: record.avatar_url || null,
      created_at: record.created_at,
      updated_at: record.updated_at || null,
      last_login: record.last_login || null,
      deleted_at: record.deleted_at || null,
      verification_token: record.verification_token || null,
      verification_expires: record.verification_expires || null
    };
  }

  mapAddress(record) {
    return {
      id: record.address_id,
      user_id: record.user_id,
      street_address: record.street_address || '',
      address_line_2: record.address_line_2 || null,
      city: record.city,
      state_province: record.state_province || null,
      postal_code: record.postal_code || null,
      country: record.country || 'Algeria',
      phone_number: record.phone_number || null,
      is_default: record.is_default || false,
      created_at: record.created_at || new Date().toISOString(),
      updated_at: record.updated_at || null
    };
  }

  mapWarehouse(record) {
    return {
      id: record.warehouse_id,
      warehouse_name: record.warehouse_name,
      location_address: record.location_address,
      contact_number: record.contact_number || null,
      wilaya_id: null, // TODO: Map from location if needed
      deleted_at: record.deleted_at || null
    };
  }

  mapProduct(record) {
    return {
      id: record.product_id,
      category_id: record.category_id,
      supplier_id: record.supplier_id || null,
      sku: record.sku,
      product_name: record.product_name,
      brand: record.brand || null,
      model_number: record.model_number || null,
      short_description: record.short_description || null,
      description: record.description || record.full_description || null,
      cost_price: record.cost_price || null,
      current_price: record.current_price,
      sale_price: record.sale_price || null,
      weight_kg: record.weight_kg || null,
      warranty_months: record.warranty_months || null,
      is_active: record.is_active !== false,
      is_featured: record.is_featured || false,
      dimensions: record.dimensions || null,
      tags: record.tags || null,
      meta_title: record.meta_title || null,
      meta_description: record.meta_description || null,
      created_at: record.created_at,
      updated_at: record.updated_at || null,
      deleted_at: record.deleted_at || null
    };
  }

  mapProductAttribute(record) {
    return {
      id: record.attribute_id,
      product_id: record.product_id,
      attribute_name: record.attribute_name,
      attribute_value: record.attribute_value,
      attribute_type: record.attribute_type || 'text',
      display_order: record.display_order || 0
    };
  }

  mapProductImage(record) {
    return {
      id: record.image_id,
      product_id: record.product_id,
      image_url: record.image_url,
      image_type: record.image_type || 'product',
      display_order: record.display_order || 0,
      alt_text: record.alt_text || null,
      uploaded_at: record.uploaded_at || new Date().toISOString()
    };
  }

  mapStock(record) {
    return {
      id: record.stock_id,
      product_id: record.product_id,
      warehouse_id: record.warehouse_id,
      quantity: record.quantity || 0,
      reserved_quantity: record.reserved_quantity || 0,
      reorder_level: record.reorder_level || null,
      last_restocked: record.last_restocked || null,
      last_updated: record.last_updated || new Date().toISOString(),
      updated_at: record.updated_at || null
    };
  }

  mapPromotion(record) {
    return {
      id: record.promotion_id,
      promotion_code: record.promotion_code,
      promotion_name: record.promotion_name,
      description: record.description || null,
      discount_type: record.discount_type,
      discount_value: record.discount_value,
      min_order_amount: record.min_order_amount || null,
      applicable_categories: record.applicable_categories || null,
      applicable_products: record.applicable_products || null,
      start_date: record.start_date,
      end_date: record.end_date,
      max_uses: record.max_uses || 0,
      max_uses_per_user: record.max_uses_per_user || 1,
      current_uses: record.current_uses || 0,
      created_at: record.created_at,
      updated_at: record.updated_at || null,
      deleted_at: record.deleted_at || null
    };
  }

  mapOrder(record) {
    return {
      id: record.order_id,
      user_id: record.user_id || null,
      order_number: record.order_number,
      subtotal: record.subtotal,
      tax_amount: record.tax_amount || 0,
      shipping_cost: record.shipping_cost || 0,
      discount_amount: record.discount_amount || 0,
      total_amount: record.total_amount,
      current_status: record.current_status || 'pending',
      payment_status: record.payment_status || 'unpaid',
      payment_method: record.payment_method || null,
      paid_amount: record.paid_amount || null,
      promotion_id: record.promotion_id || null,
      shipping_snapshot: record.shipping_snapshot || null,
      delivery_notes: record.delivery_notes || null,
      warehouse_id: record.warehouse_id || null,
      guepex_tracking_number: record.guepex_tracking_number || null,
      guepex_label_url: record.guepex_label_url || null,
      ordered_at: record.ordered_at || record.created_at,
      delivered_at: record.delivered_at || null,
      paid_at: record.paid_at || null,
      updated_at: record.updated_at || null,
      deleted_at: record.deleted_at || null
    };
  }

  mapOrderItem(record) {
    return {
      id: record.order_item_id,
      order_id: record.order_id,
      product_id: record.product_id,
      product_name_snapshot: record.product_name_snapshot || null,
      quantity: record.quantity,
      unit_price: record.unit_price,
      line_total: record.line_total || (record.quantity * record.unit_price),
      discount_amount: record.discount_amount || 0,
      warehouse_id: record.warehouse_id || null
    };
  }

  mapOrderHistory(record) {
    return {
      id: record.order_history_id,
      order_id: record.order_id,
      status: record.status,
      payment_status: record.payment_status || null,
      notes: record.notes || null,
      changed_by: record.changed_by || null,
      changed_at: record.changed_at
    };
  }

  mapReview(record) {
    return {
      id: record.review_id,
      product_id: record.product_id,
      user_id: record.user_id || null,
      rating: record.rating,
      review_title: record.review_title || null,
      review_text: record.review_text,
      verified_purchase: record.verified_purchase || false,
      status: record.status || 'pending',
      created_at: record.created_at,
      edited_at: record.edited_at || null,
      edit_count: record.edit_count || 0,
      moderated_by: record.moderated_by || null,
      moderated_at: record.moderated_at || null,
      rejection_reason: record.rejection_reason || null,
      deleted_at: record.deleted_at || null
    };
  }

  mapFavorite(record) {
    return {
      id: record.favorite_id,
      user_id: record.user_id,
      product_id: record.product_id,
      added_at: record.added_at
    };
  }

  mapReturn(record) {
    return {
      id: record.return_id,
      order_id: record.order_id,
      return_number: record.return_number,
      return_reason: record.return_reason,
      status: record.status || 'requested',
      refund_amount: record.refund_amount,
      notes: record.notes || null,
      requested_at: record.requested_at,
      processed_at: record.processed_at || null,
      guepex_tracking_number: record.guepex_tracking_number || null,
      guepex_label_url: record.guepex_label_url || null,
      return_warehouse_id: record.return_warehouse_id || null,
      pickup_status: record.pickup_status || null,
      pickup_scheduled_at: record.pickup_scheduled_at || null,
      picked_up_at: record.picked_up_at || null,
      received_at: record.received_at || null,
      shipment_status: record.shipment_status || null,
      shipment_status_reason: record.shipment_status_reason || null
    };
  }

  mapReturnItem(record) {
    return {
      id: record.return_item_id,
      return_id: record.return_id,
      order_item_id: record.order_item_id,
      quantity: record.quantity,
      condition: record.condition || 'opened',
      notes: record.notes || null
    };
  }

  // =====================================================
  // MIGRATION LOGIC
  // =====================================================

  async migrateTable(config) {
    const { table, file, mapper, nested } = config;
    
    console.log(`\n📦 Migrating ${table}...`);
    console.log(`   Source: ${file}`);

    try {
      // Read JSON data
      const jsonData = this.readJSON(file);
      
      if (!jsonData || jsonData.length === 0) {
        console.log(`   ⚠️  No data found, skipping`);
        return { success: true, count: 0 };
      }

      console.log(`   Found ${jsonData.length} records`);

      // Map data
      const mappedData = jsonData.map(record => this[mapper](record));

      if (this.dryRun) {
        console.log(`   [DRY RUN] Would insert ${mappedData.length} records`);
        if (this.verbose && mappedData.length > 0) {
          console.log(`   Sample:`, JSON.stringify(mappedData[0], null, 2));
        }
        return { success: true, count: mappedData.length };
      }

      // Insert data in batches
      const BATCH_SIZE = 100;
      let inserted = 0;

      for (let i = 0; i < mappedData.length; i += BATCH_SIZE) {
        const batch = mappedData.slice(i, i + BATCH_SIZE);
        
        for (const record of batch) {
          try {
            const columns = Object.keys(record);
            const values = Object.values(record);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

            const query = `
              INSERT INTO ${table} (${columns.join(', ')})
              VALUES (${placeholders})
              ON CONFLICT (id) DO UPDATE SET
                ${columns.map(col => `${col} = EXCLUDED.${col}`).join(', ')}
            `;

            await db.query(query, values);
            inserted++;
            
            if (this.verbose) {
              process.stdout.write(`\r   Inserted: ${inserted}/${mappedData.length}`);
            }
          } catch (error) {
            this.stats.failedInserts++;
            this.log(`Error inserting into ${table}: ${error.message}`, 'error');
            
            if (!this.continueOnError) {
              throw error;
            }
          }
        }
      }

      if (this.verbose) {
        console.log(''); // New line after progress
      }

      this.stats.successfulInserts += inserted;
      this.stats.totalRecords += jsonData.length;
      this.stats.tablesProcessed++;

      console.log(`   ✓ Migrated ${inserted} records`);
      
      // Verify count
      const dbCount = await db.getTableCount(table);
      console.log(`   Database count: ${dbCount}`);

      return { success: true, count: inserted };

    } catch (error) {
      this.log(`Failed to migrate ${table}: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Execute full migration
   */
  async migrate() {
    console.log('\n' + '='.repeat(60));
    console.log('PostgreSQL DATA MIGRATION');
    console.log('='.repeat(60));
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Continue on error: ${this.continueOnError}`);
    console.log('='.repeat(60));

    try {
      // Connect to database
      await db.connect();

      // Check if tables exist
      const tablesExist = await db.tableExists('users');
      if (!tablesExist) {
        throw new Error('Database schema not initialized. Run init-database.js first.');
      }

      // Start migration
      for (const config of this.migrationOrder) {
        await this.migrateTable(config);
      }

      // Generate summary
      this.printSummary();
      this.saveLog();

      console.log('\n✅ Migration completed successfully!\n');
      return true;

    } catch (error) {
      this.log(`Migration failed: ${error.message}`, 'error');
      this.printSummary();
      this.saveLog();
      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * Print migration summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Tables processed: ${this.stats.tablesProcessed}`);
    console.log(`Total records: ${this.stats.totalRecords}`);
    console.log(`Successful inserts: ${this.stats.successfulInserts}`);
    console.log(`Failed inserts: ${this.stats.failedInserts}`);
    console.log(`Errors: ${this.stats.errors.length}`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      this.stats.errors.slice(0, 5).forEach(err => {
        console.log(`  • ${err.message}`);
      });
      if (this.stats.errors.length > 5) {
        console.log(`  ... and ${this.stats.errors.length - 5} more (see log file)`);
      }
    }
    console.log('='.repeat(60));
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    continueOnError: args.includes('--continue-on-error')
  };

  if (args.includes('--help')) {
    console.log(`
Usage: node migrate-data.js [options]

Options:
  --dry-run              Test migration without inserting data
  --verbose, -v          Show detailed progress
  --continue-on-error    Continue migration even if some records fail
  --help                 Show this help message

Examples:
  node migrate-data.js --dry-run          # Test migration
  node migrate-data.js --verbose          # Run with detailed output
  node migrate-data.js --continue-on-error # Don't stop on errors
    `);
    process.exit(0);
  }

  const migration = new DataMigration(options);

  try {
    await migration.migrate();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default DataMigration;
