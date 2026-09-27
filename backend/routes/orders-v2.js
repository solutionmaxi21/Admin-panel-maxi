import express from 'express';
import db from '../src/db/postgres.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import { getOrdersSchema, getOrderSchema, updateOrderStatusSchema } from '../src/shared/validation/index.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ForbiddenError, ValidationError, OutOfStockError, OrderNotCancellableError } from '../src/shared/errors/index.js';
import shippingCalculator from '../src/services/shipping-calculator-pg.js';
import guepexShipmentService from '../src/services/guepex-shipment.js';
import guepexPollingService from '../src/services/guepex-polling.js';
import NotificationService from '../src/services/NotificationService.js';
import crypto from 'crypto';

const router = express.Router();

// Helper: Extract numeric ID
const extractOrderId = (idParam) => {
  if (typeof idParam === 'string' && idParam.startsWith('ORD-')) {
    return parseInt(idParam.replace('ORD-', ''), 10);
  }
  return parseInt(idParam, 10);
};

const parseIdList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => parseInt(item, 10)).filter(Number.isFinite);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => parseInt(item.trim(), 10))
      .filter(Number.isFinite);
  }
  return [];
};

// Accept both legacy and canonical shipping address key formats.
const normalizeShippingAddress = (shippingAddress) => {
  if (!shippingAddress || typeof shippingAddress !== 'object') return shippingAddress;

  return {
    ...shippingAddress,
    address_line_1: shippingAddress.address_line_1 || shippingAddress.address_line1 || '',
    address_line_2: shippingAddress.address_line_2 || shippingAddress.address_line2 || null,
  };
};

const getEligiblePromotionProductIds = async (client, promotion, orderProductIds) => {
  const applicableTo = (promotion.applicable_to || 'ALL').toUpperCase();
  const uniqueOrderProductIds = [...new Set(orderProductIds.map((id) => parseInt(id, 10)).filter(Number.isFinite))];

  if (uniqueOrderProductIds.length === 0) return [];
  if (applicableTo === 'ALL' || applicableTo === 'USERS') return uniqueOrderProductIds;

  if (applicableTo === 'CATEGORIES') {
    const categoryIds = Array.isArray(promotion.applicable_categories) ? promotion.applicable_categories : [];
    if (categoryIds.length === 0) return [];
    const rows = await client.query(
      `
        SELECT id
        FROM products
        WHERE id = ANY($1::int[])
          AND category_id = ANY($2::int[])
      `,
      [uniqueOrderProductIds, categoryIds]
    );
    return rows.rows.map((row) => row.id);
  }

  if (applicableTo === 'PRODUCTS') {
    const productIds = parseIdList(promotion.applicable_products);
    if (productIds.length === 0) return [];
    const productIdSet = new Set(productIds);
    return uniqueOrderProductIds.filter((id) => productIdSet.has(id));
  }

  if (applicableTo === 'COLLECTIONS') {
    const collectionIds = parseIdList(promotion.applicable_collections);
    if (collectionIds.length === 0) return [];
    const rows = await client.query(
      `
        SELECT DISTINCT cp.product_id
        FROM collection_products cp
        JOIN collections c ON c.id = cp.collection_id
        WHERE cp.collection_id = ANY($1::int[])
          AND cp.product_id = ANY($2::int[])
          AND c.deleted_at IS NULL
          AND c.is_active = true
      `,
      [collectionIds, uniqueOrderProductIds]
    );
    return rows.rows.map((row) => row.product_id);
  }

  return uniqueOrderProductIds;
};

// Helper: Transform Order to standard format (PostgreSQL version)
const transformOrder = async (order) => {
  // Validate input
  if (!order || !order.id) {
    console.error('[transformOrder] Invalid order object:', order);
    throw new ValidationError('Invalid order data provided');
  }

  try {
    // Fetch related data with optimized query using subqueries to avoid Cartesian product
    // FIXED: Separated items and history into subqueries to prevent duplication
    const query = `
    SELECT 
      o.*,
      u.id as user_id,
      u.first_name,
      u.last_name,
      u.email,
      u.phone as user_phone,
      (
        SELECT json_agg(
          jsonb_build_object(
            'id', oi.id,
            'productId', oi.product_id,
            'variantId', oi.variant_id,
            'variantName', COALESCE(oi.variant_name_snapshot, pv.variant_name),
            'productName', COALESCE(oi.product_name_snapshot, p.product_name),
            'sku', COALESCE(pv.sku, p.sku),
            'skuSnapshot', oi.sku_snapshot,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'line_total', oi.line_total,
            'product_name_snapshot', oi.product_name_snapshot,
            'price', oi.unit_price,
            'subtotal', oi.line_total,
            'image', (
              SELECT pi.image_url 
              FROM product_images pi 
              WHERE pi.product_id = p.id 
              AND pi.image_type = 'primary' 
              ORDER BY pi.display_order ASC
              LIMIT 1
            )
          ) ORDER BY oi.id
        )
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN product_variants pv ON oi.variant_id = pv.id
        WHERE oi.order_id = o.id
      ) as items,
      (
        SELECT json_agg(
          jsonb_build_object(
            'status_history_id', oh.id,
            'status', oh.status,
            'payment_status', oh.payment_status,
            'notes', oh.notes,
            'changed_by_name', cu.username,
            'changed_by_email', cu.email,
            'changed_by_role', cu.role,
            'changed_at', oh.changed_at
          ) ORDER BY oh.changed_at DESC
        )
        FROM order_history oh
        LEFT JOIN users cu ON oh.changed_by = cu.id
        WHERE oh.order_id = o.id
      ) as history
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.id = $1
  `;

    const result = await db.queryOne(query, [order.id]);
    if (!result) {
      console.warn(`[transformOrder] Order ${order.id} not found in database`);
      return null;
    }

    // Parse shipping snapshot
    let parsedShippingAddress = null;
    if (result.shipping_snapshot) {
      try {
        parsedShippingAddress = typeof result.shipping_snapshot === 'string'
          ? JSON.parse(result.shipping_snapshot)
          : result.shipping_snapshot;
      } catch (e) {
        console.warn('Failed to parse shipping_snapshot:', e);
      }
    }

    const items = result.items || [];
    const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    return {
      id: result.id,

      // === FRONTEND COMPATIBILITY FIELDS ===
      order_id: result.id,
      total_amount: parseFloat(result.total_amount),
      shipping_cost: parseFloat(result.shipping_cost || 0),
      tax_amount: parseFloat(result.tax_amount || 0),
      discount_amount: parseFloat(result.discount_amount || 0),

      orderNumber: result.order_number,
      customer: result.user_id ? {
        id: result.user_id,
        name: `${result.first_name || ''} ${result.last_name || ''}`.trim(),
        email: result.email,
        phone: result.user_phone || result.customer_phone
      } : null,
      customerName: result.user_id ? `${result.first_name || ''} ${result.last_name || ''}`.trim() : 'Unknown Customer',
      customerEmail: result.email || '',
      customerPhone: result.customer_phone || result.user_phone || '',
      status: result.current_status,
      current_status: result.current_status,
      paymentStatus: result.payment_status,
      paymentMethod: result.payment_method || 'cod',

      // Admin Compatibility
      total: parseFloat(result.total_amount),
      subtotal: parseFloat(result.subtotal),
      tax: parseFloat(result.tax_amount || 0),
      shipping: parseFloat(result.shipping_cost || 0),
      discount: parseFloat(result.discount_amount || 0),
      itemCount: itemCount,
      items: items,

      // Shipping address
      shippingAddress: parsedShippingAddress ? {
        street: parsedShippingAddress.address_line_1,
        city: parsedShippingAddress.city,
        state: parsedShippingAddress.state,
        zipCode: parsedShippingAddress.postal_code,
        postalCode: parsedShippingAddress.postal_code,
        country: parsedShippingAddress.country || 'Algeria',
        fullAddress: `${parsedShippingAddress.address_line_1}, ${parsedShippingAddress.city}, ${parsedShippingAddress.state} ${parsedShippingAddress.postal_code || ''}`
      } : null,

      notes: result.customer_notes || result.delivery_notes,
      deliveryNotes: result.delivery_notes,

      // Phone confirmation fields (for Algerian COD workflow)
      warehouseId: result.warehouse_id,
      phone_confirmed_at: result.phone_confirmed_at || null,
      phone_confirmation_notes: result.phone_confirmation_notes || null,
      phone_confirmation_status: result.phone_confirmation_status || null,
      phone_confirmed_by: result.phone_confirmed_by || null,

      // Guepex delivery fields
      delivery_type: result.delivery_type || null,
      delivery_center_id: result.delivery_center_id || null,
      delivery_wilaya_id: result.delivery_wilaya_id || null,
      delivery_commune_id: result.delivery_commune_id || null,

      // Tracking fields (guepex_tracking_number removed, use tracking_number)
      tracking_number: result.tracking_number || null,
      guepex_tracking_number: result.tracking_number || null, // Legacy compatibility
      guepex_import_id: result.guepex_import_id || null,
      guepex_payment_id: result.guepex_payment_id || null,
      guepex_label_url: result.guepex_label_url || null,
      guepex_created_at: result.guepex_created_at || null,

      // Shipment status fields
      carrier: result.carrier || null,
      shipment_status: result.shipment_status || null,
      shipment_status_reason: result.shipment_status_reason || null,

      // Return flow fields
      is_returning: result.is_returning || false,
      return_initiated_at: result.return_initiated_at || null,
      returned_at: result.returned_at || null,
      inventory_restored: result.inventory_restored || false,
      delivery_attempts: result.delivery_attempts || 0,
      last_failure_reason: result.last_failure_reason || null,

      // Payment breakdown
      prepaid_amount: parseFloat(result.prepaid_amount || 0),
      cod_amount: parseFloat(result.cod_amount || 0),
      paid_amount: parseFloat(result.paid_amount || 0),
      paid_at: result.paid_at || null,

      // Delivery tracking
      delivered_at: result.delivered_at || null,

      // Shipping snapshot
      shipping_snapshot: parsedShippingAddress,

      // Payment fields
      payment_method: result.payment_method || 'cod',
      payment_status: result.payment_status || 'unpaid',

      // History for timeline
      history: result.history || [],

      // Date fields
      ordered_at: result.ordered_at,
      createdAt: result.ordered_at,
      updatedAt: result.updated_at || result.ordered_at,
      updated_at: result.updated_at || result.ordered_at,
      date: result.ordered_at,
    };
  } catch (error) {
    console.error('[transformOrder] Error transforming order:', error);
    console.error('[transformOrder] Order ID:', order?.id);
    throw error;
  }
};

