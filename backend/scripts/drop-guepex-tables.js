import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function dropTables() {
  try {
    console.log('🗑️  Dropping existing Guepex tables...');
    
    await pool.query(`
      DROP TABLE IF EXISTS guepex_commune_fees CASCADE;
      DROP TABLE IF EXISTS guepex_shipping_fees CASCADE;
      DROP TABLE IF EXISTS guepex_centers CASCADE;
      DROP TABLE IF EXISTS guepex_communes CASCADE;
      DROP TABLE IF EXISTS guepex_wilayas CASCADE;
      DROP TABLE IF EXISTS guepex_sync_log CASCADE;
    `);
    
    console.log('✅ All Guepex tables dropped successfully');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

dropTables();
