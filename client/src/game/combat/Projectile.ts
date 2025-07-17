/**
 * Projectile System for Dueled
 * 
 * Handles all projectile types including arrows, ice shards, fire bombs, etc.
 * Supports 4x4 sprite sheet animations with continuous 16-frame animation loop.
 * 
 * 4x4 Sprite Sheet Format:
 * Continuous animation through all 16 frames (0-15) in sequence
 * Each frame: 48×48 pixels
 * Total sheet: 192×192 pixels
 */

import type { Vector2, ClassType, WeaponEffect } from '@dueled/shared';

export interface ProjectileConfig {
  id: string;
  type: 'arrow' | 'ice_shard' | 'fire_bomb' | 'magic_missile';
  damage: number;
  speed: number; // pixels per second
  range: number; // max distance in tiles
  size: { width: number; height: number }; // hitbox size
  piercing: boolean;
  homing: boolean;
  armorPenetration: number; // percentage (0-100)
  effects: WeaponEffect[];
  spriteSheet?: {
    path: string;
    frameWidth: number; // 48 pixels
    frameHeight: number; // 48 pixels  
    totalFrames: number; // 16 frames total
  };
}

export interface ProjectileState {
  id: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  distanceTraveled: number;
  isActive: boolean;
  ownerId: string;
  targetId?: string; // For homing projectiles
  createdAt: number;
  lastUpdate: number;
}

export class Projectile {
  private config: ProjectileConfig;
  private state: ProjectileState;
  private sprite: HTMLImageElement | null = null;
  private animationFrame: number = 0;
  private animationTime: number = 0;
  private animationSpeed: number = 100; // ms per frame
  
  constructor(config: ProjectileConfig, initialState: ProjectileState) {
    this.config = config;
    this.state = { ...initialState };
    
    if (config.spriteSheet) {
      this.loadSprite(config.spriteSheet.path);
    }
  }

  /**
   * Load sprite sheet for projectile
   */
  private async loadSprite(path: string): Promise<void> {
    this.sprite = new Image();
    this.sprite.onload = () => {
      console.log(`✅ Projectile sprite loaded: ${path}`);
    };
    this.sprite.onerror = () => {
      console.warn(`❌ Failed to load projectile sprite: ${path}`);
    };
    this.sprite.src = path;
  }

  /**
   * Update projectile physics and animation
   */
  public update(deltaTime: number, targets: Map<string, Vector2>, walls: number[][]): boolean {
    if (!this.state.isActive) {
      console.log(`🏹 Projectile ${this.state.id} is not active, skipping update`);
      return false;
    }
    
    const deltaSeconds = deltaTime / 1000;
    this.state.lastUpdate = Date.now();
    
    // Update homing behavior
    if (this.config.homing && this.state.targetId) {
      this.updateHoming(targets, deltaSeconds);
    }
    
    // Update position - velocity is already in tiles per second from server
    const moveDistance = deltaSeconds; // Only deltaSeconds, no speed multiplier
    const newX = this.state.position.x + this.state.velocity.x * moveDistance;
    const newY = this.state.position.y + this.state.velocity.y * moveDistance;
    
    // Check wall collisions
    if (this.checkWallCollision(newX, newY, walls)) {
      console.log(`🏹 Projectile ${this.state.id} hit wall at (${newX.toFixed(1)}, ${newY.toFixed(1)}), deactivating`);
      this.onImpact();
      return false;
    }
    
    // Update position
    this.state.position.x = newX;
    this.state.position.y = newY;
    this.state.distanceTraveled += Math.sqrt(
      (this.state.velocity.x * moveDistance) ** 2 + 
      (this.state.velocity.y * moveDistance) ** 2
    );
    
    // Update rotation based on velocity
    this.state.rotation = Math.atan2(this.state.velocity.y, this.state.velocity.x);
    
    // Check range limit
    const maxDistance = this.config.range;
    if (this.state.distanceTraveled >= maxDistance) {
      console.log(`🏹 Projectile ${this.state.id} exceeded range: ${this.state.distanceTraveled.toFixed(1)} >= ${maxDistance.toFixed(1)}, deactivating`);
      this.state.isActive = false;
      return false;
    }
    
    // Update animation
    this.updateAnimation(deltaTime);
    
    return true;
  }

