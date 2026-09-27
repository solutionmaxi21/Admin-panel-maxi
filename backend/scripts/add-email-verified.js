import db from '../src/db/postgres.js';

async function addEmailVerifiedColumn() {
  try {
    console.log('🔄 Adding email_verified column to users table...');
    
    // Add column
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Column added successfully');
    
    // Set existing users as verified
    const result = await db.query(`
      UPDATE users 
      SET email_verified = TRUE 
      WHERE deleted_at IS NULL
    `);
    console.log(`✅ Updated ${result.rowCount} users to verified status`);
    
    // Add index
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified)
    `);
    console.log('✅ Index created successfully');
    
    // Verify the column exists
    const verifyResult = await db.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'email_verified'
    `);
    
    if (verifyResult.rows.length > 0) {
      console.log('✅ Verification successful:', verifyResult.rows[0]);
    }
    
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addEmailVerifiedColumn();
