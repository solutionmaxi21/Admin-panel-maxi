import db from './src/db/postgres.js';

async function checkAdmins() {
  try {
    console.log('[Check Admins] Querying for active admins...');
    const admins = await db.queryMany(
      'SELECT id, email, first_name, is_active, deleted_at, role FROM users WHERE role = $1 AND is_active = TRUE AND deleted_at IS NULL',
      ['admin']
    );
    
    console.log('Active admin users found:', admins.length);
    console.table(admins);
    
    // Also check all users with admin role (including inactive)
    console.log('\n[Check Admins] All users with admin role (including inactive)...');
    const allAdmins = await db.queryMany(
      'SELECT id, email, first_name, is_active, deleted_at, role FROM users WHERE role = $1',
      ['admin']
    );
    console.log('Total admin users:', allAdmins.length);
    console.table(allAdmins);
    
    // Check notification table exists
    console.log('\n[Check Admins] Checking notification tables...');
    const tablesCheck = await db.queryMany(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('notifications', 'notification_preferences')
    `);
    console.log('Notification tables found:', tablesCheck.length);
    console.table(tablesCheck);
    
  } catch (error) {
    console.error('[Check Admins] Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkAdmins();
