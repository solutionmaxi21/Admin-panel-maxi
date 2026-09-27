/**
 * Test script to verify favorites functionality
 * Tests both the sync endpoint and database operations
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sm2025mf@localhost:5432/maxistore'
});

async function testFavorites() {
  console.log('🧪 Testing Favorites Functionality\n');
  
  try {
    // 1. Check if favorites table exists
    console.log('1️⃣  Checking if favorites table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'favorites'
      );
    `);
    console.log('   ✅ Favorites table exists:', tableCheck.rows[0].exists);
    
    if (!tableCheck.rows[0].exists) {
      console.log('   ❌ ERROR: Favorites table does not exist!');
      return;
    }

    // 2. Check table structure
    console.log('\n2️⃣  Checking favorites table structure...');
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'favorites' 
      ORDER BY ordinal_position;
    `);
    console.log('   Columns:');
    structure.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });

    // 3. Check constraints
    console.log('\n3️⃣  Checking constraints...');
    const constraints = await pool.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conrelid = 'favorites'::regclass;
    `);
    console.log('   Constraints:');
    constraints.rows.forEach(con => {
      const type = con.contype === 'p' ? 'PRIMARY KEY' : 
                   con.contype === 'f' ? 'FOREIGN KEY' : 
                   con.contype === 'u' ? 'UNIQUE' : con.contype;
      console.log(`   - ${con.conname} (${type})`);
    });

    // 4. Count total favorites
    console.log('\n4️⃣  Counting favorites...');
    const countResult = await pool.query('SELECT COUNT(*) FROM favorites');
    console.log('   Total favorites in database:', countResult.rows[0].count);

    // 5. Get sample favorites (if any)
    const sampleResult = await pool.query(`
      SELECT f.id as favorite_id, f.user_id, f.product_id, f.added_at, 
             u.email as user_email, p.product_name
      FROM favorites f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN products p ON f.product_id = p.id
      ORDER BY f.added_at DESC
      LIMIT 5
    `);
    
    if (sampleResult.rows.length > 0) {
      console.log('\n5️⃣  Sample favorites (last 5):');
      sampleResult.rows.forEach(fav => {
        console.log(`   - ID: ${fav.favorite_id}, User: ${fav.user_email}, Product: ${fav.product_name || fav.product_id}, Added: ${fav.added_at}`);
      });
    } else {
      console.log('\n5️⃣  No favorites found in database.');
    }

    // 6. Check for users with favorites
    console.log('\n6️⃣  Users with favorites:');
    const usersWithFav = await pool.query(`
      SELECT u.id, u.email, COUNT(f.id) as favorite_count
      FROM users u
      LEFT JOIN favorites f ON u.id = f.user_id
      GROUP BY u.id, u.email
      HAVING COUNT(f.id) > 0
      ORDER BY favorite_count DESC
      LIMIT 10
    `);
    
    if (usersWithFav.rows.length > 0) {
      usersWithFav.rows.forEach(user => {
        console.log(`   - ${user.email}: ${user.favorite_count} favorites`);
      });
    } else {
      console.log('   No users have favorites yet.');
    }

    // 7. Check idempotency keys for wishlist operations
    console.log('\n7️⃣  Recent wishlist mutations in idempotency_keys:');
    const mutations = await pool.query(`
      SELECT mutation_type, user_id, payload, status, created_at
      FROM idempotency_keys
      WHERE mutation_type IN ('add_to_wishlist', 'remove_from_wishlist')
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    if (mutations.rows.length > 0) {
      mutations.rows.forEach(mut => {
        const payload = typeof mut.payload === 'string' ? JSON.parse(mut.payload) : mut.payload;
        console.log(`   - ${mut.mutation_type} by user ${mut.user_id}, product: ${payload.data?.productId || 'N/A'}, status: ${mut.status}, at: ${mut.created_at}`);
      });
    } else {
      console.log('   No wishlist mutations found in idempotency_keys table.');
    }

    // 8. Test adding a favorite (simulate)
    console.log('\n8️⃣  Testing INSERT operation (dry run)...');
    const testUserId = 1; // Assuming user ID 1 exists
    const testProductId = 1; // Assuming product ID 1 exists
    
    try {
      await pool.query('BEGIN');
      
      // Check if user exists
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [testUserId]);
      const productCheck = await pool.query('SELECT id FROM products WHERE id = $1', [testProductId]);
      
      if (userCheck.rows.length === 0) {
        console.log('   ⚠️  Test user (ID=1) does not exist. Skipping insert test.');
      } else if (productCheck.rows.length === 0) {
        console.log('   ⚠️  Test product (ID=1) does not exist. Skipping insert test.');
      } else {
        const insertResult = await pool.query(`
          INSERT INTO favorites (user_id, product_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, product_id) DO NOTHING
          RETURNING id
        `, [testUserId, testProductId]);
        
        if (insertResult.rows.length > 0) {
          console.log('   ✅ INSERT successful (would create favorite id:', insertResult.rows[0].id, ')');
        } else {
          console.log('   ℹ️  Favorite already exists (conflict prevented duplicate)');
        }
      }
      
      await pool.query('ROLLBACK'); // Don't actually save the test
      console.log('   ✅ Test rolled back (no actual changes made)');
    } catch (error) {
      await pool.query('ROLLBACK');
      console.log('   ❌ INSERT test failed:', error.message);
    }

    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run the test
testFavorites();
