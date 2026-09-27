import db from './src/db/postgres.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'migrations', '005_update_collections_images.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying migration:', sqlPath);
        await db.query(sql);
        console.log('✓ Migration applied successfully');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
