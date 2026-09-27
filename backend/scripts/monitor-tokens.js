/**
 * Real-time Token Monitoring Script
 * 
 * Run this while testing to see token refresh in action
 * Shows when access tokens expire and refresh automatically
 */

import jwt from 'jsonwebtoken';

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║         TOKEN MONITORING GUIDE                                ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('How to Monitor Token Refresh in Browser:');
console.log('─────────────────────────────────────────────────────────────────\n');

console.log('1️⃣  Open Browser DevTools (F12)');
console.log('   └─ Go to: Network tab');
console.log('   └─ Check: "Preserve log" checkbox\n');

console.log('2️⃣  Login to Admin Panel');
console.log('   └─ URL: http://26.155.110.217:3000');
console.log('   └─ Login with admin credentials');
console.log('   └─ You should see successful login\n');

console.log('3️⃣  Check Cookies (Important!)');
console.log('   └─ Go to: Application tab → Cookies');
console.log('   └─ Select: http://26.155.110.217:3000');
console.log('   └─ Look for:\n');
console.log('      Name: adminAccessToken');
console.log('      ├─ Expires: ~15 minutes from now');
console.log('      ├─ HttpOnly: ✓');
console.log('      ├─ Secure: ✗ (should be empty/blank)');
console.log('      ├─ SameSite: Lax');
console.log('      └─ Path: /\n');
console.log('      Name: adminRefreshToken');
console.log('      ├─ Expires: ~7 days from now');
console.log('      ├─ HttpOnly: ✓');
console.log('      ├─ Secure: ✗ (should be empty/blank)');
console.log('      ├─ SameSite: Lax');
console.log('      └─ Path: /api/auth\n');

console.log('   ⚠️  CRITICAL: If "Secure" column shows ✓ → FIX NOT APPLIED');
console.log('   ✅ CORRECT: If "Secure" column is empty → FIX WORKING\n');

console.log('4️⃣  Monitor Network Activity');
console.log('   └─ Go back to: Network tab');
console.log('   └─ Browse admin panel (view products, orders, etc.)');
console.log('   └─ Watch for API requests\n');

console.log('5️⃣  Wait for Token Expiry (~15 minutes)');
console.log('   └─ Keep the tab open');
console.log('   └─ You can minimize but don\'t close');
console.log('   └─ After ~15 minutes, interact with the page\n');

console.log('6️⃣  What You Should See in Network Tab:');
console.log('   ┌─────────────────────────────────────────────────────────┐');
console.log('   │ Request 1: GET /api/products (or any endpoint)         │');
console.log('   │ Status: 401 Unauthorized                                │');
console.log('   │ Response: "Access token has expired"                    │');
console.log('   └─────────────────────────────────────────────────────────┘');
console.log('                          ↓');
console.log('   ┌─────────────────────────────────────────────────────────┐');
console.log('   │ Request 2: POST /api/auth/refresh                       │');
console.log('   │ Status: 200 OK ✅                                       │');
console.log('   │ Response: { success: true, accessToken: "..." }         │');
console.log('   │ Set-Cookie: adminAccessToken=... (NEW TOKEN)            │');
console.log('   └─────────────────────────────────────────────────────────┘');
console.log('                          ↓');
console.log('   ┌─────────────────────────────────────────────────────────┐');
console.log('   │ Request 3: GET /api/products (RETRY)                    │');
console.log('   │ Status: 200 OK ✅                                       │');
console.log('   │ Response: [products data...]                            │');
console.log('   └─────────────────────────────────────────────────────────┘\n');

console.log('7️⃣  Success Indicators:');
console.log('   ✅ You stay logged in after 15+ minutes');
console.log('   ✅ You see automatic POST /api/auth/refresh calls');
console.log('   ✅ Failed requests are automatically retried');
console.log('   ✅ No redirect to login page\n');

console.log('8️⃣  Failure Indicators (if fix not working):');
console.log('   ❌ Redirected to login page after ~10-15 minutes');
console.log('   ❌ POST /api/auth/refresh returns 401');
console.log('   ❌ Request headers don\'t include Cookie');
console.log('   ❌ "Secure" flag still present on cookies\n');

