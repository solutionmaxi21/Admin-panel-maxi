/**
 * Guepex API Client
 * 
 * Secure, rate-limited HTTP client for Guepex delivery API.
 * Implements quota monitoring, automatic retry with exponential backoff,
 * and comprehensive error handling.
 * 
 * Security Features:
 * - API credentials loaded from environment variables only
 * - Request/response logging (sanitized, no credentials exposed)
 * - Rate limit monitoring from response headers
 * - Automatic quota protection
 * 
 * Performance Features:
 * - Connection keep-alive
 * - Gzip compression support
 * - Request queuing with rate limiting
 * - Exponential backoff on quota exhaustion
 * 
 * Rate Limits (Guepex API):
 * - 5 requests/second (we enforce 4/sec for safety margin)
 * - 50 requests/minute (we enforce 45/min)
 * - 1000 requests/hour (we enforce 900/hour)
 * - 10000 requests/day (we enforce 9500/day)
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';
import zlib from 'zlib';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Custom Error Classes for Better Error Handling
 */
class GuepexError extends Error {
  constructor(message, code, statusCode, originalError) {
    super(message);
    this.name = 'GuepexError';
    this.code = code;
    this.statusCode = statusCode;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

class GuepexAuthenticationError extends GuepexError {
  constructor(message, originalError) {
    super(message, 'AUTHENTICATION_FAILED', 401, originalError);
    this.name = 'GuepexAuthenticationError';
  }
}

class GuepexRateLimitError extends GuepexError {
  constructor(retryAfter, quotas) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'GuepexRateLimitError';
    this.retryAfter = retryAfter;
    this.quotas = quotas;
  }
}

class GuepexValidationError extends GuepexError {
  constructor(message, validationErrors, originalError) {
    super(message, 'VALIDATION_FAILED', 400, originalError);
    this.name = 'GuepexValidationError';
    this.validationErrors = validationErrors;
  }
}

class GuepexNetworkError extends GuepexError {
  constructor(message, originalError) {
    super(message, 'NETWORK_ERROR', null, originalError);
    this.name = 'GuepexNetworkError';
  }
}

class GuepexTimeoutError extends GuepexError {
  constructor(timeout) {
    super(`Request timeout after ${timeout}ms`, 'TIMEOUT', null);
    this.name = 'GuepexTimeoutError';
    this.timeout = timeout;
  }
}

class GuepexServerError extends GuepexError {
  constructor(message, statusCode, originalError) {
    super(message, 'SERVER_ERROR', statusCode, originalError);
    this.name = 'GuepexServerError';
  }
}

class RateLimiter {
  constructor() {
    this.requests = {
      second: [],
      minute: [],
      hour: [],
      day: []
    };
    
    // Safety margins: 80% of actual limits
    this.limits = {
      second: { max: 4, window: 1000 },      // 4/sec (80% of 5)
      minute: { max: 45, window: 60000 },     // 45/min (90% of 50)
      hour: { max: 900, window: 3600000 },    // 900/hour (90% of 1000)
      day: { max: 9500, window: 86400000 }    // 9500/day (95% of 10000)
    };
  }

  /**
   * Check if we can make a request without exceeding rate limits
   * @returns {{ allowed: boolean, period?: string, retryAfterMs?: number, retryAfterSeconds?: number }}
   */
  canMakeRequest() {
    const now = Date.now();
    
    // Clean old requests outside windows
    for (const [period, config] of Object.entries(this.limits)) {
      this.requests[period] = this.requests[period].filter(
        timestamp => now - timestamp < config.window
      );
      
      if (this.requests[period].length >= config.max) {
        // Calculate accurate retry delay based on oldest request in window
        const oldestRequest = Math.min(...this.requests[period]);
        const retryAfterMs = (oldestRequest + config.window) - now;
        const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
        
        return { 
          allowed: false, 
          period, 
          retryAfterMs: Math.max(retryAfterMs, 100), // At least 100ms
          retryAfterSeconds: Math.max(retryAfterSeconds, 1) // At least 1 second
        };
      }
    }
    
    return { allowed: true };
  }

