import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/db/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '../../database');

// Data mappers
const mapWilaya = (w) => ({
  id: w.id,
  name: w.name,
  zone: w.zone || 1,
  is_deliverable: w.is_deliverable === 1 || w.is_deliverable === true
});

const mapCommune = (c) => ({
  id: c.id,
  wilaya_id: c.wilaya_id,
  name: c.name,
  has_stop_desk: c.has_stop_desk === 1 || c.has_stop_desk === true,
  is_deliverable: c.is_deliverable === 1 || c.is_deliverable === true,
  delivery_time_parcel: c.delivery_time_parcel || null,
  delivery_time_payment: c.delivery_time_payment || null
});

const mapCenter = (c) => ({
  id: c.id || c.center_id,
  wilaya_id: c.wilaya_id,
  name: c.name,
  address: c.address || 'N/A',
  gps: c.gps || null,
  commune_id: c.commune_id || null,
  provider: c.name.includes('Yalidine') ? 'Yalidine' : (c.name.includes('Guepex') ? 'Guepex' : 'Other')
});

const mapCategory = (c) => ({
  id: c.id || c.category_id,
  parent_category_id: c.parent_id || c.parent_category_id || null,
  category_name: typeof c.category_name === 'object' ? JSON.stringify(c.category_name) : JSON.stringify({
    fr: c.name_fr || c.name,
    ar: c.name_ar,
    en: c.name_en || c.name
  }),
  category_slug: c.slug || c.category_slug,
  description: typeof c.description === 'object' ? JSON.stringify(c.description) : JSON.stringify({
    fr: c.description_fr || null,
    ar: c.description_ar || null,
    en: c.description_en || null
  }),
  category_image: c.image || c.image_url || c.category_image || null,
  level: c.level || 1
});

const mapSupplier = (s) => ({
  id: s.id || s.supplier_id,
  name: s.name,
  contact_email: s.email || s.contact_email || null,
  contact_phone: s.phone || s.contact_phone || null,
  address: s.address || null
});

const mapUser = (u) => ({
  id: u.id || u.user_id,
  email: u.email,
  password_hash: u.password || u.password_hash,
  first_name: u.first_name,
  last_name: u.last_name,
  full_name: u.full_name || `${u.first_name} ${u.last_name}`,
  phone: u.phone || null,
  role: u.role || 'customer',
  is_active: u.is_active !== false
});

const mapProduct = (p) => ({
  id: p.id || p.product_id,
  category_id: p.category_id,
  supplier_id: p.supplier_id || null,
  sku: p.sku,
  product_name: p.product_name || p.name_fr || p.name,
  brand: p.brand || null,
  model_number: p.model_number || p.model || null,
  description: p.full_description || p.description_fr || p.description || null,
  cost_price: p.cost_price ? parseFloat(p.cost_price) : (p.cost ? parseFloat(p.cost) : null),
  current_price: parseFloat(p.current_price || p.price),
  sale_price: p.sale_price ? parseFloat(p.sale_price) : (p.compare_price ? parseFloat(p.compare_price) : null),
  warranty_months: p.warranty_months || (p.warranty_period ? parseInt(p.warranty_period) : null),
  is_active: p.is_active !== false,
  is_featured: p.is_featured === true
});

const mapStock = (s) => ({
  product_id: s.product_id,
  warehouse_id: s.warehouse_id || 1, // Default warehouse
  quantity: s.quantity || 0,
  reserved_quantity: s.reserved_quantity || 0,
  reorder_level: s.reorder_level || 10
});

