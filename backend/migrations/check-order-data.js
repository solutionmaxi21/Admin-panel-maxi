// Check what data orders actually have
import db from '../src/db/postgres.js';

async function check() {
  try {
    const orders = await db.query(`
      SELECT id, order_number, 
             shipping_snapshot
      FROM orders 
      WHERE id IN (14, 15)
    `);
    
    console.log('Orders data:');
    orders.rows.forEach(order => {
      console.log(`\n=== Order ${order.order_number} ===`);
      console.log('shipping_snapshot:', JSON.stringify(order.shipping_snapshot, null, 2));
      console.log('shipping_address:', order.shipping_address);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

check();
