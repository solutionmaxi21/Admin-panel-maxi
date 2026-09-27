// Test script to verify order items are not duplicated
import dotenv from 'dotenv';
dotenv.config();

import db from './src/db/postgres.js';

async function testOrderDuplication() {
  try {
    console.log('🧪 Testing order item duplication fix...\n');

    // Get a sample order with items
    const ordersQuery = `
      SELECT o.id, o.order_number, 
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
             (SELECT COUNT(*) FROM order_history WHERE order_id = o.id) as history_count
      FROM orders o
      WHERE o.deleted_at IS NULL
      ORDER BY o.ordered_at DESC
      LIMIT 5
    `;
    
    const orders = await db.queryMany(ordersQuery);
    
    if (orders.length === 0) {
      console.log('❌ No orders found in database');
      process.exit(1);
    }

    console.log(`Found ${orders.length} orders to test:\n`);
    
    for (const order of orders) {
      console.log(`Order #${order.order_number}`);
      console.log(`  - Expected items: ${order.item_count}`);
      console.log(`  - Expected history: ${order.history_count}`);
      
      // Test the query that was fixed
      const testQuery = `
        SELECT 
          o.id,
          o.order_number,
          (
            SELECT json_agg(
              jsonb_build_object(
                'id', oi.id,
                'productId', oi.product_id,
                'quantity', oi.quantity
              ) ORDER BY oi.id
            )
            FROM order_items oi
            WHERE oi.order_id = o.id
          ) as items,
          (
            SELECT json_agg(
              jsonb_build_object(
                'status_history_id', oh.id,
                'status', oh.status
              ) ORDER BY oh.changed_at DESC
            )
            FROM order_history oh
            WHERE oh.order_id = o.id
          ) as history
        FROM orders o
        WHERE o.id = $1
      `;
      
      const result = await db.queryOne(testQuery, [order.id]);
      
      const actualItemCount = result.items ? result.items.length : 0;
      const actualHistoryCount = result.history ? result.history.length : 0;
      
      console.log(`  - Actual items returned: ${actualItemCount}`);
      console.log(`  - Actual history returned: ${actualHistoryCount}`);
      
      if (actualItemCount !== order.item_count) {
        console.log(`  ❌ FAILED: Items mismatch! Expected ${order.item_count}, got ${actualItemCount}`);
      } else {
        console.log(`  ✅ PASSED: Items count correct`);
      }
      
      if (actualHistoryCount !== order.history_count) {
        console.log(`  ❌ FAILED: History mismatch! Expected ${order.history_count}, got ${actualHistoryCount}`);
      } else {
        console.log(`  ✅ PASSED: History count correct`);
      }
      
      console.log('');
    }
    
    console.log('✅ Test complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testOrderDuplication();
