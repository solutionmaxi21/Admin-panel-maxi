# Session Persistence - Visual Guide

## The Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN PANEL LOGIN                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User enters credentials                                     │
│     ↓                                                            │
│  2. POST /api/auth/login { email, password, isAdmin: true }    │
│     ↓                                                            │
│  3. Backend validates & returns:                               │
│     {                                                           │
│       accessToken: "eyJhbGc...",                               │
│       user: { id, email, role: "admin" }                       │
│     }                                                           │
│     ↓                                                            │
│  4. Backend SETS cookies (HttpOnly):                           │
│     Set-Cookie: adminAccessToken=...   (15 min, HttpOnly)      │
│     Set-Cookie: adminRefreshToken=...  (7 days, HttpOnly)      │
│     ↓                                                            │
│  5. Browser receives & stores in secure cookie jar             │
│     (NOT visible to JavaScript, NOT in localStorage)           │
│     ↓                                                            │
│  6. App sets: isAuthenticated = true                           │
│     Dashboard loads ✅                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page Refresh - Session Persists

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER REFRESHES PAGE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User presses F5 (refresh)                                  │
│     ↓                                                            │
│  2. App mounts → useEffect runs                                │
│     ↓                                                            │
│  3. GET /api/auth/me with credentials: 'include'              │
│     ↓                                                            │
│  4. Browser AUTO-SENDS cookies:                                │
│     Cookie: adminAccessToken=...                               │
│     Cookie: adminRefreshToken=...                              │
│     X-Client-Type: admin                                       │
│     ↓                                                            │
│  5a. If Access Token Valid (< 15 min):                        │
│      ↓                                                           │
│      Server validates token → SUCCESS (200)                    │
│      ↓                                                           │
│      Returns: { user: { id, email, role } }                    │
│      ↓                                                           │
│      App sets authenticated = true                             │
│      Dashboard loads ✅                                         │
│                                                                  │
│  5b. If Access Token EXPIRED (> 15 min):                      │
│      ↓                                                           │
│      Server returns: 401 UNAUTHORIZED                          │
│      ↓                                                           │
│      apiRequest middleware intercepts:                         │
│      ├─ Sees: response.status === 401 && !isRetry             │
│      ├─ Triggers AUTO-REFRESH                                 │
│      ├─ POST /api/auth/refresh with credentials: 'include'    │
│      ├─ Browser sends adminRefreshToken cookie                │
│      ├─ Server validates refresh token                        │
│      │                                                          │
│      │  5b-i. If Refresh Token Valid (< 7 days):             │
│      │        ├─ Backend sets NEW cookies:                    │
│      │        │  Set-Cookie: adminAccessToken=... (new)       │
│      │        │  Set-Cookie: adminRefreshToken=... (new)      │
│      │        ├─ Returns: 200 OK                              │
│      │        ├─ apiRequest retries original GET /api/auth/me │
│      │        ├─ Uses NEW access token                        │
│      │        ├─ Returns user data                            │
│      │        └─ App sets authenticated = true                │
│      │           Dashboard loads ✅                            │
│      │                                                          │
│      │  5b-ii. If Refresh Token EXPIRED (> 7 days):          │
│      │         ├─ Backend returns: 401                        │
│      │         ├─ apiRequest middleware sees refresh failed   │
│      │         ├─ Clears any Electron secure storage          │
│      │         ├─ Redirects: window.location.href = '/login'  │
│      │         └─ Login page appears ✅                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Request Middleware (The Magic)

```
┌─────────────────────────────────────────────────────────────────┐
│            apiRequest(endpoint, options)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  const config = {                                              │
│    credentials: 'include',  ← KEY: Always send cookies!       │
│    headers: {                                                   │
│      'Content-Type': 'application/json',                       │
│      'X-Client-Type': 'admin'                                  │
│    }                                                            │
│  }                                                              │
│                                                                  │
│  try {                                                          │
│    const response = await fetch(url, config)                   │
│                                                                  │
│    if (!response.ok) {                                          │
│      if (response.status === 401 && !isRetry) {               │
│                                                                  │
│        // AUTO-REFRESH LOGIC                                   │
│        const refreshRes = await fetch('/api/auth/refresh', {  │
│          method: 'POST',                                       │
│          credentials: 'include',  ← Send refresh token        │
│          headers: { 'X-Client-Type': 'admin' }                │
│        })                                                      │
│                                                                  │
│        if (refreshRes.ok) {                                    │
│          // SUCCESS: Tokens refreshed                          │
│          // Retry original request with new token             │
│          return apiRequest(endpoint, options, true)            │
│        }                                                        │
│                                                                  │
│        // FAILURE: Redirect to login                           │
│        window.location.href = '/login'                         │
│      }                                                          │
│    }                                                            │
│                                                                  │
│    return await response.json()                                │
│  }                                                              │
│                                                                  │
│  catch (error) {                                               │
│    // Handle other errors                                      │
│  }                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Token Timeline

```
Day 0 - Login at 2:00 PM
├─ Access Token issued: expires at 2:15 PM (15 min)
├─ Refresh Token issued: expires at 2:00 PM + 7 days
└─ Both stored in HttpOnly cookies

Day 0 - 2:10 PM (within 15 min)
├─ User refreshes page
├─ Access token is valid (5 min left)
├─ GET /api/auth/me succeeds immediately
└─ No refresh needed ✅

Day 0 - 2:20 PM (past 15 min, within 7 days)
├─ User refreshes page
├─ Access token expired
├─ Auto-refresh triggers:
│  ├─ Refresh token is still valid (6 days 23h 40min left)
│  ├─ New access token issued
│  ├─ New refresh token issued (resets 7-day timer)
│  └─ Both stored in new cookies
├─ Request retried with new token
└─ Session persists ✅

