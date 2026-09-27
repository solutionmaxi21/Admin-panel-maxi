/**
 * PostgreSQL Database Initialization Script
 * Sets up database schema from SQL files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/db/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SQL_DIR = path.join(__dirname, '../sql');

class DatabaseInitializer {
  constructor() {
    this.sqlFiles = [
      '001_schema.sql',
      '002_views.sql'
    ];
  }

  /**
   * Execute SQL file
   */
  async executeSQLFile(filename) {
    console.log(`\n📄 Executing ${filename}...`);
    
    const filePath = path.join(SQL_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`SQL file not found: ${filename}`);
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      await db.query(sql);
      console.log(`  ✓ ${filename} executed successfully`);
      return true;
    } catch (error) {
      console.error(`  ❌ Error executing ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if database is already initialized
   */
  async isInitialized() {
    try {
      const exists = await db.tableExists('users');
      return exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Drop all tables (DANGEROUS - use with caution)
   */
  async dropAllTables() {
    console.log('\n⚠️  Dropping all tables...');
    
    const dropSQL = `
      DO $$ DECLARE
        r RECORD;
      BEGIN
        -- Drop all views
        FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.viewname) || ' CASCADE';
        END LOOP;
        
        -- Drop all tables
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        
        -- Drop all types
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e') LOOP
          EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$;
    `;

    try {
      await db.query(dropSQL);
      console.log('  ✓ All tables dropped');
    } catch (error) {
      console.error('  ❌ Error dropping tables:', error.message);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initialize(options = {}) {
    const { force = false, dropFirst = false } = options;

    try {
      console.log('\n🚀 Starting Database Initialization...\n');
      console.log('Database:', process.env.DATABASE_URL?.split('@')[1] || 'unknown');

      // Connect to database
      await db.connect();

      // Check if already initialized
      const initialized = await this.isInitialized();
      
      if (initialized && !force && !dropFirst) {
        console.log('\n⚠️  Database already initialized!');
        console.log('   Use --force to recreate or --drop to drop first\n');
        return false;
      }

      // Drop tables if requested
      if (dropFirst || force) {
        await this.dropAllTables();
      }

      // Execute SQL files in order
      for (const file of this.sqlFiles) {
        await this.executeSQLFile(file);
      }

      // Verify installation
      await this.verifyInstallation();

      console.log('\n✅ Database initialization complete!\n');
      return true;

    } catch (error) {
      console.error('\n❌ Database initialization failed:', error.message);
      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * Verify database installation
   */
  async verifyInstallation() {
    console.log('\n🔍 Verifying installation...');

    const expectedTables = [
      'users', 'addresses', 'categories', 'suppliers', 'products',
      'product_attributes', 'product_images', 'warehouses', 'stock',
      'orders', 'order_items', 'order_history', 'promotions',
      'reviews', 'favorites', 'returns', 'return_items',
      'wilayas', 'communes', 'shipping_centers', 'shipping_tariffs',
      'sync_logs'
    ];

    const expectedViews = [
      'active_products', 'active_categories', 'active_users',
      'active_orders', 'product_summary', 'order_summary',
      'low_stock_alert', 'product_statistics', 'order_statistics'
    ];

    let missingTables = [];
    let missingViews = [];

    // Check tables
    for (const table of expectedTables) {
      const exists = await db.tableExists(table);
      if (!exists) {
        missingTables.push(table);
      }
    }

    // Check views
    for (const view of expectedViews) {
      const result = await db.queryOne(
        `SELECT EXISTS (
          SELECT FROM information_schema.views 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [view]
      );
      if (!result.exists) {
        missingViews.push(view);
      }
    }

    if (missingTables.length > 0) {
      console.error(`  ❌ Missing tables: ${missingTables.join(', ')}`);
      throw new Error('Database verification failed');
    }

    if (missingViews.length > 0) {
      console.error(`  ❌ Missing views: ${missingViews.join(', ')}`);
      throw new Error('Database verification failed');
    }

    console.log(`  ✓ ${expectedTables.length} tables verified`);
    console.log(`  ✓ ${expectedViews.length} views verified`);
  }

  /**
   * Get database statistics
   */
  async getStatistics() {
    await db.connect();

    try {
      const tables = await db.queryMany(`
        SELECT 
          schemaname,
          tablename,
          pg_total_relation_size(schemaname||'.'||tablename) AS size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY size DESC
      `);

      console.log('\n📊 Database Statistics:\n');
      console.log('Tables:');
      for (const table of tables) {
        const count = await db.getTableCount(table.tablename);
        const sizeMB = (table.size / 1024 / 1024).toFixed(2);
        console.log(`  ${table.tablename}: ${count} rows (${sizeMB} MB)`);
      }

    } finally {
      await db.close();
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {
    force: args.includes('--force'),
    dropFirst: args.includes('--drop'),
    stats: args.includes('--stats')
  };

  const initializer = new DatabaseInitializer();

  try {
    if (options.stats) {
      await initializer.getStatistics();
    } else {
      await initializer.initialize(options);
    }
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default DatabaseInitializer;
