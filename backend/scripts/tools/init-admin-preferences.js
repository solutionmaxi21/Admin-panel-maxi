import db from './src/db/postgres.js';

async function ensureAdminNotificationPreferences() {
  try {
    console.log('[Admin Prefs Init] Ensuring all admin users have notification preferences...');
    
    // Check which admins are missing preferences
    const adminsMissingPrefs = await db.queryMany(`
      SELECT u.id, u.email, u.first_name
      FROM users u
      WHERE u.role = 'admin' 
      AND u.deleted_at IS NULL
      AND u.id NOT IN (SELECT user_id FROM notification_preferences)
      ORDER BY u.id
    `, []);
    
    console.log(`Found ${adminsMissingPrefs.length} admins without notification preferences:`);
    console.table(adminsMissingPrefs);
    
    if (adminsMissingPrefs.length === 0) {
      console.log('✅ All admins already have notification preferences!');
      process.exit(0);
    }
    
    // Create preferences for missing admins
    console.log(`\n[Admin Prefs Init] Creating preferences for ${adminsMissingPrefs.length} admins...`);
    
    for (const admin of adminsMissingPrefs) {
      const result = await db.queryOne(`
        INSERT INTO notification_preferences (
          user_id, email_on_order, email_on_shipment, email_on_delivery, 
          email_on_return, in_app_enabled, created_at, updated_at
        ) VALUES ($1, true, true, true, true, true, NOW(), NOW())
        RETURNING user_id
      `, [admin.id]);
      
      console.log(`✅ Created preferences for admin ${admin.id} (${admin.email})`);
    }
    
    // Verify all admins now have preferences
    console.log('\n[Admin Prefs Init] Verifying all admins have preferences...');
    const allAdminsPrefs = await db.queryMany(`
      SELECT u.id, u.email, u.first_name, np.in_app_enabled
      FROM users u
      LEFT JOIN notification_preferences np ON u.id = np.user_id
      WHERE u.role = 'admin' AND u.deleted_at IS NULL
      ORDER BY u.id
    `, []);
    
    console.log('Final notification preferences status:');
    console.table(allAdminsPrefs);
    
    console.log('\n✅ All admin users now have notification preferences configured!');
    
  } catch (error) {
    console.error('[Admin Prefs Init] Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

ensureAdminNotificationPreferences();
