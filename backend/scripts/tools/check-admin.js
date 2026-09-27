import db from './src/db/postgres.js';

async function checkAdmins() {
  try {
    const result = await db.query(
      'SELECT id, email, role, is_active FROM users WHERE role = $1 AND deleted_at IS NULL',
      ['admin']
    );
    console.log('Admin accounts:', JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

checkAdmins();
