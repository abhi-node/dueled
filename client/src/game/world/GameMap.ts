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
    
    // Add some obstacles for cover
    this.addPillar(5, 5);
    this.addPillar(14, 5);
    this.addPillar(5, 14);
    this.addPillar(14, 14);
    
    // Add some walls for interesting gameplay
    this.addWall(9, 3, 2, 4, false); // Vertical wall
    this.addWall(9, 13, 2, 4, false); // Vertical wall
    this.addWall(3, 9, 4, 2, true); // Horizontal wall
    this.addWall(13, 9, 4, 2, true); // Horizontal wall
    
    // Set spawn points
    this.spawnPoints = [
      { x: 2.5, y: 2.5 },    // Top-left
      { x: 17.5, y: 2.5 },   // Top-right
      { x: 2.5, y: 17.5 },   // Bottom-left
      { x: 17.5, y: 17.5 },  // Bottom-right
      { x: 10, y: 10 }       // Center
    ];
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