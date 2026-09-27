/**
 * PostgreSQL Performance Analysis Script
 * Comprehensive database health check and performance diagnostics
 */

import db from '../src/db/postgres.js';

const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  BOLD: '\x1b[1m'
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, COLORS.BOLD + COLORS.CYAN);
  console.log('='.repeat(80));
}

async function checkDatabaseVersion() {
  section('DATABASE VERSION & CONFIGURATION');

  const version = await db.queryOne('SELECT version()');
  log(`PostgreSQL Version: ${version.version}`, COLORS.GREEN);

  // Check important settings
  const settings = await db.queryMany(`
    SELECT name, setting, unit, short_desc
    FROM pg_settings
    WHERE name IN (
      'max_connections',
      'shared_buffers',
      'effective_cache_size',
      'maintenance_work_mem',
      'work_mem',
      'random_page_cost',
      'effective_io_concurrency',
      'wal_buffers',
      'default_statistics_target',
      'checkpoint_completion_target'
    )
    ORDER BY name
  `);

  console.log('\nKey Configuration Settings:');
  settings.forEach(s => {
    const value = s.unit ? `${s.setting} ${s.unit}` : s.setting;
    console.log(`  ${s.name}: ${value}`);
  });
}

async function analyzeDatabaseSize() {
  section('DATABASE SIZE ANALYSIS');

  const dbSize = await db.queryOne(`
    SELECT pg_size_pretty(pg_database_size(current_database())) as size
  `);
  log(`Total Database Size: ${dbSize.size}`, COLORS.GREEN);

  // Table sizes
  const tableSizes = await db.queryMany(`
    SELECT 
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
      pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size,
      pg_total_relation_size(schemaname||'.'||tablename) AS bytes
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY bytes DESC
    LIMIT 20
  `);

  console.log('\nTop 20 Tables by Size:');
  console.log('┌─────────────────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Table                   │ Total Size   │ Table Size   │ Index Size   │');
  console.log('├─────────────────────────┼──────────────┼──────────────┼──────────────┤');
  tableSizes.forEach(t => {
    const table = t.tablename.padEnd(23);
    const total = t.total_size.padEnd(12);
    const tsize = t.table_size.padEnd(12);
    const isize = t.index_size.padEnd(12);
    console.log(`│ ${table} │ ${total} │ ${tsize} │ ${isize} │`);
  });
  console.log('└─────────────────────────┴──────────────┴──────────────┴──────────────┘');
}

async function analyzeIndexes() {
  section('INDEX ANALYSIS');

  // Unused indexes
  const unusedIndexes = await db.queryMany(`
    SELECT 
      schemaname,
      tablename,
      indexrelname as indexname,
      idx_scan,
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
      AND indexrelname NOT LIKE '%_pkey'
    ORDER BY pg_relation_size(indexrelid) DESC
  `);

  if (unusedIndexes.length > 0) {
    log(`\n⚠️  Found ${unusedIndexes.length} unused indexes:`, COLORS.YELLOW);
    unusedIndexes.forEach(idx => {
      console.log(`  - ${idx.tablename}.${idx.indexname} (${idx.index_size})`);
    });
  } else {
    log('\n✓ No unused indexes found', COLORS.GREEN);
  }

  // Missing indexes (tables without indexes on foreign keys)
  const missingIndexes = await db.queryMany(`
    SELECT 
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = tc.table_name
          AND indexdef LIKE '%' || kcu.column_name || '%'
      )
  `);

  if (missingIndexes.length > 0) {
    log(`\n⚠️  Found ${missingIndexes.length} foreign keys without indexes:`, COLORS.YELLOW);
    missingIndexes.forEach(idx => {
      console.log(`  - ${idx.table_name}.${idx.column_name} -> ${idx.foreign_table_name}.${idx.foreign_column_name}`);
    });
  } else {
    log('\n✓ All foreign keys are properly indexed', COLORS.GREEN);
  }

  // Duplicate indexes
  const duplicateIndexes = await db.queryMany(`
    SELECT 
      pg_size_pretty(SUM(pg_relation_size(idx))::BIGINT) AS size,
      (array_agg(idx))[1] AS idx1,
      (array_agg(idx))[2] AS idx2,
      (array_agg(idx))[3] AS idx3,
      (array_agg(idx))[4] AS idx4
    FROM (
      SELECT 
        indexrelid::regclass AS idx,
        (indrelid::text ||E'\n'|| indclass::text ||E'\n'|| indkey::text ||E'\n'||
         COALESCE(indexprs::text,'')||E'\n' || COALESCE(indpred::text,'')) AS key
      FROM pg_index
    ) sub
    GROUP BY key
    HAVING COUNT(*) > 1
  `);

  if (duplicateIndexes.length > 0) {
    log(`\n⚠️  Found ${duplicateIndexes.length} sets of duplicate indexes:`, COLORS.YELLOW);
    duplicateIndexes.forEach(dup => {
      console.log(`  - ${dup.idx1}, ${dup.idx2} (${dup.size})`);
    });
  } else {
    log('\n✓ No duplicate indexes found', COLORS.GREEN);
  }
}

