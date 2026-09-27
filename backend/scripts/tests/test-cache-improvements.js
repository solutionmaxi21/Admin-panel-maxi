/**
 * Cache System Test & Demonstration
 * Run this to verify all cache improvements
 * 
 * Usage: node test-cache-improvements.js
 */

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';
const ADMIN_TOKEN = 'YOUR_ADMIN_TOKEN_HERE'; // Replace with actual admin token

async function testCacheSystem() {
  console.log('🧪 Testing Cache System Improvements\n');
  console.log('=' .repeat(60));

  // Test 1: Cache Stats Endpoint
  console.log('\n1️⃣  Testing Enhanced Cache Stats...');
  try {
    const response = await fetch(`${API_BASE}/metadata/cache/stats`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const stats = await response.json();
    
    console.log('✅ Cache Stats Retrieved:');
    console.log(`   Enabled: ${stats.enabled}`);
    console.log(`   Hit Rate: ${stats.hitRatePercent}`);
    console.log(`   Total Keys: ${stats.keys}`);
    console.log(`   Keys by Prefix:`, stats.keysByPrefix);
    console.log(`   Memory Used: ${(stats.memory?.used / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 2: Cache Keys List
  console.log('\n2️⃣  Testing Cache Keys Endpoint...');
  try {
    const response = await fetch(`${API_BASE}/metadata/cache/keys`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const data = await response.json();
    
    console.log(`✅ Found ${data.count} cached keys:`);
    data.keys.slice(0, 5).forEach(k => {
      const ttl = k.ttl ? new Date(k.ttl).toLocaleString() : 'no expiry';
      console.log(`   - ${k.key} (expires: ${ttl})`);
    });
    if (data.keys.length > 5) {
      console.log(`   ... and ${data.keys.length - 5} more`);
    }
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 3: Verify Categories Cache (6 hour TTL)
  console.log('\n3️⃣  Testing Categories Cache...');
  try {
    const start = Date.now();
    const response = await fetch(`${API_BASE}/metadata/categories`);
    const duration = Date.now() - start;
    const data = await response.json();
    
    console.log(`✅ Categories loaded in ${duration}ms`);
    console.log(`   ${data.length} categories cached (TTL: 6 hours)`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 4: Cache Invalidation
  console.log('\n4️⃣  Testing Cache Invalidation...');
  try {
    const response = await fetch(`${API_BASE}/metadata/cache/invalidate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pattern: 'metadata' })
    });
    const result = await response.json();
    
    console.log(`✅ ${result.message}`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 5: Verify Cache After Invalidation
  console.log('\n5️⃣  Verifying Cache Rebuild...');
  try {
    const start = Date.now();
    const response = await fetch(`${API_BASE}/metadata/categories`);
    const duration = Date.now() - start;
    
    console.log(`✅ Cache rebuilt in ${duration}ms`);
    console.log(`   (Should be slower - fetching from DB)`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 6: Second Request (Should Hit Cache)
  console.log('\n6️⃣  Testing Cache Hit...');
  try {
    const start = Date.now();
    const response = await fetch(`${API_BASE}/metadata/categories`);
    const duration = Date.now() - start;
    
    console.log(`✅ Cached response in ${duration}ms`);
    console.log(`   (Should be fast - from cache)`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Cache System Test Complete!\n');
}

// Manual tests to perform:
console.log(`
📋 MANUAL TESTS:

1. Test CACHE_ENABLED toggle:
   cd backend
   CACHE_ENABLED=false npm start
   → Should see: [CacheManager] ⚠️  Cache is DISABLED

2. Test order cache TTL:
   - Create order → GET order (cache miss, ~100ms)
   - GET order again (cache hit, ~5ms)
   - Wait 15 minutes → GET order (cache miss again)

3. Test order cache invalidation:
   - GET order details (cache hit)
   - Update order status
   - GET order details (cache miss → fresh data)

4. Test ISR integration:
   - Update product in admin
   - Visit product page in storefront
   - Should see updated data immediately

5. Monitor cache performance:
   GET ${API_BASE}/metadata/cache/stats
   → Track hit rate over time (target: 80%+)
`);

// Run if admin token is provided
if (process.argv.includes('--run')) {
  if (ADMIN_TOKEN === 'YOUR_ADMIN_TOKEN_HERE') {
    console.log('⚠️  Please set ADMIN_TOKEN in the script first');
    process.exit(1);
  }
  testCacheSystem().catch(console.error);
} else {
  console.log('💡 Run with --run flag to execute tests (after setting ADMIN_TOKEN)');
}
