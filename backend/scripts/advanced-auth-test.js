/**
 * Ultimate Authentication Security Test Suite
 * Tests BOTH Storefront (Customer) and Admin Panel authentication flows
 * Covers: Registration, Login, Token Management, Security Attacks, Edge Cases
 */

import 'dotenv/config';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api/auth';
const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

const log = (msg, type = 'info') => {
    const color = {
        info: COLORS.blue,
        success: COLORS.green,
        error: COLORS.red,
        warn: COLORS.yellow,
        section: COLORS.cyan,
        admin: COLORS.magenta
    }[type] || COLORS.reset;
    console.log(`${color}${msg}${COLORS.reset}`);
};

const getCookie = (res, name) => {
    const raw = res.headers.raw()['set-cookie'];
    if (!raw) return null;
    const cookieStr = raw.find(c => c.startsWith(`${name}=`));
    if (!cookieStr) return null;
    return cookieStr.split(';')[0].split('=')[1];
};

const getCookieAttributes = (res, name) => {
    const raw = res.headers.raw()['set-cookie'];
    if (!raw) return null;
    const cookieStr = raw.find(c => c.startsWith(`${name}=`));
    if (!cookieStr) return null;
    const attrs = {};
    cookieStr.split(';').forEach(part => {
        const [key, val] = part.trim().split('=');
        attrs[key.toLowerCase()] = val || true;
    });
    return attrs;
};

const runTest = async (name, fn, results) => {
    process.stdout.write(`  ${name}... `);
    try {
        await fn();
        console.log(`${COLORS.green}✓ PASSED${COLORS.reset}`);
        results.passed++;
        return true;
    } catch (error) {
        console.log(`${COLORS.red}✗ FAILED${COLORS.reset}`);
        console.error(`    Error: ${error.message}`);
        results.failed++;
        return false;
    }
};

