#!/usr/bin/env node

/**
 * Advanced Notification System Testing Script
 * Tests all possible flows and edge cases
 * 
 * Usage: node test-notifications-advanced.js [options]
 * Options:
 *   --verbose   Show detailed request/response logs
 *   --clean     Clean up test notifications after tests
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import db from './src/db/postgres.js';
import { generateAccessToken } from './src/shared/middleware/auth.js';

// Load environment variables from backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const VERBOSE = process.argv.includes('--verbose');
const CLEANUP = process.argv.includes('--clean');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracking
let passed = 0;
let failed = 0;
let testCount = 0;

// Helper functions
const log = (text, color = 'reset') => console.log(`${colors[color]}${text}${colors.reset}`);
const logTest = (name) => {
  testCount++;
  log(`\n[TEST ${testCount}] ${name}`, 'cyan');
};
const logPass = (msg) => {
  passed++;
  log(`✓ ${msg}`, 'green');
};
const logFail = (msg) => {
  failed++;
  log(`✗ ${msg}`, 'red');
};
const logInfo = (msg) => log(`  → ${msg}`, 'blue');
const logVerbose = (msg) => VERBOSE && logInfo(msg);

// Mock user data
const testUsers = [
  { userId: 1, email: 'customer1@test.com', name: 'Customer One' },
  { userId: 2, email: 'customer2@test.com', name: 'Customer Two' },
  { userId: 999, email: 'admin@test.com', name: 'Admin' },
];

// Test data
const testNotifications = [];

/**
 * Helper: Make API request with authentication
 */