// ==========================================
// Customer Routes (Authenticated)
// ==========================================

// POST create new order
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  console.log('='.repeat(100));
  console.log('[ORDER POST] ⚠️ STARTING ORDER CREATION ENDPOINT ⚠️');
  console.log('[ORDER POST] User ID:', req.user.userId);
  console.log('[ORDER POST] Timestamp:', new Date().toISOString());
  console.log('='.repeat(100));
  const userId = req.user.userId;
  const {
    items,
    shipping_address: rawShippingAddress,
    delivery_notes,
    promotion_code,
    delivery_commune_id,
    delivery_wilaya_id,
    delivery_type,
    delivery_center_id
  } = req.body;

  const shipping_address = normalizeShippingAddress(rawShippingAddress);

  if (items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  // Validate shipping address only for delivery (not pickup)
  if (delivery_type !== 'pickup') {
    if (!shipping_address || !shipping_address.address_line_1 || !shipping_address.city) {
      return res.status(400).json({ error: 'Shipping address is required for delivery' });
    }
  }

  // Extract phone number
  let customerPhone = null;
  if (delivery_notes) {
    const phoneMatch = delivery_notes.match(/Phone:\s*(\+?\d[\d\s\-()]+)/i);
    if (phoneMatch) {
      customerPhone = phoneMatch[1].trim();
    }
  }

  // Calculate shipping and determine warehouse
  let shippingEstimate = null;
  let selectedWarehouseId = 1; // Default to Algiers
  let calculatedShippingCost = 0;

  if (delivery_commune_id && items && items.length > 0) {
    try {
      // Get products for shipping calculation
      const productIds = items.map(i => i.product_id);
      const productsQuery = `
        SELECT id, product_name, current_price, sale_price, weight_kg, length_cm, width_cm, height_cm
        FROM products
        WHERE id = ANY($1)
      `;
      const products = await db.queryMany(productsQuery, [productIds]);

      const shippingItems = items.map(item => {
        const product = products.find(p => p.id === item.product_id);
        if (!product) return null;

        const unitPrice = (product.sale_price && parseFloat(product.sale_price) > 0) ? product.sale_price : product.current_price;
        return {
          price: parseFloat(unitPrice),
          quantity: item.quantity,
          weight: product.weight_kg || 1,
          length: product.length_cm || 30,
          width: product.width_cm || 20,
          height: product.height_cm || 10,
          hasInsurance: unitPrice > 50000
        };
      }).filter(Boolean);

      shippingEstimate = await shippingCalculator.calculateCartShipping({
        items: shippingItems,
        communeId: parseInt(delivery_commune_id),
        isStopDesk: delivery_type === 'stopdesk' || delivery_type === 'stop_desk'
      });

      calculatedShippingCost = shippingEstimate.totalShippingCost;

      const preferredWarehouseId = shippingEstimate.selectedWarehouse === 'algiers' ? 1 : 2;

      // Resolve variant IDs for stock checking
      const variantQuery = `
        SELECT pv.id AS variant_id, pv.product_id
        FROM product_variants pv
        WHERE pv.product_id = ANY($1) AND pv.is_default = true AND pv.deleted_at IS NULL
      `;
      const variantRows = await db.queryMany(variantQuery, [productIds]);

      // Check stock in preferred warehouse (variant-aware)
      const variantIds = variantRows.map(v => v.variant_id);
      const stockCheckQuery = `
        SELECT s.variant_id, s.product_id, s.quantity
        FROM stock s
        WHERE s.variant_id = ANY($1::int[]) AND s.warehouse_id = $2
      `;
      const preferredStock = await db.queryMany(stockCheckQuery, [variantIds, preferredWarehouseId]);

      let hasStockInPreferred = true;
      for (const item of items) {
        const variantRow = variantRows.find(v => v.product_id === item.product_id);
        const stock = variantRow ? preferredStock.find(s => s.variant_id === variantRow.variant_id) : null;
        if (!stock || stock.quantity < item.quantity) {
          hasStockInPreferred = false;
          break;
        }
      }

      // Try alternative warehouse if needed
      if (!hasStockInPreferred) {
        const alternativeWarehouseId = preferredWarehouseId === 1 ? 2 : 1;
        const alternativeWarehouseName = alternativeWarehouseId === 1 ? 'algiers' : 'harrouch';

        const alternativeStock = await db.queryMany(stockCheckQuery, [variantIds, alternativeWarehouseId]);

        let hasStockInAlternative = true;
        for (const item of items) {
          const variantRow = variantRows.find(v => v.product_id === item.product_id);
          const stock = variantRow ? alternativeStock.find(s => s.variant_id === variantRow.variant_id) : null;
          if (!stock || stock.quantity < item.quantity) {
            hasStockInAlternative = false;
            break;
          }
        }

        if (hasStockInAlternative) {
          selectedWarehouseId = alternativeWarehouseId;
          const altCost = shippingEstimate.alternativeOptions?.[alternativeWarehouseName]?.totalShippingCost;
          if (altCost !== undefined) {
            calculatedShippingCost = altCost;
          }
          console.log(`[Order Creation] Switched to alternative warehouse ${alternativeWarehouseId} due to stock availability.`);
        } else {
          // Neither warehouse has ALL items - choose warehouse with MORE available items
          console.log('[Order Creation] Neither warehouse has all items. Counting available items per warehouse...');

          // Count items available in each warehouse
          let preferredCount = 0;
          let alternativeCount = 0;

          for (const item of items) {
            const variantRow = variantRows.find(v => v.product_id === item.product_id);
            const prefStock = variantRow ? preferredStock.find(s => s.variant_id === variantRow.variant_id) : null;
            const altStock = variantRow ? alternativeStock.find(s => s.variant_id === variantRow.variant_id) : null;

            if (prefStock && prefStock.quantity >= item.quantity) {
              preferredCount++;
            }
            if (altStock && altStock.quantity >= item.quantity) {
              alternativeCount++;
            }
          }

          console.log(`[Order Creation] Preferred warehouse (${preferredWarehouseId}) has ${preferredCount}/${items.length} items available`);
          console.log(`[Order Creation] Alternative warehouse (${alternativeWarehouseId}) has ${alternativeCount}/${items.length} items available`);

          // Select warehouse with more items, or default to Algiers (warehouse 1) if tied
          if (alternativeCount > preferredCount) {
            selectedWarehouseId = alternativeWarehouseId;
            const altCost = shippingEstimate.alternativeOptions?.[alternativeWarehouseName]?.totalShippingCost;
            if (altCost !== undefined) {
              calculatedShippingCost = altCost;
            }
            console.log(`[Order Creation] Selected alternative warehouse ${alternativeWarehouseId} (has more items: ${alternativeCount} vs ${preferredCount})`);
          } else if (preferredCount > alternativeCount) {
            selectedWarehouseId = preferredWarehouseId;
            console.log(`[Order Creation] Selected preferred warehouse ${preferredWarehouseId} (has more items: ${preferredCount} vs ${alternativeCount})`);
          } else {
            // Tied or both have 0 - default to Algiers
            selectedWarehouseId = 1;
            if (selectedWarehouseId !== preferredWarehouseId) {
              const algiersCost = shippingEstimate.alternativeOptions?.['algiers']?.totalShippingCost;
              if (algiersCost !== undefined) {
                calculatedShippingCost = algiersCost;
              }
            }
            console.log(`[Order Creation] Tied or no stock in both - defaulting to Algiers (warehouse 1)`);
          }
        }
      } else {
        selectedWarehouseId = preferredWarehouseId;
      }
    } catch (shippingError) {
      console.error('[Order Creation] Shipping calculation error:', shippingError);
      calculatedShippingCost = 0;
      selectedWarehouseId = 1;
    }
  }

  // Use transaction for order creation
  const order = await db.transaction(async (client) => {
    // Get products with stock check (with lock)
    const productIds = items.map(i => i.product_id);
    const productsQuery = `
      SELECT p.id, p.product_name, pv.current_price, pv.sale_price, pv.sku,
             pv.id as default_variant_id, pv.variant_name
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true AND pv.deleted_at IS NULL
      WHERE p.id = ANY($1)
    `;
    const products = await client.query(productsQuery, [productIds]);

    let subtotal = 0;
    const orderItems = [];
    const itemsNeedingTransfer = []; // Track items sourced from alternative warehouse

    for (const item of items) {
      const product = products.rows.find(p => p.id === item.product_id);
      if (!product) {
        throw new ValidationError(`Product ${item.product_id} not found`);
      }

      // Check and lock stock in selected warehouse
      const stockQuery = `
        SELECT quantity, reserved_quantity, (quantity - reserved_quantity) as available_quantity
        FROM stock 
        WHERE variant_id = $1 AND warehouse_id = $2
        FOR UPDATE
      `;
      const stockResult = await client.query(stockQuery, [product.default_variant_id, selectedWarehouseId]);

      let sourceWarehouseId = selectedWarehouseId;
      let needsTransfer = false;
      let lockedStock = null; // Store the locked stock quantity

      const availableInSelected = stockResult.rows[0] ? stockResult.rows[0].available_quantity : 0;
      console.log(`[Order Creation] Processing product ${item.product_id}, qty: ${item.quantity}, selected warehouse: ${selectedWarehouseId}, stock in selected: ${stockResult.rows[0] ? stockResult.rows[0].quantity : 0}, reserved: ${stockResult.rows[0] ? stockResult.rows[0].reserved_quantity : 0}, available: ${availableInSelected}`);

      // If not available in selected warehouse, try alternative
      if (!stockResult.rows[0] || availableInSelected < item.quantity) {
        const alternativeWarehouseId = selectedWarehouseId === 1 ? 2 : 1;
        const alternativeStockResult = await client.query(stockQuery, [product.default_variant_id, alternativeWarehouseId]);

        const availableInAlt = alternativeStockResult.rows[0] ? alternativeStockResult.rows[0].available_quantity : 0;
        console.log(`[Order Creation] Checking alternative warehouse ${alternativeWarehouseId}, stock available: ${alternativeStockResult.rows[0] ? alternativeStockResult.rows[0].quantity : 0}, reserved: ${alternativeStockResult.rows[0] ? alternativeStockResult.rows[0].reserved_quantity : 0}, available: ${availableInAlt}`);

        if (alternativeStockResult.rows[0] && availableInAlt >= item.quantity) {
          // Item available in alternative warehouse - source from there
          sourceWarehouseId = alternativeWarehouseId;
          needsTransfer = true;
          lockedStock = alternativeStockResult.rows[0]; // Store locked stock
          const altWarehouseName = alternativeWarehouseId === 1 ? 'Alger' : 'Harrouch';
          const selWarehouseName = selectedWarehouseId === 1 ? 'Alger' : 'Harrouch';
          console.log(`[Order Creation] Product ${product.product_name} not available in ${selWarehouseName}, sourcing ${item.quantity} units from ${altWarehouseName} (has ${availableInAlt} available)`);

          itemsNeedingTransfer.push({
            product_name: product.product_name,
            quantity: item.quantity,
            from_warehouse: altWarehouseName,
            to_warehouse: selWarehouseName
          });
        } else {
          // Not available in either warehouse
          const warehouseName = selectedWarehouseId === 1 ? 'Alger' : 'Harrouch';
          const availableQty = availableInSelected;
          const altAvailableQty = availableInAlt;

          // Get total stock info for better error message
          const totalInSelected = stockResult.rows[0] ? stockResult.rows[0].quantity : 0;
          const reservedInSelected = stockResult.rows[0] ? stockResult.rows[0].reserved_quantity : 0;
          const totalInAlt = alternativeStockResult.rows[0] ? alternativeStockResult.rows[0].quantity : 0;
          const reservedInAlt = alternativeStockResult.rows[0] ? alternativeStockResult.rows[0].reserved_quantity : 0;

          // Build detailed error message
          let errorMsg = `Product ${product.product_name} is currently unavailable. `;

          if (totalInSelected > 0 || totalInAlt > 0) {
            errorMsg += 'Stock exists but is reserved for other orders. ';
            const stockDetails = [];
            if (totalInSelected > 0) {
              stockDetails.push(`Alger: ${totalInSelected} total (${reservedInSelected} reserved, ${availableQty} available)`);
            }
            if (totalInAlt > 0) {
              const altWarehouseName = selectedWarehouseId === 1 ? 'Harrouch' : 'Alger';
              stockDetails.push(`${altWarehouseName}: ${totalInAlt} total (${reservedInAlt} reserved, ${altAvailableQty} available)`);
            }
            errorMsg += stockDetails.join('; ');
          } else {
            errorMsg += 'Out of stock in all warehouses.';
          }

          throw new ValidationError(errorMsg);
        }
      } else {
        // Stock available in selected warehouse
        lockedStock = stockResult.rows[0];
      }

      const unitPrice = (product.sale_price && parseFloat(product.sale_price) > 0) ? product.sale_price : product.current_price;
      const lineTotal = parseFloat(unitPrice) * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id || product.default_variant_id,
        variant_name_snapshot: product.variant_name || 'Default',
        sku_snapshot: product.sku,
        product_name_snapshot: product.product_name,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        warehouse_id: sourceWarehouseId,
        needs_transfer: needsTransfer,
        locked_quantity: lockedStock ? lockedStock.available_quantity : 0 // Store available quantity for deduction
      });
    }

    // Calculate totals
    const shippingCost = calculatedShippingCost > 0 ? calculatedShippingCost : (subtotal >= 50000 ? 0 : 2000);
    let discountAmount = 0;
    let promotionId = null;

    if (promotion_code) {
      const promoQuery = `
        SELECT id, discount_type, discount_value, current_uses, max_uses, start_date, end_date, applicable_to, applicable_categories, applicable_products, applicable_collections
        FROM promotions
        WHERE LOWER(promotion_code) = LOWER($1) AND deleted_at IS NULL
      `;
      const promo = await client.query(promoQuery, [promotion_code]);

      if (promo.rows[0]) {
        const promotion = promo.rows[0];
        const now = new Date();
        const startDate = promotion.start_date ? new Date(promotion.start_date) : null;
        const endDate = promotion.end_date ? new Date(promotion.end_date) : null;
        const isInDateRange = (!startDate || startDate <= now) && (!endDate || endDate >= now);
        const canUse = !promotion.max_uses || promotion.current_uses < promotion.max_uses;

        if (isInDateRange && canUse) {
          const eligibleProductIds = await getEligiblePromotionProductIds(
            client,
            promotion,
            orderItems.map((item) => item.product_id)
          );
          const eligibleIdSet = new Set(eligibleProductIds);
          const eligibleSubtotal = orderItems
            .filter((item) => eligibleIdSet.has(item.product_id))
            .reduce((sum, item) => sum + parseFloat(item.line_total || 0), 0);

          if (promotion.discount_type === 'percentage') {
            discountAmount = Math.round((eligibleSubtotal * promotion.discount_value) / 100);
          } else if (promotion.discount_type === 'fixed') {
            discountAmount = Math.min(parseFloat(promotion.discount_value || 0), eligibleSubtotal);
          }

          if (discountAmount > 0) {
            await client.query(
              'UPDATE promotions SET current_uses = current_uses + 1 WHERE id = $1',
              [promotion.id]
            );
            promotionId = promotion.id;
          }
        }
      }
    }

    const totalAmount = subtotal - discountAmount + shippingCost;
    const needsPhoneConfirmation = req.body.payment_method === 'cod' || !req.body.payment_method;

    // Create order
    const orderQuery = `
      INSERT INTO orders (
        user_id, order_number, subtotal, tax_amount, shipping_cost, 
        discount_amount, total_amount, current_status, payment_status, 
        payment_method, promotion_id, shipping_snapshot, delivery_notes,
        warehouse_id, ordered_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
      )
      RETURNING *
    `;

    const orderNumber = `ORD-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const shippingDetails = shippingEstimate ? JSON.stringify({
      selectedWarehouse: shippingEstimate.selectedWarehouse,
      warehouseWilayaId: shippingEstimate.warehouseWilayaId,
      baseFee: shippingEstimate.baseFee,
      codFee: shippingEstimate.codFee,
      insuranceFee: shippingEstimate.insuranceFee,
      deliveryTime: shippingEstimate.deliveryTime,
      isLocal: shippingEstimate.isLocal
    }) : null;

    const orderResult = await client.query(orderQuery, [
      userId,
      orderNumber,
      subtotal,
      0, // tax_amount
      shippingCost,
      discountAmount,
      totalAmount,
      'awaiting_confirmation',
      'unpaid',
      req.body.payment_method || 'cod',
      promotionId,
      JSON.stringify(shipping_address),
      delivery_notes || '',
      selectedWarehouseId
    ]);

    const newOrder = orderResult.rows[0];

    // Insert order items and update stock
    for (const item of orderItems) {
      await client.query(`
        INSERT INTO order_items (
          order_id, product_id, variant_id, variant_name_snapshot, sku_snapshot,
          product_name_snapshot, quantity, 
          unit_price, line_total, warehouse_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        newOrder.id,
        item.product_id,
        item.variant_id,
        item.variant_name_snapshot,
        item.sku_snapshot,
        item.product_name_snapshot,
        item.quantity,
        item.unit_price,
        item.line_total,
        item.warehouse_id
      ]);

      // Deduct stock from the actual source warehouse (item.warehouse_id)
      // Use the locked quantity we already retrieved with FOR UPDATE
      console.log(`[Stock Update] Attempting to deduct ${item.quantity} units of product ${item.product_id} from warehouse ${item.warehouse_id}. Locked quantity: ${item.locked_quantity}`);

      if (!item.locked_quantity || item.locked_quantity < item.quantity) {
        const errorMsg = `Stock deduction failed for product ${item.product_id}. Locked: ${item.locked_quantity || 0}, Requested: ${item.quantity}, Warehouse: ${item.warehouse_id}`;
        console.error(`[Stock Update] ERROR: ${errorMsg}`);
        throw new ValidationError(errorMsg);
      }

      // Final safety check: verify the UPDATE won't violate constraints
      if (item.locked_quantity < item.quantity) {
        throw new ValidationError(
          `Cannot deduct ${item.quantity} units when only ${item.locked_quantity} available`
        );
      }

      await client.query(`
        UPDATE stock
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE variant_id = $2 AND warehouse_id = $3 AND quantity >= $1
      `, [item.quantity, item.variant_id, item.warehouse_id]);

      console.log(`[Stock Update] Successfully deducted ${item.quantity} units of product ${item.product_id} from warehouse ${item.warehouse_id}`);
    }

    // Save address to addresses table
    if (shipping_address) {
      const addressQuery = `
        INSERT INTO addresses (
          user_id, first_name, last_name, address_line_1, address_line_2, 
          city, state_province, postal_code, country, phone, is_default, 
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `;

      const firstName = shipping_address.first_name || req.body.first_name || '';
      const lastName = shipping_address.last_name || req.body.last_name || '';
      const phone = customerPhone || shipping_address.phone || req.body.phone || '';

      await client.query(addressQuery, [
        userId,
        firstName,
        lastName,
        shipping_address.address_line_1 || '',
        shipping_address.address_line_2 || null,
        shipping_address.city || '',
        shipping_address.state || shipping_address.state_province || '',
        shipping_address.postal_code || null,
        shipping_address.country || 'Algeria',
        phone,
        false // is_default: false (user can set it manually if desired)
      ]);
    }

    // Update user's phone number if provided
    if (customerPhone || req.body.phone) {
      const userPhone = customerPhone || req.body.phone;
      await client.query(`
        UPDATE users
        SET phone = $1, updated_at = NOW()
        WHERE id = $2
      `, [userPhone, userId]);
    }

    // Create order history entry
    const warehouseName = selectedWarehouseId === 1 ? 'Entrepôt Alger' : 'Dépôt Harrouch';
    await client.query(`
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [
      newOrder.id,
      'awaiting_confirmation',
      `Order placed - Awaiting confirmation - Fulfillment from ${warehouseName} (Warehouse ID: ${selectedWarehouseId})`,
      userId
    ]);

    return { order: newOrder, itemsNeedingTransfer };
  });

  // Notify admins about new order
  console.log('\n' + '█'.repeat(100));
  console.log('█ NOTIFICATION BLOCK REACHED');
  console.log('█'.repeat(100));
  try {
    console.log('[Notification] =====================================');
    console.log('[Notification] Starting notification process for order:', order.order.id, order.order.order_number);
    console.log('[Notification] Order object keys:', Object.keys(order.order));
    console.log('[Notification] Order object:', JSON.stringify(order.order, null, 2).substring(0, 500));

    const customerName = shipping_address?.first_name
      ? `${shipping_address.first_name} ${shipping_address.last_name || ''}`.trim()
      : 'A customer';

    console.log('[Notification] Customer name:', customerName);
    console.log('[Notification] Order data:', { id: order.order.id, order_number: order.order.order_number, total_amount: order.order.total_amount });

    // Convert total_amount to number (PostgreSQL returns it as string)
    const totalAmount = parseFloat(order.order.total_amount) || 0;

    const notificationData = {
      type: 'NEW_ORDER',
      title: 'New Order Received / طلب جديد',
      message: `${customerName} placed order #${order.order.order_number} for ${totalAmount.toFixed(2)} DZD. Awaiting confirmation.`,
      actionUrl: `/orders/${order.order.id}`,
      relatedEntityType: 'order',
      relatedEntityId: order.order.id
    };
    console.log('[Notification] Notification data:', notificationData);

    const notifyResult = await NotificationService.notifyAdmins(notificationData);
    console.log(`[Notification] ✅ Notified admins about new order ${order.order.order_number}. Result:`, notifyResult.rowCount, 'rows affected');

    // Notify Customer
    const customerNotificationData = {
      type: 'ORDER_PLACED',
      title: 'Order Received / تم استلام طلبك',
      message: `Thank you for your order #${order.order.order_number}! We've received it and will process it shortly.`,
      actionUrl: `/orders/${order.order.id}`,
      relatedEntityType: 'order',
      relatedEntityId: order.order.id
    };

    await NotificationService.create({
      userId: order.order.user_id,
      ...customerNotificationData
    }).catch(err => console.error('[Notification] ❌ Failed to notify customer about new order:', err.message));

    console.log('[Notification] =====================================');
  } catch (notifError) {
    console.error('[Notification] =====================================');
    console.error('[Notification] ❌ CRITICAL ERROR Failed to notify admins about new order!');
    console.error('[Notification] Error message:', notifError.message);
    console.error('[Notification] Error stack:', notifError.stack);
    console.error('[Notification] Error full:', notifError);
    console.error('[Notification] =====================================');
    // Don't fail the order creation if notification fails
  }

  // Transform and return the order with transfer warning if needed
  const transformedOrder = await transformOrder(order.order);

  const response = {
    success: true,
    data: transformedOrder,
    warning: order.itemsNeedingTransfer.length > 0 ? {
      message: 'Multi-warehouse fulfillment',
      details: `${order.itemsNeedingTransfer.length} item(s) in your order will be sourced from a different warehouse and require transfer. Your estimated delivery time may be extended by 1-2 business days.`,
      affected_items: order.itemsNeedingTransfer.map(item => ({
        product: item.product_name,
        quantity: item.quantity,
        transfer_route: `${item.from_warehouse} → ${item.to_warehouse}`,
        estimated_delay: '1-2 business days'
      })),
      severity: 'info'
    } : null
  };

  res.status(201).json(response);
}));

