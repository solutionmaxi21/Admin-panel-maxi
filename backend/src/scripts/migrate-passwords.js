/**
 * Password Migration Script
 * Migrates plain-text passwords to bcrypt hashes
 * 
 * Run with: node src/scripts/migrate-passwords.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, '../../../database/users/users.json');
const SALT_ROUNDS = 12;

/**
 * Check if a string is already a bcrypt hash
 */
const isBcryptHash = (str) => {
  return /^\$2[aby]\$\d{2}\$/.test(str);
};

/**
 * Migrate all plain-text passwords to bcrypt hashes
 */
async function migratePasswords() {
  console.log('🔐 Starting password migration...\n');

  // Read users file
  let users;
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    users = JSON.parse(data);
  } catch (error) {
    console.error('❌ Failed to read users file:', error.message);
    process.exit(1);
  }

  console.log(`📋 Found ${users.length} users\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    const passwordField = user.password_hash || user.password;
    
    if (!passwordField) {
      console.log(`⚠️  User ${user.user_id} (${user.email}): No password field found`);
      skippedCount++;
      continue;
    }

    if (isBcryptHash(passwordField)) {
      console.log(`✓  User ${user.user_id} (${user.email}): Already hashed`);
      skippedCount++;
      continue;
    }

    // Hash the plain-text password
    console.log(`🔄 User ${user.user_id} (${user.email}): Migrating password...`);
    
    try {
      const hashedPassword = await bcrypt.hash(passwordField, SALT_ROUNDS);
      user.password_hash = hashedPassword;
      migratedCount++;
      console.log(`✅ User ${user.user_id} (${user.email}): Password migrated successfully`);
    } catch (error) {
      console.error(`❌ User ${user.user_id} (${user.email}): Migration failed -`, error.message);
    }
  }

  // Write updated users back to file
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log('\n✅ Users file updated successfully');
  } catch (error) {
    console.error('\n❌ Failed to write users file:', error.message);
    process.exit(1);
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   Migrated: ${migratedCount}`);
  console.log(`   Skipped:  ${skippedCount}`);
  console.log(`   Total:    ${users.length}`);

  if (migratedCount > 0) {
    console.log('\n⚠️  IMPORTANT: Default passwords have been hashed!');
    console.log('   For testing, use these credentials:');
    console.log('   - Email: admin@maxistore.com');
    console.log('   - Password: admin123');
    console.log('\n   Remember to change default passwords in production!');
  }
}

// Run migration
migratePasswords()
  .then(() => {
    console.log('\n✅ Password migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
