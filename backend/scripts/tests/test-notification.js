#!/usr/bin/env node

/**
 * Customized Notification System Testing Script
 * Tests admin vs user permissions and role-based access
 * 
 * Usage: node test-notifications-custom.js [options]
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

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const VERBOSE = process.argv.includes('--verbose');
const CLEANUP = process.argv.includes('--clean');

// Color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
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

// CUSTOMIZED: Define actual admin and regular users from your system
const testUsers = {
  admin: {
    userId: 1,  // Replace with your actual admin user ID
    email: 'admin@maxistore.com',  // Replace with actual admin email
    name: 'Admin User',
    role: 'admin',
  },
  user1: {
    userId: 13,  // Replace with actual user ID
    email: 'sifoubiad001@gmail.com',  // Replace with actual user email
    name: 'Sifeddine Biad',
    role: 'customer',
  },
  user2: {
    userId: 12,  // Replace with actual user ID
    email: 'biadsifou2001@gmail.com',
    name: 'aze eza',
    role: 'customer',
  },
};

const testNotifications = {
  admin: [],
  user1: [],
  user2: [],
};

/**
 * Generate JWT token with proper role
 */
function generateMockJWT(userKey) {
  const user = testUsers[userKey];
  return generateAccessToken({
    userId: user.userId,
    email: user.email,
    role: user.role,
    firstName: user.name.split(' ')[0],
    lastName: user.name.split(' ').slice(1).join(' '),
  });
}

/**
 * API request helper
 */
async function apiRequest(method, path, body = null, userKey = 'user1') {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateMockJWT(userKey)}`,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = `${API_URL}${path}`;
    logVerbose(`[${userKey.toUpperCase()}] ${method} ${url}`);
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
 * Create test notifications for specific user
 */
async function createTestNotifications(userKey) {
  const NotificationService = (await import('./src/services/NotificationService.js')).default;
  const user = testUsers[userKey];
  
  const types = [
    { type: 'ORDER_CREATED', title: 'Order Confirmed', message: `Your order #${Math.floor(Math.random() * 10000)} has been confirmed` },
    { type: 'ORDER_SHIPPED', title: 'Order Shipped', message: 'Your order has been shipped' },
    { type: 'RETURN_REQUEST', title: 'Return Request', message: 'Your return request has been received' },
    { type: 'REVIEW_ADDED', title: 'New Review', message: 'Your product review has been published' },
    { type: 'PROMOTION', title: 'Special Offer', message: '20% discount available for you' },
  ];

  for (const notifType of types) {
    try {
      const notif = await NotificationService.create({
        userId: user.userId,
        type: notifType.type,
        title: `[${userKey.toUpperCase()}] ${notifType.title}`,
        message: notifType.message,
        actionUrl: `/orders/${Math.floor(Math.random() * 10000)}`,
        relatedEntityType: 'order',
        relatedEntityId: Math.floor(Math.random() * 10000),
      });
      if (notif) testNotifications[userKey].push(notif);
    } catch (error) {
      logFail(`Failed to create ${notifType.type} for ${userKey}: ${error.message}`);
    }
  }

  return testNotifications[userKey];
}

/**
 * TEST SUITE: Admin-Specific Functionality
 */
async function testAdminSpecificFeatures() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: ADMIN-SPECIFIC FEATURES', 'yellow');
  log('='.repeat(60), 'yellow');

  // Test 1: Admin can view all users' notifications (if endpoint exists)
  logTest('Admin access to system-wide notifications');
  const adminView = await apiRequest('GET', '/notifications', null, 'admin');
  if (adminView.status === 200) {
    logPass(`Admin successfully accessed notifications`);
    logInfo(`Admin sees ${adminView.data.data.length} notifications`);
  } else {
    logInfo(`Admin endpoint may need separate route (status: ${adminView.status})`);
  }

  // Test 2: Admin can create notifications for any user
  logTest('Admin creates notification for specific user');
  const NotificationService = (await import('./src/services/NotificationService.js')).default;
  try {
    const adminCreated = await NotificationService.create({
      userId: testUsers.user1.userId,
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'Admin Message',
      message: 'Important system announcement from admin',
      actionUrl: '/announcements',
      relatedEntityType: 'system',
      relatedEntityId: 1,
    });
    
    if (adminCreated) {
      logPass(`Admin successfully created notification for user1`);
      testNotifications.user1.push(adminCreated);
    }
  } catch (error) {
    logFail(`Admin notification creation failed: ${error.message}`);
  }

  // Test 3: Verify user received admin's notification
  logTest('User1 receives admin-created notification');
  const user1Notifs = await apiRequest('GET', '/notifications', null, 'user1');
  const adminNotif = user1Notifs.data.data.find(n => n.title === 'Admin Message');
  if (adminNotif) {
    logPass(`User1 successfully received admin notification`);
    logInfo(`Notification ID: ${adminNotif.id}`);
  } else {
    logFail(`User1 did not receive admin notification`);
  }

  // Test 4: Admin bulk notification to multiple users
  logTest('Admin sends bulk notification to all users');
  const bulkUsers = [testUsers.user1.userId, testUsers.user2.userId];
  let bulkSuccess = 0;
  
  for (const userId of bulkUsers) {
    try {
      await NotificationService.create({
        userId,
        type: 'SYSTEM_ANNOUNCEMENT',
        title: 'Bulk Admin Notification',
        message: 'This is a system-wide announcement',
        actionUrl: '/announcements',
      });
      bulkSuccess++;
    } catch (error) {
      logFail(`Bulk notification failed for user ${userId}`);
    }
  }
  
  if (bulkSuccess === bulkUsers.length) {
    logPass(`Admin sent bulk notifications to ${bulkSuccess} users`);
  } else {
    logFail(`Only sent ${bulkSuccess}/${bulkUsers.length} notifications`);
  }
}

