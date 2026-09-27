/**
 * Locale Detection Middleware
 * Extracts user locale from request and sets req.locale
 */

import { SUPPORTED_LOCALES, DEFAULT_LOCALE, normalizeLocale } from '../utils/localization.js';

/**
 * Middleware to detect and set user locale from request
 * Priority: query param > Accept-Language header > default
 * 
 * Sets req.locale to 'fr' or 'ar'
 * 
 * @example
 * // Query param: GET /api/categories?lang=ar
 * // Header: Accept-Language: ar-DZ,ar;q=0.9,fr;q=0.8
 */
export function localeMiddleware(req, res, next) {
    let locale = null;

    // 1. Check query parameters (highest priority)
    if (req.query.lang) {
        locale = normalizeLocale(req.query.lang);
    } else if (req.query.locale) {
        locale = normalizeLocale(req.query.locale);
    }

    // 2. Check Accept-Language header
    if (!locale) {
        const acceptLanguage = req.headers['accept-language'];
        if (acceptLanguage) {
            // Parse Accept-Language header (e.g., "ar-DZ,ar;q=0.9,fr;q=0.8")
            const languages = acceptLanguage
                .split(',')
                .map(lang => {
                    const [code, qValue] = lang.trim().split(';q=');
                    return {
                        code: code.split('-')[0].toLowerCase(),
                        q: qValue ? parseFloat(qValue) : 1
                    };
                })
                .sort((a, b) => b.q - a.q);

            // Find first supported locale
            for (const lang of languages) {
                if (SUPPORTED_LOCALES.includes(lang.code)) {
                    locale = lang.code;
                    break;
                }
            }
        }
    }

    // 3. Default fallback
    req.locale = locale || DEFAULT_LOCALE;

    // Also set response header for client reference
    res.setHeader('Content-Language', req.locale);

    next();
}

/**
 * Get locale from request (can be used in route handlers)
 * 
 * @param {Request} req - Express request object
 * @returns {string} Locale ('fr' or 'ar')
 */
export function getLocaleFromRequest(req) {
    return req.locale || DEFAULT_LOCALE;
}

export default localeMiddleware;