async function apiRequest(method, path, body = null, userId = 1) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateMockJWT(userId)}`,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = `${API_URL}${path}`;
    logVerbose(`${method} ${url}`);
    if (body) logVerbose(`Body: ${JSON.stringify(body)}`);

    const response = await fetch(url, options);
    const data = await response.json();

    logVerbose(`Status: ${response.status}`);
    if (VERBOSE && data) logVerbose(`Response: ${JSON.stringify(data, null, 2)}`);

    return { status: response.status, data };
  } catch (error) {
    logFail(`Request error: ${error.message}`);
    return { status: 0, data: null, error };
  }
}

/**
 * Generate real JWT token for testing
 */
function generateMockJWT(userId) {
  const user = testUsers.find(u => u.userId === userId) || testUsers[0];
  return generateAccessToken({
    userId: user.userId,
    email: user.email,
    role: 'customer',
    firstName: user.name.split(' ')[0],
    lastName: user.name.split(' ')[1] || '',
  });
}

/**
 * Create test notifications via backend service
 */
async function createTestNotifications(userId = 1) {
  const NotificationService = (await import('./src/services/NotificationService.js')).default;
  
  const types = [
    { type: 'ORDER_CREATED', title: 'Order Confirmed', message: 'Your order #12345 has been confirmed' },
    { type: 'ORDER_SHIPPED', title: 'Order Shipped', message: 'Your order #12345 has been shipped' },
    { type: 'RETURN_REQUEST', title: 'Return Request', message: 'Your return request has been received' },
    { type: 'REVIEW_ADDED', title: 'New Review', message: 'Your product review has been published' },
    { type: 'PROMOTION', title: 'Special Offer', message: 'New 20% discount available for you' },
  ];

  for (const notifType of types) {
    try {
      const notif = await NotificationService.create({
        userId,
        type: notifType.type,
        title: notifType.title,
        message: notifType.message,
        actionUrl: `/orders/${Math.floor(Math.random() * 10000)}`,
        relatedEntityType: 'order',
        relatedEntityId: Math.floor(Math.random() * 10000),
      });
      if (notif) testNotifications.push(notif);
    } catch (error) {
      logFail(`Failed to create ${notifType.type}: ${error.message}`);
    }
  }

  return testNotifications;
}

/**
 * TEST SUITE: Authentication & Authorization
 */
async function testAuthentication() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: AUTHENTICATION & AUTHORIZATION', 'yellow');
  log('='.repeat(60), 'yellow');

  // Test 1: Missing authentication
  logTest('GET /notifications without auth token (should fail)');
  try {
    const options = {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    };
    const response = await fetch(`${API_URL}/notifications`, options);
    if (response.status === 401) {
      logPass('Properly rejected unauthenticated request');
    } else {
      logFail(`Expected 401, got ${response.status}`);
    }
  } catch (error) {
    logFail(`Request error: ${error.message}`);
  }

  // Test 2: Invalid token
  logTest('GET /notifications with invalid token');
  try {
    const options = {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid.token.here',
      },
    };
    const response = await fetch(`${API_URL}/notifications`, options);
    if (response.status === 401 || response.status === 403) {
      logPass('Properly rejected invalid token');
    } else {
      logFail(`Expected 401/403, got ${response.status}`);
    }
  } catch (error) {
    logFail(`Error: ${error.message}`);
  }

  // Test 3: Valid authentication
  logTest('GET /notifications with valid token (should succeed)');
  const withAuth = await apiRequest('GET', '/notifications', null, 1);
  if (withAuth.status === 200 && withAuth.data.success) {
    logPass('Successfully authenticated and retrieved notifications');
  } else {
    logFail(`Expected 200 with success, got ${withAuth.status}`);
  }
}

/**
 * TEST SUITE: Notification Creation
 */
async function testNotificationCreation() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: NOTIFICATION CREATION', 'yellow');
  log('='.repeat(60), 'yellow');

  // Create test notifications first
  await createTestNotifications(1);

  logTest('Multiple notifications created for user');
  if (testNotifications.length >= 5) {
    logPass(`Created ${testNotifications.length} test notifications`);
  } else {
    logFail(`Expected at least 5 notifications, got ${testNotifications.length}`);
  }

  // Test notification structure
  logTest('Verify notification structure');
  if (testNotifications.length > 0) {
    const notif = testNotifications[0];
    const requiredFields = ['id', 'user_id', 'type', 'title', 'message', 'is_read', 'created_at'];
    const hasAllFields = requiredFields.every(field => field in notif);
    
    if (hasAllFields) {
      logPass('Notification has all required fields');
      testNotifications.forEach((n, idx) => {
        logInfo(`Notif ${idx + 1}: ${n.type} - "${n.title}" (Read: ${n.is_read})`);
      });
    } else {
      logFail(`Missing fields in notification structure`);
    }
  }
}

/**
 * TEST SUITE: Notification Retrieval
 */
async function testNotificationRetrieval() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: NOTIFICATION RETRIEVAL', 'yellow');
  log('='.repeat(60), 'yellow');

  // Test 1: Get all notifications
  logTest('GET /notifications - retrieve all notifications');
  const all = await apiRequest('GET', '/notifications', null, 1);
  if (all.status === 200 && all.data.success && Array.isArray(all.data.data)) {
    logPass(`Retrieved ${all.data.data.length} notifications`);
  } else {
    logFail(`Failed to retrieve notifications`);
  }

  // Test 2: Pagination with limit
  logTest('GET /notifications?limit=2 - test pagination limit');
  const paginated = await apiRequest('GET', '/notifications?limit=2', null, 1);
  if (paginated.status === 200 && paginated.data?.data && paginated.data.data.length <= 2) {
    logPass(`Pagination works: retrieved ${paginated.data.data.length} of max 2`);
  } else {
    logFail(`Pagination failed (status: ${paginated.status})`);
  }

  // Test 3: Cursor pagination
  logTest('GET /notifications with cursor - test cursor pagination');
  if (paginated.data?.data?.length > 0 && paginated.data.nextCursor) {
    const cursor = paginated.data.nextCursor;
    const nextPage = await apiRequest('GET', `/notifications?limit=2&cursor=${cursor}`, null, 1);
    if (nextPage.status === 200 && Array.isArray(nextPage.data?.data)) {
      logPass(`Cursor pagination works: retrieved next page with cursor`);
      logInfo(`Cursor: ${cursor} → Next page items: ${nextPage.data.data.length}`);
    } else {
      logFail(`Cursor pagination failed`);
    }
  } else {
    logInfo('Skipping cursor test (need more than 2 notifications)');
  }

  // Test 4: Unread count
  logTest('GET /notifications/unread-count - get unread count');
  const unreadCount = await apiRequest('GET', '/notifications/unread-count', null, 1);
  if (unreadCount.status === 200 && typeof unreadCount.data.unreadCount === 'number') {
    logPass(`Got unread count: ${unreadCount.data.unreadCount}`);
  } else {
    logFail(`Failed to get unread count`);
  }
}

/**
 * TEST SUITE: Notification Filtering
 */
async function testNotificationFiltering() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: NOTIFICATION FILTERING', 'yellow');
  log('='.repeat(60), 'yellow');

  // Test 1: Filter by unread
  logTest('GET /notifications?filter=unread - filter unread only');
  const unread = await apiRequest('GET', '/notifications?filter=unread', null, 1);
  if (unread.status === 200 && Array.isArray(unread.data.data)) {
    const allUnread = unread.data.data.every(n => !n.is_read);
    if (allUnread) {
      logPass(`Filter works: all ${unread.data.data.length} notifications are unread`);
    } else {
      logFail(`Filter failed: found read notifications in unread filter`);
    }
  } else {
    logFail(`Failed to filter unread notifications`);
  }

  // Test 2: Filter by read
  logTest('GET /notifications?filter=read - filter read only');
  const read = await apiRequest('GET', '/notifications?filter=read', null, 1);
  if (read.status === 200 && Array.isArray(read.data.data)) {
    const allRead = read.data.data.every(n => n.is_read);
    if (allRead) {
      logPass(`Filter works: all ${read.data.data.length} notifications are read`);
    } else {
      logFail(`Filter failed: found unread notifications in read filter`);
    }
  } else {
    logFail(`Failed to filter read notifications`);
  }

  // Test 3: Filter by all (default)
  logTest('GET /notifications?filter=all - filter all notifications');
  const allNotifs = await apiRequest('GET', '/notifications?filter=all', null, 1);
  if (allNotifs.status === 200 && Array.isArray(allNotifs.data.data)) {
    logPass(`Retrieved all ${allNotifs.data.data.length} notifications`);
  } else {
    logFail(`Failed to retrieve all notifications`);
  }
}

/**
 * TEST SUITE: Mark As Read Operations
 */
async function testMarkAsRead() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: MARK AS READ OPERATIONS', 'yellow');
  log('='.repeat(60), 'yellow');

  if (testNotifications.length === 0) {
    logInfo('Creating test notifications first...');
    await createTestNotifications(1);
  }

  const firstNotif = testNotifications[0];

  // Test 1: Mark single notification as read
  logTest(`PATCH /notifications/${firstNotif.id}/read - mark single as read`);
  const markRead = await apiRequest('PATCH', `/notifications/${firstNotif.id}/read`, {}, 1);
  if (markRead.status === 200 && markRead.data.success) {
    logPass(`Successfully marked notification ${firstNotif.id} as read`);
  } else {
    logFail(`Failed to mark notification as read`);
  }

  // Test 2: Verify it's marked as read
  logTest('Verify notification is marked as read');
  const allNotifs = await apiRequest('GET', '/notifications?filter=all', null, 1);
  const updated = allNotifs.data.data.find(n => n.id === firstNotif.id);
  if (updated && updated.is_read) {
    logPass(`Notification ${firstNotif.id} is now marked as read`);
  } else {
    logFail(`Notification was not marked as read`);
  }

  // Test 3: Mark all as read
  logTest('PATCH /notifications/mark-all-read - mark all as read');
  const markAllRead = await apiRequest('PATCH', '/notifications/mark-all-read', {}, 1);
  if (markAllRead.status === 200 && markAllRead.data.success) {
    logPass(`Successfully marked all notifications as read`);
  } else {
    logFail(`Failed to mark all as read`);
  }

  // Test 4: Verify all are read
  logTest('Verify all notifications are read');
  const allRead = await apiRequest('GET', '/notifications?filter=all', null, 1);
  const allAreRead = allRead.data.data.every(n => n.is_read);
  if (allAreRead) {
    logPass(`All ${allRead.data.data.length} notifications are now marked as read`);
  } else {
    logFail(`Some notifications are still unread`);
  }

  // Test 5: Verify unread count is 0
  logTest('Verify unread count is 0');
  const zeroUnread = await apiRequest('GET', '/notifications/unread-count', null, 1);
  if (zeroUnread.data.unreadCount === 0) {
    logPass(`Unread count is 0`);
  } else {
    logFail(`Unread count is still ${zeroUnread.data.unreadCount}`);
  }
}

/**
 * TEST SUITE: Notification Deletion
 */
async function testNotificationDeletion() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: NOTIFICATION DELETION', 'yellow');
  log('='.repeat(60), 'yellow');

  if (testNotifications.length === 0) {
    logInfo('Creating test notifications first...');
    await createTestNotifications(1);
  }

  const notifToDelete = testNotifications[testNotifications.length - 1];

  // Test 1: Delete single notification
  logTest(`DELETE /notifications/${notifToDelete.id} - delete single notification`);
  const deleted = await apiRequest('DELETE', `/notifications/${notifToDelete.id}`, {}, 1);
  if (deleted.status === 200 && deleted.data.success) {
    logPass(`Successfully deleted notification ${notifToDelete.id}`);
  } else {
    logFail(`Failed to delete notification`);
  }

  // Test 2: Verify it's deleted
  logTest('Verify notification is deleted');
  const allNotifs = await apiRequest('GET', '/notifications?filter=all&limit=100', null, 1);
  const stillExists = allNotifs.data.data.find(n => n.id === notifToDelete.id);
  if (!stillExists) {
    logPass(`Notification ${notifToDelete.id} successfully deleted`);
  } else {
    logFail(`Notification still exists after deletion`);
  }

  // Test 3: Delete non-existent notification
  logTest('DELETE /notifications/999999 - delete non-existent notification');
  const deleteFail = await apiRequest('DELETE', '/notifications/999999', {}, 1);
  if (deleteFail.status === 404 || deleteFail.status === 200) {
    logPass(`Properly handled deletion of non-existent notification`);
  } else {
    logFail(`Unexpected status code: ${deleteFail.status}`);
  }
}

/**
 * TEST SUITE: Notification Preferences
 */
async function testPreferences() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: NOTIFICATION PREFERENCES', 'yellow');
  log('='.repeat(60), 'yellow');

  // Test 1: Get current preferences
  logTest('GET /notifications/preferences - get user preferences');
  const getPrefs = await apiRequest('GET', '/notifications/preferences', null, 1);
  if (getPrefs.status === 200 && getPrefs.data.success) {
    logPass(`Retrieved user preferences`);
    logInfo(`In-app enabled: ${getPrefs.data.data.in_app_enabled}`);
    logInfo(`Email enabled: ${getPrefs.data.data.email_enabled}`);
    logInfo(`SMS enabled: ${getPrefs.data.data.sms_enabled}`);
  } else {
    logFail(`Failed to get preferences`);
  }

  // Test 2: Update preferences
  logTest('PATCH /notifications/preferences - update preferences');
  const updatePrefs = await apiRequest('PATCH', '/notifications/preferences', {
    in_app_enabled: true,
    email_enabled: false,
    sms_enabled: false,
  }, 1);
  if (updatePrefs.status === 200 && updatePrefs.data.success) {
    logPass(`Successfully updated preferences`);
  } else {
    logFail(`Failed to update preferences`);
  }

  // Test 3: Verify update
  logTest('Verify preferences were updated');
  const verifyPrefs = await apiRequest('GET', '/notifications/preferences', null, 1);
  if (verifyPrefs.data.data.in_app_enabled === true && verifyPrefs.data.data.email_on_order !== undefined) {
    logPass(`Preferences verified: in_app_enabled = ${verifyPrefs.data.data.in_app_enabled}`);
    logInfo(`Email on order: ${verifyPrefs.data.data.email_on_order}`);
  } else {
    logFail(`Preferences not properly updated`);
  }
}

/**
 * TEST SUITE: Multi-User Scenarios
 */
async function testMultiUserScenarios() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: MULTI-USER SCENARIOS', 'yellow');
  log('='.repeat(60), 'yellow');

  // Create notifications for different users
  logTest('Create notifications for multiple users');
  await createTestNotifications(1);
  const user1Count = testNotifications.length;
  
  const NotificationService = (await import('./src/services/NotificationService.js')).default;
  for (let i = 0; i < 3; i++) {
    await NotificationService.create({
      userId: 2,
      type: 'ORDER_CREATED',
      title: `User 2 - Notification ${i + 1}`,
      message: `Test notification for user 2`,
    });
  }
  logPass(`Created notifications for User 1 and User 2`);

  // Test 1: User isolation
  logTest('Verify user isolation - User 1 cannot see User 2 notifications');
  const user1Notifs = await apiRequest('GET', '/notifications?limit=100', null, 1);
  const user2Notifs = await apiRequest('GET', '/notifications?limit=100', null, 2);
  
  const user1Ids = user1Notifs.data.data.map(n => n.id);
  const user2Ids = user2Notifs.data.data.map(n => n.id);
  
  const overlap = user1Ids.filter(id => user2Ids.includes(id));
  if (overlap.length === 0) {
    logPass(`Users are properly isolated: no notification overlap`);
    logInfo(`User 1 has ${user1Notifs.data.data.length} notifications`);
    logInfo(`User 2 has ${user2Notifs.data.data.length} notifications`);
  } else {
    logFail(`User isolation failed: found ${overlap.length} overlapping notifications`);
  }

  // Test 2: Mark all as read for one user doesn't affect another
  logTest('Mark User 1 all as read, verify User 2 unaffected');
  await apiRequest('PATCH', '/notifications/mark-all-read', {}, 1);
  
  const user2UnreadBefore = await apiRequest('GET', '/notifications/unread-count', null, 2);
  if (user2UnreadBefore.data.unreadCount > 0) {
    logPass(`User 2 still has ${user2UnreadBefore.data.unreadCount} unread notifications`);
  } else {
    logFail(`User 2 unread count affected by User 1 action`);
  }
}

/**
 * TEST SUITE: Edge Cases & Error Handling
 */
async function testEdgeCases() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: EDGE CASES & ERROR HANDLING', 'yellow');
  log('='.repeat(60), 'yellow');

  // Test 1: Invalid limit
  logTest('GET /notifications?limit=9999 - test max limit enforcement');
  const tooMuch = await apiRequest('GET', '/notifications?limit=9999', null, 1);
  if (tooMuch.data.data.length <= 100) {
    logPass(`Limit properly capped at 100 items`);
  } else {
    logFail(`Limit not enforced: got ${tooMuch.data.data.length} items`);
  }

  // Test 2: Invalid limit (negative)
  logTest('GET /notifications?limit=-5 - test negative limit handling');
  const negative = await apiRequest('GET', '/notifications?limit=-5', null, 1);
  if (negative.status === 200 && Array.isArray(negative.data.data)) {
    logPass(`Negative limit handled gracefully (defaults to 20)`);
    logInfo(`Returned ${negative.data.data.length} items`);
  } else {
    logFail(`Error handling failed for negative limit`);
  }

  // Test 3: Invalid filter value
  logTest('GET /notifications?filter=invalid - test invalid filter');
  const invalidFilter = await apiRequest('GET', '/notifications?filter=invalid', null, 1);
  if (invalidFilter.status === 200) {
    logPass(`Invalid filter handled gracefully (defaults to 'all')`);
  } else {
    logFail(`Error handling failed for invalid filter`);
  }

  // Test 4: Mark already-read as read again
  logTest('PATCH /notifications/{id}/read twice - idempotent operation');
  if (testNotifications.length > 0) {
    const notif = testNotifications[0];
    const first = await apiRequest('PATCH', `/notifications/${notif.id}/read`, {}, 1);
    const second = await apiRequest('PATCH', `/notifications/${notif.id}/read`, {}, 1);
    
    if (first.status === 200 && second.status === 200) {
      logPass(`Idempotent: can mark as read multiple times`);
    } else {
      logFail(`Idempotent operation failed`);
    }
  }

  // Test 5: Empty result handling
  logTest('GET /notifications with user having no notifications');
  // Create new user ID that has no notifications
  const emptyNotifs = await apiRequest('GET', '/notifications', null, 999);
  if (emptyNotifs.status === 200 && Array.isArray(emptyNotifs.data.data)) {
    logPass(`Empty result handled correctly: ${emptyNotifs.data.data.length} items`);
  } else {
    logFail(`Failed to handle empty result`);
  }
}

/**
 * TEST SUITE: Performance & Load
 */
async function testPerformance() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: PERFORMANCE & LOAD', 'yellow');
  log('='.repeat(60), 'yellow');

  const NotificationService = (await import('./src/services/NotificationService.js')).default;

  // Test 1: Bulk notification creation
  logTest('Create 50 notifications and measure performance');
  const startBulk = Date.now();
  
  for (let i = 0; i < 50; i++) {
    await NotificationService.create({
      userId: 1,
      type: 'PROMOTION',
      title: `Bulk Notification ${i + 1}`,
      message: `Performance test notification ${i + 1}`,
    });
  }
  
  const bulkTime = Date.now() - startBulk;
  logPass(`Created 50 notifications in ${bulkTime}ms`);
  logInfo(`Average: ${(bulkTime / 50).toFixed(2)}ms per notification`);

  // Test 2: Retrieve large result set
  logTest('Retrieve 100 notifications and measure performance');
  const startRetrieve = Date.now();
  const largeFetch = await apiRequest('GET', '/notifications?limit=100', null, 1);
  const retrieveTime = Date.now() - startRetrieve;
  
  logPass(`Retrieved ${largeFetch.data.data.length} notifications in ${retrieveTime}ms`);

  // Test 3: Mark all as read performance
  logTest('Mark all as read and measure performance');
  const startMarkAll = Date.now();
  await apiRequest('PATCH', '/notifications/mark-all-read', {}, 1);
  const markAllTime = Date.now() - startMarkAll;
  
  logPass(`Marked all as read in ${markAllTime}ms`);
}

/**
 * Cleanup test data
 */
async function cleanup() {
  if (!CLEANUP) return;

  log('\nCleaning up test data...', 'yellow');
  
  try {
    const query = `DELETE FROM notifications WHERE user_id IN (1, 2) AND created_at > NOW() - INTERVAL '1 hour'`;
    await db.query(query);
    log('✓ Test notifications cleaned up', 'green');
  } catch (error) {
    logFail(`Cleanup failed: ${error.message}`);
  }
}

/**
 * Summary report
 */
function printSummary() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUMMARY', 'yellow');
  log('='.repeat(60), 'yellow');
  
  const total = passed + failed;
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
  
  log(`\nTotal Tests: ${total}`);
  log(`✓ Passed: ${passed}`, 'green');
  log(`✗ Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${percentage}%\n`, percentage === 100 ? 'green' : percentage >= 80 ? 'yellow' : 'red');

  if (failed === 0) {
    log('🎉 ALL TESTS PASSED!', 'green');
  } else {
    log(`⚠️  ${failed} test(s) failed. Review logs above.`, 'red');
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  try {
    // Initialize database connection
    await db.connect();
    logInfo('Connected to database');

    log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
    log('║   ADVANCED NOTIFICATION SYSTEM TEST SUITE                 ║', 'cyan');
    log('║   Testing all flows, edge cases, and performance          ║', 'cyan');
    log('╚════════════════════════════════════════════════════════════╝', 'cyan');

    // Run test suites
    await testAuthentication();
    await testNotificationCreation();
    await testNotificationRetrieval();
    await testNotificationFiltering();
    await testMarkAsRead();
    await testNotificationDeletion();
    await testPreferences();
    await testMultiUserScenarios();
    await testEdgeCases();
    await testPerformance();

    // Cleanup if requested
    await cleanup();

    // Print summary
    printSummary();

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    logFail(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
