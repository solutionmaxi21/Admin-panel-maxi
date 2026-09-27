
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Import db AFTER loading environment variables
import db from '../src/db/postgres.js';

async function addSerialNumberColumn() {
    try {
        console.log('🔌 Connecting to database...');
        await db.connect();

        console.log('🔄 Checking serial_number column in products table...');

        // Check if column exists first
        const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='products' AND column_name='serial_number';
    `;
        const checkResult = await db.queryOne(checkQuery);

        if (!checkResult) {
            console.log('📝 Column does not exist. Adding it now...');
            const query = `
        ALTER TABLE products 
        ADD COLUMN serial_number VARCHAR(100);
        `;
            await db.query(query);
            console.log('✅ serial_number column added successfully');
        } else {
            console.log('ℹ️ serial_number column already exists. Skipping.');
        }

    } catch (error) {
        console.error('❌ Error adding column:', error);
    } finally {
        try {
            await db.close();
            console.log('🔌 Database connection closed');
        } catch (e) {
            console.error('Error closing connection:', e);
        }
        process.exit(0);
    }
}

addSerialNumberColumn();
