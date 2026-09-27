/**
 * Metadata Service Layer
 * Handles categories, suppliers, wilayas, communes, and other reference data
 * Optimized for caching (data changes infrequently)
 */

import db from '../db/postgres.js';
import { ValidationError, NotFoundError } from '../shared/errors/index.js';

class MetadataService {
  /**
   * Get all categories (hierarchical structure)
   * Cacheable - categories don't change frequently
   * @returns {Promise<array>}
   */
  async getCategories() {
    const query = `
      SELECT 
        id as category_id,
        category_name,
        category_slug,
        parent_category_id,
        description,
        level,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) as product_count
      FROM categories c
      WHERE deleted_at IS NULL
      ORDER BY category_name
    `;

    return await db.queryMany(query);
  }

  /**
   * Get category by ID with product count
   * @param {number} categoryId
   * @returns {Promise<object|null>}
   */
  async getCategoryById(categoryId) {
    const query = `
      SELECT 
        c.id as category_id,
        c.category_name,
        c.category_slug,
        c.parent_category_id,
        c.description,
        c.level,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) as product_count
      FROM categories c
      WHERE c.id = $1 AND c.deleted_at IS NULL
    `;

    return await db.queryOne(query, [categoryId]);
  }

  /**
   * Get all suppliers
   * @param {boolean} activeOnly
   * @returns {Promise<array>}
   */
  async getSuppliers(activeOnly = false) {
    const query = `
      SELECT 
        id as supplier_id,
        name as supplier_name,
        contact_email,
        contact_phone,
        address,
        (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.deleted_at IS NULL) as product_count
      FROM suppliers s
      WHERE deleted_at IS NULL
      ORDER BY name
    `;

    return await db.queryMany(query);
  }

  /**
   * Get all warehouses
   * @returns {Promise<array>}
   */
  async getWarehouses() {
    const query = `
      SELECT 
        id as warehouse_id,
        warehouse_name,
        location_address,
        contact_number,
        wilaya_id,
        (SELECT COUNT(*) FROM stock s WHERE s.warehouse_id = warehouses.id) as stock_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM stock s WHERE s.warehouse_id = warehouses.id) as total_quantity
      FROM warehouses
      WHERE deleted_at IS NULL
      ORDER BY id
    `;

    return await db.queryMany(query);
  }

  /**
   * Get all wilayas with commune counts
   * Highly cacheable - rarely changes
   * @returns {Promise<array>}
   */
  async getWilayas() {
    const query = `
      SELECT 
        w.id as wilaya_id,
        w.name as wilaya_name,
        w.zone,
        w.is_deliverable,
        COUNT(c.id) as commune_count
      FROM wilayas w
      LEFT JOIN communes c ON w.id = c.wilaya_id
      GROUP BY w.id, w.name, w.zone, w.is_deliverable
      ORDER BY w.id
    `;

    return await db.queryMany(query);
  }

  /**
   * Get communes by wilaya
   * @param {number} wilayaId
   * @returns {Promise<array>}
   */
  async getCommunesByWilaya(wilayaId) {
    const query = `
      SELECT 
        id as commune_id,
        name as commune_name,
        wilaya_id,
        has_stop_desk,
        is_deliverable
      FROM communes
      WHERE wilaya_id = $1
      ORDER BY name
    `;

    return await db.queryMany(query, [wilayaId]);
  }

  /**
   * Get shipping centers with wilaya/commune info
   * @param {number} wilayaId - Optional filter
   * @returns {Promise<array>}
   */
  async getShippingCenters(wilayaId = null) {
    const query = `
      SELECT 
        sc.id as center_id,
        sc.name as center_name,
        sc.address,
        sc.wilaya_id,
        w.name as wilaya_name,
        sc.commune_id,
        c.name as commune_name,
        sc.provider
      FROM shipping_centers sc
      LEFT JOIN wilayas w ON sc.wilaya_id = w.id
      LEFT JOIN communes c ON sc.commune_id = c.id
      WHERE 1=1
        ${wilayaId ? 'AND sc.wilaya_id = $1' : ''}
      ORDER BY w.name, sc.name
    `;

    const params = wilayaId ? [wilayaId] : [];
    return await db.queryMany(query, params);
  }

