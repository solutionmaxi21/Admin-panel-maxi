/**
 * Standalone script to sync Guepex shipping data
 * Run this once to initialize the shipping database
 * 
 * Usage: node sync-shipping-data.js
 */

import dotenv from 'dotenv';
import guepexSync from './src/services/guepex-sync.js';

// Load environment variables from .env file
dotenv.config();

console.log('🚀 Starting Guepex shipping data sync...\n');
console.log('API ID:', process.env.GUEPEX_API_ID ? '✓ Configured' : '✗ Missing');
console.log('API Token:', process.env.GUEPEX_API_TOKEN ? '✓ Configured' : '✗ Missing');
console.log('');

async function main() {
  try {
    console.log('This will fetch data from Guepex API and save to database/shipping/');
    console.log('Estimated time: 1-2 minutes\n');
    
    const result = await guepexSync.syncAll();
    
    console.log('\n✅ Sync completed successfully!');
    console.log('\nSummary:');
    console.log(`- Wilayas: ${result.wilayas} items`);
    console.log(`- Communes: ${result.communes} items`);
    console.log(`- Centers: ${result.centers} items`);
    console.log(`- Fees (from Algiers): ${result.fees[16]?.length || 0} destinations`);
    console.log(`- Fees (from Skikda): ${result.fees[21]?.length || 0} destinations`);
    
    console.log('\n✅ Checkout page should now work!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check your .env file has GUEPEX_API_TOKEN set');
    console.error('2. Verify your Guepex API credentials are valid');
    console.error('3. Check internet connection');
    process.exit(1);
  }
}

main();
