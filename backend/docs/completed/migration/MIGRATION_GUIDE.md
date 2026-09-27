# PostgreSQL Migration Guide

## Overview

This guide covers the complete migration process from JSON-based storage to PostgreSQL database for the Algerian Hardware E-Commerce platform.

## Prerequisites

1. **PostgreSQL installed** (version 14+ recommended)
2. **Database created**:
   ```bash
   # Create database
   createdb maxistore
   
   # Or using psql
   psql -U postgres
   CREATE DATABASE maxistore;
   ```

3. **Environment variables configured** in `backend/.env`:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/maxistore
   ```

4. **Dependencies installed**:
   ```bash
   cd backend
   npm install
   ```

## Migration Process

### Step 1: Data Cleanup (✅ Completed)

The database has been cleaned and validated:
- Fixed 85 data quality issues
- Standardized field names
- Resolved foreign key violations
- Validated all constraints

**Verification**:
```bash
node scripts/validate-data.js
```

Expected output: `✅ DATA IS READY FOR POSTGRESQL MIGRATION`

### Step 2: Initialize Database Schema

Create all tables, indexes, and views:

```bash
# Drop existing schema and recreate (CAUTION: DESTRUCTIVE)
node scripts/init-database.js --drop

# Or force recreation
node scripts/init-database.js --force

# View database statistics
node scripts/init-database.js --stats
```

**What this does**:
- Creates 22 tables with proper constraints
- Sets up ENUM types for status fields
- Creates indexes for performance
- Creates views for active records and statistics

**Verification**:
```bash
# Check tables
psql -U postgres -d maxistore -c "\dt"

# Check views
psql -U postgres -d maxistore -c "\dv"
```

### Step 3: Test Migration (Dry Run)

Test the migration without inserting data:

```bash
node scripts/migrate-data.js --dry-run --verbose
```

This will:
- Validate all JSON files exist
- Map data to PostgreSQL format
- Show what would be inserted
- Identify any mapping errors

### Step 4: Execute Migration

Run the actual migration:

```bash
# Standard migration (stops on error)
node scripts/migrate-data.js --verbose

# Continue even if some records fail
node scripts/migrate-data.js --continue-on-error --verbose
```

**Migration Order** (respects foreign keys):
1. Wilayas → Communes → Shipping Centers
2. Suppliers → Categories → Users → Warehouses
3. Products → Attributes → Images → Stock
4. Promotions → Orders → Order Items → Order History
5. Reviews → Favorites → Returns → Return Items

### Step 5: Verify Migration

Check record counts:

```bash
# Get statistics
node scripts/init-database.js --stats

# Or using psql
psql -U postgres -d maxistore -c "
  SELECT 
    'users' as table, COUNT(*) FROM users
  UNION ALL
    SELECT 'products', COUNT(*) FROM products
  UNION ALL
    SELECT 'orders', COUNT(*) FROM orders;
"
```

**Expected Counts** (from cleaned data):
- Users: 12
- Products: 65
- Categories: 31
- Orders: 17
- Order Items: 19
- Reviews: 3

### Step 6: Test Database Queries

Verify data integrity:

```bash
psql -U postgres -d maxistore
```

```sql
-- Check active products with stock
SELECT * FROM product_summary LIMIT 5;

-- Check recent orders
SELECT * FROM order_summary ORDER BY ordered_at DESC LIMIT 5;

-- Check low stock alerts
SELECT * FROM low_stock_alert;

-- Verify foreign keys
SELECT 
  COUNT(*) as total_products,
  COUNT(DISTINCT category_id) as unique_categories,
  COUNT(DISTINCT supplier_id) as unique_suppliers
FROM products;
```

## Rollback Procedure

If migration fails, you can rollback:

```bash
# Method 1: Drop and recreate from scratch
node scripts/init-database.js --drop

# Method 2: Use PostgreSQL backup (if created)
psql -U postgres -d maxistore < backup.sql
```

## Troubleshooting

### Error: "Connection refused"

**Solution**: Ensure PostgreSQL is running
```bash
# Windows
pg_ctl status