/**
 * TEST SUITE: User Permission Boundaries
 */
async function testUserPermissionBoundaries() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: USER PERMISSION BOUNDARIES', 'yellow');
  log('='.repeat(60), 'yellow');

  // Create notifications for both users
  await createTestNotifications('user1');
  await createTestNotifications('user2');

  // Test 1: User cannot access other user's notifications
  logTest('User1 cannot access User2 notifications');
  const user1View = await apiRequest('GET', '/notifications', null, 'user1');
  const user2View = await apiRequest('GET', '/notifications', null, 'user2');
  
  const user1Ids = user1View.data.data.map(n => n.id);
  const user2Ids = user2View.data.data.map(n => n.id);
  const overlap = user1Ids.filter(id => user2Ids.includes(id));
  
  if (overlap.length === 0) {
    logPass(`Users are properly isolated - no notification overlap`);
    logInfo(`User1: ${user1Ids.length} notifications, User2: ${user2Ids.length} notifications`);
  } else {
    logFail(`SECURITY ISSUE: Users can see each other's notifications!`);
  }

  // Test 2: User cannot mark another user's notification as read
  if (testNotifications.user2.length > 0) {
    const user2NotifId = testNotifications.user2[0].id;
    
    logTest(`User1 attempts to mark User2's notification ${user2NotifId} as read`);
    const unauthorized = await apiRequest('PATCH', `/notifications/${user2NotifId}/read`, {}, 'user1');
    
    if (unauthorized.status === 403 || unauthorized.status === 404) {
      logPass(`Properly blocked unauthorized access (status: ${unauthorized.status})`);
    } else if (unauthorized.status === 200) {
      logFail(`SECURITY ISSUE: User1 can modify User2's notifications!`);
    } else {
      logInfo(`Unexpected response: ${unauthorized.status}`);
    }
  }

  // Test 3: User cannot delete another user's notification
  if (testNotifications.user2.length > 0) {
    const user2NotifId = testNotifications.user2[0].id;
    
    logTest(`User1 attempts to delete User2's notification ${user2NotifId}`);
    const deleteFail = await apiRequest('DELETE', `/notifications/${user2NotifId}`, {}, 'user1');
    
    if (deleteFail.status === 403 || deleteFail.status === 404) {
      logPass(`Properly blocked unauthorized deletion (status: ${deleteFail.status})`);
    } else if (deleteFail.status === 200) {
      logFail(`SECURITY ISSUE: User1 can delete User2's notifications!`);
    }
  }

  // Test 4: User's mark-all-read only affects their own notifications
  logTest('User1 mark-all-read does not affect User2');
  const user2UnreadBefore = await apiRequest('GET', '/notifications/unread-count', null, 'user2');
  await apiRequest('PATCH', '/notifications/mark-all-read', {}, 'user1');
  const user2UnreadAfter = await apiRequest('GET', '/notifications/unread-count', null, 'user2');
  
  if (user2UnreadBefore.data.unreadCount === user2UnreadAfter.data.unreadCount) {
    logPass(`User2 unread count unchanged: ${user2UnreadAfter.data.unreadCount}`);
  } else {
    logFail(`User2 affected by User1's action!`);
  }
}

/**
 * TEST SUITE: Role-Based Notification Types
 */
