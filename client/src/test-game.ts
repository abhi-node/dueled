/**
 * Test script to automatically login and join a game
 */

import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

async function testGame() {
  try {
    // Register/login test user
    console.log('🔐 Logging in test user...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      username: 'testuser1',
      password: 'testpassword'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Logged in successfully');
    
    // Create a match
    console.log('🎮 Creating match...');
    const matchResponse = await axios.post(`${API_URL}/matchmaking/queue`, 
      {
        classType: 'berserker'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('✅ Match created:', matchResponse.data);
    
    // Navigate to game
    const gameUrl = `http://localhost:5174/game?matchId=${matchResponse.data.matchId}`;
    console.log(`🚀 Open this URL in your browser: ${gameUrl}`);
    console.log('📋 Or run: open "' + gameUrl + '"');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testGame();