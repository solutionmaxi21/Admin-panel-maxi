import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/db/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('Running Phase 4 Deferred Fixes Migration...');

    try {
        await db.connect();
        const filePath = path.join(__dirname, '009_phase4_cleanup.sql');
        const sql = fs.readFileSync(filePath, 'utf-8');

        await db.query(sql);
        console.log('✓ Migration 009 applied successfully');

    } catch (err) {
        console.error('✗ Migration Failed:', err.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

runMigration();
