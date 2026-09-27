import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔄 Running migration: Add return statuses...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, '../sql/004_add_return_statuses.sql'),
      'utf8'
    );

    await pool.query(sql);
    
    console.log('✅ Migration complete: Added return and intermediate order statuses');
    console.log('   - returning');
    console.log('   - returned');
    console.log('   - failed_delivery');
    console.log('   - out_for_delivery');
    console.log('   - in_transit');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
