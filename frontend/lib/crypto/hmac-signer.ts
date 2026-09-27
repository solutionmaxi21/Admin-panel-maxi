/**
 * HMAC Signature Module for Offline Mutations
 * 
 * Signs mutation payloads to prevent tampering.
 * Key is derived from JWT token (user session).
 */

// In-memory key storage (cleared on page refresh)
let signingKey: CryptoKey | null = null;
let signingIat: number | null = null;

/**
 * Initialize signing key from JWT payload
 * Call this after user login
 */
export async function initializeSigningKey(jwtPayload: { userId: string; iat: number }): Promise<void> {
  try {
    // Derive key using PBKDF2 (must match server logic)
    const salt = `${jwtPayload.userId}:${jwtPayload.iat}`;
    const password = salt;
    const hmacSecret = process.env.NEXT_PUBLIC_HMAC_SECRET;

    if (!hmacSecret) {
      throw new Error('NEXT_PUBLIC_HMAC_SECRET is missing. Restart the frontend with env configured.');
    }

    console.log(
      `[HMAC] Initializing signing key user=${jwtPayload.userId} iat=${jwtPayload.iat} secretLen=${hmacSecret.length}`
    );

    // Use PBKDF2 with 100k iterations to match server
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    signingKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode(hmacSecret),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify']
    );

    signingIat = jwtPayload.iat;

    console.log('🔐 HMAC signing key initialized');
  } catch (error) {
    console.error('❌ Failed to initialize signing key:', error);
    throw error;
  }
}

/**
 * Clear signing key (on logout)
 */
export function clearSigningKey(): void {
  signingKey = null;
  signingIat = null;
  console.log('🔓 HMAC signing key cleared');
}

/**
 * Check if signing key is available
 */
export function hasSigningKey(): boolean {
  return signingKey !== null;
}

/**
 * Get the JWT iat currently bound to the in-memory signing key.
 * Used by sync manager to let the backend verify against the exact signing context.
 */
export function getSigningIat(): number | null {
  return signingIat;
}

/**
 * Sign a mutation payload
 * Returns base64 signature
 * 
 * IMPORTANT: Must sign the payload in the exact format the server expects
 * Server reconstructs as: { idempotencyKey, data, timestamp }
 */
export async function signPayload(payload: unknown): Promise<string> {
  if (!signingKey) {
    throw new Error('Signing key not initialized. Call initializeSigningKey() after login.');
  }

  try {
    // Reconstruct payload in EXACT order that server uses
    const typedPayload = payload as any;
    const orderedPayload = {
      idempotencyKey: typedPayload.idempotencyKey,
      data: typedPayload.data,
      timestamp: typedPayload.timestamp
    };

    const payloadString = JSON.stringify(orderedPayload);
    console.log('[HMAC] Signing payload len', payloadString.length, 'preview', payloadString.substring(0, 120) + '...');

    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);

    // Create HMAC signature
    const signature = await crypto.subtle.sign(
      'HMAC',
      signingKey,
      data
    );

    // Convert to base64
    const base64Signature = btoa(
      String.fromCharCode(...new Uint8Array(signature))
    );

    console.log('[HMAC] Signature generated prefix', base64Signature.substring(0, 24) + '...');

    return base64Signature;
  } catch (error) {
    console.error('❌ Failed to sign payload:', error);
    throw error;
  }
}

/**
 * Verify a payload signature (client-side validation)
 * Server will also verify with its own key
 */
export async function verifySignature(payload: unknown, signature: string): Promise<boolean> {
  if (!signingKey) {
    console.warn('⚠️ Cannot verify signature: key not initialized');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));

    // Decode base64 signature
    const signatureData = Uint8Array.from(
      atob(signature),
      c => c.charCodeAt(0)
    );

    // Verify HMAC signature
    const isValid = await crypto.subtle.verify(
      'HMAC',
      signingKey,
      signatureData,
      data
    );

    return isValid;
  } catch (error) {
    console.error('❌ Failed to verify signature:', error);
    return false;
  }
}

/**
 * Encrypt sensitive data (cart items, personal info)
 * Uses AES-GCM with user-derived key
 * Returns a combined string: iv:encrypted (both base64)
 */