async function analyzeCacheHitRatio() {
  section('CACHE HIT RATIO ANALYSIS');

  const cacheHit = await db.queryOne(`
    SELECT 
      sum(heap_blks_read) as heap_read,
      sum(heap_blks_hit) as heap_hit,
      sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100 as cache_hit_ratio
    FROM pg_statio_user_tables
  `);

  const ratio = parseFloat(cacheHit.cache_hit_ratio || 0);
  const color = ratio > 99 ? COLORS.GREEN : ratio > 90 ? COLORS.YELLOW : COLORS.RED;

  log(`\nCache Hit Ratio: ${ratio.toFixed(2)}%`, color);

  if (ratio < 99) {
    log('⚠️  Cache hit ratio is below optimal (should be > 99%)', COLORS.YELLOW);
    log('   Consider increasing shared_buffers', COLORS.YELLOW);
  } else {
    log('✓ Cache hit ratio is optimal', COLORS.GREEN);
  }

  // Index cache hit ratio
  const indexCacheHit = await db.queryOne(`
    SELECT 
      sum(idx_blks_read) as idx_read,
      sum(idx_blks_hit) as idx_hit,
      CASE 
        WHEN sum(idx_blks_hit) + sum(idx_blks_read) = 0 THEN 100
        ELSE sum(idx_blks_hit) / (sum(idx_blks_hit) + sum(idx_blks_read)) * 100
      END as index_cache_hit_ratio
    FROM pg_statio_user_indexes
  `);

  const indexRatio = parseFloat(indexCacheHit.index_cache_hit_ratio || 0);
  const indexColor = indexRatio > 99 ? COLORS.GREEN : indexRatio > 90 ? COLORS.YELLOW : COLORS.RED;

  log(`Index Cache Hit Ratio: ${indexRatio.toFixed(2)}%`, indexColor);
}

async function analyzeSequentialScans() {
  section('SEQUENTIAL SCAN ANALYSIS');

  const seqScans = await db.queryMany(`
    SELECT 
      schemaname,
      relname as tablename,
      seq_scan,
      seq_tup_read,
      idx_scan,
      n_live_tup,
      CASE 
        WHEN seq_scan > 0 THEN ROUND(seq_tup_read::numeric / seq_scan, 2)
        ELSE 0
      END as avg_seq_tup_read
    FROM pg_stat_user_tables
    WHERE seq_scan > 0
      AND n_live_tup > 10000
    ORDER BY seq_scan DESC
    LIMIT 20
  `);

  if (seqScans.length > 0) {
    console.log('\nTables with High Sequential Scans (> 10k rows):');
    console.log('┌─────────────────────────┬───────────┬──────────────┬───────────┬────────────┐');
    console.log('│ Table                   │ Seq Scans │ Rows Read    │ Idx Scans │ Live Rows  │');
    console.log('├─────────────────────────┼───────────┼──────────────┼───────────┼────────────┤');
    seqScans.forEach(t => {
      const table = t.tablename.padEnd(23);
      const seqScan = String(t.seq_scan).padEnd(9);
      const seqRead = String(t.seq_tup_read).padEnd(12);
      const idxScan = String(t.idx_scan || 0).padEnd(9);
      const liveRows = String(t.n_live_tup).padEnd(10);
      console.log(`│ ${table} │ ${seqScan} │ ${seqRead} │ ${idxScan} │ ${liveRows} │`);
    });
    console.log('└─────────────────────────┴───────────┴──────────────┴───────────┴────────────┘');

    log('\n⚠️  High sequential scans may indicate missing indexes', COLORS.YELLOW);
  } else {
    log('\n✓ No concerning sequential scans found', COLORS.GREEN);
  }
}

