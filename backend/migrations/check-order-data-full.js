// Check order 14 full data
import db from '../src/db/postgres.js';

async function checkOrder() {
  try {
    const order = await db.queryOne(`
      SELECT o.*, 
             u.email, u.first_name, u.last_name, u.phone
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = 14
    `);
    
    console.log('Order 14 details:');
    console.log('user_id:', order.user_id);
    console.log('customer_phone:', order.customer_phone);
    console.log('user phone:', order.phone);
    console.log('shipping_snapshot:', order.shipping_snapshot);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkOrder();