export async function encryptData(data: unknown, userId: string): Promise<string> {
  try {
    // Derive encryption key from user ID
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(`encryption:${userId}`);

    // Import key material
    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive AES-GCM key
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('maxistore-offline'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encodedData = encoder.encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );

    // Convert to base64 safely
    const encryptedArray = new Uint8Array(encrypted);
    let encryptedBase64 = '';
    for (let i = 0; i < encryptedArray.length; i += 0xFFFF) {
      encryptedBase64 += String.fromCharCode.apply(null, Array.from(encryptedArray.slice(i, i + 0xFFFF)));
    }
    encryptedBase64 = btoa(encryptedBase64);

    let ivBase64 = '';
    for (let i = 0; i < iv.length; i += 0xFFFF) {
      ivBase64 += String.fromCharCode.apply(null, Array.from(iv.slice(i, i + 0xFFFF)));
    }
    ivBase64 = btoa(ivBase64);

    // Return combined string: iv:encrypted
    return `${ivBase64}:${encryptedBase64}`;
  } catch (error) {
    console.error('❌ Failed to encrypt data:', error);
    throw error;
  }
}

/**
 * Decrypt sensitive data
 * Expects format: iv:encrypted (both base64)
 * Also handles old format for backward compatibility
 * Safely handles corrupted data
 */
export async function decryptData(encryptedPayload: string | { encrypted: string; iv: string }, userId: string): Promise<unknown> {
  try {
    // Validate input
    if (!encryptedPayload) {
      throw new Error('Empty encrypted payload');
    }

    let ivBase64: string;
    let encryptedBase64: string;

    // Handle both new and old formats
    if (typeof encryptedPayload === 'object' && encryptedPayload !== null) {
      // Old format: {encrypted, iv}
      ivBase64 = (encryptedPayload as any).iv;
      encryptedBase64 = (encryptedPayload as any).encrypted;
      if (!ivBase64 || !encryptedBase64) {
        throw new Error('Invalid old-format encrypted payload');
      }
    } else if (typeof encryptedPayload === 'string') {
      // New format: iv:encrypted
      const parts = encryptedPayload.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted payload format (expected iv:encrypted)');
      }
      [ivBase64, encryptedBase64] = parts;
    } else {
      throw new Error('Invalid encrypted payload type');
    }

    // Validate base64 strings (must not contain invalid characters)
    if (!/^[A-Za-z0-9+/=]*$/.test(ivBase64) || !/^[A-Za-z0-9+/=]*$/.test(encryptedBase64)) {
      throw new Error('Invalid base64 in encrypted payload');
    }

    // Derive same encryption key
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(`encryption:${userId}`);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('maxistore-offline'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Decode base64 using browser-safe method
    let encryptedBinary: string;
    let ivBinary: string;

    try {
      encryptedBinary = atob(encryptedBase64);
      ivBinary = atob(ivBase64);
    } catch (e) {
      throw new Error('Failed to decode base64 payload: ' + (e as Error).message);
    }

    // Validate decoded lengths
    if (ivBinary.length !== 12) {
      throw new Error(`Invalid IV length: expected 12 bytes, got ${ivBinary.length}`);
    }

    const encryptedBytes = new Uint8Array(encryptedBinary.length);
    for (let i = 0; i < encryptedBinary.length; i++) {
      encryptedBytes[i] = encryptedBinary.charCodeAt(i);
    }

    const ivBytes = new Uint8Array(ivBinary.length);
    for (let i = 0; i < ivBinary.length; i++) {
      ivBytes[i] = ivBinary.charCodeAt(i);
    }

    // Decrypt with timeout protection
    const decryptPromise = crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      encryptedBytes
    );

    const decrypted = await Promise.race([
      decryptPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Decryption timeout')), 5000)
      )
    ]);

    // Parse JSON
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decrypted);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('❌ Failed to decrypt data:', error);
    throw error;
  }
}

/**
 * Parse JWT token to extract payload (client-side only, no verification)
 */
export function parseJWT(token: string): { userId: string; iat: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return {
      userId: payload.userId || payload.sub,
      iat: payload.iat
    };
  } catch {
    return null;
  }
}
