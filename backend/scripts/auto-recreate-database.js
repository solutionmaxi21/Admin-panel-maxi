/**
 * Automated Database Recreation Script
 * Non-interactive version that recreates database automatically
 */

import { spawn } from 'child_process';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${command} ${args.join(' ')}\n`);
    
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function dropDatabase(dbName) {
  console.log(`\n🗑️  Dropping database '${dbName}'...`);
  
  // Use DATABASE_URL from environment or fallback to localhost with postgres defaults
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres';
  const baseUrl = dbUrl.replace(/\/[^/]+(\?.*)?$/, '/postgres');
  const client = new Client({
    connectionString: baseUrl
  });

  try {
    await client.connect();
    
    // Terminate existing connections
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop database
    await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
    console.log(`✓ Database '${dbName}' dropped`);
    
  } catch (error) {
    if (error.code === '3D000') {
      console.log(`✓ Database '${dbName}' doesn't exist (ok)`);
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function createDatabase(dbName) {
  console.log(`\n📦 Creating database '${dbName}'...`);
  
  // Use DATABASE_URL from environment or fallback to localhost with postgres defaults
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres';
  const baseUrl = dbUrl.replace(/\/[^/]+(\?.*)?$/, '/postgres');
  const client = new Client({
    connectionString: baseUrl
  });

  try {
    await client.connect();
    await client.query(`CREATE DATABASE ${dbName}`);
    console.log(`✓ Database '${dbName}' created`);
  } catch (error) {
    if (error.code === '42P04') {
      console.log(`✓ Database '${dbName}' already exists`);
    } else {
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function verifyConnection(dbName) {
  console.log(`\n🔌 Verifying connection to '${dbName}'...`);
  
  // Use DATABASE_URL from environment or fallback to localhost
  const dbUrl = process.env.DATABASE_URL || `postgresql://postgres@localhost:5432/${dbName}`;
  const targetUrl = dbUrl.replace(/\/[^/]+(\?.*)?$/, '/' + dbName);
  const client = new Client({
    connectionString: targetUrl
  });

  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    console.log(`✓ Connected successfully`);
    console.log(`  PostgreSQL: ${result.rows[0].version.split(',')[0]}`);
    return true;
  } catch (error) {
    console.error(`✗ Connection failed: ${error.message}`);
    return false;
  } finally {
    await client.end();
  }
}

async function getTableStats(dbName) {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'sm2025mf',
    database: dbName
  });

  try {
    await client.connect();
    
    const tables = [
      'users', 'products', 'orders', 'order_items',
      'categories', 'reviews', 'wilayas', 'communes'
    ];
    
    console.log('\n📊 Data Summary:');
    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
      const count = result.rows[0].count;
      console.log(`   ${table}: ${count}`);
    }
    
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 AUTOMATED DATABASE RECREATION');
  console.log('='.repeat(60));

  const dbName = 'maxistore';

  try {
    // Step 1: Check PostgreSQL connection
    console.log('\n📋 Step 1: Checking PostgreSQL Service...');
    try {
      const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres';
      const baseUrl = dbUrl.replace(/\/[^/]+(\?.*)?$/, '/postgres');
      const testClient = new Client({
        connectionString: baseUrl,
        connectionTimeoutMillis: 3000
      });
      await testClient.connect();
      await testClient.end();
      console.log('✓ PostgreSQL is running');
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error('\n❌ PostgreSQL is not running!');
        console.log('\n💡 To start PostgreSQL:');
        console.log('   Run PowerShell as Administrator and execute:');
        console.log('   Start-Service postgresql-x64-18\n');
        process.exit(1);
      }
      throw error;
    }

    // Step 2: Drop existing database
    console.log('\n📋 Step 2: Dropping Existing Database');
    await dropDatabase(dbName);

    // Step 3: Create new database
    console.log('\n📋 Step 3: Creating Fresh Database');
    await createDatabase(dbName);

    // Step 4: Verify connection
    console.log('\n📋 Step 4: Verifying Connection');
    const connected = await verifyConnection(dbName);
    if (!connected) {
      throw new Error('Failed to connect to new database');
    }

    // Step 5: Initialize schema
    console.log('\n📋 Step 5: Initializing Schema (22 tables + views)');
    await runCommand('node', ['scripts/init-database.js']);

    // Step 6: Migrate data
    console.log('\n📋 Step 6: Migrating Data from JSON Files');
    await runCommand('node', ['scripts/migrate-data.js', '--verbose']);

    // Step 7: Display statistics
    console.log('\n📋 Step 7: Verifying Migration');
    await getTableStats(dbName);

    // Success summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ DATABASE RECREATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`\n📊 Database: ${dbName}`);
    console.log('🔌 Connection: localhost:5432');
    console.log('👤 User: postgres\n');

    console.log('✅ Everything is ready! Your data has been migrated.\n');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ DATABASE RECREATION FAILED');
    console.error('='.repeat(60));
    console.error('\nError:', error.message);
    
    if (error.code) {
      console.error('Error code:', error.code);
    }

    console.log('\n💡 Troubleshooting:');
    console.log('  1. Ensure PostgreSQL is running');
    console.log('  2. Check password in .env: sm2025mf');
    console.log('  3. Verify port 5432 is available');
    console.log('  4. Check scripts/init-database.js exists');
    console.log('  5. Check scripts/migrate-data.js exists\n');
    
    process.exit(1);
  }
}

main();
