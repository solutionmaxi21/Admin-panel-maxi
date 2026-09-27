// Fix Order 15 for batch testing
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:sm2025mf@localhost:5432/maxistore'
});

async function fixOrder15() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update Order 15
    const result = await client.query(`
      UPDATE orders 
      SET 
        phone_confirmation_status = 'confirmed',
        commune_id = 1601,
        updated_at = NOW()
      WHERE id = 15
      RETURNING id, order_number, current_status, phone_confirmation_status, commune_id
    `);
    
    console.log('✅ Order 15 updated:');
    console.table(result.rows);
    
    // Add history entry
    await client.query(`
      INSERT INTO order_history (order_id, status, notes, changed_by, changed_at)
      VALUES (15, 'processing', 'Phone confirmation set and commune assigned for batch shipment testing', 1, NOW())
    `);
    
    // Verify both orders
    const check = await client.query(`
      SELECT 
        id,
        order_number,
        current_status,
        phone_confirmation_status,
        tracking_number,
        commune_id,
        CASE 
          WHEN tracking_number IS NOT NULL THEN '❌ Already shipped'
          WHEN phone_confirmation_status != 'confirmed' THEN '❌ Not confirmed'
          WHEN commune_id IS NULL THEN '❌ No commune'
          ELSE '✅ Ready to ship'
        END as status_check
      FROM orders 
      WHERE id IN (14, 15)
      ORDER BY id
    `);
    
    console.log('\n📊 Orders Status:');
    console.table(check.rows);
    
    await client.query('COMMIT');
    
    console.log('\n🎯 Next Steps:');
    if (check.rows[0]?.tracking_number) {
      console.log('1. Run "Reset Order 14" in Postman (0. Test Data Setup folder)');
    } else {
      console.log('1. Order 14: ✅ Ready to ship');
    }
    console.log('2. Order 15: ✅ Now ready for batch test!');
    console.log('3. Run "Create Batch Shipments" in Postman');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

fixOrder15();
