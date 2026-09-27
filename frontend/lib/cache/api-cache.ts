/**
 * Simple in-memory cache for API responses
 * Prevents duplicate requests on hard refresh
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

class APICache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private defaultTTL = 5 * 60 * 1000 // 5 minutes default

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    const now = Date.now()
    if (now > entry.expiresAt) {
      // Expired - remove from cache
      this.cache.delete(key)
      return null
    }

    console.log(`✅ Cache hit: ${key}`)
    return entry.data as T
  }

  /**
   * Set data in cache with TTL (time-to-live in milliseconds)
   */
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const now = Date.now()
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    })
    console.log(`💾 Cached: ${key} (TTL: ${ttl}ms)`)
  }

  /**
   * Clear specific cache entry
   */
  clear(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    this.cache.clear()
  }

  /**
   * Get or set pattern - fetch if not cached
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    console.log(`🔄 Cache miss: ${key} - fetching...`)
    const data = await fetchFn()
    this.set(key, data, ttl)
    return data
  }

  /**
   * Stale-while-revalidate pattern:
   * Returns cached data immediately if available, then fetches fresh data in the background.
   * If fresh data differs from cached, updates the cache and calls onUpdate.
   */
  async getOrFetchWithRevalidate<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number,
    onUpdate?: (data: T) => void
  ): Promise<T> {
    const cached = this.get<T>(key)

    // Always revalidate in the background
    const revalidate = async () => {
      try {
        const freshData = await fetchFn()
        const cachedJson = JSON.stringify(cached)
        const freshJson = JSON.stringify(freshData)
        if (cachedJson !== freshJson) {
          console.log(`🔄 Revalidated: ${key} - data changed`)
          this.set(key, freshData, ttl)
          onUpdate?.(freshData)
        }
      } catch (error) {
        console.error(`❌ Revalidation failed: ${key}`, error)
      }
    }

    if (cached !== null) {
      // Return stale data immediately, revalidate in background
      revalidate()
      return cached
    }

    // No cached data - fetch synchronously
    console.log(`🔄 Cache miss: ${key} - fetching...`)
    const data = await fetchFn()
    this.set(key, data, ttl)
    return data
  }
}

// Singleton instance
export const apiCache = new APICache()

// Cache keys constants
export const CACHE_KEYS = {
  CATEGORIES: 'categories',
  FEATURED_PRODUCTS: 'featured_products',
  NEW_PRODUCTS: 'new_products',
  ACTIVE_PROMOTIONS: 'active_promotions',
  TOP_BRANDS: 'top_brands',
} as const

// Cache TTLs (time-to-live in milliseconds)
export const CACHE_TTL = {
  SHORT: 2 * 60 * 1000,      // 2 minutes - for frequently changing data
  MEDIUM: 5 * 60 * 1000,     // 5 minutes - default
  LONG: 15 * 60 * 1000,      // 15 minutes - for stable data like categories
} as const
