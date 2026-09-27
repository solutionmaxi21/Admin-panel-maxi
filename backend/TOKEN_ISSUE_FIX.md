# 🔍 TOKEN REFRESH ISSUE ANALYSIS & FIX

## Problem Identified

You're experiencing logout after ~10 minutes due to **secure cookie configuration in production mode over HTTP**.

### Root Cause

```javascript
// backend/routes/auth-v2.js Line 31
secure: process.env.COOKIE_SECURE === 'false' ? false : process.env.NODE_ENV === 'production'
```

**Your .env settings:**
- `NODE_ENV=production` ✅
- `COOKIE_SECURE` is NOT set (undefined)
- Access via: `http://26.155.110.217:3000` (HTTP, not HTTPS) ❌

**The Logic:**
1. `NODE_ENV=production` → `secure: true` is set
2. Secure cookies ONLY work over HTTPS
3. Your site uses HTTP (port 3000, no SSL)
4. **Browsers refuse to send secure cookies over HTTP**
5. After ~10 min when access token expires, the refresh cookie can't be sent
6. Refresh fails → User logged out ✅ THIS IS THE ISSUE

---

## Solution Options

### Option 1: Disable Secure Cookies (Quick Fix for HTTP)

Add to `backend/.env`:
```env
COOKIE_SECURE=false
```

**Pros:**
- Immediate fix
- Works with HTTP
- No infrastructure changes needed

**Cons:**
- Less secure (cookies sent over unencrypted HTTP)
- Not recommended for production with real users
- Vulnerable to man-in-the-middle attacks

---

### Option 2: Enable HTTPS (Recommended for Production)

Set up HTTPS with a reverse proxy (nginx, Apache) or use Let's Encrypt SSL certificates.

**Example nginx config:**
```nginx
server {
    listen 443 ssl;
    server_name 26.155.110.217;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Pros:**
- Secure for production
- Cookies work properly
- Protects user data in transit

**Cons:**
- Requires SSL certificate setup
- More configuration needed

---

### Option 3: Use Development Mode (For Testing Only)

Change `backend/.env`:
```env
NODE_ENV=development
```

**Pros:**
- Quick temporary fix
- Cookies work over HTTP

**Cons:**
- Disables production security features
- NOT suitable for real production

---

## Verification Steps

After applying a fix:

### 1. Verify Cookie Settings
```bash
# Check what cookies are being set
curl -v http://26.155.110.217:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@maxistore.com","password":"admin123","isAdmin":true}'
```

Look for `Set-Cookie` headers:
```
Set-Cookie: adminAccessToken=...; HttpOnly; SameSite=Lax; Max-Age=900000
Set-Cookie: adminRefreshToken=...; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=604800000
```

**Should NOT see:** `Secure` flag when using HTTP

### 2. Check Browser Developer Tools
1. Open admin panel: `http://26.155.110.217:3000`
2. Login
3. F12 → Application → Cookies → `http://26.155.110.217:3000`
4. Verify presence of:
   - `adminAccessToken`
   - `adminRefreshToken`

If cookies are missing → Secure cookie issue confirmed

### 3. Wait 10-15 Minutes
1. Stay logged in
2. Wait for access token to expire
3. Click around / make API requests
4. Check Network tab for:
   - `POST /api/auth/refresh` → Should return 200
   - Original request should retry and succeed

### 4. Check Refresh Token Cookie Path
The refresh token cookie has `path: '/api/auth'`:
```javascript
const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  path: '/api/auth',  // ← Important!
  maxAge: REFRESH_TOKEN_COOKIE_DAYS * 24 * 60 * 60 * 1000
};
```

**This is correct** - the refresh cookie is only sent to `/api/auth/*` endpoints, including `/api/auth/refresh`.

---

## Recommended Configuration

For your current setup (HTTP in production):

**backend/.env:**
```env
PORT=3001
NODE_ENV=production

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/maxistore

# JWT Secrets
JWT_ACCESS_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0
JWT_REFRESH_SECRET=z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0f9e8d7c6b5a4z3y2x1w0v9u8t7s6r5q4p3o2n1m0

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://26.155.110.217:3000,http://26.155.110.217:3001,http://localhost:5174
BCRYPT_SALT_ROUNDS=12
HMAC_SECRET=offline-sync-secret-2026-secure-key

# Token Expiration Configuration
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
REFRESH_TOKEN_COOKIE_DAYS=7
PASSWORD_RESET_EXPIRY_MINUTES=30
EMAIL_VERIFICATION_EXPIRY_HOURS=24

# IMPORTANT: Disable secure cookies for HTTP
COOKIE_SECURE=false  # ← ADD THIS LINE

CLIENT_URL=http://26.155.110.217:3000
GOOGLE_CLIENT_ID=773927793002-u9ei3s1pctlno1jarej61h89b4d0aua4.apps.googleusercontent.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=5

# Cache Configuration
CACHE_ENABLED=true
REVALIDATION_SECRET=revalidate-secret-2026-secure-key
STORE_URL=http://26.155.110.217:3000

TEST_ADMIN_EMAIL=admin@maxistore.com
TEST_ADMIN_PASSWORD=admin123

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=solutionmaxi@gmail.com
EMAIL_PASS=gavg qwgu iblv umrv
FRONTEND_URL=http://26.155.110.217:3000

# Guepex API Configuration
GUEPEX_API_ID=18940161153871600505
GUEPEX_API_TOKEN=MzU1ZLhVuSbGxewcmEfTnqkijRD56Cdlt9sr37pgIBAFJoQN2PW4OYav0HKyX8
```

---

## Additional Checks

### 1. Verify Frontend API URL
Check `admin/.env` or `admin/.env.local`:
```env
VITE_API_URL=http://26.155.110.217:3001/api
```

### 2. Check CORS Configuration
Ensure `backend/.env` has:
```env
ALLOWED_ORIGINS=http://26.155.110.217:3000
```

### 3. Verify credentials: 'include'
Frontend must send cookies with every request.

Check `admin/src/services/apiService.js`:
```javascript
const config = {
  ...options,
  credentials: 'include',  // ← Must be present
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Type': 'admin',
    ...options.headers,
  },
};
```

This is already correct in your codebase ✅

---

## Summary

**The issue:** Secure cookies enabled in production mode but accessing via HTTP

**The fix:** Add `COOKIE_SECURE=false` to `backend/.env`

**After the fix:**
1. Restart backend server
2. Clear browser cookies
3. Login again
4. Cookies will now persist
5. Auto-refresh will work after 10+ minutes

**Long-term:** Set up HTTPS and remove `COOKIE_SECURE=false` for better security.