// GET /my orders (Customer)
router.get('/my', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const ordersQuery = `
    SELECT * FROM orders
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY ordered_at DESC
  `;
  const orders = await db.queryMany(ordersQuery, [userId]);

  if (!orders || orders.length === 0) {
    return res.json({ success: true, orders: [] });
  }

  const transformedOrders = await Promise.all(
    orders.map(o => transformOrder(o)).filter(o => o !== null)
  );

  res.json({ success: true, orders: transformedOrders });
}));

// GET orders needing phone confirmation (Admin)
router.get('/needs-confirmation', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const query = `
    SELECT * FROM orders
    WHERE current_status = 'awaiting_confirmation'
    AND deleted_at IS NULL
    ORDER BY ordered_at DESC
  `;
  const orders = await db.queryMany(query);

  const transformedOrders = await Promise.all(
    orders.map(o => transformOrder(o))
  );

  res.json({
    success: true,
    data: transformedOrders,
    total: transformedOrders.length
  });
}));

// GET /:id (Smart Endpoint: Admin OR Owner)
router.get('/:id', authenticateToken, validate(getOrderSchema), asyncHandler(async (req, res) => {
  const orderId = extractOrderId(req.params.id);

  if (!orderId || isNaN(orderId)) {
    throw new ValidationError('Invalid order ID');
  }

  const query = `
    SELECT * FROM orders
    WHERE id = $1 AND deleted_at IS NULL
  `;
  const order = await db.queryOne(query, [orderId]);

  if (!order) {
    throw new NotFoundError(`Order with ID ${orderId} not found`);
  }

  if (req.user.role !== 'admin' && order.user_id !== req.user.userId) {
    throw new ForbiddenError('You do not have permission to view this order');
  }

  const transformedOrder = await transformOrder(order);
  if (!transformedOrder) {
    throw new Error('Failed to transform order data');
  }

  res.json({ success: true, data: transformedOrder });
}));

