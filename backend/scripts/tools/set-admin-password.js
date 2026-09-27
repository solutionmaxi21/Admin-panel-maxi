import db from './src/db/postgres.js';
import { hashPassword } from './src/shared/utils/password.js';

async function setAdminPassword() {
  try {
    const email = 'admin@maxistore.com';
    const password = 'Admin1234!'; // Strong password
    
    console.log('Hashing password...');
    const hashedPassword = await hashPassword(password);
    
    console.log('Updating admin password...');
    const result = await db.query(
      `UPDATE users 
       SET password_hash = $1, updated_at = NOW() 
       WHERE email = $2 AND role = 'admin' AND deleted_at IS NULL
       RETURNING id, email, role`,
      [hashedPassword, email]
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Admin password updated successfully!');
      console.log('Email:', email);
      console.log('Password:', password);
      console.log('');
      console.log('You can now login with these credentials.');
    } else {
      console.log('❌ No admin account found with email:', email);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit();
  }
}

setAdminPassword();
