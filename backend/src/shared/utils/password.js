import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import { ValidationError } from '../errors/index.js';

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

/**
 * Hash a plain text password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compare plain text password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
export const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Check if a string is a bcrypt hash
 * @param {string} str - String to check
 * @returns {boolean} True if string appears to be a bcrypt hash
 */
export const isBcryptHash = (str) => {
  // Bcrypt hashes start with $2a$, $2b$, or $2y$
  return /^\$2[aby]\$\d{2}\$/.test(str);
};

/**
 * Password strength validation rules
 */
export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false, // Optional for better UX
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export const validatePasswordStrength = (password) => {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password is required'] };
  }

  // Basic length check first
  if (password.length < PASSWORD_RULES.minLength) {
    errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters`);
  }

  if (password.length > PASSWORD_RULES.maxLength) {
    errors.push(`Password must be less than ${PASSWORD_RULES.maxLength} characters`);
  }

  // Zxcvbn Entropy Check
  const result = zxcvbn(password);

  // Score 0-4 (0=too guessable, 4=very unguessable)
  // We require at least 3 (Safe against offline slow hashing scenarios approx)
  if (result.score < 3) {
    errors.push('Password is too weak.');
    if (result.feedback.warning) {
      errors.push(result.feedback.warning);
    }
    result.feedback.suggestions.forEach(s => errors.push(s));
  }

  return {
    isValid: errors.length === 0,
    errors,
    score: result.score
  };
};

/**
 * Validate password and throw if invalid
 * @param {string} password - Password to validate
 * @throws {ValidationError} If password is invalid
 */
export const assertPasswordValid = (password) => {
  const { isValid, errors } = validatePasswordStrength(password);
  if (!isValid) {
    throw new ValidationError(
      errors.map(msg => ({ field: 'password', message: msg })),
      'Password does not meet requirements'
    );
  }
};

export default {
  hashPassword,
  verifyPassword,
  isBcryptHash,
  validatePasswordStrength,
  assertPasswordValid,
  PASSWORD_RULES,
};