// PUT cancel order (Customer)
router.put('/my/:id/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const orderId = extractOrderId(req.params.id);

  await db.transaction(async (client) => {
    const orderQuery = `
      SELECT * FROM orders
      WHERE id = $1 AND deleted_at IS NULL
      FOR UPDATE
    `;
    const orderResult = await client.query(orderQuery, [orderId]);

    if (orderResult.rows.length === 0) {
      throw new NotFoundError('Order not found');
    }

    const order = orderResult.rows[0];

    if (order.user_id !== userId) {
      throw new ForbiddenError('Access denied');
    }

    if (!['pending', 'awaiting_confirmation'].includes(order.current_status)) {
      throw new OrderNotCancellableError(order.current_status, order.order_number);
    }

    // Update order status
    await client.query(`
      UPDATE orders
      SET current_status = 'cancelled', updated_at = NOW()
      WHERE id = $1
    `, [orderId]);

    // Restore stock
    const itemsQuery = `
      SELECT product_id, variant_id, quantity, warehouse_id
      FROM order_items
      WHERE order_id = $1
    `;
    const items = await client.query(itemsQuery, [orderId]);

    for (const item of items.rows) {
      const warehouseId = item.warehouse_id || order.warehouse_id || 1;
      const updateResult = await client.query(`
        UPDATE stock
        SET quantity = quantity + $1, updated_at = NOW()
        WHERE variant_id = $2 AND warehouse_id = $3
        RETURNING quantity
      `, [item.quantity, item.variant_id, warehouseId]);

      if (updateResult.rows.length === 0) {
        console.error(`[Stock Restore] Failed to restore stock for variant ${item.variant_id} in warehouse ${warehouseId}`);
        // Create stock entry if it doesn't exist
        await client.query(`
          INSERT INTO stock (product_id, variant_id, warehouse_id, quantity, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (variant_id, warehouse_id) DO UPDATE
          SET quantity = stock.quantity + $4, updated_at = NOW()
        `, [item.product_id, item.variant_id, warehouseId, item.quantity]);
      }

      console.log(`[Stock Restore] Returned ${item.quantity} units of variant ${item.variant_id} to warehouse ${warehouseId}`);
    }

    // Add history entry
    await client.query(`
      INSERT INTO order_history (order_id, status, notes, changed_at)
      VALUES ($1, $2, $3, NOW())
    `, [orderId, 'cancelled', 'Order cancelled by customer']);
  });

  res.json({ success: true, message: 'Order cancelled' });
}));

// ==========================================
// Admin Routes
// ==========================================

