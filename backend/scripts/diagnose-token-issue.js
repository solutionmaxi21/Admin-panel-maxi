/**
 * Token Expiration Diagnostic Script
 * 
 * This script helps diagnose why users are being redirected to login after ~10 minutes
 * even though the refresh token should be valid for 7 days.
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║         TOKEN EXPIRATION DIAGNOSTIC REPORT                    ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// 1. Check Environment Variables
console.log('📋 ENVIRONMENT CONFIGURATION');
console.log('─────────────────────────────────────────────────────────────────');
console.log(`NODE_ENV:                    ${process.env.NODE_ENV || 'NOT SET'}`);
console.log(`ACCESS_TOKEN_EXPIRY:         ${process.env.ACCESS_TOKEN_EXPIRY || '15m (default)'}`);
console.log(`REFRESH_TOKEN_EXPIRY:        ${process.env.REFRESH_TOKEN_EXPIRY || '7d (default)'}`);
console.log(`REFRESH_TOKEN_COOKIE_DAYS:   ${process.env.REFRESH_TOKEN_COOKIE_DAYS || '7 (default)'}`);
console.log(`ACCESS_TOKEN_EXPIRY_MS:      ${process.env.ACCESS_TOKEN_EXPIRY_MS || '900000 (15 min default)'}`);
console.log(`COOKIE_SECURE:               ${process.env.COOKIE_SECURE || 'true (production default)'}`);
console.log();

// 2. Parse Token Expiry Values
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const ACCESS_TOKEN_EXPIRY_MS = parseInt(process.env.ACCESS_TOKEN_EXPIRY_MS) || 15 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_DAYS = parseInt(process.env.REFRESH_TOKEN_COOKIE_DAYS) || 7;

// Convert to milliseconds for comparison
function parseExpiry(expiry) {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  
  const num = parseInt(match[1]);
  const unit = match[2];
  
  switch(unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

const accessTokenMs = parseExpiry(ACCESS_TOKEN_EXPIRY);
const refreshTokenMs = parseExpiry(REFRESH_TOKEN_EXPIRY);
const refreshCookieMs = REFRESH_TOKEN_COOKIE_DAYS * 24 * 60 * 60 * 1000;

console.log('⏱️  TOKEN LIFETIMES (in milliseconds)');
console.log('─────────────────────────────────────────────────────────────────');
console.log(`Access Token (JWT):          ${accessTokenMs}ms = ${(accessTokenMs / 60000).toFixed(2)} minutes`);
console.log(`Access Token (Cookie):       ${ACCESS_TOKEN_EXPIRY_MS}ms = ${(ACCESS_TOKEN_EXPIRY_MS / 60000).toFixed(2)} minutes`);
console.log(`Refresh Token (JWT):         ${refreshTokenMs}ms = ${(refreshTokenMs / (24 * 60 * 60 * 1000)).toFixed(2)} days`);
console.log(`Refresh Token (Cookie):      ${refreshCookieMs}ms = ${(refreshCookieMs / (24 * 60 * 60 * 1000)).toFixed(2)} days`);
console.log();

// 3. Check for Mismatches
console.log('🔍 MISMATCH DETECTION');
console.log('─────────────────────────────────────────────────────────────────');

let hasMismatch = false;

if (accessTokenMs !== ACCESS_TOKEN_EXPIRY_MS) {
  console.log('❌ MISMATCH DETECTED: Access token JWT expiry != Cookie maxAge');
  console.log(`   JWT:    ${accessTokenMs}ms (from ACCESS_TOKEN_EXPIRY=${ACCESS_TOKEN_EXPIRY})`);
  console.log(`   Cookie: ${ACCESS_TOKEN_EXPIRY_MS}ms (from ACCESS_TOKEN_EXPIRY_MS)`);
  console.log(`   This can cause early session expiration!`);
  hasMismatch = true;
}

if (refreshTokenMs !== refreshCookieMs) {
  console.log('❌ MISMATCH DETECTED: Refresh token JWT expiry != Cookie maxAge');
  console.log(`   JWT:    ${refreshTokenMs}ms (from REFRESH_TOKEN_EXPIRY=${REFRESH_TOKEN_EXPIRY})`);
  console.log(`   Cookie: ${refreshCookieMs}ms (from REFRESH_TOKEN_COOKIE_DAYS=${REFRESH_TOKEN_COOKIE_DAYS})`);
  console.log(`   This can cause refresh failures!`);
  hasMismatch = true;
}

if (!hasMismatch) {
  console.log('✅ No mismatches detected between JWT and Cookie configurations');
}
console.log();

// 4. Test Token Generation
console.log('🧪 TOKEN GENERATION TEST');
console.log('─────────────────────────────────────────────────────────────────');

try {
  const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

  if (!JWT_ACCESS_SECRET || JWT_ACCESS_SECRET.length < 32) {
    console.log('❌ JWT_ACCESS_SECRET is missing or too short');
  } else {
    console.log('✅ JWT_ACCESS_SECRET is configured');
  }

  if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
    console.log('❌ JWT_REFRESH_SECRET is missing or too short');
  } else {
    console.log('✅ JWT_REFRESH_SECRET is configured');
  }

  // Generate test tokens
  const testUser = {
    userId: 1,
    email: 'test@example.com',
    role: 'admin'
  };

  const accessToken = jwt.sign(testUser, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ ...testUser, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

  // Decode to check expiry
  const decodedAccess = jwt.decode(accessToken);
  const decodedRefresh = jwt.decode(refreshToken);

  const now = Math.floor(Date.now() / 1000);
  const accessExpiresIn = decodedAccess.exp - now;
  const refreshExpiresIn = decodedRefresh.exp - now;

  console.log(`\n📝 Test Token Details:`);
  console.log(`   Access Token Created At:  ${new Date(decodedAccess.iat * 1000).toISOString()}`);
  console.log(`   Access Token Expires At:  ${new Date(decodedAccess.exp * 1000).toISOString()}`);
  console.log(`   Access Token Lifetime:    ${accessExpiresIn} seconds = ${(accessExpiresIn / 60).toFixed(2)} minutes`);
  console.log();
  console.log(`   Refresh Token Created At: ${new Date(decodedRefresh.iat * 1000).toISOString()}`);
  console.log(`   Refresh Token Expires At: ${new Date(decodedRefresh.exp * 1000).toISOString()}`);
  console.log(`   Refresh Token Lifetime:   ${refreshExpiresIn} seconds = ${(refreshExpiresIn / 60 / 60 / 24).toFixed(2)} days`);
  console.log();

  // Check if test matches expected
  if (Math.abs(accessExpiresIn - (accessTokenMs / 1000)) > 5) {
    console.log('⚠️  WARNING: Generated access token lifetime differs from configuration');
  } else {
    console.log('✅ Access token generation matches configuration');
  }

  if (Math.abs(refreshExpiresIn - (refreshTokenMs / 1000)) > 60) {
    console.log('⚠️  WARNING: Generated refresh token lifetime differs from configuration');
  } else {
    console.log('✅ Refresh token generation matches configuration');
  }

} catch (error) {
  console.log('❌ Error generating test tokens:', error.message);
}
console.log();

// 5. Cookie Configuration Analysis
console.log('🍪 COOKIE CONFIGURATION ANALYSIS');
console.log('─────────────────────────────────────────────────────────────────');

const isProduction = process.env.NODE_ENV === 'production';
const cookieSecure = process.env.COOKIE_SECURE === 'false' ? false : isProduction;

console.log(`Production Mode:              ${isProduction ? 'YES' : 'NO'}`);
console.log(`Cookies Secure Flag:          ${cookieSecure ? 'YES (HTTPS only)' : 'NO (HTTP allowed)'}`);
console.log(`Cookies HttpOnly:             YES (always)`);
console.log(`Cookies SameSite:             lax`);
console.log();

if (isProduction && !cookieSecure) {
  console.log('⚠️  WARNING: Production mode but cookies are not secure!');
  console.log('   Set COOKIE_SECURE=true or remove it to enable secure cookies.');
}

if (!isProduction && cookieSecure) {
  console.log('⚠️  WARNING: Development mode with secure cookies enabled');
  console.log('   This may cause issues if not using HTTPS locally.');
}

// 6. Common Issues Check
console.log('🔧 COMMON ISSUES CHECKLIST');
console.log('─────────────────────────────────────────────────────────────────');

const issues = [];

// Issue 1: Short cookie lifetime
if (ACCESS_TOKEN_EXPIRY_MS < 10 * 60 * 1000) {
  issues.push({
    severity: '⚠️',
    title: 'Access token cookie maxAge is very short',
    description: `Current: ${(ACCESS_TOKEN_EXPIRY_MS / 60000).toFixed(2)} minutes. This might cause frequent redirects.`,
    solution: 'The cookie maxAge should match or exceed the JWT expiry. Consider increasing ACCESS_TOKEN_EXPIRY_MS.'
  });
}

// Issue 2: Mismatch between JWT and Cookie expiry
if (accessTokenMs && accessTokenMs !== ACCESS_TOKEN_EXPIRY_MS) {
  issues.push({
    severity: '❌',
    title: 'JWT and Cookie expiry mismatch for access token',
    description: `JWT expires in ${(accessTokenMs / 60000).toFixed(2)}min but cookie expires in ${(ACCESS_TOKEN_EXPIRY_MS / 60000).toFixed(2)}min`,
    solution: 'If cookie expires before JWT, the cookie will be deleted while the JWT is still valid, causing logout. Align ACCESS_TOKEN_EXPIRY and ACCESS_TOKEN_EXPIRY_MS values.'
  });
}

// Issue 3: Refresh token cookie shorter than JWT
if (refreshTokenMs && refreshTokenMs > refreshCookieMs) {
  issues.push({
    severity: '❌',
    title: 'Refresh token cookie expires before JWT',
    description: `JWT valid for ${(refreshTokenMs / (24 * 60 * 60 * 1000)).toFixed(2)} days but cookie for ${(refreshCookieMs / (24 * 60 * 60 * 1000)).toFixed(2)} days`,
    solution: 'The refresh token cookie will be deleted before the JWT expires, preventing refresh. Align REFRESH_TOKEN_EXPIRY and REFRESH_TOKEN_COOKIE_DAYS.'
  });
}

// Issue 4: No refresh happening within 10 min
if (ACCESS_TOKEN_EXPIRY_MS < 10 * 60 * 1000) {
  issues.push({
    severity: '🔍',
    title: 'Access token expires before 10 minutes',
    description: 'User experiencing logout at ~10 minutes suggests access token may have expired',
    solution: 'Check frontend auto-refresh logic in admin/src/services/apiService.js. Ensure attemptTokenRefresh() is being called on 401 errors.'
  });
}

if (issues.length === 0) {
  console.log('✅ No common configuration issues detected');
} else {
  issues.forEach((issue, idx) => {
    console.log(`\n${issue.severity} Issue ${idx + 1}: ${issue.title}`);
    console.log(`   Problem: ${issue.description}`);
    console.log(`   Solution: ${issue.solution}`);
  });
}
console.log();

// 7. Recommendations
console.log('💡 RECOMMENDATIONS');
console.log('─────────────────────────────────────────────────────────────────');

console.log('1. Verify cookie presence in browser:');
console.log('   - Open Browser DevTools → Application → Cookies');
console.log('   - Look for: adminAccessToken and adminRefreshToken');
console.log('   - Check their expiry times');
console.log();

console.log('2. Monitor network requests:');
console.log('   - Open Browser DevTools → Network tab');
console.log('   - Look for failed requests with 401 status');
console.log('   - Check if POST /api/auth/refresh is called automatically');
console.log('   - Verify if refresh returns 200 or 401');
console.log();

console.log('3. Check backend logs:');
console.log('   - Look for "[Auth] Access token expired" messages');
console.log('   - Check for refresh token validation errors');
console.log('   - Monitor database queries to refresh_tokens table');
console.log();

console.log('4. Test the refresh endpoint directly:');
console.log('   - Login to admin panel');
console.log('   - Wait for access token to expire (~15 min)');
console.log('   - Make any API request');
console.log('   - Observe if automatic refresh happens');
console.log();

console.log('5. Database check:');
console.log('   - Verify refresh_tokens table has valid entries');
console.log('   - Check if tokens are being revoked prematurely');
console.log('   - Look for expired tokens that should still be valid');
console.log();

console.log('═══════════════════════════════════════════════════════════════');
console.log('To fix configuration issues, edit: backend/.env');
console.log('Make sure to restart the backend server after changes');
console.log('═══════════════════════════════════════════════════════════════\n');
