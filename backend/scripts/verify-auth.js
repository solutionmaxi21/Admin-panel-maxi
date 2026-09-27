import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api/auth';
let cookies = {};

// Helper to update cookies
function updateCookies(res) {
    const raw = res.headers.raw()['set-cookie'];
    if (raw) {
        raw.forEach(cookieStr => {
            const parts = cookieStr.split(';');
            const nameVal = parts[0].split('=');
            cookies[nameVal[0]] = nameVal[1];
        });
    }
}

function getCookieHeader() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function testAuthFlow() {
    console.log('🧪 Starting Auth Flow Test...');

    // 1. Login
    console.log('\n1. Logging in...');
    const loginRes = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'password123', isAdmin: true })
        // Assuming admin@example.com exists, if not need to create or use existing user.
        // Actually best to try a known user or signup first. Let's try signup first to be safe or use a known seed user.
        // If login fails, I'll update credentials.
    });

    if (!loginRes.ok) {
        console.log('Login failed (likely user doesnt exist), trying signup...');
        const signupRes = await fetch(`${BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test_auth_user@example.com',
                password: 'Password123!',
                firstName: 'Test',
                lastName: 'User',
                phone: '0555123456'
            })
        });

        // Even if signup says "check email", the user is created but maybe not active?
        // Wait, current signup implementation sets is_active=true by default? 
        // Let's check auth-v2.js. ... Yes, is_active: true.

        // Now login with new user
        const loginRes2 = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test_auth_user@example.com', password: 'Password123!' })
        });

        if (!loginRes2.ok) {
            const txt = await loginRes2.text();
            console.error('❌ Login failed after signup:', txt);
            process.exit(1);
        }
        updateCookies(loginRes2);
        console.log('✅ Login successful (New User)');
    } else {
        updateCookies(loginRes);
        console.log('✅ Login successful (Existing User)');
    }

    const refreshToken1 = cookies['refreshToken'];
    if (!refreshToken1) {
        console.error('❌ No refresh token cookie found!');
        process.exit(1);
    }
    console.log('   Received Refresh Token 1');

    // 2. Refresh Token
    console.log('\n2. Refreshing Token...');
    // Wait a second to ensure timestamps differ if needed
    await new Promise(r => setTimeout(r, 1000));

    const refreshRes = await fetch(`${BASE_URL}/refresh`, {
        method: 'POST',
        headers: {
            'Cookie': getCookieHeader(),
            'Content-Type': 'application/json'
        }
    });

    if (!refreshRes.ok) {
        const txt = await refreshRes.text();
        console.error('❌ Refresh failed:', txt);
        process.exit(1);
    }

    // Save OLD cookies to simulate reuse later
    const oldCookies = { ...cookies };

    updateCookies(refreshRes);
    const refreshToken2 = cookies['refreshToken'];
    console.log('✅ Refresh successful');

    if (refreshToken1 === refreshToken2) {
        console.error('❌ Token was NOT rotated! (Same token received)');
    } else {
        console.log('✅ Token rotated successfully');
    }

    // 3. Test Reuse Detection (Security)
    console.log('\n3. Testing Token Reuse (Attack Simulation)...');

    const reuseRes = await fetch(`${BASE_URL}/refresh`, {
        method: 'POST',
        headers: {
            // Use OLD cookies containing the now-revoked refresh token
            'Cookie': Object.entries(oldCookies).map(([k, v]) => `${k}=${v}`).join('; '),
            'Content-Type': 'application/json'
        }
    });

    if (reuseRes.status === 403 || reuseRes.status === 401) {
        console.log('✅ Reuse blocked correctly (Status:', reuseRes.status, ')');
        const body = await reuseRes.json();
        console.log('   Error Message:', body.message || body.error);
    } else {
        console.error('❌ Reuse was NOT blocked! Status:', reuseRes.status);
    }

    // 4. Verify Latest Token is ALSO Revoked (Family Revocation)
    console.log('\n4. Verifying Family Revocation...');
    const refreshRes3 = await fetch(`${BASE_URL}/refresh`, {
        method: 'POST',
        headers: {
            // Try to use the "New" valid token (refreshToken2)
            // It should now be revoked because we triggered the reuse alarm
            'Cookie': getCookieHeader(),
            'Content-Type': 'application/json'
        }
    });

    if (refreshRes3.status === 403 || refreshRes3.status === 401) {
        console.log('✅ Family revocation successful - Latest token is now invalid.');
    } else {
        console.error('❌ Family revocation failed! Latest token still works. Status:', refreshRes3.status);
    }

    console.log('\n🎉 Test Complete (Check ticks above)');
}

testAuthFlow();