// POST create manual order (Admin)
router.post('/manual', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const adminId = req.user.userId;
  const {
    customer_id, // Target customer
    items,
    shipping_address: rawShippingAddress,
    delivery_notes,
    promotion_code,
    delivery_commune_id,
    delivery_type,
    force_stock_override // Optional: allow overbooking stock if needed in future
  } = req.body;

  const shipping_address = normalizeShippingAddress(rawShippingAddress);

  if (!customer_id) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  // Verify customer exists
  const customerCheck = await db.queryOne('SELECT id, email, phone FROM users WHERE id = $1', [customer_id]);
  if (!customerCheck) {
    throw new NotFoundError(`Customer with ID ${customer_id} not found`);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  const isPickup = delivery_type === 'pickup';

  if (!isPickup && (!shipping_address || !shipping_address.address_line_1 || !shipping_address.city)) {
    return res.status(400).json({ error: 'Shipping address is required' });
  }

  // Extract phone number from notes or customer profile or address
  let customerPhone = customerCheck.phone;
  if (delivery_notes) {
    const phoneMatch = delivery_notes.match(/Phone:\s*(\+?\d[\d\s\-()]+)/i);
    if (phoneMatch) {
      customerPhone = phoneMatch[1].trim();
    }
  }
  if (!customerPhone && shipping_address.phone) {
    customerPhone = shipping_address.phone;
  }

  // Calculate shipping and determine warehouse
  let shippingEstimate = null;
  let selectedWarehouseId = 1; // Default to Algiers
  let calculatedShippingCost = 0;
  let finalShippingSnapshot = shipping_address;

  // Handle Pickup Logic explicitly
  if (isPickup) {
    calculatedShippingCost = 0;
    // Trust the ID sent from frontend (1 = Alger, 2 = Harrouch)
    if (req.body.pickup_warehouse_id) {
      selectedWarehouseId = parseInt(req.body.pickup_warehouse_id);
    }

    // Create a dummy snapshot so the database doesn't complain about null JSON
    // and frontend shows "Store Pickup"
    finalShippingSnapshot = {
      first_name: 'Store',
      last_name: 'Pickup',
      address_line_1: selectedWarehouseId === 2 ? 'Dépôt Harrouch' : 'Entrepôt Alger',
      city: selectedWarehouseId === 2 ? 'Harrouch' : 'Alger',
      country: 'Algeria',
      phone: customerPhone || 'N/A', // ensure phone is preserved if available
      delivery_type: 'pickup' // marker for frontend
    };
  }
  else if (delivery_commune_id && items && items.length > 0) {
    // ... existing shipping calculation logic ...
    try {
      // Get products for shipping calculation
      const productIds = items.map(i => i.product_id);
      const productsQuery = `
        SELECT id, product_name, current_price, sale_price, weight_kg, length_cm, width_cm, height_cm
        FROM products
        WHERE id = ANY($1)
      `;
      const products = await db.queryMany(productsQuery, [productIds]);

      const shippingItems = items.map(item => {
        const product = products.find(p => p.id === item.product_id);
        if (!product) return null;

        const unitPrice = (product.sale_price && parseFloat(product.sale_price) > 0) ? product.sale_price : product.current_price;
        return {
          price: parseFloat(unitPrice),
          quantity: item.quantity,
          weight: product.weight_kg || 1,
          length: product.length_cm || 30,
          width: product.width_cm || 20,
          height: product.height_cm || 10,
          hasInsurance: unitPrice > 50000
        };
      }).filter(Boolean);

      // NOTE: This logic duplicates the main orders router.post('/') logic. 
      // Ensure any fixes flow to both places or refactor to shared service.

      shippingEstimate = await shippingCalculator.calculateCartShipping({
        items: shippingItems,
        communeId: parseInt(delivery_commune_id),
        isStopDesk: delivery_type === 'stopdesk' || delivery_type === 'stop_desk'
      });

      calculatedShippingCost = shippingEstimate.totalShippingCost;

      const preferredWarehouseId = shippingEstimate.selectedWarehouse === 'algiers' ? 1 : 2;

      // Resolve variant IDs for stock checking
      const manualVariantQuery = `
        SELECT pv.id AS variant_id, pv.product_id
        FROM product_variants pv
        WHERE pv.product_id = ANY($1) AND pv.is_default = true AND pv.deleted_at IS NULL
      `;
      const manualVariantRows = await db.queryMany(manualVariantQuery, [productIds]);

      // Check stock in preferred warehouse (variant-aware)
      const manualVariantIds = manualVariantRows.map(v => v.variant_id);
      const stockCheckQuery = `
        SELECT s.variant_id, s.product_id, s.quantity
        FROM stock s
        WHERE s.variant_id = ANY($1::int[]) AND s.warehouse_id = $2
      `;
      const preferredStock = await db.queryMany(stockCheckQuery, [manualVariantIds, preferredWarehouseId]);

      let hasStockInPreferred = true;
      for (const item of items) {
        const variantRow = manualVariantRows.find(v => v.product_id === item.product_id);
        const stock = variantRow ? preferredStock.find(s => s.variant_id === variantRow.variant_id) : null;
        if (!stock || stock.quantity < item.quantity) {
          hasStockInPreferred = false;
          break;
        }
      }

      // Try alternative warehouse if needed
      if (!hasStockInPreferred) {
        console.log(`[Manual Order] Stock not found in preferred warehouse ${preferredWarehouseId}. Checking alternative...`);
        const alternativeWarehouseId = preferredWarehouseId === 1 ? 2 : 1;
        const alternativeWarehouseName = alternativeWarehouseId === 1 ? 'algiers' : 'harrouch';

        const alternativeStock = await db.queryMany(stockCheckQuery, [manualVariantIds, alternativeWarehouseId]);

        let hasStockInAlternative = true;
        for (const item of items) {
          const variantRow = manualVariantRows.find(v => v.product_id === item.product_id);
          const stock = variantRow ? alternativeStock.find(s => s.variant_id === variantRow.variant_id) : null;
          if (!stock || stock.quantity < item.quantity) {
            hasStockInAlternative = false;
            console.log(`[Manual Order] Item ${item.product_id} missing in alternative warehouse ${alternativeWarehouseId}`);
            break;
          }
        }

        if (hasStockInAlternative) {
          selectedWarehouseId = alternativeWarehouseId;
          // Use calculated cost if available, otherwise keep original or recalculate
          const altCost = shippingEstimate.alternativeOptions?.[alternativeWarehouseName]?.totalShippingCost;
          if (altCost !== undefined) {
            calculatedShippingCost = altCost;
          } else {
            console.log('[Manual Order] Alternative shipping cost not available, using default logic.');
            // Fallback: recalculate or just keep base logic (will serve as "available but maybe shipping diff")
          }
          console.log(`[Manual Order] Switched to alternative warehouse ${alternativeWarehouseId} due to stock availability.`);
        } else {
          // Neither warehouse has ALL items - choose warehouse with MORE available items
          console.log('[Manual Order] Neither warehouse has all items. Counting available items per warehouse...');

          // Count items available in each warehouse
          let preferredCount = 0;
          let alternativeCount = 0;

          for (const item of items) {
            const variantRow = manualVariantRows.find(v => v.product_id === item.product_id);
            const prefStock = variantRow ? preferredStock.find(s => s.variant_id === variantRow.variant_id) : null;
            const altStock = variantRow ? alternativeStock.find(s => s.variant_id === variantRow.variant_id) : null;

            if (prefStock && prefStock.quantity >= item.quantity) {
              preferredCount++;
            }
            if (altStock && altStock.quantity >= item.quantity) {
              alternativeCount++;
            }
          }

          console.log(`[Manual Order] Preferred warehouse (${preferredWarehouseId}) has ${preferredCount}/${items.length} items available`);
          console.log(`[Manual Order] Alternative warehouse (${alternativeWarehouseId}) has ${alternativeCount}/${items.length} items available`);

          // Select warehouse with more items, or default to Algiers (warehouse 1) if tied
          if (alternativeCount > preferredCount) {
            selectedWarehouseId = alternativeWarehouseId;
            const altCost = shippingEstimate.alternativeOptions?.[alternativeWarehouseName]?.totalShippingCost;
            if (altCost !== undefined) {
              calculatedShippingCost = altCost;
            } else {
              console.log('[Manual Order] Alternative shipping cost not available, using default logic.');
            }
            console.log(`[Manual Order] Selected alternative warehouse ${alternativeWarehouseId} (has more items: ${alternativeCount} vs ${preferredCount})`);
          } else if (preferredCount > alternativeCount) {
            selectedWarehouseId = preferredWarehouseId;
            console.log(`[Manual Order] Selected preferred warehouse ${preferredWarehouseId} (has more items: ${preferredCount} vs ${alternativeCount})`);
          } else {
            // Tied or both have 0 - default to Algiers
            selectedWarehouseId = 1;
            if (selectedWarehouseId !== preferredWarehouseId) {
              const algiersCost = shippingEstimate.alternativeOptions?.['algiers']?.totalShippingCost;
              if (algiersCost !== undefined) {
                calculatedShippingCost = algiersCost;
              } else {
                console.log('[Manual Order] Algiers shipping cost not available, using default logic.');
              }
            }
            console.log(`[Manual Order] Tied or no stock in both - defaulting to Algiers (warehouse 1)`);
          }
        }
      } else {
        selectedWarehouseId = preferredWarehouseId;
      }
    } catch (shippingError) {
      console.error('[Manual Order] Shipping calculation error:', shippingError);
      calculatedShippingCost = 0;
      selectedWarehouseId = 1;
    }
  }

  // Use transaction for order creation
  const order = await db.transaction(async (client) => {
    // Get products with stock check (with lock)
    const productIds = items.map(i => i.product_id);
    const productsQuery = `
      SELECT p.id, p.product_name, pv.current_price, pv.sale_price, pv.sku,
             pv.id as default_variant_id, pv.variant_name
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true AND pv.deleted_at IS NULL
      WHERE p.id = ANY($1)
    `;
    const products = await client.query(productsQuery, [productIds]);

    let subtotal = 0;
    const orderItems = [];
    const itemsNeedingTransfer = []; // Track items sourced from alternative warehouse

    for (const item of items) {
      const product = products.rows.find(p => p.id === item.product_id);
      if (!product) {
        throw new ValidationError(`Product ${item.product_id} not found`);
      }

      // Check and lock stock in selected warehouse
      const stockQuery = `
        SELECT quantity, reserved_quantity, (quantity - reserved_quantity) as available_quantity
        FROM stock 
        WHERE variant_id = $1 AND warehouse_id = $2
        FOR UPDATE
      `;
      const stockResult = await client.query(stockQuery, [product.default_variant_id, selectedWarehouseId]);

      let sourceWarehouseId = selectedWarehouseId;
      let needsTransfer = false;
      let lockedStock = null;

      const availableInSelected = stockResult.rows[0] ? stockResult.rows[0].available_quantity : 0;

      // If not available in selected warehouse, try alternative (unless force_stock_override is set)
      if (!force_stock_override && (!stockResult.rows[0] || availableInSelected < item.quantity)) {
        const alternativeWarehouseId = selectedWarehouseId === 1 ? 2 : 1;
        const alternativeStockResult = await client.query(stockQuery, [product.default_variant_id, alternativeWarehouseId]);

        if (alternativeStockResult.rows[0] && alternativeStockResult.rows[0].quantity >= item.quantity) {
          // Item available in alternative warehouse - source from there
          sourceWarehouseId = alternativeWarehouseId;
          needsTransfer = true;
          const altWarehouseName = alternativeWarehouseId === 1 ? 'Alger' : 'Harrouch';
          const selWarehouseName = selectedWarehouseId === 1 ? 'Alger' : 'Harrouch';
          console.log(`[Manual Order] Product ${product.product_name} not available in ${selWarehouseName}, sourcing from ${altWarehouseName}`);

          itemsNeedingTransfer.push({
            product_name: product.product_name,
            quantity: item.quantity,
            from_warehouse: altWarehouseName,
            to_warehouse: selWarehouseName
          });
        } else {
          // Not available in either warehouse - build detailed error message
          const totalInSelected = stockResult.rows[0] ? stockResult.rows[0].quantity : 0;
          const reservedInSelected = stockResult.rows[0] ? stockResult.rows[0].reserved_quantity : 0;
          const totalInAlt = alternativeStockResult.rows[0] ? alternativeStockResult.rows[0].quantity : 0;
          const reservedInAlt = alternativeStockResult.rows[0] ? alternativeStockResult.rows[0].reserved_quantity : 0;

          let errorMsg = `Product ${product.product_name} is currently unavailable. `;

          if (totalInSelected > 0 || totalInAlt > 0) {
            errorMsg += 'Stock exists but is reserved for other orders. ';
            const stockDetails = [];
            if (totalInSelected > 0) {
              stockDetails.push(`Alger: ${totalInSelected} total (${reservedInSelected} reserved, ${availableInSelected} available)`);
            }
            if (totalInAlt > 0) {
              const altWarehouseName = selectedWarehouseId === 1 ? 'Harrouch' : 'Alger';
              stockDetails.push(`${altWarehouseName}: ${totalInAlt} total (${reservedInAlt} reserved, ${availableInAlt} available)`);
            }
            errorMsg += stockDetails.join('; ');
          } else {
            errorMsg += 'Out of stock in all warehouses.';
          }

          throw new ValidationError(errorMsg);
        }
      } else if (force_stock_override) {
        // Admin override - allow order even if no stock
        console.log(`[Manual Order] Stock override enabled - allowing order for ${product.product_name} despite stock levels`);
      } else {
        // Stock available in selected warehouse
        lockedStock = stockResult.rows[0];
      }

      const unitPrice = (product.sale_price && parseFloat(product.sale_price) > 0) ? product.sale_price : product.current_price;
      const lineTotal = parseFloat(unitPrice) * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id || product.default_variant_id,
        variant_name_snapshot: product.variant_name || 'Default',
        sku_snapshot: product.sku,
        product_name_snapshot: product.product_name,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        warehouse_id: sourceWarehouseId,
        needs_transfer: needsTransfer,
        locked_quantity: lockedStock ? lockedStock.available_quantity : 0
      });
    }

    // Calculate totals
    // If pickup, cost is 0. If delivery, use calculated OR default to simple logic if calculator failed/wasn't used (items > 50000 = free)
    let shippingCost = isPickup ? 0 : (calculatedShippingCost > 0 ? calculatedShippingCost : (subtotal >= 50000 ? 0 : 500));

    let discountAmount = 0;
    let promotionId = null;

    if (promotion_code) {
      const promoQuery = `
        SELECT id, discount_type, discount_value, current_uses, max_uses, start_date, end_date, applicable_to, applicable_categories, applicable_products, applicable_collections
        FROM promotions
        WHERE LOWER(promotion_code) = LOWER($1) AND deleted_at IS NULL
      `;
      const promo = await client.query(promoQuery, [promotion_code]);

      if (promo.rows[0]) {
        const promotion = promo.rows[0];
        const now = new Date();
        const startDate = promotion.start_date ? new Date(promotion.start_date) : null;
        const endDate = promotion.end_date ? new Date(promotion.end_date) : null;
        const isInDateRange = (!startDate || startDate <= now) && (!endDate || endDate >= now);
        const canUse = !promotion.max_uses || promotion.current_uses < promotion.max_uses;

        if (isInDateRange && canUse) {
          const eligibleProductIds = await getEligiblePromotionProductIds(
            client,
            promotion,
            orderItems.map((item) => item.product_id)
          );
          const eligibleIdSet = new Set(eligibleProductIds);
          const eligibleSubtotal = orderItems
            .filter((item) => eligibleIdSet.has(item.product_id))
            .reduce((sum, item) => sum + parseFloat(item.line_total || 0), 0);

          if (promotion.discount_type === 'percentage') {
            discountAmount = Math.round((eligibleSubtotal * promotion.discount_value) / 100);
          } else if (promotion.discount_type === 'fixed') {
            discountAmount = Math.min(parseFloat(promotion.discount_value || 0), eligibleSubtotal);
          }

          if (discountAmount > 0) {
            await client.query(
              'UPDATE promotions SET current_uses = current_uses + 1 WHERE id = $1',
              [promotion.id]
            );
            promotionId = promotion.id;
          }
        }
      }
    }

    const totalAmount = subtotal - discountAmount + shippingCost;

    // Determine initial status
    // Manual orders are created by admins, so they are pre-confirmed.
    // If Pickup: Set to 'delivered' (customer picked up the order at store).
    // If Delivery: Set to 'pending' (confirmed, ready for processing & shipment).
    // Never use 'awaiting_confirmation' for manual orders as admin creates them.
    const initialStatus = isPickup ? 'delivered' : 'pending';
    const initialPaymentStatus = isPickup ? 'paid' : 'unpaid';

    // Create order
    const orderQuery = `
      INSERT INTO orders (
        user_id, order_number, subtotal, tax_amount, shipping_cost, 
        discount_amount, total_amount, current_status, payment_status, 
        payment_method, promotion_id, shipping_snapshot, delivery_notes,
        warehouse_id, ordered_at, updated_at, 
        phone_confirmation_status, phone_confirmed_by, phone_confirmed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(),
        'confirmed', $15, NOW()
      )
      RETURNING *
    `;

    const orderNumber = `ORD-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const paymentMethod = req.body.payment_method || 'cod';

    const orderResult = await client.query(orderQuery, [
      customer_id,
      orderNumber,
      subtotal,
      0, // tax_amount
      shippingCost,
      discountAmount,
      totalAmount,
      initialStatus,
      initialPaymentStatus,
      paymentMethod,
      promotionId,
      JSON.stringify(finalShippingSnapshot),
      delivery_notes || '',
      selectedWarehouseId,
      adminId
    ]);

    const newOrder = orderResult.rows[0];

    // Insert order items and update stock
    for (const item of orderItems) {
      await client.query(`
        INSERT INTO order_items (
          order_id, product_id, variant_id, variant_name_snapshot, sku_snapshot,
          product_name_snapshot, quantity, 
          unit_price, line_total, warehouse_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        newOrder.id,
        item.product_id,
        item.variant_id,
        item.variant_name_snapshot,
        item.sku_snapshot,
        item.product_name_snapshot,
        item.quantity,
        item.unit_price,
        item.line_total,
        item.warehouse_id
      ]);

      // Deduct stock from the actual source warehouse (item.warehouse_id)
      // Use the locked quantity we already retrieved with FOR UPDATE
      console.log(`[Manual Order Stock Update] Attempting to deduct ${item.quantity} units of product ${item.product_id} from warehouse ${item.warehouse_id}. Locked quantity: ${item.locked_quantity}`);

      if (item.locked_quantity >= item.quantity) {
        // Normal case: sufficient stock available
        await client.query(`
          UPDATE stock
          SET quantity = quantity - $1, updated_at = NOW()
          WHERE variant_id = $2 AND warehouse_id = $3 AND quantity >= $1
        `, [item.quantity, item.variant_id, item.warehouse_id]);

        console.log(`[Manual Order Stock Update] Successfully deducted ${item.quantity} units of product ${item.product_id} from warehouse ${item.warehouse_id}`);
      } else if (force_stock_override) {
        // Admin override: Skip stock deduction (backorder scenario)
        console.log(`[Manual Order Stock Update] Force override enabled - skipping stock deduction for product ${item.product_id}. Available: ${item.locked_quantity}, Requested: ${item.quantity}`);
        console.log(`[Manual Order Stock Update] This order creates a backorder that must be fulfilled manually.`);
        // Note: Admin needs to manually transfer stock or restock to fulfill this order
      } else {
        // This shouldn't happen if our validation above worked correctly
        const errorMsg = `Stock deduction failed for product ${item.product_id}. Locked: ${item.locked_quantity || 0}, Requested: ${item.quantity}, Warehouse: ${item.warehouse_id}`;
        console.error(`[Manual Order Stock Update] ERROR: ${errorMsg}`);
        throw new ValidationError(errorMsg);
      }
    }

    // Save address to addresses table (optional for manual orders but good for record)
    if (shipping_address) {
      // Check if user already has this address to avoid duplicates? 
      // For now, just insert like normal order flow.
      const addressQuery = `
        INSERT INTO addresses (
          user_id, first_name, last_name, address_line_1, address_line_2, 
          city, state_province, postal_code, country, phone, is_default, 
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `;

      await client.query(addressQuery, [
        customer_id,
        shipping_address.first_name || '',
        shipping_address.last_name || '',
        shipping_address.address_line_1 || '',
        shipping_address.address_line_2 || null,
        shipping_address.city || '',
        shipping_address.state || shipping_address.state_province || '',
        shipping_address.postal_code || null,
        shipping_address.country || 'Algeria',
        customerPhone || '',
        false
      ]);
    }

    // Create order history entry
    const warehouseName = selectedWarehouseId === 1 ? 'Entrepôt Alger' : 'Dépôt Harrouch';
    const historyNote = isPickup
      ? `Manual Order created by Admin - Store Pickup at ${warehouseName}. Order completed.`
      : `Manual Order created by Admin. Fulfillment from ${warehouseName}. Pre-confirmed, ready for processing.`;

    await client.query(`
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [
      newOrder.id,
      initialStatus, // Use the actual initial status, not hardcoded 'awaiting_confirmation'
      historyNote,
      adminId
    ]);

    return { order: newOrder, itemsNeedingTransfer };
  });

  // Transform and return the order with transfer warning if needed
  const transformedOrder = await transformOrder(order.order);

  const response = {
    success: true,
    data: transformedOrder,
    warning: order.itemsNeedingTransfer.length > 0 ? {
      message: 'Multi-warehouse fulfillment',
      details: `${order.itemsNeedingTransfer.length} item(s) in this order will be sourced from a different warehouse and require transfer. Estimated delivery time may be extended by 1-2 business days.`,
      affected_items: order.itemsNeedingTransfer.map(item => ({
        product: item.product_name,
        quantity: item.quantity,
        transfer_route: `${item.from_warehouse} → ${item.to_warehouse}`,
        estimated_delay: '1-2 business days'
      })),
      severity: 'info'
    } : null
  };

  res.status(201).json(response);
}));

// GET all orders (Admin)
router.get('/', authenticateToken, requireAdmin, validate(getOrdersSchema), asyncHandler(async (req, res) => {
  const { search, status, paymentStatus, startDate, endDate, sortBy, sortOrder } = req.query;

  let conditions = ['o.deleted_at IS NULL'];
  let params = [];
  let paramCount = 1;

  if (search) {
    conditions.push(`(
      o.order_number ILIKE $${paramCount} OR
      u.email ILIKE $${paramCount} OR
      CONCAT(u.first_name, ' ', u.last_name) ILIKE $${paramCount}
    )`);
    params.push(`%${search}%`);
    paramCount++;
  }

  if (status && status !== 'all') {
    conditions.push(`o.current_status = $${paramCount}`);
    params.push(status);
    paramCount++;
  }

  if (paymentStatus && paymentStatus !== 'all') {
    conditions.push(`o.payment_status = $${paramCount}`);
    params.push(paymentStatus);
    paramCount++;
  }

  if (startDate) {
    conditions.push(`o.ordered_at >= $${paramCount}`);
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    conditions.push(`o.ordered_at <= $${paramCount}`);
    params.push(endDate);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Map sortBy to actual column names
  const sortByMap = {
    'createdAt': 'ordered_at',
    'total': 'total_amount',
    'status': 'current_status'
  };
  const actualSortBy = sortBy ? sortByMap[sortBy] || 'ordered_at' : 'ordered_at';

  const orderByClause = `ORDER BY o.${actualSortBy} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;

  const query = `
    SELECT o.* FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ${whereClause}
    ${orderByClause}
  `;

  const orders = await db.queryMany(query, params);
  const transformedOrders = await Promise.all(
    orders.map(o => transformOrder(o))
  );

  res.json({ success: true, data: transformedOrders });
}));

