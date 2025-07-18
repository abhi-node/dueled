/**
 * ArenaMap - Simple static arena layouts for 1v1 combat
 * 
 * Provides predefined arena configurations with spawn points and obstacles
 * Designed for balanced Archer vs Berserker combat
 */

export interface Vector2 {
  x: number;
  y: number;
}

export interface Obstacle {
  id: string;
  type: 'wall' | 'pillar' | 'cover';
  position: Vector2;
  size: Vector2;
  blocking: boolean;     // Blocks movement
  losBlocking: boolean;  // Blocks line of sight
}

export interface SpawnPoint {
  id: string;
  position: Vector2;
  rotation: number;      // Initial facing direction (radians)
  team: 1 | 2;          // Player 1 or Player 2
}

export interface ArenaConfig {
  id: string;
  name: string;
  description: string;
  size: Vector2;         // Arena dimensions
  spawnPoints: SpawnPoint[];
  obstacles: Obstacle[];
  backgroundType: 'sand' | 'stone' | 'grass' | 'metal';
  recommendedFor: string[]; // Class combinations this map works well for
}

/**
 * ArenaMap - Manages arena configurations and layouts
 */
export class ArenaMap {
  private static readonly ARENA_CONFIGS: Map<string, ArenaConfig> = new Map();
  
  /**
   * Initialize default arena configurations
   */
  static {
    this.initializeArenas();
  }
  
  /**
   * Get arena configuration by ID
   */
  static getArena(arenaId: string): ArenaConfig | null {
    return this.ARENA_CONFIGS.get(arenaId) || null;
  }
  
  /**
   * Get all available arenas
   */
  static getAllArenas(): ArenaConfig[] {
    return Array.from(this.ARENA_CONFIGS.values());
  }
  
  /**
   * Get random arena suitable for given class matchup
   */
  static getRandomArena(class1?: string, class2?: string): ArenaConfig {
    const allArenas = this.getAllArenas();
    
    if (class1 && class2) {
      // Filter arenas suitable for this matchup
      const suitableArenas = allArenas.filter(arena => 
        arena.recommendedFor.includes(`${class1}-${class2}`) ||
        arena.recommendedFor.includes(`${class2}-${class1}`) ||
        arena.recommendedFor.includes('any')
      );
      
      if (suitableArenas.length > 0) {
        return suitableArenas[Math.floor(Math.random() * suitableArenas.length)];
      }
    }
    
    // Fallback to any arena
    return allArenas[Math.floor(Math.random() * allArenas.length)];
  }
  
