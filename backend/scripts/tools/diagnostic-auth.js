#!/usr/bin/env node
/**
 * Quick diagnostic script to test admin notification authentication
 * Run: node diagnostic-auth.js
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3001/api';

async function diagnose() {
  console.log('🔍 Diagnostic: Admin Notification Auth\n');

  // Test 1: Can we reach the backend?
  console.log('Test 1: Backend connectivity');
  try {
    const response = await fetch(`${API_URL}/health`);
    console.log(`✓ Backend is running (status: ${response.status})\n`);
  } catch (error) {
    console.log(`✗ Backend not reachable: ${error.message}\n`);
    return;
  }

  // Test 2: Check if unread-count works WITHOUT auth
  console.log('Test 2: Unread count WITHOUT authentication');
  try {
    const response = await fetch(`${API_URL}/notifications/unread-count`, {
      credentials: 'include',
    });
    console.log(`Status: ${response.status}`);
    if (response.status === 401) {
      console.log('✓ Correctly returns 401 for unauthenticated request\n');
    } else {
      console.log(`⚠ Unexpected status: ${response.status}\n`);
    }
  } catch (error) {
    console.log(`✗ Error: ${error.message}\n`);
  }

  // Test 3: Test with mock admin cookie
  console.log('Test 3: Check if backend reads cookies correctly');
  console.log('Note: This will still fail unless you pass a valid JWT token\n');
  console.log('To fix the admin auth issue:');
  console.log('1. Open Browser DevTools (F12) → Application → Cookies');
  console.log('2. Look for "accessToken" or "refreshToken" cookies');
  console.log('3. Check if they have "HttpOnly" flag (they should)');
  console.log('4. Check if cookie Domain is "localhost"\n');
  
  console.log('Vite Proxy Configuration:');
  console.log('- Ensure credentials are forwarded in vite.config.js');
  console.log('- Backend CORS must have credentials: true');
  console.log('- Admin requests must use "credentials: \'include\'"\n');

  console.log('Next Steps:');
  console.log('1. Restart admin with: cd admin && npm run dev');
  console.log('2. Check browser DevTools Network tab');
  console.log('3. Look for Cookie headers in /api requests');
  console.log('4. If no cookies, issue is with Vite proxy or auth storage\n');
}

diagnose();