// PUT update status (Admin)
router.put('/:id/status', authenticateToken, requireAdmin, validate(updateOrderStatusSchema), asyncHandler(async (req, res) => {
  const orderId = extractOrderId(req.params.id);
  const { status, notes } = req.body;

  let order = null;

  await db.transaction(async (client) => {
    const orderQuery = 'SELECT * FROM orders WHERE id = $1 FOR UPDATE';
    const orderResult = await client.query(orderQuery, [orderId]);

    if (orderResult.rows.length === 0) {
      throw new NotFoundError('Order not found');
    }

    order = orderResult.rows[0];

    const updateFields = ['current_status = $1', 'updated_at = NOW()'];
    const updateParams = [status];
    let paramCount = 2;

    if (status === 'delivered') {
      updateFields.push(`delivered_at = NOW()`);
      if (order.payment_method === 'cod') {
        updateFields.push(`payment_status = 'paid'`);
        updateFields.push(`paid_at = NOW()`);
      }
    }

    await client.query(`
      UPDATE orders
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
    `, [...updateParams, orderId]);

    await client.query(`
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [orderId, status, notes || `Status changed to ${status}`, req.user.userId]);
  });

  // Send notification to customer based on status change
  if (order && order.user_id) {
    const notificationMessages = {
      shipped: {
        title: 'Commande expédiée / تم شحن طلبك',
        message: `Votre commande ${order.order_number} est en route ! / طلبك ${order.order_number} في الطريق!`
      },
      in_transit: {
        title: 'Commande en transit / طلبك قيد النقل',
        message: `Votre commande ${order.order_number} est en cours de livraison. / طلبك ${order.order_number} قيد التسليم.`
      },
      out_for_delivery: {
        title: 'Livraison en cours / جاري التوصيل',
        message: `Votre commande ${order.order_number} sera livrée aujourd'hui ! / سيتم تسليم طلبك ${order.order_number} اليوم!`
      },
      delivered: {
        title: 'Commande livrée / تم التسليم',
        message: `Votre commande ${order.order_number} a été livrée. Merci pour votre achat ! / تم تسليم طلبك ${order.order_number}. شكراً لتسوقك!`
      },
      cancelled: {
        title: 'Commande annulée / تم إلغاء الطلب',
        message: `Votre commande ${order.order_number} a été annulée. / تم إلغاء طلبك ${order.order_number}.`
      },
      failed_delivery: {
        title: 'Échec de la livraison / فشل التسليم',
        message: `La livraison de votre commande ${order.order_number} a échoué. Nous vous contacterons. / فشل تسليم طلبك ${order.order_number}. سنتصل بك.`
      }
    };

    const notifData = notificationMessages[status];
    if (notifData) {
      try {
        await NotificationService.create({
          userId: order.user_id,
          type: 'ORDER_STATUS',
          title: notifData.title,
          message: notifData.message,
          actionUrl: `/orders/${orderId}`,
          relatedEntityType: 'order',
          relatedEntityId: orderId
        });
        console.log(`[Notification] Sent ${status} notification for order ${orderId} to user ${order.user_id}`);
      } catch (notifError) {
        console.error('[Notification] Failed to send notification:', notifError);
        // Don't fail the request if notification fails
      }
    }

    // If delivered, send review request notification
    if (status === 'delivered') {
      try {
        const orderItems = await db.queryMany(
          `SELECT DISTINCT oi.product_id, p.product_name 
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = $1
           LIMIT 3`,
          [orderId]
        );

        if (orderItems.length > 0) {
          const productNames = orderItems.map(item => item.product_name).join(', ');
          const productCount = orderItems.length;

          // Link to product with review dialog parameter - using French locale as default
          const actionUrl = productCount === 1
            ? `/fr/product/${orderItems[0].product_id}?openReview=true`
            : `/orders/${orderId}?reviewMode=true`;

          await NotificationService.create({
            userId: order.user_id,
            type: 'REVIEW_REQUEST',
            title: 'Partagez votre expérience / شارك تجربتك',
            message: `Votre commande est livrée ! Donnez votre avis sur ${productCount > 1 ? 'vos produits' : productNames}. / تم التسليم! شارك رأيك.`,
            actionUrl: actionUrl,
            relatedEntityType: productCount === 1 ? 'product' : 'order',
            relatedEntityId: productCount === 1 ? orderItems[0].product_id : orderId
          });
          console.log(`[Notification] Sent review request for order ${orderId} to user ${order.user_id} (${productCount} product${productCount > 1 ? 's' : ''})`);
        }
      } catch (reviewNotifError) {
        console.error('[Notification] Failed to send review request:', reviewNotifError);
      }
    }
  }

  const updatedOrder = await db.queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
  const transformed = await transformOrder(updatedOrder);
  res.json(transformed);
}));

