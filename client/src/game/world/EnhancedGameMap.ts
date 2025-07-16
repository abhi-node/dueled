/**
 * EnhancedGameMap - Advanced map system with various obstacle types
 * Supports circular pillars, hexagonal pillars, and complex wall structures
 */

import type { Vector2 } from '@dueled/shared';

export enum TileType {
  EMPTY = 0,
  WALL = 1,
  PILLAR_CIRCULAR = 2,
  PILLAR_HEXAGONAL = 3,
  PILLAR_RECTANGULAR = 4,
  WALL_THICK = 5,
  WALL_THIN = 6,
  DESTRUCTIBLE = 7,
  FLOOR_VARIANT = 8,  // Different floor texture
  CEILING_VARIANT = 9 // Different ceiling texture
}

export interface DetailedTile {
  type: TileType;
  variant?: number;      // Texture variant
  health?: number;       // For destructible elements
  radius?: number;       // For circular objects
  rotation?: number;     // For rotated objects
}

export class EnhancedGameMap {
  private grid: DetailedTile[][];
  private width: number;
  private height: number;
  private tileSize: number = 1;
  
  // Floor and ceiling patterns
  private floorPattern: number[][];
  private ceilingPattern: number[][];
  
  // Spawn points
  private spawnPoints: Vector2[] = [];
  
  // Map metadata
  private name: string;
  private theme: 'arena' | 'dungeon' | 'tech' = 'arena';
  
  constructor(width: number = 30, height: number = 30, name: string = 'Enhanced Arena') {
    this.width = width;
    this.height = height;
    this.name = name;
    
    // Initialize empty grid
    this.grid = Array(height).fill(null).map(() => 
      Array(width).fill(null).map(() => ({ type: TileType.EMPTY }))
    );
    
    // Initialize floor/ceiling patterns
    this.floorPattern = Array(height).fill(null).map(() => Array(width).fill(1));
    this.ceilingPattern = Array(height).fill(null).map(() => Array(width).fill(1));
    
    // Generate enhanced arena layout
    this.generateEnhancedArena();
  }
  
