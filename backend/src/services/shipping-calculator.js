/**
 * Shipping Calculator Service
 * 
 * Calculates accurate shipping costs based on:
 * - Product dimensions and weight (volumetric vs actual)
 * - Destination commune
 * - Warehouse location (Algiers vs Harrouch - chooses cheapest)
 * - Delivery type (home vs stop desk)
 * - COD fees and insurance
 * 
 * Performance:
 * - Uses cached fee data (no API calls)
 * - Pre-indexed data by wilaya for O(1) lookups
 * - Efficient weight calculations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ShippingCalculator {
  constructor() {
    this.dataDir = path.join(__dirname, '../../../database/shipping');
    this.cache = {
      fees: {
        algiers: null,
        harrouch: null
      },
      communes: null,
      lastLoaded: null
    };
    this.cacheMaxAge = 3600000; // 1 hour in milliseconds
  }

  /**
   * Load cached fee data
   * @private
   */
  async loadFeeData() {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.cache.lastLoaded && (now - this.cache.lastLoaded) < this.cacheMaxAge) {
      return this.cache.fees;
    }

    try {
      // Load fees from both warehouses
      const algiersPath = path.join(this.dataDir, 'fees-from-16.json');
      const harrouchPath = path.join(this.dataDir, 'fees-from-21.json');

      const [algiersData, harrouchData] = await Promise.all([
        fs.readFile(algiersPath, 'utf8').then(JSON.parse),
        fs.readFile(harrouchPath, 'utf8').then(JSON.parse)
      ]);

      this.cache.fees = {
        algiers: algiersData.data,
        harrouch: harrouchData.data
      };
      this.cache.lastLoaded = now;

      return this.cache.fees;
    } catch (error) {
      console.error('[Shipping Calculator] Failed to load fee data:', error.message);
      throw new Error('Shipping fee data not available. Please run sync first.');
    }
  }

  /**
   * Load communes data
   * @private
   */
  async loadCommunesData() {
    if (this.cache.communes) {
      return this.cache.communes;
    }

    try {
      const communesPath = path.join(this.dataDir, 'communes.json');
      const data = await fs.readFile(communesPath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Create lookup map for O(1) access
      const communeMap = {};
      for (const commune of parsed.data) {
        communeMap[commune.id] = commune;
      }

      this.cache.communes = communeMap;
      return communeMap;
    } catch (error) {
      console.error('[Shipping Calculator] Failed to load communes data:', error.message);
      throw new Error('Commune data not available. Please run sync first.');
    }
  }

  /**
   * Calculate volumetric weight
   * Formula: width (cm) × height (cm) × length (cm) × 0.0002
   */
  calculateVolumetricWeight(length, width, height) {
    if (!length || !width || !height) {
      return 0;
    }
    
    return length * width * height * 0.0002; // Result in kg
  }

  /**
   * Calculate billable weight (max of actual vs volumetric)
   */
  calculateBillableWeight(actualWeight, length, width, height) {
    const volumetricWeight = this.calculateVolumetricWeight(length, width, height);
    return Math.max(actualWeight || 0, volumetricWeight);
  }

  /**
   * Calculate overweight fee
   * First 5kg are free. Above 5kg: (billableWeight - 5) × oversizeFee
   */
  calculateOverweightFee(billableWeight, oversizeFee) {
    if (billableWeight <= 5) {
      return 0;
    }
    
    const excessWeight = billableWeight - 5;
    return Math.ceil(excessWeight) * oversizeFee; // Round up excess weight
  }

  /**
   * Calculate COD fee
   * Formula: (price × codPercentage) / 100
   * Only applied if price >= taxeFrom threshold
   * 
   * NOTE: COD fee is currently DISABLED. Uncomment the code below to re-enable.
   */
  calculateCODFee(price, codPercentage, taxeFrom) {
    // COD fee disabled - return 0 for now
    return 0;
    
    // Uncomment below to re-enable COD fee calculation:
    // if (price < taxeFrom) {
    //   return 0;
    // }
    // return Math.round((price * codPercentage) / 100);
  }

  /**
   * Calculate insurance fee
   * Formula: (declaredValue × insurancePercentage) / 100
   */
  calculateInsuranceFee(declaredValue, insurancePercentage, hasInsurance) {
    if (!hasInsurance) {
      return 0;
    }
    
    return Math.round((declaredValue * insurancePercentage) / 100);
  }

  /**
   * Get shipping cost from specific warehouse to commune
   * @private
   */
  async getShippingCostFromWarehouse(warehouseFees, communeId, isStopDesk, productDetails, warehouseWilayaId) {
    const communes = await this.loadCommunesData();
    const commune = communes[communeId];
    
    if (!commune) {
      throw new Error(`Commune ${communeId} not found in database`);
    }

    if (!commune.is_deliverable) {
      throw new Error(`Commune ${commune.name} is not deliverable`);
    }

    const targetWilayaId = commune.wilaya_id;
    
    // LOCAL DELIVERY (same wilaya as warehouse)
    if (targetWilayaId === warehouseWilayaId) {
      // Use fixed local delivery rates
      const localRates = {
        express_home: 500,    // Local home delivery
        express_desk: 400,    // Local stop desk
        economic_home: 400,   // Economy local home
        economic_desk: 300    // Economy local stop desk
      };
      
      // Verify stop desk availability if requested
      if (isStopDesk && !commune.has_stop_desk) {
        throw new Error(`Commune ${commune.name} does not have stop desk service`);
      }
      
      const baseFee = isStopDesk ? localRates.express_desk : localRates.express_home;

      // Local deliveries: minimal fees
      const billableWeight = this.calculateBillableWeight(
        productDetails.weight,
        productDetails.length,
        productDetails.width,
        productDetails.height
      );

      const overweightFee = billableWeight > 5 ? (Math.ceil(billableWeight - 5) * 50) : 0; // 50 DA/kg for local
      const codFee = this.calculateCODFee(productDetails.price, 0.5, 10000); // Lower COD % for local
      const insuranceFee = this.calculateInsuranceFee(
        productDetails.declaredValue || productDetails.price,
        0,
        productDetails.hasInsurance
      );

      const finalResult = baseFee + overweightFee + codFee + insuranceFee;
      return {
        baseFee,
        overweightFee,
        billableWeight,
        codFee,
        insuranceFee,
        totalShippingCost: Math.floor(finalResult / 100) * 100,
        deliveryTime: commune.delivery_time_parcel || 2,
        communeName: commune.name,
        wilayaName: commune.wilaya_name,
        zone: 0, // Local = zone 0
        retourFee: 200, // Lower return fee for local
        isLocal: true,
        deliveryType: isStopDesk ? 'stop_desk' : 'home'
      };
    }

    // INTER-WILAYA DELIVERY
    const wilayaFees = warehouseFees[targetWilayaId];
    
    if (!wilayaFees || !wilayaFees.per_commune) {
      throw new Error(`No fee data found for wilaya ${targetWilayaId} (${commune.wilaya_name})`);
    }

    const communeFees = wilayaFees.per_commune[communeId];
    
    if (!communeFees) {
      throw new Error(`Commune ${communeId} not found in fee data for wilaya ${targetWilayaId}`);
    }

    // Get base delivery fee
    let baseFee;
    
    if (isStopDesk) {
      // Verify commune has stop desk
      if (!commune.has_stop_desk) {
        throw new Error(`Commune ${commune.name} does not have stop desk service`);
      }
      baseFee = communeFees.express_desk;
    } else {
      baseFee = communeFees.express_home;
    }

    if (baseFee === null || baseFee === undefined) {
      throw new Error(`No ${isStopDesk ? 'stop desk' : 'home'} delivery available for ${commune.name}`);
    }

    // Calculate billable weight
    const billableWeight = this.calculateBillableWeight(
      productDetails.weight,
      productDetails.length,
      productDetails.width,
      productDetails.height
    );

    // Calculate overweight fee
    const overweightFee = this.calculateOverweightFee(
      billableWeight,
      wilayaFees.oversize_fee
    );

    // Calculate COD fee (on the higher of price or declared value)
    const baseAmount = Math.max(productDetails.price, productDetails.declaredValue || 0);
    const codFee = this.calculateCODFee(
      baseAmount,
      wilayaFees.cod_percentage,
      wilayaFees.taxe_from || 10000
    );

    // Calculate insurance fee
    const insuranceFee = this.calculateInsuranceFee(
      productDetails.declaredValue || productDetails.price,
      wilayaFees.insurance_percentage,
      productDetails.hasInsurance
    );

    // Total shipping cost
    const finalResult = baseFee + overweightFee + codFee + insuranceFee;
    const totalShippingCost = Math.floor(finalResult / 100) * 100;

    return {
      baseFee,
      overweightFee,
      billableWeight,
      codFee,
      insuranceFee,
      totalShippingCost,
      deliveryTime: commune.delivery_time_parcel,
      communeName: commune.name,
      wilayaName: commune.wilaya_name,
      zone: wilayaFees.zone,
      retourFee: wilayaFees.retour_fee,
      deliveryType: isStopDesk ? 'stop_desk' : 'home'
    };
  }

  /**
   * Calculate shipping cost with warehouse selection
   * Automatically chooses the cheapest warehouse that has stock
   * @param {object} options - Shipping calculation options
   * @param {number} options.communeId - Destination commune ID
   * @param {boolean} options.isStopDesk - Stop desk delivery flag
   * @param {number} options.price - Product price for COD calculation
   * @param {number} options.declaredValue - Declared value for insurance
   * @param {boolean} options.hasInsurance - Whether insurance is requested
   * @param {number} options.weight - Actual weight in kg
   * @param {number} options.length - Length in cm
   * @param {number} options.width - Width in cm
   * @param {number} options.height - Height in cm
   * @param {string} options.warehousePreference - 'algiers', 'harrouch', or null (auto)
   * @param {Array} options.availableWarehouses - Array of warehouse IDs that have stock (e.g., [1, 2])
   */
  async calculateShipping(options) {
    const {
      communeId,
      isStopDesk = false,
      price,
      declaredValue = null,
      hasInsurance = false,
      weight = 0,
      length = 0,
      width = 0,
      height = 0,
      warehousePreference = null, // 'algiers', 'harrouch', or null (auto)
      availableWarehouses = [1, 2] // Default: both warehouses available
    } = options;

    // Validation
    if (!communeId) {
      throw new Error('Commune ID is required');
    }

    if (!price || price < 0) {
      throw new Error('Valid price is required');
    }

    if (weight < 0 || length < 0 || width < 0 || height < 0) {
      throw new Error('Dimensions and weight must be non-negative');
    }

    // Load fee data
    const fees = await this.loadFeeData();

    const productDetails = {
      price,
      declaredValue: declaredValue || price,
      hasInsurance,
      weight,
      length,
      width,
      height
    };

    // Calculate from warehouses that have stock
    const calculations = {};
    const errors = {};

    const canUseAlgiers = availableWarehouses.includes(1);
    const canUseHarrouch = availableWarehouses.includes(2);

    if (canUseAlgiers && (!warehousePreference || warehousePreference === 'algiers')) {
      try {
        calculations.algiers = await this.getShippingCostFromWarehouse(
          fees.algiers,
          communeId,
          isStopDesk,
          productDetails,
          16 // Algiers warehouse wilaya ID
        );
      } catch (error) {
        console.warn('[Shipping Calculator] Algiers warehouse error:', error.message);
        errors.algiers = error.message;
      }
    }

    if (canUseHarrouch && (!warehousePreference || warehousePreference === 'harrouch')) {
      try {
        calculations.harrouch = await this.getShippingCostFromWarehouse(
          fees.harrouch,
          communeId,
          isStopDesk,
          productDetails,
          21 // Harrouch/Skikda warehouse wilaya ID
        );
      } catch (error) {
        console.warn('[Shipping Calculator] Harrouch warehouse error:', error.message);
        errors.harrouch = error.message;
      }
    }

    // Choose cheapest option
    let selectedWarehouse = null;
    let shippingDetails = null;

    if (calculations.algiers && calculations.harrouch) {
      if (calculations.algiers.totalShippingCost <= calculations.harrouch.totalShippingCost) {
        selectedWarehouse = 'algiers';
        shippingDetails = calculations.algiers;
      } else {
        selectedWarehouse = 'harrouch';
        shippingDetails = calculations.harrouch;
      }
    } else if (calculations.algiers) {
      selectedWarehouse = 'algiers';
      shippingDetails = calculations.algiers;
    } else if (calculations.harrouch) {
      selectedWarehouse = 'harrouch';
      shippingDetails = calculations.harrouch;
    } else {
      const errorMsg = `Unable to calculate shipping from any warehouse. Errors: ${JSON.stringify(errors)}`;
      console.error('[Shipping Calculator]', errorMsg);
      throw new Error(errorMsg);
    }

    return {
      ...shippingDetails,
      selectedWarehouse,
      warehouseWilayaId: selectedWarehouse === 'algiers' ? 16 : 21,
      warehouseName: selectedWarehouse === 'algiers' ? 'Alger' : 'Skikda',
      alternativeOptions: calculations,
      deliveryType: isStopDesk ? 'stop_desk' : 'home'
    };
  }

  /**
   * Calculate shipping for multiple items (cart)
   */
  async calculateCartShipping(options) {
    const {
      items = [],
      communeId,
      isStopDesk = false
    } = options;

    if (!items || items.length === 0) {
      throw new Error('Cart items are required');
    }

    // Sum up all product dimensions and weights
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0);
    const totalPrice = items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
    const totalDeclaredValue = items.reduce((sum, item) => 
      sum + (item.declaredValue || item.price) * (item.quantity || 1), 0
    );

    // For dimensions, use the largest item (conservative approach)
    const maxLength = Math.max(...items.map(i => i.length || 0));
    const maxWidth = Math.max(...items.map(i => i.width || 0));
    const maxHeight = Math.max(...items.map(i => i.height || 0));

    // Check if any item requires insurance
    const hasInsurance = items.some(item => item.hasInsurance);

    return this.calculateShipping({
      communeId,
      isStopDesk,
      price: totalPrice,
      declaredValue: totalDeclaredValue,
      hasInsurance,
      weight: totalWeight,
      length: maxLength,
      width: maxWidth,
      height: maxHeight
    });
  }

  /**
   * Get available stop desks in a wilaya
   */
  async getStopDesksInWilaya(wilayaId) {
    const communes = await this.loadCommunesData();
    
    const stopDesks = Object.values(communes).filter(commune => 
      commune.wilaya_id === parseInt(wilayaId) && 
      commune.has_stop_desk === 1 &&
      commune.is_deliverable === 1
    );

    return stopDesks.map(commune => ({
      commune_id: commune.id,
      commune_name: commune.name,
      wilaya_id: commune.wilaya_id,
      wilaya_name: commune.wilaya_name,
      delivery_time: commune.delivery_time_parcel
    }));
  }

  /**
   * Validate address deliverability
   */
  async validateAddress(communeId, isStopDesk = false) {
    const communes = await this.loadCommunesData();
    const commune = communes[communeId];

    if (!commune) {
      return {
        valid: false,
        error: 'Commune not found',
        code: 'COMMUNE_NOT_FOUND'
      };
    }

    if (!commune.is_deliverable) {
      return {
        valid: false,
        error: `Delivery not available to ${commune.name}`,
        code: 'NOT_DELIVERABLE',
        commune
      };
    }

    if (isStopDesk && !commune.has_stop_desk) {
      // Get available stop desks in the same wilaya
      const availableStopDesks = await this.getStopDesksInWilaya(commune.wilaya_id);
      
      return {
        valid: false,
        error: `Stop desk service not available in ${commune.name}`,
        code: 'NO_STOP_DESK',
        commune,
        availableStopDesks, // Return list of alternatives
        wilayaId: commune.wilaya_id,
        wilayaName: commune.wilaya_name
      };
    }

    return {
      valid: true,
      commune,
      deliveryTime: commune.delivery_time_parcel
    };
  }

  /**
   * Get delivery estimate
   */
  async getDeliveryEstimate(communeId) {
    const communes = await this.loadCommunesData();
    const commune = communes[communeId];

    if (!commune) {
      throw new Error('Commune not found');
    }

    const estimatedDays = commune.delivery_time_parcel || 3;
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + estimatedDays);

    return {
      communeName: commune.name,
      wilayaName: commune.wilaya_name,
      estimatedDays,
      estimatedDate: estimatedDate.toISOString(),
      estimatedDelivery: `${estimatedDays} business day${estimatedDays > 1 ? 's' : ''}`
    };
  }

  /**
   * Clear cache (useful after sync)
   */
  clearCache() {
    this.cache = {
      fees: {
        algiers: null,
        harrouch: null
      },
      communes: null,
      lastLoaded: null
    };
  }
}

// Export singleton instance
const shippingCalculator = new ShippingCalculator();

export default shippingCalculator;