console.log('═══════════════════════════════════════════════════════════════\n');

console.log('Console Log Messages to Look For:\n');
console.log('[Auth] Access token expired, attempting refresh...');
console.log('[Auth] Attempting token refresh...');
console.log('[Auth] Token refresh successful');
console.log('[Auth] Refresh successful, retrying original request');
console.log('\n');

console.log('To decode a JWT token (for debugging):\n');
console.log('1. Copy the token from Network tab or Response');
console.log('2. Go to: https://jwt.io');
console.log('3. Paste token to see expiry time and contents\n');

console.log('Or decode in browser console:');
console.log('───────────────────────────────────────────────────────────────');
console.log('function decodeJwt(token) {');
console.log('  const base64Url = token.split(".")[1];');
console.log('  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");');
console.log('  const jsonPayload = decodeURIComponent(');
console.log('    atob(base64).split("").map(c =>');
console.log('      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)');
console.log('    ).join("")');
console.log('  );');
console.log('  const payload = JSON.parse(jsonPayload);');
console.log('  console.log("Issued At:", new Date(payload.iat * 1000));');
console.log('  console.log("Expires At:", new Date(payload.exp * 1000));');
console.log('  console.log("Time Left:", payload.exp - (Date.now() / 1000), "seconds");');
console.log('  return payload;');
console.log('}\n');
console.log('// Usage: Copy token, then run:');
console.log('// decodeJwt("your-token-here")');
console.log('───────────────────────────────────────────────────────────────\n');

console.log('Database Queries for Debugging:\n');
console.log('-- Check active refresh tokens');
console.log('SELECT ');
console.log('  rt.id,');
console.log('  u.email,');
console.log('  rt.created_at,');
console.log('  rt.expires_at,');
console.log('  rt.expires_at > NOW() as is_valid,');
console.log('  rt.revoked,');
console.log('  EXTRACT(EPOCH FROM (rt.expires_at - NOW()))/3600 as hours_left');
console.log('FROM refresh_tokens rt');
console.log('JOIN users u ON u.id = rt.user_id');
console.log('WHERE rt.revoked = false');
console.log('ORDER BY rt.created_at DESC');
console.log('LIMIT 10;\n');

console.log('-- Count tokens per user');
console.log('SELECT ');
console.log('  u.email,');
console.log('  COUNT(*) as token_count,');
console.log('  COUNT(*) FILTER (WHERE rt.revoked = false) as active_tokens,');
console.log('  COUNT(*) FILTER (WHERE rt.expires_at > NOW() AND rt.revoked = false) as valid_tokens');
console.log('FROM users u');
console.log('LEFT JOIN refresh_tokens rt ON rt.user_id = u.id');
console.log('GROUP BY u.email');
console.log('HAVING COUNT(*) > 0');
console.log('ORDER BY token_count DESC;\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('                    TESTING TIMELINE');
console.log('═══════════════════════════════════════════════════════════════\n');

const now = Date.now();
const intervals = [
  { time: 0, event: 'Login to admin panel' },
  { time: 5, event: 'Tokens still valid, browse normally' },
  { time: 10, event: 'Tokens still valid, browse normally' },
  { time: 15, event: 'Access token expired, auto-refresh should trigger' },
  { time: 20, event: 'New tokens active, continue browsing' },
  { time: 30, event: 'Tokens refreshed again if needed' },
  { time: 60, event: 'Tokens refreshed again if needed' },
  { time: 120, event: 'Still logged in (2 hours)' },
  { time: 1440, event: 'Still logged in (1 day)' },
  { time: 10080, event: 'Refresh token expires (7 days) - login required' }
];

intervals.forEach(({ time, event }) => {
  const timestamp = new Date(now + time * 60 * 1000);
  const timeStr = time === 0 ? 'Now' : 
                  time < 60 ? `+${time}min` :
                  time < 1440 ? `+${Math.floor(time/60)}h` :
                  `+${Math.floor(time/1440)}d`;
  console.log(`${timeStr.padEnd(8)} │ ${event}`);
});

console.log('\n═══════════════════════════════════════════════════════════════\n');
console.log('Ready to test! Follow the steps above and report any issues.\n');