const mapOrder = (o) => {
  // Map payment methods to match enum
  let paymentMethod = o.payment_method || 'cod';
  if (paymentMethod === 'cash_on_delivery' || paymentMethod === 'cash') paymentMethod = 'cod';
  if (paymentMethod === 'credit_card') paymentMethod = 'card';
  
  // Map order status to match enum
  let status = o.status || o.current_status || 'pending';
  if (status === 'confirmed') status = 'processing';
  if (status === 'completed') status = 'delivered';
  
  return {
    id: o.id || o.order_id,
    order_number: o.order_number,
    user_id: o.user_id,
    current_status: status,
    payment_status: o.payment_status || 'unpaid',
    payment_method: paymentMethod,
    subtotal: parseFloat(o.subtotal || o.total || 0),
    shipping_cost: parseFloat(o.shipping_cost || 0),
    tax_amount: parseFloat(o.tax || o.tax_amount || 0),
    discount_amount: parseFloat(o.discount || o.discount_amount || 0),
    total_amount: parseFloat(o.total || o.total_amount),
    delivery_notes: o.notes || o.delivery_notes || null,
    guepex_tracking_number: o.tracking_number || o.guepex_tracking_number || null,
    ordered_at: o.created_at || o.order_date || o.ordered_at || new Date().toISOString()
  };
};

const mapOrderItem = (item) => ({
  id: item.id || item.order_item_id,
  order_id: item.order_id,
  product_id: item.product_id,
  quantity: item.quantity,
  unit_price: parseFloat(item.price || item.unit_price),
  discount_amount: parseFloat(item.discount || 0),
  line_total: parseFloat(item.total || (item.quantity * item.price))
});

const mapReview = (r) => ({
  id: r.id || r.review_id,
  product_id: r.product_id,
  user_id: r.user_id,
  rating: r.rating,
  review_title: r.title || r.review_title || null,
  review_text: r.comment || r.review_text,
  verified_purchase: r.is_verified_purchase === true || r.verified_purchase === true,
  status: (r.is_approved !== false && r.status !== 'rejected') ? (r.status || 'approved') : 'pending',
  created_at: r.created_at || r.date || new Date().toISOString()
});

const mapPromotion = (p) => ({
  id: p.id || p.promotion_id,
  promotion_code: p.promotion_code || p.code,
  promotion_name: typeof p.promotion_name === 'object' ? JSON.stringify(p.promotion_name) : JSON.stringify({ fr: p.promotion_name || p.name, ar: '' }),
  description: typeof p.description === 'object' ? JSON.stringify(p.description) : (p.description ? JSON.stringify({ fr: p.description, ar: '' }) : null),
  discount_type: p.discount_type || 'percentage',
  discount_value: parseFloat(p.discount_value),
  min_order_amount: p.min_order_amount ? parseFloat(p.min_order_amount) : null,
  applicable_categories: p.applicable_categories || null,
  applicable_products: p.applicable_products || null,
  start_date: p.start_date,
  end_date: p.end_date,
  max_uses: p.max_uses || null,
  max_uses_per_user: p.max_uses_per_user || 1,
  current_uses: p.current_uses || 0
});

const mapAddress = (a) => ({
  id: a.id || a.address_id,
  user_id: a.user_id,
  street_address: a.street_address,
  address_line_2: a.address_line_2 || null,
  city: a.city,
  state_province: a.state_province || null,
  postal_code: a.postal_code || null,
  country: a.country || 'Algeria',
  phone_number: a.phone_number || null,
  is_default: a.is_default === true
});

const mapFavorite = (f) => ({
  id: f.id || f.favorite_id,
  user_id: f.user_id,
  product_id: f.product_id,
  added_at: f.added_at || f.created_at || new Date().toISOString()
});

const mapProductAttribute = (a) => ({
  id: a.id || a.attribute_id,
  product_id: a.product_id,
  attribute_name: typeof a.attribute_name === 'object' ? JSON.stringify(a.attribute_name) : a.attribute_name,
  attribute_value: a.attribute_value,
  attribute_type: a.attribute_type || 'text',
  display_order: a.display_order || 0
});

