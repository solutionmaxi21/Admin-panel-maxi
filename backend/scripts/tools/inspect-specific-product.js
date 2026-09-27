import db from './src/db/postgres.js';

async function inspectSpecificProduct() {
    try {
        await db.connect();

        // Search for the product by a snippet of the title the user mentioned
        const product = await db.queryOne(`
      SELECT id, product_name, description 
      FROM products 
      WHERE product_name ILIKE '%Perceuse-Visseuse%'
      LIMIT 1
    `);

        if (product) {
            console.log('--- TARGET PRODUCT ---');
            console.log('ID:', product.id);
            console.log('Name:', product.product_name);
            console.log('--- RAW DESCRIPTION (JSON.stringify) ---');
            console.log(JSON.stringify(product.description));
            console.log('----------------------------------------');

            const desc = product.description || '';
            console.log('First 50 chars:', desc.substring(0, 50));
            console.log('Contains literal "<":', desc.includes('<'));
            console.log('Contains literal "&lt;":', desc.includes('&lt;'));
            console.log('Contains literal "&amp;":', desc.includes('&amp;'));
            console.log('Contains literal "&nbsp;":', desc.includes('&nbsp;'));

        } else {
            console.log('❌ Product not found matching "Perceuse-Visseuse"');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.close();
    }
}

inspectSpecificProduct();
