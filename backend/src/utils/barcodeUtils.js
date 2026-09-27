/**
 * Barcode Utilities
 * Handles barcode generation, validation, and formatting
 * Supports EAN-13, UPC-A, and Code128 formats
 */

/**
 * Generate EAN-13 barcode from product ID
 * EAN-13 format: [2-digit country][5-digit manufacturer][5-digit product][1-digit check]
 * Using: 61 (Algeria country code) + padding
 * 
 * @param {number} productId - Product ID to generate barcode from
 * @returns {string} EAN-13 barcode
 */
function generateEAN13(productId) {
  // Country code for Algeria: 61
  const countryCode = '61';
  
  // Pad product ID to 10 digits (61 + 10 = 12 digits, then checksum = 13)
  const paddedId = String(productId).padStart(10, '0');
  
  // Concatenate: country code + padded ID = 12 digits
  const barcode12 = countryCode + paddedId;
  
  // Calculate EAN-13 checksum
  const checksum = calculateEAN13Checksum(barcode12);
  
  return barcode12 + checksum;
}

/**
 * Calculate EAN-13 checksum using standard algorithm
 * @param {string} barcode12 - 12-digit barcode without checksum
 * @returns {string} Single checksum digit
 */
function calculateEAN13Checksum(barcode12) {
  let sum = 0;
  
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(barcode12[i], 10);
    // Odd positions (1-indexed) get weight 1, even get weight 3
    const weight = (i % 2 === 0) ? 1 : 3;
    sum += digit * weight;
  }
  
  // Checksum is (10 - (sum mod 10)) mod 10
  const checksum = (10 - (sum % 10)) % 10;
  return String(checksum);
}

/**
 * Validate EAN-13 barcode format and checksum
 * @param {string} barcode - Barcode to validate
 * @returns {boolean} True if valid EAN-13
 */
function isValidEAN13(barcode) {
  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(barcode)) {
    return false;
  }
  
  // Verify checksum
  const barcode12 = barcode.substring(0, 12);
  const providedChecksum = barcode[12];
  const calculatedChecksum = calculateEAN13Checksum(barcode12);
  
  return providedChecksum === calculatedChecksum;
}

/**
 * Validate barcode format (generic validation)
 * Accepts: EAN-13 (13 digits), UPC-A (12 digits), Code128 (alphanumeric)
 * 
 * @param {string} barcode - Barcode to validate
 * @returns {object} Validation result with format and valid status
 */
function validateBarcode(barcode) {
  if (!barcode || typeof barcode !== 'string') {
    return { valid: false, format: null, error: 'Barcode must be a non-empty string' };
  }
  
  const trimmed = barcode.trim();
  
  // EAN-13: 13 digits
  if (/^\d{13}$/.test(trimmed)) {
    return {
      valid: isValidEAN13(trimmed),
      format: 'EAN-13',
      barcode: trimmed,
      error: isValidEAN13(trimmed) ? null : 'Invalid EAN-13 checksum'
    };
  }
  
  // UPC-A: 12 digits
  if (/^\d{12}$/.test(trimmed)) {
    return {
      valid: true,
      format: 'UPC-A',
      barcode: trimmed,
      error: null
    };
  }
  
  // Code128: Alphanumeric + special chars
  if (/^[a-zA-Z0-9\-_]{6,}$/.test(trimmed)) {
    return {
      valid: true,
      format: 'Code128',
      barcode: trimmed,
      error: null
    };
  }
  
  return {
    valid: false,
    format: null,
    barcode: trimmed,
    error: 'Barcode format not recognized. Use EAN-13 (13 digits), UPC-A (12 digits), or Code128 (alphanumeric)'
  };
}

/**
 * Normalize barcode for storage and lookup
 * Removes whitespace, converts to uppercase for Code128
 * 
 * @param {string} barcode - Raw barcode input
 * @returns {string} Normalized barcode
 */
function normalizeBarcode(barcode) {
  return barcode.trim().toUpperCase();
}

