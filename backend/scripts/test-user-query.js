import db from '../src/db/postgres.js';

async function testUserQuery() {
  try {
    console.log('Testing user query with JOINs...\n');
    
    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.first_name, 
        u.last_name,
        u.full_name,
        u.phone, 
        u.role, 
        u.is_active, 
        u.email_verified, 
        u.created_at, 
        u.last_login,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(CASE WHEN o.current_status = 'delivered' THEN o.total_amount ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id AND o.deleted_at IS NULL
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.username, u.email, u.first_name, u.last_name, u.full_name, 
               u.phone, u.role, u.is_active, u.email_verified, u.created_at, u.last_login
      ORDER BY u.created_at DESC
      LIMIT 5
    `;
    
    const users = await db.queryMany(query);
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
      console.log(`\n  ID: ${u.id}`);
      console.log(`  Email: ${u.email}`);
      console.log(`  Full Name: ${u.full_name}`);
      console.log(`  Total Orders: ${u.total_orders}`);
      console.log(`  Total Spent: ${u.total_spent}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Query Error:', error.message);
    console.error('Full Error:', error);
    process.exit(1);
  }
}

testUserQuery();
