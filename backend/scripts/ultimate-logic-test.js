/**
 * Ultimate Business Logic & Security Test Suite
 * Tests "Logical" vulnerabilities beyond standard authentication.
 */
import 'dotenv/config';
import fetch from 'node-fetch';
import { Pool } from 'pg';

// Env Configuration
const BASE_URL = 'http://localhost:3001/api';
const DB_CONFIG = {
    user: 'postgres',
    host: 'localhost',
    database: 'algerian_hardware_db',
    password: 'password', // Default, likely overridden by env but good for local dev
    port: 5432,
};
if (process.env.DATABASE_URL) {
    // Basic parsing or just rely on pg default env vars if avoiding direct config
}

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m'
};

const log = (msg, type = 'info') => {
    const color = {
        info: COLORS.blue,
        success: COLORS.green,
        error: COLORS.red,
        warn: COLORS.yellow,
        section: COLORS.cyan
    }[type] || COLORS.reset;
    console.log(`${color}${msg}${COLORS.reset}`);
};

// Helper: Get Cookie Value
const getCookie = (res, name) => {
    const raw = res.headers.raw()['set-cookie'];
    if (!raw) return null;
    const cookieStr = raw.find(c => c.startsWith(`${name}=`));
    if (!cookieStr) return null;
    return cookieStr.split(';')[0].split('=')[1];
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
    log('\n🧠 ULTIMATE BUSINESS LOGIC TEST SUITE', 'bold');

    // Check Admin Config
    const adminEmail = process.env.TEST_ADMIN_EMAIL;
    const adminPass = process.env.TEST_ADMIN_PASSWORD;

    if (!adminEmail || !adminPass) {
        log('❌ SKIPPING: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD required for setup.', 'error');
        process.exit(1);
    }

    const results = { passed: 0, failed: 0 };

    // 1. Authenticate Admin (for setup)
    log('\n🔑 Step 1: Authenticating Admin...', 'info');
    const adminLogin = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'admin' },
        body: JSON.stringify({ email: adminEmail, password: adminPass, isAdmin: true })
    });

    if (adminLogin.status !== 200) {
        throw new Error('Admin login failed');
    }
    const adminToken = getCookie(adminLogin, 'adminAccessToken');

    // 2. Authenticate Customer (Attacker)
    const customerUser = {
        email: `logic_test_${Date.now()}@example.com`,
        password: 'SecureP@ss123!',
        firstName: 'Logic',
        lastName: 'Tester'
    };

    const signupRes = await fetch(`${BASE_URL}/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerUser)
    });
    const signupData = await signupRes.json();
    const customerId = signupData.user.id; // Corrected from .user.id based on previous tests

    const customerLogin = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: customerUser.email, password: customerUser.password })
    });
    const customerToken = getCookie(customerLogin, 'accessToken');

    log('✅ Users authenticated\n', 'success');

    // =================================================================
    // TEST 1: INVENTORY RACE CONDITION
    // =================================================================
    log('\n🏁 T1: INVENTORY RACE CONDITION', 'section');
    await runTest('Overselling Prevention', async () => {
        // Setup: Create Product with Stock = 1
        // Note: category_id 1 is assumed to exist. If not, this might fail (hence the fallback).
        const productRes = await fetch(`${BASE_URL}/products`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `RaceItem-${Date.now()}`,
                description: 'Race condition test item',
                category_id: 1, // Use ID, not string name
                brand: 'TestBrand',
                price: 1000,
                stock: 1, // CRITICAL: Only 1 in stock
                specifications: {}
            })
        });

        // Debug creation failure
        if (productRes.status !== 201 && productRes.status !== 200) {
            const err = await productRes.json().catch(() => ({}));
            console.log('    debug: Product creation failed', productRes.status, JSON.stringify(err));
        }

        let productId;
        if (productRes.status === 201 || productRes.status === 200) {
            const data = await productRes.json();
            productId = data.product?.id || data.id;
        } else {
            // Fallback: Pick first product from storefront
            const listRes = await fetch(`${BASE_URL}/products/storefront?limit=1`);
            const listData = await listRes.json();
            if (!listData.data || !listData.data[0]) {
                throw new Error('No products found in storefront');
            }
            productId = listData.data[0].id;
            // Reset its stock to 1 via DB or Admin API? 
            // Admin API:
            await fetch(`${BASE_URL}/products/${productId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ stock: 1 })
            });
        }

        // Add to cart / Prepare Order Payload
        // Note: Based on orders-v2.js, payload expects: { items: [{ product_id, quantity }], ... }
        const orderPayload = {
            items: [{ product_id: productId, quantity: 1 }],
            delivery_commune_id: 1, // Assumes commune 1 exists
            delivery_address: "123 Test St",
            delivery_phone: "0555555555",
            payment_method: "cash"
        };

        // Launch 5 Concurrent requests
        const promises = Array(5).fill().map(() =>
            fetch(`${BASE_URL}/orders`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            })
        );

        const responses = await Promise.all(promises);
        const successes = responses.filter(r => r.status === 201).length;

        if (successes === 0) throw new Error('All orders failed (setup issue?)');
        if (successes > 1) throw new Error(`RACE CONDITION FAIL: Sold ${successes} items but only 1 in stock!`);

    }, results);

    // =================================================================
    // TEST 2: PRICE TAMPERING
    // =================================================================
    log('\n💸 T2: PRICE TAMPERING', 'section');
    await runTest('Reject client-side price injection', async () => {
        // Pick a product from storefront
        const listRes = await fetch(`${BASE_URL}/products/storefront?limit=1`);
        const listData = await listRes.json();
        const product = listData.data ? listData.data[0] : listData.products[0]; // adaptive
        if (!product) throw new Error('No products found');

        // Attempt to buy with manipulated price (e.g. 1 DZD)
        const tamperedPayload = {
            items: [{
                product_id: product.id,
                quantity: 1,
                price: 1, // <--- MALICIOUS FIELD
                unit_price: 1 // <--- Try both common names
            }],
            delivery_commune_id: 1,
            delivery_address: "123 Hacker Way",
            delivery_phone: "0555555555",
            payment_method: "cash"
        };

        const res = await fetch(`${BASE_URL}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(tamperedPayload)
        });

        if (res.status === 201) {
            const data = await res.json();
            // Check order total in response
            // data.order.total_amount vs expected
            if (data.order && data.order.total_amount < product.price) { // Assuming product.price is > 1
                throw new Error(`Price tampering SUCCESSFUL! Paid ${data.order.total_amount} instead of ${product.price}`);
            }
        }
    }, results);

    // =================================================================
    // TEST 3: NEGATIVE QUANTITY
    // =================================================================
    log('\n➖ T3: NEGATIVE QUANTITY', 'section');
    await runTest('Reject negative quantity', async () => {
        // Pick a product from storefront
        const listRes = await fetch(`${BASE_URL}/products/storefront?limit=1`);
        const listData = await listRes.json();
        const product = listData.data ? listData.data[0] : listData.products[0];

        const payload = {
            items: [{ product_id: product.id, quantity: -5 }],
            delivery_commune_id: 1,
            delivery_address: "123 Test St",
            delivery_phone: "0555555555",
            payment_method: "cash"
        };

        const res = await fetch(`${BASE_URL}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.status === 201) throw new Error('Order created with negative quantity');
        // Likely 400 Bad Request
    }, results);

    // =================================================================
    // TEST 4: PRIVILEGE ESCALATION
    // =================================================================
    log('\n🕵️ T4: PRIVILEGE ESCALATION', 'section');
    await runTest('Reject role update by customer', async () => {
        const res = await fetch(`${BASE_URL}/users/profile`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: 'Hacker',
                role: 'admin' // <--- MALICIOUS ATTEMPT
            })
        });

        const data = await res.json();

        // Check if role actually changed
        const checkRes = await fetch(`${BASE_URL}/users/profile`, {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        const checkData = await checkRes.json();

        if (checkData.role === 'admin') throw new Error('Privilege Escalation SUCCESSFUL! User is now admin.');
        if (checkData.role !== 'customer' && checkData.role !== 'user') {
            // Just in case default is something else
            // But definitely shouldn't be admin
        }

    }, results);

    // =================================================================
    // TEST 5: COUPON CONCURRENCY (Optional - skips if no coupon system)
    // =================================================================
    log('\n🎟️ T5: COUPON DOUBLE SPEND', 'section');
    /* 
       Optimistic approach: Try to verify if system handles coupon limits under load.
       Requires creating a coupon first.
    */
    await runTest('Coupon limit enforcement', async () => {
        // Create Coupon (Admin)
        const couponCode = `TEST${Date.now()}`;
        const createRes = await fetch(`${BASE_URL}/promotions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                promotionCode: couponCode,
                promotionName: "Test Coupon",
                discountType: "percentage",
                discountValue: 10,
                maxUses: 1, // CRITICAL: Only 1 use allowed
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 86400000).toISOString()
            })
        });

        if (createRes.status !== 201) {
            const err = await createRes.json();
            console.log('    Skipped (Could not create coupon)', createRes.status, JSON.stringify(err, null, 2));
            return;
        }

        // Try to place 5 orders with this coupon
        // Assuming order payload accepts `coupon_code` or `promotion_code`
        const orderPayload = {
            items: [{ product_id: 1, quantity: 1 }], // Assumes prod 1 exists
            coupon_code: couponCode, // Check API if it prefers this field
            delivery_commune_id: 1,
            delivery_address: "123 Test St",
            delivery_phone: "0555555555",
            payment_method: "cash"
        };

        const promises = Array(5).fill().map(() =>
            fetch(`${BASE_URL}/orders`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            })
        );

        const responses = await Promise.all(promises);
        const activeResponses = responses.filter(r => r.status === 201);

        // We need to inspect which orders actually got the discount?
        // Or if the API rejects order if coupon is invalid?
        // Ideally, only 1 order should succeed IF the coupon is mandatory. 
        // But usually coupon is optional. So all might succeed, but only 1 should have discount.

        // Let's count how many got 'promotion_id' in response or 'discount_amount' > 0
        let discountCount = 0;
        for (const r of activeResponses) {
            const d = await r.json();
            if (d.order && parseFloat(d.order.discount_amount || 0) > 0) {
                discountCount++;
            }
        }

        if (discountCount > 1) {
            throw new Error(`COUPON RACE FAIL: ${discountCount} orders got the discount (max_uses=1)`);
        }

    }, results);


    // REPORT
    const total = results.passed + results.failed;
    log('\n' + '═'.repeat(60), 'bold');
    log('📊 LOGIC TEST REPORT', 'bold');
    log('═'.repeat(60), 'bold');
    log(`Total Tests: ${total}`, 'info');
    log(`✅ Passed: ${results.passed}`, 'success');
    log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'error' : 'success');

    if (results.failed > 0) process.exit(1);
    process.exit(0);
};

main().catch(console.error);