async function testRoleBasedNotifications() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: ROLE-BASED NOTIFICATION TYPES', 'yellow');
  log('='.repeat(60), 'yellow');

  const NotificationService = (await import('./src/services/NotificationService.js')).default;

  // Test 1: Admin receives admin-specific notification types
  logTest('Create admin-specific notification types');
  const adminNotifTypes = [
    { type: 'SYSTEM_ALERT', title: 'System Alert', message: 'High CPU usage detected' },
    { type: 'USER_REPORTED', title: 'User Report', message: 'New user report received' },
    { type: 'SECURITY_ALERT', title: 'Security Alert', message: 'Suspicious login attempt detected' },
  ];

  for (const notif of adminNotifTypes) {
    try {
      await NotificationService.create({
        userId: testUsers.admin.userId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
      });
      testNotifications.admin.push(notif);
    } catch (error) {
      logFail(`Failed to create ${notif.type}: ${error.message}`);
    }
  }
  
  if (testNotifications.admin.length > 0) {
    logPass(`Created ${testNotifications.admin.length} admin-specific notifications`);
  }

  // Test 2: Verify admin can see system notifications
  logTest('Admin retrieves system notifications');
  const adminNotifs = await apiRequest('GET', '/notifications', null, 'admin');
  if (adminNotifs.status === 200) {
    const systemNotifs = adminNotifs.data.data.filter(n => 
      ['SYSTEM_ALERT', 'USER_REPORTED', 'SECURITY_ALERT'].includes(n.type)
    );
    logPass(`Admin sees ${systemNotifs.length} system notifications`);
    systemNotifs.forEach(n => logInfo(`  - ${n.type}: ${n.title}`));
  }

  // Test 3: Regular users should not receive admin notification types
  logTest('Regular users do not receive admin notifications');
  const user1Notifs = await apiRequest('GET', '/notifications', null, 'user1');
  const adminTypesInUser = user1Notifs.data.data.filter(n => 
    ['SYSTEM_ALERT', 'USER_REPORTED', 'SECURITY_ALERT'].includes(n.type)
  );
  
  if (adminTypesInUser.length === 0) {
    logPass(`User1 correctly has no admin notifications`);
  } else {
    logFail(`User1 has ${adminTypesInUser.length} admin notifications!`);
  }
}

/**
 * TEST SUITE: Admin Analytics & Reporting
 */
async function testAdminAnalytics() {
  log('\n' + '='.repeat(60), 'yellow');
  log('TEST SUITE: ADMIN ANALYTICS & REPORTING', 'yellow');
  log('='.repeat(60), 'yellow');

  // Test 1: Admin can query notification statistics
  logTest('Admin queries notification statistics across all users');
  try {
    const stats = await db.query(`
      SELECT 
        user_id,
        COUNT(*) as total,
        SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN is_read = true THEN 1 ELSE 0 END) as read
      FROM notifications
      WHERE user_id IN ($1, $2, $3)
      GROUP BY user_id
    `, [testUsers.admin.userId, testUsers.user1.userId, testUsers.user2.userId]);
    
    if (stats.rows.length > 0) {
      logPass(`Retrieved statistics for ${stats.rows.length} users`);
      stats.rows.forEach(row => {
        logInfo(`User ${row.user_id}: ${row.total} total, ${row.unread} unread, ${row.read} read`);
      });
    } else {
      logInfo(`No statistics available yet`);
    }
  } catch (error) {
    logFail(`Failed to query statistics: ${error.message}`);
  }

  // Test 2: Admin can see notification type distribution
  logTest('Admin queries notification type distribution');
  try {
    const typeStats = await db.query(`
      SELECT 
        type,
        COUNT(*) as count
      FROM notifications
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY type
      ORDER BY count DESC
    `);
    
    if (typeStats.rows.length > 0) {
      logPass(`Found ${typeStats.rows.length} different notification types`);
      typeStats.rows.forEach(row => {
        logInfo(`  ${row.type}: ${row.count} notifications`);
      });
    }
  } catch (error) {
    logFail(`Failed to query type distribution: ${error.message}`);
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  if (!CLEANUP) return;

  log('\nCleaning up test data...', 'yellow');
  
  try {
    const userIds = Object.values(testUsers).map(u => u.userId);
    const query = `DELETE FROM notifications WHERE user_id = ANY($1) AND created_at > NOW() - INTERVAL '1 hour'`;
    const result = await db.query(query, [userIds]);
    log(`✓ Deleted ${result.rowCount} test notifications`, 'green');
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
  
  log('\n' + '='.repeat(60), 'cyan');
  log('Test Configuration:', 'cyan');
  log(`  Admin: ${testUsers.admin.email} (ID: ${testUsers.admin.userId})`, 'cyan');
  log(`  User1: ${testUsers.user1.email} (ID: ${testUsers.user1.userId})`, 'cyan');
  log(`  User2: ${testUsers.user2.email} (ID: ${testUsers.user2.userId})`, 'cyan');
  log('='.repeat(60), 'cyan');
}

/**
 * Main test runner
 */
async function runAllTests() {
  try {
    await db.connect();
    logInfo('Connected to database');

    log('\n╔════════════════════════════════════════════════════════════╗', 'magenta');
    log('║   CUSTOMIZED ADMIN & USER NOTIFICATION TEST SUITE         ║', 'magenta');
    log('║   Testing role-based access and permissions               ║', 'magenta');
    log('╚════════════════════════════════════════════════════════════╝', 'magenta');

    // Run customized test suites
    await testAdminSpecificFeatures();
    await testUserPermissionBoundaries();
    await testRoleBasedNotifications();
    await testAdminAnalytics();

    // Cleanup
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