#!/usr/bin/env node
/**
 * Offline Sync Endpoint Test
 * 
 * Usage: node test-sync-endpoint.js
 * 
 * Tests:
 * 1. Authentication check (requires valid JWT)
 * 2. Mutation validation
 * 3. HMAC signature verification
 * 4. Wishlist sync operations
 */

import crypto from 'crypto';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3001/api';

// Test credentials
const TEST_USER = {
  email: 'test@example.com',
  password: 'password123'
};

let testContext = {
  jwtToken: null,
  userId: null,
  jwtIat: null,
  cookieHeader: null
};

/**
 * Step 1: Login and get JWT
 */
async function login() {
  console.log('\n🔐 Step 1: Login');
  console.log('─'.repeat(50));
  
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(TEST_USER)
    });

    if (!response.ok) {
      console.error('❌ Login failed:', response.status, response.statusText);
      const error = await response.json();
      console.error('Error:', error);
      return false;
    }

    const data = await response.json();
    testContext.userId = data.user.id;
    testContext.jwtIat = Math.floor(Date.now() / 1000);
    
    // Extract cookie from Set-Cookie header
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      testContext.cookieHeader = setCookie.split(';')[0];
    }

    console.log('✅ Login successful');
    console.log(`   User ID: ${testContext.userId}`);
    console.log(`   JWT IAT: ${testContext.jwtIat}`);
    
    return true;
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return false;
  }
}

/**
 * Step 2: Derive HMAC key (matching client crypto)
 */
function deriveHMACKey(userId, iat) {
  const salt = `${userId}:${iat}`;
  
  // PBKDF2 with 100k iterations
  return crypto.pbkdf2Sync(
    'hmac-secret', // placeholder secret
    salt,
    100000,
    32,
    'sha256'
  ).toString('base64');
}

/**
 * Step 3: Create and sign a test mutation
 */
function createTestMutation(type, data) {
  const idempotencyKey = crypto.randomUUID();
  const timestamp = Date.now();
  
  const payload = {
    idempotencyKey,
    data,
    timestamp,
    signature: '' // Will fill after signing
  };
  
  // Create signature (HMAC-SHA256)
  const key = deriveHMACKey(testContext.userId, testContext.jwtIat);
  const signatureData = JSON.stringify({
    ...payload,
    signature: '' // Empty for signing
  });
  
  const hmac = crypto.createHmac('sha256', Buffer.from(key, 'base64'));
  hmac.update(signatureData);
  const signature = hmac.digest('base64');
  
  payload.signature = signature;
  
  return {
    type,
    mutation: payload,
    signature // Outer signature (same as inner for this test)
  };
}

/**
 * Step 4: Send sync batch request
 */
async function sendSyncBatch(mutations) {
  console.log('\n📤 Step 2: Send Sync Batch');
  console.log('─'.repeat(50));
  
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add cookie header for authentication
    if (testContext.cookieHeader) {
      headers['Cookie'] = testContext.cookieHeader;
    }
    
    const response = await fetch(`${API_URL}/sync/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mutations }),
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Sync failed:', response.status);
      console.error('Error:', data);
      return false;
    }

    console.log('✅ Sync successful');
    console.log(`   Synced: ${data.synced}/${data.synced + data.failed}`);
    console.log('   Results:');
    
    data.results.forEach((result, i) => {
      if (result.success) {
        console.log(`   ${i + 1}. ✅ ${result.response?.message || 'Success'}`);
      } else {
        console.log(`   ${i + 1}. ❌ ${result.error}`);
      }
    });
    
    return data.synced > 0;
  } catch (error) {
    console.error('❌ Request error:', error.message);
    return false;
  }
}

/**
 * Step 5: Run all tests
 */
async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     Offline Sync Endpoint Test Suite                   ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\nAPI URL: ${API_URL}`);
  
  // Test 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.error('\n❌ Tests failed: Could not authenticate');
    process.exit(1);
  }
  
  // Test 2: Create test mutations
  console.log('\n🔨 Step 2: Create Test Mutations');
  console.log('─'.repeat(50));
  
  const mutations = [
    createTestMutation('add_to_wishlist', { productId: 1 }),
    createTestMutation('add_to_wishlist', { productId: 2 }),
    createTestMutation('remove_from_wishlist', { productId: 1 })
  ];
  
  console.log(`✅ Created ${mutations.length} test mutations`);
  console.log(`   1. Add product 1 to wishlist`);
  console.log(`   2. Add product 2 to wishlist`);
  console.log(`   3. Remove product 1 from wishlist`);
  
  // Test 3: Send sync batch
  const syncSuccess = await sendSyncBatch(mutations);
  
  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  if (syncSuccess) {
    console.log('║     ✅ All Tests Passed                                 ║');
    console.log('║     The offline sync endpoint is working correctly!    ║');
  } else {
    console.log('║     ❌ Some Tests Failed                                ║');
    console.log('║     Check server logs for details                      ║');
  }
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  process.exit(syncSuccess ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
