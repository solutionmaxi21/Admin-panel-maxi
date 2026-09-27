/**
 * IndexedDB Schema for Offline Mode
 * 
 * Three stores:
 * - productCache: Cached product data (24h TTL)
 * - mutationQueue: Pending operations (orders, cart sync)
 * - appMetadata: App-level settings and state
 */

import Dexie, { Table } from 'dexie';

// Type definitions
export interface CachedProduct {
  id: number;
  data: unknown; // Product JSON
  cachedAt: number; // Unix timestamp
  expiresAt: number; // Unix timestamp (cachedAt + 24h)
}

export interface QueuedMutation {
  id?: number; // Auto-incremented
  operation: 'create_order' | 'update_cart' | 'create_shipment' | 'add_to_wishlist' | 'remove_from_wishlist' | 'add_to_cart' | 'remove_from_cart' | 'update_quantity' | 'clear_cart' | 'clear_wishlist' | 'apply_promo';
  payload: unknown; // Encrypted JSON
  signature: string; // HMAC signature
  createdAt: number; // Unix timestamp
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
  syncedAt?: number;
}

export interface AppMetadata {
  key: string;
  value: unknown;
}

// Database class
export class OfflineDatabase extends Dexie {
  productCache!: Table<CachedProduct, number>;
  mutationQueue!: Table<QueuedMutation, number>;
  appMetadata!: Table<AppMetadata, string>;

  constructor() {
    super('MaxiStoreOfflineDB');
    
    // Schema version 1
    this.version(1).stores({
      productCache: 'id, cachedAt, expiresAt',
      mutationQueue: '++id, status, createdAt, operation',
      appMetadata: 'key'
    });
  }

  /**
   * Cache a product with 24h TTL
   */
  async cacheProduct(id: number, data: unknown): Promise<void> {
    const now = Date.now();
    const expiresAt = now + (24 * 60 * 60 * 1000); // 24 hours

    await this.productCache.put({
      id,
      data,
      cachedAt: now,
      expiresAt
    });
  }

