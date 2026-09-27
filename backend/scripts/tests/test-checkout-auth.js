#!/usr/bin/env node

/**
 * Test Script: Checkout Authentication Flow
 * 
 * Verifies that:
 * 1. Authenticated user can fetch shipping data
 * 2. Cookies are properly sent with checkout requests
 * 3. Session persists during checkout flow
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const ADMIN_USER = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin1234!';

let globalCookies = [];
let authToken = null;

async function request(method, endpoint, body = null, isAuth = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Checkout-Auth-Test/1.0'
      }
    };

    // Add cookies to request
    if (globalCookies.length > 0) {
      options.headers['Cookie'] = globalCookies.join('; ');
      console.log(`📌 Sending ${globalCookies.length} cookies`);
    }

    // Add authentication header if provided
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = protocol.request(options, (res) => {
      let data = '';

      // Capture cookies from response
      if (res.headers['set-cookie']) {
        res.headers['set-cookie'].forEach((cookie) => {
          const cookieParts = cookie.split(';')[0];
          globalCookies.push(cookieParts);
        });
        console.log(`🍪 Received ${res.headers['set-cookie'].length} new cookies`);
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            data: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testCheckoutFlow() {
  console.log('\n🛒 Checkout Authentication Flow Test\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Admin Login (if needed)
    console.log('\n📋 Test 1: Admin Authentication');
    console.log('-' .repeat(40));
    
    const loginRes = await request('POST', '/auth/login', {
      email: ADMIN_USER,
      password: ADMIN_PASSWORD
    });
    
    if (loginRes.status !== 200) {
      console.log(`❌ Login failed: ${loginRes.status}`);
      console.log(`Response:`, loginRes.body);
    } else {
      console.log(`✅ Login successful (${loginRes.status})`);
      if (loginRes.body.data && loginRes.body.data.accessToken) {
        authToken = loginRes.body.data.accessToken;
      }
    }

    // Test 2: Fetch Wilayas (with credentials)
    console.log('\n📋 Test 2: Fetch Wilayas with Credentials');
    console.log('-' .repeat(40));
    
    const wilayasRes = await request('GET', '/shipping/wilayas', null, true);
    
    if (wilayasRes.status === 200) {
      console.log(`✅ Wilayas fetched successfully (${wilayasRes.status})`);
      if (wilayasRes.body.data) {
        console.log(`   📍 Found ${wilayasRes.body.data.length} wilayas`);
        if (wilayasRes.body.data[0]) {
          console.log(`   First: ${wilayasRes.body.data[0].name || 'Unknown'}`);
        }
      }
    } else {
      console.log(`❌ Failed to fetch wilayas: ${wilayasRes.status}`);
      console.log(`Response:`, wilayasRes.body);
    }

    // Test 3: Fetch Communes (with credentials)
    console.log('\n📋 Test 3: Fetch Communes with Credentials');
    console.log('-' .repeat(40));
    
    const communesRes = await request('GET', '/shipping/communes?wilayaId=1&isDeliverable=true', null, true);
    
    if (communesRes.status === 200) {
      console.log(`✅ Communes fetched successfully (${communesRes.status})`);
      if (communesRes.body.data) {
        console.log(`   📍 Found ${communesRes.body.data.length} communes`);
      }
    } else if (communesRes.status === 401) {
      console.log(`❌ Unauthorized - credentials not sent properly (${communesRes.status})`);
      console.log(`   ⚠️  This means fetch() calls might not have 'credentials: include'`);
    } else {
      console.log(`❌ Failed to fetch communes: ${communesRes.status}`);
    }

    // Test 4: Fetch Stop Desks/Centers (with credentials)
    console.log('\n📋 Test 4: Fetch Stop Desks/Centers with Credentials');
    console.log('-' .repeat(40));
    
    const centersRes = await request('GET', '/shipping/centers?wilayaId=1', null, true);
    
    if (centersRes.status === 200) {
      console.log(`✅ Centers fetched successfully (${centersRes.status})`);
      if (centersRes.body.data) {
        console.log(`   📍 Found ${centersRes.body.data.length} centers`);
      }
    } else {
      console.log(`❌ Failed to fetch centers: ${centersRes.status}`);
    }

    // Test 5: Shipping Estimate (with credentials)
    console.log('\n📋 Test 5: Shipping Estimate Calculation');
    console.log('-' .repeat(40));
    
    const shippingEstimateRes = await request('POST', '/orders/shipping-estimate', {
      communeId: 1,
      isStopDesk: false,
      items: [
        {
          price: 50000,
          quantity: 1,
          weight: 5,
          length: 30,
          width: 20,
          height: 10,
          hasInsurance: true,
          declaredValue: 50000
        }
      ]
    }, true);
    
    if (shippingEstimateRes.status === 200) {
      console.log(`✅ Shipping estimate calculated (${shippingEstimateRes.status})`);
      if (shippingEstimateRes.body.data) {
        console.log(`   💰 Shipping cost: ${shippingEstimateRes.body.data.shippingCost || 'N/A'}`);
      }
    } else if (shippingEstimateRes.status === 401) {
      console.log(`❌ Unauthorized - credentials not sent (${shippingEstimateRes.status})`);
      console.log(`   ⚠️  This means checkout will fail for authenticated users`);
    } else {
      console.log(`❌ Failed: ${shippingEstimateRes.status}`);
    }

    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('\n📊 Test Summary:');
    console.log('-' .repeat(40));
    console.log(`🍪 Cookies sent: ${globalCookies.length > 0 ? '✅ Yes' : '❌ No'}`);
    console.log(`🔐 Auth token: ${authToken ? '✅ Present' : '❌ Missing'}`);
    console.log('\n✨ Checkout flow authentication test completed!\n');

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  }
}

testCheckoutFlow();
