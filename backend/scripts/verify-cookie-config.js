/**
 * Quick Cookie Security Check
 * Run this after restarting the backend to verify cookies will work over HTTP
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║         COOKIE SECURITY VERIFICATION                          ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const NODE_ENV = process.env.NODE_ENV;
const COOKIE_SECURE_ENV = process.env.COOKIE_SECURE;
const IS_PRODUCTION = NODE_ENV === 'production';

// Simulate the logic from auth-v2.js
const COOKIE_SECURE = COOKIE_SECURE_ENV === 'false' ? false : IS_PRODUCTION;

console.log('Environment Configuration:');
console.log('─────────────────────────────────────────────────────────────');
console.log(`NODE_ENV:                 ${NODE_ENV}`);
console.log(`COOKIE_SECURE (env):      ${COOKIE_SECURE_ENV || '(not set)'}`);
console.log(`Is Production Mode:       ${IS_PRODUCTION ? 'YES' : 'NO'}`);
console.log();

console.log('Resulting Cookie Configuration:');
console.log('─────────────────────────────────────────────────────────────');
console.log(`Cookies will have "Secure" flag: ${COOKIE_SECURE ? 'YES' : 'NO'}`);
console.log();

console.log('Protocol Compatibility:');
console.log('─────────────────────────────────────────────────────────────');

if (COOKIE_SECURE) {
  console.log('❌ Secure cookies enabled → ONLY works with HTTPS');
  console.log('   ✗ HTTP will NOT work (cookies won\'t be sent by browser)');
  console.log('   ✓ HTTPS will work');
  console.log();
  console.log('Your frontend URL: http://26.155.110.217:3000');
  console.log('⚠️  WARNING: This is HTTP, but secure cookies require HTTPS!');
  console.log();
  console.log('🔧 FIX: Add to .env file:');
  console.log('   COOKIE_SECURE=false');
} else {
  console.log('✅ Secure cookies disabled → Works with HTTP');
  console.log('   ✓ HTTP will work (cookies will be sent)');
  console.log('   ✓ HTTPS will also work');
  console.log();
  console.log('Your frontend URL: http://26.155.110.217:3000');
  console.log('✅ COMPATIBLE: Cookies will work over HTTP');
  console.log();
  console.log('📝 NOTE: For production with real users, consider:');
  console.log('   1. Set up HTTPS with SSL certificate');
  console.log('   2. Remove COOKIE_SECURE=false from .env');
  console.log('   3. Cookies will then be protected in transit');
}

console.log();
console.log('Cookie Attributes Summary:');
console.log('─────────────────────────────────────────────────────────────');
console.log(`  HttpOnly:        YES (prevents XSS attacks)`);
console.log(`  Secure:          ${COOKIE_SECURE ? 'YES' : 'NO'} (HTTPS-only flag)`);
console.log(`  SameSite:        lax (prevents CSRF attacks)`);
console.log(`  Path (access):   / (all routes)`);
console.log(`  Path (refresh):  /api/auth (auth routes only)`);
console.log(`  MaxAge (access): 900000ms (15 minutes)`);
console.log(`  MaxAge (refresh): 604800000ms (7 days)`);
console.log();

console.log('Next Steps:');
console.log('─────────────────────────────────────────────────────────────');
console.log('1. Restart backend server to apply changes');
console.log('2. Clear browser cookies (important!)');
console.log('3. Login to admin panel again');
console.log('4. Check browser DevTools → Application → Cookies');
console.log('5. Verify adminAccessToken and adminRefreshToken are present');
console.log('6. Wait 15+ minutes and test if auto-refresh works');
console.log();
console.log('═══════════════════════════════════════════════════════════════\n');
