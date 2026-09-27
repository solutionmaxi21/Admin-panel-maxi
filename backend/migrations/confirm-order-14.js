// Confirm order 14 for testing
import db from '../src/db/postgres.js';

async function confirmOrder() {
  try {
    // Update order status
    await db.query(`
      UPDATE orders
      SET phone_confirmation_status = 'confirmed',
          updated_at = NOW()
      WHERE id = 14
    `);

    const order = await db.queryOne(`
      SELECT id, order_number, current_status, phone_confirmation_status
      FROM orders WHERE id = 14
    `);

    console.log('✅ Order 14 confirmed:');
    console.table(order);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

confirmOrder();
