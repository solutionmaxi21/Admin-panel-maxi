import db from './src/db/postgres.js';

async function inspectLatestProduct() {
    try {
        await db.connect();

        const product = await db.queryOne(`
      SELECT id, product_name, description 
      FROM products 
      ORDER BY id DESC 
      LIMIT 1
    `);

        if (product) {
            console.log('--- LATEST PRODUCT ---');
            console.log('ID:', product.id);
            console.log('Name:', product.product_name);
            console.log('Description (Raw Content):');
            console.log(JSON.stringify(product.description)); // Stringify to see hidden chars or escaping
            console.log('----------------------');

            if (product.description && product.description.includes('&lt;')) {
                console.log('⚠️ WARNING: Description appears to be HTML-escaped in the database!');
            } else if (product.description && product.description.includes('<')) {
                console.log('✅ INFO: Description contains raw HTML tags (Correct for dangerouslySetInnerHTML).');
            } else {
                console.log('ℹ️ INFO: Description contains no HTML tags.');
            }
        } else {
            console.log('No products found.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.close();
    }
}

inspectLatestProduct();