const mapProductImage = (img) => {
  let imageType = img.image_type || 'product';
  // Map to enum: 'product', 'lifestyle', 'size_chart', 'manual'
  if (imageType === 'primary' || imageType === 'secondary') imageType = 'product';
  if (!['product', 'lifestyle', 'size_chart', 'manual'].includes(imageType)) {
    imageType = 'product';
  }
  
  return {
    id: img.id || img.image_id,
    product_id: img.product_id,
    image_url: img.image_url,
    image_type: imageType,
    display_order: img.display_order || 0,
    alt_text: img.alt_text || null
  };
};

const mapReturn = (r) => {
  let status = r.status || 'requested';
  // Map to enum values: 'requested', 'approved', 'rejected', 'processing', 'completed', 'cancelled'
  if (!['requested', 'approved', 'rejected', 'processing', 'completed', 'cancelled'].includes(status)) {
    status = 'requested';
  }
  
  return {
    id: r.id || r.return_id,
    order_id: r.order_id,
    return_number: r.return_number,
    return_reason: r.return_reason || r.reason || 'N/A',
    status: status,
    refund_amount: r.refund_amount ? parseFloat(r.refund_amount) : 0,
    notes: r.notes || null,
    requested_at: r.requested_at || new Date().toISOString()
  };
};

const mapReturnItem = (ri) => ({
  id: ri.id || ri.return_item_id,
  return_id: ri.return_id,
  order_item_id: ri.order_item_id,
  quantity: ri.quantity,
  condition: ri.condition || 'unopened',
  notes: ri.notes || null
});

const mapWarehouse = (w) => ({
  id: w.id || w.warehouse_id,
  warehouse_name: w.warehouse_name,
  location_address: w.location_address,
  contact_number: w.contact_number || null,
  wilaya_id: w.wilaya_id || null
});

let orderHistoryIdCounter = 1;
const mapOrderHistory = (h) => {
  // Map status to match enum: 'pending', 'processing', 'shipped', 'delivered', 'cancelled'
  let status = h.status || 'pending';
  if (status === 'confirmed') status = 'processing';
  if (status === 'completed') status = 'delivered';
  if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
    status = 'pending';
  }
  
  // Use the generated ID from preprocessing step
  const id = h._generated_id || h.id || h.status_history_id || h.order_history_id || h.history_id;
  
  return {
    id: id,
    order_id: h.order_id,
    status: status,
    payment_status: h.payment_status || null,
    notes: h.notes || null,
    changed_by: h.changed_by || null,
    changed_at: h.changed_at || new Date().toISOString()
  };
};

const mapSyncLog = (s) => ({
  sync_type: s.sync_type || 'shipping',
  sync_timestamp: s.timestamp || new Date().toISOString(),
  success_count: s.results?.success?.length || 0,
  error_count: s.results?.errors?.length || 0,
  details: s.results ? JSON.stringify(s.results) : null,
  errors: s.results?.errors?.length > 0 ? JSON.stringify(s.results.errors) : null
});

