import { getApiBaseUrl } from './base-url'

const API_URL = getApiBaseUrl()

export { API_URL }

// Environment-aware logging
const isDev = process.env.NODE_ENV === 'development'
const apiLog = (message: string, ...args: any[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

export interface ApiError {
  message: string
  status: number
  code?: string
  details?: Array<{ field?: string; message: string }> | Record<string, unknown>
  isNetworkError?: boolean
}

// Known error codes for translation
export const ERROR_CODES = {
  // Auth errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  REFRESH_FAILED: 'REFRESH_FAILED',

  // Order errors
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ORDER_NOT_CANCELLABLE: 'ORDER_NOT_CANCELLABLE',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',

  // Shipping errors
  SHIPPING_CALC_FAILED: 'SHIPPING_CALC_FAILED',
  COMMUNE_NOT_DELIVERABLE: 'COMMUNE_NOT_DELIVERABLE',

  // Promo errors
  PROMO_INVALID: 'PROMO_INVALID',
  PROMO_EXPIRED: 'PROMO_EXPIRED',

  // Network
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
} as const

export interface ApiResponse<T> {
  data?: T
  error?: ApiError
}

// NOTE: We no longer store tokens in localStorage.
// We rely on HttpOnly Cookies managed by the browser.

// ============================================
// ROBUST TOKEN REFRESH SYSTEM
// ============================================

// Track ongoing refresh state
let isRefreshing = false
let refreshPromise: Promise<RefreshResult> | null = null
let lastSuccessfulAuth = 0 // Track when we last had a successful auth
let lastRefreshAttempt = 0
const MIN_REFRESH_INTERVAL = 2000 // 2 seconds between refresh attempts

// Queue of pending requests waiting for refresh to complete
interface PendingRequest {
  resolve: (value: RefreshResult) => void
}
let pendingRequests: PendingRequest[] = []
let lastRefreshResult: RefreshResult | null = null

interface RefreshResult {
  success: boolean
  isNetworkError?: boolean
  isTransient?: boolean
  status?: number
  message?: string
}

/**
 * Attempt to refresh the access token
 * - If refresh is already in progress, queue this request and wait
 * - Implements request queuing to handle concurrent 401s
 * - Distinguishes between network errors and auth failures
 */
async function attemptTokenRefresh(): Promise<RefreshResult> {
  // CRITICAL: Check if refresh is in progress FIRST (before MIN_REFRESH_INTERVAL check)
  // This ensures concurrent requests wait for the ongoing refresh instead of failing
  if (isRefreshing && refreshPromise) {
    apiLog('[Auth] Refresh in progress - queuing request...')
    return new Promise<RefreshResult>((resolve) => {
      pendingRequests.push({ resolve })
    })
  }

  // Prevent refresh spam - wait at least 2 seconds between attempts
  const now = Date.now()
  if (now - lastRefreshAttempt < MIN_REFRESH_INTERVAL) {
    apiLog('[Auth] Skipping refresh - too soon after last attempt')
    // If the last refresh succeeded recently, report success (token is still fresh)
    if (lastRefreshResult && lastRefreshResult.success) {
      return lastRefreshResult
    }
    return { success: false, message: 'Too many refresh attempts', isTransient: true }
  }

  // Start a new refresh
  isRefreshing = true
  lastRefreshAttempt = Date.now()

  refreshPromise = (async (): Promise<RefreshResult> => {
    try {
      apiLog('[Auth] Attempting token refresh...')

      const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // Send the Refresh Cookie
        headers: {
          'Content-Type': 'application/json',
          'x-client-type': 'customer', // Identify as customer client
        },
        cache: 'no-store', // Never cache auth responses
      })

      if (refreshResponse.ok) {
        apiLog('[Auth] Token refresh successful')
        lastSuccessfulAuth = Date.now()
        return { success: true }
      } else {
        const status = refreshResponse.status
        apiLog('[Auth] Token refresh failed with status:', status)

        let message = 'Session expired. Please login again.'
        try {
          const errorData = await refreshResponse.json()
          if (errorData.message) {
            message = errorData.message
          } else if (errorData.error?.message) {
            message = errorData.error.message
          }
        } catch {
          // Ignore JSON parse errors
        }

        // 429 or 5xx are transient - don't treat as auth failure
        const isTransient = status === 429 || status >= 500
        if (isTransient) {
          message = status === 429
            ? 'Too many requests. Please wait a moment.'
            : 'Server temporarily unavailable. Please try again.'
        }

        return {
          success: false,
          message,
          isNetworkError: false,
          isTransient,
          status,
        }
      }
    } catch (err) {
      // Determine if this is a network error
      const isNetworkError = err instanceof TypeError &&
        (err.message.includes('fetch') ||
          err.message.includes('network') ||
          err.message.includes('Failed to fetch'))

      console.error('[Auth] Refresh error:', err)

      return {
        success: false,
        isNetworkError,
        message: isNetworkError
          ? 'Connection failed during token refresh. Please check your internet.'
          : 'Token refresh failed'
      }
    } finally {
      // Note: isRefreshing is cleared in the outer scope after queue is drained
    }
  })()

  const result = await refreshPromise
  lastRefreshResult = result

  // Resolve all queued requests with the same result
  const queuedRequests = [...pendingRequests]
  pendingRequests = []
  queuedRequests.forEach(({ resolve }) => resolve(result))

  // Clear refresh state only after everything is settled
  isRefreshing = false
  refreshPromise = null

  return result
}

