/**
 * SimpleSpriteCoordinator - Server → Client sprite rendering flow
 * 
 * Coordinates sprite updates from server game state to client rendering
 * Designed for simple 1v1 arena combat with minimal overhead
 */

import type { ClassType } from '@dueled/shared';

export interface SpriteUpdate {
  id: string;
  type: 'player' | 'projectile' | 'effect';
  spriteType: string;        // 'archer', 'berserker', 'arrow', 'explosion', etc.
  position: { x: number; y: number };
  rotation: number;          // Radians
  scale: { x: number; y: number };
  visible: boolean;
  animationState?: string;   // 'idle', 'walking', 'attacking', 'dying'
  tint?: number;            // Color tint (0xFFFFFF = white)
  alpha?: number;           // Transparency (0-1)
  layer: number;            // Rendering layer (0 = background, higher = foreground)
}

export interface SpriteFrame {
  timestamp: number;
  updates: SpriteUpdate[];
  removedSprites: string[];
}

export interface SpriteCoordinatorConfig {
  maxSprites: number;           // Maximum sprites to track
  updateRate: number;           // Hz - how often to send updates
  batchUpdates: boolean;        // Batch multiple updates together
  deltaOptimization: boolean;   // Only send changed sprites
}

/**
 * SimpleSpriteCoordinator - Manages sprite updates for client rendering
 */
export class SimpleSpriteCoordinator {
  private config: SpriteCoordinatorConfig;
  private lastUpdate: number = 0;
  private frameNumber: number = 0;
  
  // Sprite tracking
  private activeSprites: Map<string, SpriteUpdate> = new Map();
  private lastSentSprites: Map<string, SpriteUpdate> = new Map();
  
  // Update batching
  private pendingUpdates: SpriteUpdate[] = [];
  private pendingRemovals: string[] = [];
  
  constructor(config?: Partial<SpriteCoordinatorConfig>) {
    this.config = {
      maxSprites: 200,
      updateRate: 20, // 20 Hz
      batchUpdates: true,
      deltaOptimization: true,
      ...config
    };
    
    console.log('SimpleSpriteCoordinator initialized');
  }
  
  /**
   * Update player sprite
   */
  updatePlayerSprite(
    playerId: string,
    classType: ClassType,
    position: { x: number; y: number },
    rotation: number,
    animationState: string = 'idle',
    visible: boolean = true
  ): void {
    const sprite: SpriteUpdate = {
      id: `player_${playerId}`,
      type: 'player',
      spriteType: classType,
      position: { ...position },
      rotation,
      scale: { x: 1, y: 1 },
      visible,
      animationState,
      layer: 10 // Players on top of most things
    };
    
    this.updateSprite(sprite);
  }
  
  /**
   * Update projectile sprite
   */
  updateProjectileSprite(
    projectileId: string,
    projectileType: string,
    position: { x: number; y: number },
    rotation: number,
    visible: boolean = true
  ): void {
    const sprite: SpriteUpdate = {
      id: `projectile_${projectileId}`,
      type: 'projectile',
      spriteType: projectileType,
      position: { ...position },
      rotation,
      scale: { x: 1, y: 1 },
      visible,
      layer: 8 // Projectiles above background, below players
    };
    
    this.updateSprite(sprite);
  }
  
  /**
   * Add effect sprite (explosions, impacts, etc.)
   */
  addEffectSprite(
    effectId: string,
    effectType: string,
    position: { x: number; y: number },
    scale: { x: number; y: number } = { x: 1, y: 1 },
    duration: number = 1000 // Auto-remove after duration
  ): void {
    const sprite: SpriteUpdate = {
      id: `effect_${effectId}`,
      type: 'effect',
      spriteType: effectType,
      position: { ...position },
      rotation: 0,
      scale: { ...scale },
      visible: true,
      layer: 15 // Effects on top
    };
    
    this.updateSprite(sprite);
    
    // Auto-remove after duration
    setTimeout(() => {
      this.removeSprite(sprite.id);
    }, duration);
  }
  
  /**
   * Update or add sprite
   */
  private updateSprite(sprite: SpriteUpdate): void {
    // Check sprite limits
    if (!this.activeSprites.has(sprite.id) && this.activeSprites.size >= this.config.maxSprites) {
      console.warn(`Sprite limit reached (${this.config.maxSprites}), skipping update for ${sprite.id}`);
      return;
    }
    
    this.activeSprites.set(sprite.id, sprite);
    
    if (this.config.batchUpdates) {
      // Add to pending updates
      const existingIndex = this.pendingUpdates.findIndex(s => s.id === sprite.id);
      if (existingIndex >= 0) {
        this.pendingUpdates[existingIndex] = sprite;
      } else {
        this.pendingUpdates.push(sprite);
      }
    }
  }
  
