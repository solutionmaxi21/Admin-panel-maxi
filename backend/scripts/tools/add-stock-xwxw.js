import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function addStock() {
  try {
    await client.connect();
    console.log('Connected to database\n');
    
    // First, find the product
    const findProduct = await client.query(`
      SELECT * FROM products WHERE product_name = 'xwxw' LIMIT 1
    `);
    
    if (findProduct.rows.length === 0) {
      console.log('Product "xwxw" not found');
      return;
    }
    
    const product = findProduct.rows[0];
    const productId = product.product_id;
    console.log('Found product ID:', productId, 'Name:', product.product_name, 'SKU:', product.sku);
    
    // Check current stock
    const checkStock = await client.query(`
      SELECT * FROM stock WHERE product_id = $1
    `, [productId]);
    
    console.log('\nCurrent stock:');
    if (checkStock.rows.length === 0) {
      console.log('  No stock records found');
    } else {
      checkStock.rows.forEach(row => {
        console.log(`  Warehouse ${row.warehouse_id}: ${row.quantity} units (reserved: ${row.reserved_qty})`);
      });
    }
    
    // Add stock to warehouse 2 (Harrouch)
    console.log('\nAdding 100 units to warehouse 2 (Harrouch)...');
    
    if (checkStock.rows.some(row => row.warehouse_id === 2)) {
      // Update existing stock
      await client.query(`
        UPDATE stock 
        SET quantity = quantity + 100, updated_at = NOW()
        WHERE product_id = $1 AND warehouse_id = 2
      `, [productId]);
      console.log('Stock updated successfully');
    } else {
      // Insert new stock record
      await client.query(`
        INSERT INTO stock (product_id, warehouse_id, quantity, reserved_qty, created_at, updated_at)
        VALUES ($1, 2, 100, 0, NOW(), NOW())
      `, [productId]);
      console.log('Stock record created successfully');
    }
    
    // Verify new stock
    const verifyStock = await client.query(`
      SELECT * FROM stock WHERE product_id = $1
    `, [productId]);
    
    console.log('\nUpdated stock:');
    verifyStock.rows.forEach(row => {
      console.log(`  Warehouse ${row.warehouse_id}: ${row.quantity} units (reserved: ${row.reserved_qty})`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
  } finally {
    await client.end();
  }
}

addStock();