/**
 * Notify other browser tabs about auth state changes
 */
function broadcastAuthEvent(type: 'LOGIN' | 'LOGOUT' | 'REFRESH') {
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('auth-sync')
      channel.postMessage({ type, timestamp: Date.now() })
      channel.close()
    }
  } catch (err) {
    // BroadcastChannel not supported or error - ignore
    apiLog('[Auth] BroadcastChannel error:', err)
  }
}

// Export for use in auth-context
export { broadcastAuthEvent }

// Track last successful auth - exported for proactive refresh
export function updateLastSuccessfulAuth() {
  lastSuccessfulAuth = Date.now()
}

export function getLastSuccessfulAuth() {
  return lastSuccessfulAuth
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOnUnauthorized = true
): Promise<ApiResponse<T>> {

  // Normalize headers
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('x-client-type', 'customer') // Always identify as customer client

  // CSRF: Read the XSRF-TOKEN cookie and send it as a header on mutating requests
  const method = (options.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrfToken = typeof document !== 'undefined'
      ? document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1]
      : undefined
    if (csrfToken) {
      headers.set('X-XSRF-TOKEN', csrfToken)
    }
  }

  // We do NOT manually set Authorization header anymore.
  // The Cookie will be sent automatically due to credentials: 'include'

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // <--- THIS IS CRITICAL for Cookies
    cache: 'no-store', // Disable Next.js fetch caching - always get fresh data
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config)

    // Track successful authenticated requests only for protected endpoints
    if (response.ok) {
      const protectedPrefixes = ['/auth/me', '/users', '/orders', '/favorites', '/notifications', '/dashboard']
      if (protectedPrefixes.some(prefix => endpoint.startsWith(prefix))) {
        lastSuccessfulAuth = Date.now()
      }
    }

    // Handle 401 Unauthorized (Cookie expired or missing)
    if (response.status === 401 && retryOnUnauthorized) {
      apiLog('[Auth] Got 401 on', endpoint, '- attempting refresh...')

      // FIXED: Always attempt refresh, including for /auth/me endpoint
      // The old code skipped refresh for /auth/me which caused session issues
      const refreshResult = await attemptTokenRefresh()

      if (refreshResult.success) {
        apiLog('[Auth] Refresh successful - retrying', endpoint)
        // Retry original request (browser has new access cookie now)
        return fetchApi<T>(endpoint, options, false) // Don't retry again
      }

      // Refresh failed - determine appropriate error
      apiLog('[Auth] Refresh failed - returning error')

      if (refreshResult.isNetworkError) {
        return {
          error: {
            message: refreshResult.message || 'Connection failed. Please check your internet.',
            status: 0,
            code: ERROR_CODES.NETWORK_ERROR,
            isNetworkError: true,
          },
        }
      }

      // Check if this was a rate-limit or server error during refresh
      // These should NOT be treated as auth failures
      if (refreshResult.isTransient) {
        return {
          error: {
            message: refreshResult.message || 'Service temporarily unavailable. Please try again.',
            status: refreshResult.status || 503,
            code: 'TRANSIENT_ERROR',
            isNetworkError: false,
          },
        }
      }

      return {
        error: {
          message: refreshResult.message || 'Session expired. Please login again.',
          status: 401,
          code: ERROR_CODES.AUTH_REQUIRED,
        },
      }
    }

    // Parse response safely - handle non-JSON responses
    let data: any = null
    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    if (isJson) {
      try {
        data = await response.json()
      } catch (parseError) {
        apiLog('[API] Failed to parse JSON response:', parseError)
        data = null
      }
    } else {
      // Non-JSON response (HTML error page, empty body, etc.)
      const text = await response.text().catch(() => '')
      apiLog('[API] Non-JSON response:', text.substring(0, 100))
      data = null
    }

    if (!response.ok) {
      // Extract error info from various response shapes
      // Support both { error: { message, code } } and { error: "string" } and { message: "string" }
      let errorMessage = 'An error occurred'
      let errorCode: string | undefined
      let errorDetails: any

      if (data) {
        if (typeof data.error === 'string') {
          // Legacy shape: { error: "message" }
          errorMessage = data.error
        } else if (data.error && typeof data.error === 'object') {
          // New shape: { error: { message, code, details } }
          errorMessage = data.error.message || errorMessage
          errorCode = data.error.code
          errorDetails = data.error.details
        } else if (data.message) {
          // Simple shape: { message: "string" }
          errorMessage = data.message
        }

        // Detect stock errors from message if no code provided
        if (!errorCode && errorMessage) {
          if (errorMessage.toLowerCase().includes('insufficient stock') ||
            errorMessage.toLowerCase().includes('stock') && errorMessage.toLowerCase().includes('available')) {
            errorCode = ERROR_CODES.OUT_OF_STOCK
          } else if (errorMessage.toLowerCase().includes('not found')) {
            errorCode = ERROR_CODES.NOT_FOUND
          } else if (errorMessage.toLowerCase().includes('cannot cancel') ||
            errorMessage.toLowerCase().includes('can\'t be cancelled')) {
            errorCode = ERROR_CODES.ORDER_NOT_CANCELLABLE
          }
        }
      }

      return {
        error: {
          message: errorMessage,
          status: response.status,
          code: errorCode,
          details: errorDetails,
        },
      }
    }

    return { data }
  } catch (error) {
    console.error('[API] Fetch error:', error)

    // Determine if this is a network/timeout error
    const isNetworkError = error instanceof TypeError &&
      (error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('Failed to fetch'))

    return {
      error: {
        message: isNetworkError
          ? 'Connection failed. Please check your internet and try again.'
          : (error instanceof Error ? error.message : 'Network error'),
        status: 0,
        code: isNetworkError ? ERROR_CODES.NETWORK_ERROR : undefined,
        isNetworkError,
      },
    }
  }
}


// HTTP method helpers
export const api = {
  get: <T>(endpoint: string, options: RequestInit = {}, retry = true) =>
    fetchApi<T>(endpoint, { ...options, method: 'GET' }, retry),

  // Update POST to accept the retry flag and optional custom headers
  post: <T>(endpoint: string, body: unknown, retry = true, customHeaders?: Record<string, string>) =>
    fetchApi<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: customHeaders,
    }, retry),

  put: <T>(endpoint: string, body: unknown, retry = true) =>
    fetchApi<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    }, retry),

  patch: <T>(endpoint: string, body: unknown, retry = true) =>
    fetchApi<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, retry),

  delete: <T>(endpoint: string, retry = true) =>
    fetchApi<T>(endpoint, { method: 'DELETE' }, retry),
}