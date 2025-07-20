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
  
  // Arena dimensions (scaled to 60x60)
  const arenaWidth = 60;
  const arenaHeight = 60;
  
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
  const centerX = 30;  // Doubled from 15
  const centerY = 30;  // Doubled from 15
  const compoundSize = 12;  // Doubled from 6
  
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
  // Top-left L-shaped cover (scaled coordinates)
  walls.push(
    {
      id: 'cover_tl_horizontal',
      start: { x: 8, y: 12 },  // Doubled from (4,6) to (8,12)
      end: { x: 16, y: 12 },   // Doubled from (8,6) to (16,12)
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_tl_vertical',
      start: { x: 12, y: 8 },  // Doubled from (6,4) to (12,8)
      end: { x: 12, y: 12 },   // Doubled from (6,6) to (12,12)
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Top-right L-shaped cover (scaled coordinates)
  walls.push(
    {
      id: 'cover_tr_horizontal',
      start: { x: 44, y: 12 },  // Doubled from (22,6) to (44,12)
      end: { x: 52, y: 12 },    // Doubled from (26,6) to (52,12)
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_tr_vertical',
      start: { x: 48, y: 8 },   // Doubled from (24,4) to (48,8)
      end: { x: 48, y: 12 },    // Doubled from (24,6) to (48,12)
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Bottom-left L-shaped cover (scaled coordinates)
  walls.push(
    {
      id: 'cover_bl_horizontal',
      start: { x: 8, y: 48 },   // Doubled from (4,24) to (8,48)
      end: { x: 16, y: 48 },    // Doubled from (8,24) to (16,48)
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_bl_vertical',
      start: { x: 12, y: 48 },  // Doubled from (6,24) to (12,48)
      end: { x: 12, y: 52 },    // Doubled from (6,26) to (12,52)
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // Bottom-right L-shaped cover (scaled coordinates)
  walls.push(
    {
      id: 'cover_br_horizontal',
      start: { x: 44, y: 48 },  // Doubled from (22,24) to (44,48)
      end: { x: 52, y: 48 },    // Doubled from (26,24) to (52,48)
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'cover_br_vertical',
      start: { x: 48, y: 48 },  // Doubled from (24,24) to (48,48)
      end: { x: 48, y: 52 },    // Doubled from (24,26) to (48,52)
      solid: true,
      textureId: 'wall_metal'
    }
  );
  
  // ===== VARIED PILLAR TYPES =====
  // Thin pillars (2x2) for light cover (scaled coordinates)
  walls.push(
    {
      id: 'thin_pillar_1_n',
      start: { x: 18, y: 18 },  // Doubled from (9,9) to (18,18)
      end: { x: 20, y: 18 },    // Doubled from (10,9) to (20,18)
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_1_e',
      start: { x: 20, y: 18 },  // Doubled from (10,9) to (20,18)
      end: { x: 20, y: 20 },    // Doubled from (10,10) to (20,20)
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_1_s',
      start: { x: 20, y: 20 },  // Doubled from (10,10) to (20,20)
      end: { x: 18, y: 20 },    // Doubled from (9,10) to (18,20)
      solid: true,
      textureId: 'wall_metal'
    },
    {
      id: 'thin_pillar_1_w',
      start: { x: 18, y: 20 },  // Doubled from (9,10) to (18,20)
      end: { x: 18, y: 18 },    // Doubled from (9,9) to (18,18)
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
  // Positioned for balanced tactical advantage (scaled coordinates)
  const spawnPoints = [
    { 
      id: 'spawn_player1',
      position: { x: 6, y: 6 },    // Doubled from (3,3) to (6,6)
      angle: Math.PI / 4, // Face northeast toward center
      team: 'player1' as const
    },
    { 
      id: 'spawn_player2',
      position: { x: 54, y: 54 },  // Doubled from (27,27) to (54,54)
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