// Special function to migrate shipping tariffs from nested structure
async function migrateShippingTariffs() {
  console.log('📦 Migrating shipping tariffs (fees)...');
  
  const feeFiles = ['fees-from-16.json', 'fees-from-21.json'];
  let totalTariffs = 0;
  
  for (const feeFile of feeFiles) {
    const filePath = path.join(DB_PATH, 'shipping', feeFile);
    
    if (!fs.existsSync(filePath)) {
      continue;
    }
    
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const fromWilayaId = content.from_wilaya_id;
    
    if (!content.data) continue;
    
    // Extract tariffs from nested structure
    const tariffs = [];
    for (const toWilayaId in content.data) {
      const wilayaData = content.data[toWilayaId];
      
      if (wilayaData.per_commune) {
        for (const communeId in wilayaData.per_commune) {
          const communeData = wilayaData.per_commune[communeId];
          
          tariffs.push({
            from_wilaya_id: fromWilayaId,
            to_wilaya_id: parseInt(toWilayaId),
            to_commune_id: parseInt(communeId),
            zone: wilayaData.zone,
            express_home: communeData.express_home ? parseFloat(communeData.express_home) : null,
            express_desk: communeData.express_desk ? parseFloat(communeData.express_desk) : null,
            economic_home: communeData.economic_home ? parseFloat(communeData.economic_home) : null,
            economic_desk: communeData.economic_desk ? parseFloat(communeData.economic_desk) : null,
            retour_fee: wilayaData.retour_fee ? parseFloat(wilayaData.retour_fee) : null,
            cod_percentage: wilayaData.cod_percentage ? parseFloat(wilayaData.cod_percentage) : null,
            insurance_percentage: wilayaData.insurance_percentage ? parseFloat(wilayaData.insurance_percentage) : null,
            oversize_fee: wilayaData.oversize_fee ? parseFloat(wilayaData.oversize_fee) : null
          });
        }
      }
    }
    
    if (tariffs.length > 0) {
      const columns = Object.keys(tariffs[0]);
      const values = tariffs.map(row => columns.map(col => row[col]));
      
      const onConflict = `ON CONFLICT (from_wilaya_id, to_wilaya_id, to_commune_id) DO UPDATE SET 
        zone = EXCLUDED.zone,
        express_home = EXCLUDED.express_home,
        express_desk = EXCLUDED.express_desk,
        economic_home = EXCLUDED.economic_home,
        economic_desk = EXCLUDED.economic_desk,
        retour_fee = EXCLUDED.retour_fee,
        cod_percentage = EXCLUDED.cod_percentage,
        insurance_percentage = EXCLUDED.insurance_percentage,
        oversize_fee = EXCLUDED.oversize_fee`;
      
      await db.batchInsert('shipping_tariffs', columns, values, onConflict);
      totalTariffs += tariffs.length;
      console.log(`   ✓ Inserted ${tariffs.length} tariffs from wilaya ${fromWilayaId}`);
    }
  }
  
  console.log(`   ✓ Total shipping tariffs: ${totalTariffs}\n`);
}

