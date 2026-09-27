/**
 * Initialize Missing Stock Entries
 * 
 * Ensures all products have stock entries in all warehouses.
 * Products without entries will get a row with quantity = 0.
 */

import db from './src/db/postgres.js';

async function initializeMissingStock() {
  try {
    console.log('\n🔧 Initializing missing stock entries...\n');

    // Get all warehouses
    const warehouses = await db.query('SELECT id, warehouse_name FROM warehouses ORDER BY id');
    console.log(`Found ${warehouses.rows.length} warehouses:`);
    warehouses.rows.forEach(w => console.log(`  - ${w.warehouse_name} (ID: ${w.id})`));

    // Get all active products
    const products = await db.query(`
      SELECT id, product_name 
      FROM products 
      WHERE deleted_at IS NULL 
      ORDER BY id
    `);
    console.log(`\nFound ${products.rows.length} active products\n`);

    let insertedCount = 0;
    let skippedCount = 0;

    // Use transaction to ensure consistency
    await db.transaction(async (client) => {
      for (const product of products.rows) {
        for (const warehouse of warehouses.rows) {
          // Check if stock entry exists
          const existingStock = await client.query(
            'SELECT id FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [product.id, warehouse.id]
          );

          if (existingStock.rows.length === 0) {
            // Insert new stock entry with quantity = 0
            await client.query(
              `INSERT INTO stock (product_id, warehouse_id, quantity, created_at, updated_at)
               VALUES ($1, $2, 0, NOW(), NOW())`,
              [product.id, warehouse.id]
            );
            insertedCount++;
            console.log(`  ✅ Created stock entry: Product ${product.id} → Warehouse ${warehouse.id} (qty: 0)`);
          } else {
            skippedCount++;
          }
        }
      }
    });

    console.log(`\n✅ Stock initialization complete:`);
    console.log(`   • Inserted: ${insertedCount} new entries`);
    console.log(`   • Skipped: ${skippedCount} existing entries`);
    console.log(`   • Total: ${insertedCount + skippedCount} entries processed\n`);

    await db.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initializeMissingStock();