// PUT update payment status (Admin)
router.put('/:id/payment-status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const orderId = extractOrderId(req.params.id);
  const { paymentStatus } = req.body;

  await db.query(`
    UPDATE orders
    SET payment_status = $1, updated_at = NOW()
    WHERE id = $2
  `, [paymentStatus, orderId]);

  const updatedOrder = await db.queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
  const transformed = await transformOrder(updatedOrder);
  res.json(transformed);
}));

// GET stats (Admin)
router.get('/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const query = `
    SELECT
      COUNT(*) as total_orders,
      COUNT(*) FILTER (WHERE current_status = 'pending') as pending_orders,
      COUNT(*) FILTER (WHERE current_status = 'processing') as processing_orders,
      COUNT(*) FILTER (WHERE current_status = 'shipped') as shipped_orders,
      COUNT(*) FILTER (WHERE current_status = 'delivered') as delivered_orders,
      COUNT(*) FILTER (WHERE current_status = 'cancelled') as cancelled_orders,
      COALESCE(SUM(total_amount) FILTER (WHERE current_status = 'delivered'), 0) as total_revenue
    FROM orders
    WHERE deleted_at IS NULL
  `;

  const stats = await db.queryOne(query);

  res.json({
    success: true,
    data: {
      totalOrders: parseInt(stats.total_orders),
      pendingOrders: parseInt(stats.pending_orders),
      processingOrders: parseInt(stats.processing_orders),
      shippedOrders: parseInt(stats.shipped_orders),
      deliveredOrders: parseInt(stats.delivered_orders),
      cancelledOrders: parseInt(stats.cancelled_orders),
      totalRevenue: parseFloat(stats.total_revenue)
    }
  });
}));

// ==========================================
// PHONE CONFIRMATION ENDPOINTS
// ==========================================

// PUT reset shipment for testing (Admin)
router.put('/:id/reset-shipment', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const orderId = extractOrderId(req.params.id);
  const { notes } = req.body;

  await db.transaction(async (client) => {
    const order = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (order.rows.length === 0) {
      throw new NotFoundError('Order not found');
    }

    // Reset tracking and shipment fields
    await client.query(`
      UPDATE orders
      SET 
        tracking_number = NULL,
        tracking_number = NULL,
        guepex_import_id = NULL,
        guepex_label_url = NULL,
        shipment_status = NULL,
        carrier = NULL,
        current_status = 'processing',
        phone_confirmation_status = 'confirmed',
        updated_at = NOW()
      WHERE id = $1
    `, [orderId]);

    // Add history entry
    await client.query(`
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [orderId, 'processing', notes || 'Shipment reset for testing - tracking number cleared', req.user.userId]);
  });

  const updatedOrder = await db.queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);

  res.json({
    success: true,
    message: 'Shipment reset successfully',
    data: updatedOrder
  });
}));

