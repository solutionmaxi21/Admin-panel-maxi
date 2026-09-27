import db from './src/db/postgres.js';
import NotificationService from './src/services/NotificationService.js';

async function testNotifyAdmins() {
  try {
    console.log('[Test] Testing notifyAdmins directly...');
    
    const result = await NotificationService.notifyAdmins({
      type: 'NEW_ORDER',
      title: 'Test Order Notification',
      message: 'This is a test notification',
      actionUrl: '/orders/123',
      relatedEntityType: 'order',
      relatedEntityId: 123
    });
    
    console.log('Result from notifyAdmins:', result);
    
    // Now check if notifications were created
    console.log('\n[Test] Checking if notifications were created...');
    const newOrderNotifs = await db.queryMany(
      `SELECT id, user_id, type, title, message, created_at 
       FROM notifications 
       WHERE type = 'NEW_ORDER' AND title LIKE '%Test Order%'
       ORDER BY created_at DESC`,
      []
    );
    
    console.log(`Found ${newOrderNotifs.length} test notifications:`);
    console.table(newOrderNotifs);
    
  } catch (error) {
    console.error('[Test] Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

testNotifyAdmins();
