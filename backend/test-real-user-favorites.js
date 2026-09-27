/**
 * Test favorites endpoint with specific user
 */

async function testWithRealUser() {
  console.log('🧪 Testing favorites with test1@maxistore.com\n');
  
  try {
    // Step 1: Login
    console.log('1️⃣  Logging in...');
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test1@maxistore.com',
        password: 'Test1234!'
      })
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.error('❌ Login failed:', errorText);
      return;
    }

    const loginData = await loginResponse.json();
    console.log('✅ Logged in successfully');
    console.log('   User ID:', loginData.user?.id);
    console.log('   Email:', loginData.user?.email);
    
    const token = loginData.accessToken;
    if (!token) {
      console.error('❌ No access token received!');
      return;
    }
    console.log('   Token:', token.substring(0, 20) + '...');

    // Step 2: Fetch favorites
    console.log('\n2️⃣  Fetching favorites...');
    const favoritesResponse = await fetch('http://localhost:3001/api/favorites/product-ids', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!favoritesResponse.ok) {
      const errorText = await favoritesResponse.text();
      console.error('❌ Fetch favorites failed:', errorText);
      console.error('   Status:', favoritesResponse.status);
      return;
    }

    const favoritesData = await favoritesResponse.json();
    console.log('✅ Favorites fetched successfully');
    console.log('   Count:', favoritesData.count);
    console.log('   Favorites:', favoritesData.favorites);

    // Step 3: Fetch full favorites with details
    console.log('\n3️⃣  Fetching full favorites...');
    const fullFavoritesResponse = await fetch('http://localhost:3001/api/favorites', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!fullFavoritesResponse.ok) {
      const errorText = await fullFavoritesResponse.text();
      console.error('❌ Fetch full favorites failed:', errorText);
      return;
    }

    const fullFavoritesData = await fullFavoritesResponse.json();
    console.log('✅ Full favorites fetched');
    console.log('   Count:', fullFavoritesData.count);
    if (fullFavoritesData.favorites && fullFavoritesData.favorites.length > 0) {
      console.log('\n📦 Favorites:');
      fullFavoritesData.favorites.forEach((fav, idx) => {
        console.log(`   ${idx + 1}. Product ID: ${fav.productId}, Name: ${fav.product?.name || 'N/A'}`);
      });
    }

    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testWithRealUser();
