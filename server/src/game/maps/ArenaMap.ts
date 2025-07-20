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
    textureId: 'wall_metal'
  });
  
  // Right wall
  walls.push({
    id: 'wall_right',
    start: { x: arenaWidth, y: 0 },
    end: { x: arenaWidth, y: arenaHeight },
    solid: true,
    textureId: 'wall_metal'
  });
  
  // Bottom wall
  walls.push({
    id: 'wall_bottom',
    start: { x: arenaWidth, y: arenaHeight },
    end: { x: 0, y: arenaHeight },
    solid: true,
    textureId: 'wall_metal'
  });
  
  // Left wall
  walls.push({
    id: 'wall_left',
    start: { x: 0, y: arenaHeight },
    end: { x: 0, y: 0 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  // Add some obstacles in the center for tactical gameplay
  
  // Central pillar
  walls.push({
    id: 'pillar_center_top',
    start: { x: 9, y: 9 },
    end: { x: 11, y: 9 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  walls.push({
    id: 'pillar_center_right',
    start: { x: 11, y: 9 },
    end: { x: 11, y: 11 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  walls.push({
    id: 'pillar_center_bottom',
    start: { x: 11, y: 11 },
    end: { x: 9, y: 11 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  walls.push({
    id: 'pillar_center_left',
    start: { x: 9, y: 11 },
    end: { x: 9, y: 9 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  // Two smaller obstacles for cover
  
  // Top-left obstacle
  walls.push({
    id: 'obstacle_tl_top',
    start: { x: 4, y: 4 },
    end: { x: 6, y: 4 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  walls.push({
    id: 'obstacle_tl_bottom',
    start: { x: 6, y: 6 },
    end: { x: 4, y: 6 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  // Bottom-right obstacle
  walls.push({
    id: 'obstacle_br_top',
    start: { x: 14, y: 14 },
    end: { x: 16, y: 14 },
    solid: true,
    textureId: 'wall_metal'
  });
  
  walls.push({
    id: 'obstacle_br_bottom',
    start: { x: 16, y: 16 },
    end: { x: 14, y: 16 },
    solid: true,
    textureId: 'wall_metal'
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
 * Create a tactical arena map (30x30) with varied obstacles and strategic positioning
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
      textureId: 'wall_metal'
    },
    {
      id: 'wall_right',
      start: { x: arenaWidth, y: 0 },
      end: { x: arenaWidth, y: arenaHeight },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wall_bottom',
      start: { x: arenaWidth, y: arenaHeight },
      end: { x: 0, y: arenaHeight },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wall_left',
      start: { x: 0, y: arenaHeight },
      end: { x: 0, y: 0 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // ===== CENTRAL COMPOUND STRUCTURE =====
  // Rectangular building-like area in map center with multiple entrances
  const centerX = 15;
  const centerY = 15;
  const compoundSize = 6;
  
  // Compound outer walls (with gaps for entrances)
  // North wall (with gap in middle)
  walls.push(
    {
      id: 'compound_north_left',
      start: { x: centerX - compoundSize/2, y: centerY - compoundSize/2 },
      end: { x: centerX - 1, y: centerY - compoundSize/2 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'compound_north_right',
      start: { x: centerX + 1, y: centerY - compoundSize/2 },
      end: { x: centerX + compoundSize/2, y: centerY - compoundSize/2 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // South wall (with gap in middle)
  walls.push(
    {
      id: 'compound_south_left',
      start: { x: centerX - compoundSize/2, y: centerY + compoundSize/2 },
      end: { x: centerX - 1, y: centerY + compoundSize/2 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'compound_south_right',
      start: { x: centerX + 1, y: centerY + compoundSize/2 },
      end: { x: centerX + compoundSize/2, y: centerY + compoundSize/2 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // East wall (with gap in middle)
  walls.push(
    {
      id: 'compound_east_top',
      start: { x: centerX + compoundSize/2, y: centerY - compoundSize/2 },
      end: { x: centerX + compoundSize/2, y: centerY - 1 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'compound_east_bottom',
      start: { x: centerX + compoundSize/2, y: centerY + 1 },
      end: { x: centerX + compoundSize/2, y: centerY + compoundSize/2 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // West wall (with gap in middle)
  walls.push(
    {
      id: 'compound_west_top',
      start: { x: centerX - compoundSize/2, y: centerY - compoundSize/2 },
      end: { x: centerX - compoundSize/2, y: centerY - 1 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'compound_west_bottom',
      start: { x: centerX - compoundSize/2, y: centerY + 1 },
      end: { x: centerX - compoundSize/2, y: centerY + compoundSize/2 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Internal compound structure (small pillar in center)
  walls.push(
    {
      id: 'compound_center_pillar_n',
      start: { x: centerX - 0.5, y: centerY - 0.5 },
      end: { x: centerX + 0.5, y: centerY - 0.5 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'compound_center_pillar_e',
      start: { x: centerX + 0.5, y: centerY - 0.5 },
      end: { x: centerX + 0.5, y: centerY + 0.5 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'compound_center_pillar_s',
      start: { x: centerX + 0.5, y: centerY + 0.5 },
      end: { x: centerX - 0.5, y: centerY + 0.5 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'compound_center_pillar_w',
      start: { x: centerX - 0.5, y: centerY + 0.5 },
      end: { x: centerX - 0.5, y: centerY - 0.5 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // ===== CORNER L-SHAPED COVERS =====
  // Top-left L-shaped cover
  walls.push(
    {
      id: 'cover_tl_horizontal',
      start: { x: 4, y: 6 },
      end: { x: 8, y: 6 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_tl_vertical',
      start: { x: 6, y: 4 },
      end: { x: 6, y: 6 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Top-right L-shaped cover
  walls.push(
    {
      id: 'cover_tr_horizontal',
      start: { x: 22, y: 6 },
      end: { x: 26, y: 6 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_tr_vertical',
      start: { x: 24, y: 4 },
      end: { x: 24, y: 6 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Bottom-left L-shaped cover
  walls.push(
    {
      id: 'cover_bl_horizontal',
      start: { x: 4, y: 24 },
      end: { x: 8, y: 24 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_bl_vertical',
      start: { x: 6, y: 24 },
      end: { x: 6, y: 26 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Bottom-right L-shaped cover
  walls.push(
    {
      id: 'cover_br_horizontal',
      start: { x: 22, y: 24 },
      end: { x: 26, y: 24 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_br_vertical',
      start: { x: 24, y: 24 },
      end: { x: 24, y: 26 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // ===== VARIED PILLAR TYPES =====
  // Thin pillars (1x1) for light cover
  walls.push(
    {
      id: 'thin_pillar_1_n',
      start: { x: 9, y: 9 },
      end: { x: 10, y: 9 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_1_e',
      start: { x: 10, y: 9 },
      end: { x: 10, y: 10 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_1_s',
      start: { x: 10, y: 10 },
      end: { x: 9, y: 10 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_1_w',
      start: { x: 9, y: 10 },
      end: { x: 9, y: 9 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  walls.push(
    {
      id: 'thin_pillar_2_n',
      start: { x: 20, y: 20 },
      end: { x: 21, y: 20 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_2_e',
      start: { x: 21, y: 20 },
      end: { x: 21, y: 21 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_2_s',
      start: { x: 21, y: 21 },
      end: { x: 20, y: 21 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_2_w',
      start: { x: 20, y: 21 },
      end: { x: 20, y: 20 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Wide pillars (2x2) for substantial cover
  walls.push(
    {
      id: 'wide_pillar_1_n',
      start: { x: 7, y: 20 },
      end: { x: 9, y: 20 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wide_pillar_1_e',
      start: { x: 9, y: 20 },
      end: { x: 9, y: 22 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wide_pillar_1_s',
      start: { x: 9, y: 22 },
      end: { x: 7, y: 22 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wide_pillar_1_w',
      start: { x: 7, y: 22 },
      end: { x: 7, y: 20 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  walls.push(
    {
      id: 'wide_pillar_2_n',
      start: { x: 21, y: 8 },
      end: { x: 23, y: 8 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wide_pillar_2_e',
      start: { x: 23, y: 8 },
      end: { x: 23, y: 10 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wide_pillar_2_s',
      start: { x: 23, y: 10 },
      end: { x: 21, y: 10 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'wide_pillar_2_w',
      start: { x: 21, y: 10 },
      end: { x: 21, y: 8 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // ===== SIGHT LINE BREAKERS =====
  // Strategic walls to break long sight lines without blocking movement
  walls.push(
    {
      id: 'sight_breaker_1',
      start: { x: 10, y: 5 },
      end: { x: 12, y: 5 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'sight_breaker_2',
      start: { x: 18, y: 25 },
      end: { x: 20, y: 25 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'sight_breaker_3',
      start: { x: 5, y: 15 },
      end: { x: 5, y: 17 },
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'sight_breaker_4',
      start: { x: 25, y: 13 },
      end: { x: 25, y: 15 },
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // ===== SPAWN POINTS =====
  // Positioned for balanced tactical advantage
  const spawnPoints = [
    { 
      id: 'spawn_player1',
      position: { x: 3, y: 3 },
      angle: Math.PI / 4, // Face northeast toward center
      team: 'player1' as const
    },
    { 
      id: 'spawn_player2',
      position: { x: 27, y: 27 },
      angle: (5 * Math.PI) / 4, // Face southwest toward center
      team: 'player2' as const
    }
  ];
  
  return {
    id: 'arena_tactical',
    name: 'Tactical Arena',
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