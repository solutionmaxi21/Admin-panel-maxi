import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkStock() {
  try {
    await client.connect();
    console.log('Connected to database\n');
    
    // Check product info
    const productQuery = `
      SELECT product_id, product_name, sku, current_price
      FROM products 
      WHERE product_name = 'xwxw' OR sku LIKE '%xwxw%'
    `;
    const productResult = await client.query(productQuery);
    console.log('Product Info:');
    console.log(JSON.stringify(productResult.rows, null, 2));
    
    if (productResult.rows.length > 0) {
      const productId = productResult.rows[0].product_id;
      
      // Check stock levels
      const stockQuery = `
        SELECT s.warehouse_id, w.warehouse_name, s.quantity, s.reserved_quantity
        FROM stock s
        JOIN warehouses w ON s.warehouse_id = w.warehouse_id
        WHERE s.product_id = $1
      `;
      const stockResult = await client.query(stockQuery, [productId]);
      console.log('\nStock Levels:');
      console.log(JSON.stringify(stockResult.rows, null, 2));
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkStock();
