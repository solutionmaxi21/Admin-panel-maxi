import express from 'express';
import db from '../src/db/postgres.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { sensitiveLimiter } from '../src/shared/middleware/rateLimiter.js';

const router = express.Router();

/**
 * Validate SQL identifier (table/column names) — prevents SQL injection
 */
function assertSafeIdentifier(name, label = 'identifier') {
  if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe ${label}: ${name}`);
  }
}

/**
 * Get list of all tables in the database
 */
async function getDatabaseTables() {
  const result = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map(row => row.table_name);
}

/**
 * Export entire database to JSON
 * GET /api/database/export
 */
router.get('/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tables = await getDatabaseTables();
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '1.0',
        databaseName: process.env.POSTGRES_DB || 'store',
        tableCount: tables.length
      },
      data: {}
    };

    // Export each table (table names come from information_schema — safe)
    for (const table of tables) {
      try {
        assertSafeIdentifier(table, 'table name');
        const result = await db.query(`SELECT * FROM ${table}`);
        exportData.data[table] = result.rows;
      } catch (error) {
        console.error(`Error exporting table ${table}:`, error.message);
        exportData.data[table] = { error: 'Export failed', rows: [] };
      }
    }

    // Calculate total records
    const totalRecords = Object.values(exportData.data)
      .filter(data => Array.isArray(data))
      .reduce((sum, data) => sum + data.length, 0);

    exportData.metadata.totalRecords = totalRecords;

    // Set headers for file download
    const filename = `database-export-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.json({
      success: true,
      message: 'Database exported successfully',
      export: exportData
    });
  } catch (error) {
    console.error('Database export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export database',
    });
  }
});

/**
 * Get database statistics
 * GET /api/database/stats
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tables = await getDatabaseTables();
    const stats = {
      tables: [],
      totalRecords: 0,
      databaseSize: null
    };

    // Get row count for each table
    for (const table of tables) {
      try {
        assertSafeIdentifier(table, 'table name');
        const countResult = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        const sizeResult = await db.query(`
          SELECT pg_size_pretty(pg_total_relation_size($1)) as size
        `, [table]);
        
        const count = parseInt(countResult.rows[0].count);
        stats.tables.push({
          name: table,
          rowCount: count,
          size: sizeResult.rows[0].size
        });
        stats.totalRecords += count;
      } catch (error) {
        console.error(`Error getting stats for ${table}:`, error.message);
        stats.tables.push({
          name: table,
          rowCount: 0,
          size: '0 bytes',
        });
      }
    }

    // Get total database size
    try {
      const dbSizeResult = await db.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      stats.databaseSize = dbSizeResult.rows[0].size;
    } catch (error) {
      stats.databaseSize = 'Unknown';
    }

    // Sort by row count descending
    stats.tables.sort((a, b) => b.rowCount - a.rowCount);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get database statistics',
    });
  }
});

/**
 * Import database from JSON
 * POST /api/database/import
 * Body: { data: { table_name: [...rows] }, options: { truncate: boolean, skipErrors: boolean } }
 */
router.post('/import', authenticateToken, requireAdmin, sensitiveLimiter, async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { data, options = {} } = req.body;
    const { truncate = false, skipErrors = true } = options;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid import data. Expected { data: { table_name: [...rows] } }'
      });
    }

    const results = {
      imported: {},
      errors: {},
      summary: {
        tablesProcessed: 0,
        totalRecordsImported: 0,
        totalErrors: 0
      }
    };

    await client.query('BEGIN');

    // Get existing tables
    const existingTables = await getDatabaseTables();

    // Process each table
    for (const [tableName, rows] of Object.entries(data)) {
      if (!Array.isArray(rows)) {
        results.errors[tableName] = 'Invalid data format - expected array';
        continue;
      }

      if (!existingTables.includes(tableName)) {
        results.errors[tableName] = 'Table does not exist in database';
        continue;
      }

      try {
        // Validate table name as safe identifier
        assertSafeIdentifier(tableName, 'table name');

        // Truncate table if requested
        if (truncate) {
          await client.query(`TRUNCATE TABLE ${tableName} CASCADE`);
        }

        let importedCount = 0;
        const tableErrors = [];

        // Insert each row
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          
          try {
            // Validate column names to prevent SQL injection
            const columns = Object.keys(row);
            columns.forEach(col => assertSafeIdentifier(col, 'column name'));
            const values = Object.values(row);
            
            // Build parameterized query
            const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
            const columnNames = columns.join(', ');
            
            const query = `
              INSERT INTO ${tableName} (${columnNames})
              VALUES (${placeholders})
              ON CONFLICT DO NOTHING
            `;
            
            await client.query(query, values);
            importedCount++;
          } catch (rowError) {
            if (skipErrors) {
              tableErrors.push({
                row: i + 1,
                error: 'Row import failed'
              });
            } else {
              throw rowError;
            }
          }
        }

        results.imported[tableName] = {
          totalRows: rows.length,
          imported: importedCount,
          skipped: rows.length - importedCount
        };

        if (tableErrors.length > 0) {
          results.errors[tableName] = tableErrors;
        }

        results.summary.tablesProcessed++;
        results.summary.totalRecordsImported += importedCount;
        results.summary.totalErrors += tableErrors.length;

        console.log(`✓ Imported ${importedCount}/${rows.length} rows into ${tableName}`);
      } catch (tableError) {
        console.error(`Error importing table ${tableName}:`, tableError.message);
        results.errors[tableName] = 'Import failed';
        
        if (!skipErrors) {
          throw tableError;
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Database import completed',
      results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database import error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import database',
    });
  } finally {
    client.release();
  }
});

