/**
 * FlexibleMap - Modern Doom-style map system with support for curved geometry
 * Optimized for efficient raycasting and collision detection
 */

import type { Vector2 } from '@dueled/shared';

export interface Ray {
  origin: Vector2;
  direction: Vector2;
}

export interface RayIntersection {
  distance: number;
  point: Vector2;
  normal: Vector2;
  wallType: number;
  textureU: number;
}

export interface CircularObstacle {
  center: Vector2;
  radius: number;
  wallType: number;
  height: [number, number]; // [floor, ceiling]
}

export interface WallSegment {
  start: Vector2;
  end: Vector2;
  wallType: number;
  height: [number, number];
  portal?: boolean; // For doorways/windows
}

export interface Sector {
  id: number;
  floorHeight: number;
  ceilingHeight: number;
  floorTexture: number;
  ceilingTexture: number;
  lightLevel: number;
}

export class FlexibleMap {
  private wallSegments: WallSegment[] = [];
  private circularObstacles: CircularObstacle[] = [];
  private sectors: Sector[] = [];
  private spawnPoints: Vector2[] = [];
  
  // Spatial optimization
  private gridSize: number = 2;
  private spatialGrid: Map<string, (WallSegment | CircularObstacle)[]> = new Map();
  
  constructor(private width: number, private height: number, private name: string = 'Flexible Map') {
    this.generateFlexibleArena();
    this.buildSpatialGrid();
  }
  
  /**
   * Generate a flexible arena with various obstacle types
   */
  private generateFlexibleArena(): void {
    // Create border walls
    this.addWallSegment({ x: 0, y: 0 }, { x: this.width, y: 0 }, 1);
    this.addWallSegment({ x: this.width, y: 0 }, { x: this.width, y: this.height }, 1);
    this.addWallSegment({ x: this.width, y: this.height }, { x: 0, y: this.height }, 1);
    this.addWallSegment({ x: 0, y: this.height }, { x: 0, y: 0 }, 1);
    
    // Add circular obstacles
    this.addCircularObstacle({ x: 8, y: 8 }, 1.2, 2);
    this.addCircularObstacle({ x: 22, y: 8 }, 1.2, 2);
    this.addCircularObstacle({ x: 8, y: 22 }, 1.2, 2);
    this.addCircularObstacle({ x: 22, y: 22 }, 1.2, 2);
    
    // Add some internal walls
    this.addWallSegment({ x: 10, y: 5 }, { x: 10, y: 10 }, 1);
    this.addWallSegment({ x: 20, y: 5 }, { x: 20, y: 10 }, 1);
    this.addWallSegment({ x: 10, y: 20 }, { x: 10, y: 25 }, 1);
    this.addWallSegment({ x: 20, y: 20 }, { x: 20, y: 25 }, 1);
    
    // Set spawn points
    this.spawnPoints = [
      { x: 3, y: 3 },
      { x: 27, y: 3 },
      { x: 3, y: 27 },
      { x: 27, y: 27 },
      { x: 15, y: 15 }
    ];
  }
  
  /**
   * Add a wall segment
   */
  public addWallSegment(start: Vector2, end: Vector2, wallType: number, height: [number, number] = [0, 1]): void {
    this.wallSegments.push({
      start: { ...start },
      end: { ...end },
      wallType,
      height
    });
  }
  
  /**
   * Add a circular obstacle
   */
  public addCircularObstacle(center: Vector2, radius: number, wallType: number, height: [number, number] = [0, 1]): void {
    this.circularObstacles.push({
      center: { ...center },
      radius,
      wallType,
      height
    });
  }
  
