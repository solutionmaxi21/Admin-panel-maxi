/**
 * Offline Sync Manager
 * 
 * Handles batching and syncing of offline mutations with:
 * - Rate limiting (respects Guepex API limits)
 * - Exponential backoff retry
 * - Network status monitoring
 * - Automatic queue processing on reconnect
 */

import { offlineDB, QueuedMutation } from '../db/offline-store';
import { signPayload, hasSigningKey, initializeSigningKey, getSigningIat } from '../crypto/hmac-signer';
import { getApiBaseUrl } from '../api/base-url';

// Sync state
let isSyncing = false;
let syncListeners: Array<(status: SyncStatus) => void> = [];

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'error';
  processed: number;
  total: number;
  failed: number;
  message?: string;
}

export interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{ operation: string; error: string }>;
}

// Rate limiting for Guepex operations
// Guepex limits: 4 req/sec, 45/min, 900/hour, 9500/day
// We'll be conservative: 3 req/sec, 30/min
const RATE_LIMIT = {
  requestsPerSecond: 3,
  requestsPerMinute: 30,
  minDelayBetweenRequests: 350 // ms (~ 3 req/sec)
};

const requestTimestamps: number[] = [];

function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  return document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
}

/**
 * Check if we can make a request without exceeding rate limits
 */
function canMakeRequest(): boolean {
  const now = Date.now();
  const oneSecondAgo = now - 1000;
  const oneMinuteAgo = now - 60000;

  // Clean old timestamps
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
    requestTimestamps.shift();
  }

  // Count recent requests
  const requestsInLastSecond = requestTimestamps.filter(t => t > oneSecondAgo).length;
  const requestsInLastMinute = requestTimestamps.length;

  return (
    requestsInLastSecond < RATE_LIMIT.requestsPerSecond &&
    requestsInLastMinute < RATE_LIMIT.requestsPerMinute
  );
}

/**
 * Wait until we can make a request
 */
async function waitForRateLimit(): Promise<void> {
  while (!canMakeRequest()) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.minDelayBetweenRequests));
  }

  // Record this request
  requestTimestamps.push(Date.now());
}

/**
 * Queue a mutation for offline sync
 */
export async function queueMutation(
  operation: QueuedMutation['operation'],
  payload: unknown
): Promise<number> {
  if (!hasSigningKey()) {
    console.warn('⚠️ Cannot queue mutation: HMAC key not initialized');
    throw new Error('Not authenticated. Please login to continue.');
  }

  try {
    // Create mutation structure with metadata
    const idempotencyKey = crypto.randomUUID();
    const timestamp = Date.now(); // Milliseconds, not ISO string

    const mutationData = {
      idempotencyKey,
      data: payload,
      timestamp
    };

    // Sign the mutation data
    const signature = await signPayload(mutationData);

    console.log('[HMAC] Queued mutation payload', JSON.stringify(mutationData));
    console.log('[HMAC] Queued mutation signature prefix', signature.substring(0, 24) + '...');

    // Store in IndexedDB with full structure
    const id = await offlineDB.queueMutation(operation, mutationData, signature);

    console.log(`📤 Queued ${operation} mutation #${id}`);

    // Try to sync immediately if online
    if (navigator.onLine) {
      setTimeout(() => processBatch(), 100);
    }

    return id;
  } catch (error) {
    console.error('❌ Failed to queue mutation:', error);
    throw error;
  }
}

/**
 * Process the mutation queue (batch sync)
 */
