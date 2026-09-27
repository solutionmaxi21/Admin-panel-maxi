import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import db from '../db/postgres.js';

class CacheManager {
  constructor() {
    // Check if cache is enabled (default: true)
    this.enabled = process.env.CACHE_ENABLED !== 'false';
    
    // Standard Cache: 1 hour default TTL
    this.cache = new NodeCache({
      stdTTL: 3600,
      checkperiod: 600,
      useClones: false // Performance optimization
    });

    // Promise Cache: Map of keys to in-flight promises
    // Prevents "Cache Stampede" (Thundering Herd)
    this.promises = new Map();

    // Stats for monitoring
    this.stats = { hits: 0, misses: 0, stampedesPrevented: 0 };
    
    if (!this.enabled) {
      console.log('[CacheManager] ⚠️  Cache is DISABLED via CACHE_ENABLED=false');
    } else {
      console.log('[CacheManager] ✅ Cache is ENABLED');
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      ...this.stats,
      keys: this.cache.keys().length,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      hitRatePercent: ((this.stats.hits / (this.stats.hits + this.stats.misses) || 0) * 100).toFixed(2) + '%'
    };
  }

  /**
   * Warm up the cache with essential data
   */
  async warmUp() {
    console.log('[CacheManager] Warming up cache...');

    // Prefetch metadata in parallel
    // We do NOT wait for products to avoid circular deps if possible,
    // or we can allow it if careful. For now, just metadata.
    try {
      await Promise.all([
        this.getCategories(),
        this.getWilayas(),
        this.getActivePromotions()
      ]);
      console.log('[CacheManager] Warmup complete.');
    } catch (err) {
      console.error('[CacheManager] Warmup failed:', err);
    }
  }

  /**
   * Generic get or fetch with Stampede Protection
   * @param {string} key - Cache key
   * @param {function} fetchFn - Async function to fetch data if missing
   * @param {number} ttl - Time to live in seconds (default 3600)
   */
  async getOrFetch(key, fetchFn, ttl = 3600) {
    // If cache is disabled, always fetch fresh data
    if (!this.enabled) {
      return await fetchFn();
    }
    
    // 1. Check Memory Cache
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.hits++;
      return cached;
    }

    // 2. Check inflight promises (Stampede Protection)
    if (this.promises.has(key)) {
      this.stats.stampedesPrevented++;
      // Wait for the ongoing request to finish
      return this.promises.get(key);
    }

    // 3. Fetch Data (Miss)
    this.stats.misses++;

    // Create a promise for fetching
    const promise = (async () => {
      try {
        const data = await fetchFn();
        if (data) {
          // Verify data exists before caching
          this.cache.set(key, data, ttl);
        }
        return data;
      } finally {
        // Always cleanup promise map
        this.promises.delete(key);
      }
    })();

    // Store the promise for concurrent requests to use
    this.promises.set(key, promise);