  /**
   * Build spatial grid for fast collision queries
   */
  private buildSpatialGrid(): void {
    this.spatialGrid.clear();
    
    // Add wall segments to grid
    for (const wall of this.wallSegments) {
      const cells = this.getGridCells(wall.start, wall.end);
      for (const cell of cells) {
        const key = `${cell.x},${cell.y}`;
        if (!this.spatialGrid.has(key)) {
          this.spatialGrid.set(key, []);
        }
        this.spatialGrid.get(key)!.push(wall);
      }
    }
    
    // Add circular obstacles to grid
    for (const obstacle of this.circularObstacles) {
      const cells = this.getCircleGridCells(obstacle.center, obstacle.radius);
      for (const cell of cells) {
        const key = `${cell.x},${cell.y}`;
        if (!this.spatialGrid.has(key)) {
          this.spatialGrid.set(key, []);
        }
        this.spatialGrid.get(key)!.push(obstacle);
      }
    }
  }
  
  /**
   * Get grid cells that a line segment intersects
   */
  private getGridCells(start: Vector2, end: Vector2): Vector2[] {
    const cells: Vector2[] = [];
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const stepX = start.x < end.x ? 1 : -1;
    const stepY = start.y < end.y ? 1 : -1;
    
    let x = Math.floor(start.x / this.gridSize);
    let y = Math.floor(start.y / this.gridSize);
    const endX = Math.floor(end.x / this.gridSize);
    const endY = Math.floor(end.y / this.gridSize);
    
    let error = dx - dy;
    
    while (true) {
      cells.push({ x, y });
      
      if (x === endX && y === endY) break;
      
      const error2 = error * 2;
      if (error2 > -dy) {
        error -= dy;
        x += stepX;
      }
      if (error2 < dx) {
        error += dx;
        y += stepY;
      }
    }
    
    return cells;
  }
  
