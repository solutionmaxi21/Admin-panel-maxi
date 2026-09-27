/**
 * Shipping Calculator Service - PostgreSQL Version
 * 
 * Calculates accurate shipping costs based on:
 * - Product dimensions and weight (volumetric vs actual)
 * - Destination commune
 * - Warehouse location (Algiers vs Harrouch - chooses cheapest)
 * - Delivery type (home vs stop desk)
 * - COD fees and insurance
 * 
 * Performance:
 * - Uses CacheManager for TTL-based caching
 * - Database queries only on cache miss
 * - Indexed lookups for fast retrieval
 * - Integrated with global cache invalidation system
 */

import db from '../db/postgres.js';
import CacheManager from './cacheManager.js';

class ShippingCalculatorPG {
  constructor() {
    // Cache now managed by CacheManager (centralized)
    this.warehouses = {
      algiers: 16,
      harrouch: 21
    };
  }

  /**
   * Load fee data for specific route from PostgreSQL
   * Uses CacheManager for centralized TTL-based caching
   * @private
   */
  async getCommuneFee(fromWilayaId, toCommuneId) {
    try {
      return await CacheManager.getShippingFee(fromWilayaId, toCommuneId);
    } catch (error) {
      console.error(
        `[Shipping Calculator] Failed to load fee for ${fromWilayaId}-${toCommuneId}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Get commune data by ID from PostgreSQL
   * Uses CacheManager for centralized TTL-based caching
   * @private
   */
  async getCommuneData(communeId) {
    try {
      return await CacheManager.getCommune(communeId);
    } catch (error) {
      console.error(
        `[Shipping Calculator] Failed to load commune ${communeId}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Calculate volumetric weight
   * Guepex formula: width (cm) × height (cm) × length (cm) × 0.0002
   * @private
   */
  calculateVolumetricWeight(dimensions) {
    if (!dimensions || !dimensions.length || !dimensions.width || !dimensions.height) {
      return 0;
    }

    // Guepex formula: L × W × H × 0.0002 (dimensions in cm, result in kg)
    const volumetric = dimensions.length * dimensions.width * dimensions.height * 0.0002;
    return volumetric; // Keep exact value per Guepex docs
  }

  /**
   * Determine billable weight (max of actual vs volumetric)
   * @private
   */
  getBillableWeight(actualWeight, dimensions) {
    const volumetricWeight = this.calculateVolumetricWeight(dimensions);
    const billableWeight = Math.max(actualWeight || 0, volumetricWeight);

    return {
      actual: actualWeight || 0,
      volumetric: volumetricWeight,
      billable: billableWeight
    };
  }

  /**
   * Calculate shipping cost for a single product
   * 
   * @param {Object} params
   * @param {number} params.communeId - Destination commune ID
   * @param {number} params.price - Product price (for COD fees)
   * @param {number} params.declaredValue - Declared value for insurance/COD (uses max of price vs declaredValue)
   * @param {number} params.weight - Product weight in kg
   * @param {Object} params.dimensions - {length, width, height} in cm
   * @param {boolean} params.isStopDesk - Deliver to stop desk (cheaper) vs home
   * @param {boolean} params.insurance - Add insurance coverage
   * @param {string} params.deliveryType - 'express' or 'economic'
   * 
   * @returns {Promise<Object>} Shipping cost breakdown
   */
  async calculateShipping(params) {
    const {
      communeId,
      price = 0,
      declaredValue = 0, // Guepex uses max(price, declaredValue) for COD/insurance
      weight = 0,
      dimensions = null,
      isStopDesk = false,
      insurance = false,
      deliveryType = 'economic', // 'express' or 'economic'
      warehouseCandidates = [this.warehouses.algiers, this.warehouses.harrouch]
    } = params;

    try {
      // Validate inputs
      if (!communeId) {
        throw new Error('Commune ID is required');
      }

      // Get commune data
      const commune = await this.getCommuneData(communeId);

      if (!commune.is_deliverable) {
        throw new Error(`Commune ${commune.name} is not deliverable`);
      }

      // Calculate weights
      const weightData = this.getBillableWeight(weight, dimensions);

      // Get fees only for eligible warehouses
      const warehouseFeePromises = warehouseCandidates.map((wid) =>
        this.getCommuneFee(wid, communeId).then(fees => ({ wid, fees })).catch(() => null)
      );

      const resolvedFees = (await Promise.all(warehouseFeePromises)).filter(Boolean);

      if (resolvedFees.length === 0) {
        throw new Error(`No shipping routes available to commune ${communeId}`);
      }

      // Calculate cost from each eligible warehouse
      const costs = resolvedFees.map(({ wid, fees }) =>
        this.calculateRouteCost(
          fees,
          price,
          declaredValue,
          weightData,
          isStopDesk,
          deliveryType,
          insurance,
          wid === this.warehouses.algiers ? 'Algiers' : 'Harrouch'
        )
      );

      // Choose cheapest route
      const cheapest = costs.reduce((min, curr) =>
        curr.total < min.total ? curr : min
      );

      return {
        ...cheapest,
        commune: {
          id: commune.id,
          name: commune.name,
          wilaya_name: commune.wilaya_name,
          wilaya_id: commune.wilaya_id,
          has_stop_desk: commune.has_stop_desk,
          zone: commune.zone
        },
        weight: weightData,
        alternativeRoutes: costs.filter(c => c.warehouse !== cheapest.warehouse)
      };

    } catch (error) {
      console.error('[Shipping Calculator] Calculation failed:', error.message);
      throw error;
    }
  }

  /**
   * Calculate cost for specific route
   * 
   * GUEPEX FORMULAS (from official docs):
   * - COD/Insurance base = max(price, declaredValue)
   * - Oversize threshold = 5 KG (not 10!)
   * - Oversize fee = (billable_weight - 5) × oversize_fee_per_kg
   * 
   * @private
   */
  calculateRouteCost(fees, price, declaredValue, weightData, isStopDesk, deliveryType, insurance, warehouseName) {
    // Base delivery fee - convert to number
    // Economic can be null (unavailable) — fall back to express in that case
    let baseFee = 0;
    let actualDeliveryType = deliveryType;
    if (deliveryType === 'express') {
      baseFee = Number(isStopDesk ? fees.express_desk : fees.express_home) || 0;
    } else {
      const economicFee = isStopDesk ? fees.economic_desk : fees.economic_home;
      if (economicFee != null) {
        baseFee = Number(economicFee);
      } else {
        // Economic not available for this route — fall back to express
        baseFee = Number(isStopDesk ? fees.express_desk : fees.express_home) || 0;
        actualDeliveryType = 'express';
      }
    }

    // COD/Insurance base value: Guepex uses MAX of price vs declared_value
    const feeBaseValue = Math.max(Number(price) || 0, Number(declaredValue) || 0);

    // COD fee temporarily disabled
    const codFee = 0;

    // Insurance fee temporarily disabled
    const insuranceFee = 0;

    // Oversize/Overweight fee (GUEPEX: threshold is 5 KG, fee is PER EXTRA KG)
    // Formula: (billable_weight - 5) × oversize_fee_per_kg
    const WEIGHT_THRESHOLD_KG = 5;
    const perKgOversizeFee = Number(fees.oversize_fee || 0);
    const billableWeight = Number(weightData.billable) || 0;
    const extraKg = Math.max(0, billableWeight - WEIGHT_THRESHOLD_KG);
    const oversizeFee = extraKg > 0 ? (extraKg * perKgOversizeFee) : 0;

    // Total
    const total = baseFee + codFee + insuranceFee + oversizeFee;

    return {
      warehouse: warehouseName,
      deliveryFee: baseFee,
      codFee: Math.round(codFee),
      insuranceFee: Math.round(insuranceFee),
      oversizeFee: Math.round(oversizeFee),
      extraWeightKg: extraKg,
      total: Math.round(total),
      breakdown: {
        base: baseFee,
        cod: Math.round(codFee),
        insurance: Math.round(insuranceFee),
        oversize: Math.round(oversizeFee),
        perKgOversizeFee: perKgOversizeFee,
        extraKg: extraKg
      },
      deliveryType: actualDeliveryType,
      isStopDesk,
      feeBaseValue: Math.round(feeBaseValue),
      retourFee: Number(fees.retour_fee || 0)
    };
  }

  /**
   * Determine which warehouses can fulfill the entire cart based on stock.
   * If no productId is provided in items, default to all warehouses.
   */
  async getEligibleWarehousesForItems(items) {
    const productTotals = new Map();

    for (const item of items || []) {
      const pid = item.productId || item.id; // support both shapes
      if (!pid) continue;
      const qty = item.quantity || 1;
      productTotals.set(pid, (productTotals.get(pid) || 0) + qty);
    }

    // If we cannot identify products, allow all warehouses (fail-open)
    if (productTotals.size === 0) {
      return [this.warehouses.algiers, this.warehouses.harrouch];
    }

    const warehouseIds = [this.warehouses.algiers, this.warehouses.harrouch];
    const productIds = Array.from(productTotals.keys());

    const { rows } = await db.query(
      `SELECT warehouse_id, product_id, quantity_available
       FROM stock
       WHERE warehouse_id = ANY($1) AND product_id = ANY($2)`,
      [warehouseIds, productIds]
    );

    const availability = new Map();
    warehouseIds.forEach(w => availability.set(w, new Map()));

    for (const row of rows) {
      const qtyAvail = Number(row.quantity_available) || 0;
      const map = availability.get(row.warehouse_id);
      if (map) map.set(row.product_id, qtyAvail);
    }

    const eligible = warehouseIds.filter(wid =>
      productIds.every(pid => (availability.get(wid)?.get(pid) || 0) >= (productTotals.get(pid) || 0))
    );

    if (eligible.length === 0) {
      throw new Error('No warehouse has sufficient stock for all items');
    }

    return eligible;
  }

  /**
   * Calculate shipping for multiple products (cart)
   * 
   * @param {Object} params
   * @param {Array} params.items - Array of products with weight/dimensions
   * @param {number} params.communeId - Destination commune
   * @param {number} params.totalPrice - Total cart value (for COD)
   * @param {number} params.declaredValue - Declared value (Guepex uses max of price vs declared)
   * @param {boolean} params.isStopDesk - Delivery to stop desk
   * @param {string} params.deliveryType - 'express' or 'economic'
   * 
   * @returns {Promise<Object>} Shipping cost for entire cart
   */
  async calculateCartShipping(params) {
    const {
      items = [],
      communeId,
      totalPrice,
      declaredValue,
      isStopDesk = false,
      deliveryType = 'economic'
    } = params;

    try {
      // Calculate total price from items if not provided
      const calculatedTotalPrice = totalPrice || items.reduce((sum, item) => {
        const qty = item.quantity || 1;
        const itemPrice = item.price || 0;
        return sum + (itemPrice * qty);
      }, 0);

      // Calculate total weight
      const totalWeight = items.reduce((sum, item) => {
        const qty = item.quantity || 1;
        const itemWeight = item.weight || 0;
        return sum + (itemWeight * qty);
      }, 0);

      // For dimensions, use largest item (conservative approach)
      let maxDimensions = null;
      for (const item of items) {
        if (item.dimensions) {
          const volume = item.dimensions.length * item.dimensions.width * item.dimensions.height;
          if (!maxDimensions || volume > (maxDimensions.length * maxDimensions.width * maxDimensions.height)) {
            maxDimensions = item.dimensions;
          }
        } else if (item.length && item.width && item.height) {
          // Support flat dimension properties
          const volume = item.length * item.width * item.height;
          if (!maxDimensions || volume > (maxDimensions.length * maxDimensions.width * maxDimensions.height)) {
            maxDimensions = {
              length: item.length,
              width: item.width,
              height: item.height
            };
          }
        }
      }

      // Calculate shipping
      // For declaredValue: use provided value or default to total price
      const calculatedDeclaredValue = declaredValue ?? calculatedTotalPrice;
      
      const warehouseCandidates = await this.getEligibleWarehousesForItems(items);
      const result = await this.calculateShipping({
        communeId,
        price: calculatedTotalPrice,
        declaredValue: calculatedDeclaredValue,
        weight: totalWeight,
        dimensions: maxDimensions,
        isStopDesk,
        insurance: false, // Cart-level insurance handled separately
        deliveryType,
        warehouseCandidates
      });

      // Return with totalShippingCost for backward compatibility
      return {
        ...result,
        totalShippingCost: result.total,
        deliveryTime: result.commune?.zone ? (result.commune.zone * 2) : 5,
        baseFee: result.deliveryFee,
        overweightFee: result.oversizeFee || 0,
        codFee: result.codFee || 0,
        insuranceFee: result.insuranceFee || 0,
        communeName: result.commune?.name,
        wilayaName: result.commune?.wilaya_name,
        selectedWarehouse: result.warehouse
      };

    } catch (error) {
      console.error('[Shipping Calculator] Cart calculation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get all deliverable communes with their delivery options
   * 
   * @returns {Promise<Array>} List of deliverable communes
   */
  async getDeliverableCommunes() {
    try {
      const result = await db.query(`
        SELECT c.id, c.name, c.wilaya_id, w.name as wilaya_name, 
               c.has_stop_desk, w.zone,
               c.delivery_time_parcel, c.delivery_time_payment
        FROM communes c
        JOIN wilayas w ON w.id = c.wilaya_id
        WHERE c.is_deliverable = true
        ORDER BY w.name, c.name
      `);

      return result.rows;
    } catch (error) {
      console.error('[Shipping Calculator] Failed to get deliverable communes:', error.message);
      throw error;
    }
  }

  /**
   * Get communes for specific wilaya
   * 
   * @param {number} wilayaId - Wilaya ID
   * @returns {Promise<Array>} Communes in that wilaya
   */
  async getCommunesByWilaya(wilayaId) {
    try {
      const result = await db.query(`
        SELECT id, name, has_stop_desk, is_deliverable,
               delivery_time_parcel, delivery_time_payment
        FROM communes
        WHERE wilaya_id = $1 AND is_deliverable = true
        ORDER BY name
      `, [wilayaId]);

      return result.rows;
    } catch (error) {
      console.error(`[Shipping Calculator] Failed to get communes for wilaya ${wilayaId}:`, error.message);
      throw error;
    }
  }

  /**
   * Validate if address/commune is deliverable
   * 
   * @param {number} communeId - Commune ID
   * @param {boolean} isStopDesk - Whether delivery to stop desk
   * @returns {Promise<Object>} Validation result
   */
  async validateAddress(communeId, isStopDesk = false) {
    try {
      const commune = await this.getCommuneData(communeId);

      const valid = !!commune.is_deliverable;
      const warnings = [];

      if (!valid) {
        warnings.push('Commune is not deliverable');
      }

      if (isStopDesk && !commune.has_stop_desk) {
        warnings.push('Stop desk delivery not available in this commune');
      }

      return {
        valid: valid && (!isStopDesk || commune.has_stop_desk),
        commune: {
          id: commune.id,
          name: commune.name,
          wilaya_name: commune.wilaya_name,
          wilaya_id: commune.wilaya_id
        },
        isDeliverable: !!commune.is_deliverable,
        hasStopDesk: !!commune.has_stop_desk,
        warnings
      };
    } catch (error) {
      console.error('[Shipping Calculator] Address validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get delivery time estimate for a commune
   * 
   * @param {number} communeId - Commune ID
   * @returns {Promise<Object>} Delivery estimate
   */
  async getDeliveryEstimate(communeId) {
    try {
      const commune = await this.getCommuneData(communeId);

      return {
        communeId: commune.id,
        communeName: commune.name,
        wilayaName: commune.wilaya_name,
        zone: commune.zone,
        minDays: parseInt(commune.delivery_time_parcel) || 2,
        maxDays: (parseInt(commune.delivery_time_parcel) || 2) + 2,
        parcelDeliveryDays: parseInt(commune.delivery_time_parcel) || 2,
        paymentDeliveryDays: parseInt(commune.delivery_time_payment) || 7
      };
    } catch (error) {
      console.error('[Shipping Calculator] Delivery estimate failed:', error.message);
      throw error;
    }
  }

  /**
   * Get all stop desks (shipping centers) in a wilaya
   * 
   * @param {number} wilayaId - Wilaya ID
   * @returns {Promise<Array>} List of stop desks
   */
  async getStopDesksInWilaya(wilayaId) {
    try {
      const result = await db.query(`
        SELECT 
          sc.id,
          sc.name,
          sc.address,
          sc.gps,
          sc.commune_id,
          c.name as commune_name,
          sc.provider
        FROM shipping_centers sc
        LEFT JOIN communes c ON c.id = sc.commune_id
        WHERE sc.wilaya_id = $1
        ORDER BY sc.name
      `, [wilayaId]);

      return result.rows;
    } catch (error) {
      console.error(`[Shipping Calculator] Failed to get stop desks for wilaya ${wilayaId}:`, error.message);
      throw error;
    }
  }

  /**
   * Clear shipping cache (now managed by CacheManager)
   */
  clearCache() {
    CacheManager.invalidateShippingCache();
    console.log('[Shipping Calculator] Cache cleared via CacheManager');
  }
}

export default new ShippingCalculatorPG();
