// Migration: Add commune_id column to orders table
import db from '../src/db/postgres.js';

async function migrate() {
  try {
    console.log('Adding commune_id column to orders table...');
    
    // Add column
    await db.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS commune_id INTEGER REFERENCES communes(id)
    `);
    console.log('✅ Column added');
    
    // Migrate existing data from shipping_snapshot
    const result = await db.query(`
      UPDATE orders 
      SET commune_id = (shipping_snapshot->>'commune_id')::integer 
      WHERE shipping_snapshot->>'commune_id' IS NOT NULL 
        AND commune_id IS NULL
    `);
    console.log(`✅ Migrated ${result.rowCount} orders`);
    
    // Verify
    const check = await db.query(`
      SELECT id, order_number, commune_id, 
             shipping_snapshot->>'commune_id' as snapshot_commune
      FROM orders 
      WHERE id IN (14, 15)
    `);
    console.log('\nVerification:');
    console.table(check.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
