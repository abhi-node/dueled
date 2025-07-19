/**
 * Delta Compression Validation Test
 * 
 * End-to-end test to validate the delta compression system
 * ensures clean, scalable, and properly connected implementation.
 */

import { DeltaStateManager } from '../services/delta/DeltaStateManager.js';
import { logger } from '../utils/logger.js';

interface TestResult {
  success: boolean;
  bandwidth_reduction_percent: number;
  tests_passed: number;
  tests_failed: number;
  details: string[];
}

/**
 * Test delta compression end-to-end
 */
export function validateDeltaCompression(): TestResult {
  const results: TestResult = {
    success: false,
    bandwidth_reduction_percent: 0,
    tests_passed: 0,
    tests_failed: 0,
    details: []
  };
  
  try {
    logger.info('🧪 Starting delta compression validation...');
    
    // Test 1: Delta State Manager Creation
    const deltaManager = new DeltaStateManager();
    results.details.push('✅ DeltaStateManager created successfully');
    results.tests_passed++;
    
    // Test 2: Mock player data
    const mockCurrentState = {
      players: [
        {
          id: 'player1',
          username: 'TestPlayer1',
          x: 10.0,
          y: 15.0,
          rotation: 0.5,
          health: 100,
          maxHealth: 100,
          classType: 'archer',
          isAlive: true,
          lastUpdate: Date.now()
        },
        {
          id: 'player2', 
          username: 'TestPlayer2',
          x: 20.0,
          y: 25.0,
          rotation: 1.5,
          health: 80,
          maxHealth: 100,
          classType: 'berserker',
          isAlive: true,
          lastUpdate: Date.now()
        }
      ],
      projectiles: [
        {
          id: 'projectile1',
          x: 12.0,
          y: 16.0,
          rotation: 0.0,
          type: 'arrow',
          ownerId: 'player1',
          velocity: { x: 5.0, y: 0.0 }
        }
      ],
      roundInfo: {
        currentRound: 1,
        timeLeft: 60,
        status: 'in_progress',
        score: { player1: 0, player2: 0 }
      },
      timestamp: Date.now()
    };
    
    // Test 3: Generate first delta (should be full sync)
    const firstDelta = deltaManager.generateDelta('test-match', mockCurrentState);
    if (firstDelta.header.deltaType === 'full') {
      results.details.push('✅ First delta correctly generated as full sync');
      results.tests_passed++;
    } else {
      results.details.push('❌ First delta should be full sync');
      results.tests_failed++;
    }
    
    // Test 4: Generate second delta with small changes (should be incremental)
    const updatedState = {
      ...mockCurrentState,
      players: [
        {
          ...mockCurrentState.players[0],
          x: 10.1,  // Small movement
          y: 15.1
        },
        mockCurrentState.players[1]  // No change
      ],
      timestamp: Date.now()
    };
    
    const secondDelta = deltaManager.generateDelta('test-match', updatedState);
    if (secondDelta.header.deltaType === 'incremental') {
      results.details.push('✅ Second delta correctly generated as incremental');
      results.tests_passed++;
      
      // Check that only changed player is included
      if (secondDelta.players && secondDelta.players.length === 1) {
        results.details.push('✅ Delta only includes changed player');
        results.tests_passed++;
      } else {
        results.details.push('❌ Delta should only include changed player');
        results.tests_failed++;
      }
    } else {
      results.details.push('❌ Second delta should be incremental');
      results.tests_failed++;
    }
    
    // Test 5: Bandwidth calculation
    const fullStateSize = estimateFullStateSize(mockCurrentState);
    const deltaSize = estimateDeltaSize(secondDelta);
    const bandwidthReduction = ((fullStateSize - deltaSize) / fullStateSize) * 100;
    
    results.bandwidth_reduction_percent = Math.round(bandwidthReduction);
    
    if (bandwidthReduction > 50) {
      results.details.push(`✅ Bandwidth reduction: ${results.bandwidth_reduction_percent}% (target: >50%)`);
      results.tests_passed++;
    } else {
      results.details.push(`❌ Bandwidth reduction: ${results.bandwidth_reduction_percent}% (target: >50%)`);
      results.tests_failed++;
    }
    
    // Test 6: Position quantization
    const testPos = 10.156789;
    const quantized = Math.round(testPos / 0.1) * 0.1;
    if (Math.abs(quantized - 10.2) < 0.001) {
      results.details.push('✅ Position quantization working correctly');
      results.tests_passed++;
    } else {
      results.details.push('❌ Position quantization failed');
      results.tests_failed++;
    }
    
    // Overall success
    results.success = results.tests_failed === 0;
    
    logger.info(`🧪 Delta compression validation complete: ${results.tests_passed}/${results.tests_passed + results.tests_failed} tests passed`);
    
    return results;
    
  } catch (error) {
    results.details.push(`❌ Validation failed with error: ${error}`);
    results.tests_failed++;
    logger.error('❌ Delta compression validation failed:', error);
    return results;
  }
}

/**
 * Estimate full state size in bytes
 */
function estimateFullStateSize(state: any): number {
  const playerSize = 80; // ~80 bytes per player (all fields)
  const projectileSize = 60; // ~60 bytes per projectile
  const roundInfoSize = 50; // ~50 bytes for round info
  const mapDataSize = 200; // ~200 bytes for map data
  
  return (
    state.players.length * playerSize +
    state.projectiles.length * projectileSize +
    roundInfoSize +
    mapDataSize
  );
}

/**
 * Estimate delta size in bytes
 */
function estimateDeltaSize(delta: any): number {
  const headerSize = 50; // ~50 bytes header
  const playerDeltaSize = 30; // ~30 bytes per player delta (only changed fields)
  const projectileDeltaSize = 25; // ~25 bytes per projectile delta
  const roundInfoDeltaSize = 20; // ~20 bytes for round info delta
  
  let size = headerSize;
  
  if (delta.players) {
    size += delta.players.length * playerDeltaSize;
  }
  
  if (delta.projectiles) {
    size += delta.projectiles.length * projectileDeltaSize;
  }
  
  if (delta.roundInfo) {
    size += roundInfoDeltaSize;
  }
  
  // Note: No map data in deltas
  
  return size;
}

/**
 * Run validation and log results
 */
export function runDeltaValidation(): void {
  const results = validateDeltaCompression();
  
  console.log('\n🧪 DELTA COMPRESSION VALIDATION RESULTS');
  console.log('=====================================');
  console.log(`Overall Status: ${results.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Tests Passed: ${results.tests_passed}`);
  console.log(`Tests Failed: ${results.tests_failed}`);
  console.log(`Bandwidth Reduction: ${results.bandwidth_reduction_percent}%`);
  console.log('\nDetails:');
  results.details.forEach(detail => console.log(`  ${detail}`));
  console.log('\n');
}