Day 7 - 2:00 PM + 7 days (past 7 days)
├─ User refreshes page
├─ Access token expired
├─ Auto-refresh attempts:
│  ├─ Refresh token is ALSO expired
│  ├─ Refresh fails with 401
│  └─ User redirected to login
└─ Must log in again ✅
```

---

## Cookie Storage in Browser

```
Browser Cookie Jar (HttpOnly)
├─────────────────────────────────────────────────────────────
│ Name: adminAccessToken
│ Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
│ Expires: Tue, 20 Jan 2026 15:08:54 GMT
│ Path: /
│ Domain: localhost
│ HttpOnly: YES ← Cannot access via JavaScript
│ Secure: YES (production only) ← HTTPS only
│ SameSite: Strict ← CSRF protection
├─────────────────────────────────────────────────────────────
│ Name: adminRefreshToken
│ Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
│ Expires: Tue, 27 Jan 2026 14:53:54 GMT
│ Path: /api/auth/refresh ← Only sent to refresh endpoint
│ Domain: localhost
│ HttpOnly: YES ← Cannot access via JavaScript
│ Secure: YES (production only) ← HTTPS only
│ SameSite: Strict ← CSRF protection
├─────────────────────────────────────────────────────────────
│ Name: admin-theme (regular cookie, no HttpOnly)
│ Value: light
│ ...
└─────────────────────────────────────────────────────────────

localStorage (SHOULD BE EMPTY)
├─────────────────────────────────────────────────────────────
│ admin-token: (empty)
│ admin-refresh-token: (empty)
│ admin-theme: light (OK - non-sensitive)
└─────────────────────────────────────────────────────────────
```

---

## Error Scenarios & Handling

```
Scenario 1: Network Error During Login
└─ No cookies set
└─ User stays on login page
└─ Retry login ✅

Scenario 2: Network Error During API Call
└─ Cookies already set from login
└─ apiRequest catches error
└─ Shows error message to user
└─ User can retry ✅

Scenario 3: Token Refresh Fails (network error)
└─ Original request failed with 401
└─ Refresh attempt also fails
└─ User redirected to login
└─ Must log in again ✅

Scenario 4: User Logs Out
└─ POST /api/auth/logout
└─ Backend clears both cookies via Set-Cookie: ""
└─ Browser removes cookies
└─ localStorage already empty (cleaned in Fix #3)
└─ Session fully cleared ✅

Scenario 5: User Inactive for 7 Days
└─ Refresh token expires
└─ Next page refresh triggers refresh attempt
└─ Refresh fails (no valid token)
└─ User redirected to login
└─ Must log in again ✅
```

---

## Key Points

### ✅ What Makes This Secure

```
1. HttpOnly Cookies
   └─ JavaScript cannot access → XSS-proof

2. credentials: 'include'
   └─ Browser auto-sends cookies with every request

3. SameSite=Strict
   └─ Cookies only sent to same site → CSRF-proof

4. Secure Flag (production)
   └─ HTTPS-only → Man-in-the-middle proof

5. Short-lived Access Token (15 min)
   └─ Limits damage if token is stolen

6. Long-lived Refresh Token (7 days)
   └─ Keeps users logged in but not forever
```

### ✅ What Makes This User-Friendly

```
1. Automatic Refresh
   └─ User doesn't notice token expiry

2. Session Persists
   └─ Survives page refresh, browser close

3. No Manual Token Management
   └─ Happens transparently

4. Clear Timeout
   └─ After 7 days, user must log in again
   └─ Security vs convenience balance
```

---

## Testing the Flow

```
Test 1: Verify Cookies
├─ Open DevTools (F12)
├─ Application → Cookies → localhost:5174
├─ Should see: adminAccessToken + adminRefreshToken
└─ Both marked as: HttpOnly ✅

Test 2: Session Persistence
├─ Login to admin panel
├─ Refresh page (F5)
├─ Dashboard should load WITHOUT login ✅
└─ Check console: [App] Session verified

Test 3: Silent Refresh
├─ Login to admin panel
├─ Wait 15+ minutes
├─ Make any API request
├─ Check Network tab:
│  ├─ First request: 401
│  ├─ POST /api/auth/refresh: 200
│  ├─ Retry original request: 200
└─ User never sees the 401 ✅

Test 4: Session Expiry
├─ Clear the adminRefreshToken cookie manually
├─ Refresh page
├─ Should redirect to login ✅
```

---

## Summary Diagram

```
                  LOGIN
                    ↓
        ┌─────────────────────┐
        │ Set Cookies         │
        │ ✅ adminAccessToken │
        │ ✅ adminRefreshToken│
        └─────────────────────┘
                    ↓
            DASHBOARD LOADS
                    ↓
            USER REFRESHES
                    ↓
        ┌─────────────────────┐
        │ GET /api/auth/me    │
        │ + credentials       │
        │ (cookies sent auto) │
        └─────────────────────┘
                    ↓
        ┌─────────────────────┐
        │ Token Valid?        │
        └──┬──────────────┬───┘
           │              │
          YES             NO
           │              │
           ↓              ↓
        ┌──────┐    ┌────────────┐
        │USER  │    │ AUTO-      │
        │STAYS │    │ REFRESH    │
        │LOGGED│    │ (silent)   │
        │IN   │    └────┬───────┘
        └──────┘         │
                  ┌──────┴────────┐
                  │               │
               SUCCESS         FAILURE
                  │               │
                  ↓               ↓
              ┌────────┐    ┌──────────┐
              │REDIRECT│    │ REDIRECT │
              │DASHBOARD    │ TO LOGIN │
              └────────┘    └──────────┘
```

---

**Result:** User stays authenticated across page refreshes, with automatic token refresh happening silently in the background! 🎉
