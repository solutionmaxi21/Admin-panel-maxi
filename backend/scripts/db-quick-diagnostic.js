/**
 * Simple PostgreSQL Diagnostic Script
 * Quick database health check
 */

import db from '../src/db/postgres.js';

async function main() {
    try {
        await db.connect();
        console.log('✓ Connected to PostgreSQL\n');

        // 1. Database Version
        console.log('=== DATABASE VERSION ===');
        const version = await db.queryOne('SELECT version()');
        console.log(version.version);

        // 2. Database Size
        console.log('\n=== DATABASE SIZE ===');
        const dbSize = await db.queryOne(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `);
        console.log(`Total Size: ${dbSize.size}`);

        // 3. Table Sizes
        console.log('\n=== TOP 10 TABLES BY SIZE ===');
        const tables = await db.queryMany(`
            SELECT 
                tablename,
                pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size('public.'||tablename) DESC
            LIMIT 10
        `);
        tables.forEach(t => console.log(`${t.tablename}: ${t.size}`));

        // 4. Index Count
        console.log('\n=== INDEX STATISTICS ===');
        const indexCount = await db.queryOne(`
            SELECT count(*) as total_indexes
            FROM pg_indexes
            WHERE schemaname = 'public'
        `);
        console.log(`Total Indexes: ${indexCount.total_indexes}`);

        // 5. Connection Count
        console.log('\n=== CONNECTIONS ===');
        const connections = await db.queryOne(`
            SELECT count(*) as total
            FROM pg_stat_activity
            WHERE datname = current_database()
        `);
        console.log(`Active Connections: ${connections.total}`);

        // 6. Cache Hit Ratio
        console.log('\n=== CACHE HIT RATIO ===');
        const cacheHit = await db.queryOne(`
            SELECT 
                CASE 
                    WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 100
                    ELSE ROUND(sum(heap_blks_hit) * 100.0 / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
                END as cache_hit_ratio
            FROM pg_statio_user_tables
        `);
        console.log(`Cache Hit Ratio: ${cacheHit.cache_hit_ratio}%`);

        // 7. Tables with most dead tuples
        console.log('\n=== TABLES NEEDING VACUUM ===');
        const bloat = await db.queryMany(`
            SELECT 
                relname as tablename,
                n_dead_tup,
                n_live_tup,
                ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
            FROM pg_stat_user_tables
            WHERE n_dead_tup > 100
            ORDER BY n_dead_tup DESC
            LIMIT 10
        `);
        if (bloat.length > 0) {
            bloat.forEach(t => {
                console.log(`${t.tablename}: ${t.n_dead_tup} dead (${t.dead_pct}%)`);
            });
        } else {
            console.log('No tables with significant dead tuples');
        }

        // 8. Sequential Scans
        console.log('\n=== TABLES WITH HIGH SEQUENTIAL SCANS ===');
        const seqScans = await db.queryMany(`
            SELECT 
                relname as tablename,
                seq_scan,
                idx_scan,
                n_live_tup
            FROM pg_stat_user_tables
            WHERE seq_scan > 1000
                AND n_live_tup > 1000
            ORDER BY seq_scan DESC
            LIMIT 10
        `);
        if (seqScans.length > 0) {
            seqScans.forEach(t => {
                console.log(`${t.tablename}: ${t.seq_scan} seq scans, ${t.idx_scan || 0} index scans (${t.n_live_tup} rows)`);
            });
        } else {
            console.log('No tables with excessive sequential scans');
        }

        // 9. Check for pg_stat_statements extension
        console.log('\n=== EXTENSIONS ===');
        const extensions = await db.queryMany(`
            SELECT extname, extversion
            FROM pg_extension
            WHERE extname IN ('pg_stat_statements', 'pg_trgm', 'btree_gin', 'btree_gist')
        `);
        if (extensions.length > 0) {
            extensions.forEach(e => console.log(`${e.extname}: ${e.extversion}`));
        } else {
            console.log('No performance-related extensions installed');
        }

        // 10. Configuration Settings
        console.log('\n=== KEY CONFIGURATION ===');
        const settings = await db.queryMany(`
            SELECT name, setting, unit
            FROM pg_settings
            WHERE name IN (
                'max_connections',
                'shared_buffers',
                'effective_cache_size',
                'work_mem',
                'maintenance_work_mem'
            )
            ORDER BY name
        `);
        settings.forEach(s => {
            const value = s.unit ? `${s.setting} ${s.unit}` : s.setting;
            console.log(`${s.name}: ${value}`);
        });

        console.log('\n✓ Diagnostic complete!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

main();
