import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function findAdmins() {
    try {
        const result = await pool.query("SELECT id, email, role FROM users WHERE role = 'admin'");
        console.log('Admin users:');
        if (result.rows.length === 0) {
            console.log('No admin users found.');
        } else {
            result.rows.forEach(u => {
                console.log(`- ${u.email} (ID: ${u.id})`);
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

findAdmins();
