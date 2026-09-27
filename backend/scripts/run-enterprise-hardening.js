import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   Enterprise Hardening Migration (035)               ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const filePath = path.join(__dirname, '..', 'sql', 'migrations', '035_enterprise_hardening.sql');
  const sql = fs.readFileSync(filePath, 'utf-8');

  const start = Date.now();

  try {
    await pool.query(sql);
    const duration = Date.now() - start;
    console.log(`✅ Migration 035 completed in ${duration}ms\n`);

    // Post-migration audit
    console.log('━━━ POST-MIGRATION AUDIT ━━━\n');

    // Check constraints
    let r = await pool.query(`SELECT COUNT(*) as cnt FROM pg_constraint
      WHERE conrelid = 'product_variants'::regclass AND contype = 'c'`);
    console.log(`  CHECK constraints on product_variants: ${r.rows[0].cnt}`);

    // Triggers
    r = await pool.query(`SELECT t.tgname, c.relname as table_name
      FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE NOT t.tgisinternal ORDER BY c.relname, t.tgname`);
    console.log(`  Triggers active: ${r.rows.length}`);
    r.rows.forEach(row => console.log(`    • ${row.table_name} → ${row.tgname}`));

    // Variant_id NOT NULL check
    r = await pool.query(`SELECT table_name, is_nullable FROM information_schema.columns
      WHERE column_name = 'variant_id' AND table_name IN ('stock', 'order_items', 'stock_movements')`);
    console.log(`\n  variant_id nullability:`);
    r.rows.forEach(row => console.log(`    • ${row.table_name}: ${row.is_nullable === 'NO' ? '✅ NOT NULL' : '❌ NULLABLE'}`));

    // Stock unique constraint
    r = await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'stock'::regclass AND contype = 'u'`);
    console.log(`\n  Stock unique constraints:`);
    r.rows.forEach(row => console.log(`    • ${row.conname}`));

    // record_stock_movement signature
    r = await pool.query(`SELECT pg_get_function_arguments(p.oid) as args
      FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'record_stock_movement'`);
    const hasVariant = r.rows.some(row => row.args.includes('variant'));
    console.log(`\n  record_stock_movement has variant_id: ${hasVariant ? '✅' : '❌'}`);

    // Price history table
    r = await pool.query(`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'variant_price_history') as exists`);
    console.log(`  Price history audit table: ${r.rows[0].exists ? '✅' : '❌'}`);

    // Barcode uniqueness
    r = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'product_variants' AND indexdef LIKE '%barcode%unique%'`);
    // Also check case-insensitive
    const r2 = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'product_variants' AND indexname LIKE '%barcode_unique%'`);
    console.log(`  Barcode unique index: ${(r.rows.length > 0 || r2.rows.length > 0) ? '✅' : '❌'}`);

    // Data integrity
    r = await pool.query(`SELECT
      (SELECT COUNT(*) FROM stock WHERE variant_id IS NULL) as stock_null,
      (SELECT COUNT(*) FROM order_items WHERE variant_id IS NULL) as items_null,
      (SELECT COUNT(*) FROM stock_movements WHERE variant_id IS NULL) as movements_null,
      (SELECT SUM(quantity) FROM stock) as total_stock`);
    const d = r.rows[0];
    console.log(`\n  NULL variant_ids: stock=${d.stock_null}, items=${d.items_null}, movements=${d.movements_null}`);
    console.log(`  Total stock units: ${d.total_stock}`);

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║   ✅ ENTERPRISE HARDENING COMPLETE                   ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

  } catch (err) {
    const duration = Date.now() - start;
    console.error(`\n❌ Migration 035 FAILED after ${duration}ms`);
    console.error(`   Error: ${err.message}`);
    if (err.detail) console.error(`   Detail: ${err.detail}`);
    if (err.hint) console.error(`   Hint: ${err.hint}`);
    if (err.where) console.error(`   Where: ${err.where}`);
    console.error('\n   Transaction was rolled back. No changes applied.');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
