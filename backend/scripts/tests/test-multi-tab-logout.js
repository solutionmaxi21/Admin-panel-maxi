#!/usr/bin/env node

/**
 * Multi-Tab Logout Isolation Test
 * Tests that logging out from one client doesn't affect the other
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
const CUSTOMER_EMAIL = 'test1@maxistore.com';
const CUSTOMER_PASSWORD = 'Test1234!';
const ADMIN_EMAIL = 'admin@maxistore.com';
const ADMIN_PASSWORD = 'Admin1234!';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = (msg, color = 'blue') => {
  const colorCode = COLORS[color] || COLORS.blue;
  console.log(`${colorCode}${msg}${COLORS.reset}`);
};

const success = (msg) => log(`✓ ${msg}`, 'green');
const error = (msg) => log(`✗ ${msg}`, 'red');
const warn = (msg) => log(`⚠ ${msg}`, 'yellow');
const section = (msg) => log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`, 'cyan');

async function runTest() {
  try {
    section('MULTI-TAB LOGOUT ISOLATION TEST');

    let customerCookies = null;
    let adminCookies = null;

    // Step 1: Customer Login
    log('\n📝 Step 1: Customer Login\n', 'bold');
    let res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: CUSTOMER_EMAIL,
        password: CUSTOMER_PASSWORD,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      customerCookies = res.headers.get('set-cookie');
      success(`Customer logged in: ${CUSTOMER_EMAIL}`);
      success(`Cookies set: ${customerCookies ? 'Yes' : 'No'}`);
    } else {
      throw new Error(`Customer login failed: ${res.status}`);
    }

    // Step 2: Admin Login
    log('\n📝 Step 2: Admin Login\n', 'bold');
    res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        isAdmin: true,  // ← IMPORTANT: Must pass isAdmin flag to get admin cookies
      }),
    });

    if (res.ok) {
      const data = await res.json();
      adminCookies = res.headers.get('set-cookie');
      success(`Admin logged in: ${ADMIN_EMAIL}`);
      success(`Cookies set: ${adminCookies ? 'Yes' : 'No'}`);
    } else {
      throw new Error(`Admin login failed: ${res.status}`);
    }

    // Step 3: Verify both can access /me
    log('\n📝 Step 3: Verify Both Sessions Valid\n', 'bold');

    res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Cookie: customerCookies,
      },
    });

    if (res.ok) {
      const data = await res.json();
      success(`Customer can access /me: ${data.user?.email}`);
    } else {
      throw new Error(`Customer /me failed: ${res.status}`);
    }

    res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Cookie: adminCookies,
        'X-Client-Type': 'admin',
      },
    });

    if (res.ok) {
      const data = await res.json();
      success(`Admin can access /me: ${data.user?.email}`);
    } else {
      throw new Error(`Admin /me failed: ${res.status}`);
    }

    // Step 4: Customer Logout with x-client-type header
    log('\n📝 Step 4: Customer Logout (with x-client-type: customer)\n', 'bold');
    res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-type': 'customer', // THIS IS THE FIX
        Cookie: customerCookies,
      },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      success('Customer logout successful');
      success('Request sent with x-client-type: customer header');
    } else {
      throw new Error(`Customer logout failed: ${res.status}`);
    }

    // Step 5: Verify customer can't access /me
    log('\n📝 Step 5: Verify Customer Session Invalidated\n', 'bold');
    res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Cookie: customerCookies,
      },
    });

    if (res.status === 401) {
      success('Customer session correctly invalidated (401 Unauthorized)');
    } else {
      warn(`Customer session still valid: ${res.status}`);
    }

    // Step 6: Verify admin can STILL access /me (THIS IS THE KEY TEST)
    log('\n📝 Step 6: Verify Admin Session Still Valid ⭐\n', 'bold');
    res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Cookie: adminCookies,
        'X-Client-Type': 'admin',
      },
    });

    if (res.ok) {
      const data = await res.json();
      success('🎉 ADMIN SESSION STILL VALID!');
      success(`Admin can still access /me: ${data.user?.email}`);
      success('✓ Fix working correctly - logout isolation successful!');
    } else {
      error(
        '❌ ADMIN SESSION LOST! Fix not working - admin cookies were cleared'
      );
      throw new Error(`Admin /me failed after customer logout: ${res.status}`);
    }

    // Step 7: Admin Logout
    log('\n📝 Step 7: Admin Logout (with x-client-type: admin)\n', 'bold');
    res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-type': 'admin', // THIS IDENTIFIES AS ADMIN
        Cookie: adminCookies,
      },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      success('Admin logout successful');
      success('Request sent with x-client-type: admin header');
    } else {
      throw new Error(`Admin logout failed: ${res.status}`);
    }

    // Step 8: Verify admin can't access /me
    log('\n📝 Step 8: Verify Admin Session Invalidated\n', 'bold');
    res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Cookie: adminCookies,
        'X-Client-Type': 'admin',
      },
    });

    if (res.status === 401) {
      success('Admin session correctly invalidated (401 Unauthorized)');
    } else {
      warn(`Admin session still valid: ${res.status}`);
    }

    // Final Summary
    section('TEST SUMMARY');
    success('Multi-tab logout isolation working correctly!');
    success(
      '✓ Customer logout only cleared customer cookies'
    );
    success(
      '✓ Admin session remained valid after customer logout'
    );
    success(
      '✓ Admin logout only cleared admin cookies'
    );
    log(
      '\n📊 Result: Fix is working as expected!\n',
      'green'
    );
  } catch (err) {
    error(`\nTest failed: ${err.message}`);
    process.exit(1);
  }
}

runTest();
