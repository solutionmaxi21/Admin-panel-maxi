/**
 * Enterprise-level DB audit for product variants migration.
 * Checks constraints, indexes, triggers, data integrity, and missing safeguards.
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   ENTERPRISE DB AUDIT: Product Variants              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const issues = [];

  // 1. product_variants constraints
  console.log('━━━ product_variants constraints ━━━');
  let r = await pool.query(`SELECT conname, contype, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c WHERE conrelid = 'product_variants'::regclass ORDER BY contype, conname`);
  console.table(r.rows);

  // Check: missing CHECK on current_price >= 0
  const hasCurrentPriceCheck = r.rows.some(c => c.definition && c.definition.includes('current_price'));
  if (!hasCurrentPriceCheck) issues.push('product_variants: missing CHECK (current_price >= 0)');

  const hasSalePriceCheck = r.rows.some(c => c.definition && c.definition.includes('sale_price'));
  if (!hasSalePriceCheck) issues.push('product_variants: missing CHECK (sale_price >= 0 OR sale_price IS NULL)');

  // 2. product_variants indexes
  console.log('\n━━━ product_variants indexes ━━━');
  r = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'product_variants'`);
  console.table(r.rows);

  // 3. stock constraints
  console.log('\n━━━ stock constraints ━━━');
  r = await pool.query(`SELECT conname, contype, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c WHERE conrelid = 'stock'::regclass ORDER BY contype, conname`);
  console.table(r.rows);

  const hasQuantityCheck = r.rows.some(c => c.definition && c.definition.includes('quantity'));
  if (!hasQuantityCheck) issues.push('stock: missing CHECK (quantity >= 0)');

  const hasReservedCheck = r.rows.some(c => c.definition && c.definition.includes('reserved_quantity'));
  if (!hasReservedCheck) issues.push('stock: missing CHECK (reserved_quantity >= 0)');

  const hasReservedLteQty = r.rows.some(c => c.definition && c.definition.includes('reserved_quantity') && c.definition.includes('quantity'));
  if (!hasReservedLteQty) issues.push('stock: missing CHECK (reserved_quantity <= quantity)');

  // 4. order_items constraints
  console.log('\n━━━ order_items constraints ━━━');
  r = await pool.query(`SELECT conname, contype, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c WHERE conrelid = 'order_items'::regclass ORDER BY contype, conname`);
  console.table(r.rows);

  const hasQtyPositive = r.rows.some(c => c.definition && c.definition.includes('quantity'));
  if (!hasQtyPositive) issues.push('order_items: missing CHECK (quantity > 0)');

  const hasUnitPriceCheck = r.rows.some(c => c.definition && c.definition.includes('unit_price'));
  if (!hasUnitPriceCheck) issues.push('order_items: missing CHECK (unit_price >= 0)');

  // 5. stock_movements constraints
  console.log('\n━━━ stock_movements constraints ━━━');
  r = await pool.query(`SELECT conname, contype, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c WHERE conrelid = 'stock_movements'::regclass ORDER BY contype, conname`);
  console.table(r.rows);

  // 6. Triggers
  console.log('\n━━━ existing triggers ━━━');
  r = await pool.query(`SELECT trigger_name, event_manipulation, event_object_table
    FROM information_schema.triggers WHERE trigger_schema = 'public'`);
  if (r.rows.length === 0) {
    console.log('  (none)');
    issues.push('No triggers exist — missing auto-updated_at, audit triggers');
  } else {
    console.table(r.rows);
  }

  // 7. Functions
  console.log('\n━━━ record_stock_movement signature ━━━');
  r = await pool.query(`SELECT proname, pg_get_function_arguments(p.oid) as args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'record_stock_movement'`);
  console.table(r.rows);

  const hasVariantParam = r.rows.some(row => row.args && row.args.includes('variant'));
  if (!hasVariantParam) issues.push('record_stock_movement() missing variant_id parameter');

  // 8. Views
  console.log('\n━━━ views ━━━');
  r = await pool.query(`SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`);
  console.table(r.rows);

  // 9. Data integrity
  console.log('\n━━━ data integrity ━━━');

  r = await pool.query('SELECT COUNT(*) as cnt FROM products WHERE deleted_at IS NULL');
  console.log('  Active products:', r.rows[0].cnt);

  r = await pool.query('SELECT COUNT(*) as cnt FROM product_variants WHERE deleted_at IS NULL');
  console.log('  Active variants:', r.rows[0].cnt);

  r = await pool.query('SELECT COUNT(*) as cnt FROM product_variants pv WHERE pv.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM stock s WHERE s.variant_id = pv.id)');
  console.log('  Variants with NO stock record:', r.rows[0].cnt);
  if (parseInt(r.rows[0].cnt) > 0) issues.push(`${r.rows[0].cnt} variants have no stock record in any warehouse`);

  r = await pool.query(`SELECT COUNT(*) as cnt FROM products p
    JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true
    WHERE p.deleted_at IS NULL AND p.current_price != pv.current_price`);
  console.log('  Price mismatches (product vs variant):', r.rows[0].cnt);

  r = await pool.query('SELECT COUNT(*) as cnt FROM stock WHERE variant_id IS NULL');
  console.log('  Stock rows with NULL variant_id:', r.rows[0].cnt);

  r = await pool.query('SELECT COUNT(*) as cnt FROM order_items WHERE variant_id IS NULL');
  console.log('  Order items with NULL variant_id:', r.rows[0].cnt);

  r = await pool.query('SELECT COUNT(*) as cnt FROM stock_movements WHERE variant_id IS NULL');
  console.log('  Stock movements with NULL variant_id:', r.rows[0].cnt);

  // 10. Missing unique constraint: barcode at variant level
  r = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'product_variants' AND indexdef LIKE '%barcode%' AND indexdef LIKE '%UNIQUE%'`);
  if (r.rows.length === 0) issues.push('product_variants: missing UNIQUE constraint on barcode');

  // 11. Check if stock still has old unique constraint
  r = await pool.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'stock'::regclass AND conname = 'stock_product_id_warehouse_id_key'`);
  if (r.rows.length > 0) issues.push('stock: old UNIQUE(product_id, warehouse_id) still active — needs variant_id version');

  // 12. variant_id nullable check
  r = await pool.query(`SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name IN ('stock', 'order_items', 'stock_movements') AND column_name = 'variant_id'`);
  for (const row of r.rows) {
    if (row.is_nullable === 'YES') issues.push(`${row.column_name} on ... is still NULLABLE (table check needed)`);
  }

  // Better check
  r = await pool.query(`SELECT table_name, is_nullable FROM information_schema.columns
    WHERE column_name = 'variant_id' AND table_name IN ('stock', 'order_items', 'stock_movements')`);
  for (const row of r.rows) {
    if (row.is_nullable === 'YES') {
      // Only flag if not already flagged
      const msg = `${row.table_name}.variant_id is still NULLABLE — Phase 6 not yet applied`;
      if (!issues.includes(msg)) issues.push(msg);
    }
  }

  // Remove duplicate variant_id nullable messages
  const uniqueIssues = [...new Set(issues)];

  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   AUDIT RESULTS                                      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  if (uniqueIssues.length === 0) {
    console.log('\n✅ ENTERPRISE READY — no issues found\n');
  } else {
    console.log(`\n⚠️  ${uniqueIssues.length} ISSUE(S) FOUND:\n`);
    uniqueIssues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
    console.log('');
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
