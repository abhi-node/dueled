/**
 * Raycaster - Core ray-casting engine for Doom-style rendering
 * Handles the ray casting calculations and rendering of the 3D view
 */

import type { SpriteRenderer } from './SpriteRenderer';
import { TextureManager } from './TextureManager';
import type { FlexibleMap } from '../world/FlexibleMap';
import { projectileSpriteManager } from './ProjectileSpriteManager';
import type { ClassType } from '@dueled/shared';
import { ClassType as CT } from '@dueled/shared';

export interface RayResult {
  distance: number;
  wallType: number;
  textureX: number;
  side: 'vertical' | 'horizontal';
  mapX: number;
  mapY: number;
}

export class Raycaster {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private fov: number = 60; // Field of view in degrees
  private viewDistance: number = 20; // Maximum view distance in grid units
  private wallHeight: number = 1; // Height of walls in world units
  
  // Player state - start at a safe position (center of 20x20 map)
  private playerX: number = 10;
  private playerY: number = 10;
  private playerAngle: number = 0; // In radians
  private playerPitch: number = 0; // Camera pitch in radians (up/down looking)
  
  // Ray casting settings
  private numRays: number;
  private rayAngleStep: number;
  private rayWidth: number; // Width of each ray strip
  
  // Performance optimization
  private halfHeight: number;
  private distanceToProjectionPlane: number;
  
  // Camera pitch settings
  private maxPitch: number = Math.PI / 3; // 60 degrees max pitch up/down
  
  // Texture manager
  private textureManager: TextureManager | null = null;
  
  // Flexible map reference
  private flexibleMap: FlexibleMap | null = null;
  
  constructor(canvas: HTMLCanvasElement, spriteRenderer?: SpriteRenderer) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = context;
    
    this.width = canvas.width;
    this.height = canvas.height;
    this.halfHeight = this.height / 2;
    
    // Calculate ray casting parameters - OPTIMIZED: cast fewer rays
    this.numRays = Math.floor(this.width / 2); // Cast half as many rays
    this.rayWidth = this.width / this.numRays; // Each ray covers multiple pixels
    this.rayAngleStep = (this.fov * Math.PI / 180) / this.numRays;
    this.distanceToProjectionPlane = (this.width / 2) / Math.tan((this.fov / 2) * Math.PI / 180);
    
    // Set sprite renderer reference
    this.spriteRenderer = spriteRenderer || null;
    
