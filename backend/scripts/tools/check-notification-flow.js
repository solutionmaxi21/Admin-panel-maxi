import db from './src/db/postgres.js';

async function checkNotificationFlow() {
  try {
    console.log('[Notification Check] Step 1: Check admin notification preferences...');
    const adminPrefs = await db.queryMany(
      'SELECT user_id, in_app_enabled, created_at, updated_at FROM notification_preferences WHERE user_id IN (1, 14)',
      []
    );
    console.log('Admin notification preferences:', adminPrefs.length ? adminPrefs : 'NONE - THIS IS THE ISSUE!');
    console.table(adminPrefs);
    
    console.log('\n[Notification Check] Step 2: Check if notifications exist for admins...');
    const adminNotifications = await db.queryMany(
      'SELECT id, user_id, type, title, message, is_read, created_at FROM notifications WHERE user_id IN (1, 14) ORDER BY created_at DESC LIMIT 20',
      []
    );
    console.log('Recent notifications for admins:', adminNotifications.length);
    console.table(adminNotifications);
    
    console.log('\n[Notification Check] Step 3: Check total notifications count...');
    const countResult = await db.queryOne(
      'SELECT COUNT(*) as total FROM notifications',
      []
    );
    console.log('Total notifications in database:', countResult.total);
    
    console.log('\n[Notification Check] Step 4: Check notification types created...');
    const typesCounts = await db.queryMany(
      'SELECT type, COUNT(*) as count FROM notifications GROUP BY type ORDER BY count DESC',
      []
    );
    console.table(typesCounts);
    
  } catch (error) {
    console.error('[Notification Check] Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

checkNotificationFlow();
