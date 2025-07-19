/**
 * CanvasRenderer - HTML5 Canvas raycaster with sprite/projectile support
 * 
 * Replaces WebGL SimpleRenderer with pure Canvas 2D implementation
 * Features: CPU raycasting, sprite rendering, projectile support
 */

export interface CanvasPlayerState {
  id: string;
  x: number;
  y: number;
  angle: number;
  classType: 'archer' | 'berserker';
  health: number;
  maxHealth: number;
  isAlive: boolean;
}

export interface CanvasProjectile {
  id: string;
  x: number;
  y: number;
  angle: number;
  type: 'arrow' | 'fireball' | 'bomb';
  scale: number;
}

export interface CanvasMapData {
  walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  size: { x: number; y: number };
  spawnPoints: Array<{ position: { x: number; y: number }; rotation: number }>;
}

/**
 * CanvasRenderer - CPU raycasting with Canvas 2D
 */
export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  private mapGrid: Uint8Array;
  private mapSize: [number, number] = [32, 32];
  
  private localPlayer: CanvasPlayerState | null = null;
  private localPlayerId: string = '';
  private allPlayers: Map<string, CanvasPlayerState> = new Map();
  private projectiles: Map<string, CanvasProjectile> = new Map();
  
  private renderWidth: number;
  private renderHeight: number;
  private lastDebugTime: number = 0;
  
  // Raycasting parameters
  private readonly FOV = Math.PI / 3; // 60 degrees field of view
  private readonly MAX_RENDER_DISTANCE = 20;
  
  // OPTIMIZED: Fewer rays for better performance (dev branch optimization)
  private numRays: number;
  private rayWidth: number; // Width of each ray strip
  
  // OPTIMIZED: Removed pixel buffers - use direct canvas drawing
  // private imageData: ImageData | null = null;
  // private pixelBuffer: Uint32Array | null = null;
  // private columnBuffer: Uint32Array;
  // private depthBuffer: Float32Array;
  // private dirtyColumns: boolean[];
  
  // Sprite bucket sorting
  private readonly DISTANCE_BUCKETS = 20; // 0-20 distance buckets
  private spriteBuckets: Array<Array<{
    x: number;
    y: number;
    distance: number;
    type: 'player' | 'projectile';
    data: CanvasPlayerState | CanvasProjectile;
  }>> = [];
  
  // OPTIMIZED: Removed complex dirty tracking - simplified rendering
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true // Performance hint
    });
    
    if (!ctx) {
      throw new Error('Canvas 2D context not supported');
    }
    
    this.ctx = ctx;
    this.renderWidth = canvas.width;
    this.renderHeight = canvas.height;
    
    // OPTIMIZED: Calculate ray casting parameters - cast HALF as many rays (dev branch optimization)
    this.numRays = Math.floor(this.renderWidth / 2); // Cast half as many rays
    this.rayWidth = this.renderWidth / this.numRays; // Each ray covers multiple pixels
    
    // Initialize sprite buckets
    for (let i = 0; i < this.DISTANCE_BUCKETS; i++) {
      this.spriteBuckets[i] = [];
    }
    
    // OPTIMIZED: Direct canvas rendering - no pixel manipulation
    this.ctx.imageSmoothingEnabled = false; // Pixelated scaling for retro look
    
    // Initialize with default map
    this.mapGrid = new Uint8Array(this.mapSize[0] * this.mapSize[1]);
    this.createDefaultMap();
    
    console.log('🎨 CanvasRenderer initialized with dev branch optimizations:', {
      canvas: `${canvas.width}x${canvas.height}`,
      numRays: this.numRays,
      rayWidth: this.rayWidth,
      mapSize: this.mapSize,
      hasContext: !!this.ctx
    });
  }
  
  /**
   * Initialize renderer (async for compatibility with WebGL version)
   */
  async initialize(): Promise<void> {
    // Canvas doesn't need async initialization, but keeping interface compatible
    console.log('✅ CanvasRenderer initialized successfully');
  }
  
  /**
   * Create default test map
   */
  private createDefaultMap(): void {
    const [width, height] = this.mapSize;
    this.mapGrid.fill(0);
    
    // Create simple test map
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        // Border walls
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          this.mapGrid[index] = 1;
        }
        // Some inner walls for testing
        else if ((x === Math.floor(width / 2) && (y < height / 4 || y > 3 * height / 4)) ||
                 (y === Math.floor(height / 2) && (x < width / 4 || x > 3 * width / 4))) {
          this.mapGrid[index] = 1;
        }
      }
    }
    
    console.log(`✅ Default map created: ${width}x${height} with ${this.mapGrid.filter(x => x > 0).length} wall tiles`);
  }
  
  /**
   * Update map from server data
   */
  updateMapFromServer(mapData: CanvasMapData): void {
    const gridWidth = Math.floor(mapData.size.x);
    const gridHeight = Math.floor(mapData.size.y);
    this.mapSize = [gridWidth, gridHeight];
    this.mapGrid = new Uint8Array(gridWidth * gridHeight);
    
    // Clear grid
    this.mapGrid.fill(0);
    
    // Rasterize walls using simple line algorithm
    for (const wall of mapData.walls) {
      this.rasterizeLine(
        Math.floor(wall.x1), Math.floor(wall.y1),
        Math.floor(wall.x2), Math.floor(wall.y2)
      );
    }
    
    console.log(`📍 Map updated from server: ${gridWidth}x${gridHeight}, walls: ${this.mapGrid.filter(x => x > 0).length}`);
  }
  
  /**
   * Simple line rasterization using Bresenham's algorithm
   */
  private rasterizeLine(x0: number, y0: number, x1: number, y1: number): void {
    const [width, height] = this.mapSize;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
      if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
        this.mapGrid[y0 * width + x0] = 1;
      }
      
      if (x0 === x1 && y0 === y1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  
  
  /**
   * FIXED: Proper ray marching algorithm
   * Uses smaller step size for more accurate wall detection
   */
  private castRayFast(originX: number, originY: number, dirX: number, dirY: number): {
    hit: boolean;
    distance: number;
    wallType: number;
    side: 'vertical' | 'horizontal';
  } {
    const [mapWidth, mapHeight] = this.mapSize;
    
    // Current position
    let x = originX;
    let y = originY;
    
    // FIXED: Smaller step size for better accuracy
    const stepSize = 0.05;
    let distance = 0;
    
    // Ray marching with proper collision detection
    while (distance < this.MAX_RENDER_DISTANCE) {
      // Move ray forward
      x += dirX * stepSize;
      y += dirY * stepSize;
      distance += stepSize;
      
      // Get current map tile
      const mapX = Math.floor(x);
      const mapY = Math.floor(y);
      
      // Check map boundaries - treat as walls
      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
        return {
          hit: true,
          distance,
          wallType: 1,
          side: 'vertical'
        };
      }
      
      // Check for wall collision
      const tileIndex = mapY * mapWidth + mapX;
      if (tileIndex >= 0 && tileIndex < this.mapGrid.length && this.mapGrid[tileIndex] > 0) {
        // Determine which side of the wall we hit for shading
        const tileX = x - mapX;
        const tileY = y - mapY;
        
        let side: 'vertical' | 'horizontal';
        if (Math.abs(tileX - 0.5) > Math.abs(tileY - 0.5)) {
          side = 'vertical';
        } else {
          side = 'horizontal';
        }
        
        return {
          hit: true,
          distance,
          wallType: this.mapGrid[tileIndex],
          side
        };
      }
    }
    
    // No hit within range
    return {
      hit: false,
      distance: this.MAX_RENDER_DISTANCE,
      wallType: 0,
      side: 'vertical'
    };
  }
  
  /**
   * OPTIMIZED: Direct canvas raycasting (dev branch optimization)
   * Uses fewer rays and direct canvas drawing for much better performance
   */
  private renderRaycast(): void {
    if (!this.localPlayer) return;
    
    const player = this.localPlayer;
    
    // Ensure player is within map bounds
    const [mapWidth, mapHeight] = this.mapSize;
    if (player.x < 0 || player.x >= mapWidth || player.y < 0 || player.y >= mapHeight) {
      // Player is outside map, position them in center
      player.x = mapWidth / 2;
      player.y = mapHeight / 2;
    }
    
    const halfFOV = this.FOV / 2;
    const startAngle = player.angle - halfFOV;
    const angleStep = this.FOV / this.numRays;
    
    // OPTIMIZED: Render floor and ceiling first with solid colors
    this.renderFloorAndCeiling();
    
    // FIXED: Proper raycasting with correct ray distribution
    for (let i = 0; i < this.numRays; i++) {
      const rayAngle = startAngle + i * angleStep;
      const rayDirX = Math.cos(rayAngle);
      const rayDirY = Math.sin(rayAngle);
      
      // Cast ray and get hit information
      const ray = this.castRayFast(player.x, player.y, rayDirX, rayDirY);
      
      if (ray.hit) {
        // Fix distance calculation to prevent fish-eye effect
        const correctedDistance = ray.distance * Math.cos(rayAngle - player.angle);
        
        // Calculate wall height based on distance
        const wallHeight = Math.min(this.renderHeight, (this.renderHeight * 0.8) / Math.max(correctedDistance, 0.1));
        const wallTop = (this.renderHeight - wallHeight) / 2;
        const wallBottom = wallTop + wallHeight;
        
        // Determine wall color based on type and side
        let color: string;
        if (ray.wallType === 1) {
          color = ray.side === 'vertical' ? '#8899DD' : '#6677BB';
        } else {
          color = ray.side === 'vertical' ? '#7788CC' : '#5566AA';
        }
        
        // Apply distance-based shading (fog)
        const fogFactor = Math.max(0.2, 1.0 - (correctedDistance / this.MAX_RENDER_DISTANCE));
        const foggedColor = this.applySimpleFog(color, fogFactor);
        
        // Draw the wall column
        this.ctx.fillStyle = foggedColor;
        const columnX = i * this.rayWidth;
        this.ctx.fillRect(
          Math.floor(columnX), 
          Math.floor(Math.max(0, wallTop)), 
          Math.ceil(this.rayWidth), 
          Math.ceil(Math.max(1, wallBottom - wallTop))
        );
      }
    }
  }
  
  /**
   * OPTIMIZED: Render floor and ceiling with solid colors (dev branch optimization)
   */
  private renderFloorAndCeiling(): void {
    // OPTIMIZED: Simple solid colors instead of complex texturing
    // Ceiling
    this.ctx.fillStyle = '#333344';
    this.ctx.fillRect(0, 0, this.renderWidth, this.renderHeight / 2);
    
    // Floor  
    this.ctx.fillStyle = '#666680';
    this.ctx.fillRect(0, this.renderHeight / 2, this.renderWidth, this.renderHeight / 2);
  }
  
  /**
   * OPTIMIZED: Simple fog application (dev branch optimization)
   */
  private applySimpleFog(color: string, fogFactor: number): string {
    // Simple linear interpolation for fog
    const opacity = Math.max(0.3, fogFactor);
    
    // Extract RGB values and apply fog
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);  
      const b = parseInt(color.slice(5, 7), 16);
      
      const foggedR = Math.floor(r * opacity);
      const foggedG = Math.floor(g * opacity);
      const foggedB = Math.floor(b * opacity);
      
      return `rgb(${foggedR}, ${foggedG}, ${foggedB})`;
    }
    
    return color;
  }
  
  // OPTIMIZED: Removed old complex sprite rendering methods
  // Now using renderSpritesSimple() for better performance
  
  
  /**
   * Set local player for camera
   */
  setLocalPlayer(playerId: string): void {
    this.localPlayerId = playerId;
    const player = this.allPlayers.get(playerId);
    if (player) {
      this.localPlayer = player;
      // OPTIMIZED: Reduced console logging
    }
    // OPTIMIZED: Removed waiting message (reduces log spam)
  }
  
  /**
   * Update player state
   */
  updatePlayer(player: CanvasPlayerState): void {
    this.allPlayers.set(player.id, { ...player });
    
    // Check if this is our local player
    if (this.localPlayerId === player.id) {
      this.localPlayer = { ...player };
      // OPTIMIZED: Removed frequent console logs for better performance
    }
  }
  
  /**
   * Remove player
   */
  removePlayer(playerId: string): void {
    this.allPlayers.delete(playerId);
    if (this.localPlayer && this.localPlayer.id === playerId) {
      this.localPlayer = null;
    }
  }
  
  /**
   * Update projectile
   */
  updateProjectile(projectile: CanvasProjectile): void {
    this.projectiles.set(projectile.id, { ...projectile });
  }
  
  /**
   * Remove projectile
   */
  removeProjectile(projectileId: string): void {
    this.projectiles.delete(projectileId);
  }
  
  /**
   * OPTIMIZED: Render frame with direct canvas drawing (dev branch optimization)
   */
  render(): void {
    if (!this.localPlayer) {
      // Simple fallback when no player data
      this.ctx.fillStyle = '#2a2a4d';
      this.ctx.fillRect(0, 0, this.renderWidth, this.renderHeight);
      
      // OPTIMIZED: Removed debug display for better performance
      return;
    }
    
    // OPTIMIZED: Removed debug logging for better performance
    
    // OPTIMIZED: Always render (no complex dirty checking)
    this.renderRaycast();
    
    // DISABLED: Focus on map rendering only
    // if (this.allPlayers.size > 1 || this.projectiles.size > 0) {
    //   this.renderSpritesSimple();
    // }
    
    // OPTIMIZED: Reduced debug frequency and removed from hot path
    const debugTime = Math.floor(performance.now() / 10000); // Every 10 seconds instead of 5
    if (this.lastDebugTime !== debugTime && this.allPlayers.size > 0) {
      this.lastDebugTime = debugTime;
      // Only log when there's actually content to render
      console.log('🎨 CanvasRenderer:', {
        res: `${this.renderWidth}x${this.renderHeight}`,
        rays: this.numRays,
        entities: this.allPlayers.size + this.projectiles.size
      });
    }
  }
  
  /**
   * OPTIMIZED: Simple sprite rendering (dev branch optimization)
   */
  private renderSpritesSimple(): void {
    if (!this.localPlayer) return;
    
    const player = this.localPlayer;
    
    // OPTIMIZED: Simple sprite rendering with basic shapes
    this.ctx.save();
    
    // Render other players as simple colored rectangles
    for (const [id, otherPlayer] of this.allPlayers) {
      if (id !== player.id && otherPlayer.isAlive) {
        const dx = otherPlayer.x - player.x;
        const dy = otherPlayer.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= this.MAX_RENDER_DISTANCE) {
          // Simple projection
          const angle = Math.atan2(dy, dx) - player.angle;
          const screenX = this.renderWidth / 2 + Math.sin(angle) * (this.renderWidth / 4);
          const spriteSize = Math.max(5, 20 / distance);
          
          // Draw simple sprite
          this.ctx.fillStyle = otherPlayer.classType === 'archer' ? '#4A9EFF' : '#FF4A4A';
          this.ctx.fillRect(screenX - spriteSize/2, this.renderHeight/2 - spriteSize/2, spriteSize, spriteSize);
        }
      }
    }
    
    // Render projectiles as simple dots
    for (const projectile of this.projectiles.values()) {
      const dx = projectile.x - player.x;
      const dy = projectile.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= this.MAX_RENDER_DISTANCE) {
        const angle = Math.atan2(dy, dx) - player.angle;
        const screenX = this.renderWidth / 2 + Math.sin(angle) * (this.renderWidth / 4);
        const dotSize = Math.max(2, 10 / distance);
        
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillRect(screenX - dotSize/2, this.renderHeight/2 - dotSize/2, dotSize, dotSize);
      }
    }
    
    this.ctx.restore();
  }
  
  /**
   * OPTIMIZED: Resize renderer (dev branch optimization)
   */
  resize(width: number, height: number): void {
    this.renderWidth = width;
    this.renderHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    
    // OPTIMIZED: Recalculate ray parameters for new size
    this.numRays = Math.floor(this.renderWidth / 2); // Cast half as many rays
    this.rayWidth = this.renderWidth / this.numRays; // Each ray covers multiple pixels
    
    console.log(`🔧 CanvasRenderer resized to ${width}x${height} (${this.numRays} rays, ${this.rayWidth.toFixed(1)}px per ray)`);
  }
  
  /**
   * Get debug info
   */
  getDebugInfo(): any {
    return {
      playerCount: this.allPlayers.size,
      projectileCount: this.projectiles.size,
      localPlayer: this.localPlayer?.id || 'none',
      mapSize: this.mapSize,
      resolution: `${this.renderWidth}x${this.renderHeight}`
    };
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.allPlayers.clear();
    this.projectiles.clear();
    this.localPlayer = null;
    
    console.log('🧹 CanvasRenderer destroyed');
  }
}