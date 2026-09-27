import db from './src/db/postgres.js';

async function testNotificationFlow() {
  try {
    console.log('[Test] Getting latest orders...');
    const orders = await db.queryMany(
      `SELECT id, user_id, order_number, total_amount, ordered_at 
       FROM orders 
       ORDER BY ordered_at DESC 
       LIMIT 5`,
      []
    );
    console.log('Latest 5 orders:');
    console.table(orders);
    
    if (orders.length > 0) {
      const latestOrder = orders[0];
      console.log(`\n[Test] Checking NEW_ORDER notifications for order ${latestOrder.order_number}...`);
      
      const newOrderNotifs = await db.queryMany(
        `SELECT id, user_id, type, title, message, created_at 
         FROM notifications 
         WHERE type = 'NEW_ORDER' AND related_entity_id = $1 
         ORDER BY created_at DESC`,
        [latestOrder.id]
      );
      
      console.log(`Found ${newOrderNotifs.length} NEW_ORDER notifications for order ${latestOrder.id}`);
      console.table(newOrderNotifs);
      
      if (newOrderNotifs.length === 0) {
        console.log('\n⚠️ NO NEW_ORDER notifications found! This is the issue!');
      }
    }
    
    console.log('\n[Test] Checking all NEW_ORDER notifications in database...');
    const allNewOrders = await db.queryMany(
      `SELECT id, user_id, type, title, message, created_at 
       FROM notifications 
       WHERE type = 'NEW_ORDER' 
       ORDER BY created_at DESC 
       LIMIT 10`,
      []
    );
    console.log(`Total NEW_ORDER notifications: ${allNewOrders.length}`);
    console.table(allNewOrders);
    
  } catch (error) {
    console.error('[Test] Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

testNotificationFlow();
