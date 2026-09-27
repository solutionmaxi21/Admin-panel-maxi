/**
 * Database Migration Script: Convert to Bilingual Format
 * 
 * This script converts existing French-only text fields to bilingual format:
 * - category_name: "Text" → { "fr": "Text", "ar": "" }
 * - description: "Text" → { "fr": "Text", "ar": "" }
 * - attribute_name: "Text" → { "fr": "Text", "ar": "" }
 * - promotion_name: "Text" → { "fr": "Text", "ar": "" }
 * 
 * Usage: node migrate-to-bilingual.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database paths (relative to backend/src/scripts/)
const DB_BASE = path.join(__dirname, '..', '..', '..', 'database');
const CATEGORIES_FILE = path.join(DB_BASE, 'catalog', 'categories.json');
const ATTRIBUTES_FILE = path.join(DB_BASE, 'catalog', 'product-attributes.json');
const PROMOTIONS_FILE = path.join(DB_BASE, 'promotions', 'promotions.json');

/**
 * Convert a string field to bilingual format
 * @param {string|object} value - Original value
 * @returns {object} Bilingual object { fr: string, ar: string }
 */
function toBilingual(value) {
    // Already bilingual
    if (value && typeof value === 'object' && (value.fr !== undefined || value.ar !== undefined)) {
        return { fr: value.fr || '', ar: value.ar || '' };
    }

    // Convert string to bilingual (keep French, empty Arabic)
    return { fr: value || '', ar: '' };
}

/**
 * Migrate categories to bilingual format
 */
function migrateCategories() {
    console.log('\n📁 Migrating categories.json...');

    const categories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
    let migratedCount = 0;

    const migrated = categories.map(category => {
        const updated = { ...category };

        // Migrate category_name
        if (typeof category.category_name === 'string') {
            updated.category_name = toBilingual(category.category_name);
            migratedCount++;
        }

        // Migrate description
        if (typeof category.description === 'string') {
            updated.description = toBilingual(category.description);
        }

        return updated;
    });

    // Create backup
    const backupPath = CATEGORIES_FILE.replace('.json', '.backup.json');
    fs.writeFileSync(backupPath, fs.readFileSync(CATEGORIES_FILE));
    console.log(`   ✅ Backup created: ${path.basename(backupPath)}`);

    // Write migrated data
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(migrated, null, 2));
    console.log(`   ✅ Migrated ${migratedCount} categories`);
}

/**
 * Migrate product attributes to bilingual format
 */
function migrateAttributes() {
    console.log('\n📁 Migrating product-attributes.json...');

    const attributes = JSON.parse(fs.readFileSync(ATTRIBUTES_FILE, 'utf8'));
    let migratedCount = 0;

    const migrated = attributes.map(attr => {
        const updated = { ...attr };

        // Migrate attribute_name only (attribute_value stays as-is for technical specs)
        if (typeof attr.attribute_name === 'string') {
            updated.attribute_name = toBilingual(attr.attribute_name);
            migratedCount++;
        }

        return updated;
    });

    // Create backup
    const backupPath = ATTRIBUTES_FILE.replace('.json', '.backup.json');
    fs.writeFileSync(backupPath, fs.readFileSync(ATTRIBUTES_FILE));
    console.log(`   ✅ Backup created: ${path.basename(backupPath)}`);

    // Write migrated data
    fs.writeFileSync(ATTRIBUTES_FILE, JSON.stringify(migrated, null, 2));
    console.log(`   ✅ Migrated ${migratedCount} attribute names`);
}

/**
 * Migrate promotions to bilingual format
 */
function migratePromotions() {
    console.log('\n📁 Migrating promotions.json...');

    const promotions = JSON.parse(fs.readFileSync(PROMOTIONS_FILE, 'utf8'));
    let migratedCount = 0;

    const migrated = promotions.map(promotion => {
        const updated = { ...promotion };

        // Migrate promotion_name
        if (typeof promotion.promotion_name === 'string') {
            updated.promotion_name = toBilingual(promotion.promotion_name);
            migratedCount++;
        }

        // Migrate description
        if (typeof promotion.description === 'string') {
            updated.description = toBilingual(promotion.description);
        }

        return updated;
    });

    // Create backup
    const backupPath = PROMOTIONS_FILE.replace('.json', '.backup.json');
    fs.writeFileSync(backupPath, fs.readFileSync(PROMOTIONS_FILE));
    console.log(`   ✅ Backup created: ${path.basename(backupPath)}`);

    // Write migrated data
    fs.writeFileSync(PROMOTIONS_FILE, JSON.stringify(migrated, null, 2));
    console.log(`   ✅ Migrated ${migratedCount} promotions`);
}

/**
 * Run all migrations
 */
function runMigration() {
    console.log('🚀 Starting Bilingual Migration...');
    console.log('='.repeat(50));

    try {
        migrateCategories();
        migrateAttributes();
        migratePromotions();

        console.log('\n' + '='.repeat(50));
        console.log('✅ Migration completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('   1. Review the migrated files');
        console.log('   2. Fill in Arabic translations (ar field)');
        console.log('   3. Backup files (.backup.json) can be deleted once verified');
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    }
}

// Run migration
runMigration();