/**
 * Generate barcode from SKU with prefix
 * Creates unique barcode based on SKU with format: PREFIX_SKU
 * 
 * @param {string} sku - Product SKU
 * @param {string} prefix - Optional prefix (default: 'ALG')
 * @returns {string} Generated barcode
 */
function generateFromSKU(sku, prefix = 'ALG') {
  if (!sku || typeof sku !== 'string') {
    throw new Error('SKU must be a non-empty string');
  }
  
  // Format: PREFIX_SKU (example: ALG_CPU001)
  return `${prefix}_${sku}`.toUpperCase();
}

/**
 * Batch generate EAN-13 barcodes for multiple product IDs
 * @param {number[]} productIds - Array of product IDs
 * @returns {object[]} Array of {productId, barcode} pairs
 */
function batchGenerateEAN13(productIds) {
  if (!Array.isArray(productIds)) {
    throw new Error('productIds must be an array');
  }
  
  return productIds.map(productId => ({
    productId,
    barcode: generateEAN13(productId)
  }));
}

/**
 * Format barcode for display
 * Adds visual separators for readability
 * 
 * @param {string} barcode - Barcode string
 * @returns {string} Formatted barcode
 */
function formatBarcodeForDisplay(barcode) {
  const normalized = normalizeBarcode(barcode);
  
  // EAN-13: Format as XXX-XXX-XXX-XXXX
  if (/^\d{13}$/.test(normalized)) {
    return `${normalized.substring(0, 3)}-${normalized.substring(3, 6)}-${normalized.substring(6, 9)}-${normalized.substring(9)}`;
  }
  
  // UPC-A: Format as XXXX-XXX-XXXX
  if (/^\d{12}$/.test(normalized)) {
    return `${normalized.substring(0, 4)}-${normalized.substring(4, 7)}-${normalized.substring(7)}`;
  }
  
  // Code128: Keep as-is, but add underscores for readability
  return normalized.replace(/_/g, ' - ');
}

/**
 * Get barcode configuration object
 * Can be used in frontend/admin to configure barcode behavior
 * 
 * @returns {object} Configuration object
 */
function getBarcodeConfig() {
  return {
    formats: {
      ean13: {
        name: 'EAN-13',
        length: 13,
        description: 'European Article Number (Standard retail barcode)',
        checksum: true
      },
      upca: {
        name: 'UPC-A',
        length: 12,
        description: 'Universal Product Code (North America)',
        checksum: true
      },
      code128: {
        name: 'Code128',
        length: 'variable',
        description: 'Code 128 (Alphanumeric, warehouse/internal)',
        checksum: false
      }
    },
    countryCode: {
      Algeria: '61',
      description: 'EAN country prefix for Algeria'
    },
    defaults: {
      format: 'EAN-13',
      generateMethod: 'ean13',
      prefix: 'ALG'
    },
    validation: {
      minLength: 6,
      maxLength: 255,
      allowedPatterns: [
        '^\\d{13}$', // EAN-13
        '^\\d{12}$', // UPC-A
        '^[a-zA-Z0-9\\-_]{6,}$' // Code128
      ]
    }
  };
}

/**
 * Generate EAN-13 barcode for a variant.
 * Uses manufacturer prefix "1" to avoid collisions with product barcodes (prefix "0").
 *
 * @param {number} variantId - Variant ID
 * @returns {string} EAN-13 barcode
 */
function generateEAN13ForVariant(variantId) {
  const countryCode = '61';
  // Prefix "1" distinguishes variant barcodes from product barcodes (prefix "0")
  const prefix = '1';
  const paddedId = String(variantId).padStart(9, '0');
  const barcode12 = countryCode + prefix + paddedId;
  const checksum = calculateEAN13Checksum(barcode12);
  return barcode12 + checksum;
}

export {
  generateEAN13,
  generateEAN13ForVariant,
  calculateEAN13Checksum,
  isValidEAN13,
  validateBarcode,
  normalizeBarcode,
  batchGenerateEAN13,
  formatBarcodeForDisplay,
  getBarcodeConfig
};
