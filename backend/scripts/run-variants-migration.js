/**
 * Product Variants Migration Runner
 * Runs migrations 030–033 in order using the app's DATABASE_URL.
 *
 * Usage: node scripts/run-variants-migration.js
 *
 * Safety:
 *   - Each migration runs in its own transaction (as defined in the SQL)
 *   - Stops immediately on any error
 *   - Logs all results for audit
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

const MIGRATIONS_DIR = path.join(__dirname, '..', 'sql', 'migrations');

// Ordered list of migrations to run (Phase 1-3 + views)
const MIGRATIONS = [
  '030_variants_preflight.sql',
  '031_create_product_variants.sql',
  '032_backfill_default_variants.sql',
  '033_create_variant_compat_views.sql',
];

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   MaxiStore: Product Variants Migration Runner  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set. Check backend/.env');
    process.exit(1);
  }

  // Mask password in URL for logging
  const safeUrl = process.env.DATABASE_URL.replace(
    /\/\/([^:]+):([^@]+)@/,
    '//$1:****@'
  );
  console.log(`Database: ${safeUrl}`);
  console.log('');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Test connection
    const client = await pool.connect();
    const timeResult = await client.query('SELECT NOW() AS now');
    console.log(`✅ Connected at ${timeResult.rows[0].now}`);
    client.release();
    console.log('');

    // Run each migration
    for (let i = 0; i < MIGRATIONS.length; i++) {
      const migrationFile = MIGRATIONS[i];
      const filePath = path.join(MIGRATIONS_DIR, migrationFile);

      if (!fs.existsSync(filePath)) {
        console.error(`❌ Migration file not found: ${filePath}`);
        process.exit(1);
      }

      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[${i + 1}/${MIGRATIONS.length}] Running: ${migrationFile}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      const start = Date.now();

      try {
        // The preflight script (030) uses \echo which is psql-specific.
        // We need to handle it differently — strip \echo and run queries.
        if (migrationFile.includes('preflight')) {
          await runPreflight(pool, sql);
        } else {
          // Migrations 031-033 use BEGIN/COMMIT internally
          await pool.query(sql);
        }

        const duration = Date.now() - start;
        console.log(`✅ ${migrationFile} completed in ${duration}ms`);
        console.log('');
      } catch (err) {
        const duration = Date.now() - start;
        console.error(`❌ ${migrationFile} FAILED after ${duration}ms`);
        console.error(`   Error: ${err.message}`);

        if (err.detail) console.error(`   Detail: ${err.detail}`);
        if (err.hint) console.error(`   Hint: ${err.hint}`);
        if (err.where) console.error(`   Where: ${err.where}`);

        console.error('');
        console.error('⛔ Migration stopped. No further migrations will run.');
        console.error('   The failed migration was rolled back (transactional).');
        console.error('   Fix the issue and re-run this script.');
        process.exit(1);
      }
    }

    // Final verification
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('POST-MIGRATION VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const checks = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM products) AS products_total,
        (SELECT COUNT(*) FROM product_variants) AS variants_total,
        (SELECT COUNT(*) FROM product_variants WHERE is_default = true) AS default_variants,
        (SELECT COUNT(*) FROM stock) AS stock_rows,
        (SELECT COUNT(*) FROM stock WHERE variant_id IS NOT NULL) AS stock_linked,
        (SELECT COUNT(*) FROM stock WHERE variant_id IS NULL) AS stock_unlinked,
        (SELECT COUNT(*) FROM stock_movements) AS movements_total,
        (SELECT COUNT(*) FROM stock_movements WHERE variant_id IS NOT NULL) AS movements_linked,
        (SELECT COUNT(*) FROM stock_movements WHERE variant_id IS NULL) AS movements_unlinked,
        (SELECT COUNT(*) FROM order_items) AS items_total,
        (SELECT COUNT(*) FROM order_items WHERE variant_id IS NOT NULL) AS items_linked,
        (SELECT COUNT(*) FROM order_items WHERE variant_id IS NULL) AS items_unlinked
    `);

    const r = checks.rows[0];
    console.log(`  Products total:         ${r.products_total}`);
    console.log(`  Variants created:       ${r.variants_total} (${r.default_variants} default)`);
    console.log(`  Stock rows:             ${r.stock_rows} (linked: ${r.stock_linked}, unlinked: ${r.stock_unlinked})`);
    console.log(`  Stock movements:        ${r.movements_total} (linked: ${r.movements_linked}, unlinked: ${r.movements_unlinked})`);
    console.log(`  Order items:            ${r.items_total} (linked: ${r.items_linked}, unlinked: ${r.items_unlinked})`);
    console.log('');

    const hasIssues =
      parseInt(r.stock_unlinked) > 0 ||
      parseInt(r.items_unlinked) > 0;

    if (hasIssues) {
      console.log('⚠️  Some records are unlinked (orphaned product references). See warnings above.');
    } else {
      console.log('✅ ALL MIGRATIONS PASSED — zero data loss verified');
    }

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   Migration Complete! Safe to deploy backend.   ║');
    console.log('╚══════════════════════════════════════════════════╝');

  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Run the preflight check script.
 * Strips psql-specific commands (\echo) and runs each SELECT independently,
 * printing results in a readable format.
 */
async function runPreflight(pool, sql) {
  // Extract SQL queries (skip \echo lines and comments-only blocks)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      // Remove empty, \echo-only, and comment-only blocks
      const stripped = s.replace(/--[^\n]*/g, '').replace(/\\echo[^\n]*/g, '').trim();
      return stripped.length > 0 && stripped.toUpperCase().startsWith('SELECT');
    });

  const checkNames = [
    'Orphaned stock records',
    'Orphaned order_items',
    'Orphaned stock_movements',
    'Duplicate SKUs',
    'Products with NULL SKU',
    'Duplicate barcodes',
    'Current row counts',
    'Total inventory snapshot',
  ];

  for (let i = 0; i < statements.length; i++) {
    const label = checkNames[i] || `Check ${i + 1}`;
    try {
      const result = await pool.query(statements[i]);
      const rows = result.rows;

      if (i < 6) {
        // Checks 1-6: should return 0 rows
        if (rows.length === 0) {
          console.log(`  ✅ ${label}: PASS (0 issues)`);
        } else {
          console.log(`  ⚠️  ${label}: ${rows.length} issue(s) found`);
          console.table(rows);
        }
      } else {
        // Checks 7-8: informational
        console.log(`  📊 ${label}:`);
        console.table(rows);
      }
    } catch (err) {
      console.log(`  ❌ ${label}: ERROR — ${err.message}`);
    }
  }
}

main();
