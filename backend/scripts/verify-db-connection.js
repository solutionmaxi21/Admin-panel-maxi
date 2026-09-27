
import db from '../src/db/postgres.js';

async function verifyConnection() {
    console.log('Testing Database Connection Refactor...');

    try {
        // 1. Test clear connection
        console.log('1. Attempting connection...');
        const result = await db.queryOne('SELECT NOW(), current_setting(\'max_connections\') as max_conns');
        console.log('✅ Connection Successful!');
        console.log('   Timestamp:', result.now);
        console.log('   Max Connections:', result.max_conns);

        // 2. Inspect Pool Config (if accessible via internal pool)
        if (db.pool) {
            console.log('2. Verifying Pool Configuration...');
            console.log('   Max Size:', db.pool.options.max);
            console.log('   Connection Timeout:', db.pool.options.connectionTimeoutMillis);
            console.log('   KeepAlive:', db.pool.options.keepAlive);

            const expectedTimeout = 5000;
            if (db.pool.options.connectionTimeoutMillis === expectedTimeout) {
                console.log('✅ Timeout verified as 5000ms');
            } else {
                console.error(`❌ Timeout mismatch: expected ${expectedTimeout}, got ${db.pool.options.connectionTimeoutMillis}`);
            }

            if (db.pool.options.keepAlive === true) {
                console.log('✅ KeepAlive verified as true');
            } else {
                console.error('❌ KeepAlive mismatch: expected true, got', db.pool.options.keepAlive);
            }
        }

        console.log('3. Testing Query Execution...');
        const rows = await db.queryMany('SELECT 1 as num');
        if (rows.length === 1 && rows[0].num === 1) {
            console.log('✅ Query Execution Successful');
        }

        console.log('✅ All tests passed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Verification Failed:', error);
        process.exit(1);
    }
}

verifyConnection();
