/**
 * Guepex Data Synchronization Service
 * 
 * Fetches and caches Guepex reference data (wilayas, communes, centers, fees)
 * to local JSON files. This minimizes API calls and improves performance.
 * 
 * Should be run:
 * - Once on initial setup
 * - Nightly via cron job (3 AM)
 * - Monthly for communes/centers (data rarely changes)
 * - Daily for fees (prices may fluctuate)
 * 
 * Performance:
 * - Handles pagination automatically for large datasets
 * - Batches requests to respect rate limits
 * - Saves incrementally to prevent data loss
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import guepexClient from './guepex-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GuepexSyncService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../../database/shipping');
    this.warehouseAlgiersId = parseInt(process.env.WAREHOUSE_ALGIERS_WILAYA_ID) || 16;
    this.warehouseHarrouchId = parseInt(process.env.WAREHOUSE_HARROUCH_WILAYA_ID) || 21;
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('[Guepex Sync] Failed to create data directory:', error);
      throw error;
    }
  }

  /**
   * Fetch all pages of a paginated endpoint
   * @private
   */
  async fetchAllPages(fetchFunction, options = {}) {
    const allData = [];
    let page = 1;
    let hasMore = true;
    const pageSize = options.pageSize || 1000; // Max allowed by API

    console.log(`[Guepex Sync] Fetching paginated data...`);

    while (hasMore) {
      try {
        const response = await fetchFunction({
          ...options,
          page,
          page_size: pageSize
        });

        if (response.data && response.data.data) {
          allData.push(...response.data.data);
          hasMore = response.data.has_more;
          
          console.log(`[Guepex Sync] Page ${page}: fetched ${response.data.data.length} items (total: ${allData.length}/${response.data.total_data || 'unknown'})`);
          
          page++;
        } else {
          hasMore = false;
        }

        // Small delay between pages
        if (hasMore) {
          await this.sleep(500);
        }
      } catch (error) {
        console.error(`[Guepex Sync] Error fetching page ${page}:`, error.message);
        throw error;
      }
    }

    return allData;
  }

  /**
   * Sync wilayas (58 wilayas in Algeria)
   */
  async syncWilayas() {
    console.log('[Guepex Sync] Syncing wilayas...');
    
    try {
      const response = await guepexClient.getWilayas({
        page_size: 100,
        order_by: 'id',
        asc: true
      });

      const wilayas = response.data.data;
      
      if (!wilayas || wilayas.length === 0) {
        throw new Error('No wilayas data received from API');
      }

      const filePath = path.join(this.dataDir, 'wilayas.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          last_updated: new Date().toISOString(),
          total: wilayas.length,
          data: wilayas
        }, null, 2)
      );

      console.log(`[Guepex Sync] ✓ Synced ${wilayas.length} wilayas`);
      return wilayas;
    } catch (error) {
      console.error('[Guepex Sync] Failed to sync wilayas:', error.message);
      throw error;
    }
  }

  /**
   * Sync communes (1541 communes in Algeria - requires pagination)
   */
  async syncCommunes() {
    console.log('[Guepex Sync] Syncing communes...');
    
    try {
      const communes = await this.fetchAllPages(
        (opts) => guepexClient.getCommunes(opts),
        { order_by: 'id', asc: true }
      );

      if (!communes || communes.length === 0) {
        throw new Error('No communes data received from API');
      }

      // Save main communes file
      const filePath = path.join(this.dataDir, 'communes.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          last_updated: new Date().toISOString(),
          total: communes.length,
          data: communes
        }, null, 2)
      );

      // Create indexed version by wilaya for faster lookups
      const byWilaya = {};
      for (const commune of communes) {
        if (!byWilaya[commune.wilaya_id]) {
          byWilaya[commune.wilaya_id] = [];
        }
        byWilaya[commune.wilaya_id].push(commune);
      }

      const indexPath = path.join(this.dataDir, 'communes-by-wilaya.json');
      await fs.writeFile(
        indexPath,
        JSON.stringify({
          last_updated: new Date().toISOString(),
          data: byWilaya
        }, null, 2)
      );

      console.log(`[Guepex Sync] ✓ Synced ${communes.length} communes`);
      return communes;
    } catch (error) {
      console.error('[Guepex Sync] Failed to sync communes:', error.message);
      throw error;
    }
  }

  /**
   * Sync centers (stop desks - ~99 centers)
   */
  async syncCenters() {
    console.log('[Guepex Sync] Syncing centers...');
    
    try {
      const response = await guepexClient.getCenters({
        page_size: 200,
        order_by: 'wilaya_id',
        asc: true
      });

      const centers = response.data.data;

      if (!centers || centers.length === 0) {
        throw new Error('No centers data received from API');
      }

      // Save main centers file
      const filePath = path.join(this.dataDir, 'centers.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          last_updated: new Date().toISOString(),
          total: centers.length,
          data: centers
        }, null, 2)
      );

      // Create indexed version by wilaya
      const byWilaya = {};
      for (const center of centers) {
        if (!byWilaya[center.wilaya_id]) {
          byWilaya[center.wilaya_id] = [];
        }
        byWilaya[center.wilaya_id].push(center);
      }

      const indexPath = path.join(this.dataDir, 'centers-by-wilaya.json');
      await fs.writeFile(
        indexPath,
        JSON.stringify({
          last_updated: new Date().toISOString(),
          data: byWilaya
        }, null, 2)
      );

      console.log(`[Guepex Sync] ✓ Synced ${centers.length} centers`);
      return centers;
    } catch (error) {
      console.error('[Guepex Sync] Failed to sync centers:', error.message);
      throw error;
    }
  }

  /**
   * Sync fees from a source warehouse to all destination wilayas
   */
  async syncFeesFromWarehouse(warehouseId, warehouseName, wilayas) {
    console.log(`[Guepex Sync] Syncing fees from ${warehouseName} (${warehouseId})...`);
    
    const allFees = {};
    let successCount = 0;
    let errorCount = 0;

    for (const wilaya of wilayas) {
      // Include same-wilaya routes (intra-wilaya deliveries are valid)

      try {
        const response = await guepexClient.getFees(warehouseId, wilaya.id);
        
        if (response.data) {
          allFees[wilaya.id] = {
            to_wilaya_id: wilaya.id,
            to_wilaya_name: wilaya.name,
            ...response.data
          };
          successCount++;
        }

        // Delay between requests to respect rate limits
        await this.sleep(300);
      } catch (error) {
        console.error(`[Guepex Sync] Error fetching fees ${warehouseId} → ${wilaya.id}:`, error.message);
        errorCount++;
        
        // Continue with other wilayas even if one fails
        continue;
      }
    }

    // Save fees data
    const filename = `fees-from-${warehouseId}.json`;
    const filePath = path.join(this.dataDir, filename);
    await fs.writeFile(
      filePath,
      JSON.stringify({
        last_updated: new Date().toISOString(),
        from_wilaya_id: warehouseId,
        from_wilaya_name: warehouseName,
        total_destinations: successCount,
        errors: errorCount,
        data: allFees
      }, null, 2)
    );

    console.log(`[Guepex Sync] ✓ Synced fees from ${warehouseName}: ${successCount} destinations (${errorCount} errors)`);
    return allFees;
  }

  /**
   * Sync all fees for both warehouses
   */
  async syncAllFees() {
    console.log('[Guepex Sync] Syncing shipping fees...');
    
    try {
      // Load wilayas (need to fetch if not cached)
      let wilayas;
      const wilayasPath = path.join(this.dataDir, 'wilayas.json');
      
      try {
        const wilayasData = await fs.readFile(wilayasPath, 'utf8');
        wilayas = JSON.parse(wilayasData).data;
      } catch {
        // Wilayas not cached, fetch them
        console.log('[Guepex Sync] Wilayas not cached, fetching...');
        wilayas = await this.syncWilayas();
      }

      // Sync fees from Algiers warehouse
      await this.syncFeesFromWarehouse(
        this.warehouseAlgiersId,
        'Alger',
        wilayas
      );

      // Sync fees from Harrouch warehouse
      await this.syncFeesFromWarehouse(
        this.warehouseHarrouchId,
        'Skikda',
        wilayas
      );

      console.log('[Guepex Sync] ✓ All fees synced');
    } catch (error) {
      console.error('[Guepex Sync] Failed to sync fees:', error.message);
      throw error;
    }
  }

  /**
   * Full sync - all data
   */
  async syncAll() {
    console.log('═══════════════════════════════════════════');
    console.log('[Guepex Sync] Starting full data sync...');
    console.log('═══════════════════════════════════════════');
    
    await this.ensureDataDir();
    
    const results = {
      success: [],
      errors: []
    };

    // Sync in order: wilayas → communes → centers → fees
    try {
      await this.syncWilayas();
      results.success.push('wilayas');
    } catch (error) {
      results.errors.push({ entity: 'wilayas', error: error.message });
    }

    try {
      await this.syncCommunes();
      results.success.push('communes');
    } catch (error) {
      results.errors.push({ entity: 'communes', error: error.message });
    }

    try {
      await this.syncCenters();
      results.success.push('centers');
    } catch (error) {
      results.errors.push({ entity: 'centers', error: error.message });
    }

    try {
      await this.syncAllFees();
      results.success.push('fees');
    } catch (error) {
      results.errors.push({ entity: 'fees', error: error.message });
    }

    console.log('═══════════════════════════════════════════');
    console.log('[Guepex Sync] Sync complete!');
    console.log(`  ✓ Success: ${results.success.join(', ')}`);
    if (results.errors.length > 0) {
      console.log(`  ✗ Errors: ${results.errors.length}`);
      results.errors.forEach(e => console.log(`    - ${e.entity}: ${e.error}`));
    }
    console.log('═══════════════════════════════════════════');

    // Save sync log
    const logPath = path.join(this.dataDir, 'sync-log.json');
    const logs = [];
    try {
      const existingLogs = await fs.readFile(logPath, 'utf8');
      logs.push(...JSON.parse(existingLogs));
    } catch {
      // No existing log
    }

    logs.unshift({
      timestamp: new Date().toISOString(),
      results
    });

    // Keep only last 30 sync logs
    await fs.writeFile(
      logPath,
      JSON.stringify(logs.slice(0, 30), null, 2)
    );

    return results;
  }

  /**
   * Quick sync - only fees (for daily updates)
   */
  async quickSync() {
    console.log('[Guepex Sync] Quick sync - fees only');
    await this.ensureDataDir();
    await this.syncAllFees();
    console.log('[Guepex Sync] Quick sync complete');
  }

  /**
   * Check if data needs updating
   */
  async needsUpdate(maxAgeHours = 24) {
    try {
      const wilayasPath = path.join(this.dataDir, 'wilayas.json');
      const data = await fs.readFile(wilayasPath, 'utf8');
      const parsed = JSON.parse(data);
      
      const lastUpdate = new Date(parsed.last_updated);
      const age = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60); // hours
      
      return age > maxAgeHours;
    } catch {
      // No data or error reading - needs update
      return true;
    }
  }

  /**
   * Get sync status
   */
  async getStatus() {
    const status = {
      wilayas: await this.getFileStatus('wilayas.json'),
      communes: await this.getFileStatus('communes.json'),
      centers: await this.getFileStatus('centers.json'),
      fees_algiers: await this.getFileStatus(`fees-from-${this.warehouseAlgiersId}.json`),
      fees_harrouch: await this.getFileStatus(`fees-from-${this.warehouseHarrouchId}.json`)
    };

    return status;
  }

  /**
   * Get file status
   * @private
   */
  async getFileStatus(filename) {
    try {
      const filePath = path.join(this.dataDir, filename);
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      const stats = await fs.stat(filePath);
      
      return {
        exists: true,
        last_updated: parsed.last_updated,
        total_records: parsed.total || Object.keys(parsed.data || {}).length,
        file_size: `${Math.round(stats.size / 1024)}KB`,
        age_hours: Math.round((Date.now() - new Date(parsed.last_updated).getTime()) / (1000 * 60 * 60))
      };
    } catch {
      return {
        exists: false,
        last_updated: null,
        total_records: 0,
        file_size: '0KB',
        age_hours: null
      };
    }
  }

  /**
   * Sleep utility
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const guepexSync = new GuepexSyncService();

export default guepexSync;

// CLI support - run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'full':
          await guepexSync.syncAll();
          break;
        case 'quick':
          await guepexSync.quickSync();
          break;
        case 'status':
          const status = await guepexSync.getStatus();
          console.log(JSON.stringify(status, null, 2));
          break;
        default:
          console.log('Usage: node guepex-sync.js [full|quick|status]');
          console.log('  full   - Sync all data (wilayas, communes, centers, fees)');
          console.log('  quick  - Sync fees only');
          console.log('  status - Check sync status');
          process.exit(1);
      }
      process.exit(0);
    } catch (error) {
      console.error('Sync failed:', error);
      process.exit(1);
    }
  })();
}
