// Set up order 14 with test shipping data
import db from '../src/db/postgres.js';

async function setupTestOrder() {
  try {
    // Get a valid commune (let's use Algiers center)
    const commune = await db.queryOne(`
      SELECT id, name, wilaya_id 
      FROM communes 
      WHERE wilaya_id = 16 
      LIMIT 1
    `);
    
    console.log('Using commune:', commune);
    
    // Update order 14 with commune_id
    await db.query(`
      UPDATE orders 
      SET commune_id = $1,
          current_status = 'pending',
          phone_confirmation_status = 'pending',
          updated_at = NOW()
      WHERE id = 14
    `, [commune.id]);
    
    console.log('✅ Order 14 updated with commune_id:', commune.id);
    
    // Verify
    const order = await db.queryOne(`
      SELECT o.id, o.order_number, o.commune_id, o.current_status, o.phone_confirmation_status,
             c.name as commune_name, c.wilaya_id
      FROM orders o
      LEFT JOIN communes c ON o.commune_id = c.id
      WHERE o.id = 14
    `);
    
    console.log('\nOrder 14 details:');
    console.table(order);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

setupTestOrder();
