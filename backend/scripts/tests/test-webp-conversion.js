/**
 * WebP Image Conversion Test Script
 * 
 * Tests that uploaded images are automatically converted to WebP format.
 * 
 * Usage: node test-webp-conversion.js
 * 
 * Prerequisites:
 * - Backend server running on port 3001
 * - Admin credentials in .env (or use defaults below)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@maxistore.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!';

// ANSI colors for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) { log(`✅ ${message}`, 'green'); }
function error(message) { log(`❌ ${message}`, 'red'); }
function info(message) { log(`ℹ️  ${message}`, 'cyan'); }
function warn(message) { log(`⚠️  ${message}`, 'yellow'); }

/**
 * Create a simple test PNG image (1x1 red pixel)
 */
function createTestImage() {
    // Minimal valid PNG: 1x1 red pixel
    const pngHeader = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xDD,
        0x8D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, // IEND chunk
        0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    return pngHeader;
}

/**
 * Login as admin and get JWT token
 */
async function getAdminToken() {
    info('Logging in as admin...');

    const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, isAdmin: true })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Login failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    return data.token || data.accessToken;
}

/**
 * Upload a test image and verify it's converted to WebP
 */
async function testProductImageUpload(token) {
    info('Testing product image upload...');

    const imageBuffer = createTestImage();
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('image', blob, 'test-image.png');

    const response = await fetch(`${API_BASE}/api/products/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${text}`);
    }

    const data = await response.json();

    // Verify response
    if (!data.data || !data.data.filename) {
        throw new Error('Response missing filename');
    }

    const filename = data.data.filename;
    info(`Uploaded file: ${filename}`);

    // Check if filename ends with .webp
    if (filename.endsWith('.webp')) {
        success('Product image converted to WebP format!');
    } else {
        error(`Image NOT converted to WebP. Got: ${filename}`);
        return false;
    }

    // Verify file exists on disk
    const uploadPath = path.join(__dirname, 'uploads', 'products', filename);
    if (fs.existsSync(uploadPath)) {
        const stats = fs.statSync(uploadPath);
        success(`File exists on disk: ${uploadPath} (${stats.size} bytes)`);

        // Clean up test file
        fs.unlinkSync(uploadPath);
        info('Test file cleaned up');
    } else {
        warn(`File not found at expected path: ${uploadPath}`);
    }

    return true;
}

/**
 * Upload a test category image
 */
async function testCategoryImageUpload(token) {
    info('Testing category image upload...');

    const imageBuffer = createTestImage();
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('image', blob, 'test-category.png');

    const response = await fetch(`${API_BASE}/api/categories/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${text}`);
    }

    const data = await response.json();

    if (!data.data || !data.data.filename) {
        throw new Error('Response missing filename');
    }

    const filename = data.data.filename;
    info(`Uploaded file: ${filename}`);

    if (filename.endsWith('.webp')) {
        success('Category image converted to WebP format!');
    } else {
        error(`Image NOT converted to WebP. Got: ${filename}`);
        return false;
    }

    // Verify file exists and clean up
    const uploadPath = path.join(__dirname, 'uploads', 'categories', filename);
    if (fs.existsSync(uploadPath)) {
        const stats = fs.statSync(uploadPath);
        success(`File exists on disk: ${uploadPath} (${stats.size} bytes)`);
        fs.unlinkSync(uploadPath);
        info('Test file cleaned up');
    }

    return true;
}

/**
 * Main test runner
 */
async function runTests() {
    log('\n========================================', 'bold');
    log('  WebP Image Conversion Test Suite', 'bold');
    log('========================================\n', 'bold');

    let passed = 0;
    let failed = 0;

    try {
        // Get admin token
        const token = await getAdminToken();
        success('Admin login successful\n');

        // Test 1: Product image upload
        log('--- Test 1: Product Image Upload ---', 'yellow');
        try {
            const result = await testProductImageUpload(token);
            if (result) passed++; else failed++;
        } catch (err) {
            error(`Test failed: ${err.message}`);
            failed++;
        }

        console.log();

        // Test 2: Category image upload
        log('--- Test 2: Category Image Upload ---', 'yellow');
        try {
            const result = await testCategoryImageUpload(token);
            if (result) passed++; else failed++;
        } catch (err) {
            error(`Test failed: ${err.message}`);
            failed++;
        }

    } catch (err) {
        error(`Setup failed: ${err.message}`);
        failed = 2;
    }

    // Summary
    log('\n========================================', 'bold');
    log('  Test Results', 'bold');
    log('========================================', 'bold');
    log(`  Passed: ${passed}`, passed > 0 ? 'green' : 'reset');
    log(`  Failed: ${failed}`, failed > 0 ? 'red' : 'reset');
    log('========================================\n', 'bold');

    process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(err => {
    error(`Unexpected error: ${err.message}`);
    process.exit(1);
});
