// Set up order 14 with complete shipping data
import db from '../src/db/postgres.js';

async function setupOrder() {
  try {
    const user = await db.queryOne('SELECT * FROM users WHERE id = 13');
    console.log('User:', user.email, user.phone);
    
    // Update order with phone and shipping data
    await db.query(`
      UPDATE orders 
      SET customer_phone = $1::text,
          shipping_snapshot = jsonb_build_object(
            'firstName', $2::text,
            'lastName', $3::text,
            'phone', $1::text,
            'address', '123 Test Street',
            'commune_id', 1601,
            'isStopDesk', false
          )
      WHERE id = 14
    `, [user.phone, user.first_name, user.last_name]);
    
    const order = await db.queryOne(`
      SELECT id, order_number, customer_phone, shipping_snapshot, commune_id
      FROM orders WHERE id = 14
    `);
    
    console.log('\n✅ Order 14 updated:');
    console.log('customer_phone:', order.customer_phone);
    console.log('commune_id:', order.commune_id);
    console.log('shipping_snapshot:', JSON.stringify(order.shipping_snapshot, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupOrder();
