import db from './src/db/postgres.js';

async function checkAdminPassword() {
  try {
    const result = await db.query(
      `SELECT id, email, password_hash, role 
       FROM users 
       WHERE email = $1 AND deleted_at IS NULL`,
      ['admin@maxistore.com']
    );
    
    if (result.rows.length > 0) {
      const admin = result.rows[0];
      console.log('Admin found:');
      console.log('- ID:', admin.id);
      console.log('- Email:', admin.email);
      console.log('- Role:', admin.role);
      console.log('- Has password hash:', admin.password_hash ? 'YES' : 'NO');
      console.log('- Password hash (first 50 chars):', admin.password_hash ? admin.password_hash.substring(0, 50) : 'N/A');
    } else {
      console.log('No admin found with email admin@maxistore.com');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

checkAdminPassword();
