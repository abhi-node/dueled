/**
 * Raycaster - Core ray-casting engine for Doom-style rendering
 * Handles the ray casting calculations and rendering of the 3D view
 */

import type { SpriteRenderer } from './SpriteRenderer';
import { TextureManager } from './TextureManager';
import type { FlexibleMap } from '../world/FlexibleMap';

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
  
  // Player state - start at a safe position
  private playerX: number = 15.5;
  private playerY: number = 15.5;
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
  }
  
  /**
   * Cast a single ray and return collision information
   */
  private castRay(angle: number, map: number[][]): RayResult | null {
    try {
      return this.castGridRay(angle, map);
    } catch (error) {
      // Silently fail to avoid console spam
      return null;
    }
  }
  
  /**
   * Cast ray using grid-based system
   */
  private castGridRay(angle: number, map: number[][]): RayResult | null {
    // Validate map
    if (!map || map.length === 0 || !map[0]) {
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
      
      if (mapX < 0 || mapX >= map[0].length || mapY < 0 || mapY >= map.length) {
        break;
      }
      
      // Check for wall collision
      if (map[mapY][mapX] > 0) {
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
  
  // Other players
  private otherPlayers: Map<string, { x: number; y: number; color: string }> = new Map();
  
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
   * Add or update another player
   */
  public updateOtherPlayer(playerId: string, x: number, y: number, color: string = '#ff0000'): void {
    this.otherPlayers.set(playerId, { x, y, color });
    // Removed console.log for performance
  }

  /**
   * Check if there's a clear line of sight between two points using DDA algorithm
   */
  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number, map: number[][]): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // If very close, always visible
    if (distance < 0.5) return true;
    
    // Step size - make it a bit less strict for better gameplay
    const steps = Math.ceil(distance * 5); // Reduced from 10 to 5 for less strict checking
    const stepX = dx / steps;
    const stepY = dy / steps;
    
    for (let i = 1; i < steps; i++) { // Skip first and last points for edge cases
      const currentX = x1 + stepX * i;
      const currentY = y1 + stepY * i;
      
      const mapX = Math.floor(currentX);
      const mapY = Math.floor(currentY);
      
      // Check bounds
      if (mapX < 0 || mapX >= map[0].length || mapY < 0 || mapY >= map.length) {
        return false;
      }
      
      // Check for wall
      if (map[mapY][mapX] !== 0) {
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
    try {
      // Validate map
      if (!map || map.length === 0) {
        console.error('Invalid map provided to render');
        return;
      }
      
      // Pre-calculate pitch offset for efficiency
      const pitchOffset = this.playerPitch * this.distanceToProjectionPlane;
      
      // Clear canvas efficiently
      this.ctx.fillStyle = '#1e293b';
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      // Render floor and ceiling with textures
      this.renderFloorAndCeiling(map);
      
      // Collect all objects to render (walls and players)
      const renderObjects: { distance: number; render: () => void }[] = [];
      
      // Cast rays for walls
      const startAngle = this.playerAngle - (this.fov / 2) * Math.PI / 180;
      
      // Debug logging removed for performance
      
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
    
    // Add other players to render list
    // Debug logging removed for performance
    
    const otherPlayersArray = Array.from(this.otherPlayers.entries());
    for (const [playerId, player] of otherPlayersArray) {
      const dx = player.x - this.playerX;
      const dy = player.y - this.playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Skip if too far
      if (distance > this.viewDistance) {
        continue;
      }
      
      // Check line of sight - skip if blocked by walls
      const hasLOS = this.hasLineOfSight(this.playerX, this.playerY, player.x, player.y, map);
      if (!hasLOS) {
        continue;
      }
      
      // Calculate angle to player
      const angleToPlayer = Math.atan2(dy, dx);
      let relativeAngle = angleToPlayer - this.playerAngle;
      
      // Normalize angle to [-PI, PI]
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
      
      // Check if player is in field of view
      const halfFov = (this.fov / 2) * Math.PI / 180;
      if (Math.abs(relativeAngle) > halfFov) {
        continue;
      }
      
      // Calculate screen position
      const screenX = this.width / 2 + (relativeAngle / halfFov) * (this.width / 2);
      const projectedPlayerHeight = (0.8 / distance) * this.distanceToProjectionPlane; // Balanced height
      
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
              const spriteFrame = this.spriteRenderer.getPlayerSpriteFrame(playerId);
              if (spriteFrame && spriteFrame.canvas) {
                // Validate sprite frame canvas
                if (spriteFrame.canvas.width > 0 && spriteFrame.canvas.height > 0) {
                  // Render sprite with stable positioning
                  const spriteSize = Math.max(1, projectedPlayerHeight); // Ensure positive size
                  const spriteX = screenX - spriteSize / 2;
                  // Position sprite so bottom edge is at ground level
                  const spriteY = playerCenterY - spriteSize / 2;
                  
                  // Validate screen position
                  if (spriteX < this.width && spriteX + spriteSize > 0 && 
                      spriteY < this.height && spriteY + spriteSize > 0) {
                    this.ctx.globalAlpha = Math.max(0, Math.min(1, fogFactor));
                    try {
                      this.ctx.drawImage(
                        spriteFrame.canvas,
                        spriteX,
                        spriteY,
                        spriteSize,
                        spriteSize
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
    
    // Sort by distance (far to near) and render
    renderObjects.sort((a, b) => b.distance - a.distance);
    for (const obj of renderObjects) {
      try {
        obj.render();
      } catch (renderError) {
        // Silently fail to avoid console spam
      }
    }
    } catch (error) {
      // Silently fail and attempt basic rendering as fallback
      this.ctx.fillStyle = '#1e293b';
      this.ctx.fillRect(0, 0, this.width, this.height);
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
    
    if (mapX >= 0 && mapX < map[0].length && mapY >= 0 && mapY < map.length) {
      // Check Y movement
      if (map[mapY][Math.floor(this.playerX)] === 0) {
        this.playerY = newY;
      }
      
      // Check X movement
      if (map[Math.floor(this.playerY)][mapX] === 0) {
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
      const horizonY = this.halfHeight + pitchOffset;
      
      // OPTIMIZED: Using solid colors instead of textures for better performance
      // Ceiling
      if (horizonY > 0) {
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.width, horizonY);
      }
      // Floor
      if (horizonY < this.height) {
        this.ctx.fillStyle = '#1a202c';
        this.ctx.fillRect(0, horizonY, this.width, this.height - horizonY);
      }
    } catch (error) {
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