/**
 * Script to add shipping dimensions to existing products
 * 
 * Adds the following fields to all products in the catalog:
 * - length_cm: Length in centimeters
 * - width_cm: Width in centimeters
 * - height_cm: Height in centimeters
 * 
 * Note: weight_kg already exists in the schema
 * 
 * Default values are provided for existing products (can be updated via admin panel)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addDimensionsToProducts() {
  const productsPath = path.join(__dirname, '../../../database/catalog/products.json');
  
  try {
    console.log('[Product Migration] Reading products...');
    const data = await fs.readFile(productsPath, 'utf8');
    const products = JSON.parse(data);

    console.log(`[Product Migration] Found ${products.length} products`);

    let updatedCount = 0;

    for (const product of products) {
      let needsUpdate = false;

      // Add dimensions if missing
      if (!('length_cm' in product)) {
        // Estimate based on weight (conservative defaults)
        // Small items (< 2kg): 30x25x10 cm
        // Medium items (2-10kg): 50x40x15 cm
        // Large items (> 10kg): 80x60x30 cm
        const weight = product.weight_kg || 1;
        
        if (weight < 2) {
          product.length_cm = 30;
          product.width_cm = 25;
          product.height_cm = 10;
        } else if (weight < 10) {
          product.length_cm = 50;
          product.width_cm = 40;
          product.height_cm = 15;
        } else {
          product.length_cm = 80;
          product.width_cm = 60;
          product.height_cm = 30;
        }

        needsUpdate = true;
      }

      if (!('width_cm' in product)) {
        const weight = product.weight_kg || 1;
        product.width_cm = weight < 2 ? 25 : (weight < 10 ? 40 : 60);
        needsUpdate = true;
      }

      if (!('height_cm' in product)) {
        const weight = product.weight_kg || 1;
        product.height_cm = weight < 2 ? 10 : (weight < 10 ? 15 : 30);
        needsUpdate = true;
      }

      if (needsUpdate) {
        updatedCount++;
      }
    }

    // Backup original file
    const backupPath = productsPath + '.backup-' + Date.now();
    await fs.copyFile(productsPath, backupPath);
    console.log(`[Product Migration] Backup created: ${backupPath}`);

    // Save updated products
    await fs.writeFile(productsPath, JSON.stringify(products, null, 2));
    console.log(`[Product Migration] ✓ Updated ${updatedCount} products with dimensions`);
    console.log('[Product Migration] Note: These are estimated values. Please update via admin panel with actual measurements.');

  } catch (error) {
    console.error('[Product Migration] Error:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addDimensionsToProducts()
    .then(() => {
      console.log('[Product Migration] Complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Product Migration] Failed:', error);
      process.exit(1);
    });
}

export default addDimensionsToProducts;