  /**
   * Remove sprite
   */
  removeSprite(spriteId: string): void {
    const removed = this.activeSprites.delete(spriteId);
    this.lastSentSprites.delete(spriteId);
    
    if (removed) {
      if (this.config.batchUpdates) {
        this.pendingRemovals.push(spriteId);
        // Remove from pending updates if present
        const updateIndex = this.pendingUpdates.findIndex(s => s.id === spriteId);
        if (updateIndex >= 0) {
          this.pendingUpdates.splice(updateIndex, 1);
        }
      }
    }
  }
  
  /**
   * Generate sprite frame for clients
   */
  generateSpriteFrame(): SpriteFrame | null {
    const now = Date.now();
    const updateInterval = 1000 / this.config.updateRate;
    
    // Check if enough time has passed
    if (now - this.lastUpdate < updateInterval) {
      return null;
    }
    
    this.lastUpdate = now;
    this.frameNumber++;
    
    let updates: SpriteUpdate[] = [];
    let removedSprites: string[] = [];
    
    if (this.config.batchUpdates) {
      // Use batched updates
      updates = [...this.pendingUpdates];
      removedSprites = [...this.pendingRemovals];
      
      // Clear pending
      this.pendingUpdates = [];
      this.pendingRemovals = [];
    } else {
      // Send all sprites every frame
      updates = Array.from(this.activeSprites.values());
    }
    
    // Delta optimization - only send changed sprites
    if (this.config.deltaOptimization && this.config.batchUpdates) {
      updates = updates.filter(sprite => {
        const lastSent = this.lastSentSprites.get(sprite.id);
        if (!lastSent) return true; // New sprite
        
        // Check if sprite has changed significantly
        return this.hasSpriteChanged(sprite, lastSent);
      });
    }
    
    // Update last sent sprites
    for (const sprite of updates) {
      this.lastSentSprites.set(sprite.id, { ...sprite });
    }
    
    // Only create frame if there are updates
    if (updates.length === 0 && removedSprites.length === 0) {
      return null;
    }
    
    return {
      timestamp: now,
      updates,
      removedSprites
    };
  }
  
  /**
   * Check if sprite has changed enough to warrant update
   */
  private hasSpriteChanged(current: SpriteUpdate, previous: SpriteUpdate): boolean {
    const positionThreshold = 0.1; // 0.1 unit movement
    const rotationThreshold = 0.05; // ~3 degree rotation
    
    // Position change
    const positionDelta = Math.sqrt(
      Math.pow(current.position.x - previous.position.x, 2) +
      Math.pow(current.position.y - previous.position.y, 2)
    );
    
    if (positionDelta > positionThreshold) return true;
    
    // Rotation change
    const rotationDelta = Math.abs(current.rotation - previous.rotation);
    if (rotationDelta > rotationThreshold) return true;
    
    // State changes
    if (current.visible !== previous.visible) return true;
    if (current.animationState !== previous.animationState) return true;
    if (current.alpha !== previous.alpha) return true;
    if (current.tint !== previous.tint) return true;
    
    return false;
  }
  
  /**
   * Clear all sprites
   */
  clearAllSprites(): void {
    const spriteIds = Array.from(this.activeSprites.keys());
    
    this.activeSprites.clear();
    this.lastSentSprites.clear();
    this.pendingUpdates = [];
    
    if (this.config.batchUpdates) {
      this.pendingRemovals.push(...spriteIds);
    }
  }
  
  /**
   * Get sprite by ID
   */
  getSprite(spriteId: string): SpriteUpdate | null {
    return this.activeSprites.get(spriteId) || null;
  }
  
  /**
   * Get all sprites of type
   */
  getSpritesByType(type: 'player' | 'projectile' | 'effect'): SpriteUpdate[] {
    return Array.from(this.activeSprites.values()).filter(sprite => sprite.type === type);
  }
  
  /**
   * Get sprite statistics
   */
  getStats(): {
    activeSprites: number;
    maxSprites: number;
    updateRate: number;
    frameNumber: number;
    lastUpdate: number;
    pendingUpdates: number;
    pendingRemovals: number;
  } {
    return {
      activeSprites: this.activeSprites.size,
      maxSprites: this.config.maxSprites,
      updateRate: this.config.updateRate,
      frameNumber: this.frameNumber,
      lastUpdate: this.lastUpdate,
      pendingUpdates: this.pendingUpdates.length,
      pendingRemovals: this.pendingRemovals.length
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SpriteCoordinatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('SimpleSpriteCoordinator config updated:', this.config);
  }
  
  /**
   * Reset coordinator state
   */
  reset(): void {
    this.clearAllSprites();
    this.lastUpdate = 0;
    this.frameNumber = 0;
    console.log('SimpleSpriteCoordinator reset');
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.reset();
    console.log('SimpleSpriteCoordinator destroyed');
  }
}