  /**
   * Generate an enhanced arena with various obstacles
   */
  private generateEnhancedArena(): void {
    // Create varied border walls
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
          // Alternate between thick and regular walls
          const wallType = (x + y) % 3 === 0 ? TileType.WALL_THICK : TileType.WALL;
          this.grid[y][x] = { type: wallType, variant: 1 };
        }
      }
    }
    
    // Add circular pillars - smaller and fewer for testing
    this.addCircularPillar(10, 10, 0.5);
    this.addCircularPillar(20, 20, 0.5);
    
    // Add small rectangular pillars
    this.addRectangularPillar(15, 8, 1, 1);
    this.addRectangularPillar(15, 22, 1, 1);
    
    // Add minimal walls for testing
    this.addComplexWall(15, 5, 1, 3, TileType.WALL_THIN);
    this.addComplexWall(15, 23, 1, 3, TileType.WALL_THIN);
    
    // Create floor patterns
    this.createFloorPatterns();
    
    // Set spawn points - ensure they are in empty spaces
    this.spawnPoints = [
      { x: 5.5, y: 5.5 },    // Top-left (away from walls and pillars)
      { x: 24.5, y: 5.5 },   // Top-right (away from walls and pillars)
      { x: 5.5, y: 24.5 },   // Bottom-left (away from walls and pillars)
      { x: 24.5, y: 24.5 },  // Bottom-right (away from walls and pillars)
      { x: 15.5, y: 15.5 }   // Center (slightly offset to avoid obstacles)
    ];
    
    // Verify spawn points are walkable
    for (const spawn of this.spawnPoints) {
      if (!this.isWalkable(spawn.x, spawn.y)) {
        console.warn('⚠️ Spawn point at', spawn, 'is not walkable!');
      }
    }
  }
  
  /**
   * Add a circular pillar
   */
  private addCircularPillar(x: number, y: number, radius: number = 1): void {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    // Mark the center tile
    if (this.isInBounds(gridX, gridY)) {
      this.grid[gridY][gridX] = { 
        type: TileType.PILLAR_CIRCULAR, 
        radius: radius,
        variant: 1 
      };
    }
    
    // Mark surrounding tiles if radius > 0.5
    if (radius > 0.5) {
      const checkRadius = Math.ceil(radius);
      for (let dy = -checkRadius; dy <= checkRadius; dy++) {
        for (let dx = -checkRadius; dx <= checkRadius; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= radius && this.isInBounds(gridX + dx, gridY + dy)) {
            this.grid[gridY + dy][gridX + dx] = { 
              type: TileType.PILLAR_CIRCULAR,
              radius: radius,
              variant: 1
            };
          }
        }
      }
    }
  }
  
  /**
   * Add a hexagonal pillar
   */
  private addHexagonalPillar(x: number, y: number): void {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    // Hexagon pattern (simplified)
    const hexPattern = [
      [0, 1, 1, 0],
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [0, 1, 1, 0]
    ];
    
    for (let dy = 0; dy < hexPattern.length; dy++) {
      for (let dx = 0; dx < hexPattern[dy].length; dx++) {
        if (hexPattern[dy][dx] === 1) {
          const px = gridX + dx - 1;
          const py = gridY + dy - 1;
          if (this.isInBounds(px, py)) {
            this.grid[py][px] = { 
              type: TileType.PILLAR_HEXAGONAL,
              variant: 1
            };
          }
        }
      }
    }
  }
  
  /**
   * Add a rectangular pillar
   */
  private addRectangularPillar(x: number, y: number, width: number, height: number): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (this.isInBounds(px, py)) {
          this.grid[py][px] = { 
            type: TileType.PILLAR_RECTANGULAR,
            variant: 1
          };
        }
      }
    }
  }
  
  /**
   * Add a complex wall with varying thickness
   */
  private addComplexWall(x: number, y: number, width: number, height: number, wallType: TileType): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (this.isInBounds(px, py)) {
          this.grid[py][px] = { 
            type: wallType,
            variant: 1
          };
        }
      }
    }
  }
  
  /**
   * Add destructible walls
   */
  private addDestructibleWall(x: number, y: number, width: number, height: number): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (this.isInBounds(px, py)) {
          this.grid[py][px] = { 
            type: TileType.DESTRUCTIBLE,
            health: 100,
            variant: 1
          };
        }
      }
    }
  }
  
  /**
   * Create floor patterns for visual variety
   */
  private createFloorPatterns(): void {
    // Create a checkered pattern in some areas
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Center area has different pattern
        if (x >= 10 && x <= 20 && y >= 10 && y <= 20) {
          this.floorPattern[y][x] = ((x + y) % 2 === 0) ? 1 : 2;
        }
        // Corners have another pattern
        else if ((x < 5 || x > 25) && (y < 5 || y > 25)) {
          this.floorPattern[y][x] = 3;
        }
      }
    }
  }
  
  /**
   * Check if a position is within bounds
   */
  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
  
  /**
   * Get the tile at a specific position
   */
  public getTile(x: number, y: number): DetailedTile {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    if (!this.isInBounds(gridX, gridY)) {
      return { type: TileType.WALL, variant: 1 };
    }
    
    return this.grid[gridY][gridX];
  }
  
  /**
   * Get simple tile type for compatibility
   */
  public getSimpleTile(x: number, y: number): number {
    const tile = this.getTile(x, y);
    return tile.type === TileType.EMPTY ? 0 : 1;
  }
  
  /**
   * Check if a position is walkable
   */
  public isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile.type === TileType.EMPTY || tile.type === TileType.FLOOR_VARIANT;
  }
  
  /**
   * Check for circular collision
   */
  public checkCircularCollision(x: number, y: number, playerRadius: number = 0.3): boolean {
    const tile = this.getTile(x, y);
    
    if (tile.type === TileType.PILLAR_CIRCULAR && tile.radius) {
      // Get pillar center
      const pillarX = Math.floor(x) + 0.5;
      const pillarY = Math.floor(y) + 0.5;
      
      // Check distance
      const dist = Math.sqrt(Math.pow(x - pillarX, 2) + Math.pow(y - pillarY, 2));
      return dist < (tile.radius + playerRadius);
    }
    
    return !this.isWalkable(x, y);
  }
  
  /**
   * Get floor texture variant at position
   */
  public getFloorVariant(x: number, y: number): number {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    if (!this.isInBounds(gridX, gridY)) {
      return 1;
    }
    
    return this.floorPattern[gridY][gridX];
  }
  
  /**
   * Get ceiling texture variant at position
   */
  public getCeilingVariant(x: number, y: number): number {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    if (!this.isInBounds(gridX, gridY)) {
      return 1;
    }
    
    return this.ceilingPattern[gridY][gridX];
  }
  
  /**
   * Get the raw grid data (simplified for raycasting)
   */
  public getGrid(): number[][] {
    return this.grid.map(row => 
      row.map(tile => {
        // Only empty and floor variant tiles are walkable
        if (tile.type === TileType.EMPTY || tile.type === TileType.FLOOR_VARIANT) {
          return 0;
        }
        // Everything else is solid
        return 1;
      })
    );
  }
  
  /**
   * Get detailed grid for advanced rendering
   */
  public getDetailedGrid(): DetailedTile[][] {
    return this.grid;
  }
  
  /**
   * Get map dimensions
   */
  public getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
  
  /**
   * Get spawn points
   */
  public getSpawnPoints(): Vector2[] {
    return [...this.spawnPoints];
  }
  
  /**
   * Get a random spawn point
   */
  public getRandomSpawnPoint(): Vector2 {
    const index = Math.floor(Math.random() * this.spawnPoints.length);
    return { ...this.spawnPoints[index] };
  }
  
  /**
   * Generate a minimap representation
   */
  public generateMinimap(playerPos?: Vector2): ImageData {
    const scale = 4; // Each tile is 4x4 pixels
    const canvas = document.createElement('canvas');
    canvas.width = this.width * scale;
    canvas.height = this.height * scale;
    const ctx = canvas.getContext('2d')!;
    
    // Draw tiles
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.grid[y][x];
        
        switch (tile.type) {
          case TileType.EMPTY:
            ctx.fillStyle = '#1a202c'; // Empty space
            break;
          case TileType.WALL:
            ctx.fillStyle = '#64748b'; // Regular wall
            break;
          case TileType.WALL_THICK:
            ctx.fillStyle = '#475569'; // Thick wall
            break;
          case TileType.WALL_THIN:
            ctx.fillStyle = '#94a3b8'; // Thin wall
            break;
          case TileType.PILLAR_CIRCULAR:
            ctx.fillStyle = '#3b82f6'; // Blue for circular pillars
            break;
          case TileType.PILLAR_HEXAGONAL:
            ctx.fillStyle = '#6366f1'; // Indigo for hexagonal pillars
            break;
          case TileType.PILLAR_RECTANGULAR:
            ctx.fillStyle = '#8b5cf6'; // Purple for rectangular pillars
            break;
          case TileType.DESTRUCTIBLE:
            ctx.fillStyle = '#ef4444'; // Red for destructible
            break;
          default:
            ctx.fillStyle = '#6b7280'; // Gray for unknown
        }
        
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    
    // Draw grid lines
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= this.width; i++) {
      ctx.beginPath();
      ctx.moveTo(i * scale, 0);
      ctx.lineTo(i * scale, this.height * scale);
      ctx.stroke();
    }
    for (let i = 0; i <= this.height; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * scale);
      ctx.lineTo(this.width * scale, i * scale);
      ctx.stroke();
    }
    
    // Draw spawn points
    ctx.fillStyle = '#fbbf24'; // Amber for spawn points
    for (const spawn of this.spawnPoints) {
      ctx.beginPath();
      ctx.arc(spawn.x * scale, spawn.y * scale, scale * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw player position if provided
    if (playerPos) {
      ctx.fillStyle = '#10b981'; // Green for player
      ctx.beginPath();
      ctx.arc(playerPos.x * scale, playerPos.y * scale, scale, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}