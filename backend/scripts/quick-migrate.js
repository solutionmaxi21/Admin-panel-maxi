#!/usr/bin/env node
/**
 * Quick Migration Script
 * Automates the entire migration process with safety checks
 */

import readline from 'readline';
import { spawn } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function runScript(script, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  Running: ${script} ${args.join(' ')}\n`);
    
    const proc = spawn('node', [script, ...args], {
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 POSTGRESQL MIGRATION - QUICK START');
  console.log('='.repeat(60));
  console.log('\nThis script will guide you through the complete migration process.');
  console.log('\n⚠️  WARNING: This will modify your database!');
  console.log('Make sure you have backups before proceeding.\n');

  try {
    // Step 1: Confirm database URL
    console.log('\n📋 Step 1: Database Configuration');
    console.log('Current DATABASE_URL from .env:');
    console.log(process.env.DATABASE_URL || '❌ NOT SET');
    
    const confirmDb = await question('\nIs this correct? (yes/no): ');
    if (confirmDb.toLowerCase() !== 'yes') {
      console.log('\n❌ Please update your .env file with the correct DATABASE_URL');
      process.exit(1);
    }

    // Step 2: Validate data
    console.log('\n📋 Step 2: Data Validation');
    console.log('Validating JSON database...');
    
    await runScript('scripts/validate-data.js');
    
    const proceedValidation = await question('\n✓ Validation complete. Continue? (yes/no): ');
    if (proceedValidation.toLowerCase() !== 'yes') {
      console.log('\n❌ Migration cancelled');
      process.exit(0);
    }

    // Step 3: Initialize database
    console.log('\n📋 Step 3: Database Initialization');
    const dropTables = await question('\nDrop existing tables if they exist? (yes/no): ');
    
    const initArgs = dropTables.toLowerCase() === 'yes' ? ['--drop'] : [];
    await runScript('scripts/init-database.js', initArgs);
    
    const proceedInit = await question('\n✓ Schema created. Continue? (yes/no): ');
    if (proceedInit.toLowerCase() !== 'yes') {
      console.log('\n❌ Migration cancelled');
      process.exit(0);
    }

    // Step 4: Dry run
    console.log('\n📋 Step 4: Migration Dry Run');
    console.log('Testing migration without inserting data...');
    
    await runScript('scripts/migrate-data.js', ['--dry-run', '--verbose']);
    
    const proceedDryRun = await question('\n✓ Dry run complete. Proceed with actual migration? (yes/no): ');
    if (proceedDryRun.toLowerCase() !== 'yes') {
      console.log('\n❌ Migration cancelled');
      process.exit(0);
    }

    // Step 5: Actual migration
    console.log('\n📋 Step 5: Data Migration');
    console.log('⚠️  This will insert all data into PostgreSQL');
    
    const finalConfirm = await question('\nAre you absolutely sure? Type "MIGRATE" to confirm: ');
    if (finalConfirm !== 'MIGRATE') {
      console.log('\n❌ Migration cancelled');
      process.exit(0);
    }

    await runScript('scripts/migrate-data.js', ['--verbose']);

    // Step 6: Verification
    console.log('\n📋 Step 6: Verification');
    await runScript('scripts/init-database.js', ['--stats']);

    // Success
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n📋 Next Steps:');
    console.log('  1. Review migration log: backend/scripts/migration-log.json');
    console.log('  2. Test database queries');
    console.log('  3. Update backend routes to use PostgreSQL');
    console.log('  4. Archive JSON database');
    console.log('\n📖 See MIGRATION_GUIDE.md for details\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\n📖 Check logs and MIGRATION_GUIDE.md for troubleshooting\n');
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
