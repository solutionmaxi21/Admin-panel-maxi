/**
 * Shared Utilities Index
 * Central export point for all utility functions
 */

// Database helpers
export {
  readJSON,
  writeJSON,
  readJSONSync,
  writeJSONSync
} from './database-helpers.js';

// ID generation utilities
export {
  getNextId,
  formatId,
  parseId,
  generateSlug
} from './id-generator.js';

// File paths
export {
  DB_PATHS,
  getAllDatabasePaths,
  validateDatabaseFiles
} from './file-paths.js';

// Logger
export {
  logger,
  generateRequestId,
  createChildLogger,
  requestLogger,
  securityLogger,
  auditLogger,
  performanceLogger,
  logError,
  logSecurityEvent,
  logAuditEvent
} from './logger.js';

// Localization utilities
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  getLocalizedField,
  createBilingualField,
  isBilingualField,
  generateBilingualSlug,
  normalizeLocale
} from './localization.js';
