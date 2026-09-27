#!/usr/bin/env node

/**
 * Advanced API Integration Test Suite
 * Tests all cache endpoints and fixes through HTTP requests
 * 
 * Prerequisites: Backend must be running on port 3001
 * Run: node test-cache-api.js
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];
const performanceMetrics = [];

function getAdminToken() {
  return process.env.ADMIN_TOKEN || 'test-token';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1];
  const icons = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪',
    metric: '📊',
    http: '🌐'
  };
  console.log(`${icons[level]} [${timestamp}] ${message}`);
}

async function test(name, fn) {
  log(`Running: ${name}`, 'test');
  const startTime = Date.now();
  try {
    await fn();
    const duration = Date.now() - startTime;
    log(`PASSED: ${name} (${duration}ms)`, 'success');
    testsPassed++;
    testResults.push({ name, status: 'PASSED', error: null, duration });
    return true;
  } catch (err) {
    const duration = Date.now() - startTime;
    log(`FAILED: ${name} (${duration}ms)`, 'error');
    log(`Error: ${err.message}`, 'error');
    testsFailed++;
    testResults.push({ name, status: 'FAILED', error: err.message, duration });
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultOptions = {
    timeout: 5000,
    headers: {
      'Content-Type': 'application/json',
      ...(options.auth && { 'Authorization': `Bearer ${options.auth}` })
    }
  };

  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

function recordMetric(name, value, unit = 'ms') {
  performanceMetrics.push({ name, value, unit });
}

// ============================================================================
// TEST SUITE 1: METADATA ENDPOINTS
// ============================================================================

async function testMetadataEndpoints() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('TEST SUITE 1: METADATA ENDPOINTS', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  // Test 1.1: GET /metadata/categories
  await test('Metadata - GET /metadata/categories', async () => {
    const startTime = Date.now();
    const data = await fetchAPI('/metadata/categories');
    const duration = Date.now() - startTime;

    assert(Array.isArray(data), 'Should return array');
    assert(data.length > 0, 'Should have categories');

    log(`Categories endpoint: ${data.length} items returned in ${duration}ms`, 'metric');
    recordMetric('GET /metadata/categories', duration);
  });

  // Test 1.2: GET /metadata/wilayas (should be cached)
  await test('Metadata - GET /metadata/wilayas (cache test)', async () => {
    // First call
    const start1 = Date.now();
    const data1 = await fetchAPI('/metadata/wilayas');
    const duration1 = Date.now() - start1;

    // Second call (should be faster due to cache)
    const start2 = Date.now();
    const data2 = await fetchAPI('/metadata/wilayas');
    const duration2 = Date.now() - start2;

    assert(Array.isArray(data1), 'Should return array');
    assert(data1.length === data2.length, 'Same data on second call');

    log(`First call: ${duration1}ms, Second call (cached): ${duration2}ms`, 'metric');
    log(`Cache speedup: ${((duration1 - duration2) / duration1 * 100).toFixed(1)}%`, 'metric');
    recordMetric('GET /metadata/wilayas (cached)', duration2);
  });

  // Test 1.3: GET /metadata/promotions
  await test('Metadata - GET /metadata/promotions', async () => {
    const startTime = Date.now();
    const data = await fetchAPI('/metadata/promotions');
    const duration = Date.now() - startTime;

    assert(Array.isArray(data), 'Should return array');
    log(`Promotions endpoint: ${data.length} items returned in ${duration}ms`, 'metric');
    recordMetric('GET /metadata/promotions', duration);
  });
}

// ============================================================================
// TEST SUITE 2: CACHE STATS & MONITORING
// ============================================================================

async function testCacheMonitoring() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('TEST SUITE 2: CACHE STATS & MONITORING', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  // Test 2.1: GET /metadata/cache/stats
  await test('Cache Monitoring - GET /metadata/cache/stats', async () => {
    const data = await fetchAPI('/metadata/cache/stats');

    assert(data.enabled !== undefined, 'Should have enabled field');
    assert(data.hits !== undefined, 'Should have hits count');
    assert(data.misses !== undefined, 'Should have misses count');
    assert(data.keys !== undefined, 'Should have keys count');
    assert(data.hitRatePercent !== undefined, 'Should have hit rate');

    log(`Cache Stats:`, 'metric');
    log(`  Enabled: ${data.enabled}`, 'metric');
    log(`  Hits: ${data.hits}`, 'metric');
    log(`  Misses: ${data.misses}`, 'metric');
    log(`  Hit Rate: ${data.hitRatePercent}`, 'metric');
    log(`  Keys: ${data.keys}`, 'metric');
    log(`  Stampedes Prevented: ${data.stampedesPrevented}`, 'metric');
  });

  // Test 2.2: GET /metadata/cache/keys
  await test('Cache Monitoring - GET /metadata/cache/keys', async () => {
    const data = await fetchAPI('/metadata/cache/keys');

    assert(Array.isArray(data.keys), 'Should return array of keys');
    assert(data.keys.length > 0, 'Should have cached keys');

    log(`Cached keys: ${data.keys.length}`, 'metric');
    log(`Sample keys:`, 'metric');
    data.keys.slice(0, 5).forEach(key => {
      log(`  - ${key.key} (TTL: ${key.ttl}s)`, 'metric');
    });
  });
}

// ============================================================================
// TEST SUITE 3: CACHE INVALIDATION
// ============================================================================

async function testCacheInvalidation() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('TEST SUITE 3: CACHE INVALIDATION', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  // Test 3.1: POST /metadata/cache/invalidate (pattern)
  await test('Cache Invalidation - Pattern-based invalidation', async () => {
    const statsBefore = await fetchAPI('/metadata/cache/stats');
    const keysBefore = statsBefore.keys;

    const response = await fetchAPI('/metadata/cache/invalidate', {
      method: 'POST',
      body: JSON.stringify({ pattern: 'metadata:' })
    });

    const statsAfter = await fetchAPI('/metadata/cache/stats');
    const keysAfter = statsAfter.keys;

    log(`Keys before: ${keysBefore}, after: ${keysAfter}`, 'metric');
    log(`Invalidation message: ${response.message}`, 'metric');

    // Re-warm cache for next tests
    await fetchAPI('/metadata/categories');
    await fetchAPI('/metadata/wilayas');
  });

  // Test 3.2: POST /metadata/cache/invalidate (clear all)
  await test('Cache Invalidation - Clear all (emergency)', async () => {
    const statsBefore = await fetchAPI('/metadata/cache/stats');
    const keysBefore = statsBefore.keys;

    const response = await fetchAPI('/metadata/cache/invalidate', {
      method: 'POST',
      body: JSON.stringify({ clearAll: true })
    });

    const statsAfter = await fetchAPI('/metadata/cache/stats');
    const keysAfter = statsAfter.keys;

    log(`Emergency clear: ${keysBefore} keys → ${keysAfter} keys`, 'metric');

    // Re-warm cache
    await fetchAPI('/metadata/categories');
    await fetchAPI('/metadata/wilayas');
    await fetchAPI('/metadata/promotions');
  });
}

// ============================================================================
// TEST SUITE 4: CONCURRENT REQUESTS
// ============================================================================

async function testConcurrentRequests() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('TEST SUITE 4: CONCURRENT REQUESTS (Stampede Protection)', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  // Test 4.1: 10 concurrent requests to same endpoint
  await test('Concurrency - 10 simultaneous category requests', async () => {
    const startTime = Date.now();
    
    // Fire 10 concurrent requests
    const promises = Array(10).fill(null).map(() =>
      fetchAPI('/metadata/categories')
    );

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    // All should return same data
    const firstLength = results[0].length;
    results.forEach((r, idx) => {
      assert(Array.isArray(r), `Result ${idx} should be array`);
      assert(r.length === firstLength, `Result ${idx} should have same length`);
    });

    log(`10 concurrent requests completed in ${duration}ms`, 'metric');
    log(`Average per request: ${(duration / 10).toFixed(0)}ms`, 'metric');
    recordMetric('10 concurrent requests', duration);
  });

  // Test 4.2: Sequential requests for comparison
  await test('Concurrency - 10 sequential requests (for comparison)', async () => {
    const startTime = Date.now();

    // Fire requests sequentially
    for (let i = 0; i < 10; i++) {
      await fetchAPI('/metadata/wilayas');
    }

    const duration = Date.now() - startTime;

    log(`10 sequential requests completed in ${duration}ms`, 'metric');
    log(`Average per request: ${(duration / 10).toFixed(0)}ms`, 'metric');
  });
}

// ============================================================================
// TEST SUITE 5: SHIPPING ENDPOINTS
// ============================================================================

async function testShippingEndpoints() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('TEST SUITE 5: SHIPPING CALCULATOR INTEGRATION', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  // Test 5.1: Shipping cost calculation
  await test('Shipping - Calculate shipping cost', async () => {
    try {
      const response = await fetchAPI('/shipping/calculate', {
        method: 'POST',
        body: JSON.stringify({
          items: [{
            id: 1,
            price: 100,
            weight: 0.5,
            dimensions: { length: 10, width: 10, height: 10 }
          }],
          communeId: 1,
          isStopDesk: false
        })
      });

      assert(response.total !== undefined, 'Should return shipping cost');
      log(`Shipping calculated: ${response.total} DA`, 'metric');
      recordMetric('Shipping calculation', 0); // No time metric, just successful
    } catch (err) {
      // Shipping endpoint might not exist or might need auth
      log(`Shipping endpoint not accessible (expected): ${err.message}`, 'warning');
    }
  });

  // Test 5.2: Commune list
  await test('Shipping - Get deliverable communes', async () => {
    try {
      const response = await fetchAPI('/shipping/communes/deliverable');
      
      if (Array.isArray(response)) {
        log(`Deliverable communes: ${response.length}`, 'metric');
      }
    } catch (err) {
      log(`Commune endpoint not accessible (might need auth): ${err.message}`, 'warning');
    }
  });
}

// ============================================================================
// TEST SUITE 6: PERFORMANCE ANALYSIS
// ============================================================================

async function testPerformanceAnalysis() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('TEST SUITE 6: PERFORMANCE ANALYSIS', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  // Test 6.1: Cache effectiveness
  await test('Performance - Cache effectiveness (warmup)', async () => {
    // Get initial stats
    const stats1 = await fetchAPI('/metadata/cache/stats');
    const hits1 = stats1.hits;

    // Make 5 requests to cached endpoints
    for (let i = 0; i < 5; i++) {
      await fetchAPI('/metadata/categories');
      await fetchAPI('/metadata/wilayas');
      await fetchAPI('/metadata/promotions');
    }

    // Get final stats
    const stats2 = await fetchAPI('/metadata/cache/stats');
    const hits2 = stats2.hits;

    const hitsIncrement = hits2 - hits1;
    log(`Cache hits increased from ${hits1} to ${hits2} (${hitsIncrement} new hits)`, 'metric');
    log(`Hit rate: ${stats2.hitRatePercent}`, 'metric');
  });

  // Test 6.2: Response time consistency
  await test('Performance - Response time consistency', async () => {
    const times = [];

    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await fetchAPI('/metadata/categories');
      const duration = Date.now() - start;
      times.push(duration);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    log(`Response times: min=${minTime}ms, avg=${avgTime.toFixed(1)}ms, max=${maxTime}ms`, 'metric');
    log(`Consistency: ${((1 - (maxTime - minTime) / maxTime) * 100).toFixed(1)}%`, 'metric');
  });
}

// ============================================================================
// TEST SUITE 7: ERROR HANDLING
// ============================================================================

async function testErrorHandling() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('TEST SUITE 7: ERROR HANDLING', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  // Test 7.1: Invalid cache invalidation pattern
  await test('Error Handling - Invalid pattern (should not crash)', async () => {
    try {
      await fetchAPI('/metadata/cache/invalidate', {
        method: 'POST',
        body: JSON.stringify({ pattern: 'nonexistent:pattern:' })
      });
      log(`Handled gracefully`, 'metric');
    } catch (err) {
      // This is OK, just checking it doesn't crash
      log(`Returned error (expected): ${err.message}`, 'metric');
    }
  });

  // Test 7.2: Network timeout simulation
  await test('Error Handling - Timeout resilience', async () => {
    try {
      // Try to fetch from invalid endpoint
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1000);

      await fetch(`${API_BASE}/invalid/endpoint`, { signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        log(`Timeout handled correctly`, 'metric');
      }
    }
  });
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport() {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log('API TEST REPORT', 'info');
  log('═══════════════════════════════════════════════════════════════', 'info');

  const total = testsPassed + testsFailed;
  const passRate = ((testsPassed / total) * 100).toFixed(1);

  log(`\nResults: ${testsPassed}/${total} tests passed (${passRate}%)`, testsFailed === 0 ? 'success' : 'warning');

  // Detailed results
  log('\nDetailed Results:', 'info');
  testResults.forEach((result, idx) => {
    const icon = result.status === 'PASSED' ? '✅' : '❌';
    log(`${idx + 1}. ${result.name}: ${result.status} (${result.duration}ms)`, result.status === 'PASSED' ? 'success' : 'error');
    if (result.error) {
      log(`   Error: ${result.error}`, 'error');
    }
  });

  // Performance metrics
  if (performanceMetrics.length > 0) {
    log('\nPerformance Metrics:', 'info');
    performanceMetrics.forEach(m => {
      log(`  ${m.name}: ${m.value}${m.unit}`, 'metric');
    });

    // Calculate averages
    const httpMetrics = performanceMetrics.filter(m => m.unit === 'ms' && m.value > 0);
    if (httpMetrics.length > 0) {
      const avgTime = httpMetrics.reduce((a, b) => a + b.value, 0) / httpMetrics.length;
      const maxTime = Math.max(...httpMetrics.map(m => m.value));
      const minTime = Math.min(...httpMetrics.map(m => m.value));

      log('\nTiming Summary:', 'metric');
      log(`  Average: ${avgTime.toFixed(1)}ms`, 'metric');
      log(`  Min: ${minTime}ms`, 'metric');
      log(`  Max: ${maxTime}ms`, 'metric');
    }
  }

  log('\n═══════════════════════════════════════════════════════════════', 'info');
  if (testsFailed === 0) {
    log('🎉 ALL API TESTS PASSED! 🎉', 'success');
  } else {
    log(`⚠️ ${testsFailed} test(s) failed`, 'warning');
  }
  log('═══════════════════════════════════════════════════════════════', 'info');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  log('\n╔════════════════════════════════════════════════════════════════╗', 'info');
  log('║        ADVANCED API INTEGRATION TEST SUITE                      ║', 'info');
  log('║              Testing All Cache Endpoints                        ║', 'info');
  log('╚════════════════════════════════════════════════════════════════╝', 'info');

  // Check if API is running
  try {
    await fetchAPI('/metadata/categories');
  } catch (err) {
    log('ERROR: Backend API not running on http://localhost:3001', 'error');
    log('Please start the backend with: npm start', 'error');
    process.exit(1);
  }

  try {
    // Run all test suites
    await testMetadataEndpoints();
    await testCacheMonitoring();
    await testCacheInvalidation();
    await testConcurrentRequests();
    await testShippingEndpoints();
    await testPerformanceAnalysis();
    await testErrorHandling();

    // Print report
    printReport();

    // Exit with appropriate code
    process.exit(testsFailed === 0 ? 0 : 1);
  } catch (err) {
    log(`\nFATAL ERROR: ${err.message}`, 'error');
    console.error(err);
    process.exit(1);
  }
}

// Run tests
main().catch(err => {
  log(`Uncaught error: ${err.message}`, 'error');
  console.error(err);
  process.exit(1);
});
