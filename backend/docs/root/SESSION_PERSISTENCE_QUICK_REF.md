# Session Persistence - Quick Reference

## Problem & Solution

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Redirected to login on refresh | Cookies not sent with requests | Added `credentials: 'include'` |
| Token expires mid-session | No refresh mechanism | Implemented auto-refresh on 401 |
| Stays logged in too long | localStorage tokens never cleared | Removed all localStorage usage |

---

## How It Works Now

### Before Refresh
```
User logged in
├─ Access Token in cookie (15 min valid)
├─ Refresh Token in cookie (7 day valid)
└─ User doing normal stuff
```

### On Page Refresh
```
1. App loads → useEffect runs
2. Calls GET /api/auth/me
3. Browser sends cookies automatically
4. Server validates access token
   ├─ Valid? → Return user data → Show dashboard ✅
   └─ Expired? → Return 401
      → apiRequest auto-refreshes
      → Gets new tokens
      → Retries request → Show dashboard ✅
```

---

## The Fix (Minimal Code)

### In `admin/src/services/apiService.js`:

```javascript
// ✅ ALWAYS include this in fetch config
const config = {
  credentials: 'include', // Send cookies with every request
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Type': 'admin',
  },
};

// ✅ Middleware auto-handles token refresh
if (response.status === 401 && !isRetry) {
  // Try to refresh tokens
  const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include', // Important!
    headers: { 'X-Client-Type': 'admin' }
  });
  
  if (refreshRes.ok) {
    // Retry original request with new token
    return apiRequest(endpoint, options, true);
  }
}
```

### In `admin/src/App.jsx`:

```javascript
// ✅ Check session on app mount
useEffect(() => {
  const verifySession = async () => {
    try {
      const response = await authApi.checkSession();
      if (response.success && response.user) {
        setIsAuthenticated(true);
        setCurrentUser(response.user);
      }
    } catch (err) {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };
  verifySession();
}, []);
```

---

## Testing

### Quick Test
```bash
cd admin
npm run dev
# Login → Refresh page → Should stay logged in ✅
```

### Full Test
```bash
cd backend
node scripts/tests/test-auth-complete.js
# All tests should pass ✅
```

---

## Token Timeline

| Time | Token Status | User Action | Result |
|------|---|---|---|
| 0:00 | Fresh login | - | Access (15m), Refresh (7d) |
| 0:05 | All valid | Refresh page | Stays logged in ✅ |
| 0:20 | Access expired | Refresh page | Auto-refresh → Stays logged in ✅ |
| 7d | Both expired | Refresh page | Redirect to login ✅ |

---

## Security Checklist

- ✅ Tokens in HttpOnly cookies (XSS-proof)
- ✅ `credentials: 'include'` on all requests
- ✅ Automatic refresh on 401
- ✅ No localStorage tokens
- ✅ SameSite=Strict (CSRF-proof)
- ✅ Secure flag in production

---

## Key Files Changed

1. **admin/src/services/apiService.js** - Token refresh middleware
2. **admin/src/App.jsx** - Session check on mount

---

## Debugging

### Not persisting session?
```javascript
// Check browser console for:
console.log('[Auth] ...') // Should see logs

// Check DevTools → Application → Cookies
// Should see: adminAccessToken (HttpOnly)
```

### Tokens in localStorage?
```javascript
// This should now be empty
localStorage.getItem('admin-token') // → null ✅
```

### 401 errors in network tab?
```javascript
// That's normal! Check for:
// POST /api/auth/refresh → 200 (refresh successful)
// Then original request → 200 (retry successful)
```

---

## Status: ✅ COMPLETE

Session now persists across:
- ✅ Page refresh
- ✅ Token expiry (auto-refresh)
- ✅ Browser close/reopen (if within 7 days)
- ✅ Network reconnect

Redirects to login only when:
- ✅ Both tokens expired (7+ days)
- ✅ User explicitly logs out
- ✅ Suspicious activity detected
