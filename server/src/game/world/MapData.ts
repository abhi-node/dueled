/**
 * MapData - Wall definitions and spawn points
 * 
 * Contains the default arena map for testing
 */

import type { MapData, WallDefinition, SpawnPoint } from '../types.js';

/**
 * Create a simple rectangular arena for testing
 */
export function createTestArena(): MapData {
  const walls: WallDefinition[] = [
    // Outer walls (20x20 arena)
    { id: 'north', start: { x: -20, y: 20 }, end: { x: 20, y: 20 }, solid: true },
    { id: 'south', start: { x: -20, y: -20 }, end: { x: 20, y: -20 }, solid: true },
    { id: 'east', start: { x: 20, y: -20 }, end: { x: 20, y: 20 }, solid: true },
    { id: 'west', start: { x: -20, y: -20 }, end: { x: -20, y: 20 }, solid: true },
    
    // Center obstacle
    { id: 'center1', start: { x: -2, y: -2 }, end: { x: 2, y: -2 }, solid: true },
    { id: 'center2', start: { x: 2, y: -2 }, end: { x: 2, y: 2 }, solid: true },
    { id: 'center3', start: { x: 2, y: 2 }, end: { x: -2, y: 2 }, solid: true },
    { id: 'center4', start: { x: -2, y: 2 }, end: { x: -2, y: -2 }, solid: true },
  ];
  
  const spawnPoints: SpawnPoint[] = [
    { id: 'player1_spawn', position: { x: -15, y: 0 }, angle: 0, team: 'player1' },
    { id: 'player2_spawn', position: { x: 15, y: 0 }, angle: Math.PI, team: 'player2' }
  ];
  
  return {
    id: 'test_arena',
    name: 'Test Arena',
    bounds: { minX: -20, maxX: 20, minY: -20, maxY: 20 },
    walls,
    spawnPoints
  };
}