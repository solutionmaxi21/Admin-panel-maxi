import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

async function fixSequence() {
  try {
    await client.connect();
    console.log('Connected to database');
    
    const result = await client.query(`
      SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM products), false);
    `);
    
    console.log('✓ Sequence fixed successfully!');
    console.log('Result:', result.rows[0]);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

fixSequence();
