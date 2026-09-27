# Database Duplication Fixes - Implementation Guide

**Date:** January 5, 2026  
**Status:** ✅ Implementation Complete  
**Priority:** CRITICAL

## Executive Summary

Fixed critical database duplication issues where shipping tables (wilayas, communes, shipping_centers, shipping_tariffs) were defined twice:
1. In `001_schema.sql` (legacy, empty tables)
2. In `005_guepex_shipping_tables.sql` as `guepex_*` tables (actively synced with Guepex API)

This caused application code to query empty tables while Guepex data populated separate tables.

---

## Changes Implemented

### ✅ 1. Commented Out Duplicate Tables
**File:** [backend/sql/001_schema.sql](backend/sql/001_schema.sql)

- Commented out legacy shipping table definitions (lines 23-82)
- Added clear deprecation notices pointing to active tables
- Preserved original schema as comments for reference

**Impact:** Prevents creation of duplicate empty tables on fresh installations.

### ✅ 2. Added Foreign Key Constraints
**File:** [backend/sql/003_guepex_migration.sql](backend/sql/003_guepex_migration.sql)

Added missing foreign key constraints to orders table:
```sql
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_wilaya 
    FOREIGN KEY (delivery_wilaya_id) REFERENCES guepex_wilayas(id) ON DELETE SET NULL;
    
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_delivery_commune 
    FOREIGN KEY (delivery_commune_id) REFERENCES guepex_communes(id) ON DELETE SET NULL;
```

**Impact:** Enforces referential integrity between orders and shipping location data.

### ✅ 3. Updated Application Queries
**File:** [backend/routes/shipping-v2.js](backend/routes/shipping-v2.js)

Updated all database queries to use correct table names:
- `FROM wilayas` → `FROM guepex_wilayas`
- `FROM communes` → `FROM guepex_communes`
- `FROM shipping_centers` → `FROM guepex_centers`
- Updated JOINs to reference correct tables

**Impact:** Application now queries tables that actually contain data.

### ✅ 4. Created Migration Scripts

#### Option A: Create Views (RECOMMENDED - Safer)
**File:** [backend/sql/006_create_standard_views.sql](backend/sql/006_create_standard_views.sql)

Creates views with standard names that reference `guepex_*` tables:
- Allows both old and new code to work simultaneously
- No data migration needed
- Easy rollback
- Gradual code migration possible

#### Option B: Rename Tables (More Aggressive)
**File:** [backend/sql/006_rename_guepex_tables.sql](backend/sql/006_rename_guepex_tables.sql)

Physically renames `guepex_*` tables to standard names:
- More permanent solution
- Requires all code to be updated
- Creates backward compatibility views
- Cleaner final schema

---

## How to Apply

### For Existing Databases

**RECOMMENDED APPROACH - Use Views:**

1. **Backup your database first**
   ```powershell
   pg_dump -U postgres -d your_database > backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql
   ```

2. **Apply the view creation migration**
   ```powershell
   cd backend
   psql -U postgres -d your_database -f sql/006_create_standard_views.sql
   ```

3. **Verify views work**
   ```sql
   SELECT 'wilayas' as table_name, COUNT(*) FROM wilayas
   UNION ALL SELECT 'communes', COUNT(*) FROM communes
   UNION ALL SELECT 'centers', COUNT(*) FROM centers;
   ```

4. **Update application code gradually** (see Files to Update section)

### For Fresh Installations

The fixes in `001_schema.sql` prevent duplicate tables from being created. No additional migration needed.

---

## Files That Reference Guepex Tables

These files currently use `guepex_*` table names and can be optionally updated:

### ✅ Already Updated
- [backend/routes/shipping-v2.js](backend/routes/shipping-v2.js) - Updated all queries

### 🔄 Can Be Updated (Optional with Views Approach)
- [backend/src/services/shipping-calculator-pg.js](backend/src/services/shipping-calculator-pg.js)
  - Lines 53-55: `guepex_commune_fees`, `guepex_shipping_fees`, `guepex_communes`
  - Lines 97-98: `guepex_communes`, `guepex_wilayas`
  - Lines 349-350: `guepex_communes`, `guepex_wilayas`
  - Lines 373: `guepex_communes`

- [backend/src/services/guepex-sync.js](backend/src/services/guepex-sync.js)
  - Contains INSERT/UPDATE statements for `guepex_*` tables
  - Should continue using `guepex_*` names OR be updated if tables are renamed

### No Changes Needed
- Files that already use the views will work automatically
- New code should reference standard table names (wilayas, communes, centers)

---

## Benefits of This Approach

### ✅ Fixed Issues
- ❌ **Before:** Application queried empty `wilayas` table
- ✅ **After:** Application queries `guepex_wilayas` with actual data

- ❌ **Before:** No foreign key constraints on orders table
- ✅ **After:** Proper referential integrity enforced

- ❌ **Before:** Duplicate table definitions caused confusion
- ✅ **After:** Single source of truth clearly documented

### 📊 Data Integrity
- Foreign key constraints prevent orphaned order records
- Database enforces relationship between orders and delivery locations
- Prevents invalid wilaya_id/commune_id values

### 🔄 Backward Compatibility
- With views approach, existing code continues to work
- Gradual migration of application code possible
- Easy to test changes incrementally

---

## Verification Steps

After applying migrations, run these checks:

