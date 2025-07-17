/**
 * Debug script to check matchmaking system status
 * Run with: npm run debug:matchmaking
 */

import { redis } from '../services/redis.js';
import { logger } from '../utils/logger.js';
import { matchmakingService } from '../services/matchmakingService.js';

async function debugMatchmaking() {
  try {
    // Connect to Redis
    await redis.connect();
    
    console.log('\n=== MATCHMAKING DEBUG INFO ===\n');
    
    // Check queue status
    const queuedPlayers = await matchmakingService.getAllQueuedPlayers();
    console.log(`📋 Players in queue: ${queuedPlayers.length}`);
    
    if (queuedPlayers.length > 0) {
      console.log('\nQueued players:');
      for (const player of queuedPlayers) {
        const timeInQueue = Math.floor((Date.now() - player.joinedAt) / 1000);
        console.log(`  - ${player.username} (${player.playerId})`);
        console.log(`    Class: ${player.classType}, Rating: ${player.rating}`);
        console.log(`    Time in queue: ${timeInQueue}s`);
      }
    }
    
    // Check pending matches
    const pendingKeys = await redis.keys('pending_match:*');
    console.log(`\n🎮 Pending matches: ${pendingKeys.length}`);
    
    if (pendingKeys.length > 0) {
      for (const key of pendingKeys) {
        const matchData = await redis.get(key);
        if (matchData) {
          const match = JSON.parse(matchData);
          const timeLeft = Math.floor((match.expiresAt - Date.now()) / 1000);
          console.log(`\n  Match ${match.matchId}:`);
          console.log(`    ${match.player1.username} vs ${match.player2.username}`);
          console.log(`    Acceptances: ${match.acceptances.length}/2`);
          console.log(`    Time left: ${timeLeft}s`);
        }
      }
    }
    
    // Check active matches
    const matchKeys = await redis.keys('match:*');
    console.log(`\n🏁 Active matches: ${matchKeys.length}`);
    
    // Test queue processing
    console.log('\n🔄 Testing queue processing...');
    await matchmakingService.processQueue();
    console.log('✅ Queue processed');
    
    // Check for any errors in Redis connection
    const redisStatus = redis.getConnectionStatus();
    console.log(`\n🔌 Redis connection: ${redisStatus ? 'Connected' : 'Disconnected'}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await redis.disconnect();
    process.exit(0);
  }
}

// Run the debug script
debugMatchmaking(); 