  /**
   * Update homing behavior for special projectiles
   */
  private updateHoming(targets: Map<string, Vector2>, deltaTime: number): void {
    if (!this.state.targetId) return;
    
    const targetPos = targets.get(this.state.targetId);
    if (!targetPos) {
      // Target lost, continue in current direction
      this.state.targetId = undefined;
      return;
    }
    
    // Calculate direction to target
    const dx = targetPos.x - this.state.position.x;
    const dy = targetPos.y - this.state.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Homing strength (how quickly it turns toward target)
      const homingStrength = 2.0; // radians per second
      const targetAngle = Math.atan2(dy, dx);
      const currentAngle = Math.atan2(this.state.velocity.y, this.state.velocity.x);
      
      // Calculate angle difference
      let angleDiff = targetAngle - currentAngle;
      
      // Normalize angle difference to [-π, π]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      // Apply homing correction
      const correctionAngle = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), homingStrength * deltaTime);
      const newAngle = currentAngle + correctionAngle;
      
      // Update velocity direction (maintain speed)
      const speed = Math.sqrt(this.state.velocity.x * this.state.velocity.x + this.state.velocity.y * this.state.velocity.y);
      this.state.velocity.x = Math.cos(newAngle) * speed;
      this.state.velocity.y = Math.sin(newAngle) * speed;
    }
  }

  /**
   * Check collision with walls
   */
  private checkWallCollision(x: number, y: number, walls: number[][]): boolean {
    const tileX = Math.floor(x);
    const tileY = Math.floor(y);
    
    // Check bounds first
    if (tileY < 0 || tileY >= walls.length || tileX < 0 || tileX >= walls[0].length) {
      console.log(`🏹 Projectile ${this.state.id} out of bounds at tile (${tileX}, ${tileY}), pixel (${x.toFixed(1)}, ${y.toFixed(1)})`);
      return true; // Out of bounds = collision
    }
    
    const tileValue = walls[tileY][tileX];
    if (tileValue !== 0) {
      console.log(`🏹 Projectile ${this.state.id} hit wall tile (${tileX}, ${tileY}) = ${tileValue}, pixel (${x.toFixed(1)}, ${y.toFixed(1)})`);
      return true; // Wall collision
    }
    
    return false; // No collision
  }

  /**
   * Check collision with a circular target
   */
  public checkTargetCollision(targetPos: Vector2, targetRadius: number): boolean {
    const dx = this.state.position.x - targetPos.x;
    const dy = this.state.position.y - targetPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const projectileRadius = Math.max(this.config.size.width, this.config.size.height) / 2;
    return distance <= (targetRadius + projectileRadius);
  }

  /**
   * Handle projectile impact
   */
  private onImpact(): void {
    this.state.isActive = false;
    
    console.log(`💥 Projectile ${this.config.type} impact at (${this.state.position.x.toFixed(1)}, ${this.state.position.y.toFixed(1)})`);
  }

  /**
   * Update sprite animation (continuous 16-frame loop)
   */
  private updateAnimation(deltaTime: number): void {
    this.animationTime += deltaTime;
    
    if (this.animationTime >= this.animationSpeed) {
      this.animationTime = 0;
      
      // Cycle through all 16 frames (0-15)
      this.animationFrame = (this.animationFrame + 1) % 16;
    }
  }

  /**
   * Render projectile using sprite sheet
   */
  public render(ctx: CanvasRenderingContext2D, cameraOffset: Vector2): void {
    if (!this.state.isActive || !this.sprite || !this.sprite.complete) return;
    
    const screenX = this.state.position.x - cameraOffset.x;
    const screenY = this.state.position.y - cameraOffset.y;
    
    ctx.save();
    
    // Transform for rotation
    ctx.translate(screenX, screenY);
    ctx.rotate(this.state.rotation);
    
    if (this.config.spriteSheet) {
      // Calculate source coordinates in 4x4 grid
      const frameWidth = this.config.spriteSheet.frameWidth;
      const frameHeight = this.config.spriteSheet.frameHeight;
      const col = this.animationFrame % 4;
      const row = Math.floor(this.animationFrame / 4);
      
      const srcX = col * frameWidth;
      const srcY = row * frameHeight;
      
      // Draw sprite frame
      ctx.drawImage(
        this.sprite,
        srcX, srcY, frameWidth, frameHeight,
        -frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight
      );
    } else {
      // Fallback: simple colored rectangle
      const color = this.getProjectileColor();
      ctx.fillStyle = color;
      ctx.fillRect(
        -this.config.size.width / 2,
        -this.config.size.height / 2,
        this.config.size.width,
        this.config.size.height
      );
    }
    
    // Add special effects for special projectiles
    if (this.config.homing && this.state.targetId) {
      this.renderHomingEffect(ctx);
    }
    
    if (this.config.piercing) {
      this.renderPiercingEffect(ctx);
    }
    
    ctx.restore();
  }

  /**
   * Render homing effect (glowing trail)
   */
  private renderHomingEffect(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#8b5cf6'; // Purple glow
    ctx.lineWidth = 3;
    ctx.shadowColor = '#8b5cf6';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Render piercing effect (blue glow)
   */
  private renderPiercingEffect(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#3b82f6'; // Blue glow
    ctx.lineWidth = 2;
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Get projectile color for fallback rendering
   */
  private getProjectileColor(): string {
    switch (this.config.type) {
      case 'arrow': return '#8b4513'; // Brown
      case 'ice_shard': return '#60a5fa'; // Light blue
      case 'fire_bomb': return '#ef4444'; // Red
      case 'magic_missile': return '#8b5cf6'; // Purple
      default: return '#ffffff'; // White
    }
  }

  // Getters
  public getId(): string { return this.state.id; }
  public getPosition(): Vector2 { return { ...this.state.position }; }
  public getOwnerId(): string { return this.state.ownerId; }
  public getConfig(): ProjectileConfig { return this.config; }
  public getState(): ProjectileState { return { ...this.state }; }
  public isActive(): boolean { return this.state.isActive; }
  
  // Setters
  public setTarget(targetId: string): void { this.state.targetId = targetId; }
  public deactivate(): void { this.state.isActive = false; }
  
  /**
   * Update state from server data (for network synchronization)
   */
  public updateFromServer(serverData: { position: Vector2; velocity: Vector2; rotation: number }): void {
    this.state.position = { ...serverData.position };
    this.state.velocity = { ...serverData.velocity };
    this.state.rotation = serverData.rotation;
    this.state.lastUpdate = Date.now();
  }
} 