  /**
   * Record a request timestamp
   */
  recordRequest() {
    const now = Date.now();
    for (const period of Object.keys(this.limits)) {
      this.requests[period].push(now);
    }
  }

  /**
   * Update limits based on API response headers
   * Also dynamically adjusts if server reports lower quota than we expected
   */
  updateFromHeaders(headers) {
    const parseQuota = (v) => v === undefined || v === null || v === '' ? null : parseInt(v, 10);
    const quotas = {
      second: parseQuota(headers['x-second-quota-left']),
      minute: parseQuota(headers['x-minute-quota-left']),
      hour: parseQuota(headers['x-hour-quota-left']),
      day: parseQuota(headers['x-day-quota-left'])
    };

    // Store server-reported quotas for proactive throttling
    this.serverQuotas = quotas;

    // Log warning if any quota is critically low
    for (const [period, remaining] of Object.entries(quotas)) {
      if (remaining !== null && remaining < 5) {
        console.warn(`[Guepex] ${period} quota critically low: ${remaining} remaining`);
      }
      // If server reports 0 quota, force a wait
      if (remaining === 0) {
        console.warn(`[Guepex] ${period} quota exhausted on server!`);
      }
    }

    return quotas;
  }

  /**
   * Check if server-reported quotas allow a request
   * More accurate than local tracking
   */
  isServerQuotaAvailable() {
    if (!this.serverQuotas) return true;
    
    // If any server quota is 0, we should wait
    for (const [period, remaining] of Object.entries(this.serverQuotas)) {
      if (remaining === 0) {
        return { allowed: false, period, reason: 'server_exhausted' };
      }
    }
    return { allowed: true };
  }

