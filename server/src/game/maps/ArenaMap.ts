/**
 * ArenaMap - Creates a simple arena map for testing
 * 
 * Generates a basic rectangular arena with walls around the perimeter
 * and some obstacles in the middle for tactical gameplay.
 */

import type { MapData, WallDefinition, Position } from '../types.js';

/**
 * Create a simple arena map for 1v1 combat
 */
export function createArenaMap(): MapData {
  const walls: WallDefinition[] = [];
  
  // Arena dimensions
  const arenaWidth = 20;
  const arenaHeight = 20;
  const wallThickness = 0.5;
  
  // Create outer walls
  
  // Top wall
  walls.push({
    id: 'wall_top',
    start: { x: 0, y: 0 },
    end: { x: arenaWidth, y: 0 },
    solid: true,
    textureId: 'stone'
  });
  
  // Right wall
  walls.push({
    id: 'wall_right',
    start: { x: arenaWidth, y: 0 },
    end: { x: arenaWidth, y: arenaHeight },
    solid: true,
    textureId: 'stone'
  });
  
  // Bottom wall
  walls.push({
    id: 'wall_bottom',
    start: { x: arenaWidth, y: arenaHeight },
    end: { x: 0, y: arenaHeight },
    solid: true,
    textureId: 'stone'
  });
  
  // Left wall
  walls.push({
    id: 'wall_left',
    start: { x: 0, y: arenaHeight },
    end: { x: 0, y: 0 },
    solid: true,
    textureId: 'stone'
  });
  
  // Add some obstacles in the center for tactical gameplay
  
  // Central pillar
  walls.push({
    id: 'pillar_center_top',
    start: { x: 9, y: 9 },
    end: { x: 11, y: 9 },
    solid: true,
    textureId: 'stone'
  });
  
  walls.push({
    id: 'pillar_center_right',
    start: { x: 11, y: 9 },
    end: { x: 11, y: 11 },
    solid: true,
    textureId: 'stone'
  });
  
  walls.push({
    id: 'pillar_center_bottom',
    start: { x: 11, y: 11 },
    end: { x: 9, y: 11 },
    solid: true,
    textureId: 'stone'
  });
  
  walls.push({
    id: 'pillar_center_left',
    start: { x: 9, y: 11 },
    end: { x: 9, y: 9 },
    solid: true,
    textureId: 'stone'
  });
  
  // Two smaller obstacles for cover
  
  // Top-left obstacle
  walls.push({
    id: 'obstacle_tl_top',
    start: { x: 4, y: 4 },
    end: { x: 6, y: 4 },
    solid: true,
    textureId: 'stone'
  });
  
  walls.push({
    id: 'obstacle_tl_bottom',
    start: { x: 6, y: 6 },
    end: { x: 4, y: 6 },
    solid: true,
    textureId: 'stone'
  });
  
  // Bottom-right obstacle
  walls.push({
    id: 'obstacle_br_top',
    start: { x: 14, y: 14 },
    end: { x: 16, y: 14 },
    solid: true,
    textureId: 'stone'
  });
  
  walls.push({
    id: 'obstacle_br_bottom',
    start: { x: 16, y: 16 },
    end: { x: 14, y: 16 },
    solid: true,
    textureId: 'stone'
  });
  
  // Define spawn points (opposite corners)
  const spawnPoints = [
    { 
      id: 'spawn_player1',
      position: { x: 2, y: 2 },
      angle: Math.PI / 4,  // Face northeast
      team: 'player1' as const
    },
    { 
      id: 'spawn_player2',
      position: { x: 18, y: 18 },
      angle: (5 * Math.PI) / 4,  // Face southwest
      team: 'player2' as const
    }
  ];
  
  return {
    id: 'arena_basic',
    name: 'Basic Arena',
    walls,
    spawnPoints,
    bounds: {
      minX: 0,
      maxX: arenaWidth,
      minY: 0,
      maxY: arenaHeight
    }
  };
}

/**
 * Create a larger arena map for more complex gameplay
 */
export function createLargeArenaMap(): MapData {
  const walls: WallDefinition[] = [];
  
  // Arena dimensions
  const arenaWidth = 30;
  const arenaHeight = 30;
  
  // Create outer walls
  walls.push(
    {
      id: 'wall_top',
      start: { x: 0, y: 0 },
      end: { x: arenaWidth, y: 0 },
      solid: true,
      textureId: 'stone'
    },
    {
      id: 'wall_right',
      start: { x: arenaWidth, y: 0 },
      end: { x: arenaWidth, y: arenaHeight },
      solid: true,
      textureId: 'stone'
    },
    {
      id: 'wall_bottom',
      start: { x: arenaWidth, y: arenaHeight },
      end: { x: 0, y: arenaHeight },
      solid: true,
      textureId: 'stone'
    },
    {
      id: 'wall_left',
      start: { x: 0, y: arenaHeight },
      end: { x: 0, y: 0 },
      solid: true,
      textureId: 'stone'
    }
  );
  
  // Add more complex obstacles
  // ... (can be expanded later for different map variants)
  
  const spawnPoints = [
    { 
      id: 'spawn_player1',
      position: { x: 3, y: 3 },
      angle: Math.PI / 4,
      team: 'player1' as const
    },
    { 
      id: 'spawn_player2',
      position: { x: 27, y: 27 },
      angle: (5 * Math.PI) / 4,
      team: 'player2' as const
    }
  ];
  
  return {
    id: 'arena_large',
    name: 'Large Arena',
    walls,
    spawnPoints,
    bounds: {
      minX: 0,
      maxX: arenaWidth,
      minY: 0,
      maxY: arenaHeight
    }
  };
}