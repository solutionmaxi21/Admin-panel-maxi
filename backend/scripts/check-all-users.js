import db from '../src/db/postgres.js';

async function checkAllUsers() {
  try {
    const count = await db.queryOne('SELECT COUNT(*) as total FROM users');
    console.log('Total users in database:', count.total);
    
    const admin = await db.queryOne("SELECT id, email, username, role FROM users WHERE email = 'admin@maxistore.com'");
    console.log('Admin user:', admin);
    
    const allUsers = await db.queryMany('SELECT id, email, username, role FROM users ORDER BY id');
    console.log('\nAll users:');
    allUsers.forEach(u => console.log(`  ${u.id}: ${u.email} (${u.role})`));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllUsers();
