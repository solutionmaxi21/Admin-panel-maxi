/**
 * Test the new /api/favorites endpoint
 */

async function testFavoritesEndpoint() {
  console.log('🧪 Testing /api/favorites endpoint\n');
  
  // First, we need to login to get a valid JWT token
  const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'test1@maxistore.com',
      password: 'password123'  // Update with actual password
    })
  });

  if (!loginResponse.ok) {
    console.error('❌ Login failed:', await loginResponse.text());
    return;
  }

  const loginData = await loginResponse.json();
  console.log('✅ Logged in as:', loginData.user.email);
  const token = loginData.accessToken;

  // Test 1: Get all favorites
  console.log('\n1️⃣  Testing GET /api/favorites');
  const favoritesResponse = await fetch('http://localhost:3001/api/favorites', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!favoritesResponse.ok) {
    console.error('❌ Failed:', await favoritesResponse.text());
  } else {
    const favoritesData = await favoritesResponse.json();
    console.log('✅ Success! Found', favoritesData.count, 'favorites');
    console.log('Favorites:', favoritesData.favorites.slice(0, 3).map(f => ({
      productId: f.productId,
      name: f.product.name,
      addedAt: f.addedAt
    })));
  }

  // Test 2: Get just product IDs
  console.log('\n2️⃣  Testing GET /api/favorites/product-ids');
  const idsResponse = await fetch('http://localhost:3001/api/favorites/product-ids', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!idsResponse.ok) {
    console.error('❌ Failed:', await idsResponse.text());
  } else {
    const idsData = await idsResponse.json();
    console.log('✅ Success! Product IDs:', idsData.favorites.map(f => f.productId));
  }

  // Test 3: Add a new favorite (product ID 1)
  console.log('\n3️⃣  Testing POST /api/favorites/1');
  const addResponse = await fetch('http://localhost:3001/api/favorites/1', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!addResponse.ok) {
    console.error('❌ Failed:', await addResponse.text());
  } else {
    const addData = await addResponse.json();
    console.log('✅ Success:', addData.message);
  }

  console.log('\n✅ All tests complete!');
}

testFavoritesEndpoint().catch(error => {
  console.error('❌ Test failed:', error.message);
});