  /**
   * Get cached product (returns null if expired)
   */
  async getCachedProduct(id: number): Promise<unknown | null> {
    const cached = await this.productCache.get(id);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() > cached.expiresAt) {
      await this.productCache.delete(id);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Cache multiple products at once
   */
  async cacheProducts(products: Array<{ id: number; data: unknown }>): Promise<void> {
    const now = Date.now();
    const expiresAt = now + (24 * 60 * 60 * 1000);

    await this.productCache.bulkPut(
      products.map(p => ({
        id: p.id,
        data: p.data,
        cachedAt: now,
        expiresAt
      }))
    );
  }

  /**
   * Clear expired products from cache
   */
  async clearExpiredProducts(): Promise<number> {
    const now = Date.now();
    const expired = await this.productCache
      .where('expiresAt')
      .below(now)
      .toArray();
    
    if (expired.length > 0) {
      await this.productCache.bulkDelete(expired.map((p: { id: number }) => p.id));
    }
    
    return expired.length;
  }

  /**
   * Queue a mutation for offline sync
   */
  async queueMutation(
    operation: QueuedMutation['operation'],
    payload: unknown,
    signature: string
  ): Promise<number> {
    const id = await this.mutationQueue.add({
      operation,
      payload,
      signature,
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0
    });
    
    return id;
  }

  /**
   * Get all pending mutations (for batch sync)
   */
  async getPendingMutations(): Promise<QueuedMutation[]> {
    return this.mutationQueue
      .where('status')
      .equals('pending')
      .sortBy('createdAt');
  }

  /**
   * Update mutation status
   */
  async updateMutationStatus(
    id: number,
    status: QueuedMutation['status'],
    error?: string
  ): Promise<void> {
    const mutation = await this.mutationQueue.get(id);
    if (!mutation) return;

    await this.mutationQueue.update(id, {
      status,
      lastError: error,
      syncedAt: status === 'synced' ? Date.now() : undefined,
      retryCount: status === 'failed' ? mutation.retryCount + 1 : mutation.retryCount
    });
  }

  /**
   * Get failed mutations (for retry logic)
   */
  async getFailedMutations(): Promise<QueuedMutation[]> {
    return this.mutationQueue
      .where('status')
      .equals('failed')
      .filter((m: QueuedMutation) => m.retryCount < 5) // Max 5 retries
      .sortBy('createdAt');
  }

  /**
   * Clear synced mutations older than 7 days
   */
  async clearOldSyncedMutations(): Promise<number> {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const old = await this.mutationQueue
      .where('status')
      .equals('synced')
      .filter((m: QueuedMutation) => m.createdAt < sevenDaysAgo)
      .toArray();
    
    if (old.length > 0) {
      await this.mutationQueue.bulkDelete(old.map((m: QueuedMutation) => m.id!));
    }
    
    return old.length;
  }

  /**
   * Clean mutations with invalid structure (old format)
   * Removes pending/failed mutations that don't have the new structure
   */
  async cleanInvalidMutations(): Promise<number> {
    const allMutations = await this.mutationQueue.toArray();
    const toDelete: number[] = [];
    
    for (const mutation of allMutations) {
      // Check if payload has the new structure
      const payload = mutation.payload as any;
      
      // Old mutations won't have idempotencyKey, data, timestamp
      // Or they might have timestamp as ISO string instead of number
      if (!payload.idempotencyKey || !payload.data || typeof payload.timestamp !== 'number') {
        toDelete.push(mutation.id!);
        console.log(`🧹 Deleting invalid mutation #${mutation.id}: ${mutation.operation}`, payload);
      }
    }
    
    if (toDelete.length > 0) {
      await this.mutationQueue.bulkDelete(toDelete);
    }
    
    return toDelete.length;
  }

  /**
   * Clear ALL pending and failed mutations (nuclear option for debugging)
   */
  async clearAllPendingMutations(): Promise<number> {
    const mutations = await this.mutationQueue
      .where('status')
      .anyOf('pending', 'failed', 'syncing')
      .toArray();
    
    if (mutations.length > 0) {
      await this.mutationQueue.bulkDelete(mutations.map((m: QueuedMutation) => m.id!));
      console.log(`🧹 Cleared ${mutations.length} pending/failed mutations`);
    }
    
    return mutations.length;
  }

  /**
   * Get app metadata
   */
  async getMetadata<T>(key: string): Promise<T | null> {
    const meta = await this.appMetadata.get(key);
    return meta ? (meta.value as T) : null;
  }

  /**
   * Set app metadata
   */
  async setMetadata(key: string, value: unknown): Promise<void> {
    await this.appMetadata.put({ key, value });
  }

  /**
   * Get storage usage estimate
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;
      
      return { usage, quota, percentage };
    }
    
    return { usage: 0, quota: 0, percentage: 0 };
  }

  /**
   * Clear all offline data (for logout)
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      this.productCache.clear(),
      this.mutationQueue.clear(),
      this.appMetadata.clear()
    ]);
  }
}

// Singleton instance
export const offlineDB = new OfflineDatabase();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).offlineDB = offlineDB;
  (window as any).clearMutations = async () => {
    const count = await offlineDB.clearAllPendingMutations();
    console.log(`✅ Cleared ${count} mutations. Refresh the page.`);
  };
}

// Initialize and clean on startup
if (typeof window !== 'undefined') {
  offlineDB.open().then(async () => {
    console.log('📦 Offline database initialized');
    
    // Clean expired data on startup
    const [expiredProducts, oldMutations, invalidMutations] = await Promise.all([
      offlineDB.clearExpiredProducts(),
      offlineDB.clearOldSyncedMutations(),
      offlineDB.cleanInvalidMutations()
    ]);
    
    if (expiredProducts > 0) {
      console.log(`🧹 Cleaned ${expiredProducts} expired products`);
    }
    if (oldMutations > 0) {
      console.log(`🧹 Cleaned ${oldMutations} old synced mutations`);
    }
    if (invalidMutations > 0) {
      console.log(`🧹 Cleaned ${invalidMutations} invalid mutations`);
    }
  }).catch((err: unknown) => {
    console.error('❌ Failed to initialize offline database:', err);
  });
}