async function analyzeTableBloat() {
  section('TABLE BLOAT ANALYSIS');

  const bloat = await db.queryMany(`
    SELECT 
      schemaname,
      relname as tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS total_size,
      n_dead_tup,
      n_live_tup,
      ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_tuple_percent,
      last_vacuum,
      last_autovacuum
    FROM pg_stat_user_tables
    WHERE n_live_tup > 0
    ORDER BY n_dead_tup DESC
    LIMIT 20
  `);

  console.log('\nTop 20 Tables by Dead Tuples:');
  console.log('┌─────────────────────────┬──────────────┬────────────┬────────────┬──────────┐');
  console.log('│ Table                   │ Total Size   │ Dead Tuples│ Live Tuples│ Dead %   │');
  console.log('├─────────────────────────┼──────────────┼────────────┼────────────┼──────────┤');
  bloat.forEach(t => {
    const table = t.tablename.padEnd(23);
    const size = t.total_size.padEnd(12);
    const dead = String(t.n_dead_tup).padEnd(10);
    const live = String(t.n_live_tup).padEnd(10);
    const pct = String(t.dead_tuple_percent || 0).padEnd(8);
    const color = (t.dead_tuple_percent || 0) > 10 ? COLORS.YELLOW : COLORS.RESET;
    console.log(`${color}│ ${table} │ ${size} │ ${dead} │ ${live} │ ${pct} │${COLORS.RESET}`);
  });
  console.log('└─────────────────────────┴──────────────┴────────────┴────────────┴──────────┘');

  const needsVacuum = bloat.filter(t => (t.dead_tuple_percent || 0) > 10);
  if (needsVacuum.length > 0) {
    log(`\n⚠️  ${needsVacuum.length} tables have > 10% dead tuples and may need VACUUM`, COLORS.YELLOW);
  }
}

async function analyzeConnections() {
  section('CONNECTION ANALYSIS');

  const connections = await db.queryOne(`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle,
      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);

  console.log(`\nCurrent Connections:`);
  console.log(`  Total: ${connections.total}`);
  console.log(`  Active: ${connections.active}`);
  console.log(`  Idle: ${connections.idle}`);
  console.log(`  Idle in Transaction: ${connections.idle_in_transaction}`);

  if (connections.idle_in_transaction > 0) {
    log(`\n⚠️  ${connections.idle_in_transaction} idle transactions detected`, COLORS.YELLOW);
    log('   This may indicate connection leaks or long-running transactions', COLORS.YELLOW);
  }

  // Long-running queries
  const longQueries = await db.queryMany(`
    SELECT 
      pid,
      usename,
      application_name,
      state,
      EXTRACT(EPOCH FROM (now() - query_start)) as duration_seconds,
      LEFT(query, 100) as query_preview
    FROM pg_stat_activity
    WHERE state != 'idle'
      AND query NOT LIKE '%pg_stat_activity%'
      AND datname = current_database()
      AND query_start < now() - interval '5 seconds'
    ORDER BY duration_seconds DESC
  `);

  if (longQueries.length > 0) {
    log(`\n⚠️  Found ${longQueries.length} queries running > 5 seconds:`, COLORS.YELLOW);
    longQueries.forEach(q => {
      console.log(`  - PID ${q.pid}: ${q.duration_seconds.toFixed(2)}s - ${q.query_preview}...`);
    });
  }
}

async function analyzeLocks() {
  section('LOCK ANALYSIS');

  const locks = await db.queryMany(`
    SELECT 
      locktype,
      mode,
      count(*) as count
    FROM pg_locks
    WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
    GROUP BY locktype, mode
    ORDER BY count DESC
  `);

  if (locks.length > 0) {
    console.log('\nCurrent Locks:');
    locks.forEach(l => {
      console.log(`  ${l.locktype} - ${l.mode}: ${l.count}`);
    });
  } else {
    log('\n✓ No locks currently held', COLORS.GREEN);
  }

  // Blocking queries
  const blocking = await db.queryMany(`
    SELECT 
      blocked_locks.pid AS blocked_pid,
      blocked_activity.usename AS blocked_user,
      blocking_locks.pid AS blocking_pid,
      blocking_activity.usename AS blocking_user,
      blocked_activity.query AS blocked_statement,
      blocking_activity.query AS blocking_statement
    FROM pg_catalog.pg_locks blocked_locks
    JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
    JOIN pg_catalog.pg_locks blocking_locks 
      ON blocking_locks.locktype = blocked_locks.locktype
      AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
      AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
      AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
      AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
      AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
      AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
      AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
      AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
      AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
      AND blocking_locks.pid != blocked_locks.pid
    JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
    WHERE NOT blocked_locks.granted
  `);

  if (blocking.length > 0) {
    log(`\n⚠️  Found ${blocking.length} blocking queries:`, COLORS.RED);
    blocking.forEach(b => {
      console.log(`  Blocked PID ${b.blocked_pid} by PID ${b.blocking_pid}`);
    });
  }
}

async function analyzeQueryStats() {
  section('QUERY STATISTICS (pg_stat_statements)');

  // Check if pg_stat_statements is enabled
  const extensionExists = await db.queryOne(`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) as exists
  `);

  if (!extensionExists.exists) {
    log('\n⚠️  pg_stat_statements extension is not enabled', COLORS.YELLOW);
    log('   To enable: CREATE EXTENSION pg_stat_statements;', COLORS.YELLOW);
    log('   This extension provides detailed query performance statistics', COLORS.YELLOW);
    return;
  }

  // Top queries by total time
  const slowQueries = await db.queryMany(`
    SELECT 
      LEFT(query, 100) as query_preview,
      calls,
      ROUND(total_exec_time::numeric, 2) as total_time_ms,
      ROUND(mean_exec_time::numeric, 2) as mean_time_ms,
      ROUND(max_exec_time::numeric, 2) as max_time_ms,
      rows
    FROM pg_stat_statements
    WHERE query NOT LIKE '%pg_stat_statements%'
    ORDER BY total_exec_time DESC
    LIMIT 10
  `);

  if (slowQueries.length > 0) {
    console.log('\nTop 10 Queries by Total Execution Time:');
    slowQueries.forEach((q, i) => {
      console.log(`\n${i + 1}. ${q.query_preview}...`);
      console.log(`   Calls: ${q.calls} | Total: ${q.total_time_ms}ms | Mean: ${q.mean_time_ms}ms | Max: ${q.max_time_ms}ms`);
    });
  }
}

async function generateRecommendations() {
  section('PERFORMANCE RECOMMENDATIONS');

  const recommendations = [];

  // Check cache hit ratio
  const cacheHit = await db.queryOne(`
    SELECT 
      CASE 
        WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 100
        ELSE sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100
      END as cache_hit_ratio
    FROM pg_statio_user_tables
  `);

  if (parseFloat(cacheHit.cache_hit_ratio || 100) < 99) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Memory',
      issue: 'Low cache hit ratio',
      recommendation: 'Increase shared_buffers (currently should be 25% of RAM)',
      action: 'Edit postgresql.conf: shared_buffers = 2GB (adjust based on available RAM)'
    });
  }

  // Check for tables without primary keys
  const noPK = await db.queryMany(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        SELECT tablename
        FROM pg_indexes
        WHERE indexdef LIKE '%PRIMARY KEY%'
      )
  `);

  if (noPK.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Schema',
      issue: `${noPK.length} tables without primary keys`,
      recommendation: 'Add primary keys to all tables',
      action: `Tables: ${noPK.map(t => t.tablename).join(', ')}`
    });
  }

  // Check autovacuum settings
  const deadTuples = await db.queryOne(`
    SELECT count(*) as tables_with_bloat
    FROM pg_stat_user_tables
    WHERE n_dead_tup > n_live_tup * 0.1
  `);

  if (parseInt(deadTuples.tables_with_bloat) > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Maintenance',
      issue: `${deadTuples.tables_with_bloat} tables with > 10% dead tuples`,
      recommendation: 'Run VACUUM ANALYZE or adjust autovacuum settings',
      action: 'Consider running: VACUUM ANALYZE; or tune autovacuum_vacuum_scale_factor'
    });
  }

  // Display recommendations
  if (recommendations.length === 0) {
    log('\n✓ No critical issues found!', COLORS.GREEN);
  } else {
    recommendations.forEach((rec, i) => {
      const priorityColor = rec.priority === 'HIGH' ? COLORS.RED :
        rec.priority === 'MEDIUM' ? COLORS.YELLOW : COLORS.BLUE;
      console.log(`\n${i + 1}. [${rec.priority}] ${rec.category}: ${rec.issue}`);
      log(`   Recommendation: ${rec.recommendation}`, priorityColor);
      console.log(`   Action: ${rec.action}`);
    });
  }
}

