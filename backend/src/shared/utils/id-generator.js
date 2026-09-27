/**
 * Generate next ID from an array of items
 * @param {Array} items - Array of items with numeric ID field
 * @param {string} idField - Name of the ID field (default: 'id')
 * @returns {number} Next available ID
 */
export function getNextId(items, idField = 'id') {
  if (!items || items.length === 0) return 1;
  
  const ids = items.map(item => {
    const id = item[idField];
    return typeof id === 'number' ? id : 0;
  });
  
  return Math.max(...ids) + 1;
}

/**
 * Generate a formatted ID string
 * @param {number} id - Numeric ID
 * @param {string} prefix - Prefix for the ID (e.g., 'ORD', 'USR')
 * @param {number} padLength - Length to pad with zeros (default: 6)
 * @returns {string} Formatted ID (e.g., 'ORD-000123')
 */
export function formatId(id, prefix, padLength = 6) {
  const paddedId = String(id).padStart(padLength, '0');
  return `${prefix}-${paddedId}`;
}

/**
 * Parse a formatted ID string back to numeric ID
 * @param {string} formattedId - Formatted ID string (e.g., 'ORD-000123')
 * @param {string} prefix - Expected prefix (optional, for validation)
 * @returns {number} Numeric ID
 */
export function parseId(formattedId, prefix = null) {
  if (!formattedId) return null;
  
  const parts = formattedId.split('-');
  if (parts.length < 2) {
    // Try parsing as direct number
    const num = parseInt(formattedId);
    return isNaN(num) ? null : num;
  }
  
  if (prefix && parts[0] !== prefix) {
    throw new Error(`Invalid ID format. Expected prefix: ${prefix}, got: ${parts[0]}`);
  }
  
  const num = parseInt(parts[1]);
  return isNaN(num) ? null : num;
}

/**
 * Generate a unique slug from a string
 * @param {string} text - Text to convert to slug
 * @returns {string} URL-safe slug
 */
export function generateSlug(text) {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')      // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '');         // Remove leading/trailing hyphens
}
