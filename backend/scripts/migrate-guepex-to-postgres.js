import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env from backend folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;

class GuepexDataMigration {
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.shippingPath = path.join(__dirname, '../../database/shipping');
    this.stats = {
      wilayas: 0,
      communes: 0,
      centers: 0,
      shipping_fees: 0,
      commune_fees: 0,
      errors: []
    };
  }

  async run() {
    console.log('🚀 Starting Guepex shipping data migration to PostgreSQL...\n');

    try {
      // Step 1: Create tables
      await this.createTables();

      // Step 2: Load and validate JSON data
      const data = await this.loadJSONData();

      // Step 3: Begin transaction
      const client = await this.pool.connect();
      
      try {
        await client.query('BEGIN');
        console.log('📝 Transaction started\n');

        // Step 4: Migrate wilayas
        await this.migrateWilayas(client, data.wilayas);

        // Step 5: Migrate communes
        await this.migrateCommunes(client, data.communes);

        // Step 6: Migrate centers
        await this.migrateCenters(client, data.centers);

        // Step 7: Migrate fees
        await this.migrateFees(client, data.fees);

        // Step 8: Log sync
        await this.logSync(client);

        await client.query('COMMIT');
        console.log('\n✅ Transaction committed successfully\n');

      } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Transaction rolled back due to error');
        throw error;
      } finally {
        client.release();
      }

      // Step 9: Display results
      this.displayResults();

    } catch (error) {
      console.error('\n💥 Migration failed:', error.message);
      throw error;
    } finally {
      await this.pool.end();
    }
  }

  async createTables() {
    console.log('📋 Creating database tables...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, '../sql/005_guepex_shipping_tables.sql'),
      'utf8'
    );

    await this.pool.query(sql);
    console.log('✅ Tables created successfully\n');
  }

  async loadJSONData() {
    console.log('📂 Loading JSON files...');

    const wilayas = JSON.parse(
      fs.readFileSync(path.join(this.shippingPath, 'wilayas.json'), 'utf8')
    );

    const communes = JSON.parse(
      fs.readFileSync(path.join(this.shippingPath, 'communes.json'), 'utf8')
    );

    const centers = JSON.parse(
      fs.readFileSync(path.join(this.shippingPath, 'centers.json'), 'utf8')
    );

    const feesFrom16 = JSON.parse(
      fs.readFileSync(path.join(this.shippingPath, 'fees-from-16.json'), 'utf8')
    );

    const feesFrom21 = JSON.parse(
      fs.readFileSync(path.join(this.shippingPath, 'fees-from-21.json'), 'utf8')
    );

    console.log(`   - Wilayas: ${wilayas.total}`);
    console.log(`   - Communes: ${communes.total}`);
    console.log(`   - Centers: ${centers.total}`);
    console.log(`   - Fee schedules: 2 (Alger + Skikda)\n`);

    return {
      wilayas: wilayas.data,
      communes: communes.data,
      centers: centers.data,
      fees: { from16: feesFrom16, from21: feesFrom21 }
    };
  }

  async migrateWilayas(client, wilayas) {
    console.log('🌍 Migrating wilayas...');

    for (const wilaya of wilayas) {
      try {
        await client.query(
          `INSERT INTO guepex_wilayas (id, name, zone, is_deliverable)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             zone = EXCLUDED.zone,
             is_deliverable = EXCLUDED.is_deliverable,
             last_synced_at = CURRENT_TIMESTAMP`,
          [wilaya.id, wilaya.name, wilaya.zone, wilaya.is_deliverable]
        );
        this.stats.wilayas++;
      } catch (error) {
        this.stats.errors.push(`Wilaya ${wilaya.id}: ${error.message}`);
      }
    }

    console.log(`   ✓ Migrated ${this.stats.wilayas} wilayas`);
  }

  async migrateCommunes(client, communes) {
    console.log('🏘️  Migrating communes...');

    for (const commune of communes) {
      try {
        await client.query(
          `INSERT INTO guepex_communes 
           (id, name, wilaya_id, has_stop_desk, is_deliverable, 
            delivery_time_parcel, delivery_time_payment)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             wilaya_id = EXCLUDED.wilaya_id,
             has_stop_desk = EXCLUDED.has_stop_desk,
             is_deliverable = EXCLUDED.is_deliverable,
             delivery_time_parcel = EXCLUDED.delivery_time_parcel,
             delivery_time_payment = EXCLUDED.delivery_time_payment,
             last_synced_at = CURRENT_TIMESTAMP`,
          [
            commune.id,
            commune.name,
            commune.wilaya_id,
            commune.has_stop_desk,
            commune.is_deliverable,
            commune.delivery_time_parcel,
            commune.delivery_time_payment
          ]
        );
        this.stats.communes++;
      } catch (error) {
        this.stats.errors.push(`Commune ${commune.id}: ${error.message}`);
      }
    }

    console.log(`   ✓ Migrated ${this.stats.communes} communes`);
  }

  async migrateCenters(client, centers) {
    console.log('🏢 Migrating centers...');

    for (const center of centers) {
      try {
        await client.query(
          `INSERT INTO guepex_centers 
           (center_id, name, address, gps, commune_id, wilaya_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (center_id) DO UPDATE SET
             name = EXCLUDED.name,
             address = EXCLUDED.address,
             gps = EXCLUDED.gps,
             commune_id = EXCLUDED.commune_id,
             wilaya_id = EXCLUDED.wilaya_id,
             last_synced_at = CURRENT_TIMESTAMP`,
          [
            center.center_id,
            center.name,
            center.address,
            center.gps,
            center.commune_id,
            center.wilaya_id
          ]
        );
        this.stats.centers++;
      } catch (error) {
        this.stats.errors.push(`Center ${center.center_id}: ${error.message}`);
      }
    }

    console.log(`   ✓ Migrated ${this.stats.centers} centers`);
  }

  async migrateFees(client, fees) {
    console.log('💰 Migrating shipping fees...');

    // Process fees from Alger (16)
    await this.processFeeSchedule(client, fees.from16, 16, 'Alger');

    // Process fees from Skikda (21)
    await this.processFeeSchedule(client, fees.from21, 21, 'Skikda');

    console.log(`   ✓ Migrated ${this.stats.shipping_fees} wilaya fees`);
    console.log(`   ✓ Migrated ${this.stats.commune_fees} commune fees`);
  }

  async processFeeSchedule(client, feeData, fromWilayaId, fromWilayaName) {
    const data = feeData.data;

    for (const toWilayaId in data) {
      const wilayaFee = data[toWilayaId];

      try {
        // Insert wilaya-level fees
        await client.query(
          `INSERT INTO guepex_shipping_fees 
           (from_wilaya_id, to_wilaya_id, zone, retour_fee, 
            cod_percentage, insurance_percentage, oversize_fee)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (from_wilaya_id, to_wilaya_id) DO UPDATE SET
             zone = EXCLUDED.zone,
             retour_fee = EXCLUDED.retour_fee,
             cod_percentage = EXCLUDED.cod_percentage,
             insurance_percentage = EXCLUDED.insurance_percentage,
             oversize_fee = EXCLUDED.oversize_fee,
             last_synced_at = CURRENT_TIMESTAMP`,
          [
            fromWilayaId,
            wilayaFee.to_wilaya_id,
            wilayaFee.zone,
            wilayaFee.retour_fee,
            wilayaFee.cod_percentage,
            wilayaFee.insurance_percentage,
            wilayaFee.oversize_fee
          ]
        );
        this.stats.shipping_fees++;

        // Insert commune-level fees
        const perCommune = wilayaFee.per_commune || {};
        for (const communeId in perCommune) {
          const communeFee = perCommune[communeId];

          try {
            await client.query(
              `INSERT INTO guepex_commune_fees 
               (from_wilaya_id, to_commune_id, express_home, express_desk, 
                economic_home, economic_desk)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (from_wilaya_id, to_commune_id) DO UPDATE SET
                 express_home = EXCLUDED.express_home,
                 express_desk = EXCLUDED.express_desk,
                 economic_home = EXCLUDED.economic_home,
                 economic_desk = EXCLUDED.economic_desk,
                 last_synced_at = CURRENT_TIMESTAMP`,
              [
                fromWilayaId,
                communeFee.commune_id,
                communeFee.express_home,
                communeFee.express_desk,
                communeFee.economic_home,
                communeFee.economic_desk
              ]
            );
            this.stats.commune_fees++;
          } catch (error) {
            this.stats.errors.push(
              `Commune fee ${fromWilayaId}->${communeId}: ${error.message}`
            );
          }
        }

      } catch (error) {
        console.error(`   ⚠️  Wilaya fee error ${fromWilayaId}->${toWilayaId}:`, error.message);
        this.stats.errors.push(
          `Wilaya fee ${fromWilayaId}->${toWilayaId}: ${error.message}`
        );
        throw error; // Re-throw to rollback transaction
      }
    }
  }

  async logSync(client) {
    await client.query(
      `INSERT INTO guepex_sync_log 
       (sync_type, status, wilayas_count, communes_count, centers_count, fees_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'full_migration',
        this.stats.errors.length > 0 ? 'partial' : 'success',
        this.stats.wilayas,
        this.stats.communes,
        this.stats.centers,
        this.stats.shipping_fees + this.stats.commune_fees
      ]
    );
  }

  displayResults() {
    console.log('\n═══════════════════════════════════════');
    console.log('         MIGRATION RESULTS');
    console.log('═══════════════════════════════════════\n');
    console.log(`✅ Wilayas:       ${this.stats.wilayas.toString().padStart(5)}`);
    console.log(`✅ Communes:      ${this.stats.communes.toString().padStart(5)}`);
    console.log(`✅ Centers:       ${this.stats.centers.toString().padStart(5)}`);
    console.log(`✅ Wilaya Fees:   ${this.stats.shipping_fees.toString().padStart(5)}`);
    console.log(`✅ Commune Fees:  ${this.stats.commune_fees.toString().padStart(5)}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️  Errors:        ${this.stats.errors.length.toString().padStart(5)}`);
      console.log('\nFirst 5 errors:');
      this.stats.errors.slice(0, 5).forEach(err => console.log(`   - ${err}`));
    }

    console.log('\n═══════════════════════════════════════\n');
  }
}

// Run migration
const migration = new GuepexDataMigration();
migration.run()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
