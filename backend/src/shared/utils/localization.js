/**
 * Localization Utilities
 * Helper functions for handling bilingual data (French/Arabic)
 */

// Supported locales
export const SUPPORTED_LOCALES = ['fr', 'ar'];
export const DEFAULT_LOCALE = 'fr';

/**
 * Get localized field from bilingual object
 * Handles both legacy string format and new bilingual object format
 * 
 * @param {object|string} field - Bilingual object { fr: "...", ar: "..." } or legacy string
 * @param {string} locale - Target locale ("fr" or "ar")
 * @param {string} fallback - Fallback locale if target is empty (default: "fr")
 * @returns {string} Localized string value
 * 
 * @example
 * getLocalizedField({ fr: "Ordinateurs", ar: "حواسيب" }, 'ar') // "حواسيب"
 * getLocalizedField("Legacy string", 'ar') // "Legacy string" (backward compatible)
 * getLocalizedField({ fr: "Test", ar: "" }, 'ar') // "Test" (fallback to fr)
 */
export function getLocalizedField(field, locale = DEFAULT_LOCALE, fallback = DEFAULT_LOCALE) {
    // Handle null/undefined
    if (field == null) {
        return '';
    }

    // Handle legacy string format (backward compatibility)
    if (typeof field === 'string') {
        return field;
    }

    // Handle bilingual object format
    if (typeof field === 'object') {
        const value = field[locale];

        // Return target locale value if it exists and is not empty
        if (value && value.trim() !== '') {
            return value;
        }

        // Fallback to default locale
        if (locale !== fallback && field[fallback]) {
            return field[fallback];
        }

        // Last resort: return first non-empty value
        for (const key of SUPPORTED_LOCALES) {
            if (field[key] && field[key].trim() !== '') {
                return field[key];
            }
        }
    }

    return '';
}

/**
 * Create bilingual object from a single value
 * Used when receiving data from forms that may send new bilingual format
 * 
 * @param {string|object} value - Value to normalize
 * @param {string} locale - Which locale the value belongs to (if string)
 * @returns {object} Bilingual object { fr: "...", ar: "..." }
 * 
 * @example
 * createBilingualField("Test", "fr") // { fr: "Test", ar: "" }
 * createBilingualField({ fr: "A", ar: "ب" }) // { fr: "A", ar: "ب" } (unchanged)
 */
export function createBilingualField(value, locale = DEFAULT_LOCALE) {
    // Already in bilingual format
    if (value && typeof value === 'object' && (value.fr !== undefined || value.ar !== undefined)) {
        return {
            fr: value.fr || '',
            ar: value.ar || ''
        };
    }

    // Convert string to bilingual object
    const stringValue = value != null ? String(value) : '';
    return {
        fr: locale === 'fr' ? stringValue : '',
        ar: locale === 'ar' ? stringValue : ''
    };
}

/**
 * Check if a value is in bilingual format
 * 
 * @param {any} value - Value to check
 * @returns {boolean} True if bilingual object format
 */
export function isBilingualField(value) {
    return (
        value != null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (typeof value.fr === 'string' || typeof value.ar === 'string')
    );
}

/**
 * Generate URL slug from bilingual name (uses French version)
 * Handles French accented characters properly
 * 
 * @param {object|string} name - Bilingual name object or legacy string
 * @returns {string} URL-friendly slug
 * 
 * @example
 * generateBilingualSlug({ fr: "Écrans & Data Show", ar: "شاشات" }) // "ecrans-data-show"
 * generateBilingualSlug("Ordinateurs portables") // "ordinateurs-portables"
 */
export function generateBilingualSlug(name) {
    // Extract French version if bilingual, otherwise use as-is
    const text = typeof name === 'object' ? (name.fr || '') : String(name || '');

    return text
        .toLowerCase()
        // French accent replacements
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[æ]/g, 'ae')
        .replace(/[ç]/g, 'c')
        .replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i')
        .replace(/[ñ]/g, 'n')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[œ]/g, 'oe')
        .replace(/[ùúûü]/g, 'u')
        .replace(/[ýÿ]/g, 'y')
        // Remove special characters, keep alphanumeric and spaces
        .replace(/[^a-z0-9\s-]/g, '')
        // Replace spaces and multiple hyphens with single hyphen
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '');
}

/**
 * Normalize locale string to supported format
 * 
 * @param {string} locale - Input locale (e.g., "ar-DZ", "fr-FR", "ar")
 * @returns {string} Normalized locale ("fr" or "ar")
 */
export function normalizeLocale(locale) {
    if (!locale || typeof locale !== 'string') {
        return DEFAULT_LOCALE;
    }

    const normalized = locale.toLowerCase().split('-')[0];
    return SUPPORTED_LOCALES.includes(normalized) ? normalized : DEFAULT_LOCALE;
}

export default {
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
    getLocalizedField,
    createBilingualField,
    isBilingualField,
    generateBilingualSlug,
    normalizeLocale
};