  /**
   * Get current usage stats
   */
  getStats() {
    const now = Date.now();
    const stats = {};
    
    for (const [period, config] of Object.entries(this.limits)) {
      const recent = this.requests[period].filter(
        timestamp => now - timestamp < config.window
      );
      stats[period] = {
        current: recent.length,
        max: config.max,
        percentage: Math.round((recent.length / config.max) * 100)
      };
    }
    
    return stats;
  }
}

class GuepexAPIClient {
  constructor() {
    this.baseURL = process.env.GUEPEX_BASE_URL || 'https://api.guepex.app/v1';
    this.apiId = process.env.GUEPEX_API_ID;
    this.apiToken = process.env.GUEPEX_API_TOKEN;
    this.enabled = !!(this.apiId && this.apiToken);
    this.rateLimiter = new RateLimiter();
    this.requestQueue = [];
    this.processing = false;

    // Validate credentials
    if (!this.enabled) {
      console.warn('[Guepex] API credentials not configured. Guepex integration is disabled. Set GUEPEX_API_ID and GUEPEX_API_TOKEN in .env to enable.');
    }

    // HTTP agent for connection pooling and keep-alive
    this.agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 5,
      maxFreeSockets: 2,
      timeout: 30000
    });
  }

  /**
   * Make HTTP request with automatic rate limiting and retry logic
   * @private
   */
  async _makeRequest(method, path, data = null, options = {}) {
    // Check credentials
    if (!this.apiId || !this.apiToken) {
      throw new GuepexAuthenticationError('Guepex API credentials not configured. Check environment variables.');
    }

    // Remove leading slash from path to properly join with baseURL
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    const url = new URL(cleanPath, this.baseURL + '/');
    
    // Add query parameters
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }

    const requestOptions = {
      method,
      headers: {
        'X-API-ID': this.apiId,
        'X-API-TOKEN': this.apiToken,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'MaxiStore/1.0 (Algerian E-Commerce)'
      },
      agent: this.agent,
      timeout: options.timeout || 30000
    };

    // Add body for POST/PATCH requests
    if (data && (method === 'POST' || method === 'PATCH')) {
      const body = JSON.stringify(data);
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let timeoutHandle;
      
      const req = https.request(url, requestOptions, (res) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        let stream = res;
        
        // Handle gzip/deflate compression
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = res.pipe(zlib.createInflate());
        }
        
        let responseData = '';
        
        stream.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        stream.on('end', () => {
          const duration = Date.now() - startTime;
          
          // Update rate limiter from response headers
          const quotas = this.rateLimiter.updateFromHeaders(res.headers);
          
          // Log request (sanitized)
          this._logRequest(method, path, res.statusCode, duration, quotas);

          // Handle HTTP errors
          if (res.statusCode >= 400) {
            let errorData;
            try {
              errorData = JSON.parse(responseData);
            } catch {
              errorData = { message: responseData || 'Unknown error' };
            }

            // Handle specific error types
            if (res.statusCode === 401 || res.statusCode === 403) {
              return reject(new GuepexAuthenticationError(
                errorData.message || 'Authentication failed. Check API credentials.',
                errorData
              ));
            }
            
            if (res.statusCode === 429) {
              const retryAfter = parseInt(res.headers['retry-after']) || 60;
              return reject(new GuepexRateLimitError(retryAfter, quotas));
            }
            
            if (res.statusCode === 400 || res.statusCode === 422) {
              return reject(new GuepexValidationError(
                errorData.message || 'Validation failed',
                errorData.errors || errorData,
                errorData
              ));
            }
            
            if (res.statusCode >= 500) {
              return reject(new GuepexServerError(
                errorData.message || `Guepex server error (${res.statusCode})`,
                res.statusCode,
                errorData
              ));
            }

            // Generic HTTP error
            return reject(new GuepexError(
              errorData.message || `HTTP ${res.statusCode}`,
              'HTTP_ERROR',
              res.statusCode,
              errorData
            ));
          }

          // Parse and return successful response
          try {
            const parsed = JSON.parse(responseData);
            resolve({
              data: parsed,
              statusCode: res.statusCode,
              headers: res.headers,
              quotas
            });
          } catch (error) {
            reject(new GuepexError(
              'Invalid JSON response from Guepex API',
              'INVALID_RESPONSE',
              res.statusCode,
              error
            ));
          }
        });
        
        stream.on('error', (error) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(new GuepexNetworkError('Stream error: ' + error.message, error));
        });
      });

      req.on('error', (error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        console.error('[Guepex] Request failed:', error.message);
        
        // Network errors with specific messages
        if (error.code === 'ENOTFOUND') {
          reject(new GuepexNetworkError('DNS lookup failed. Cannot reach Guepex API.', error));
        } else if (error.code === 'ECONNREFUSED') {
          reject(new GuepexNetworkError('Connection refused. Guepex API may be down.', error));
        } else if (error.code === 'ECONNRESET') {
          reject(new GuepexNetworkError('Connection reset. Network unstable.', error));
        } else {
          reject(new GuepexNetworkError(error.message, error));
        }
      });

      req.on('timeout', () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        req.destroy();
        reject(new GuepexTimeoutError(requestOptions.timeout));
      });
      
      // Set manual timeout handler as backup
      timeoutHandle = setTimeout(() => {
        req.destroy();
        reject(new GuepexTimeoutError(requestOptions.timeout));
      }, requestOptions.timeout);

      // Send body data
      if (data && (method === 'POST' || method === 'PATCH')) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Execute request with rate limiting and queue management
   * @private
   */
  async _executeWithRateLimit(method, path, data = null, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ method, path, data, options, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * Process queued requests with rate limiting
   * @private
   */
  async _processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      // Check local rate limiter
      const rateLimitCheck = this.rateLimiter.canMakeRequest();
      
      if (!rateLimitCheck.allowed) {
        const waitMs = Math.min(rateLimitCheck.retryAfterMs, 5000); // Max 5s wait
        console.warn(`[Guepex] Rate limit reached for ${rateLimitCheck.period}. Waiting ${rateLimitCheck.retryAfterSeconds}s`);
        await this._sleep(waitMs);
        continue;
      }

      // Also check server-reported quotas
      const serverQuotaCheck = this.rateLimiter.isServerQuotaAvailable();
      if (serverQuotaCheck.allowed === false) {
        console.warn(`[Guepex] Server quota exhausted for ${serverQuotaCheck.period}. Waiting 1s before retry...`);
        await this._sleep(1000);
        continue;
      }

      const request = this.requestQueue.shift();
      this.rateLimiter.recordRequest();

      try {
        const response = await this._makeRequest(
          request.method,
          request.path,
          request.data,
          request.options
        );
        request.resolve(response);
      } catch (error) {
        // Handle rate limit errors with exponential backoff
        if (error instanceof GuepexRateLimitError || error.statusCode === 429) {
          const retryAfterSec = error.retryAfter || 60; // Default 60s if not provided
          console.warn(`[Guepex] 429 Rate Limit. Retrying after ${retryAfterSec}s`);
          await this._sleep(retryAfterSec * 1000);
          // Re-queue the request
          this.requestQueue.unshift(request);
          continue;
        }
        
        request.reject(error);
      }

      // Small delay between requests to be extra safe
      if (this.requestQueue.length > 0) {
        await this._sleep(250); // 250ms = max 4 req/sec
      }
    }

    this.processing = false;
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry logic with exponential backoff
   * @private
   */
  async _retryWithBackoff(fn, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      retryableErrors = [GuepexTimeoutError, GuepexNetworkError, GuepexServerError]
    } = options;

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on auth, validation, or rate limit errors
        if (error instanceof GuepexAuthenticationError ||
            error instanceof GuepexValidationError ||
            error instanceof GuepexRateLimitError) {
          throw error;
        }
        
        // Check if error is retryable
        const isRetryable = retryableErrors.some(ErrorClass => error instanceof ErrorClass);
        
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        // Calculate exponential backoff delay
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
        const waitTime = delay + jitter;
        
        console.warn(
          `[Guepex] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${error.message}. ` +
          `Retrying in ${Math.round(waitTime)}ms...`
        );
        
        await this._sleep(waitTime);
      }
    }
    
    throw lastError;
  }

  /**
   * Log request (sanitized - no credentials)
   * @private
   */
  _logRequest(method, path, statusCode, duration, quotas) {
    const isError = statusCode >= 400;
    const logLevel = isError ? 'error' : 'info';
    
    const quotaStr = Object.entries(quotas)
      .filter(([_, v]) => v !== null)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');

    console[logLevel](`[Guepex] ${method} ${path} → ${statusCode} (${duration}ms) [${quotaStr}]`);
  }

  // ============================================
  // PUBLIC API METHODS
  // ============================================

  // Return a harmless resolved response when the client is disabled to avoid
  // noisy errors during development or when credentials are intentionally missing.
  _disabledResponse(type = 'list') {
    if (type === 'list') {
      return Promise.resolve({ data: { data: [], total_data: 0, has_more: false }, statusCode: 200, headers: {}, quotas: {} });
    }
    return Promise.resolve({ data: null, statusCode: 200, headers: {}, quotas: {} });
  }

  /**
   * Get list of Algerian wilayas
   */
  async getWilayas(options = {}) {
    if (!this.enabled) return this._disabledResponse('list');
    return this._executeWithRateLimit('GET', '/wilayas', null, { params: options });
  }

  /**
   * Get list of communes (paginated)
   */
  async getCommunes(options = {}) {
    if (!this.enabled) return this._disabledResponse('list');
    return this._executeWithRateLimit('GET', '/communes', null, { params: options });
  }

  /**
   * Get list of Guepex centers (stop desks)
   */
  async getCenters(options = {}) {
    if (!this.enabled) return this._disabledResponse('list');
    return this._executeWithRateLimit('GET', '/centers', null, { params: options });
  }

  /**
   * Get shipping fees between wilayas
   */
  async getFees(fromWilayaId, toWilayaId) {
    if (!fromWilayaId || !toWilayaId) {
      throw new Error('Both fromWilayaId and toWilayaId are required');
    }
    
    if (!this.enabled) return this._disabledResponse('list');
    return this._executeWithRateLimit('GET', '/fees', null, {
      params: {
        from_wilaya_id: fromWilayaId,
        to_wilaya_id: toWilayaId
      }
    });
  }

  /**
   * Create parcels (can batch multiple parcels in one request)
   */
  async createParcels(parcels) {
    if (!Array.isArray(parcels) || parcels.length === 0) {
      throw new Error('Parcels must be a non-empty array');
    }

    // Validate required fields
    const requiredFields = [
      'order_id', 'from_wilaya_name', 'firstname', 'familyname',
      'contact_phone', 'address', 'to_commune_name', 'to_wilaya_name',
      'product_list', 'price', 'do_insurance', 'declared_value',
      'length', 'width', 'height', 'weight', 'freeshipping',
      'is_stopdesk', 'has_exchange'
    ];

    for (const parcel of parcels) {
      for (const field of requiredFields) {
        if (!(field in parcel)) {
          throw new GuepexValidationError(
            `Missing required field: ${field} in parcel ${parcel.order_id || 'unknown'}`,
            { field, order_id: parcel.order_id }
          );
        }
      }

      // Validate stopdesk_id when is_stopdesk is true
      if (parcel.is_stopdesk && !parcel.stopdesk_id) {
        throw new GuepexValidationError(
          `stopdesk_id is required when is_stopdesk is true for order ${parcel.order_id}`,
          { order_id: parcel.order_id, is_stopdesk: true, stopdesk_id: null }
        );
      }

      // Validate product_to_collect when has_exchange is true
      if (parcel.has_exchange && !parcel.product_to_collect) {
        throw new GuepexValidationError(
          `product_to_collect is required when has_exchange is true for order ${parcel.order_id}`,
          { order_id: parcel.order_id, has_exchange: true, product_to_collect: null }
        );
      }

      // Validate price range (0-150000 DA per Guepex docs)
      const GUEPEX_MAX_COD = 150000;
      if (typeof parcel.price !== 'number' || parcel.price < 0 || parcel.price > GUEPEX_MAX_COD) {
        throw new GuepexValidationError(
          `Invalid price ${parcel.price} for order ${parcel.order_id}. Must be 0-${GUEPEX_MAX_COD} DA`,
          { order_id: parcel.order_id, price: parcel.price, max: GUEPEX_MAX_COD }
        );
      }

      // Validate declared_value range (0-150000 DA per Guepex docs)
      if (typeof parcel.declared_value !== 'number' || parcel.declared_value < 0 || parcel.declared_value > GUEPEX_MAX_COD) {
        throw new GuepexValidationError(
          `Invalid declared_value ${parcel.declared_value} for order ${parcel.order_id}. Must be 0-${GUEPEX_MAX_COD} DA`,
          { order_id: parcel.order_id, declared_value: parcel.declared_value, max: GUEPEX_MAX_COD }
        );
      }

      // Validate phone format (starts with 0, 9 or 10 digits total)
      const phone = parcel.contact_phone?.replace(/[\s\-\(\)]/g, '');
      if (!phone || !phone.startsWith('0') || (phone.length !== 9 && phone.length !== 10) || !/^\d+$/.test(phone)) {
        throw new GuepexValidationError(
          `Invalid phone number "${parcel.contact_phone}" for order ${parcel.order_id}. Must start with 0 and be 9-10 digits`,
          { order_id: parcel.order_id, contact_phone: parcel.contact_phone }
        );
      }

      // Validate dimensions and weight are non-negative
      if (parcel.length < 0 || parcel.width < 0 || parcel.height < 0 || parcel.weight < 0) {
        throw new GuepexValidationError(
          `Negative dimensions/weight for order ${parcel.order_id}`,
          { order_id: parcel.order_id, length: parcel.length, width: parcel.width, height: parcel.height, weight: parcel.weight }
        );
      }
    }

    // Retry parcel creation with exponential backoff
    if (!this.enabled) return this._disabledResponse('single');
    return this._retryWithBackoff(() => 
      this._executeWithRateLimit('POST', '/parcels', parcels),
      { maxRetries: 2 } // Max 2 retries for critical operations
    );
  }

  /**
   * Get parcel tracking information
   */
  async getParcel(tracking) {
    if (!tracking) {
      throw new GuepexValidationError('Tracking number is required', { tracking: null });
    }
    
    if (!this.enabled) return this._disabledResponse('single');
    return this._executeWithRateLimit('GET', `/parcels/${tracking}`);
  }

  /**
   * Get multiple parcels
   */
  async getParcels(options = {}) {
    if (!this.enabled) return this._disabledResponse('list');
    return this._executeWithRateLimit('GET', '/parcels', null, { params: options });
  }

  /**
   * Update parcel (only allowed when status is "En préparation")
   */
  async updateParcel(tracking, updates) {
    if (!tracking) {
      throw new Error('Tracking number is required');
    }
    
    if (!this.enabled) return this._disabledResponse('single');
    return this._executeWithRateLimit('PATCH', `/parcels/${tracking}`, updates);
  }

  /**
   * Delete parcel (only allowed when status is "En préparation")
   */
  async deleteParcel(tracking) {
    if (!tracking) {
      throw new Error('Tracking number is required');
    }
    
    if (!this.enabled) return this._disabledResponse('single');
    return this._executeWithRateLimit('DELETE', `/parcels/${tracking}`);
  }

  /**
   * Get parcel history (tracking events)
   */
  async getHistory(tracking) {
    if (!tracking) {
      throw new Error('Tracking number is required');
    }
    
    if (!this.enabled) return this._disabledResponse('single');
    return this._executeWithRateLimit('GET', `/histories/${tracking}`);
  }

  /**
   * Get multiple histories
   */
  async getHistories(options = {}) {
    if (!this.enabled) return this._disabledResponse('list');
    return this._executeWithRateLimit('GET', '/histories', null, { params: options });
  }

  /**
   * Get current rate limiter statistics
   */
  getRateLimitStats() {
    return this.rateLimiter.getStats();
  }

  /**
   * Verify webhook signature (security)
   * 
   * According to Guepex docs:
   * - Signature is sent in X_YALIDINE_SIGNATURE header
   * - HMAC-SHA256 using secret key and raw payload
   * - Must compare hex strings using constant-time comparison
   * 
   * @param {Buffer|string} rawBody - Raw request body (NOT parsed JSON)
   * @param {string} signature - Signature from X_YALIDINE_SIGNATURE header
   * @returns {boolean} Whether signature is valid
   */
  verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.GUEPEX_WEBHOOK_SECRET;
    
    if (!secret) {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        console.warn('[Guepex] Webhook secret not configured. Skipping verification (dev mode only).');
        return true;
      }
      console.error('[Guepex] Webhook secret not configured in production. Rejecting request.');
      return false;
    }

    if (!signature) {
      console.warn('[Guepex] No signature provided in webhook request.');
      return false;
    }

    // Ensure rawBody is a Buffer or string, not parsed object
    const bodyToHash = Buffer.isBuffer(rawBody) 
      ? rawBody 
      : typeof rawBody === 'string' 
        ? rawBody 
        : JSON.stringify(rawBody);

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyToHash)
      .digest('hex');

    // Constant-time comparison requires equal length buffers
    if (signature.length !== expectedSignature.length) {
      console.warn('[Guepex] Signature length mismatch.');
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch (error) {
      console.error('[Guepex] Signature verification error:', error.message);
      return false;
    }
  }

  /**
   * Get the expected webhook signature header name
   * Guepex uses X_YALIDINE_SIGNATURE (note: underscore format in PHP $_SERVER)
   */
  static get WEBHOOK_SIGNATURE_HEADER() {
    return 'x-yalidine-signature';
  }
}

// Singleton instance
const guepexClient = new GuepexAPIClient();

// Export class for static method access
export { GuepexAPIClient };

export default guepexClient;

// Export error classes for better error handling in consumers
export {
  GuepexError,
  GuepexAuthenticationError,
  GuepexRateLimitError,
  GuepexValidationError,
  GuepexNetworkError,
  GuepexTimeoutError,
  GuepexServerError
};
