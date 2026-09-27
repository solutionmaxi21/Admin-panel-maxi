// Test the users API endpoint like the admin panel does

const API_BASE = 'http://localhost:3001/api';

async function testUsersAPI() {
  console.log('Testing /api/users endpoint...\n');
  
  try {
    // First, login as admin
    console.log('Step 1: Logging in as admin...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'admin'
      },
      body: JSON.stringify({
        email: 'admin@maxistore.com',
        password: 'admin123',
        isAdmin: true
      })
    });
    
    if (!loginResponse.ok) {
      console.error('Login failed:', await loginResponse.text());
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✓ Login successful:', loginData.user.email, '-', loginData.user.role);
    
    // Now try to get users
    console.log('\nStep 2: Fetching users...');
    const usersResponse = await fetch(`${API_BASE}/users`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'admin'
      }
    });
    
    if (!usersResponse.ok) {
      const error = await usersResponse.text();
      console.error('Users fetch failed:', usersResponse.status, error);
      return;
    }
    
    const usersData = await usersResponse.json();
    console.log('✓ Users fetched successfully!');
    console.log('Response structure:', Object.keys(usersData));
    console.log('Total users:', usersData.total);
    console.log('Users array length:', usersData.users?.length);
    console.log('\nFirst 3 users:');
    usersData.users?.slice(0, 3).forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.name || u.fullName || u.email} (${u.email})`);
      console.log(`     Orders: ${u.total_orders}, Spent: ${u.total_spent}`);
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testUsersAPI();
