import db from '../src/db/postgres.js';

async function main() {
    try {
        await db.connect();

        // Check what columns are available in pg_stat_user_tables
        const columns = await db.queryMany(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'pg_catalog'
                AND table_name = 'pg_stat_user_tables'
            ORDER BY ordinal_position
        `);

        console.log('Columns in pg_stat_user_tables:');
        columns.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await db.close();
    }
}

main();
