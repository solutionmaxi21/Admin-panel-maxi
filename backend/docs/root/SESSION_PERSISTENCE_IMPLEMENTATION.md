# Session Persistence - Implementation Reference

## Files Modified

### 1. `admin/src/services/apiService.js`

**Section 1: Request Configuration (Lines 1-37)**
```javascript
const apiRequest = async (endpoint, options = {}, isRetry = false) => {
  const config = {
    ...options,
    // CRITICAL: Always send cookies with requests
    credentials: 'include', // ← THE FIX
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Type': 'admin',
      ...options.headers,
    },
  };

  // For Electron: fetch token from secure storage
  let storedToken = null
  try {
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getToken) {
      storedToken = await window.electronAPI.getToken()
    }
  } catch (e) {
    storedToken = null
  }

  if (storedToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${storedToken}`;
  }
```

**Key Points:**
- ✅ `credentials: 'include'` is set on every request
- ✅ Only for Electron do we try to use stored token
- ✅ No localStorage usage

---

**Section 2: Error Handling & Auto-Refresh (Lines 38-90)**
```javascript
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);

    // Check for errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // If 401 Unauthorized (and not already retrying)
      if (response.status === 401 && !isRetry) {
        console.log('[Auth] Access token expired, attempting refresh...');
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include', // Send refresh token cookie
            headers: { 'X-Client-Type': 'admin' }
          });

          console.log('[Auth] Refresh response status:', refreshRes.status);

          if (refreshRes.ok) {
            console.log('[Auth] Refresh successful, retrying original request');
            // Refresh success! Retry original request
            return apiRequest(endpoint, options, true);
          } else {
            const refreshError = await refreshRes.json().catch(() => ({}));
            console.error('[Auth] Refresh failed:', refreshRes.status, refreshError);
          }
        } catch (refreshErr) {
          console.error("[Auth] Token refresh exception:", refreshErr);
        }

        // If refresh failed, session is expired
        console.log('[Auth] Session expired, redirecting to login');

        // Redirect to login page
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }

        throw new Error('Session expired. Please login again.');
      }

      // Extract error message safely
      const baseMessage = errorData.error?.message
        || errorData.message
        || (typeof errorData.error === 'string' ? errorData.error : 'Unknown error occurred');

      const details = errorData?.error?.details;
      const detailsMessage = Array.isArray(details)
        ? details.map(d => d?.message || d?.field || String(d)).filter(Boolean).join('\n')
        : (typeof details === 'string' ? details : null);

      const errorMessage = detailsMessage && detailsMessage !== baseMessage
        ? `${baseMessage}: ${detailsMessage}`
        : baseMessage;

      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (!options.silent) {
      console.error(`API Error [${endpoint}]:`, error);
    }
    throw error;
  }
};
```

**Key Points:**
- ✅ Intercepts 401 errors
- ✅ Auto-attempts token refresh
- ✅ Retries request with `isRetry = true` to prevent infinite loops
- ✅ Redirects to login if refresh fails

---

**Section 3: Authentication API (Lines 114-160)**
```javascript
export const authApi = {
  login: async (email, password) => {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, isAdmin: true }),
    });

    // Store token securely in Electron via IPC
    if (result.accessToken) {
      try {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.storeToken) {
          await window.electronAPI.storeToken(result.accessToken)
          console.log('[Auth] Token stored securely via Electron IPC')
        } else {
          console.log('[Auth] Using HttpOnly cookies for authentication')
        }
      } catch (e) {
        console.error('Failed to store token after login:', e)
      }
    }

    return result;
  },

  logout: async () => {
    // Clear secure token in Electron
    try {
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.clearToken) {
        await window.electronAPI.clearToken()
        console.log('[Auth] Token cleared from Electron storage')
      }
    } catch (e) {
      console.error('Failed to clear electron token:', e)
    }
    return apiRequest('/auth/logout', { method: 'POST' });
  },

  checkSession: async () => {
    // Hits /me endpoint which checks the cookie
    return apiRequest('/auth/me', { silent: true });
  }
};
```

**Key Points:**
- ✅ Login stores token in Electron (if available)
- ✅ Logout clears Electron storage
- ✅ checkSession is silent (no error logs on fresh load)

---

### 2. `admin/src/App.jsx`

**Session Verification on Mount (Lines 46-74)**
```javascript
// Check Session on App Load
useEffect(() => {
  const verifySession = async () => {
    try {
      // First attempt: Check current session with existing token
      const response = await authApi.checkSession();

      if (response.success && response.user) {
        // Double check role
        if (response.user.role === 'admin') {
          setIsAuthenticated(true);
          setCurrentUser(response.user);
          console.log("[App] Session verified, user:", response.user.email);
        } else {
          console.warn("Logged in user is not an admin");
          setIsAuthenticated(false);
        }
      }
    } catch (err) {
      // Session check failed - likely token expired
      console.log("[App] Session check failed, user not authenticated:", err.message);
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  verifySession();
}, []);
```

**Key Points:**
- ✅ Runs once on app mount (empty dependency array)
- ✅ Sets loading state to prevent blank screen
- ✅ Calls checkSession which includes credentials automatically
- ✅ Sets authenticated state based on response
- ✅ Auto-refresh happens in apiRequest middleware (transparent)

---

## How It Works Together

```
Step 1: User visits admin panel
└─ React app loads
└─ App.jsx useEffect runs
   └─ Calls authApi.checkSession()
      └─ Which calls apiRequest('/auth/me')

Step 2: apiRequest middleware
└─ Adds credentials: 'include' to config
└─ Browser auto-sends cookies
└─ Makes fetch request to /api/auth/me

Step 3: Backend processes request
└─ Gets cookies from request
└─ Validates adminAccessToken
   ├─ Valid? → Send user data (200)
   ├─ Expired? → Send 401
   └─ Missing? → Send 401

Step 4a: If token valid (200)
└─ apiRequest returns response
└─ App.jsx receives user data
└─ Sets authenticated = true
└─ Dashboard loads ✅

Step 4b: If token expired (401)
└─ apiRequest middleware intercepts
└─ Checks: response.status === 401 && !isRetry
└─ Calls refresh endpoint
└─ POST /api/auth/refresh with credentials
   └─ Backend sends new tokens
   └─ Browser auto-saves new cookies
└─ Retries original request with isRetry = true
└─ Request now succeeds (200)
└─ Dashboard loads ✅

Step 4c: If refresh also fails (401)
└─ apiRequest middleware sees failure
└─ Redirects window.location.href = '/login'
└─ Login page shown ✅
```

---

## Testing Implementation

### Unit Test: API Request Middleware
```javascript
// Test that 401 triggers refresh
describe('apiRequest middleware', () => {
  it('should auto-refresh on 401 and retry', async () => {
    // Mock first response as 401
    // Mock refresh response as 200
    // Mock retry response as 200
    
    const result = await apiRequest('/some-endpoint');
    
    // Should have called:
    // 1. fetch('/some-endpoint')
    // 2. fetch('/auth/refresh')
    // 3. fetch('/some-endpoint') again
    // Result should be the successful response
  });
});
```

### Integration Test: Session Persistence
```javascript
// Test complete flow
describe('Session Persistence', () => {
  it('should restore session on page reload', async () => {
    // 1. Login
    // 2. Simulate page refresh (unmount/remount App)
    // 3. Verify user stays logged in
    // 4. Dashboard should load without login
  });

  it('should auto-refresh expired token', async () => {
    // 1. Login
    // 2. Wait for token to "expire"
    // 3. Make API request
    // 4. Should auto-refresh and succeed
  });
});
```

### E2E Test: Manual Flow
```bash
1. Start backend: cd backend && node server.js
2. Start admin: cd admin && npm run dev
3. Login with admin@maxistore.com / Admin1234!
4. Wait for dashboard
5. Open DevTools → Application → Cookies
6. Verify: adminAccessToken + adminRefreshToken
7. Refresh page (F5)
8. Dashboard should load immediately (no redirect)
9. Check console: "[App] Session verified, user: admin@maxistore.com"
```

---

## Debugging

### Enable Debug Logging
In `apiService.js`, the middleware already logs:
```javascript
'[Auth] Access token expired, attempting refresh...'
'[Auth] Refresh response status: ...'
'[Auth] Refresh successful, retrying original request'
'[Auth] Token refresh exception: ...'
'[Auth] Session expired, redirecting to login'
```

In `App.jsx`:
```javascript
"[App] Session verified, user: ..."
"[App] Session check failed, user not authenticated: ..."
```

### Check Network Tab
```
1. Open DevTools → Network tab
2. Refresh page
3. Should see:
   - GET /api/auth/me → 200 (or 401 if token expired)
   - If 401, then: POST /api/auth/refresh → 200
   - If refresh successful: GET /api/auth/me → 200 (retry)
4. Only the successful responses should complete the request chain
```

### Verify Cookies in Storage
```
1. DevTools → Application → Cookies → localhost:5174
2. Should see:
   - adminAccessToken (HttpOnly, Strict)
   - adminRefreshToken (HttpOnly, Strict, Path: /api/auth/refresh)
   - admin-theme (regular cookie, OK)
3. localStorage should be EMPTY (not contain admin-token)
```

---

## Common Issues & Solutions

### Issue: Still redirected to login on refresh

**Check:**
1. Is `credentials: 'include'` in both places?
   ```javascript
   // In main apiRequest
   credentials: 'include'
   
   // In refresh fetch call
   credentials: 'include'
   ```

2. Are cookies being set? Check DevTools → Cookies
   ```
   Should see: adminAccessToken + adminRefreshToken
   ```

3. Is backend setting cookies? Check Network tab
   ```
   Response headers should include: Set-Cookie: adminAccessToken=...
   ```

**Solution:**
- Run: `cd backend && node scripts/tests/test-auth-complete.js`
- Check for "Session verified with cookie"

---

### Issue: Infinite refresh loops

**Cause:** `!isRetry` check missing

**Check:**
```javascript
if (response.status === 401 && !isRetry) { // ← Must have !isRetry
  // Attempt refresh...
  return apiRequest(endpoint, options, true); // ← Pass true
}
```

**Solution:**
- Verify both lines are present
- The `isRetry` parameter prevents infinite loops

---

### Issue: Token shows in localStorage

**Cause:** Old code is still running

**Check:**
```javascript
// This should NOT be in login:
localStorage.setItem('admin-token', ...)

// This should NOT be in logout:
localStorage.removeItem('admin-token', ...)

// This SHOULD be the only storage:
window.electronAPI.storeToken(...) // Electron only
```

**Solution:**
- File changes should remove all localStorage usage
- Only Electron secure storage is used

---

## Performance Considerations

### Network Requests
```
Best case (token valid):
└─ 1 request: GET /api/auth/me → 200

Normal case (token expired but refresh valid):
└─ 3 requests: 
   ├─ GET /api/auth/me → 401
   ├─ POST /api/auth/refresh → 200
   └─ GET /api/auth/me → 200

Worst case (both expired):
└─ 3 requests:
   ├─ GET /api/auth/me → 401
   ├─ POST /api/auth/refresh → 401
   └─ Redirect to /login
```

### Load Time Impact
- ✅ Minimal (all HTTP requests)
- ✅ Refresh happens in background
- ✅ User sees dashboard loading spinner

### Optimization Tips
1. Use `{ silent: true }` in checkSession to avoid error logs
2. Implement request batching to avoid refresh on multiple 401s
3. Cache session data to avoid checking on every render

---

## Production Deployment

**Before Deploying:**
- [ ] Set unique JWT secrets
- [ ] Enable HTTPS
- [ ] Test session persistence
- [ ] Clear browser cache
- [ ] Test token refresh at 14-minute mark
- [ ] Test session expiry at 7-day mark
- [ ] Monitor for 401 errors

**In Production:**
- [ ] Monitor refresh token failures
- [ ] Alert on suspicious login patterns
- [ ] Log all token refresh events
- [ ] Implement rate limiting on refresh endpoint

---

## Summary

**The Fix:**
1. Add `credentials: 'include'` to send cookies
2. Add auto-refresh middleware on 401 errors
3. Check session on app mount
4. Remove all localStorage token usage

**The Result:**
- ✅ Session persists across refreshes
- ✅ Transparent auto-refresh
- ✅ Secure HttpOnly cookies
- ✅ Clean, maintainable code

**The Key Line:**
```javascript
credentials: 'include' // This one line makes all the difference!
```
