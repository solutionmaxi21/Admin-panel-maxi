import fetch from 'node-fetch';

const API_URL = 'http://localhost:3001/api/auth';

async function testAdminLogin() {
  console.log('Testing Admin Login Flow...\n');

  try {
    // Test 1: Login with admin credentials
    console.log('1. Attempting login with admin@maxistore.com');
    const loginResponse = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@maxistore.com',
        password: 'Admin1234!',
        isAdmin: true
      }),
      credentials: 'include'
    });

    const loginData = await loginResponse.json();
    console.log('Login Response Status:', loginResponse.status);
    console.log('Login Response Data:', JSON.stringify(loginData, null, 2));
    
    // Get cookies from response
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('\nCookies set:', cookies);

    if (!loginResponse.ok) {
      console.error('❌ Login failed');
      return;
    }

    console.log('\n✅ Login successful');

    // Test 2: Check session with /me endpoint
    console.log('\n2. Testing /me endpoint with cookies');
    
    const meResponse = await fetch(`${API_URL}/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'admin',
        'Cookie': cookies // Pass cookies from login
      },
      credentials: 'include'
    });

    const meData = await meResponse.json();
    console.log('Me Response Status:', meResponse.status);
    console.log('Me Response Data:', JSON.stringify(meData, null, 2));

    if (!meResponse.ok) {
      console.error('❌ Session check failed');
      return;
    }

    console.log('\n✅ Session verified');

    // Test 3: Try with Authorization header instead
    if (loginData.accessToken) {
      console.log('\n3. Testing /me endpoint with Authorization header');
      const meWithTokenResponse = await fetch(`${API_URL}/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginData.accessToken}`,
          'X-Client-Type': 'admin'
        }
      });

      const meWithTokenData = await meWithTokenResponse.json();
      console.log('Me Response Status (with token):', meWithTokenResponse.status);
      console.log('Me Response Data (with token):', JSON.stringify(meWithTokenData, null, 2));

      if (!meWithTokenResponse.ok) {
        console.error('❌ Token auth failed');
      } else {
        console.log('\n✅ Token auth successful');
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
  }
}

testAdminLogin();
