import { PlayerService } from '../services/playerService.js';
import { ratingService } from '../services/ratingService.js';
import { logger } from '../utils/logger.js';

/**
 * Test script to verify player services functionality
 * This script tests the player services without requiring a database connection
 */

async function testPlayerServices() {
  logger.info('Testing Player Services...');
  
  const playerService = new PlayerService();
  
  try {
    // Test 1: Create a player (will use in-memory storage if DB not available)
    logger.info('Test 1: Creating a test player...');
    const newPlayer = await playerService.createPlayer({
      username: 'TestPlayer',
      email: 'test@example.com',
      passwordHash: 'hashedPassword',
      isAnonymous: false
    });
    
    logger.info('Player created:', newPlayer);
    
    // Test 2: Test rating service
    logger.info('Test 2: Testing rating service...');
    const initialRating = ratingService.createNewPlayerRating();
    logger.info('Initial rating:', initialRating);
    
    // Test 3: Calculate expected score
    const opponent = ratingService.createNewPlayerRating();
    opponent.rating = 1200;
    const expectedScore = ratingService.calculateExpectedScore(initialRating, opponent);
    logger.info('Expected score against higher rated opponent:', expectedScore);
    
    // Test 4: Update rating after win
    const ratingUpdate = ratingService.updateRating(initialRating, [{
      opponent: opponent,
      score: 1 // Win
    }]);
    logger.info('Rating after win:', ratingUpdate);
    
    // Test 5: Test rating decay
    const decayedRating = ratingService.applyRatingDecay(initialRating, 45);
    logger.info('Rating after 45 days decay:', decayedRating);
    
    // Test 6: Test confidence interval
    const confidence = ratingService.getConfidenceInterval(initialRating);
    logger.info('95% confidence interval:', confidence);
    
    // Test 7: Test reasonable match check
    const isReasonableMatch = ratingService.isReasonableMatch(initialRating, opponent);
    logger.info('Is reasonable match:', isReasonableMatch);
    
    logger.info('All player service tests completed successfully!');
    
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

// Run the tests
testPlayerServices().then(() => {
  logger.info('Test script completed');
  process.exit(0);
}).catch((error) => {
  logger.error('Test script failed:', error);
  process.exit(1);
});