  /**
   * Get grid cells that a circle intersects
   */
  private getCircleGridCells(center: Vector2, radius: number): Vector2[] {
    const cells: Vector2[] = [];
    const minX = Math.floor((center.x - radius) / this.gridSize);
    const maxX = Math.floor((center.x + radius) / this.gridSize);
    const minY = Math.floor((center.y - radius) / this.gridSize);
    const maxY = Math.floor((center.y + radius) / this.gridSize);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Check if grid cell intersects circle
        const cellCenter = {
          x: (x + 0.5) * this.gridSize,
          y: (y + 0.5) * this.gridSize
        };
        const distance = Math.sqrt(
          Math.pow(cellCenter.x - center.x, 2) + 
          Math.pow(cellCenter.y - center.y, 2)
        );
        
        if (distance <= radius + this.gridSize * 0.7) { // Add some margin
          cells.push({ x, y });
        }
      }
    }
    
    return cells;
  }
  
  /**
   * Cast a ray and find the nearest intersection
   */
  public castRay(ray: Ray): RayIntersection | null {
    let nearestIntersection: RayIntersection | null = null;
    let nearestDistance = Infinity;
    
    // Get relevant grid cells for the ray
    const cells = this.getRayCells(ray);
    const checkedObjects = new Set<WallSegment | CircularObstacle>();
    
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      const objects = this.spatialGrid.get(key);
      
      if (!objects) continue;
      
      for (const obj of objects) {
        if (checkedObjects.has(obj)) continue;
        checkedObjects.add(obj);
        
        let intersection: RayIntersection | null = null;
        
        if ('start' in obj) {
          // Wall segment
          intersection = this.rayLineIntersection(ray, obj);
        } else {
          // Circular obstacle
          intersection = this.rayCircleIntersection(ray, obj);
        }
        
        if (intersection && intersection.distance < nearestDistance) {
          nearestDistance = intersection.distance;
          nearestIntersection = intersection;
        }
      }
    }
    
    return nearestIntersection;
  }
  
  /**
   * Get grid cells that a ray passes through
   */
  private getRayCells(ray: Ray, maxDistance: number = 30): Vector2[] {
    const cells: Vector2[] = [];
    const endPoint = {
      x: ray.origin.x + ray.direction.x * maxDistance,
      y: ray.origin.y + ray.direction.y * maxDistance
    };
    
    return this.getGridCells(ray.origin, endPoint);
  }
  
  /**
   * Calculate ray-line intersection
   */
  private rayLineIntersection(ray: Ray, wall: WallSegment): RayIntersection | null {
    const dx1 = wall.end.x - wall.start.x;
    const dy1 = wall.end.y - wall.start.y;
    const dx2 = ray.direction.x;
    const dy2 = ray.direction.y;
    const dx3 = ray.origin.x - wall.start.x;
    const dy3 = ray.origin.y - wall.start.y;
    
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) < 1e-8) return null; // Parallel lines
    
    const t1 = (dx2 * dy3 - dy2 * dx3) / cross;
    const t2 = (dx1 * dy3 - dy1 * dx3) / cross;
    
    if (t1 >= 0 && t1 <= 1 && t2 >= 0) {
      const point = {
        x: wall.start.x + t1 * dx1,
        y: wall.start.y + t1 * dy1
      };
      
      const distance = t2;
      
      // Calculate normal (perpendicular to wall, pointing toward ray origin)
      const normal = {
        x: -dy1,
        y: dx1
      };
      const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
      normal.x /= length;
      normal.y /= length;
      
      // Ensure normal points toward ray origin
      const toOrigin = {
        x: ray.origin.x - point.x,
        y: ray.origin.y - point.y
      };
      if (normal.x * toOrigin.x + normal.y * toOrigin.y < 0) {
        normal.x = -normal.x;
        normal.y = -normal.y;
      }
      
      return {
        distance,
        point,
        normal,
        wallType: wall.wallType,
        textureU: t1
      };
    }
    
    return null;
  }
  
  /**
   * Calculate ray-circle intersection
   */
  private rayCircleIntersection(ray: Ray, obstacle: CircularObstacle): RayIntersection | null {
    const dx = ray.origin.x - obstacle.center.x;
    const dy = ray.origin.y - obstacle.center.y;
    
    const a = ray.direction.x * ray.direction.x + ray.direction.y * ray.direction.y;
    const b = 2 * (dx * ray.direction.x + dy * ray.direction.y);
    const c = dx * dx + dy * dy - obstacle.radius * obstacle.radius;
    
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (t <= 0) return null;
    
    const point = {
      x: ray.origin.x + t * ray.direction.x,
      y: ray.origin.y + t * ray.direction.y
    };
    
    // Calculate normal (from circle center to intersection point)
    const normal = {
      x: point.x - obstacle.center.x,
      y: point.y - obstacle.center.y
    };
    const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
    normal.x /= length;
    normal.y /= length;
    
    // Calculate texture U coordinate based on angle
    const angle = Math.atan2(normal.y, normal.x);
    const textureU = (angle + Math.PI) / (2 * Math.PI);
    
    return {
      distance: t,
      point,
      normal,
      wallType: obstacle.wallType,
      textureU
    };
  }
  
  /**
   * Check if a position is walkable
   */
  public isWalkable(posX: number | Vector2, posY?: number, radius: number = 0.3): boolean {
    // Handle both signatures: (x, y) and (position)
    let position: Vector2;
    if (typeof posX === 'number' && typeof posY === 'number') {
      position = { x: posX, y: posY };
    } else if (typeof posX === 'object') {
      position = posX;
      if (typeof posY === 'number') {
        radius = posY; // Second param is radius when first is Vector2
      }
    } else {
      return false;
    }
    
    // Check bounds
    if (position.x < 0 || position.x >= this.width || position.y < 0 || position.y >= this.height) {
      return false;
    }
    
    // Check against circular obstacles
    for (const obstacle of this.circularObstacles) {
      const distance = Math.sqrt(
        Math.pow(position.x - obstacle.center.x, 2) + 
        Math.pow(position.y - obstacle.center.y, 2)
      );
      if (distance < obstacle.radius + radius) {
        return false;
      }
    }
    
    // Check against wall segments
    for (const wall of this.wallSegments) {
      if (this.pointToLineDistance(position, wall) < radius) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Calculate distance from point to line segment
   */
  private pointToLineDistance(point: Vector2, wall: WallSegment): number {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
      // Degenerate line segment
      return Math.sqrt(
        Math.pow(point.x - wall.start.x, 2) + 
        Math.pow(point.y - wall.start.y, 2)
      );
    }
    
    // Calculate projection parameter
    const t = Math.max(0, Math.min(1, 
      ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / (length * length)
    ));
    
    // Calculate closest point on line segment
    const closestX = wall.start.x + t * dx;
    const closestY = wall.start.y + t * dy;
    
    // Return distance
    return Math.sqrt(
      Math.pow(point.x - closestX, 2) + 
      Math.pow(point.y - closestY, 2)
    );
  }
  
  /**
   * Get simplified grid for legacy compatibility
   */
  public getGrid(): number[][] {
    const grid: number[][] = Array(this.height).fill(null).map(() => Array(this.width).fill(0));
    
    // Rasterize walls
    for (const wall of this.wallSegments) {
      this.rasterizeLine(grid, wall.start, wall.end, 1);
    }
    
    // Rasterize circular obstacles
    for (const obstacle of this.circularObstacles) {
      this.rasterizeCircle(grid, obstacle.center, obstacle.radius, 1);
    }
    
    return grid;
  }
  
  /**
   * Rasterize a line into the grid
   */
  private rasterizeLine(grid: number[][], start: Vector2, end: Vector2, value: number): void {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const stepX = start.x < end.x ? 1 : -1;
    const stepY = start.y < end.y ? 1 : -1;
    
    let x = Math.floor(start.x);
    let y = Math.floor(start.y);
    const endX = Math.floor(end.x);
    const endY = Math.floor(end.y);
    
    let error = dx - dy;
    
    while (true) {
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        grid[y][x] = value;
      }
      
      if (x === endX && y === endY) break;
      
      const error2 = error * 2;
      if (error2 > -dy) {
        error -= dy;
        x += stepX;
      }
      if (error2 < dx) {
        error += dx;
        y += stepY;
      }
    }
  }
  
  /**
   * Rasterize a circle into the grid
   */
  private rasterizeCircle(grid: number[][], center: Vector2, radius: number, value: number): void {
    const minX = Math.max(0, Math.floor(center.x - radius));
    const maxX = Math.min(this.width - 1, Math.floor(center.x + radius));
    const minY = Math.max(0, Math.floor(center.y - radius));
    const maxY = Math.min(this.height - 1, Math.floor(center.y + radius));
    
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.sqrt(
          Math.pow(x + 0.5 - center.x, 2) + 
          Math.pow(y + 0.5 - center.y, 2)
        );
        if (distance <= radius) {
          grid[y][x] = value;
        }
      }
    }
  }
  
  /**
   * Get tile at position (for compatibility)
   */
  public getTile(x: number, y: number): any {
    const grid = this.getGrid();
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) {
      return { type: 1 }; // Wall
    }
    
    return { type: grid[gridY][gridX] };
  }
  
  /**
   * Get spawn points
   */
  public getSpawnPoints(): Vector2[] {
    return [...this.spawnPoints];
  }
  
  /**
   * Get random spawn point
   */
  public getRandomSpawnPoint(): Vector2 {
    const index = Math.floor(Math.random() * this.spawnPoints.length);
    return { ...this.spawnPoints[index] };
  }
  
  /**
   * Get map dimensions
   */
  public getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
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
    
    // Fill background
    ctx.fillStyle = '#1a202c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw wall segments
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    for (const wall of this.wallSegments) {
      ctx.beginPath();
      ctx.moveTo(wall.start.x * scale, wall.start.y * scale);
      ctx.lineTo(wall.end.x * scale, wall.end.y * scale);
      ctx.stroke();
    }
    
    // Draw circular obstacles
    ctx.fillStyle = '#3b82f6';
    for (const obstacle of this.circularObstacles) {
      ctx.beginPath();
      ctx.arc(
        obstacle.center.x * scale, 
        obstacle.center.y * scale, 
        obstacle.radius * scale, 
        0, 
        Math.PI * 2
      );
      ctx.fill();
    }
    
    // Draw spawn points
    ctx.fillStyle = '#fbbf24';
    for (const spawn of this.spawnPoints) {
      ctx.beginPath();
      ctx.arc(spawn.x * scale, spawn.y * scale, scale * 0.8, 0, Math.PI * 2);
      ctx.fill();
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