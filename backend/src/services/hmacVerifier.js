/**
 * HMAC Verification for Offline Mutations
 * Validates that mutations signed by the client haven't been tampered with
 */

import crypto from 'crypto';

/**
 * Derive HMAC key from user ID and issued-at timestamp (matches client logic)
 * @param {number} userId - User ID
 * @param {number} iat - JWT issued-at timestamp (seconds)
 * @returns {Buffer} 256-bit key for HMAC operations
 */
export function deriveHMACKey(userId, iat) {
  const salt = `${userId}:${iat}`;

  if (!process.env.HMAC_SECRET) {
    throw new Error('HMAC_SECRET is missing. Set it in backend/.env and restart the server.');
  }
  
  console.log(
    `[HMAC] Deriving key user=${userId} iat=${iat} secretLen=${process.env.HMAC_SECRET.length}`
  );

  return crypto.pbkdf2Sync(
    salt,
    process.env.HMAC_SECRET,
    100000,  // iterations (must match client)
    32,      // 256 bits
    'sha256'
  );
}

/**
 * Verify HMAC signature of a mutation payload
 * @param {object} payload - Mutation payload { idempotencyKey, data, timestamp, signature }
 * @param {string} signature - Base64-encoded HMAC-SHA256 signature
 * @param {number} userId - User ID
 * @param {number} iat - JWT issued-at timestamp
 * @returns {boolean} True if signature is valid
 */
export function verifyMutationSignature(payload, signature, userId, iat) {
  try {
    console.log(`🔍 Verifying signature for user ${userId}, iat=${iat}:`);
    
    const key = deriveHMACKey(userId, iat);
    
    // Reconstruct the exact payload format the client used
    const payloadString = JSON.stringify({
      idempotencyKey: payload.idempotencyKey,
      data: payload.data,
      timestamp: payload.timestamp,
    });
    
    console.log(`  Payload: ${payloadString.substring(0, 100)}...`);
    console.log(`  Signature: ${signature.substring(0, 24)}...`);
    console.log(`  Payload length: ${payloadString.length}`);
    
    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', key)
      .update(payloadString)
      .digest('base64');
    
    console.log(`  Expected: ${expectedSignature.substring(0, 20)}...`);
    console.log(`  Match: ${signature === expectedSignature}`);
    
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  } catch (error) {
    console.error('❌ HMAC verification error:', error.message);
    return false;
  }
}

/**
 * Validate mutation structure and basic sanity checks
 * @param {object} mutation - Mutation object { type, mutation, signature }
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateMutationStructure(mutation) {
  const errors = [];
  
  if (!mutation.type) errors.push('Missing mutation type');
  if (!mutation.mutation) errors.push('Missing mutation payload');
  if (!mutation.mutation.idempotencyKey) errors.push('Missing mutation.idempotencyKey field');
  if (!mutation.mutation.data) errors.push('Missing mutation.data field');
  if (!mutation.mutation.timestamp) errors.push('Missing mutation.timestamp field');
  if (!mutation.signature) errors.push('Missing signature');
  
  // Check timestamp is reasonable (within last 7 days)
  const now = Date.now();
  const mutationTime = parseInt(mutation.mutation.timestamp);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  
  if (isNaN(mutationTime)) {
    errors.push('Invalid timestamp format');
  } else if (now - mutationTime > sevenDaysMs) {
    errors.push('Mutation too old (> 7 days)');
  } else if (mutationTime > now + 60000) {
    // Allow 1 minute clock skew
    errors.push('Mutation timestamp in future');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Supported mutation types and their handlers
 */
export const MUTATION_TYPES = {
  ADD_TO_CART: 'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  UPDATE_QUANTITY: 'update_quantity',
  CLEAR_CART: 'clear_cart',
  ADD_TO_WISHLIST: 'add_to_wishlist',
  REMOVE_FROM_WISHLIST: 'remove_from_wishlist',
  CLEAR_WISHLIST: 'clear_wishlist',
  APPLY_PROMO: 'apply_promo',
};

export const SUPPORTED_MUTATIONS = Object.values(MUTATION_TYPES);

/**
 * Validate mutation type is supported
 * @param {string} type - Mutation type
 * @returns {boolean} True if supported
 */
export function isSupportedMutation(type) {
  return SUPPORTED_MUTATIONS.includes(type);
}