async function main() {
  try {
    await db.connect();

    log('\n🔍 Starting PostgreSQL Performance Analysis...', COLORS.BOLD + COLORS.CYAN);
    log('This may take a few moments...\n', COLORS.CYAN);

    await checkDatabaseVersion();
    await analyzeDatabaseSize();

    try {
      await analyzeIndexes();
    } catch (error) {
      log(`\n⚠️  Index analysis failed: ${error.message}`, COLORS.YELLOW);
      console.error('Index analysis error:', error);
    }

    await analyzeCacheHitRatio();
    await analyzeSequentialScans();
    await analyzeTableBloat();
    await analyzeConnections();
    await analyzeLocks();

    try {
      await analyzeQueryStats();
    } catch (error) {
      log(`\n⚠️  Query stats analysis failed: ${error.message}`, COLORS.YELLOW);
    }

    await generateRecommendations();

    section('ANALYSIS COMPLETE');
    log('\n✓ Performance analysis completed successfully!', COLORS.GREEN);
    log('\nNext steps:', COLORS.BOLD);
    log('1. Review the findings above', COLORS.CYAN);
    log('2. Prioritize issues based on impact', COLORS.CYAN);
    log('3. Apply recommended fixes', COLORS.CYAN);
    log('4. Monitor performance after changes\n', COLORS.CYAN);

  } catch (error) {
    log(`\n❌ Error during analysis: ${error.message}`, COLORS.RED);
    console.error(error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
