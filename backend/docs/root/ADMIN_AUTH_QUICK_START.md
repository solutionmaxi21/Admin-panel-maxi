# Admin Authentication - Quick Start Guide

## Login Credentials

### Admin Account
- **URL:** http://localhost:5173
- **Email:** `admin@maxistore.com`
- **Password:** `Admin1234!`

## Starting the Services

### 1. Start Backend (Required)
```bash
cd backend
node server.js
```

The backend should be running on http://localhost:3001

### 2. Start Admin Panel
```bash
cd admin
npm run dev
```

The admin panel will open at http://localhost:5174

## Authentication Flow

### First Time Setup
1. Make sure the backend is running
2. Make sure PostgreSQL is running
3. If needed, reset admin password:
   ```bash
   cd backend
   node scripts/tools/set-admin-password.js
   ```

### Login Process
1. Navigate to http://localhost:5174
2. You'll be redirected to `/login`
3. Enter credentials:
   - Email: `admin@maxistore.com`
   - Password: `Admin1234!`
4. Click "Sign In"
5. You'll be redirected to the dashboard

### Authentication Technical Details

#### Cookie-Based Authentication
The system uses HttpOnly cookies for security:
- `adminAccessToken` - 15 minute expiry
- `adminRefreshToken` - 7 day expiry

#### Session Management
- Session is checked on app load via `/api/auth/me`
- Tokens are automatically refreshed when expired
- Logout clears all cookies and localStorage

#### CORS Configuration
The backend allows requests from:
- http://localhost:5173
- http://localhost:5174
- http://localhost:3000

Credentials are allowed via `credentials: 'include'`

## Troubleshooting

### Issue: "Invalid credentials"
**Solution:** Reset the admin password
```bash
cd backend
node scripts/tools/set-admin-password.js
```

### Issue: "Access token required"
**Cause:** Cookies not being sent/received

**Solutions:**
1. Make sure backend is running
2. Check CORS settings in browser console
3. Clear browser cookies and try again
4. Make sure you're accessing via http://localhost (not 127.0.0.1)

### Issue: "CORS error"
**Cause:** Origin mismatch

**Solutions:**
1. Use http://localhost:5174 (not 127.0.0.1:5174)
2. Check backend/src/config/security.js for allowed origins
3. Restart backend after CORS changes

### Issue: "Session expired" after refresh
**Cause:** Refresh token expired or invalidated

**Solution:**
1. Clear cookies and localStorage
2. Login again
3. If persists, check database for refresh token records

### Issue: Admin panel shows blank screen
**Cause:** Backend not running or network error

**Solutions:**
1. Check backend is running: http://localhost:3001/api
2. Check browser console for errors
3. Check backend console for errors
4. Verify database connection

## Testing Authentication

### Quick Test Script
```bash
cd backend
node scripts/tests/test-auth-complete.js
```

Expected output:
```
✅ Login successful
✅ Session verified with cookie
✅ Admin routes accessible
✅ Logout successful
🎉 All authentication tests passed!
```

### Manual Testing
1. Open browser DevTools (F12)
2. Go to Application tab
3. Check Cookies for localhost:5174
4. You should see:
   - `adminAccessToken` (HttpOnly)
   - `adminRefreshToken` (HttpOnly)

### API Testing (Postman)
1. POST http://localhost:3001/api/auth/login
   ```json
   {
     "email": "admin@maxistore.com",
     "password": "Admin1234!",
     "isAdmin": true
   }
   ```
2. Check response for accessToken
3. Use token in Authorization header:
   ```
   Authorization: Bearer <accessToken>
   ```

## Security Best Practices

### For Development
- Use the provided test password: `Admin1234!`
- Keep localhost-only access
- Don't commit passwords to git

### For Production
1. Change admin password immediately
2. Use environment variables for secrets
3. Enable HTTPS (secure cookies)
4. Implement 2FA
5. Add session monitoring
6. Enable audit logging
7. Use strong password policy
8. Rotate JWT secrets regularly

## Common Admin Tasks

### Reset Admin Password
```bash
cd backend
node scripts/tools/set-admin-password.js
```

### Check Admin Accounts
```bash
cd backend
node scripts/tools/check-admin.js
```

### Create New Admin
```sql
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
VALUES ('newadmin@maxistore.com', '<hashed_password>', 'New', 'Admin', 'admin', true);
```

Then set password:
```bash
# Modify scripts/tools/set-admin-password.js to use the new email
node scripts/tools/set-admin-password.js
```

## Files Reference

### Authentication Files
- `backend/routes/auth-v2.js` - Auth routes
- `backend/src/shared/middleware/auth.js` - Auth middleware
- `backend/src/services/authService.js` - Auth business logic
- `backend/src/config/security.js` - CORS & security config
- `admin/src/services/apiService.js` - Frontend API client
- `admin/src/pages/LoginPage.jsx` - Login UI
- `admin/src/App.jsx` - Session management

### Testing Scripts
- `backend/scripts/tests/test-auth-complete.js` - Full auth flow test
- `backend/scripts/tests/test-admin-auth.js` - Basic auth test
- `backend/scripts/tools/check-admin.js` - List admins
- `backend/scripts/tools/check-admin-password.js` - Check password hash
- `backend/scripts/tools/set-admin-password.js` - Reset password

### Documentation
- `docs/testing/TEST_ACCOUNTS.md` - All test credentials
- `ADMIN_AUTH_FIXES.md` - Detailed technical docs
- `ADMIN_AUTH_QUICK_START.md` - This file

## Need Help?

Check these files:
1. `ADMIN_AUTH_FIXES.md` - Technical details
2. `docs/testing/TEST_ACCOUNTS.md` - All test accounts
3. Backend console logs
4. Browser DevTools console
5. Network tab in DevTools

## Status: ✅ Fully Operational

The admin authentication system is working correctly with:
- Secure cookie-based authentication
- Automatic token refresh
- CORS properly configured  
- Role-based access control
- Rate limiting protection
- Strong password requirements
