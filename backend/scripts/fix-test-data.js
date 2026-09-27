// Fix all test data for Guepex API testing
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:sm2025mf@localhost:5432/maxistore'
});

async function fixTestData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // ============================================
    // 1. Fix Order 15 - Add shipping snapshot
    // ============================================
    console.log('📦 Fixing Order 15...');
    
    const order15 = await client.query(`
      SELECT o.*, u.phone, u.first_name, u.last_name, u.email,
             c.name as commune_name, w.name as wilaya_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN communes c ON o.commune_id = c.id
      LEFT JOIN wilayas w ON c.wilaya_id = w.id
      WHERE o.id = 15
    `);
    
    if (order15.rows.length === 0) {
      console.log('❌ Order 15 not found');
      return;
    }
    
    const order = order15.rows[0];
    
    // Create shipping snapshot for Order 15
    const shippingSnapshot = {
      customer: {
        firstName: order.first_name,
        lastName: order.last_name,
        phone: order.phone,
        email: order.email
      },
      address: {
        street: order.shipping_address || '123 Test Street',
        commune: order.commune_name || 'Alger Centre',
        wilaya: order.wilaya_name || 'Alger',
        communeId: order.commune_id || 1601
      }
    };
    
    await client.query(`
      UPDATE orders 
      SET shipping_snapshot = $1,
          updated_at = NOW()
      WHERE id = 15
    `, [JSON.stringify(shippingSnapshot)]);
    
    console.log('✅ Order 15 updated with shipping snapshot');
    
    // ============================================
    // 2. Fix Return - Approve it
    // ============================================
    console.log('\n📮 Fixing Return status...');
    
    const returns = await client.query(`
      SELECT id, return_number, status 
      FROM returns 
      WHERE id = 1
    `);
    
    if (returns.rows.length > 0) {
      const ret = returns.rows[0];
      console.log(`Return ${ret.return_number}: ${ret.status}`);
      
      if (ret.status === 'requested') {
        await client.query(`
          UPDATE returns 
          SET status = 'approved'
          WHERE id = 1
        `);
        console.log('✅ Return approved');
      } else {
        console.log(`✅ Return already ${ret.status}`);
      }
    } else {
      console.log('⚠️ No return with id=1 found');
    }
    
    // ============================================
    // 3. Verify all test data
    // ============================================
    console.log('\n📊 Test Data Status:');
    
    const verification = await client.query(`
      SELECT 
        id,
        order_number,
        current_status,
        phone_confirmation_status,
        tracking_number,
        commune_id,
        shipping_snapshot IS NOT NULL as has_shipping_data,
        CASE 
          WHEN tracking_number IS NOT NULL THEN '⚠️ Has tracking - run Reset'
          WHEN phone_confirmation_status != 'confirmed' THEN '❌ Not confirmed'
          WHEN commune_id IS NULL THEN '❌ No commune'
          WHEN shipping_snapshot IS NULL THEN '❌ No shipping data'
          ELSE '✅ Ready to ship'
        END as status
      FROM orders 
      WHERE id IN (14, 15)
      ORDER BY id
    `);
    
    console.table(verification.rows);
    
    const returnCheck = await client.query(`
      SELECT id, return_number, status,
        CASE 
          WHEN status = 'approved' THEN '✅ Ready for pickup'
          WHEN status = 'requested' THEN '❌ Needs approval'
          ELSE '⚠️ ' || status
        END as status_check
      FROM returns 
      WHERE id = 1
    `);
    
    if (returnCheck.rows.length > 0) {
      console.log('\n📦 Return Status:');
      console.table(returnCheck.rows);
    }
    
    await client.query('COMMIT');
    
    console.log('\n🎯 Next Steps in Postman:');
    console.log('1. Reset Order 14 (if has tracking)');
    console.log('2. Create Batch Shipments → Should ship both orders now!');
    console.log('3. Schedule Return Pickup → Should work now!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

fixTestData();