    // Load arrow sprite sheet
    // Projectile sprites are now managed by ProjectileSpriteManager
  }
  
  /**
   * Cast a single ray and return collision information
   */
  private castRay(angle: number, map: number[][]): RayResult | null {
    try {
      return this.castGridRay(angle, map);
    } catch (error) {
      // Log errors to help debug rendering issues
      console.error('🚨 castRay error:', error, 'angle:', angle, 'mapSize:', map?.length, 'x', map?.[0]?.length);
      return null;
    }
  }
  
  /**
   * Cast ray using grid-based system
   */
  private castGridRay(angle: number, map: number[][]): RayResult | null {
    // Validate map
    if (!map || map.length === 0 || !map[0]) {
      console.error('🚨 castGridRay: Invalid map', { mapExists: !!map, mapLength: map?.length, firstRowExists: !!map?.[0] });
      return null;
    }
    
    const rayDirX = Math.cos(angle);
    const rayDirY = Math.sin(angle);
    
    // Current position
    let x = this.playerX;
    let y = this.playerY;
    
    // Step size for ray marching - OPTIMIZED: much larger for better performance
    const stepSize = 0.1; // Increased from 0.02 to 0.1 = 5x faster
    let distance = 0;
    
    // Ray marching
    while (distance < this.viewDistance) {
      x += rayDirX * stepSize;
      y += rayDirY * stepSize;
      distance += stepSize;
      
      // Check map boundaries
      const mapX = Math.floor(x);
      const mapY = Math.floor(y);
      
      // If the ray has reached outside the map, treat the boundary as a solid wall so the
      // renderer always has something to draw. This prevents the "blank world" issue where
      // rays exit the grid without ever colliding with a wall tile and therefore render
      // nothing. We approximate the hit as a vertical wall.
      if (mapX < 0 || mapX >= map[0].length || mapY < 0 || mapY >= map.length) {
        // Debug log for boundary hits (very rarely)
        if (Math.random() < 0.001) {
          console.log('🎯 Ray hit boundary:', { mapX, mapY, mapSize: `${map.length}x${map[0].length}`, distance });
        }
        return {
          distance,
          wallType: 1,               // Default wall type for boundaries
          textureX: 0,               // Use the first column of the texture
          side: 'vertical',          // Treat boundary as a vertical wall for shading
          mapX,
          mapY
        };
      }
      
      // Check for wall collision
      if (map[mapY][mapX] > 0) {
        // Debug log for wall hits (very rarely)
        if (Math.random() < 0.001) {
          console.log('🎯 Ray hit wall:', { mapX, mapY, wallType: map[mapY][mapX], distance });
        }
        
        // Determine which side of the wall was hit
        const xFrac = x - mapX;
        const yFrac = y - mapY;
        
        let side: 'vertical' | 'horizontal';
        let textureX: number;
        
        // Determine if we hit a vertical or horizontal wall
        if (Math.min(xFrac, 1 - xFrac) < Math.min(yFrac, 1 - yFrac)) {
          side = 'vertical';
          textureX = yFrac;
        } else {
          side = 'horizontal';
          textureX = xFrac;
        }
        
        return {
          distance,
          wallType: map[mapY][mapX],
          textureX,
          side,
          mapX,
          mapY
        };
      }
    }
    
    return null;
  }
  
  // Other players - complete player data
  private otherPlayers: Map<string, { 
    x: number; 
    y: number; 
    angle: number;
    classType: ClassType;
    isMoving: boolean;
    health?: number;
    armor?: number;
    isAlive?: boolean;
    color: string;
  }> = new Map();
  
  // Local player ID to filter out
  private localPlayerId: string | null = null;
  
  // Projectiles for 3D rendering
  private projectiles: Map<string, { x: number; y: number; type: string; rotation: number; size: number; color?: string }> = new Map();
  
  // NEW: Sprites for 3D rendering (models after projectiles)
  private sprites: Map<string, { 
    id: string; 
    x: number; 
    y: number; 
    angle: number; 
    classType: ClassType; 
    spriteFrame: any | null;
    size: number;
  }> = new Map();
  
  // Sprite renderer reference
  private spriteRenderer: SpriteRenderer | null = null;
  
  /**
   * Set sprite renderer reference
   */
  public setSpriteRenderer(spriteRenderer: SpriteRenderer): void {
    this.spriteRenderer = spriteRenderer;
  }
  
  /**
   * Set texture manager reference
   */
  public setTextureManager(textureManager: TextureManager): void {
    this.textureManager = textureManager;
  }
  
  /**
   * Set local player ID to filter out from rendering
   */
  public setLocalPlayerId(playerId: string): void {
    this.localPlayerId = playerId;
    // Remove any existing entry for local player
    this.otherPlayers.delete(playerId);
    console.log(`🎮 Raycaster: Set local player ID to ${playerId}, will not render this player`);
  }
  
  /**
   * Add or update another player with complete data
   */
  public updateOtherPlayer(
    playerId: string, 
    x: number, 
    y: number, 
    angle: number = 0,
    classType: ClassType = CT.BERSERKER,
    isMoving: boolean = false,
    health?: number,
    armor?: number,
    isAlive: boolean = true,
    color: string = '#ff0000'
  ): void {
    // CRITICAL: Never add local player to other players
    if (playerId === this.localPlayerId) {
      console.warn(`⚠️ Raycaster: Attempted to add local player ${playerId} to other players. Ignoring.`);
      return;
    }
    
    this.otherPlayers.set(playerId, { 
      x, 
      y, 
      angle,
      classType,
      isMoving,
      health,
      armor,
      isAlive,
      color 
    });
    
    // Sprite updates are now handled by MainGameScene to avoid conflicts
    // The raycaster will query the sprite renderer during rendering
  }

  /**
   * Add or update a projectile for 3D rendering
   */
  public updateProjectile(projectileId: string, x: number, y: number, type: string, rotation: number, size: number = 0.1, color?: string): void {
    this.projectiles.set(projectileId, { x, y, type, rotation, size, color: color || '#ffffff' });
  }

  /**
   * Persist a projectile for 3D rendering (similar to updateOtherPlayer)
   * This method ensures projectiles persist between frames
   */
  public persistProjectile(projectileId: string, x: number, y: number, type: string, rotation: number, size: number = 0.1, color?: string): void {
    // Only update if projectile exists or position has changed
    const existing = this.projectiles.get(projectileId);
    if (!existing || existing.x !== x || existing.y !== y || existing.rotation !== rotation) {
      this.projectiles.set(projectileId, { x, y, type, rotation, size, color: color || '#ffffff' });
    }
  }

  /**
   * Remove a projectile from 3D rendering
   */
  public removeProjectile(projectileId: string): void {
    this.projectiles.delete(projectileId);
  }

  /**
   * Clear all projectiles
   */
  public clearProjectiles(): void {
    this.projectiles.clear();
  }

  /**
   * Get the current number of projectiles
   */
  public getProjectileCount(): number {
    return this.projectiles.size;
  }

  /**
   * Get all projectile IDs currently in the Raycaster
   */
  public getProjectileIds(): string[] {
    return Array.from(this.projectiles.keys());
  }

  // NEW: Sprite persistence methods (modeled after projectiles)
  
  /**
   * Persist a sprite for 3D rendering
   */
  public persistSprite(
    id: string, 
    x: number, 
    y: number, 
    angle: number, 
    classType: ClassType, 
    spriteFrame: any | null,
    size: number = 1.0
  ): void {
    // Only update if sprite doesn't exist or position/angle has changed
    const existing = this.sprites.get(id);
    if (!existing || existing.x !== x || existing.y !== y || existing.angle !== angle) {
      this.sprites.set(id, { id, x, y, angle, classType, spriteFrame, size });
    }
  }

  /**
   * Remove a sprite from 3D rendering
   */
  public removeSprite(id: string): void {
    this.sprites.delete(id);
  }

  /**
   * Clear all sprites
   */
  public clearSprites(): void {
    this.sprites.clear();
  }

  /**
   * Get the current number of sprites
   */
  public getSpriteCount(): number {
    return this.sprites.size;
  }

  /**
   * Get all sprite IDs currently in the Raycaster
   */
  public getSpriteIds(): string[] {
    return Array.from(this.sprites.keys());
  }

  /**
   * Render a projectile in 3D space
   */
  private renderProjectile(
    projectile: { x: number; y: number; type: string; rotation: number; size: number; color?: string },
    screenX: number,
    screenY: number,
    size: number,
    fogFactor: number
  ): void {
    // Scale down the projectile size for arrows (they should be small)
    const renderSize = Math.max(4, size * 0.5); // Reduced size multiplier from 2 to 0.5
    
    if (renderSize < 1) {
      return; // Too small to render
    }
    
    this.ctx.save();
    this.ctx.translate(screenX, screenY);
    this.ctx.rotate(projectile.rotation);
    
    // Apply fog effect with minimum visibility
    this.ctx.globalAlpha = Math.max(0.5, fogFactor); // Ensure minimum 50% visibility
    
    // Render different projectile types
    switch (projectile.type) {
      case 'arrow':
        this.renderArrowProjectile(renderSize, projectile.color);
        break;
      case 'ice_shard':
        this.renderIceShardProjectile(renderSize, projectile.color);
        break;
      case 'fire_bomb':
        this.renderFireBombProjectile(renderSize, projectile.color);
        break;
      default:
        this.renderDefaultProjectile(renderSize, projectile.color);
    }
    
    this.ctx.restore();
  }

  /**
   * Render an arrow projectile
   */
  private renderArrowProjectile(size: number, color?: string): void {
    // Get sprite frame from projectile sprite manager
    const frame = projectileSpriteManager.getProjectileFrame('arrow', Date.now());
    
    if (frame && frame.canvas) {
      // Render sprite
      this.ctx.drawImage(
        frame.canvas,
        -size / 2,
        -size / 2,
        size,
        size
      );
    } else {
      // Fallback simple geometry
      this.renderArrowFallback(size, color);
    }
  }
  
  private renderArrowFallback(size: number, color?: string): void {
    // Scaled down arrow shape - arrows should be small
    const arrowLength = size * 0.8;
    const arrowWidth = size * 0.3;
    
    this.ctx.fillStyle = color || '#8B4513'; // Brown for wood
    this.ctx.strokeStyle = '#654321'; // Darker brown
    this.ctx.lineWidth = 1;
    
    // Arrow shaft
    this.ctx.fillRect(-arrowLength / 2, -arrowWidth / 6, arrowLength * 0.7, arrowWidth / 3);
    
    // Arrow head
    this.ctx.beginPath();
    this.ctx.moveTo(arrowLength * 0.2, 0);
    this.ctx.lineTo(arrowLength / 2, -arrowWidth / 2);
    this.ctx.lineTo(arrowLength / 2, arrowWidth / 2);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    
    // Arrow fletching
    this.ctx.fillStyle = '#DC143C'; // Crimson
    this.ctx.beginPath();
    this.ctx.moveTo(-arrowLength / 2, 0);
    this.ctx.lineTo(-arrowLength * 0.3, -arrowWidth / 3);
    this.ctx.lineTo(-arrowLength * 0.3, arrowWidth / 3);
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Render an ice shard projectile
   */
  private renderIceShardProjectile(size: number, color?: string): void {
    // Get sprite frame from projectile sprite manager
    const frame = projectileSpriteManager.getProjectileFrame('ice_shard', Date.now());
    
    if (frame && frame.canvas) {
      // Render sprite
      this.ctx.drawImage(
        frame.canvas,
        -size / 2,
        -size / 2,
        size,
        size
      );
    } else {
      // Fallback - ice blue crystal
      const shardLength = size;
      const shardWidth = size * 0.4;
      
      // Create gradient for ice effect
      const gradient = this.ctx.createLinearGradient(-shardLength/2, 0, shardLength/2, 0);
      gradient.addColorStop(0, '#00FFFF');
      gradient.addColorStop(0.5, '#FFFFFF');
      gradient.addColorStop(1, '#00CED1');
      
      this.ctx.fillStyle = gradient;
      this.ctx.strokeStyle = '#4682B4';
      this.ctx.lineWidth = 2;
      
      // Diamond/crystal shape
      this.ctx.beginPath();
      this.ctx.moveTo(-shardLength / 2, 0);
      this.ctx.lineTo(0, -shardWidth / 2);
      this.ctx.lineTo(shardLength / 2, 0);
      this.ctx.lineTo(0, shardWidth / 2);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      
      // Inner highlight
      this.ctx.globalAlpha = 0.5;
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.beginPath();
      this.ctx.moveTo(-shardLength / 4, 0);
      this.ctx.lineTo(0, -shardWidth / 4);
      this.ctx.lineTo(shardLength / 4, 0);
      this.ctx.lineTo(0, shardWidth / 4);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
    }
  }

  /**
   * Render a fire bomb projectile
   */
  private renderFireBombProjectile(size: number, color?: string): void {
    // Get sprite frame from projectile sprite manager
    const frame = projectileSpriteManager.getProjectileFrame('fire_bomb', Date.now());
    
    if (frame && frame.canvas) {
      // Render sprite
      this.ctx.drawImage(
        frame.canvas,
        -size / 2,
        -size / 2,
        size,
        size
      );
    } else {
      // Fallback - flaming orb
      const bombRadius = size * 0.4;
      
      // Create radial gradient for fire effect
      const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, bombRadius);
      gradient.addColorStop(0, '#FFFF00');
      gradient.addColorStop(0.5, '#FF8C00');
      gradient.addColorStop(1, '#FF4500');
      
      this.ctx.fillStyle = gradient;
      this.ctx.strokeStyle = '#8B0000';
      this.ctx.lineWidth = 2;
      
      // Main bomb circle
      this.ctx.beginPath();
      this.ctx.arc(0, 0, bombRadius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      
      // Fire particles
      this.ctx.globalAlpha = 0.7;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + Date.now() * 0.001;
        const x = Math.cos(angle) * bombRadius * 0.8;
        const y = Math.sin(angle) * bombRadius * 0.8;
        
        this.ctx.fillStyle = '#FF6347';
        this.ctx.beginPath();
        this.ctx.arc(x, y, bombRadius * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.globalAlpha = 1;
    }
  }

  /**
   * Render a default projectile
   */
  private renderDefaultProjectile(size: number, color?: string): void {
    this.ctx.fillStyle = color || '#FFFFFF';
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, size * 0.5, size * 0.2, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }

  /**
   * Check if there's a clear line of sight between two points using DDA algorithm
   */
  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number, map: number[][]): boolean {
    // Validate map
    if (!map || map.length === 0 || !map[0]) {
      return false;
    }
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // If very close, always visible
    if (distance < 0.5) return true;
    
    // Step size - make it a bit less strict for better gameplay
    const steps = Math.ceil(distance * 5); // Reduced from 10 to 5 for less strict checking
    const stepX = dx / steps;
    const stepY = dy / steps;
    
    const mapHeight = map.length;
    const mapWidth = map[0]?.length || 0;
    
    for (let i = 1; i < steps; i++) { // Skip first and last points for edge cases
      const currentX = x1 + stepX * i;
      const currentY = y1 + stepY * i;
      
      const mapX = Math.floor(currentX);
      const mapY = Math.floor(currentY);
      
      // Check bounds
      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
        return false;
      }
      
      // Check for wall (with safety check)
      if (map[mapY] && map[mapY][mapX] !== 0) {
        return false; // Wall blocking line of sight
      }
    }
    
    return true;
  }
  
  /**
   * Remove another player
   */
  public removeOtherPlayer(playerId: string): void {
    this.otherPlayers.delete(playerId);
  }
  
  /**
   * Render the 3D view with optimized camera pitch
   */
  public render(map: number[][]): void {
    // Fast validation - no logging in hot path
    if (!map || map.length === 0 || !this.ctx || this.width <= 0 || this.height <= 0) {
      // Only log errors in development
      if (process.env.NODE_ENV !== 'production') {
        console.error('🚨 Render validation failed:', { map: !!map, ctx: !!this.ctx, dimensions: `${this.width}x${this.height}` });
      }
      return;
    }
    
    // Debug: Check if we have players and projectiles to render
    if (Math.random() < 0.01) { // Log occasionally
      console.log('Raycaster render debug:', {
        otherPlayersCount: this.otherPlayers.size,
        projectilesCount: this.projectiles.size,
        playerIds: Array.from(this.otherPlayers.keys()),
        projectileIds: Array.from(this.projectiles.keys())
      });
    }
    
    try {
      // Pre-calculate common values for efficiency
      const pitchOffset = this.playerPitch * this.distanceToProjectionPlane;
      const halfFov = (this.fov / 2) * Math.PI / 180;
      const halfWidth = this.width / 2;
      
      // Clear canvas efficiently
      this.ctx.fillStyle = '#1e293b';
      this.ctx.fillRect(0, 0, this.width, this.height);
      // Render floor and ceiling with textures
      this.renderFloorAndCeiling(map);
      
      // Collect all objects to render (walls and players)
      const renderObjects: { distance: number; render: () => void }[] = [];
      
      // Cast rays for walls - pre-calculate start angle
      const startAngle = this.playerAngle - halfFov;
      
      for (let i = 0; i < this.numRays; i++) {
        const rayAngle = startAngle + i * this.rayAngleStep;
        const ray = this.castRay(rayAngle, map);
        
        if (ray) {
          const correctedDistance = ray.distance * Math.cos(rayAngle - this.playerAngle);
          const projectedWallHeight = (this.wallHeight / correctedDistance) * this.distanceToProjectionPlane;
          
          // Apply pitch offset to wall positioning
          const wallCenter = this.halfHeight + pitchOffset;
          const wallTop = wallCenter - projectedWallHeight / 2;
          const wallBottom = wallCenter + projectedWallHeight / 2;
          
          let color: string;
          if (ray.wallType === 1) {
            color = ray.side === 'vertical' ? '#64748b' : '#475569';
          } else if (ray.wallType === 2) {
            color = ray.side === 'vertical' ? '#ef4444' : '#dc2626';
          } else {
            color = ray.side === 'vertical' ? '#3b82f6' : '#2563eb';
          }
          
          // Apply fog by darkening the color rather than making it transparent
          const fogFactor = Math.max(0.3, 1 - ray.distance / this.viewDistance);
          const foggedColor = this.applyFogToColor(color, fogFactor);
          
          renderObjects.push({
            distance: ray.distance,
            render: () => {
              // Render walls as solid, opaque columns that properly occlude floor/ceiling
              this.ctx.globalAlpha = 1; // Ensure walls are fully opaque
              
              // Try to render with texture first
              if (this.textureManager) {
                const wallTexture = this.textureManager.getWallTexture(ray.wallType);
                if (wallTexture) {
                  this.renderTexturedWallStrip(i * this.rayWidth, wallTop, wallBottom - wallTop, ray, wallTexture, fogFactor);
                  return;
                }
              }
              
              // Fallback to solid color with fog applied to color, not transparency
              this.ctx.fillStyle = foggedColor;
              this.ctx.globalAlpha = 1; // Always fully opaque
              this.ctx.fillRect(i * this.rayWidth, wallTop, this.rayWidth, wallBottom - wallTop);
            }
          });
        }
      }
      // OLD PLAYER RENDERING SYSTEM - DISABLED TO PREVENT DUPLICATE RENDERING
      // This system has been replaced by the new unified sprite system below
      // The new system renders from this.sprites Map and uses SpriteSheetManager
      /*
      // Add other players to render list - pre-calculate common values
      for (const [playerId, player] of this.otherPlayers.entries()) {
        const dx = player.x - this.playerX;
        const dy = player.y - this.playerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Early exit conditions
        if (distance > this.viewDistance) continue;
        
        // Calculate angle to player
        const angleToPlayer = Math.atan2(dy, dx);
        let relativeAngle = angleToPlayer - this.playerAngle;
        
        // Normalize angle efficiently
        if (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        else if (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
        
        // Check if player is in field of view
        if (Math.abs(relativeAngle) > halfFov) continue;
        
        // Check line of sight after angle check for efficiency
        if (!this.hasLineOfSight(this.playerX, this.playerY, player.x, player.y, map)) continue;
        
        // Calculate screen position
        const screenX = halfWidth + (relativeAngle / halfFov) * halfWidth;
        const projectedPlayerHeight = (0.8 / distance) * this.distanceToProjectionPlane;
        
        // Apply pitch offset to player positioning
        const playerCenterY = this.halfHeight + pitchOffset;
        
        const fogFactor = Math.max(0, 1 - distance / this.viewDistance);
        
        renderObjects.push({
          distance,
          render: () => {
            // Try to render sprite if sprite renderer is available
            let spriteRendered = false;
            if (this.spriteRenderer) {
              try {
                // Just fetch the pre-updated frame - no per-frame mutation here
                const spriteFrame = this.spriteRenderer.getPlayerSpriteFrame(playerId);
                
                // Debug why sprites might be failing
                if (!spriteFrame) {
                  if (Math.random() < 0.01) { // Log occasionally to avoid spam
                    const hasSprite = this.spriteRenderer.hasPlayerSprite(playerId);
                    const debugInfo = this.spriteRenderer.getDebugInfo();
                    console.warn(`Sprite render failed for ${playerId}:`, {
                      hasSprite,
                      totalSprites: debugInfo.playerCount,
                      registeredIds: debugInfo.playerIds,
                      playerData: player
                    });
                  }
                }
                
                if (spriteFrame && spriteFrame.canvas) {
                  // Validate sprite frame canvas
                  if (spriteFrame.canvas.width > 0 && spriteFrame.canvas.height > 0) {
                    // Render sprite with stable positioning
                    const spriteSize = Math.max(1, projectedPlayerHeight); // Ensure positive size
                    const spriteX = screenX - spriteSize / 2;
                    
                    // Position sprite centered on the ground plane
                    // The sprite should be centered vertically on the player's position
                    const spriteY = playerCenterY - spriteSize / 2;
                    
                    // Validate screen position with margin for partial visibility
                    if (spriteX < this.width + spriteSize && spriteX + spriteSize > -spriteSize && 
                        spriteY < this.height + spriteSize && spriteY + spriteSize > -spriteSize) {
                      // Apply fog using alpha for distance
                      this.ctx.globalAlpha = Math.max(0.1, fogFactor);
                      try {
                        this.ctx.drawImage(
                          spriteFrame.canvas,
                          Math.round(spriteX), // Round to prevent sub-pixel blurring
                          Math.round(spriteY), // Round to prevent sub-pixel blurring
                          Math.round(spriteSize),
                          Math.round(spriteSize)
                        );
                        spriteRendered = true;
                      } catch (drawError) {
                        // Silently fail to avoid console spam
                      }
                      this.ctx.globalAlpha = 1;
                    }
                  }
                }
              } catch (spriteError) {
                // Silently fail to avoid console spam
              }
            }
            
            // Fallback to circle rendering if no sprite available
            if (!spriteRendered) {
              const radius = projectedPlayerHeight / 2;
              const circleCenterY = playerCenterY;
              this.ctx.fillStyle = player.color;
              this.ctx.globalAlpha = fogFactor;
              
              // Draw sphere shadow/outline for better visibility
              this.ctx.beginPath();
              this.ctx.arc(screenX, circleCenterY, radius + 2, 0, Math.PI * 2);
              this.ctx.fillStyle = '#000000';
              this.ctx.fill();
              
              // Draw main sphere
              this.ctx.beginPath();
              this.ctx.arc(screenX, circleCenterY, radius, 0, Math.PI * 2);
              this.ctx.fillStyle = player.color;
              this.ctx.fill();
              
              // Add highlight for 3D effect
              const gradient = this.ctx.createRadialGradient(
                screenX - radius/3, circleCenterY - radius/3, 0,
                screenX, circleCenterY, radius
              );
              gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
              gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
              this.ctx.fillStyle = gradient;
              this.ctx.fill();
              
              this.ctx.globalAlpha = 1;
            }
          }
        });
      }
      */

      // Add projectiles to render list - optimized loop
      for (const [projectileId, projectile] of this.projectiles.entries()) {
        const dx = projectile.x - this.playerX;
        const dy = projectile.y - this.playerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Early exit conditions
        if (distance < 0.2 || distance > this.viewDistance) continue;
        
        // Calculate angle to projectile
        const angleToProjectile = Math.atan2(dy, dx);
        let relativeAngle = angleToProjectile - this.playerAngle;
        
        // Normalize angle efficiently
        if (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        else if (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
        
        // Check if projectile is in field of view
        if (Math.abs(relativeAngle) > halfFov) continue;
        
        // Check line of sight after angle check for efficiency
        if (!this.hasLineOfSight(this.playerX, this.playerY, projectile.x, projectile.y, map)) continue;
        
        // Calculate screen position and size
        const screenX = halfWidth + (relativeAngle / halfFov) * halfWidth;
        const clampedDistance = Math.max(0.5, distance);
        const projectedSize = (projectile.size / clampedDistance) * this.distanceToProjectionPlane;
        const projectileCenterY = this.halfHeight + pitchOffset;
        const fogFactor = Math.max(0, 1 - distance / this.viewDistance);
        
        renderObjects.push({
          distance,
          render: () => this.renderProjectile(projectile, screenX, projectileCenterY, projectedSize, fogFactor)
        });
      }

      // NEW: Add sprites to render list - NO FOG for sprites
      for (const [spriteId, sprite] of this.sprites.entries()) {
        const dx = sprite.x - this.playerX;
        const dy = sprite.y - this.playerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Early exit conditions
        if (distance < 0.1 || distance > this.viewDistance) continue;
        
        // Calculate angle to sprite
        const angleToSprite = Math.atan2(dy, dx);
        let relativeAngle = angleToSprite - this.playerAngle;
        
        // Normalize angle efficiently
        if (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        else if (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
        
        // Check if sprite is in field of view
        if (Math.abs(relativeAngle) > halfFov) continue;
        
        // Check line of sight after angle check for efficiency
        if (!this.hasLineOfSight(this.playerX, this.playerY, sprite.x, sprite.y, map)) continue;
        
        // Calculate screen position and size
        const screenX = halfWidth + (relativeAngle / halfFov) * halfWidth;
        const clampedDistance = Math.max(0.5, distance);
        const projectedSize = (sprite.size / clampedDistance) * this.distanceToProjectionPlane;
        const spriteCenterY = this.halfHeight + pitchOffset;
        // NO FOG FACTOR for sprites - always fully visible
        
        renderObjects.push({
          distance,
          render: () => this.renderSprite(sprite, screenX, spriteCenterY, projectedSize)
        });
      }

      // Sort by distance (far to near) and render efficiently
      renderObjects.sort((a, b) => b.distance - a.distance);
      
      // Render all objects
      for (const obj of renderObjects) {
        obj.render();
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('🚨 Critical error in render method:', error);
      }
    }
  }
  
  /**
   * Update player position
   */
  public setPlayerPosition(x: number, y: number): void {
    this.playerX = x;
    this.playerY = y;
  }
  
  /**
   * Update player rotation
   */
  public setPlayerAngle(angle: number): void {
    this.playerAngle = angle;
  }
  
  /**
   * Move player forward/backward
   */
  public movePlayer(forward: number, strafe: number, map: number[][]): void {
    // Validate map first
    if (!map || map.length === 0 || !map[0] || map[0].length === 0) {
      console.error('Invalid map provided to movePlayer');
      return;
    }
    
    const moveSpeed = 0.1; // Constant movement speed regardless of pitch
    
    // Calculate new position using ONLY horizontal angle (not pitch)
    // This ensures movement speed is not affected by looking up/down
    const dx = Math.cos(this.playerAngle) * forward - Math.sin(this.playerAngle) * strafe;
    const dy = Math.sin(this.playerAngle) * forward + Math.cos(this.playerAngle) * strafe;
    
    const newX = this.playerX + dx * moveSpeed;
    const newY = this.playerY + dy * moveSpeed;
    
    // Grid-based collision detection
    const mapX = Math.floor(newX);
    const mapY = Math.floor(newY);
    
    // Get map dimensions safely
    const mapHeight = map.length;
    const mapWidth = map[0]?.length || 0;
    
    if (mapX >= 0 && mapX < mapWidth && mapY >= 0 && mapY < mapHeight) {
      // Check Y movement (make sure not to access out of bounds)
      if (Math.floor(this.playerX) < mapWidth && map[mapY] && map[mapY][Math.floor(this.playerX)] === 0) {
        this.playerY = newY;
      }
      
      // Check X movement (make sure not to access out of bounds)
      if (Math.floor(this.playerY) < mapHeight && map[Math.floor(this.playerY)] && map[Math.floor(this.playerY)][mapX] === 0) {
        this.playerX = newX;
      }
    }
  }
  
  /**
   * Rotate player
   */
  public rotatePlayer(angle: number): void {
    this.playerAngle += angle;
    
    // Keep angle in [0, 2π]
    while (this.playerAngle < 0) {
      this.playerAngle += 2 * Math.PI;
    }
    while (this.playerAngle >= 2 * Math.PI) {
      this.playerAngle -= 2 * Math.PI;
    }
  }
  
  /**
   * Adjust camera pitch (up/down looking)
   */
  public adjustPitch(pitchDelta: number): void {
    this.playerPitch += pitchDelta;
    
    // Clamp pitch to prevent over-rotation
    this.playerPitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.playerPitch));
  }
  
  /**
   * Set camera pitch directly
   */
  public setPitch(pitch: number): void {
    this.playerPitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, pitch));
  }
  
  /**
   * Get camera pitch
   */
  public getPitch(): number {
    return this.playerPitch;
  }
  
  
  /**
   * Get player state
   */
  public getPlayerState(): { x: number; y: number; angle: number; pitch: number } {
    return {
      x: this.playerX,
      y: this.playerY,
      angle: this.playerAngle,
      pitch: this.playerPitch
    };
  }
  
  /**
   * Get the current rendered position of another player
   */
  public getOtherPlayerPosition(playerId: string): { x: number; y: number } | null {
    const player = this.otherPlayers.get(playerId);
    return player ? { x: player.x, y: player.y } : null;
  }
  
  /**
   * Get complete player data
   */
  public getOtherPlayerData(playerId: string) {
    return this.otherPlayers.get(playerId);
  }
  
  /**
   * Get all other players data
   */
  public getAllOtherPlayers() {
    return this.otherPlayers;
  }
  
  /**
   * Render a textured wall strip with fog applied to color not transparency
   */
  private renderTexturedWallStrip(
    x: number,
    y: number,
    height: number,
    ray: RayResult,
    texture: any,
    fogFactor: number
  ): void {
    // Use scaled texture for performance
    const canvas = texture.scaledCanvas || texture.canvas;
    const textureWidth = texture.scaledCanvas ? 128 : texture.width;
    
    // Calculate texture column to use based on where the ray hit
    const textureX = Math.floor(ray.textureX * textureWidth);
    
    // Draw the wall strip using the texture
    try {
      // Render texture fully opaque
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(
        canvas,
        textureX, 0, 1, canvas.height,    // Source (1 pixel wide column from texture)
        Math.round(x), Math.round(y), Math.ceil(this.rayWidth), Math.round(height)  // Destination (stretched to wall height and ray width)
      );
      
      // Apply fog by overlaying a dark color (not transparency)
      const darkness = 1 - Math.max(0.3, fogFactor);
      if (darkness > 0) {
        this.ctx.globalAlpha = darkness * 0.7; // Limit maximum darkness
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(x, y, Math.ceil(this.rayWidth), height);
      }
      
      // Apply subtle side shading but keep walls opaque
      if (ray.side === 'horizontal') {
        this.ctx.globalAlpha = 0.1; // Very subtle side shading
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(x, y, Math.ceil(this.rayWidth), height);
      }
      
      this.ctx.globalAlpha = 1; // Always reset to full opacity
    } catch (error) {
      // Silently fail - fallback to solid color is handled by caller
    }
  }
  
  /**
   * Render floor and ceiling with solid colors for performance
   */
  private renderFloorAndCeiling(map: number[][]): void {
    try {
      // Get pitch offset
      const pitchOffset = this.playerPitch * this.distanceToProjectionPlane;
      const horizonY = Math.min(Math.max(0, this.halfHeight + pitchOffset), this.height);
      
      // OPTIMIZED: Using solid colors instead of textures for better performance
      // Ceiling
      if (horizonY > 0) {
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.width, Math.floor(horizonY));
      }
      // Floor
      if (horizonY < this.height) {
        this.ctx.fillStyle = '#1a202c';
        this.ctx.fillRect(0, Math.ceil(horizonY), this.width, this.height - Math.ceil(horizonY));
      }
    } catch (error) {
      console.error('Error in renderFloorAndCeiling:', error);
      // Silently fail and use fallback
      this.ctx.fillStyle = '#0f172a';
      this.ctx.fillRect(0, 0, this.width, this.halfHeight);
      this.ctx.fillStyle = '#1a202c';
      this.ctx.fillRect(0, this.halfHeight, this.width, this.halfHeight);
    }
  }
  
  /**
   * Render textured floor and ceiling with proper tiling
   */
  private renderTexturedFloorCeiling(horizonY: number, floorTexture: any, ceilingTexture: any): void {
    const stepY = 8; // OPTIMIZED: Render every 8th row (was 4)
    const stepX = 16; // OPTIMIZED: Sample every 16th pixel (was 8)
    const maxDistance = 8; // OPTIMIZED: Reduced render distance (was 10)
    
    // Pre-calculate angles for horizontal strips
    const angleStart = this.playerAngle - (this.fov * Math.PI / 180) / 2;
    const angleStep = (this.fov * Math.PI / 180) / this.width;
    
    // Render floor and ceiling
    for (let y = 0; y < this.height; y += stepY) {
      // Skip horizon area
      if (Math.abs(y - horizonY) < 2) continue;
      
      const isCeiling = y < horizonY;
      const texture = isCeiling ? ceilingTexture : floorTexture;
      
      if (!texture) {
        // Fallback color for this strip
        const color = isCeiling ? '#0f172a' : '#1a202c';
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, y, this.width, stepY);
        continue;
      }
      
      // Calculate distance for this row
      const verticalDistance = isCeiling ? horizonY - y : y - horizonY;
      if (verticalDistance <= 0) continue;
      
      const distance = Math.abs(this.halfHeight / verticalDistance);
      if (distance > maxDistance) {
        // Too far - use darkened solid color
        const avgColor = this.getAverageTextureColor(texture);
        this.ctx.fillStyle = avgColor;
        this.ctx.fillRect(0, y, this.width, stepY);
        continue;
      }
      
      // Fog factor for this distance
      const fogFactor = Math.max(0.3, 1 - distance / maxDistance);
      
      // Render horizontal strip
      for (let x = 0; x < this.width; x += stepX) {
        const angle = angleStart + (x / this.width) * (this.fov * Math.PI / 180);
        
        // Calculate world position
        const worldX = this.playerX + Math.cos(angle) * distance;
        const worldY = this.playerY + Math.sin(angle) * distance;
        
        // Get texture coordinates - same scale as walls
        const texU = worldX % 1;
        const texV = worldY % 1;
        
        // Sample texture
        const pixel = this.textureManager!.getTexturePixel(texture, Math.abs(texU), Math.abs(texV));
        
        // Apply fog
        const r = Math.floor(pixel.r * fogFactor);
        const g = Math.floor(pixel.g * fogFactor);
        const b = Math.floor(pixel.b * fogFactor);
        
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(x, y, stepX, stepY);
      }
    }
  }
  
  /**
   * Get average color from texture for distant rendering
   */
  private getAverageTextureColor(texture: any): string {
    // Simple sampling of texture center
    if (this.textureManager) {
      const pixel = this.textureManager.getTexturePixel(texture, 0.5, 0.5);
      return `rgb(${Math.floor(pixel.r * 0.6)},${Math.floor(pixel.g * 0.6)},${Math.floor(pixel.b * 0.6)})`;
    }
    return '#1a202c';
  }
  
  /**
   * Apply fog to a color by darkening it rather than making it transparent
   */
  private applyFogToColor(color: string, fogFactor: number): string {
    // Parse hex color
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Apply fog by darkening
    const foggedR = Math.floor(r * fogFactor);
    const foggedG = Math.floor(g * fogFactor);
    const foggedB = Math.floor(b * fogFactor);
    
    return `rgb(${foggedR}, ${foggedG}, ${foggedB})`;
  }
  
  /**
   * Render a sprite at the specified screen position and size
   */
  private renderSprite(
    sprite: { 
      id: string; 
      x: number; 
      y: number; 
      angle: number; 
      classType: ClassType; 
      spriteFrame: any | null;
      size: number;
    },
    screenX: number,
    screenY: number,
    projectedSize: number
  ): void {
    if (!sprite.spriteFrame || projectedSize < 1) {
      return; // No frame or too small to render
    }
    
    this.ctx.save();
    
    // No fog effects for sprites - always fully visible
    this.ctx.globalAlpha = 1.0;
    
    // Calculate sprite rendering size
    const renderSize = Math.max(8, projectedSize); // Minimum size for visibility
    const halfSize = renderSize / 2;
    
    // Render the sprite frame
    if (sprite.spriteFrame.canvas) {
      this.ctx.drawImage(
        sprite.spriteFrame.canvas,
        screenX - halfSize,
        screenY - halfSize,
        renderSize,
        renderSize
      );
    }
    
    this.ctx.restore();
  }
  
  /**
   * Resize the renderer
   */
  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.halfHeight = height / 2;
    this.canvas.width = width;
    this.canvas.height = height;
    
    // Recalculate ray casting parameters
    this.numRays = Math.floor(this.width / 2); // Cast half as many rays
    this.rayWidth = this.width / this.numRays; // Each ray covers multiple pixels
    this.rayAngleStep = (this.fov * Math.PI / 180) / this.numRays;
    this.distanceToProjectionPlane = (this.width / 2) / Math.tan((this.fov / 2) * Math.PI / 180);
  }
} 