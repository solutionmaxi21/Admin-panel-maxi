import crypto from 'crypto';

/**
 * CSRF Protection Middleware (Double-Submit Cookie Pattern)
 *
 * How it works:
 * 1. On every response, sets a non-HttpOnly `XSRF-TOKEN` cookie with a random value
 * 2. For state-changing requests (POST/PUT/DELETE/PATCH), requires the client to send
 *    the same value back in an `X-XSRF-TOKEN` header
 * 3. Since only same-origin JS can read the cookie and set the header, cross-origin
 *    requests (CSRF attacks) can't provide the matching header
 *
 * Usage in client:
 *   - Read `XSRF-TOKEN` cookie value
 *   - Send it as `X-XSRF-TOKEN` header on every mutating request
 */

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'x-xsrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths that are exempt from CSRF checks (webhooks, pre-auth endpoints, etc.)
// Pre-auth endpoints (login, signup, password reset) are exempt because:
// 1. They establish a NEW session — there's no existing session to hijack (CSRF's threat model)
// 2. They are already protected by dedicated rate limiters
// 3. Cross-origin JS cannot read the response cookies (HttpOnly), so CSRF attacks gain nothing
const EXEMPT_PATHS = [
  '/shipping/webhook',
  '/shipping/guepex/webhook',
  '/auth/login',
  '/auth/signup',
  '/auth/google',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/refresh',
];

/**
 * Set the CSRF token cookie on every response
 */
export const csrfTokenSetter = (req, res, next) => {
  // Generate a new token if not already set
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  next();
};

/**
 * Verify CSRF token on state-changing requests
 */
export const csrfProtection = (req, res, next) => {
  // Skip safe methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip exempt paths (webhooks)
  if (EXEMPT_PATHS.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Skip if request uses Authorization header (API clients, not browser-cookie-based)
  if (req.headers['authorization']) {
    return next();
  }

  // Skip in development if explicitly disabled
  if (process.env.NODE_ENV === 'development' && process.env.CSRF_DISABLED === 'true') {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: 'CSRF token validation failed. Please refresh the page and try again.',
      },
    });
  }

  next();
};

export default { csrfTokenSetter, csrfProtection };
