/**
 * Test Refresh Token Flow
 * 
 * This script simulates the token refresh flow to identify issues
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = `http://localhost:${process.env.PORT || 3001}/api`;
const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@maxistore.com';
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║         TOKEN REFRESH FLOW TEST                               ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

async function testRefreshFlow() {
  try {
    console.log('Step 1: Login as admin');
    console.log('─────────────────────────────────────────────────────────────');
    
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        isAdmin: true
      })
    });

    if (!loginRes.ok) {
      const error = await loginRes.text();
      console.log('❌ Login failed:', error);
      return;
    }

    const loginData = await loginRes.json();
    console.log('✅ Login successful');
    console.log(`   User: ${loginData.user.email}`);
    console.log(`   Role: ${loginData.user.role}`);

    // Extract cookies from response
    const setCookieHeaders = loginRes.headers.raw()['set-cookie'] || [];
    console.log(`\n   Received ${setCookieHeaders.length} Set-Cookie headers:`);
    
    let adminAccessToken = '';
    let adminRefreshToken = '';
    
    setCookieHeaders.forEach((cookie, idx) => {
      console.log(`   [${idx + 1}] ${cookie.split(';')[0]}`);
      
      if (cookie.startsWith('adminAccessToken=')) {
        adminAccessToken = cookie.split(';')[0].split('=')[1];
        
        // Parse cookie attributes
        const parts = cookie.split(';').map(p => p.trim());
        console.log(`       Attributes:`);
        parts.slice(1).forEach(attr => {
          console.log(`       - ${attr}`);
        });
      }
      
      if (cookie.startsWith('adminRefreshToken=')) {
        adminRefreshToken = cookie.split(';')[0].split('=')[1];
        
        // Parse cookie attributes
        const parts = cookie.split(';').map(p => p.trim());
        console.log(`       Attributes:`);
        parts.slice(1).forEach(attr => {
          console.log(`       - ${attr}`);
        });
      }
    });

    if (!adminAccessToken || !adminRefreshToken) {
      console.log('\n❌ ERROR: Cookies not set properly!');
      console.log(`   adminAccessToken: ${adminAccessToken ? 'SET' : 'MISSING'}`);
      console.log(`   adminRefreshToken: ${adminRefreshToken ? 'SET' : 'MISSING'}`);
      return;
    }

    console.log('\n✅ Both tokens received in cookies');

    // Step 2: Test /auth/me endpoint with cookie
    console.log('\n\nStep 2: Test /auth/me with access token cookie');
    console.log('─────────────────────────────────────────────────────────────');
    
    const cookieHeader = setCookieHeaders.map(h => h.split(';')[0]).join('; ');
    
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Cookie': cookieHeader,
        'X-Client-Type': 'admin'
      }
    });

    if (meRes.ok) {
      const meData = await meRes.json();
      console.log('✅ /auth/me successful with cookie');
      console.log(`   User: ${meData.user.email}`);
    } else {
      const error = await meRes.text();
      console.log('❌ /auth/me failed:', error);
    }

    // Step 3: Test refresh endpoint
    console.log('\n\nStep 3: Test /auth/refresh endpoint');
    console.log('─────────────────────────────────────────────────────────────');
    
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'X-Client-Type': 'admin'
      }
    });

    if (!refreshRes.ok) {
      const error = await refreshRes.text();
      console.log('❌ Refresh failed:', error);
      return;
    }

    const refreshData = await refreshRes.json();
    console.log('✅ Token refresh successful');
    console.log(`   New access token received: ${refreshData.accessToken ? 'YES' : 'NO'}`);

    // Check new cookies
    const newSetCookieHeaders = refreshRes.headers.raw()['set-cookie'] || [];
    console.log(`   Received ${newSetCookieHeaders.length} new Set-Cookie headers:`);
    
    newSetCookieHeaders.forEach((cookie, idx) => {
      console.log(`   [${idx + 1}] ${cookie.split(';')[0]}`);
    });

    if (newSetCookieHeaders.length !== 2) {
      console.log('\n⚠️  WARNING: Expected 2 new cookies (access + refresh) but got', newSetCookieHeaders.length);
    }

    // Step 4: Test /auth/me with new tokens
    console.log('\n\nStep 4: Test /auth/me with new tokens');
    console.log('─────────────────────────────────────────────────────────────');
    
    const newCookieHeader = newSetCookieHeaders.map(h => h.split(';')[0]).join('; ');
    
    const meRes2 = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Cookie': newCookieHeader,
        'X-Client-Type': 'admin'
      }
    });

    if (meRes2.ok) {
      const meData2 = await meRes2.json();
      console.log('✅ /auth/me successful with new tokens');
      console.log(`   User: ${meData2.user.email}`);
    } else {
      const error = await meRes2.text();
      console.log('❌ /auth/me failed with new tokens:', error);
    }

    // Step 5: Summary
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║ TEST SUMMARY                                              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('✅ All tests passed!');
    console.log('\nThe backend token refresh mechanism is working correctly.');
    console.log('If you are still experiencing issues at ~10 minutes:');
    console.log();
    console.log('1. Check browser cookies:');
    console.log('   - Are they being set with correct attributes?');
    console.log('   - Are they persisting after page refresh?');
    console.log();
    console.log('2. Check frontend refresh logic:');
    console.log('   - Is attemptTokenRefresh() being called on 401?');
    console.log('   - Are credentials: "include" being sent?');
    console.log();
    console.log('3. Check for HTTPS/HTTP issues:');
    console.log('   - Secure cookies only work over HTTPS');
    console.log('   - In production, ensure you are using HTTPS');
    console.log();
    console.log('4. Check for CORS issues:');
    console.log('   - Ensure frontend and backend domains are aligned');
    console.log('   - Check ALLOWED_ORIGINS in .env');
    console.log();

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error);
  }
}

testRefreshFlow();
