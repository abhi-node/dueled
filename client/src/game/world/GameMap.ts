/**
 * GameMap - Grid-based map system for the Doom-style arena
 * Manages the 2D grid representation of the game world
 */

import type { Vector2 } from '@dueled/shared';

export interface MapTile {
  type: number; // 0 = empty, 1 = wall, 2 = destructible, 3 = special
  texture?: string;
  health?: number; // For destructible walls
}

export class GameMap {
  private grid: number[][];
  private width: number;
  private height: number;
  private tileSize: number = 1; // Size of each grid cell in world units
  
  // Spawn points
  private spawnPoints: Vector2[] = [];
  
  // Map metadata
  private name: string;
  private theme: 'arena' | 'dungeon' | 'tech' = 'arena';
  
  constructor(width: number = 20, height: number = 20, name: string = 'Arena') {
    this.width = width;
    this.height = height;
    this.name = name;
    
    // Initialize empty grid
    this.grid = Array(height).fill(null).map(() => Array(width).fill(0));
    
    // Generate default arena layout
    this.generateDefaultArena();
  }
  
  /**
   * Generate a default arena layout
   */
  private generateDefaultArena(): void {
    // Create border walls
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
          this.grid[y][x] = 1; // Wall
        }
      }
    }
    
    // Add some obstacles for cover (scaled to map size)
    const quarterWidth = Math.floor(this.width / 4);
    const quarterHeight = Math.floor(this.height / 4);
    const threeQuarterWidth = Math.floor(3 * this.width / 4);
    const threeQuarterHeight = Math.floor(3 * this.height / 4);
    
    this.addPillar(quarterWidth, quarterHeight);
    this.addPillar(threeQuarterWidth - 1, quarterHeight);
    this.addPillar(quarterWidth, threeQuarterHeight - 1);
    this.addPillar(threeQuarterWidth - 1, threeQuarterHeight - 1);
    
    // Add some walls for interesting gameplay (scaled to map size)
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    
    this.addWall(centerX - 1, Math.floor(this.height * 0.15), 2, 4, false); // Top vertical wall
    this.addWall(centerX - 1, Math.floor(this.height * 0.65), 2, 4, false); // Bottom vertical wall
    this.addWall(Math.floor(this.width * 0.15), centerY - 1, 4, 2, true); // Left horizontal wall
    this.addWall(Math.floor(this.width * 0.65), centerY - 1, 4, 2, true); // Right horizontal wall
    
    // Set spawn points (scaled to map size, ensuring they're within walkable areas)
    this.spawnPoints = [
      { x: 2.5, y: 2.5 },    // Top-left - matches server spawn point
      { x: this.width - 2.5, y: this.height - 2.5 },  // Bottom-right - matches server spawn point
      { x: this.width / 2, y: this.height / 2 }       // Center
    ];
    
    // Validate and fix spawn points to ensure they're in walkable areas
    this.validateSpawnPoints();
  }
  
  /**
   * Add a pillar (2x2 block) to the map
   */
  private addPillar(x: number, y: number): void {
    if (x + 1 < this.width && y + 1 < this.height) {
      this.grid[y][x] = 1;
      this.grid[y][x + 1] = 1;
      this.grid[y + 1][x] = 1;
      this.grid[y + 1][x + 1] = 1;
    }
  }
  
  /**
   * Add a wall to the map
   */
  private addWall(x: number, y: number, width: number, height: number, horizontal: boolean): void {
    if (horizontal) {
      for (let i = 0; i < width && x + i < this.width; i++) {
        if (y < this.height) {
          this.grid[y][x + i] = 1;
        }
      }
    } else {
      for (let i = 0; i < height && y + i < this.height; i++) {
        if (x < this.width) {
          this.grid[y + i][x] = 1;
        }
      }
    }
  }
  
  /**
   * Get the tile at a specific position
   */
  public getTile(x: number, y: number): number {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) {
      return 1; // Treat out of bounds as walls
    }
    
    return this.grid[gridY][gridX];
  }
  
  /**
   * Set a tile value
   */
  public setTile(x: number, y: number, value: number): void {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    if (gridX >= 0 && gridX < this.width && gridY >= 0 && gridY < this.height) {
      this.grid[gridY][gridX] = value;
    }
  }
  
  /**
   * Check if a position is walkable
   */
  public isWalkable(x: number, y: number): boolean {
    return this.getTile(x, y) === 0;
  }
  
  /**
   * Get the raw grid data
   */
  public getGrid(): number[][] {
    // Return a deep copy to prevent accidental modification
    return this.grid.map(row => [...row]);
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
   * Validate spawn points and move them to walkable areas if necessary
   */
  private validateSpawnPoints(): void {
    const validatedSpawns: Vector2[] = [];
    
    for (const spawn of this.spawnPoints) {
      let validSpawn = { ...spawn };
      
      // Check if spawn point is walkable
      if (!this.isWalkable(spawn.x, spawn.y)) {
        console.warn(`⚠️ Spawn point (${spawn.x}, ${spawn.y}) is not walkable, finding alternative...`);
        
        // Try to find a nearby walkable position
        const nearestWalkable = this.findNearestWalkablePosition(spawn.x, spawn.y);
        
        if (!nearestWalkable) {
          console.error(`❌ Could not find walkable position near (${spawn.x}, ${spawn.y}), using fallback`);
          // Use a guaranteed fallback position in the center of the map
          validSpawn = { x: this.width / 2, y: this.height / 2 };
        } else {
          validSpawn = nearestWalkable;
        }
      }
      
      // Additional boundary check to ensure spawn is well within map bounds
      validSpawn.x = Math.max(1.5, Math.min(this.width - 1.5, validSpawn.x));
      validSpawn.y = Math.max(1.5, Math.min(this.height - 1.5, validSpawn.y));
      
      validatedSpawns.push(validSpawn);
      
      if (validSpawn.x !== spawn.x || validSpawn.y !== spawn.y) {
        console.log(`✅ Adjusted spawn point from (${spawn.x}, ${spawn.y}) to (${validSpawn.x}, ${validSpawn.y})`);
      }
    }
    
    this.spawnPoints = validatedSpawns;
    console.log(`🎯 Validated ${this.spawnPoints.length} spawn points:`, this.spawnPoints);
  }
  
  /**
   * Find the nearest walkable position to a given coordinate
   */
  private findNearestWalkablePosition(targetX: number, targetY: number): Vector2 | null {
    const maxRadius = 5;
    
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) + Math.abs(dy) === radius || radius === 0) {
            const x = targetX + dx;
            const y = targetY + dy;
            
            // Check if position is within bounds and walkable
            if (x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1 && this.isWalkable(x, y)) {
              return { x, y };
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Get a random spawn point
   */
  public getRandomSpawnPoint(): Vector2 {
    const index = Math.floor(Math.random() * this.spawnPoints.length);
    return { ...this.spawnPoints[index] };
  }
  
  /**
   * Load a map from data
   */
  public loadFromData(data: {
    grid: number[][];
    spawnPoints: Vector2[];
    name?: string;
    theme?: 'arena' | 'dungeon' | 'tech';
  }): void {
    this.grid = data.grid.map(row => [...row]);
    this.height = data.grid.length;
    this.width = data.grid[0]?.length || 0;
    this.spawnPoints = data.spawnPoints.map(point => ({ ...point }));
    
    if (data.name) {
      this.name = data.name;
    }
    if (data.theme) {
      this.theme = data.theme;
    }
  }
  
  /**
   * Export map data
   */
  public exportData(): {
    grid: number[][];
    spawnPoints: Vector2[];
    name: string;
    theme: string;
  } {
    return {
      grid: this.grid.map(row => [...row]),
      spawnPoints: this.spawnPoints.map(point => ({ ...point })),
      name: this.name,
      theme: this.theme
    };
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
        
        if (tile === 0) {
          ctx.fillStyle = '#1a202c'; // Empty space
        } else if (tile === 1) {
          ctx.fillStyle = '#64748b'; // Wall
        } else if (tile === 2) {
          ctx.fillStyle = '#ef4444'; // Destructible
        } else {
          ctx.fillStyle = '#3b82f6'; // Special
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
    
    // Draw player position if provided
    if (playerPos) {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(playerPos.x * scale, playerPos.y * scale, scale, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
} 