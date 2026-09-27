## 🚀 Quick Start: PostgreSQL Migration

### Step 1: Start PostgreSQL Service

**Option A:** Run as Administrator:
```powershell
# Right-click PowerShell > Run as Administrator
Start-Service postgresql-x64-18
```

**Option B:** Use the batch file:
1. Right-click `start-postgres.bat`
2. Select "Run as Administrator"

**Verify service is running:**
```powershell
Get-Service postgresql-x64-18
# Should show: Status = Running
```

---

### Step 2: Test Database Connection

```bash
node scripts/test-connection.js
```

**Expected output:**
```
✅ CONNECTION TEST PASSED
```

**If connection fails:**
- Check PostgreSQL password matches .env (current: `sm2025mf`)
- Verify DATABASE_URL in .env points to `postgresql://postgres:sm2025mf@localhost:5432/maxistore`

---

### Step 3: Initialize Database Schema

```bash
# Drop existing tables and create fresh schema
node scripts/init-database.js --drop
```

**Expected output:**
```
✅ Database initialization complete!
✓ 22 tables verified
✓ 9 views verified
```

---

### Step 4: Test Migration (Dry Run)

```bash
# Test without inserting data
node scripts/migrate-data.js --dry-run --verbose
```

**What this does:**
- Validates all JSON files exist
- Maps data to PostgreSQL format
- Shows what would be inserted
- Reports any errors

---

### Step 5: Execute Migration

```bash
# Actual data migration
node scripts/migrate-data.js --verbose
```

**Expected output:**
```
✅ Migration completed successfully!
Tables processed: 19
Total records: ~400+
Successful inserts: ~400+
Failed inserts: 0
```

---

### Step 6: Verify Migration

```bash
# Check database statistics
node scripts/init-database.js --stats
```

**Expected counts:**
- Users: 12
- Products: 65
- Orders: 17
- Order Items: 19
- Categories: 31

---

## ✅ Migration Checklist

- [ ] PostgreSQL service running (`Get-Service postgresql-x64-18`)
- [ ] DATABASE_URL configured in `.env`
- [ ] Connection test passes (`test-connection.js`)
- [ ] Schema initialized (`init-database.js --drop`)
- [ ] Dry run successful (`migrate-data.js --dry-run`)
- [ ] Migration executed (`migrate-data.js --verbose`)
- [ ] Data verified (`init-database.js --stats`)

---

## 🔧 Troubleshooting

### PostgreSQL won't start
```powershell
# Check error in Event Viewer
eventvwr

# Or check PostgreSQL logs
notepad "C:\Program Files\PostgreSQL\18\data\log\postgresql-*.log"
```

### Wrong password
```powershell
# Reset postgres password
psql -U postgres
ALTER USER postgres PASSWORD 'sm2025mf';
```

### Database doesn't exist
```bash
# Create database
createdb -U postgres maxistore
```

### Port 5432 in use
```powershell
# Check what's using port 5432
netstat -ano | findstr :5432
```

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `scripts/test-connection.js` | Test PostgreSQL connectivity |
| `scripts/init-database.js` | Create schema |
| `scripts/migrate-data.js` | Import JSON data |
| `scripts/quick-migrate.js` | Automated full migration |
| `start-postgres.bat` | Start PostgreSQL service |
| `MIGRATION_GUIDE.md` | Complete documentation |

---

## 🎯 Next: Run These Commands

```bash
# 1. Start PostgreSQL (as Admin)
.\start-postgres.bat

# 2. Test connection
node scripts/test-connection.js

# 3. Run migration
node scripts/init-database.js --drop
node scripts/migrate-data.js --verbose

# Or use quick migration:
node scripts/quick-migrate.js
```
