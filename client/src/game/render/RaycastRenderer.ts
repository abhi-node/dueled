/**
 * RaycastRenderer - Efficient 3D raycasting engine for 2D game world
 * 
 * Converts 2D game state into 3D first-person view using raycasting.
 * Optimized for 60 FPS performance with minimal allocations.
 */

import type { 
  ClientGameState, 
  ClientPlayerState, 
  ClientProjectileState,
  WallDefinition,
  Position 
} from '../types/GameTypes.js';
import type { ClientGameStateManager } from '../core/GameState.js';
import { RENDER_CONSTANTS } from '../types/GameConstants.js';
import { distance, angleFromTo, normalizeAngle, Vector2 } from '../utils/MathUtils.js';
import type { HitscanFiredEvent } from '@dueled/shared';

interface RaycastHit {
  distance: number;
  wallHeight: number;
  textureX: number;
  wallId: string;
  isVertical: boolean;
}

interface SpriteRender {
  position: Position;
  distance: number;
  angle: number;
  size: number;
  color: string;
  type: 'player' | 'projectile';
  id: string;
}

interface HitscanTracer {
  id: string;
  startPos: Vector2;
  endPos: Vector2;
  createdAt: number;
  duration: number;
}

export class RaycastRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameStateManager: ClientGameStateManager | null = null;
  
  // Simple hitscan tracers
  private activeTracers: Map<string, HitscanTracer> = new Map();
  private tracerIdCounter = 0;
  
  // Rendering properties
  private width: number = 0;
  private height: number = 0;
  private halfHeight: number = 0;
  private fov = RENDER_CONSTANTS.FOV;
  private rayCount = RENDER_CONSTANTS.RAY_COUNT;
  private renderDistance = RENDER_CONSTANTS.RENDER_DISTANCE;
  
  // Pre-calculated values for performance
  private rayAngles: number[] = [];
  private wallHeights: number[] = [];
  
  // Color scheme
  private colors = {
    ceiling: '#2a2a3a',
    floor: '#1a1a2a',
    wall: '#4a4a5a',
    wallDark: '#3a3a4a',
    player: '#ff4444',
    projectile: '#ffaa44',
    background: '#0a0a1a'
  };
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D rendering context');
    }
    this.ctx = ctx;
    
    // Initialize dimensions
    this.updateDimensions();
    
    // Pre-calculate values
    this.precalculateValues();
    
    console.log('RaycastRenderer initialized', {
      width: this.width,
      height: this.height,
      rayCount: this.rayCount,
      fov: this.fov
    });
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  private updateDimensions(): void {
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.halfHeight = this.height / 2;
    this.rayCount = Math.min(this.width, RENDER_CONSTANTS.RAY_COUNT) as typeof RENDER_CONSTANTS.RAY_COUNT;
  }
  
  private precalculateValues(): void {
    // Pre-calculate ray angles relative to player's forward direction
    this.rayAngles = [];
    const halfFov = this.fov / 2;
    const angleStep = this.fov / this.rayCount;
    
    for (let i = 0; i < this.rayCount; i++) {
      // Calculate angle offset from center ray (-halfFov to +halfFov)
      const angle = -halfFov + i * angleStep;
      this.rayAngles[i] = angle;
    }
    
    // Initialize wall height storage array
    this.wallHeights = new Array(this.rayCount);
  }
  
  // ============================================================================
  // MAIN RENDER LOOP
  // ============================================================================
  
  /**
   * Main render function - called every frame
   */
  render(gameState: ClientGameState): void {
    const localPlayer = gameState.players.get(gameState.localPlayerId);
    if (!localPlayer) {
      this.renderNoPlayer();
      return;
    }
    
    // Update dimensions if canvas size changed
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.updateDimensions();
      this.precalculateValues();
    }
    
    // Clear screen
    this.clearScreen();
    
    // Render 3D world
    this.renderWalls(localPlayer, gameState.mapData.walls);
    this.renderSprites(localPlayer, gameState);
    
    // Render hitscan tracers directly in the ray tracer
    this.renderHitscanTracers(localPlayer);
    
    // Apply post-processing effects
    this.applyDistanceFog();
  }
  
  // ============================================================================
  // WALL RENDERING
  // ============================================================================
  
  private renderWalls(player: ClientPlayerState, walls: WallDefinition[]): void {
    const playerPos = player.position;
    const playerAngle = player.angle;
    
    // Ensure playerAngle is normalized to prevent precision issues
    const normalizedPlayerAngle = this.normalizeAngle(playerAngle);
    
    // Cast rays for each screen column
    for (let rayIndex = 0; rayIndex < this.rayCount; rayIndex++) {
      // Calculate ray angle with proper normalization
      const relativeAngle = this.rayAngles[rayIndex];
      const rayAngle = this.normalizeAngle(normalizedPlayerAngle + relativeAngle);
      
      const hit = this.castRay(playerPos, rayAngle, walls);
      
      if (hit) {
        // Calculate wall height with precise fisheye correction
        // Use the relative angle for fisheye correction, not the absolute ray angle
        const fisheyeCorrection = Math.cos(relativeAngle);
        const correctedDistance = hit.distance * Math.abs(fisheyeCorrection);
        
        // Apply perspective scaling to make world feel more compact/room-like
        const scaledDistance = correctedDistance * RENDER_CONSTANTS.PERSPECTIVE_SCALE;
        
        // Ensure minimum distance to prevent division by zero or extreme values
        const safeDistance = Math.max(scaledDistance, 0.01);
        
        // Scale wall height to make it feel more room-like and less miniature
        // Use configurable scale factor for consistent room proportions
        const wallHeight = (this.height * RENDER_CONSTANTS.WALL_HEIGHT_SCALE) / safeDistance;
        
        this.wallHeights[rayIndex] = wallHeight;
        this.renderWallSlice(rayIndex, wallHeight, hit);
      } else {
        this.wallHeights[rayIndex] = 0;
        this.renderSkySlice(rayIndex);
      }
    }
  }

  /**
   * Normalize angle to 0-2π range for consistent calculations
   */
  private normalizeAngle(angle: number): number {
    while (angle < 0) angle += Math.PI * 2;
    while (angle >= Math.PI * 2) angle -= Math.PI * 2;
    return angle;
  }
  
  private castRay(start: Position, angle: number, walls: WallDefinition[]): RaycastHit | null {
    // Calculate ray direction with high precision
    const rayDirX = Math.cos(angle);
    const rayDirY = Math.sin(angle);
    
    const rayEnd = {
      x: start.x + rayDirX * this.renderDistance,
      y: start.y + rayDirY * this.renderDistance
    };
    
    let closestHit: RaycastHit | null = null;
    let minDistance: number = this.renderDistance;
    
    // Check intersection with all walls
    for (const wall of walls) {
      if (!wall.solid) continue;
      
      const intersection = this.getLineIntersection(start, rayEnd, wall.start, wall.end);
      if (intersection) {
        // Calculate distance with higher precision
        const deltaX = intersection.x - start.x;
        const deltaY = intersection.y - start.y;
        const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Only consider hits within render distance and closer than previous hits
        if (dist > 0.001 && dist < minDistance) {
          minDistance = dist;
          
          // Calculate texture coordinate with proper bounds checking
          const wallVector = {
            x: wall.end.x - wall.start.x,
            y: wall.end.y - wall.start.y
          };
          const wallLength = Math.sqrt(wallVector.x * wallVector.x + wallVector.y * wallVector.y);
          
          if (wallLength > 0.001) {
            const hitVector = {
              x: intersection.x - wall.start.x,
              y: intersection.y - wall.start.y
            };
            const hitDistanceAlongWall = Math.sqrt(hitVector.x * hitVector.x + hitVector.y * hitVector.y);
            const textureX = Math.max(0, Math.min(1, (hitDistanceAlongWall / wallLength) % 1));
            
            // Determine wall orientation more reliably
            const isVertical = Math.abs(wallVector.x) > Math.abs(wallVector.y);
            
            closestHit = {
              distance: dist,
              wallHeight: 0, // Calculated in renderWalls with fisheye correction
              textureX,
              wallId: wall.id,
              isVertical
            };
          }
        }
      }
    }
    
    return closestHit;
  }
  
  private renderWallSlice(rayIndex: number, wallHeight: number, hit: RaycastHit): void {
    // Calculate screen coordinates with pixel-perfect precision
    const x = Math.floor((rayIndex / this.rayCount) * this.width);
    const sliceWidth = Math.ceil(this.width / this.rayCount);
    
    // Clamp wall height to prevent extreme values
    const clampedWallHeight = Math.min(wallHeight, this.height * 2);
    
    // Calculate wall bounds with proper centering
    const wallTop = Math.floor(this.halfHeight - clampedWallHeight / 2);
    const wallBottom = Math.ceil(this.halfHeight + clampedWallHeight / 2);
    
    // Ensure bounds are within screen
    const screenWallTop = Math.max(0, wallTop);
    const screenWallBottom = Math.min(this.height, wallBottom);
    const wallRenderHeight = Math.max(0, screenWallBottom - screenWallTop);
    
    // Choose wall color based on orientation for depth perception
    const baseColor = hit.isVertical ? this.colors.wall : this.colors.wallDark;
    
    // Apply smooth distance-based shading with better curve, accounting for perspective scale
    const effectiveDistance = hit.distance * RENDER_CONSTANTS.PERSPECTIVE_SCALE;
    const normalizedDistance = Math.min(effectiveDistance / this.renderDistance, 1);
    const shadingFactor = Math.max(0.1, 1 - normalizedDistance * normalizedDistance); // Quadratic falloff
    const wallColor = this.applyShading(baseColor, shadingFactor);
    
    // Render ceiling (above wall)
    if (screenWallTop > 0) {
      this.ctx.fillStyle = this.colors.ceiling;
      this.ctx.fillRect(x, 0, sliceWidth, screenWallTop);
    }
    
    // Render wall (main section)
    if (wallRenderHeight > 0) {
      this.ctx.fillStyle = wallColor;
      this.ctx.fillRect(x, screenWallTop, sliceWidth, wallRenderHeight);
    }
    
    // Render floor (below wall)
    if (screenWallBottom < this.height) {
      this.ctx.fillStyle = this.colors.floor;
      this.ctx.fillRect(x, screenWallBottom, sliceWidth, this.height - screenWallBottom);
    }
  }
  
  private renderSkySlice(rayIndex: number): void {
    // Use same pixel-perfect coordinates as wall slices
    const x = Math.floor((rayIndex / this.rayCount) * this.width);
    const sliceWidth = Math.ceil(this.width / this.rayCount);
    
    // Render ceiling (top half)
    this.ctx.fillStyle = this.colors.ceiling;
    this.ctx.fillRect(x, 0, sliceWidth, this.halfHeight);
    
    // Render floor (bottom half)
    this.ctx.fillStyle = this.colors.floor;
    this.ctx.fillRect(x, this.halfHeight, sliceWidth, this.halfHeight);
  }
  
  // ============================================================================
  // SPRITE RENDERING
  // ============================================================================
  
  private renderSprites(localPlayer: ClientPlayerState, gameState: ClientGameState): void {
    const sprites: SpriteRender[] = [];
    
    // Calculate render time for interpolation (slightly in the past for smooth playback)
    const renderTime = Date.now() - RENDER_CONSTANTS.INTERPOLATION_BUFFER;
    
    // Debug: Log total players and local player ID
    if (Math.random() < 0.02) { // 2% of frames
      console.log('🎭 [SPRITE DEBUG] Players in game state:', {
        totalPlayers: gameState.players.size,
        localPlayerId: gameState.localPlayerId,
        playerIds: Array.from(gameState.players.keys()),
        localPlayerPos: localPlayer.position
      });
    }
    
    // Collect player sprites with interpolation
    gameState.players.forEach((player, playerId) => {
      if (playerId !== gameState.localPlayerId && player.isAlive) {
        // Use interpolated position for remote players for smooth movement
        const interpolatedPosition = this.getInterpolatedPosition(gameState, playerId, renderTime);
        const renderPosition = interpolatedPosition || player.position;
        
        const dist = distance(localPlayer.position, renderPosition);
        
        // Debug: Log remote player info occasionally
        if (Math.random() < 0.02) { // 2% of frames
          console.log('🎭 [SPRITE DEBUG] Remote player found:', {
            playerId,
            isAlive: player.isAlive,
            serverPos: { x: player.position.x.toFixed(2), y: player.position.y.toFixed(2) },
            renderPos: { x: renderPosition.x.toFixed(2), y: renderPosition.y.toFixed(2) },
            distance: dist.toFixed(2),
            renderDistance: this.renderDistance
          });
        }
        
        if (dist <= this.renderDistance) {
          sprites.push({
            position: renderPosition,
            distance: dist,
            angle: angleFromTo(localPlayer.position, renderPosition),
            size: 0.8,
            color: this.colors.player,
            type: 'player',
            id: playerId
          });
        }
      }
    });
    
    // Collect projectile sprites
    gameState.projectiles.forEach((projectile, projectileId) => {
      const dist = distance(localPlayer.position, projectile.position);
      if (dist <= this.renderDistance) {
        sprites.push({
          position: projectile.position,
          distance: dist,
          angle: angleFromTo(localPlayer.position, projectile.position),
          size: 0.3,
          color: this.colors.projectile,
          type: 'projectile',
          id: projectileId
        });
      }
    });
    
    // Sort sprites by distance (far to near)
    sprites.sort((a, b) => b.distance - a.distance);
    
    // Debug: Log sprite collection results
    if (Math.random() < 0.02) { // 2% of frames
      console.log('🎭 [SPRITE DEBUG] Rendering sprites:', {
        totalSprites: sprites.length,
        playerSprites: sprites.filter(s => s.type === 'player').length,
        projectileSprites: sprites.filter(s => s.type === 'projectile').length,
        spritePositions: sprites.map(s => ({ id: s.id, type: s.type, pos: { x: s.position.x.toFixed(2), y: s.position.y.toFixed(2) }, dist: s.distance.toFixed(2) }))
      });
    }
    
    // Render sprites
    for (const sprite of sprites) {
      this.renderSprite(localPlayer, sprite);
    }
  }
  
  private renderSprite(localPlayer: ClientPlayerState, sprite: SpriteRender): void {
    const relativeAngle = normalizeAngle(sprite.angle - localPlayer.angle);
    
    // Check if sprite is within field of view
    const halfFov = this.fov / 2;
    if (relativeAngle > halfFov && relativeAngle < Math.PI * 2 - halfFov) {
      return; // Outside FOV
    }
    
    // Normalize angle to -PI to PI range
    let normalizedAngle = relativeAngle;
    if (normalizedAngle > Math.PI) {
      normalizedAngle -= Math.PI * 2;
    }
    
    // Calculate screen position
    const screenX = (normalizedAngle / this.fov + 0.5) * this.width;
    
    // Calculate sprite size
    const spriteHeight = (this.height * sprite.size) / Math.max(sprite.distance, 0.1);
    const spriteWidth = spriteHeight; // Square sprites
    
    // Check depth against walls
    const rayIndex = Math.floor((screenX / this.width) * this.rayCount);
    if (rayIndex >= 0 && rayIndex < this.rayCount && sprite.distance > this.wallHeights[rayIndex]) {
      return; // Behind wall
    }
    
    // Apply distance-based shading
    const shadingFactor = Math.max(0.2, 1 - sprite.distance / this.renderDistance);
    const spriteColor = this.applyShading(sprite.color, shadingFactor);
    
    // Render sprite as circle
    this.ctx.fillStyle = spriteColor;
    this.ctx.beginPath();
    this.ctx.arc(
      screenX,
      this.halfHeight,
      spriteWidth / 2,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  private getLineIntersection(
    p1: Position, p2: Position,
    p3: Position, p4: Position
  ): Position | null {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    
    if (Math.abs(denom) < 1e-10) {
      return null; // Lines are parallel
    }
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      };
    }
    
    return null;
  }
  
  private applyShading(baseColor: string, factor: number): string {
    // Simple color darkening based on distance
    const clampedFactor = Math.max(0, Math.min(1, factor));
    
    // Parse hex color
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Apply shading
    const shadedR = Math.floor(r * clampedFactor);
    const shadedG = Math.floor(g * clampedFactor);
    const shadedB = Math.floor(b * clampedFactor);
    
    return `rgb(${shadedR}, ${shadedG}, ${shadedB})`;
  }
  
  private applyDistanceFog(): void {
    // Create subtle vignette effect
    const gradient = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, 0,
      this.width / 2, this.height / 2, this.width / 2
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  
  private clearScreen(): void {
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  
  public renderNoPlayer(): void {
    this.clearScreen();
    
    // Render "No Player" message
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      'Waiting for game state...',
      this.width / 2,
      this.height / 2
    );
  }
  
  // ============================================================================
  // INTERPOLATION SUPPORT
  // ============================================================================
  
  /**
   * Set game state manager reference for interpolation support
   */
  setGameStateManager(gameStateManager: ClientGameStateManager): void {
    this.gameStateManager = gameStateManager;
  }
  
  /**
   * Get interpolated position for remote players
   */
  private getInterpolatedPosition(gameState: ClientGameState, playerId: string, renderTime: number): Position | null {
    if (!this.gameStateManager) {
      // Fallback to current position if no state manager available
      const player = gameState.players.get(playerId);
      return player ? { ...player.position } : null;
    }
    
    const interpolatedPos = this.gameStateManager.getInterpolatedPlayerPosition(playerId, renderTime);
    const currentPos = gameState.players.get(playerId)?.position;
    
    // Debug: Log interpolation occasionally
    if (interpolatedPos && currentPos && Math.random() < 0.01) { // 1% of calls
      const distance = Math.sqrt(
        Math.pow(interpolatedPos.x - currentPos.x, 2) + 
        Math.pow(interpolatedPos.y - currentPos.y, 2)
      );
      console.log('🎭 [DEBUG] Player interpolation', {
        playerId,
        current: { x: currentPos.x.toFixed(2), y: currentPos.y.toFixed(2) },
        interpolated: { x: interpolatedPos.x.toFixed(2), y: interpolatedPos.y.toFixed(2) },
        distance: distance.toFixed(3)
      });
    }
    
    return interpolatedPos;
  }
  
  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  /**
   * Update render settings
   */
  updateSettings(settings: {
    fov?: number;
    renderDistance?: number;
    rayCount?: number;
  }): void {
    if (settings.fov !== undefined) {
      this.fov = Math.max(Math.PI / 6, Math.min(Math.PI, settings.fov));
    }
    
    if (settings.renderDistance !== undefined) {
      this.renderDistance = Math.max(5, Math.min(50, settings.renderDistance)) as typeof RENDER_CONSTANTS.RENDER_DISTANCE;
    }
    
    if (settings.rayCount !== undefined) {
      this.rayCount = Math.max(50, Math.min(this.width, settings.rayCount)) as typeof RENDER_CONSTANTS.RAY_COUNT;
    }
    
    // Recalculate values
    this.precalculateValues();
  }
  
  /**
   * Get current render settings
   */
  getSettings(): { fov: number; renderDistance: number; rayCount: number } {
    return {
      fov: this.fov,
      renderDistance: this.renderDistance,
      rayCount: this.rayCount
    };
  }
  
  /**
   * Resize renderer
   */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.updateDimensions();
    this.precalculateValues();
  }
  
  /**
   * Handle hitscan fired event - add tracer to active list
   */
  onHitscanFired(event: HitscanFiredEvent): void {
    const tracer: HitscanTracer = {
      id: `tracer_${this.tracerIdCounter++}`,
      startPos: { x: event.data.startPosition.x, y: event.data.startPosition.y },
      endPos: { x: event.data.endPosition.x, y: event.data.endPosition.y },
      createdAt: Date.now(),
      duration: 250 // 250ms duration for better visibility
    };
    
    this.activeTracers.set(tracer.id, tracer);
    console.log('Added hitscan tracer:', tracer.id);
  }
  
  /**
   * Render hitscan tracers using proper ray-cast projection
   */
  private renderHitscanTracers(localPlayer: ClientPlayerState): void {
    const now = Date.now();
    const expiredTracers: string[] = [];
    
    for (const [id, tracer] of this.activeTracers) {
      const age = now - tracer.createdAt;
      
      if (age > tracer.duration) {
        expiredTracers.push(id);
        continue;
      }
      
      // Simple fade effect
      const alpha = 1.0 - (age / tracer.duration);
      
      // Render tracer using ray-cast projection
      this.renderTracerLine(localPlayer, tracer, alpha);
    }
    
    // Remove expired tracers
    for (const id of expiredTracers) {
      this.activeTracers.delete(id);
    }
  }
  
  /**
   * Render a tracer line using proper ray-cast projection
   */
  private renderTracerLine(localPlayer: ClientPlayerState, tracer: HitscanTracer, alpha: number): void {
    // Sample points along the tracer line for proper projection
    const lineLength = Math.sqrt(
      Math.pow(tracer.endPos.x - tracer.startPos.x, 2) + 
      Math.pow(tracer.endPos.y - tracer.startPos.y, 2)
    );
    
    // Use enough samples to make the line look smooth
    const sampleCount = Math.min(Math.max(10, Math.floor(lineLength * 20)), 100);
    const samplePoints: Array<{ x: number; screenY: number; distance: number }> = [];
    
    // Calculate each sample point along the line
    for (let i = 0; i < sampleCount; i++) {
      const t = i / (sampleCount - 1);
      const worldPos = {
        x: tracer.startPos.x + t * (tracer.endPos.x - tracer.startPos.x),
        y: tracer.startPos.y + t * (tracer.endPos.y - tracer.startPos.y)
      };
      
      // Project this world position to screen coordinates
      const projection = this.projectWorldToScreen(worldPos, localPlayer);
      if (projection) {
        samplePoints.push(projection);
      }
    }
    
    // Draw the tracer as connected line segments
    if (samplePoints.length > 1) {
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = '#ff8800'; // Orange color
      this.ctx.lineWidth = 4; // Thicker line
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      this.ctx.beginPath();
      this.ctx.moveTo(samplePoints[0].x, samplePoints[0].screenY);
      
      for (let i = 1; i < samplePoints.length; i++) {
        this.ctx.lineTo(samplePoints[i].x, samplePoints[i].screenY);
      }
      
      this.ctx.stroke();
      this.ctx.restore();
    }
  }
  
  /**
   * Project a world position to screen coordinates using ray-cast math
   */
  private projectWorldToScreen(worldPos: { x: number; y: number }, localPlayer: ClientPlayerState): { x: number; screenY: number; distance: number } | null {
    // Calculate relative position and angle from player
    const relativeX = worldPos.x - localPlayer.position.x;
    const relativeY = worldPos.y - localPlayer.position.y;
    const distance = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
    
    // Skip points that are too close to prevent division by zero
    if (distance < 0.01) {
      return null;
    }
    
    // Calculate angle to the point
    const worldAngle = Math.atan2(relativeY, relativeX);
    const relativeAngle = this.normalizeAngle(worldAngle - localPlayer.angle);
    
    // Normalize relative angle to -PI to PI range
    let normalizedAngle = relativeAngle;
    if (normalizedAngle > Math.PI) {
      normalizedAngle -= Math.PI * 2;
    }
    
    // Check if point is within field of view
    const halfFov = this.fov / 2;
    if (Math.abs(normalizedAngle) > halfFov) {
      return null; // Outside FOV
    }
    
    // Calculate screen X position using same math as sprite rendering
    const screenX = (normalizedAngle / this.fov + 0.5) * this.width;
    
    // Calculate perspective-corrected distance and screen Y position
    const correctedDistance = distance * RENDER_CONSTANTS.PERSPECTIVE_SCALE;
    const safeDistance = Math.max(correctedDistance, 0.01);
    
    // Use a small tracer "height" to position it in the middle of the screen
    // This makes the tracer appear as a line at eye level
    const tracerHeight = 0.1; // Small height for thin line
    const projectedHeight = (this.height * tracerHeight) / safeDistance;
    const screenY = this.halfHeight; // Always at eye level
    
    return {
      x: screenX,
      screenY: screenY,
      distance: distance
    };
  }
}