async function migrate() {
  console.log('\n🚀 Starting Data Migration...\n');
  
  // Create default warehouse first (required by stock table)
  console.log('📦 Creating default warehouses...');
  try {
    await db.query(`
      INSERT INTO warehouses (id, warehouse_name, location_address, contact_number)
      VALUES 
        (1, 'Main Warehouse', 'Algiers, Algeria', NULL),
        (2, 'Secondary Warehouse', 'Oran, Algeria', NULL)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('   ✓ Default warehouses created\n');
  } catch (error) {
    console.log('   ✓ Warehouses already exist\n');
  }
  
  // Get valid product IDs for filtering stock
  const productsPath = path.join(DB_PATH, 'catalog/products.json');
  const validProductIds = fs.existsSync(productsPath) 
    ? new Set(JSON.parse(fs.readFileSync(productsPath, 'utf8')).map(p => p.product_id || p.id))
    : new Set();
  
  // Migrate shipping tariffs from nested structure
  await migrateShippingTariffs();
  
  const migrations = [
    // Shipping data
    { table: 'wilayas', file: 'shipping/wilayas.json', mapper: mapWilaya, nested: 'data' },
    { table: 'communes', file: 'shipping/communes.json', mapper: mapCommune, nested: 'data' },
    { table: 'shipping_centers', file: 'shipping/centers.json', mapper: mapCenter, nested: 'data' },
    
    // Core entities
    { table: 'suppliers', file: 'catalog/suppliers.json', mapper: mapSupplier },
    { table: 'categories', file: 'catalog/categories.json', mapper: mapCategory },
    { table: 'users', file: 'users/users.json', mapper: mapUser },
    { table: 'addresses', file: 'users/addresses.json', mapper: mapAddress },
    { table: 'promotions', file: 'promotions/promotions.json', mapper: mapPromotion },
    { table: 'warehouses', file: 'inventory/warehouses.json', mapper: mapWarehouse },
    
    // Products
    { table: 'products', file: 'catalog/products.json', mapper: mapProduct },
    { table: 'product_attributes', file: 'catalog/product-attributes.json', mapper: mapProductAttribute },
    { table: 'product_images', file: 'catalog/product-images.json', mapper: mapProductImage },
    { table: 'stock', file: 'inventory/stock.json', mapper: mapStock },
    { table: 'favorites', file: 'users/favorites.json', mapper: mapFavorite },
    
    // Orders
    { table: 'orders', file: 'orders/orders.json', mapper: mapOrder },
    { table: 'order_items', file: 'orders/order-items.json', mapper: mapOrderItem },
    { table: 'order_history', file: 'orders/order-history.json', mapper: mapOrderHistory },
    
    // Returns & Reviews
    { table: 'returns', file: 'returns/returns.json', mapper: mapReturn },
    { table: 'return_items', file: 'returns/return-items.json', mapper: mapReturnItem },
    { table: 'reviews', file: 'reviews/reviews.json', mapper: mapReview },
    
    // Sync logs
    { table: 'sync_logs', file: 'shipping/sync-log.json', mapper: mapSyncLog }
  ];

  let totalRecords = 0;

  for (const { table, file, mapper, nested } of migrations) {
    try {
      const filePath = path.join(DB_PATH, file);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⏭️  Skipping ${table} (file not found: ${file})`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      let data = JSON.parse(content);
      
      if (nested && data[nested]) {
        data = data[nested];
      }

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`⏭️  Skipping ${table} (no data)`);
        continue;
      }

      console.log(`📦 Migrating ${table}...`);
      
      // Special preprocessing for order_history to ensure unique IDs
      if (table === 'order_history') {
        // Source data has duplicate IDs - reassign sequentially
        data.forEach((h, idx) => {
          h._generated_id = idx + 1;
        });
      }
      
      let mapped = data.map(mapper);
      
      // Filter out invalid stock entries (orphaned product_ids)
      if (table === 'stock') {
        const before = mapped.length;
        mapped = mapped.filter(s => validProductIds.has(s.product_id));
        if (before > mapped.length) {
          console.log(`   ⚠️  Skipped ${before - mapped.length} invalid stock entries`);
        }
      }
      
      if (mapped.length > 0) {
        const columns = Object.keys(mapped[0]);
        const values = mapped.map(row => columns.map(col => row[col]));
        
        // Special case for stock table: unique constraint is on (product_id, warehouse_id)
        // Special case for sync_logs: no ON CONFLICT needed (always insert new records)
        let onConflict;
        if (table === 'sync_logs') {
          onConflict = ''; // No conflict handling - always insert
        } else if (table === 'stock') {
          const updateFields = columns.filter(c => c !== 'product_id' && c !== 'warehouse_id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
          onConflict = `ON CONFLICT (product_id, warehouse_id) DO UPDATE SET ${updateFields}`;
        } else {
          const updateFields = columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
          onConflict = `ON CONFLICT (id) DO UPDATE SET ${updateFields}`;
        }
        
        await db.batchInsert(table, columns, values, onConflict);
        
        console.log(`   ✓ Inserted ${mapped.length} records`);
        totalRecords += mapped.length;
      }
      
    } catch (error) {
      console.error(`   ✗ Error migrating ${table}:`, error.message);
      throw error;
    }
  }

  console.log(`\n✅ Migration complete! Total records: ${totalRecords}\n`);
  
  // Show statistics
  console.log('📊 Verification:\n');
  const tables = [
    'wilayas', 'communes', 'shipping_centers', 'shipping_tariffs',
    'categories', 'suppliers', 'users', 'addresses', 'warehouses',
    'promotions', 'products', 'product_attributes', 
    'product_images', 'stock', 'favorites',
    'orders', 'order_items', 'order_history',
    'returns', 'return_items', 'reviews', 'sync_logs'
  ];
  
  for (const table of tables) {
    try {
      const result = await db.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count}`);
    } catch (e) {
      console.log(`   ${table}: error`);
    }
  }
  
  console.log('');
}

async function main() {
  try {
    await migrate();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