# Start if not running
pg_ctl start -D "C:\Program Files\PostgreSQL\14\data"
```

### Error: "Database does not exist"

**Solution**: Create the database first
```bash
createdb maxistore
```

### Error: "relation does not exist"

**Solution**: Initialize schema first
```bash
node scripts/init-database.js --force
```

### Error: "duplicate key value violates unique constraint"

**Cause**: Data already exists in database

**Solution**: Either drop and recreate, or use `--continue-on-error`

### Migration Log

All migrations create a log file: `backend/scripts/migration-log.json`

Check this file for detailed error information:
```bash
cat backend/scripts/migration-log.json
```

## Post-Migration Tasks

### 1. Update Backend Routes

Replace JSON database calls with PostgreSQL queries:

```javascript
// OLD (JSON)
const db = loadDatabase();
const products = db.products;

// NEW (PostgreSQL)
import db from '../src/db/postgres.js';
const products = await db.queryMany('SELECT * FROM active_products');
```

### 2. Create Repository Layer

Example product repository:

```javascript
// backend/src/repositories/products.repo.js
import db from '../db/postgres.js';

export const ProductRepository = {
  async findAll() {
    return await db.queryMany('SELECT * FROM active_products');
  },
  
  async findById(id) {
    return await db.queryOne('SELECT * FROM products WHERE id = $1', [id]);
  },
  
  async create(product) {
    const result = await db.queryOne(
      `INSERT INTO products (...) VALUES (...) RETURNING *`,
      [...]
    );
    return result;
  }
};
```

### 3. Update API Routes

```javascript
// backend/routes/products.js
import { ProductRepository } from '../src/repositories/products.repo.js';

router.get('/products', async (req, res) => {
  try {
    const products = await ProductRepository.findAll();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 4. Archive JSON Database

Once migration is verified and routes are updated:

```bash
# Create archive
mkdir -p database/archive
tar -czf database/archive/json-backup-$(date +%Y%m%d).tar.gz database/*.json

# Or on Windows
tar -czf database/archive/json-backup.tar.gz database/*.json
```

## Performance Optimization

### 1. Analyze Tables

After migration, update PostgreSQL statistics:

```sql
ANALYZE;
```

### 2. Add Additional Indexes

If queries are slow, add targeted indexes:

```sql
-- Example: Index on product search
CREATE INDEX idx_products_search ON products 
USING gin(to_tsvector('english', product_name || ' ' || COALESCE(description, '')));
```

### 3. Connection Pooling

The connection pool is configured in `backend/src/db/postgres.js`:

```javascript
max: 20,  // Maximum connections
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 10000
```

Adjust based on your load.

## Backup Strategy

### Automated Backups

Create a backup script:

```bash
#!/bin/bash
# backup-db.sh
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/maxistore_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR
pg_dump -U postgres maxistore > $BACKUP_FILE
gzip $BACKUP_FILE

echo "Backup created: $BACKUP_FILE.gz"

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

Schedule with cron (Linux/Mac) or Task Scheduler (Windows).

### Manual Backup

```bash
# Backup
pg_dump -U postgres maxistore > backup.sql

# Restore
psql -U postgres maxistore < backup.sql
```

## Migration Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created
- [ ] Environment variables configured
- [ ] Data cleanup completed (`validate-data.js` passes)
- [ ] Schema initialized (`init-database.js`)
- [ ] Dry run successful (`migrate-data.js --dry-run`)
- [ ] Migration executed (`migrate-data.js`)
- [ ] Record counts verified
- [ ] Sample queries tested
- [ ] Backend routes updated
- [ ] JSON database archived
- [ ] Backup strategy configured

## Support

If you encounter issues:

1. Check migration log: `backend/scripts/migration-log.json`
2. Review PostgreSQL logs
3. Verify data with validation script
4. Check foreign key constraints

## Next Steps

After successful migration:

1. **Integrate with Backend**: Update all routes to use PostgreSQL
2. **Test Thoroughly**: Run end-to-end tests
3. **Monitor Performance**: Use PostgreSQL's query analyzer
4. **Set Up Monitoring**: Consider pgAdmin or similar tools
5. **Schedule Backups**: Automate database backups
