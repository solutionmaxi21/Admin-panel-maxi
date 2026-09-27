import db from './src/db/postgres.js';

async function checkStock() {
  try {
    // Check for product 'xwxw'
    const result = await db.query(`
      SELECT 
        p.id, 
        p.product_name, 
        p.sku, 
        p.current_price,
        s.warehouse_id,
        w.warehouse_name,
        s.quantity
      FROM products p
      LEFT JOIN stock s ON p.id = s.product_id
      LEFT JOIN warehouses w ON s.warehouse_id = w.id
      WHERE p.product_name ILIKE '%xwxw%' OR p.sku ILIKE '%xwxw%'
      ORDER BY p.id, s.warehouse_id
    `);

    console.log('\n📦 Product "xwxw" Stock Status:\n');
    if (result.rows.length === 0) {
      console.log('❌ Product not found');
    } else {
      console.table(result.rows);
    }

    await db.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStock();