    return promise;
  }

  /**
   * Prime the cache with data (Use after DB write)
   * Solves Race Conditions by ensuring cache is fresh immediately
   * @param {string} key 
   * @param {any} data 
   * @param {number} ttl 
   */
  set(key, data, ttl = 3600) {
    this.cache.set(key, data, ttl);
    // If we manually set data, any pending promise is now stale/redundant,
    // but we can leave it to resolve naturally or delete it.
    // Deleting it is safer to ensure next fetch uses this fresh data.
    if (this.promises.has(key)) {
      this.promises.delete(key);
    }
  }

  get(key) {
    return this.cache.get(key);
  }

  /**
   * Invalidate local cache key
   * @param {string} key 
   */
  del(key) {
    this.cache.del(key);
    this.promises.delete(key);
  }

  invalidate(pattern) {
    if (!pattern) return;
    const keys = this.cache.keys();
    // Simple substring match or regex if needed
    const matches = keys.filter(k => k.includes(pattern));
    matches.forEach(k => this.del(k));
    console.log(`[CacheManager] Invalidated ${matches.length} keys matching '${pattern}'`);
  }

  clearAll() {
    this.cache.flushAll();
    this.promises.clear();
  }

  /**
   * ISR: Invalidate Next.js Store Cache with Retry Logic
   * @param {string} tag - Tag to revalidate (e.g., 'products')
   * @param {number} maxRetries - Max retry attempts (default: 3)
   */
  async invalidateStoreCache(tag, maxRetries = 3) {
    const storeUrl = process.env.STORE_URL || 'http://localhost:3000';
    const secret = process.env.REVALIDATION_SECRET || 'supersecret';

    const attemptISR = async (attempt = 1) => {
      try {
        const response = await fetch(
          `${storeUrl}/api/revalidate?tag=${tag}&secret=${secret}`,
          { method: 'POST', timeout: 5000 }
        );

        if (response.ok) {
          console.log(`[CacheManager] ISR Success: ${tag} (attempt ${attempt})`);
          return true;
        } else if (attempt < maxRetries) {
          console.warn(`[CacheManager] ISR Failed (${response.status}), retrying... (attempt ${attempt}/${maxRetries})`);
          await new Promise(r => setTimeout(r, Math.pow(3, attempt - 1) * 100));
          return attemptISR(attempt + 1);
        } else {
          console.error(`[CacheManager] ISR Failed after ${maxRetries} attempts: ${response.status}`);
          return false;
        }
      } catch (err) {
        if (attempt < maxRetries) {
          console.warn(`[CacheManager] ISR Error: ${err.message}, retrying... (attempt ${attempt}/${maxRetries})`);
          await new Promise(r => setTimeout(r, Math.pow(3, attempt - 1) * 100));
          return attemptISR(attempt + 1);
        } else {
          console.error(`[CacheManager] ISR Failed after ${maxRetries} attempts: ${err.message}`);
          return false;
        }
      }
    };

    attemptISR().catch(err => {
      console.error(`[CacheManager] ISR Retry Chain Failed: ${err.message}`);
    });
  }

  // --- Metadata Caching Methods ---

  async getCategories() {
    return this.getOrFetch('metadata:categories', async () => {
      const query = `
        SELECT * FROM categories 
        WHERE deleted_at IS NULL 
        ORDER BY category_name ASC
      `;
      return await db.queryMany(query);
    }, 21600); // 6 hours
  }

  async getWilayas() {
    return this.getOrFetch('metadata:wilayas', async () => {
      const query = `SELECT * FROM wilayas ORDER BY id ASC`;
      return await db.queryMany(query);
    }, 21600);
  }

  async getCommunesByWilaya(wilayaId) {
    return this.getOrFetch(`metadata:communes:${wilayaId}`, async () => {
      const query = `SELECT * FROM communes WHERE wilaya_id = $1 ORDER BY commune_name ASC`;
      return await db.queryMany(query, [wilayaId]);
    }, 21600);
  }

  async getShippingCenters(wilayaId = null) {
    const key = wilayaId ? `metadata:shipping_centers:${wilayaId}` : 'metadata:shipping_centers:all';
    return this.getOrFetch(key, async () => {
      let query = `SELECT * FROM shipping_centers ORDER BY name ASC`;
      let params = [];
      if (wilayaId) {
        query = `SELECT * FROM shipping_centers WHERE wilaya_id = $1 ORDER BY name ASC`;
        params = [wilayaId];
      }
      return await db.queryMany(query, params);
    }, 21600);
  }

  async getActivePromotions() {
    return this.getOrFetch('promotions:active', async () => {
      // Query the active_promotions view which handles date range and soft-delete checks
      const query = `
        SELECT * FROM active_promotions
        ORDER BY end_date ASC
      `;
      return await db.queryMany(query);
    }, 3600);
  }

  // --- Specialized Helpers ---

  /**
   * Get/Set Featured Products
   */
  async getFeaturedProducts(fetchFn) {
    return this.getOrFetch('products:featured', fetchFn, 3600);
  }

  /**
   * Get/Set New Products
   */
  async getNewProducts(fetchFn) {
    return this.getOrFetch('products:new', fetchFn, 3600);
  }

  // Shipping Calculator Cache Methods - Integrated Cache for shipping fees and communes
  async getShippingFee(fromWilayaId, toCommuneId) {
    const cacheKey = `shipping:fee:${fromWilayaId}:${toCommuneId}`;
    return this.getOrFetch(cacheKey, async () => {
      const result = await db.query(
        `SELECT cf.*, sf.retour_fee, sf.cod_percentage, sf.insurance_percentage, sf.oversize_fee
         FROM commune_fees cf
         JOIN shipping_fees sf ON sf.from_wilaya_id = cf.from_wilaya_id 
           AND sf.to_wilaya_id = (SELECT wilaya_id FROM communes WHERE id = cf.to_commune_id)
         WHERE cf.from_wilaya_id = $1 AND cf.to_commune_id = $2`,
        [fromWilayaId, toCommuneId]
      );
      if (result.rows.length === 0) {
        throw new Error(`No fee data found for route ${fromWilayaId} → ${toCommuneId}`);
      }
      return result.rows[0];
    }, 3600); // 1 hour
  }

  async getCommune(communeId) {
    const cacheKey = `shipping:commune:${communeId}`;
    return this.getOrFetch(cacheKey, async () => {
      const result = await db.query(
        `SELECT c.*, w.name as wilaya_name, w.zone
         FROM communes c
         JOIN wilayas w ON w.id = c.wilaya_id
         WHERE c.id = $1`,
        [communeId]
      );
      if (result.rows.length === 0) {
        throw new Error(`Commune ${communeId} not found`);
      }
      return result.rows[0];
    }, 3600); // 1 hour
  }

  invalidateShippingCache() {
    const keys = this.cache.keys();
    const shippingKeys = keys.filter(k => k.startsWith('shipping:'));
    shippingKeys.forEach(k => this.del(k));
    console.log(`[CacheManager] Invalidated ${shippingKeys.length} shipping cache keys`);
  }

  /**
   * Invalidate all metadata caches
   * Call this when categories, wilayas, communes, or promotions change
   */
  invalidateAllMetadata() {
    const keys = this.cache.keys();
    const metadataKeys = keys.filter(k => 
      k.startsWith('metadata:') || 
      k.startsWith('promotions:') ||
      k.includes('metadata')
    );
    metadataKeys.forEach(k => this.del(k));
    console.log(`[CacheManager] Invalidated ${metadataKeys.length} metadata cache keys`);
  }
}

export default new CacheManager();
