/**
 * Session Persistence Test - Debug the 18 minute logout issue
 * 
 * This test simulates what happens when:
 * 1. User logs in
 * 2. Waits 18+ minutes (access token expires after 15 min)
 * 3. Refreshes the page
 * 4. Frontend calls GET /api/auth/me
 * 5. Should auto-refresh and succeed
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  SESSION PERSISTENCE ANALYSIS - 18 Minute Logout Issue        ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('🔍 ANALYZING THE PROBLEM');
console.log('─────────────────────────────────────────────────────────────\n');

console.log('What happens on page refresh after 18 minutes:\n');

console.log('1️⃣  Page Refresh');
console.log('   └─ Browser reloads the app');
console.log('   └─ React App.jsx mounts');
console.log('   └─ useEffect calls verifySession()\n');

console.log('2️⃣  verifySession() Calls checkSession()');
console.log('   └─ checkSession() calls: GET /api/auth/me');
console.log('   └─ Sends cookies: adminAccessToken (EXPIRED), adminRefreshToken (VALID)\n');

console.log('3️⃣  Backend /auth/me Endpoint Returns 401');
console.log('   └─ Access token is expired (valid for 15 min, now 18 min old)');
console.log('   └─ Backend: "Access token has expired"\n');

console.log('4️⃣  Frontend Middleware (apiRequest) Detects 401');
console.log('   └─ Check: response.status === 401 && !isRetry ✓');
console.log('   └─ Check: endpoint !== /auth/refresh ✓');
console.log('   └─ Calls attemptTokenRefresh()\n');

console.log('5️⃣  Frontend Calls POST /api/auth/refresh');
console.log('   └─ Should send cookies: adminRefreshToken');
console.log('   └─ Sends header: X-Client-Type: admin\n');

console.log('6️⃣  Backend /refresh Should Return 200');
console.log('   └─ Validates refresh token from cookies');
console.log('   └─ Issues new tokens');
console.log('   └─ Sets new cookies\n');

console.log('7️⃣  Frontend Retries Original Request');
console.log('   └─ GET /api/auth/me with new access token');
console.log('   └─ Should return 200 with user data\n');

console.log('❌ BUT YOU\'RE SEEING REDIRECT TO LOGIN INSTEAD\n');

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('POSSIBLE CAUSES:\n');

const causes = [
  {
    title: 'Refresh Token Cookie NOT Being Sent',
    description: 'POST /api/auth/refresh receives no refresh token cookie',
    howToCheck: [
      '1. Open DevTools → Network',
      '2. Reproduce: Login, wait 18min, refresh page',
      '3. Look for POST /api/auth/refresh request',
      '4. Check "Request" tab → Cookies section',
      '5. Is adminRefreshToken present? (check YES or NO)'
    ],
    solution: 'Check if cookie path mismatch. Refresh token has path: "/api/auth" but POST is to "/api/auth/refresh"'
  },
  {
    title: 'Refresh Token Expired in Database',
    description: 'Database shows refresh token already expired',
    howToCheck: [
      '1. Connect to PostgreSQL database',
      '2. Run: SELECT expires_at, NOW() FROM refresh_tokens WHERE revoked=false ORDER BY created_at DESC LIMIT 1;',
      '3. Compare expires_at with NOW()',
      '4. If expires_at < NOW() = Token is expired ✗'
    ],
    solution: 'Verify REFRESH_TOKEN_COOKIE_DAYS matches the JWT expiry. Both should be 7 days.'
  },
  {
    title: 'Refresh Token Being Revoked Prematurely',
    description: 'Refresh token revoked during token rotation or security check',
    howToCheck: [
      '1. Check backend logs for reuse detection',
      '2. Look for: "[Security] Refresh Token Reuse Detected"',
      '3. Check database: SELECT revoked, replaced_by_token FROM refresh_tokens ... LIMIT 1;'
    ],
    solution: 'Ensure grace period (30 seconds) is working properly. Check for network retries.'
  },
  {
    title: 'Cookie Attributes Preventing Transmission',
    description: 'Refresh cookie attributes don\'t allow it to be sent',
    howToCheck: [
      '1. In Browser DevTools → Application → Cookies',
      '2. Check adminRefreshToken properties:',
      '   - Secure: Should be empty (since we set COOKIE_SECURE=false)',
      '   - HttpOnly: Should be checked ✓',
      '   - Path: Should be /api/auth',
      '   - SameSite: Should be Lax'
    ],
    solution: 'If Secure is checked, restart backend and clear cookies.'
  },
  {
    title: 'Frontend Not Sending Credentials Header',
    description: 'Frontend fetch missing credentials: "include"',
    howToCheck: [
      '1. Check apiService.js line ~147',
      '2. Verify: credentials: "include" is present',
      '3. This should be in config object for ALL requests'
    ],
    solution: 'Ensure credentials: "include" is set. It\'s already correct in your code.'
  },
  {
    title: 'CORS or Domain Mismatch',
    description: 'Frontend and backend on different domains',
    howToCheck: [
      '1. Frontend: http://26.155.110.217:3000',
      '2. Backend: http://26.155.110.217:3001',
      '3. Check .env ALLOWED_ORIGINS is correct'
    ],
    solution: 'Verify ALLOWED_ORIGINS includes frontend domain'
  }
];

causes.forEach((cause, idx) => {
  console.log(`${idx + 1}. ❓ ${cause.title}`);
  console.log(`   Problem: ${cause.description}\n`);
  console.log(`   How to Check:`);
  cause.howToCheck.forEach(step => {
    console.log(`   ${step}`);
  });
  console.log(`\n   Solution: ${cause.solution}\n`);
  console.log('─────────────────────────────────────────────────────────────\n');
});

console.log('═══════════════════════════════════════════════════════════════\n');

console.log('DEBUGGING CHECKLIST:\n');

const checks = [
  '□ Check browser cookies BEFORE refresh (should have 2 cookies)',
  '□ Check browser cookies AFTER refresh (should still have cookies)',
  '□ Monitor Network tab during 18-min test',
  '□ Look for POST /api/auth/refresh - is it called?',
  '□ If refresh is called, does it return 200 or 401?',
  '□ Check backend logs for [Auth] messages',
  '□ Query database to verify tokens aren\'t expired',
  '□ Compare COOKIE_SECURE and NODE_ENV settings',
  '□ Verify credentials: "include" in frontend',
  '□ Test with hard refresh (Ctrl+Shift+R) to clear page cache'
];

checks.forEach(check => {
  console.log(`  ${check}`);
});

console.log('\n═══════════════════════════════════════════════════════════════\n');

console.log('LIKELY ROOT CAUSE BASED ON YOUR SYMPTOMS:\n');

console.log('Given that:');
console.log('  ✓ Token configuration is correct (verified earlier)');
console.log('  ✓ COOKIE_SECURE=false was added');
console.log('  ✓ Redirect happens at ~18 minutes');
console.log('  ✓ Access token expires at 15 minutes\n');

console.log('Most likely causes (in order):\n');

console.log('1. 🔴 CRITICAL: Refresh token cookie NOT being sent');
console.log('   └─ POST /api/auth/refresh endpoint receives empty refresh token');
console.log('   └─ This happens when cookie path "/" vs "/api/auth" mismatch');
console.log('   └─ But current code should handle this...\n');

console.log('2. 🟠 HIGH: Database token in wrong state');
console.log('   └─ Token marked as revoked or already expired');
console.log('   └─ Check: SELECT * FROM refresh_tokens WHERE user_id = ADMIN_ID\n');

console.log('3. 🟡 MEDIUM: Grace period not working');
console.log('   └─ Token reuse security blocking valid refreshes');
console.log('   └─ Check backend logs for "[Security] Refresh Token Reuse"\n');

console.log('4. 🟢 LOW: CORS/domain issue');
console.log('   └─ Less likely since initial login works\n');

console.log('═══════════════════════════════════════════════════════════════\n');

console.log('NEXT STEP: Run this debug command in browser console:\n');

console.log('// After logging in, wait ~18 minutes, then run:');
console.log('setInterval(() => {');
console.log('  fetch("/api/auth/me", {');
console.log('    headers: { "X-Client-Type": "admin" },');
console.log('    credentials: "include"');
console.log('  })');
console.log('  .then(r => r.json())');
console.log('  .then(d => console.log(new Date().toLocaleTimeString() + ": " + (d.success ? "✓" : "✗", d)))');
console.log('  .catch(e => console.error(e));');
console.log('}, 5000); // Check every 5 seconds\n');

console.log('═══════════════════════════════════════════════════════════════\n');
