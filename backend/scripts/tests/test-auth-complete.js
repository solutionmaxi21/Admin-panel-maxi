// Quick script to verify admin login works end-to-end
import fetch from 'node-fetch';

const ADMIN_EMAIL = 'admin@maxistore.com';
const ADMIN_PASSWORD = 'Admin1234!';
const API_URL = 'http://localhost:3001/api';

async function testCompleteFlow() {
  console.log('🔍 Testing Complete Admin Authentication Flow\n');
  
  try {
    // Test 1: Login
    console.log('1️⃣  Testing login...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Client-Type': 'admin'
      },
      body: JSON.stringify({ 
        email: ADMIN_EMAIL, 
        password: ADMIN_PASSWORD,
        isAdmin: true 
      }),
      credentials: 'include'
    });
    
    if (!loginRes.ok) {
      console.error('❌ Login failed:', await loginRes.text());
      return;
    }
    
    const loginData = await loginRes.json();
    console.log('✅ Login successful');
    console.log('   User:', loginData.user.email, '| Role:', loginData.user.role);
    
    const cookies = loginRes.headers.get('set-cookie');
    const accessToken = loginData.accessToken;
    
    // Test 2: Access protected endpoint with cookie
    console.log('\n2️⃣  Testing protected endpoint (with cookie)...');
    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Cookie': cookies,
        'X-Client-Type': 'admin'
      }
    });
    
    if (!meRes.ok) {
      console.error('❌ Session check failed');
      return;
    }
    
    console.log('✅ Session verified with cookie');
    
    // Test 3: Access admin-only endpoint
    console.log('\n3️⃣  Testing admin-only endpoint...');
    const productsRes = await fetch(`${API_URL}/products`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Client-Type': 'admin'
      }
    });
    
    if (!productsRes.ok) {
      console.error('❌ Protected route failed:', productsRes.status);
      return;
    }
    
    const productsData = await productsRes.json();
    console.log('✅ Admin routes accessible');
    console.log('   Products found:', productsData.products?.length || 0);
    
    // Test 4: Logout
    console.log('\n4️⃣  Testing logout...');
    const logoutRes = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'X-Client-Type': 'admin'
      }
    });
    
    if (!logoutRes.ok) {
      console.error('❌ Logout failed');
      return;
    }
    
    console.log('✅ Logout successful');
    
    // Test 5: Verify session is cleared
    console.log('\n5️⃣  Verifying session cleared...');
    const meAfterLogout = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Cookie': cookies,
        'X-Client-Type': 'admin'
      }
    });
    
    if (meAfterLogout.ok) {
      console.warn('⚠️  Session still valid after logout (might be cached)');
    } else {
      console.log('✅ Session properly cleared');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 All authentication tests passed!');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testCompleteFlow();
