import db from './src/db/postgres.js';

async function analyzeStock() {
  try {
    // Get all warehouses
    const warehouses = await db.query('SELECT id, warehouse_name FROM warehouses ORDER BY id');
    console.log('\n🏭 Warehouses:');
    console.table(warehouses.rows);

    // Get stock entries for product 75
    const stockEntries = await db.query(`
      SELECT s.product_id, s.warehouse_id, w.warehouse_name, s.quantity
      FROM stock s
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.product_id = 75
      ORDER BY s.warehouse_id
    `);
    
    console.log('\n📊 Stock entries for product 75 (xwxw):');
    if (stockEntries.rows.length === 0) {
      console.log('❌ No stock entries found');
    } else {
      console.table(stockEntries.rows);
    }

    // Count products missing stock entries in warehouse 2
    const missingStock = await db.query(`
      SELECT COUNT(DISTINCT p.id) as products_without_harrouch_stock
      FROM products p
      WHERE p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM stock s 
        WHERE s.product_id = p.id AND s.warehouse_id = 2
      )
    `);
    
    console.log('\n⚠️  Products missing stock entry in Harrouch warehouse (ID: 2):');
    console.log(`   ${missingStock.rows[0].products_without_harrouch_stock} products`);

    await db.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

analyzeStock();
