import db from './src/db/postgres.js';

async function checkLatestOrder() {
  try {
    console.log('[Investigation] Checking latest order and notifications...\n');
    
    // Get the most recent order
    const latestOrder = await db.queryOne(`
      SELECT id, user_id, order_number, total_amount, current_status, ordered_at 
      FROM orders 
      ORDER BY ordered_at DESC 
      LIMIT 1
    `, []);
    
    if (!latestOrder) {
      console.log('❌ No orders found in database');
      process.exit(1);
    }
    
    console.log('Latest Order:');
    console.table([latestOrder]);
    
    // Check if NEW_ORDER notification was created for this order
    console.log('\n[Investigation] Checking for NEW_ORDER notification for this order...');
    const orderNotif = await db.queryMany(`
      SELECT id, user_id, type, title, message, created_at 
      FROM notifications 
      WHERE type = 'NEW_ORDER' AND related_entity_id = $1
      ORDER BY created_at DESC
    `, [latestOrder.id]);
    
    console.log(`Found ${orderNotif.length} NEW_ORDER notifications for order ${latestOrder.id}:`);
    if (orderNotif.length > 0) {
      console.table(orderNotif);
      console.log('✅ Notifications were created successfully!');
    } else {
      console.log('❌ NO notifications found for this order!');
      console.log('\n🔍 This means the notification code is NOT being executed or is FAILING silently.');
    }
    
    // Check ALL NEW_ORDER notifications
    console.log('\n[Investigation] All NEW_ORDER notifications in database:');
    const allNewOrder = await db.queryMany(`
      SELECT id, user_id, type, title, related_entity_id, created_at 
      FROM notifications 
      WHERE type = 'NEW_ORDER'
      ORDER BY created_at DESC
      LIMIT 10
    `, []);
    
    console.log(`Total NEW_ORDER notifications: ${allNewOrder.length}`);
    console.table(allNewOrder);
    
    // Check who created the order
    console.log('\n[Investigation] User who created the order:');
    const user = await db.queryOne(`
      SELECT id, email, first_name, last_name, role 
      FROM users 
      WHERE id = $1
    `, [latestOrder.user_id]);
    console.table([user]);
    
    // Check admin users and preferences
    console.log('\n[Investigation] Admin users and their notification preferences:');
    const admins = await db.queryMany(`
      SELECT u.id, u.email, u.is_active, np.in_app_enabled
      FROM users u
      LEFT JOIN notification_preferences np ON u.id = np.user_id
      WHERE u.role = 'admin' AND u.deleted_at IS NULL
      ORDER BY u.id
    `, []);
    console.table(admins);
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('INVESTIGATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`Latest Order ID: ${latestOrder.id}`);
    console.log(`Order Number: ${latestOrder.order_number}`);
    console.log(`Created: ${latestOrder.ordered_at}`);
    console.log(`NEW_ORDER notifications for this order: ${orderNotif.length} ${orderNotif.length === 0 ? '❌ PROBLEM!' : '✅ OK'}`);
    console.log(`Active admin users: ${admins.length}`);
    console.log(`Admins with in_app_enabled: ${admins.filter(a => a.in_app_enabled).length}`);
    
    if (orderNotif.length === 0) {
      console.log('\n🔴 ROOT CAUSE: Notification code in orders-v2.js is NOT executing!');
      console.log('Possible reasons:');
      console.log('1. Server crash/restart during order creation');
      console.log('2. Error being caught silently in try-catch');
      console.log('3. NotificationService import failing');
      console.log('4. Database connection issue during notification');
      console.log('5. Code not reaching the notification block');
      console.log('\n📋 Next step: Check server logs for [Notification] entries');
    }
    
  } catch (error) {
    console.error('[Investigation] Error:', error);
  } finally {
    process.exit(0);
  }
}

checkLatestOrder();
