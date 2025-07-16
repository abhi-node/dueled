/**
 * Raycaster - Core ray-casting engine for Doom-style rendering
 * Handles the ray casting calculations and rendering of the 3D view
 */

import type { Vector2 } from '@dueled/shared';
import type { SpriteRenderer } from './SpriteRenderer';

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
  
  // Player state
  private playerX: number = 5;
  private playerY: number = 5;
  private playerAngle: number = 0; // In radians
  private playerPitch: number = 0; // Camera pitch in radians (up/down looking)
  
  // Ray casting settings
  private numRays: number;
  private rayAngleStep: number;
  
  // Performance optimization
  private halfHeight: number;
  private distanceToProjectionPlane: number;
  
  // Camera pitch settings
  private maxPitch: number = Math.PI / 3; // 60 degrees max pitch up/down
  
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
    
    // Calculate ray casting parameters
    this.numRays = this.width;
    this.rayAngleStep = (this.fov * Math.PI / 180) / this.numRays;
    this.distanceToProjectionPlane = (this.width / 2) / Math.tan((this.fov / 2) * Math.PI / 180);
    
    // Set sprite renderer reference
    this.spriteRenderer = spriteRenderer || null;
  }
  
  /**
   * Cast a single ray and return collision information
   */
  private castRay(angle: number, map: number[][]): RayResult | null {
    const rayDirX = Math.cos(angle);
    const rayDirY = Math.sin(angle);
    
    // Current position
    let x = this.playerX;
    let y = this.playerY;
    
    // Step size for ray marching
    const stepSize = 0.01;
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
  private debugFrameCount: number = 0;
  
  // Sprite renderer reference
  private spriteRenderer: SpriteRenderer | null = null;
  
  /**
   * Set sprite renderer reference
   */
  public setSpriteRenderer(spriteRenderer: SpriteRenderer): void {
    this.spriteRenderer = spriteRenderer;
  }
  
  /**
   * Add or update another player
   */
  public updateOtherPlayer(playerId: string, x: number, y: number, color: string = '#ff0000'): void {
    this.otherPlayers.set(playerId, { x, y, color });
    console.log(`Updated player ${playerId} at position (${x.toFixed(2)}, ${y.toFixed(2)}) with color ${color}`);
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
    // Pre-calculate pitch offset for efficiency
    const pitchOffset = this.playerPitch * this.distanceToProjectionPlane;
    
    // Clear canvas efficiently
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Draw simple sky and floor
    const horizonY = this.halfHeight + pitchOffset;
    
    // Sky (ceiling)
    if (horizonY > 0) {
      this.ctx.fillStyle = '#0f172a';
      this.ctx.fillRect(0, 0, this.width, Math.min(this.height, horizonY));
    }
    
    // Floor
    if (horizonY < this.height) {
      this.ctx.fillStyle = '#1a202c';
      this.ctx.fillRect(0, Math.max(0, horizonY), this.width, this.height - Math.max(0, horizonY));
    }
    
    // Collect all objects to render (walls and players)
    const renderObjects: { distance: number; render: () => void }[] = [];
    
    // Cast rays for walls
    const startAngle = this.playerAngle - (this.fov / 2) * Math.PI / 180;
    
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
        
        const fogFactor = Math.max(0, 1 - ray.distance / this.viewDistance);
        
        renderObjects.push({
          distance: ray.distance,
          render: () => {
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = fogFactor;
            this.ctx.fillRect(i, wallTop, 1, wallBottom - wallTop);
            this.ctx.globalAlpha = 1;
          }
        });
      }
    }
    
    // Add other players to render list
    this.debugFrameCount++;
    const shouldDebug = this.debugFrameCount % 300 === 0; // Debug every 300 frames (5 seconds at 60fps)
    
    if (shouldDebug) {
      console.log(`Rendering with ${this.otherPlayers.size} other players`);
    }
    
    const otherPlayersArray = Array.from(this.otherPlayers.entries());
    for (const [playerId, player] of otherPlayersArray) {
      const dx = player.x - this.playerX;
      const dy = player.y - this.playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (shouldDebug) {
        console.log(`Player ${playerId}: distance=${distance.toFixed(2)}, viewDistance=${this.viewDistance}`);
      }
      
      // Skip if too far
      if (distance > this.viewDistance) {
        if (shouldDebug) console.log(`Player ${playerId} too far (${distance.toFixed(2)} > ${this.viewDistance})`);
        continue;
      }
      
      // Check line of sight - skip if blocked by walls
      const hasLOS = this.hasLineOfSight(this.playerX, this.playerY, player.x, player.y, map);
      if (shouldDebug) {
        console.log(`Player ${playerId}: line of sight = ${hasLOS}`);
      }
      if (!hasLOS) {
        if (shouldDebug) console.log(`Player ${playerId} blocked by walls`);
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
      if (shouldDebug) {
        console.log(`Player ${playerId}: relativeAngle=${(relativeAngle * 180 / Math.PI).toFixed(1)}°, halfFov=${(halfFov * 180 / Math.PI).toFixed(1)}°`);
      }
      if (Math.abs(relativeAngle) > halfFov) {
        if (shouldDebug) console.log(`Player ${playerId} outside field of view`);
        continue;
      }
      
      // Calculate screen position
      const screenX = this.width / 2 + (relativeAngle / halfFov) * (this.width / 2);
      const projectedPlayerHeight = (0.5 / distance) * this.distanceToProjectionPlane; // Reduced from 0.8 to 0.5 to make smaller
      
      // Apply pitch offset to player positioning - move sprites down to ground level
      const playerCenterY = this.halfHeight + pitchOffset + projectedPlayerHeight * 0.25; // Move down to ground level
      const playerTop = playerCenterY - projectedPlayerHeight / 2;
      const playerWidth = projectedPlayerHeight * 0.6; // Make player narrower than tall
      
      const fogFactor = Math.max(0, 1 - distance / this.viewDistance);
      
      if (shouldDebug) {
        console.log(`Adding player ${playerId} to render list at screenX=${screenX.toFixed(1)}, distance=${distance.toFixed(2)}`);
      }
      
      renderObjects.push({
        distance,
        render: () => {
          // Try to render sprite if sprite renderer is available
          let spriteRendered = false;
          if (this.spriteRenderer) {
            const spriteFrame = this.spriteRenderer.getPlayerSpriteFrame(playerId);
            if (spriteFrame) {
              // Render sprite with improved positioning
              const spriteSize = projectedPlayerHeight;
              const spriteX = screenX - spriteSize / 2;
              const spriteY = playerCenterY - spriteSize / 2;
              
              this.ctx.globalAlpha = fogFactor;
              this.ctx.drawImage(
                spriteFrame.canvas,
                spriteX,
                spriteY,
                spriteSize,
                spriteSize
              );
              this.ctx.globalAlpha = 1;
              spriteRendered = true;
              
              if (shouldDebug) {
                console.log(`🎨 Rendered sprite for player ${playerId} at (${spriteX.toFixed(1)}, ${spriteY.toFixed(1)}) size ${spriteSize.toFixed(1)}`);
              }
            } else {
              if (shouldDebug) {
                console.log(`❌ No sprite frame available for player ${playerId}`);
              }
            }
          } else {
            if (shouldDebug) {
              console.log(`❌ No sprite renderer available for player ${playerId}`);
            }
          }
          
          // Fallback to circle rendering if no sprite available
          if (!spriteRendered) {
            const radius = projectedPlayerHeight / 2;
            this.ctx.fillStyle = player.color;
            this.ctx.globalAlpha = fogFactor;
            
            // Draw sphere shadow/outline for better visibility
            this.ctx.beginPath();
            this.ctx.arc(screenX, playerCenterY, radius + 2, 0, Math.PI * 2);
            this.ctx.fillStyle = '#000000';
            this.ctx.fill();
            
            // Draw main sphere
            this.ctx.beginPath();
            this.ctx.arc(screenX, playerCenterY, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = player.color;
            this.ctx.fill();
            
            // Add highlight for 3D effect
            const gradient = this.ctx.createRadialGradient(
              screenX - radius/3, playerCenterY - radius/3, 0,
              screenX, playerCenterY, radius
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
      obj.render();
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
    
    // Check collision
    const mapX = Math.floor(newX);
    const mapY = Math.floor(newY);
    
    if (mapX >= 0 && mapX < map[0].length && mapY >= 0 && mapY < map.length) {
      if (map[mapY][Math.floor(this.playerX)] === 0) {
        this.playerY = newY;
      }
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
   * Resize the renderer
   */
  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.halfHeight = height / 2;
    this.canvas.width = width;
    this.canvas.height = height;
    
    // Recalculate ray casting parameters
    this.numRays = this.width;
    this.rayAngleStep = (this.fov * Math.PI / 180) / this.numRays;
    this.distanceToProjectionPlane = (this.width / 2) / Math.tan((this.fov / 2) * Math.PI / 180);
  }
} 