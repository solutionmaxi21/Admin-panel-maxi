import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const { Client } = pg;

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add-missing-auth-columns.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔄 Running migration: add-missing-auth-columns.sql\n');

    // Execute migration
    await client.query(sql);

    console.log('\n✅ Migration completed successfully!\n');
    console.log('📋 Changes applied:');
    console.log('   ✓ users.google_id - for Google OAuth login');
    console.log('   ✓ users.reset_token_hash - for password reset');
    console.log('   ✓ users.reset_expires_at - for password reset expiry');
    console.log('   ✓ addresses.first_name - for shipping names');
    console.log('   ✓ addresses.last_name - for shipping names');
    console.log('   ✓ addresses.deleted_at - for soft deletes');
    console.log('   ✓ Renamed: phone_number → phone');
    console.log('   ✓ Renamed: street_address → address_line1\n');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nDetails:', error);
    await client.end();
    process.exit(1);
  }
}

runMigration();