export async function processBatch(): Promise<SyncResult> {
  // Prevent concurrent syncs
  if (isSyncing) {
    console.log('⏳ Sync already in progress, skipping...');
    return {
      success: false,
      processed: 0,
      failed: 0,
      errors: [{ operation: 'batch', error: 'Sync already in progress' }]
    };
  }

  // Check network
  if (!navigator.onLine) {
    console.log('📴 Offline: Cannot sync mutations');
    return {
      success: false,
      processed: 0,
      failed: 0,
      errors: [{ operation: 'batch', error: 'Device is offline' }]
    };
  }

  isSyncing = true;
  notifyListeners({ status: 'syncing', processed: 0, total: 0, failed: 0 });

  try {
    // Get pending and failed mutations
    const [pending, failed] = await Promise.all([
      offlineDB.getPendingMutations(),
      offlineDB.getFailedMutations()
    ]);

    const allMutations = [...pending, ...failed];

    if (allMutations.length === 0) {
      console.log('✅ No mutations to sync');
      isSyncing = false;
      notifyListeners({ status: 'idle', processed: 0, total: 0, failed: 0 });
      return { success: true, processed: 0, failed: 0, errors: [] };
    }

    console.log(`🔄 Syncing ${allMutations.length} mutations...`);

    // --- REFRESH KEY IF NEEDED ---
    try {
      const API_URL = getApiBaseUrl();
      // Fetch latest IAT from server to ensure our key matches the current cookie
      const authResponse = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include',
        cache: 'no-store' // Never cache auth checks
      });
      if (authResponse.ok) {
        const authData = await authResponse.json();
        // authData.user might be an object or not depending on API version. 
        // Based on analysis: { user: { id: ... }, jwtIat: ... }
        if (authData.jwtIat && authData.user?.id) {
          console.log('[Sync] Refreshing HMAC key with IAT:', authData.jwtIat);
          await initializeSigningKey({
            userId: String(authData.user.id),
            iat: authData.jwtIat
          });
        }
      } else {
        console.warn('[Sync] Not authenticated, skipping sync');
        isSyncing = false;
        notifyListeners({ status: 'idle', processed: 0, total: 0, failed: 0 });
        return { success: false, processed: 0, failed: 0, errors: [{ operation: 'batch', error: 'Not authenticated' }] };
      }
    } catch (e) {
      console.warn('[Sync] Auth check failed, skipping sync:', e);
      isSyncing = false;
      notifyListeners({ status: 'idle', processed: 0, total: 0, failed: 0 });
      return { success: false, processed: 0, failed: 0, errors: [{ operation: 'batch', error: 'Auth check failed' }] };
    }

    // Batch mutations by type for server endpoint
    const batchMutations: Array<{ type: string; mutation: any; signature: string; signingIat?: number }> = [];

    for (const mutation of allMutations) {
      // Mark as syncing
      await offlineDB.updateMutationStatus(mutation.id!, 'syncing');

      // Re-sign the payload with the CURRENT session key
      // This ensures that if the user's session refreshed (new IAT),
      // the signature validly matches the current session the server sees.
      let currentSignature = mutation.signature;
      let currentSigningIat = getSigningIat() ?? undefined;
      try {
        if (hasSigningKey()) {
          console.log(`🔐 Re-signing mutation #${mutation.id} with current session key`);
          currentSignature = await signPayload(mutation.payload);
          currentSigningIat = getSigningIat() ?? undefined;
        }
      } catch (e) {
        console.warn('⚠️ Could not re-sign mutation, using stored signature:', e);
      }

      // Create batch payload with proper structure
      // Backend expects: { type, mutation: { idempotencyKey, data, timestamp }, signature }
      // NOTE: signature is NOT included inside mutation, only in outer wrapper
      batchMutations.push({
        type: mutation.operation, // operation -> type for batch endpoint
        mutation: mutation.payload as any, // Contains: idempotencyKey, data, timestamp (no signature)
        signature: currentSignature, // Outer signature for verification
        signingIat: currentSigningIat
      });
    }

    // Wait for rate limit before sending batch
    await waitForRateLimit();

    // Send all mutations in one batch request
    const result = await sendBatchSync(batchMutations, allMutations);

    // Final notification
    const finalStatus: SyncStatus = {
      status: result.failed === 0 ? 'success' : 'error',
      processed: result.processed,
      total: allMutations.length,
      failed: result.failed,
      message: result.failed === 0
        ? `Successfully synced ${result.processed} operations`
        : `Synced ${result.processed}, failed ${result.failed}`
    };

    notifyListeners(finalStatus);

    console.log(`✅ Batch sync complete: ${result.processed} succeeded, ${result.failed} failed`);

    return result;
  } catch (error) {
    console.error('❌ Batch sync failed:', error);
    notifyListeners({
      status: 'error',
      processed: 0,
      total: 0,
      failed: 0,
      message: error instanceof Error ? error.message : 'Sync failed'
    });

    return {
      success: false,
      processed: 0,
      failed: 0,
      errors: [{ operation: 'batch', error: error instanceof Error ? error.message : 'Unknown error' }]
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Send batch of mutations to /api/sync/batch endpoint
 */
async function sendBatchSync(
  batchMutations: Array<{ type: string; mutation: any; signature: string; signingIat?: number }>,
  originalMutations: Array<any>
): Promise<SyncResult> {
  try {
    const API_URL = getApiBaseUrl();
    const csrfToken = getCsrfToken();

    const response = await fetch(`${API_URL}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {})
      },
      body: JSON.stringify({ mutations: batchMutations }),
      credentials: 'include', // Send cookies (JWT)
      cache: 'no-store' // Never cache sync operations
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      // Safely extract error message as string
      const errorMsg = typeof error === 'string'
        ? error
        : error?.error || error?.message || `HTTP ${response.status}`;
      throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    }

    const data = await response.json();

    // Process results
    const result: SyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: []
    };

    if (data.results && Array.isArray(data.results)) {
      for (let i = 0; i < data.results.length; i++) {
        const serverResult = data.results[i];
        const originalMutation = originalMutations[i];

        if (serverResult.success) {
          // Mark as synced
          await offlineDB.updateMutationStatus(originalMutation.id!, 'synced');
          result.processed++;
          console.log(`✅ Synced ${originalMutation.operation} #${originalMutation.id}`);
        } else {
          // Mark as failed
          await offlineDB.updateMutationStatus(
            originalMutation.id!,
            'failed',
            serverResult.error || 'Unknown error'
          );
          result.failed++;
          result.errors.push({
            operation: originalMutation.operation,
            error: serverResult.error || 'Server rejected mutation'
          });
          console.error(`❌ Failed to sync ${originalMutation.operation} #${originalMutation.id}:`, serverResult.error);
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Batch sync failed:', error);

    // Mark all mutations as failed
    for (const mutation of originalMutations) {
      await offlineDB.updateMutationStatus(
        mutation.id!,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return {
      success: false,
      processed: 0,
      failed: originalMutations.length,
      errors: [{
        operation: 'batch',
        error: error instanceof Error ? error.message : 'Batch sync failed'
      }]
    };
  }
}

/**
 * Sync a single mutation to the server
 * Kept for backwards compatibility with create_order, create_shipment
 */
async function syncMutation(mutation: QueuedMutation): Promise<boolean> {
  try {
    const API_URL = getApiBaseUrl();
    const csrfToken = getCsrfToken();

    let endpoint = '';
    let method = 'POST';

    // Map operation to endpoint
    switch (mutation.operation) {
      case 'create_order':
        endpoint = '/orders';
        break;
      case 'create_shipment':
        endpoint = '/orders/create-shipment';
        break;
      case 'update_cart':
      case 'add_to_cart':
      case 'remove_from_cart':
      case 'update_quantity':
      case 'clear_cart':
      case 'add_to_wishlist':
      case 'remove_from_wishlist':
      case 'clear_wishlist':
      case 'apply_promo':
        // These are handled by batch sync only
        return true;
      default:
        // All other operations should use batch sync
        // Batch sync is now handled in processBatch()
        console.warn(`Unknown operation: ${mutation.operation}`);
        return false;
    }

    // Send request with signature
    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': mutation.signature,
        'X-Operation-Id': mutation.id?.toString() || 'unknown',
        ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {})
      },
      body: JSON.stringify(mutation.payload),
      credentials: 'include', // Send cookies
      cache: 'no-store' // Never cache mutations
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      // Safely extract error message as string
      const errorMsg = typeof error === 'string'
        ? error
        : error?.error || error?.message || `HTTP ${response.status}`;
      throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    }

    return true;
  } catch (error) {
    console.error('Sync mutation failed:', error);
    throw error;
  }
}

/**
 * Subscribe to sync status updates
 */
export function onSyncStatus(callback: (status: SyncStatus) => void): () => void {
  syncListeners.push(callback);

  // Return unsubscribe function
  return () => {
    syncListeners = syncListeners.filter(cb => cb !== callback);
  };
}

/**
 * Notify all listeners of sync status
 */
function notifyListeners(status: SyncStatus): void {
  syncListeners.forEach(callback => {
    try {
      callback(status);
    } catch (error) {
      console.error('Sync listener error:', error);
    }
  });
}

/**
 * Initialize sync manager (call on app startup)
 */
export function initSyncManager(): void {
  if (typeof window === 'undefined') return;

  console.log('🔄 Initializing sync manager...');

  // Listen for online event
  window.addEventListener('online', () => {
    console.log('🌐 Back online! Syncing pending mutations...');
    setTimeout(() => processBatch(), 1000);
  });

  // Listen for offline event
  window.addEventListener('offline', () => {
    console.log('📴 Gone offline. Mutations will be queued.');
  });

  // Try to sync on startup if online
  if (navigator.onLine) {
    setTimeout(() => {
      processBatch().catch(err => {
        console.error('Initial sync failed:', err);
      });
    }, 2000);
  }

  console.log('✅ Sync manager initialized');
}

/**
 * Get current sync status
 */
export function getSyncStatus(): 'online' | 'offline' | 'syncing' {
  if (isSyncing) return 'syncing';
  return navigator.onLine ? 'online' : 'offline';
}

/**
 * Get pending mutation count
 */
export async function getPendingCount(): Promise<number> {
  const [pending, failed] = await Promise.all([
    offlineDB.getPendingMutations(),
    offlineDB.getFailedMutations()
  ]);
  return pending.length + failed.length;
}