/**
 * Backup database (creates a timestamped export)
 * POST /api/database/backup
 */
router.post('/backup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tables = await getDatabaseTables();
    const backupData = {
      metadata: {
        backupDate: new Date().toISOString(),
        version: '1.0',
        type: 'full-backup',
        databaseName: process.env.POSTGRES_DB || 'store',
        tableCount: tables.length
      },
      data: {}
    };

    // Export each table
    for (const table of tables) {
      try {
        assertSafeIdentifier(table, 'table name');
        const result = await db.query(`SELECT * FROM ${table}`);
        backupData.data[table] = result.rows;
      } catch (error) {
        console.error(`Error backing up table ${table}:`, error.message);
        backupData.data[table] = { error: 'Backup failed', rows: [] };
      }
    }

    // Calculate total records
    const totalRecords = Object.values(backupData.data)
      .filter(data => Array.isArray(data))
      .reduce((sum, data) => sum + data.length, 0);

    backupData.metadata.totalRecords = totalRecords;

    res.json({
      success: true,
      message: 'Backup created successfully',
      backup: backupData
    });
  } catch (error) {
    console.error('Database backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create backup',
    });
  }
});

/**
 * Restore database from backup
 * POST /api/database/restore
 * Body: { backup: { metadata: {...}, data: {...} } }
 */
router.post('/restore', authenticateToken, requireAdmin, sensitiveLimiter, async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { backup } = req.body;

    if (!backup || !backup.data || typeof backup.data !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup data'
      });
    }

    const results = {
      restored: {},
      errors: {},
      summary: {
        tablesRestored: 0,
        totalRecordsRestored: 0,
        totalErrors: 0
      }
    };

    await client.query('BEGIN');

    // Disable foreign key checks temporarily
    await client.query('SET session_replication_role = replica');

    // Get existing tables
    const existingTables = await getDatabaseTables();

    // Process each table
    for (const [tableName, rows] of Object.entries(backup.data)) {
      if (!Array.isArray(rows)) {
        continue;
      }

      if (!existingTables.includes(tableName)) {
        results.errors[tableName] = 'Table does not exist';
        continue;
      }

      try {
        // Validate table name
        assertSafeIdentifier(tableName, 'table name');

        // Truncate table
        await client.query(`TRUNCATE TABLE ${tableName} CASCADE`);

        let restoredCount = 0;

        // Insert each row
        for (const row of rows) {
          try {
            const columns = Object.keys(row);
            // Validate column names to prevent SQL injection
            columns.forEach(col => assertSafeIdentifier(col, 'column name'));
            const values = Object.values(row);
            const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
            const columnNames = columns.join(', ');
            
            const query = `
              INSERT INTO ${tableName} (${columnNames})
              VALUES (${placeholders})
            `;
            
            await client.query(query, values);
            restoredCount++;
          } catch (rowError) {
            console.error(`Error restoring row in ${tableName}:`, rowError.message);
          }
        }

        results.restored[tableName] = {
          totalRows: rows.length,
          restored: restoredCount
        };

        results.summary.tablesRestored++;
        results.summary.totalRecordsRestored += restoredCount;

        console.log(`✓ Restored ${restoredCount}/${rows.length} rows to ${tableName}`);
      } catch (tableError) {
        console.error(`Error restoring table ${tableName}:`, tableError.message);
        results.errors[tableName] = 'Restore failed';
        results.summary.totalErrors++;
      }
    }

    // Re-enable foreign key checks
    await client.query('SET session_replication_role = DEFAULT');

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Database restored successfully',
      results
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database restore error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore database',
    });
  } finally {
    client.release();
  }
});

export default router;