  /**
   * Get shipping fee for delivery location
   * @param {number} fromWilayaId
   * @param {number} toWilayaId
   * @param {number} toCommuneId
   * @param {number} weight - in kg
   * @returns {Promise<object>}
   */
  async getShippingFee(fromWilayaId, toWilayaId, toCommuneId, weight = 1) {
    // Get shipping tariff
    const query = `
      SELECT 
        home_delivery_fee,
        desk_delivery_fee
      FROM shipping_tariffs
      WHERE from_wilaya_id = $1
        AND to_wilaya_id = $2
        AND to_commune_id = $3
      LIMIT 1
    `;

    const tariff = await db.queryOne(query, [fromWilayaId, toWilayaId, toCommuneId]);

    if (!tariff) {
      // Fallback: use wilaya-level average if commune-specific not found
      const wilayaQuery = `
        SELECT 
          AVG(home_delivery_fee) as home_delivery_fee,
          AVG(desk_delivery_fee) as desk_delivery_fee
        FROM shipping_tariffs
        WHERE from_wilaya_id = $1 AND to_wilaya_id = $2
      `;

      const wilayaTariff = await db.queryOne(wilayaQuery, [fromWilayaId, toWilayaId]);
      if (!wilayaTariff) return null;

      // Apply weight multiplier
      if (weight > 1) {
        const weightSurcharge = (weight - 1) * 50;
        wilayaTariff.home_delivery_fee = parseFloat(wilayaTariff.home_delivery_fee) + weightSurcharge;
        wilayaTariff.desk_delivery_fee = parseFloat(wilayaTariff.desk_delivery_fee) + weightSurcharge;
      }
      return wilayaTariff;
    }

    // Apply weight multiplier if needed (for packages > 1kg)
    if (weight > 1) {
      const weightSurcharge = (weight - 1) * 50; // 50 DZD per additional kg
      tariff.home_delivery_fee += weightSurcharge;
      tariff.desk_delivery_fee += weightSurcharge;
    }

    return tariff;
  }

  /**
   * Get promotions (active or all)
   * @param {boolean} activeOnly
   * @returns {Promise<array>}
   */
  async getPromotions(activeOnly = true) {
    const now = new Date().toISOString();

    const query = `
      SELECT 
        id as promotion_id,
        promotion_code,
        promotion_name,
        description,
        discount_type,
        discount_value,
        start_date,
        end_date,
        min_order_amount as min_purchase_amount,
        max_uses,
        current_uses
      FROM promotions
      WHERE deleted_at IS NULL
        ${activeOnly ? `AND start_date <= $1 AND end_date >= $1` : ''}
      ORDER BY created_at DESC
    `;

    const params = activeOnly ? [now] : [];
    return await db.queryMany(query, params);
  }

  /**
   * Get dashboard statistics
   * Aggregated data for admin overview
   * @returns {Promise<object>}
   */
  async getDashboardStats() {
    const query = `
      SELECT
        -- Products
        (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) as total_products,
        (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND is_active = true) as active_products,
        (SELECT COUNT(DISTINCT category_id) FROM products WHERE deleted_at IS NULL) as total_categories,
        
        -- Orders
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE current_status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM orders WHERE ordered_at >= NOW() - INTERVAL '24 hours') as orders_today,
        (SELECT COALESCE(SUM(subtotal - discount_amount), 0) FROM orders WHERE current_status IN ('shipped', 'delivered')) as total_revenue,
        
        -- Users
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days' AND deleted_at IS NULL) as new_users_this_month,
        
        -- Inventory
        (SELECT COALESCE(SUM(s.quantity), 0) FROM stock s JOIN products p ON s.product_id = p.id WHERE p.deleted_at IS NULL AND p.is_active = true) as total_stock_quantity,
        (SELECT COUNT(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM stock s WHERE s.product_id = p.id AND s.quantity > 0) AND p.deleted_at IS NULL AND p.is_active = true) as out_of_stock_products,
        
        -- Reviews
        (SELECT COUNT(*) FROM reviews WHERE deleted_at IS NULL) as total_reviews,
        (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE deleted_at IS NULL) as average_rating
    `;

    return await db.queryOne(query);
  }

  /**
   * Search across multiple entities
   * @param {string} searchTerm
   * @param {array} entities - ['products', 'categories', 'users', 'orders']
   * @returns {Promise<object>}
   */
  async globalSearch(searchTerm, entities = ['products', 'categories']) {
    const results = {};
    const term = `%${searchTerm}%`;

    if (entities.includes('products')) {
      results.products = await db.queryMany(
        `SELECT id as product_id, product_name, sku, current_price
         FROM products
         WHERE (product_name ILIKE $1 OR sku ILIKE $1) AND deleted_at IS NULL
         LIMIT 10`,
        [term]
      );
    }

    if (entities.includes('categories')) {
      results.categories = await db.queryMany(
        `SELECT id as category_id, category_name
         FROM categories
         WHERE category_name::text ILIKE $1 AND deleted_at IS NULL
         LIMIT 10`,
        [term]
      );
    }

    if (entities.includes('users')) {
      results.users = await db.queryMany(
        `SELECT id as user_id, username, email, first_name, last_name
         FROM users
         WHERE (username ILIKE $1 OR email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
           AND deleted_at IS NULL
         LIMIT 10`,
        [term]
      );
    }

    if (entities.includes('orders')) {
      results.orders = await db.queryMany(
        `SELECT o.id as order_id, o.total_amount, o.current_status, u.username
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.id::text ILIKE $1
         LIMIT 10`,
        [term]
      );
    }

    return results;
  }

  /**
   * Get unique brands from products
   * @returns {Promise<array>}
   */
  async getBrands() {
    const query = `
      SELECT DISTINCT brand
      FROM products
      WHERE brand IS NOT NULL 
        AND brand != ''
        AND deleted_at IS NULL
      ORDER BY brand ASC
    `;

    const result = await db.queryMany(query);
    return result.map(row => ({ brand: row.brand, name: row.brand }));
  }
}

export default new MetadataService();