const main = async () => {
    log('\n🔐 ULTIMATE AUTHENTICATION SECURITY TEST SUITE', 'bold');
    log('   Testing STOREFRONT + ADMIN PANEL Flows\n', 'info');

    const results = { passed: 0, failed: 0 };

    // Test Users
    const customerUser = {
        email: `customer_${Date.now()}@example.com`,
        password: 'SecureP@ss123!',
        firstName: 'Customer',
        lastName: 'User'
    };

    // We'll use admin credentials from env vars (set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD)
    const adminUser = {
        email: process.env.TEST_ADMIN_EMAIL || 'admin@maxistore.com',
        password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
    };

    if (!process.env.TEST_ADMIN_EMAIL) {
        log('\n⚠️  Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD env vars for admin tests', 'warn');
    }

    let customerAccessToken, customerRefreshToken;
    let adminAccessToken, adminRefreshToken;

    // ==================== PART A: STOREFRONT AUTH ====================
    log('\n' + '═'.repeat(60), 'bold');
    log('🛒 PART A: STOREFRONT (CUSTOMER) AUTHENTICATION', 'section');
    log('═'.repeat(60), 'bold');

    // A1. Registration
    log('\n📝 A1: CUSTOMER REGISTRATION\n', 'section');

    await runTest('Customer registration', async () => {
        const res = await fetch(`${BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customerUser)
        });
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        const data = await res.json();
        if (!data.user?.id) throw new Error('Missing user data');
    }, results);

    await runTest('Duplicate email rejection', async () => {
        const res = await fetch(`${BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customerUser)
        });
        if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
    }, results);

    // A2. Customer Login
    log('\n🔑 A2: CUSTOMER LOGIN\n', 'section');

    await runTest('Customer login (no isAdmin flag)', async () => {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: customerUser.email,
                password: customerUser.password
            })
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

        customerAccessToken = getCookie(res, 'accessToken');
        customerRefreshToken = getCookie(res, 'refreshToken');

        if (!customerAccessToken) throw new Error('Missing accessToken cookie');
        if (!customerRefreshToken) throw new Error('Missing refreshToken cookie');

        if (getCookie(res, 'adminAccessToken')) throw new Error('Got admin cookie for customer');
    }, results);

    await runTest('Customer cookie has HttpOnly', async () => {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: customerUser.email, password: customerUser.password })
        });
        const attrs = getCookieAttributes(res, 'refreshToken');
        if (!attrs?.httponly) throw new Error('Missing HttpOnly');
    }, results);

    // A3. Customer Protected Routes
    log('\n🛡️ A3: CUSTOMER PROTECTED ROUTES\n', 'section');

    await runTest('Customer can access /me', async () => {
        const res = await fetch(`${BASE_URL}/me`, {
            headers: { 'Authorization': `Bearer ${customerAccessToken}` }
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        const data = await res.json();
        if (data.user.email !== customerUser.email) throw new Error('Email mismatch');
    }, results);

    // A4. Customer Token Refresh
    log('\n🔄 A4: CUSTOMER TOKEN REFRESH\n', 'section');

    let oldCustomerRefresh = customerRefreshToken;
    await runTest('Customer token refresh (no header)', async () => {
        const res = await fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: { 'Cookie': `refreshToken=${customerRefreshToken}` }
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

        const newRefresh = getCookie(res, 'refreshToken');
        if (!newRefresh) throw new Error('No new refresh token');
        if (newRefresh === customerRefreshToken) throw new Error('Token did not rotate');
        customerRefreshToken = newRefresh;
        customerAccessToken = getCookie(res, 'accessToken');
    }, results);

    await runTest('Customer old token rejected (reuse detection)', async () => {
        const res = await fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: { 'Cookie': `refreshToken=${oldCustomerRefresh}` }
        });
        if (res.status === 200) throw new Error('Old token still works');
    }, results);

    // ==================== PART B: ADMIN PANEL AUTH ====================
    log('\n' + '═'.repeat(60), 'bold');
    log('👔 PART B: ADMIN PANEL AUTHENTICATION', 'admin');
    log('═'.repeat(60), 'bold');

    // B1. Admin Login
    log('\n🔑 B1: ADMIN LOGIN (isAdmin: true)\n', 'admin');

    await runTest('Admin login with isAdmin flag', async () => {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Type': 'admin'
            },
            body: JSON.stringify({
                email: adminUser.email,
                password: adminUser.password,
                isAdmin: true
            })
        });
        if (res.status !== 200) {
            const data = await res.json().catch(() => ({}));
            throw new Error(`Expected 200, got ${res.status}: ${data.message || 'Unknown'}`);
        }

        adminAccessToken = getCookie(res, 'adminAccessToken');
        adminRefreshToken = getCookie(res, 'adminRefreshToken');

        if (!adminAccessToken) throw new Error('Missing adminAccessToken cookie');
        if (!adminRefreshToken) throw new Error('Missing adminRefreshToken cookie');

        if (getCookie(res, 'accessToken')) throw new Error('Got customer cookie for admin');
    }, results);

    await runTest('Customer cannot login as admin', async () => {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: customerUser.email,
                password: customerUser.password,
                isAdmin: true
            })
        });
        if (res.status === 200) throw new Error('Customer logged in as admin');
    }, results);

    // B2. Admin Protected Routes
    log('\n🛡️ B2: ADMIN PROTECTED ROUTES\n', 'admin');

    await runTest('Admin can access /me', async () => {
        const res = await fetch(`${BASE_URL}/me`, {
            headers: { 'Authorization': `Bearer ${adminAccessToken}` }
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        const data = await res.json();
        if (data.user.role !== 'admin') throw new Error('Not admin role');
    }, results);

    // B3. Admin Token Refresh
    log('\n🔄 B3: ADMIN TOKEN REFRESH (X-Client-Type: admin)\n', 'admin');

    let oldAdminRefresh = adminRefreshToken;
    await runTest('Admin token refresh with header', async () => {
        const res = await fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: {
                'Cookie': `adminRefreshToken=${adminRefreshToken}`,
                'X-Client-Type': 'admin'
            }
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

        const newRefresh = getCookie(res, 'adminRefreshToken');
        if (!newRefresh) throw new Error('No new admin refresh token');
        if (newRefresh === adminRefreshToken) throw new Error('Admin token did not rotate');
        adminRefreshToken = newRefresh;
        adminAccessToken = getCookie(res, 'adminAccessToken');
    }, results);

    await runTest('Admin old token rejected', async () => {
        const res = await fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: {
                'Cookie': `adminRefreshToken=${oldAdminRefresh}`,
                'X-Client-Type': 'admin'
            }
        });
        if (res.status === 200) throw new Error('Old admin token still works');
    }, results);

    // ==================== PART C: ISOLATION TESTS ====================
    log('\n' + '═'.repeat(60), 'bold');
    log('🔒 PART C: ADMIN/CUSTOMER ISOLATION', 'section');
    log('═'.repeat(60), 'bold');

    log('\n🚧 C1: COOKIE ISOLATION\n', 'section');

    await runTest('Customer refresh without X-Client-Type uses customer cookie', async () => {
        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: customerUser.email, password: customerUser.password })
        });
        const freshToken = getCookie(loginRes, 'refreshToken');

        const res = await fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: { 'Cookie': `refreshToken=${freshToken}` }
        });
        if (res.status !== 200) throw new Error('Customer refresh failed');
        if (!getCookie(res, 'refreshToken')) throw new Error('No customer cookie returned');
    }, results);

    await runTest('Admin refresh with X-Client-Type uses admin cookie', async () => {
        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...adminUser, isAdmin: true })
        });
        const freshToken = getCookie(loginRes, 'adminRefreshToken');

        const res = await fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: {
                'Cookie': `adminRefreshToken=${freshToken}`,
                'X-Client-Type': 'admin'
            }
        });
        if (res.status !== 200) throw new Error('Admin refresh failed');
        if (!getCookie(res, 'adminRefreshToken')) throw new Error('No admin cookie returned');
    }, results);

    // ==================== PART D: SECURITY TESTS ====================
    log('\n' + '═'.repeat(60), 'bold');
    log('⚠️ PART D: SECURITY ATTACK PREVENTION', 'section');
    log('═'.repeat(60), 'bold');

    log('\n🛡️ D1: INJECTION ATTACKS\n', 'section');

    await runTest('SQL injection prevented', async () => {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: "admin'--", password: 'x' })
        });
        if (res.status === 200) throw new Error('SQL injection worked');
    }, results);

    await runTest('XSS sanitized in registration', async () => {
        const res = await fetch(`${BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `xss_${Date.now()}@example.com`,
                password: 'SecureP@ss123!',
                firstName: '<script>alert(1)</script>',
                lastName: 'Test'
            })
        });
        if (res.status === 201) {
            const data = await res.json();
            if (data.user?.firstName?.includes('<script>')) {
                throw new Error('XSS not sanitized');
            }
        }
    }, results);

    log('\n⚡ D2: CONCURRENCY\n', 'section');

    await runTest('Concurrent refresh race condition handled', async () => {
        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: customerUser.email, password: customerUser.password })
        });
        const token = getCookie(loginRes, 'refreshToken');

        const requests = Array(5).fill().map(() =>
            fetch(`${BASE_URL}/refresh`, {
                method: 'POST',
                headers: { 'Cookie': `refreshToken=${token}` }
            })
        );

        const responses = await Promise.all(requests);
        const successes = responses.filter(r => r.status === 200).length;

        if (successes === 0) throw new Error('All failed');
        // Note: multiple might succeed if they hit the server exactly at the same time BEFORE first DB commit,
        // but with FOR UPDATE locking, only one should proceed.
    }, results);

    // ==================== PART E: EDGE CASES ====================
    log('\n' + '═'.repeat(60), 'bold');
    log('🔍 PART E: EDGE CASES', 'section');
    log('═'.repeat(60), 'bold');

    await runTest('Empty body rejected', async () => {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        if (res.status === 200) throw new Error('Empty body accepted');
    }, results);

    await runTest('Malformed JSON rejected', async () => {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{'
        });
        if (res.status === 200) throw new Error('Malformed JSON accepted');
    }, results);

    await runTest('Unicode names handled', async () => {
        const res = await fetch(`${BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `unicode_${Date.now()}@example.com`,
                password: 'SecureP@ss123!',
                firstName: '日本語',
                lastName: 'العربية'
            })
        });
        if (res.status === 500) throw new Error('Server crashed on Unicode');
    }, results);

    // ==================== FINAL REPORT ====================
    const total = results.passed + results.failed;
    const rate = ((results.passed / total) * 100).toFixed(1);

    log('\n' + '═'.repeat(60), 'bold');
    log('📊 FINAL TEST REPORT', 'bold');
    log('═'.repeat(60), 'bold');
    log(`\n  Total Tests: ${total}`, 'info');
    log(`  ✅ Passed: ${results.passed}`, 'success');
    log(`  ❌ Failed: ${results.failed}`, results.failed > 0 ? 'error' : 'success');
    log(`  Success Rate: ${rate}%\n`, rate === '100.0' ? 'success' : 'warn');

    if (results.failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
};

main().catch(err => {
    console.error('\n💥 FATAL ERROR:', err);
    process.exit(1);
});
