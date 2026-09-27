/**
 * Data Validation Script
 * Validates cleaned JSON data before PostgreSQL migration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '../../database');

// Utility
function readJSON(filePath) {
  const fullPath = path.join(DB_PATH, filePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

class DataValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.stats = {};
  }

  error(file, message, recordId = null) {
    this.errors.push({ file, message, recordId });
  }

  warn(file, message, recordId = null) {
    this.warnings.push({ file, message, recordId });
  }

  // Validate Foreign Keys
  validateForeignKeys() {
    console.log('\n🔍 Validating Foreign Keys...');

    const products = readJSON('catalog/products.json');
    const categories = readJSON('catalog/categories.json');
    const suppliers = readJSON('catalog/suppliers.json');
    const users = readJSON('users/users.json');
    const warehouses = readJSON('inventory/warehouses.json');
    const orders = readJSON('orders/orders.json');
    const orderItems = readJSON('orders/order-items.json');
    const orderHistory = readJSON('orders/order-history.json');
    const reviews = readJSON('reviews/reviews.json');
    const favorites = readJSON('users/favorites.json');
    const returns = readJSON('returns/returns.json');
    const returnItems = readJSON('returns/return-items.json');

    const categoryIds = new Set(categories.map(c => c.category_id));
    const supplierIds = new Set(suppliers.filter(s => !s.deleted_at).map(s => s.supplier_id));
    const productIds = new Set(products.map(p => p.product_id));
    const userIds = new Set(users.map(u => u.user_id));
    const warehouseIds = new Set(warehouses.map(w => w.warehouse_id));
    const orderIds = new Set(orders.map(o => o.order_id));
    const orderItemIds = new Set(orderItems.map(oi => oi.order_item_id));

    // Products -> Categories
    products.forEach(p => {
      if (!categoryIds.has(p.category_id)) {
        this.error('catalog/products.json', `Invalid category_id: ${p.category_id}`, p.product_id);
      }
      if (p.supplier_id && !supplierIds.has(p.supplier_id)) {
        this.error('catalog/products.json', `Invalid supplier_id: ${p.supplier_id}`, p.product_id);
      }
    });

    // Categories -> Parent Categories
    categories.forEach(c => {
      if (c.parent_category_id && !categoryIds.has(c.parent_category_id)) {
        this.error('catalog/categories.json', `Invalid parent_category_id: ${c.parent_category_id}`, c.category_id);
      }
    });

    // Orders -> Users
    orders.forEach(o => {
      if (o.user_id && !userIds.has(o.user_id)) {
        this.error('orders/orders.json', `Invalid user_id: ${o.user_id}`, o.order_id);
      }
      if (o.warehouse_id && !warehouseIds.has(o.warehouse_id)) {
        this.warn('orders/orders.json', `Invalid warehouse_id: ${o.warehouse_id}`, o.order_id);
      }
    });

    // Order Items -> Orders & Products
    orderItems.forEach(oi => {
      if (!orderIds.has(oi.order_id)) {
        this.error('orders/order-items.json', `Invalid order_id: ${oi.order_id}`, oi.order_item_id);
      }
      if (!productIds.has(oi.product_id)) {
        this.error('orders/order-items.json', `Invalid product_id: ${oi.product_id}`, oi.order_item_id);
      }
    });

    // Order History -> Orders
    orderHistory.forEach(oh => {
      if (!orderIds.has(oh.order_id)) {
        this.error('orders/order-history.json', `Invalid order_id: ${oh.order_id}`, oh.order_history_id);
      }
    });

    // Reviews -> Products & Users
    reviews.forEach(r => {
      if (!productIds.has(r.product_id)) {
        this.error('reviews/reviews.json', `Invalid product_id: ${r.product_id}`, r.review_id);
      }
      if (r.user_id && !userIds.has(r.user_id)) {
        this.warn('reviews/reviews.json', `Invalid user_id: ${r.user_id}`, r.review_id);
      }
    });

    // Favorites -> Users & Products
    favorites.forEach(f => {
      if (!userIds.has(f.user_id)) {
        this.error('users/favorites.json', `Invalid user_id: ${f.user_id}`, f.favorite_id);
      }
      if (!productIds.has(f.product_id)) {
        this.error('users/favorites.json', `Invalid product_id: ${f.product_id}`, f.favorite_id);
      }
    });

    // Returns -> Orders
    returns.forEach(r => {
      if (!orderIds.has(r.order_id)) {
        this.error('returns/returns.json', `Invalid order_id: ${r.order_id}`, r.return_id);
      }
    });

    // Return Items -> Returns & Order Items
    returnItems.forEach(ri => {
      const returnExists = returns.some(r => r.return_id === ri.return_id);
      if (!returnExists) {
        this.error('returns/return-items.json', `Invalid return_id: ${ri.return_id}`, ri.return_item_id);
      }
      if (!orderItemIds.has(ri.order_item_id)) {
        this.error('returns/return-items.json', `Invalid order_item_id: ${ri.order_item_id}`, ri.return_item_id);
      }
    });

    console.log(`  ✓ Foreign key validation complete`);
  }

  // Validate Required Fields
  validateRequiredFields() {
    console.log('\n🔍 Validating Required Fields...');

    const users = readJSON('users/users.json');
    const products = readJSON('catalog/products.json');
    const orders = readJSON('orders/orders.json');

    users.forEach(u => {
      if (!u.email) {
        this.error('users/users.json', 'Missing required field: email', u.user_id);
      }
      if (!u.role) {
        this.error('users/users.json', 'Missing required field: role', u.user_id);
      }
    });

    products.forEach(p => {
      if (!p.sku) {
        this.error('catalog/products.json', 'Missing required field: sku', p.product_id);
      }
      if (!p.product_name) {
        this.error('catalog/products.json', 'Missing required field: product_name', p.product_id);
      }
      if (p.current_price === null || p.current_price === undefined) {
        this.error('catalog/products.json', 'Missing required field: current_price', p.product_id);
      }
    });

    orders.forEach(o => {
      if (!o.order_number) {
        this.error('orders/orders.json', 'Missing required field: order_number', o.order_id);
      }
      if (o.total_amount === null || o.total_amount === undefined) {
        this.error('orders/orders.json', 'Missing required field: total_amount', o.order_id);
      }
    });

    console.log(`  ✓ Required fields validation complete`);
  }

  // Validate Unique Constraints
  validateUniqueConstraints() {
    console.log('\n🔍 Validating Unique Constraints...');

    const users = readJSON('users/users.json');
    const products = readJSON('catalog/products.json');
    const categories = readJSON('catalog/categories.json');
    const orders = readJSON('orders/orders.json');

    // User emails
    const emails = users.map(u => u.email);
    const duplicateEmails = emails.filter((e, i) => emails.indexOf(e) !== i);
    if (duplicateEmails.length > 0) {
      this.error('users/users.json', `Duplicate emails: ${duplicateEmails.join(', ')}`);
    }

    // Product SKUs
    const skus = products.map(p => p.sku);
    const duplicateSkus = skus.filter((s, i) => skus.indexOf(s) !== i);
    if (duplicateSkus.length > 0) {
      this.error('catalog/products.json', `Duplicate SKUs: ${duplicateSkus.join(', ')}`);
    }

    // Category slugs
    const slugs = categories.map(c => c.category_slug);
    const duplicateSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (duplicateSlugs.length > 0) {
      this.error('catalog/categories.json', `Duplicate slugs: ${duplicateSlugs.join(', ')}`);
    }

    // Order numbers
    const orderNumbers = orders.map(o => o.order_number);
    const duplicateOrderNumbers = orderNumbers.filter((n, i) => orderNumbers.indexOf(n) !== i);
    if (duplicateOrderNumbers.length > 0) {
      this.error('orders/orders.json', `Duplicate order numbers: ${duplicateOrderNumbers.join(', ')}`);
    }

    console.log(`  ✓ Unique constraints validation complete`);
  }

  // Validate Data Types
  validateDataTypes() {
    console.log('\n🔍 Validating Data Types...');

    const products = readJSON('catalog/products.json');
    const orders = readJSON('orders/orders.json');
    const stock = readJSON('inventory/stock.json');

    // Check negative values
    products.forEach(p => {
      if (p.current_price < 0) {
        this.error('catalog/products.json', `Negative price: ${p.current_price}`, p.product_id);
      }
      if (p.sale_price && p.sale_price < 0) {
        this.error('catalog/products.json', `Negative sale_price: ${p.sale_price}`, p.product_id);
      }
    });

    orders.forEach(o => {
      if (o.total_amount < 0) {
        this.error('orders/orders.json', `Negative total_amount: ${o.total_amount}`, o.order_id);
      }
    });

    stock.forEach(s => {
      if (s.quantity < 0) {
        this.error('inventory/stock.json', `Negative quantity: ${s.quantity}`, s.stock_id);
      }
      if (s.reserved_quantity < 0) {
        this.error('inventory/stock.json', `Negative reserved_quantity: ${s.reserved_quantity}`, s.stock_id);
      }
      if (s.reserved_quantity > s.quantity) {
        this.error('inventory/stock.json', `Reserved exceeds quantity`, s.stock_id);
      }
    });

    console.log(`  ✓ Data type validation complete`);
  }

  // Collect Statistics
  collectStatistics() {
    console.log('\n📊 Collecting Statistics...');

    this.stats = {
      users: readJSON('users/users.json').length,
      addresses: readJSON('users/addresses.json').length,
      products: readJSON('catalog/products.json').length,
      categories: readJSON('catalog/categories.json').length,
      suppliers: readJSON('catalog/suppliers.json').length,
      product_attributes: readJSON('catalog/product-attributes.json').length,
      product_images: readJSON('catalog/product-images.json').length,
      warehouses: readJSON('inventory/warehouses.json').length,
      stock: readJSON('inventory/stock.json').length,
      orders: readJSON('orders/orders.json').length,
      order_items: readJSON('orders/order-items.json').length,
      order_history: readJSON('orders/order-history.json').length,
      promotions: readJSON('promotions/promotions.json').length,
      reviews: readJSON('reviews/reviews.json').length,
      favorites: readJSON('users/favorites.json').length,
      returns: readJSON('returns/returns.json').length,
      return_items: readJSON('returns/return-items.json').length,
      wilayas: readJSON('shipping/wilayas.json').length,
      communes: readJSON('shipping/communes.json').length
    };

    console.log('\n  Record Counts:');
    Object.entries(this.stats).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }

  // Generate Report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_errors: this.errors.length,
        total_warnings: this.warnings.length,
        migration_ready: this.errors.length === 0
      },
      statistics: this.stats,
      errors: this.errors,
      warnings: this.warnings
    };

    const reportPath = path.join(__dirname, `validation-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`❌ Errors: ${this.errors.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`\n📄 Report saved: ${path.basename(reportPath)}`);

    if (this.errors.length > 0) {
      console.log('\n❌ CRITICAL ERRORS - MUST FIX BEFORE MIGRATION:');
      this.errors.slice(0, 10).forEach(err => {
        console.log(`  • [${err.file}${err.recordId ? ` #${err.recordId}` : ''}] ${err.message}`);
      });
      if (this.errors.length > 10) {
        console.log(`  ... and ${this.errors.length - 10} more (see report)`);
      }
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (non-blocking):');
      this.warnings.slice(0, 5).forEach(warn => {
        console.log(`  • [${warn.file}${warn.recordId ? ` #${warn.recordId}` : ''}] ${warn.message}`);
      });
      if (this.warnings.length > 5) {
        console.log(`  ... and ${this.warnings.length - 5} more (see report)`);
      }
    }

    console.log('\n' + '='.repeat(60));
    if (this.errors.length === 0) {
      console.log('✅ DATA IS READY FOR POSTGRESQL MIGRATION');
    } else {
      console.log('❌ FIX ERRORS BEFORE PROCEEDING WITH MIGRATION');
    }
    console.log('='.repeat(60) + '\n');

    return report;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Data Validation...\n');

  const validator = new DataValidator();

  try {
    validator.validateForeignKeys();
    validator.validateRequiredFields();
    validator.validateUniqueConstraints();
    validator.validateDataTypes();
    validator.collectStatistics();
    
    const report = validator.generateReport();

    process.exit(report.summary.total_errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Validation error:', error);
    process.exit(1);
  }
}

main();
