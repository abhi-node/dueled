const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testAuthSystem() {
  console.log('🧪 Testing Dueled Authentication System\n');

  try {
    // Test health endpoint
    console.log('📋 Testing health endpoint...');
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log('✅ Health check:', healthResponse.data);
    console.log();

    // Test registration
    console.log('👤 Testing user registration...');
    const testUser = {
      username: 'testuser' + Date.now(),
      email: 'test' + Date.now() + '@example.com',
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!'
    };

    const registerResponse = await axios.post(`${BASE_URL}/auth/register`, testUser);
    console.log('✅ Registration successful:', {
      success: registerResponse.data.success,
      username: registerResponse.data.player?.username,
      isAnonymous: registerResponse.data.player?.isAnonymous
    });
    
    const authToken = registerResponse.data.token;
    console.log();

    // Test login
    console.log('🔐 Testing user login...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      username: testUser.username,
      password: testUser.password
    });
    console.log('✅ Login successful:', {
      success: loginResponse.data.success,
      username: loginResponse.data.player?.username
    });
    console.log();

    // Test profile access
    console.log('👤 Testing profile access...');
    const profileResponse = await axios.get(`${BASE_URL}/player/profile`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Profile access successful:', {
      success: profileResponse.data.success,
      username: profileResponse.data.data?.username,
      rating: profileResponse.data.data?.rating
    });
    console.log();

    // Test stats
    console.log('📊 Testing player stats...');
    const statsResponse = await axios.get(`${BASE_URL}/player/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Stats access successful:', {
      success: statsResponse.data.success,
      rating: statsResponse.data.data?.rating,
      matchesPlayed: statsResponse.data.data?.matches_played
    });
    console.log();

    // Test anonymous session
    console.log('👻 Testing anonymous session...');
    const anonResponse = await axios.post(`${BASE_URL}/auth/anonymous`);
    console.log('✅ Anonymous session successful:', {
      success: anonResponse.data.success,
      username: anonResponse.data.player?.username,
      isAnonymous: anonResponse.data.player?.isAnonymous
    });
    console.log();

    // Test logout
    console.log('🚪 Testing logout...');
    const logoutResponse = await axios.post(`${BASE_URL}/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Logout successful:', {
      success: logoutResponse.data.success
    });
    console.log();

    console.log('🎉 All authentication tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

// Only run if server is available
axios.get('http://localhost:3000/health')
  .then(() => {
    testAuthSystem();
  })
  .catch(() => {
    console.log('❌ Server not running. Start the server with: npm run dev');
  });