### 1. Check Tables Exist
```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name IN ('wilayas', 'communes', 'centers', 
                     'guepex_wilayas', 'guepex_communes', 'guepex_centers')
ORDER BY table_name;
```

Expected result with views approach:
- `guepex_wilayas` - BASE TABLE
- `guepex_communes` - BASE TABLE  
- `guepex_centers` - BASE TABLE
- `wilayas` - VIEW
- `communes` - VIEW
- `centers` - VIEW

### 2. Check Foreign Keys
```sql
SELECT conname, conrelid::regclass, confrelid::regclass 
FROM pg_constraint 
WHERE contype = 'f' 
  AND conrelid = 'orders'::regclass 
  AND conname LIKE '%wilaya%' OR conname LIKE '%commune%';
```

Expected result:
- `fk_orders_delivery_wilaya` - orders → guepex_wilayas
- `fk_orders_delivery_commune` - orders → guepex_communes

### 3. Test Queries
```sql
-- Should return data from Guepex sync
SELECT COUNT(*) FROM wilayas; -- Should be 58 (Algerian wilayas)
SELECT COUNT(*) FROM communes; -- Should be 1500+ communes
SELECT COUNT(*) FROM centers; -- Should have Guepex centers

-- Test JOIN queries work
SELECT w.name, COUNT(c.id) as commune_count
FROM wilayas w
LEFT JOIN communes c ON c.wilaya_id = w.id
GROUP BY w.id, w.name
ORDER BY w.name;
```

### 4. Test Application
```bash
# Start backend
cd backend
node server.js

# Test API endpoints
curl http://localhost:5000/api/v2/shipping/wilayas
curl http://localhost:5000/api/v2/shipping/communes
curl http://localhost:5000/api/v2/shipping/centers
```

---

## Rollback Plan

If issues occur after applying view migration:

```sql
-- Drop views
DROP VIEW IF EXISTS wilayas CASCADE;
DROP VIEW IF EXISTS communes CASCADE;
DROP VIEW IF EXISTS centers CASCADE;
DROP VIEW IF EXISTS shipping_centers CASCADE;
DROP VIEW IF EXISTS shipping_fees CASCADE;
DROP VIEW IF EXISTS commune_fees CASCADE;

-- Drop foreign key constraints
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_wilaya;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_commune;

-- Restore from backup
-- psql -U postgres -d your_database < backup_file.sql
```

---

## Next Steps (Optional Improvements)

### 1. Update Shipping Calculator Service
File: `backend/src/services/shipping-calculator-pg.js`

Replace `guepex_*` references with standard names:
```javascript
// Before
FROM guepex_communes c
JOIN guepex_wilayas w ON w.id = c.wilaya_id

// After  
FROM communes c
JOIN wilayas w ON w.id = c.wilaya_id
```

### 2. Consider Full Table Rename
After all application code is updated and tested:
- Run `006_rename_guepex_tables.sql` to physically rename tables
- Remove the `guepex_` prefix from all table names
- Keep backward compatibility views temporarily
- Eventually remove views once all references are updated

### 3. Update Prisma Schema
If using Prisma ORM, update `backend/prisma/schema.prisma`:
```prisma
model Wilaya {
  id            Int      @id
  name          String   @unique
  zone          Int
  isDeliverable Boolean  @map("is_deliverable")
  lastSyncedAt  DateTime @default(now()) @map("last_synced_at")
  
  @@map("guepex_wilayas") // or "wilayas" after rename
}
```

---

## Performance Considerations

### Views Have Minimal Overhead
- PostgreSQL views are query macros, not materialized
- No additional storage required
- Query performance identical to direct table access
- Views are expanded at query time

### Indexes Still Work
- All indexes on `guepex_*` tables work through views
- Query planner uses same execution plans
- No performance degradation

### When to Materialize
Consider materialized views only if:
- Adding complex aggregations
- Joining many tables
- Need query caching

Current simple views need no materialization.

---

## Troubleshooting

### Issue: "relation 'wilayas' does not exist"
**Solution:** Apply `006_create_standard_views.sql` migration

### Issue: "foreign key constraint violation"
**Solution:** Ensure `guepex_wilayas` and `guepex_communes` tables are populated from Guepex API sync

### Issue: "view is not updatable"
**Solution:** Views are read-only. Insert/update/delete operations must target base tables (`guepex_*`)

### Issue: Old tables have data
**Solution:** 
```sql
-- Check if old tables have data
SELECT COUNT(*) FROM wilayas; -- Check old table

-- If they have data, export it first
COPY wilayas TO '/tmp/wilayas_backup.csv' WITH CSV HEADER;

-- Then manually drop
DROP TABLE IF EXISTS wilayas CASCADE;
```

---

## Summary

| Item | Status | Priority |
|------|--------|----------|
| Comment out duplicate tables | ✅ Complete | Critical |
| Add foreign key constraints | ✅ Complete | Critical |
| Update shipping-v2.js queries | ✅ Complete | Critical |
| Create view migration script | ✅ Complete | High |
| Create rename migration script | ✅ Complete | Medium |
| Update shipping calculator | ⏸️ Optional | Low |
| Full table rename | ⏸️ Optional | Low |

**Status:** ✅ Critical fixes implemented and ready to deploy

**Recommended Action:** Apply `006_create_standard_views.sql` to existing databases