  /**
   * Validate arena configuration
   */
  static validateArena(arena: ArenaConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check spawn points
    if (arena.spawnPoints.length !== 2) {
      errors.push('Arena must have exactly 2 spawn points');
    }
    
    const team1Spawns = arena.spawnPoints.filter(sp => sp.team === 1);
    const team2Spawns = arena.spawnPoints.filter(sp => sp.team === 2);
    
    if (team1Spawns.length !== 1 || team2Spawns.length !== 1) {
      errors.push('Arena must have exactly 1 spawn point per team');
    }
    
    // Check spawn point positions are within arena
    for (const spawn of arena.spawnPoints) {
      if (spawn.position.x < 0 || spawn.position.x > arena.size.x ||
          spawn.position.y < 0 || spawn.position.y > arena.size.y) {
        errors.push(`Spawn point ${spawn.id} is outside arena bounds`);
      }
    }
    
    // Check obstacles are within arena
    for (const obstacle of arena.obstacles) {
      if (obstacle.position.x < 0 || obstacle.position.x + obstacle.size.x > arena.size.x ||
          obstacle.position.y < 0 || obstacle.position.y + obstacle.size.y > arena.size.y) {
        errors.push(`Obstacle ${obstacle.id} extends outside arena bounds`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Check if position is blocked by obstacles
   */
  static isPositionBlocked(arena: ArenaConfig, position: Vector2, radius: number = 0.5): boolean {
    for (const obstacle of arena.obstacles) {
      if (!obstacle.blocking) continue;
      
      // Check if position (with radius) intersects obstacle
      if (position.x + radius > obstacle.position.x &&
          position.x - radius < obstacle.position.x + obstacle.size.x &&
          position.y + radius > obstacle.position.y &&
          position.y - radius < obstacle.position.y + obstacle.size.y) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check line of sight between two positions
   */
  static hasLineOfSight(arena: ArenaConfig, from: Vector2, to: Vector2): boolean {
    // Simple line-rectangle intersection for each LOS-blocking obstacle
    for (const obstacle of arena.obstacles) {
      if (!obstacle.losBlocking) continue;
      
      if (this.lineIntersectsRect(from, to, obstacle.position, obstacle.size)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if line intersects rectangle
   */
  private static lineIntersectsRect(lineStart: Vector2, lineEnd: Vector2, rectPos: Vector2, rectSize: Vector2): boolean {
    // Use line-rectangle intersection algorithm
    const rectLeft = rectPos.x;
    const rectRight = rectPos.x + rectSize.x;
    const rectTop = rectPos.y;
    const rectBottom = rectPos.y + rectSize.y;
    
    // Check if line endpoints are on opposite sides of rectangle edges
    const startLeft = lineStart.x < rectLeft;
    const startRight = lineStart.x > rectRight;
    const startTop = lineStart.y < rectTop;
    const startBottom = lineStart.y > rectBottom;
    
    const endLeft = lineEnd.x < rectLeft;
    const endRight = lineEnd.x > rectRight;
    const endTop = lineEnd.y < rectTop;
    const endBottom = lineEnd.y > rectBottom;
    
    // If both points are completely on one side, no intersection
    if ((startLeft && endLeft) || (startRight && endRight) || 
        (startTop && endTop) || (startBottom && endBottom)) {
      return false;
    }
    
    // If either point is inside rectangle, there's intersection
    if ((!startLeft && !startRight && !startTop && !startBottom) ||
        (!endLeft && !endRight && !endTop && !endBottom)) {
      return true;
    }
    
    // More complex intersection testing would go here
    // For simplicity, assume intersection if we get this far
    return true;
  }
  
  /**
   * Initialize default arena configurations
   */
  private static initializeArenas(): void {
    // Classic Arena - Open with minimal cover
    this.ARENA_CONFIGS.set('classic', {
      id: 'classic',
      name: 'Classic Arena',
      description: 'Open arena with pillars for strategic positioning',
      size: { x: 30, y: 30 },
      spawnPoints: [
        {
          id: 'spawn1',
          position: { x: 5, y: 15 },
          rotation: 0, // Facing right
          team: 1
        },
        {
          id: 'spawn2', 
          position: { x: 25, y: 15 },
          rotation: Math.PI, // Facing left
          team: 2
        }
      ],
      obstacles: [
        {
          id: 'center_pillar',
          type: 'pillar',
          position: { x: 14, y: 14 },
          size: { x: 2, y: 2 },
          blocking: true,
          losBlocking: true
        },
        {
          id: 'top_cover',
          type: 'cover',
          position: { x: 12, y: 8 },
          size: { x: 6, y: 1 },
          blocking: true,
          losBlocking: true
        },
        {
          id: 'bottom_cover',
          type: 'cover',
          position: { x: 12, y: 21 },
          size: { x: 6, y: 1 },
          blocking: true,
          losBlocking: true
        }
      ],
      backgroundType: 'sand',
      recommendedFor: ['archer-berserker', 'any']
    });
    
    // Pillars Arena - Multiple cover points
    this.ARENA_CONFIGS.set('pillars', {
      id: 'pillars',
      name: 'Pillar Maze',
      description: 'Multiple pillars provide cover and tactical opportunities',
      size: { x: 28, y: 28 },
      spawnPoints: [
        {
          id: 'spawn1',
          position: { x: 4, y: 14 },
          rotation: 0,
          team: 1
        },
        {
          id: 'spawn2',
          position: { x: 24, y: 14 },
          rotation: Math.PI,
          team: 2
        }
      ],
      obstacles: [
        // Corner pillars
        {
          id: 'pillar_tl',
          type: 'pillar',
          position: { x: 8, y: 8 },
          size: { x: 2, y: 2 },
          blocking: true,
          losBlocking: true
        },
        {
          id: 'pillar_tr',
          type: 'pillar',
          position: { x: 18, y: 8 },
          size: { x: 2, y: 2 },
          blocking: true,
          losBlocking: true
        },
        {
          id: 'pillar_bl',
          type: 'pillar',
          position: { x: 8, y: 18 },
          size: { x: 2, y: 2 },
          blocking: true,
          losBlocking: true
        },
        {
          id: 'pillar_br',
          type: 'pillar',
          position: { x: 18, y: 18 },
          size: { x: 2, y: 2 },
          blocking: true,
          losBlocking: true
        },
        // Center cross
        {
          id: 'center_vertical',
          type: 'wall',
          position: { x: 13, y: 12 },
          size: { x: 2, y: 4 },
          blocking: true,
          losBlocking: true
        }
      ],
      backgroundType: 'stone',
      recommendedFor: ['archer-berserker', 'any']
    });
    
    // Open Field - Minimal obstacles, favors ranged
    this.ARENA_CONFIGS.set('field', {
      id: 'field',
      name: 'Open Field',
      description: 'Wide open space with minimal cover - favors ranged combat',
      size: { x: 35, y: 25 },
      spawnPoints: [
        {
          id: 'spawn1',
          position: { x: 5, y: 12.5 },
          rotation: 0,
          team: 1
        },
        {
          id: 'spawn2',
          position: { x: 30, y: 12.5 },
          rotation: Math.PI,
          team: 2
        }
      ],
      obstacles: [
        {
          id: 'single_cover',
          type: 'cover',
          position: { x: 16, y: 11 },
          size: { x: 3, y: 3 },
          blocking: true,
          losBlocking: true
        }
      ],
      backgroundType: 'grass',
      recommendedFor: ['archer-archer', 'any']
    });
    
    // Close Quarters - Favors melee combat
    this.ARENA_CONFIGS.set('quarters', {
      id: 'quarters',
      name: 'Close Quarters',
      description: 'Compact arena with lots of cover - favors melee combat',
      size: { x: 20, y: 20 },
      spawnPoints: [
        {
          id: 'spawn1',
          position: { x: 3, y: 10 },
          rotation: 0,
          team: 1
        },
        {
          id: 'spawn2',
          position: { x: 17, y: 10 },
          rotation: Math.PI,
          team: 2
        }
      ],
      obstacles: [
        // Multiple walls creating corridors
        {
          id: 'wall_top',
          type: 'wall',
          position: { x: 7, y: 5 },
          size: { x: 6, y: 1 },
          blocking: true,
          losBlocking: true
        },
        {
          id: 'wall_bottom',
          type: 'wall',
          position: { x: 7, y: 14 },
          size: { x: 6, y: 1 },
          blocking: true,
          losBlocking: true
        },
        {
          id: 'center_block',
          type: 'cover',
          position: { x: 9, y: 9 },
          size: { x: 2, y: 2 },
          blocking: true,
          losBlocking: true
        }
      ],
      backgroundType: 'metal',
      recommendedFor: ['berserker-berserker', 'any']
    });
    
    console.log(`Initialized ${this.ARENA_CONFIGS.size} arena configurations`);
  }
}