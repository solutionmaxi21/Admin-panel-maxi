import db from './src/db/postgres.js';

async function checkStock() {
  await db.connect();
  try {
    const products = await db.queryMany("SELECT id, product_name FROM products WHERE product_name ILIKE '%Dell PowerEdge R750%'");
    console.log('Products found:', products);

    if (products.length > 0) {
      const pId = products[0].id;
      const stock = await db.queryMany("SELECT * FROM stock WHERE product_id = $1", [pId]);
      console.log('Stock:', stock);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await db.close();
  }
}

checkStock();