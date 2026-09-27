import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base database directory (relative to this file: shared/utils -> shared -> src -> backend -> root -> database)
const DATABASE_DIR = path.join(__dirname, '../../../../database');

/**
 * Centralized database file paths
 * All routes should import these instead of defining their own paths
 */
export const DB_PATHS = {
  // Catalog
  CATEGORIES: path.join(DATABASE_DIR, 'catalog/categories.json'),
  PRODUCTS: path.join(DATABASE_DIR, 'catalog/products.json'),
  PRODUCT_IMAGES: path.join(DATABASE_DIR, 'catalog/product-images.json'),
  PRODUCT_ATTRIBUTES: path.join(DATABASE_DIR, 'catalog/product-attributes.json'),
  SUPPLIERS: path.join(DATABASE_DIR, 'catalog/suppliers.json'),
  
  // Inventory
  STOCK: path.join(DATABASE_DIR, 'inventory/stock.json'),
  WAREHOUSES: path.join(DATABASE_DIR, 'inventory/warehouses.json'),
  
  // Orders
  ORDERS: path.join(DATABASE_DIR, 'orders/orders.json'),
  ORDER_ITEMS: path.join(DATABASE_DIR, 'orders/order-items.json'),
  ORDER_HISTORY: path.join(DATABASE_DIR, 'orders/order-history.json'),
  
  // Users
  USERS: path.join(DATABASE_DIR, 'users/users.json'),
  ADDRESSES: path.join(DATABASE_DIR, 'users/addresses.json'),
  FAVORITES: path.join(DATABASE_DIR, 'users/favorites.json'),
  
  // Reviews
  REVIEWS: path.join(DATABASE_DIR, 'reviews/reviews.json'),
  
  // Promotions
  PROMOTIONS: path.join(DATABASE_DIR, 'promotions/promotions.json'),
  PROMOTION_PRODUCTS: path.join(DATABASE_DIR, 'promotions/promotion-products.json'),
  
  // Returns
  RETURNS: path.join(DATABASE_DIR, 'returns/returns.json'),
  RETURN_ITEMS: path.join(DATABASE_DIR, 'returns/return-items.json'),
};

/**
 * Get all file paths as an array for batch operations
 */
export function getAllDatabasePaths() {
  return Object.values(DB_PATHS);
}

/**
 * Validate that all database files exist
 */
export async function validateDatabaseFiles() {
  const fs = await import('fs/promises');
  const results = {};
  
  for (const [key, filePath] of Object.entries(DB_PATHS)) {
    try {
      await fs.access(filePath);
      results[key] = true;
    } catch (error) {
      results[key] = false;
      console.warn(`Database file missing: ${key} at ${filePath}`);
    }
  }
  
  return results;
}
