// Reduce order 14 total for testing
import db from '../src/db/postgres.js';

async function reduceOrderTotal() {
  try {
    // Update order to have a reasonable total under Guepex limit
    await db.query(`
      UPDATE orders 
      SET total_amount = 85000,
          subtotal = 75000,
          shipping_cost = 10000,
          updated_at = NOW()
      WHERE id = 14
    `);
    
    const order = await db.queryOne(`
      SELECT id, order_number, total_amount, subtotal, shipping_cost, payment_method
      FROM orders WHERE id = 14
    `);
    
    console.log('✅ Order 14 updated for testing:');
    console.table(order);
    console.log('\nThis is under the 150,000 DA Guepex COD limit.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

reduceOrderTotal();
