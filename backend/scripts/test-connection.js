/**
 * PostgreSQL Connection Test
 * Tests database connectivity before migration
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testConnection() {
  console.log('\n' + '='.repeat(60));
  console.log('PostgreSQL Connection Test');
  console.log('='.repeat(60));

  // Parse DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('\n❌ DATABASE_URL not found in environment');
    console.log('   Please check your .env file\n');
    process.exit(1);
  }

  console.log('\n📋 Configuration:');
  const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  let dbName = null;
  
  if (urlParts) {
    const [, user, , host, port, database] = urlParts;
    dbName = database;
    console.log(`   User: ${user}`);
    console.log(`   Host: ${host}`);
    console.log(`   Port: ${port}`);
    console.log(`   Database: ${database}`);
  } else {
    console.log(`   ${dbUrl.replace(/:([^:@]+)@/, ':****@')}`);
  }

  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    console.log('\n🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✓ Connection successful!');

    // Test query
    console.log('\n🔍 Testing query...');
    const result = await client.query('SELECT version()');
    console.log('✓ Query successful!');
    console.log(`   PostgreSQL version: ${result.rows[0].version.split(',')[0]}`);

    // Check if database exists
    console.log('\n🔍 Checking database...');
    const dbCheck = await client.query(
      `SELECT EXISTS(SELECT datname FROM pg_catalog.pg_database WHERE datname = $1)`,
      [dbName || process.env.PGDATABASE || '']
    );
    
    const dbLabel = dbName || process.env.PGDATABASE || '(unknown)';
    if (dbCheck.rows[0].exists) {
      console.log(`✓ Database '${dbLabel}' exists`);
    } else {
      console.log(`⚠️  Database '${dbLabel}' not found`);
      console.log('   It will be created during migration');
    }

    // Check if tables exist
    console.log('\n🔍 Checking schema...');
    const tableCheck = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableCount = parseInt(tableCheck.rows[0].count);
    if (tableCount > 0) {
      console.log(`✓ Found ${tableCount} existing tables`);
      console.log('   Note: Use --drop flag to recreate schema');
    } else {
      console.log('✓ Clean database (no tables)');
      console.log('   Ready for fresh migration');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ CONNECTION TEST PASSED');
    console.log('='.repeat(60));
    console.log('\n🚀 You can now proceed with migration:');
    console.log('   node scripts/init-database.js --drop');
    console.log('   node scripts/migrate-data.js --dry-run');
    console.log('   node scripts/migrate-data.js --verbose\n');

    process.exit(0);

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ CONNECTION TEST FAILED');
    console.log('='.repeat(60));
    console.error('\nError:', error.message);
    
    console.log('\n💡 Troubleshooting:');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   1. PostgreSQL service is not running');
      console.log('      Start it with: net start postgresql-x64-18');
      console.log('      (Run Command Prompt as Administrator)');
    } else if (error.code === '28P01') {
      console.log('   1. Password authentication failed');
      console.log('      Check DATABASE_URL in .env file');
      console.log('      Default password may need to be set');
    } else if (error.code === '3D000') {
      console.log('   1. Database does not exist');
      console.log('      Create it with: createdb maxistore');
      console.log('      Or: psql -U postgres -c "CREATE DATABASE maxistore;"');
    } else {
      console.log('   1. Check DATABASE_URL format in .env');
      console.log('   2. Verify PostgreSQL is installed and running');
      console.log('   3. Check firewall settings');
    }
    
    console.log('\n   Error code:', error.code);
    console.log();
    
    process.exit(1);
  } finally {
    await client.end();
  }
}

testConnection();
