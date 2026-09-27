
import db from './src/db/postgres.js';

async function checkPrice() {
    try {
        const sku = 'LOGI-COM-3EVM1I';
        const product = await db.queryOne('SELECT id, product_name, current_price, sale_price, sku FROM products WHERE sku = $1', [sku]);
        console.log('Product Info:', JSON.stringify(product, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkPrice();
