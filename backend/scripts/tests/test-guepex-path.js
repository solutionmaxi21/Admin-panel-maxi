
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simulate the path logic in guepex-shipment.js
// guepex-shipment.js is in backend/src/services
// We are in backend/
// So we need to adjust potential relative paths

// Option 1: As if we are inside src/services
const mockDirName = path.join(__dirname, 'src', 'services');
const targetPath = path.join(mockDirName, '../../../database/shipping/communes.json');

console.log('Current __dirname:', __dirname);
console.log('Mock __dirname:', mockDirName);
console.log('Target Path:', targetPath);

async function checkFile() {
    try {
        const stats = await fs.stat(targetPath);
        console.log('File exists! Size:', stats.size);
    } catch (err) {
        console.error('File NOT found:', err.message);
    }
}

checkFile();