// PUT phone confirmation (Admin)
router.put('/:id/phone-confirmation', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const orderId = extractOrderId(req.params.id);
  const { status, notes } = req.body;

  if (!['confirmed', 'failed'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Status must be either "confirmed" or "failed"'
    });
  }

  await db.transaction(async (client) => {
    const order = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (order.rows.length === 0) {
      throw new NotFoundError('Order not found');
    }

    const newStatus = status === 'confirmed' ? 'pending' : 'cancelled';

    await client.query(`
      UPDATE orders
      SET current_status = $1,
          phone_confirmation_status = $2,
          phone_confirmed_at = NOW(),
          phone_confirmed_by = $3,
          phone_confirmation_notes = $4,
          updated_at = NOW()
      WHERE id = $5
    `, [newStatus, status, req.user.userId, notes || '', orderId]);

    const historyNotes = status === 'confirmed'
      ? `Phone confirmation successful. Customer contacted and order verified. ${notes || ''}`.trim()
      : `Phone confirmation failed. ${notes || 'Customer unreachable or order cancelled.'}`.trim();

    await client.query(`
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [orderId, newStatus, historyNotes, req.user.userId]);
  });

  const updatedOrder = await db.queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
  const transformed = await transformOrder(updatedOrder);

  res.json({
    success: true,
    data: transformed
  });
}));

// ==========================================
// SHIPPING CALCULATION ENDPOINTS
// ==========================================

// POST calculate shipping estimate
router.post('/shipping-estimate', asyncHandler(async (req, res) => {
  const { communeId, isStopDesk, items } = req.body;

  if (!communeId) {
    return res.status(400).json({
      success: false,
      error: 'communeId is required'
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'items array is required'
    });
  }

  try {
    const estimate = await shippingCalculator.calculateCartShipping({
      items,
      communeId: parseInt(communeId),
      isStopDesk: isStopDesk || false
    });

    res.json({
      success: true,
      data: estimate
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Request failed' : error.message
    });
  }
}));

// GET validate address
router.get('/validate-address/:communeId', asyncHandler(async (req, res) => {
  const { communeId } = req.params;
  const { isStopDesk } = req.query;

  const validation = await shippingCalculator.validateAddress(
    parseInt(communeId),
    isStopDesk === 'true'
  );

  res.json({
    success: validation.valid,
    data: validation
  });
}));

// GET delivery estimate
router.get('/delivery-estimate/:communeId', asyncHandler(async (req, res) => {
  const { communeId } = req.params;

  const estimate = await shippingCalculator.getDeliveryEstimate(parseInt(communeId));

  res.json({
    success: true,
    data: estimate
  });
}));

// GET available stop desks
router.get('/stop-desks/:wilayaId', asyncHandler(async (req, res) => {
  const { wilayaId } = req.params;

  const stopDesks = await shippingCalculator.getStopDesksInWilaya(parseInt(wilayaId));

  res.json({
    success: true,
    data: stopDesks,
    count: stopDesks.length
  });
}));

// ==========================================
// GUEPEX SHIPMENT ENDPOINTS
// ==========================================

// POST create shipment for single order (Admin)
router.post('/:id/create-shipment', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const orderId = extractOrderId(req.params.id);
  const { prepaidAmount } = req.body;

  try {
    const result = await guepexShipmentService.createShipment(orderId, {
      userId: req.user.userId,
      prepaidAmount: prepaidAmount ? parseFloat(prepaidAmount) : 0
    });

    // Create notification for shipment
    try {
      const orderQuery = `
        SELECT id, user_id, order_number FROM orders
        WHERE id = $1
      `;
      const order = await db.queryOne(orderQuery, [orderId]);

      if (order && result.shipment_data?.guepex_tracking_number) {
        await NotificationService.create({
          userId: order.user_id,
          type: 'ORDER_STATUS',
          title: 'Order Shipped',
          message: `Your order #${order.order_number} has been shipped. Tracking: ${result.shipment_data.guepex_tracking_number}`,
          actionUrl: `/orders/${order.id}`,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
        });
      }
    } catch (notificationError) {
      console.error('[Notification] Failed to create shipment notification:', notificationError);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Orders API] Create shipment error:', error);

    let statusCode = 400;
    let errorMessage = error.message || 'Failed to create shipment';

    if (error.name === 'GuepexValidationError') {
      statusCode = 400;
      errorMessage = `Validation Error: ${error.message}`;
    } else if (error.name === 'GuepexNetworkError') {
      statusCode = 503;
      errorMessage = 'Unable to reach Guepex API. Please check your internet connection and try again.';
    } else if (error.name === 'GuepexTimeoutError') {
      statusCode = 504;
      errorMessage = 'Request to Guepex API timed out. Please try again.';
    } else if (error.name === 'GuepexAuthenticationError') {
      statusCode = 500;
      errorMessage = 'Authentication error with Guepex API. Please contact support.';
    } else if (error.name === 'GuepexRateLimitError') {
      statusCode = 429;
      errorMessage = 'Too many requests to Guepex API. Please wait a moment and try again.';
    } else if (error.name === 'NotFoundError') {
      statusCode = 404;
      errorMessage = error.message;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// POST create batch shipments (Admin)
router.post('/batch-create-shipments', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { orderIds } = req.body;

  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'orderIds array is required'
    });
  }

  if (orderIds.length > 50) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 50 orders per batch'
    });
  }

  try {
    const results = await guepexShipmentService.createBatchShipments(orderIds, {
      userId: req.user.userId
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('[Orders API] Batch shipment error:', error);

    let statusCode = 400;
    let errorMessage = error.message || 'Failed to create batch shipments';

    if (error.name === 'GuepexNetworkError') {
      statusCode = 503;
      errorMessage = 'Unable to reach Guepex API. Please try again later.';
    } else if (error.name === 'GuepexTimeoutError') {
      statusCode = 504;
      errorMessage = 'Request timed out. This may take a while for large batches. Please try again.';
    } else if (error.name === 'GuepexRateLimitError') {
      statusCode = 429;
      errorMessage = 'Too many requests. Please wait a moment and try again with fewer orders.';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET tracking history
router.get('/:id/tracking-history', asyncHandler(async (req, res) => {
  const orderId = extractOrderId(req.params.id);

  const order = await db.queryOne(
    'SELECT tracking_number FROM orders WHERE id = $1',
    [orderId]
  );

  if (!order) throw new NotFoundError('Order not found');

  const trackingNumber = order.tracking_number;

  if (!trackingNumber) {
    return res.json({
      success: true,
      data: []
    });
  }

  try {
    const history = await guepexShipmentService.getTrackingHistory(trackingNumber);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[Orders API] Tracking history error:', error);
    res.status(400).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Request failed' : error.message
    });
  }
}));

// ==========================================
// WEBHOOK ENDPOINT
// ==========================================

// GET webhook validation from Guepex
router.get('/webhooks/guepex', (req, res) => {
  console.log('[Orders API] Webhook validation request from Guepex');
  console.log('[Orders API] Query params:', req.query);

  if (req.query.subscribe && req.query.crc_token) {
    const crcToken = req.query.crc_token;
    console.log('[Orders API] CRC validation - echoing token:', crcToken);
    return res.status(200).send(crcToken);
  }

  res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active',
    service: 'Algerian Hardware Store'
  });
});

// POST webhook from Guepex (public, no auth)
router.post('/webhooks/guepex', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  console.log('='.repeat(70));
  console.log('[Guepex Webhook] Incoming request');
  console.log('[Guepex Webhook] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[Guepex Webhook] Body:', JSON.stringify(req.body, null, 2));
  console.log('='.repeat(70));

  const signature = req.headers['x-yalidine-signature'] || req.headers['x_yalidine_signature'];
  const webhookSecret = process.env.GUEPEX_WEBHOOK_SECRET;
  const rawPayload = req.rawBody || JSON.stringify(req.body);

  if (webhookSecret && webhookSecret !== 'your_webhook_secret_here') {
    if (!signature) {
      console.warn('[Guepex Webhook] ⚠️  Signature missing (continuing for development)');
    } else {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('[Guepex Webhook] ⚠️  Invalid signature (continuing for development)');
        console.warn('[Guepex Webhook] Expected:', expectedSignature);
        console.warn('[Guepex Webhook] Received:', signature);
      } else {
        console.log('[Guepex Webhook] ✅ Signature verified');
      }
    }
  }

  const { type, events } = req.body;

  console.log('[Guepex Webhook] Processing:', {
    type,
    eventCount: events?.length || 0,
    firstEvent: events?.[0]
  });

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      if (!events || !Array.isArray(events)) {
        console.warn('[Guepex Webhook] ⚠️  Invalid payload structure');
        return;
      }

      for (const event of events) {
        const { event_id, occurred_at, data } = event;

        console.log('[Guepex Webhook] Processing event:', {
          event_id,
          type,
          occurred_at,
          tracking: data.tracking
        });

        switch (type) {
          case 'parcel_status_updated':
            console.log('[Guepex Webhook] 📦 Status update:', data.tracking, '→', data.status);
            await guepexShipmentService.updateOrderFromWebhook({
              tracking: data.tracking,
              last_status: data.status,
              status_reason: data.reason,
              event_id,
              occurred_at
            });
            break;

          case 'parcel_payment_updated':
            console.log('[Guepex Webhook] 💰 Payment update:', data.tracking, '→', data.status);
            const order = await db.queryOne(
              'SELECT id FROM orders WHERE tracking_number = $1',
              [data.tracking]
            );
            if (order) {
              await db.query(`
                UPDATE orders
                SET payment_status = $1,
                    guepex_payment_id = $2,
                    updated_at = NOW()
                WHERE id = $3
              `, [
                data.status === 'receivable' ? 'paid' : 'unpaid',
                data.payment_id,
                order.id
              ]);
              console.log('[Guepex Webhook] ✅ Payment updated');
            } else {
              console.warn('[Guepex Webhook] ⚠️  Order not found for tracking:', data.tracking);
            }
            break;

          case 'parcel_created':
            console.log('[Guepex Webhook] ✅ Parcel created:', data.tracking);
            break;

          case 'parcel_edited':
            console.log('[Guepex Webhook] ✏️  Parcel edited:', data.tracking);
            break;

          case 'parcel_deleted':
            console.log('[Guepex Webhook] 🗑️  Parcel deleted:', data.tracking);
            break;

          default:
            console.warn('[Guepex Webhook] ⚠️  Unknown event type:', type);
        }
      }

      const processingTime = Date.now() - startTime;
      console.log(`[Guepex Webhook] ✅ Complete - processed ${events.length} events in ${processingTime}ms`);
      console.log('='.repeat(70));

    } catch (error) {
      console.error('[Guepex Webhook] ❌ Processing error:', error);
      console.error('[Guepex Webhook] Stack:', error.stack);
    }
  });
}));

// ==========================================
// PUBLIC TRACKING ENDPOINT
// ==========================================

// POST track order by order number or phone
router.post('/track', asyncHandler(async (req, res) => {
  const { orderNumber, phone } = req.body;

  if (!orderNumber && !phone) {
    return res.status(400).json({
      success: false,
      error: 'Order number or phone number is required'
    });
  }

  let order;

  if (orderNumber) {
    const query = `
      SELECT * FROM orders
      WHERE (order_number = $1 OR order_number = $2)
      AND deleted_at IS NULL
      ORDER BY ordered_at DESC
      LIMIT 1
    `;
    order = await db.queryOne(query, [orderNumber, `ORD-${orderNumber}`]);
  } else if (phone) {
    const query = `
      SELECT o.* FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE (u.phone = $1 OR o.customer_phone = $1)
      AND o.deleted_at IS NULL
      ORDER BY o.ordered_at DESC
      LIMIT 1
    `;
    order = await db.queryOne(query, [phone]);
  }

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  let trackingHistory = [];
  const trackingNumber = order.tracking_number;

  if (trackingNumber) {
    try {
      trackingHistory = await guepexShipmentService.getTrackingHistory(trackingNumber);
    } catch (error) {
      console.error('[Orders API] Error fetching tracking:', error);
    }
  }

  const transformed = await transformOrder(order);

  res.json({
    success: true,
    data: {
      ...transformed,
      trackingHistory
    }
  });
}));

// ==========================================
// POLLING CONTROL (Admin Only)
// ==========================================

// GET polling service status
router.get('/polling/status', authenticateToken, requireAdmin, (req, res) => {
  const status = guepexPollingService.getStatus();
  res.json({
    success: true,
    data: status
  });
});

// POST start/stop polling
router.post('/polling/:action', authenticateToken, requireAdmin, (req, res) => {
  const { action } = req.params;
  const { intervalMinutes } = req.body;

  if (action === 'start') {
    const interval = intervalMinutes || 5;
    guepexPollingService.start(interval);
    res.json({
      success: true,
      message: `Polling started - checking every ${interval} minutes`
    });
  } else if (action === 'stop') {
    guepexPollingService.stop();
    res.json({
      success: true,
      message: 'Polling stopped'
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Invalid action. Use "start" or "stop"'
    });
  }
});

// POST poll specific order now
router.post('/polling/poll-order', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { trackingNumber } = req.body;

  if (!trackingNumber) {
    return res.status(400).json({
      success: false,
      error: 'Tracking number is required'
    });
  }

  const result = await guepexPollingService.pollOrder(trackingNumber);

  res.json({
    success: true,
    message: 'Order polled successfully',
    data: result
  });
}));

export default router;
