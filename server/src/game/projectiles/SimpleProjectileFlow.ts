/**
 * SimpleProjectileFlow - Client shoots → Server validates → Server broadcasts
 * 
 * Implements server-authoritative projectile system with client prediction
 * Designed for responsive Archer vs Berserker combat
 */

import { SimpleProjectiles, type ProjectileData } from './SimpleProjectiles.js';
import { BasicCombat } from '../../services/game/BasicCombat.js';
import { ArenaMap, type ArenaConfig } from '../arena/ArenaMap.js';
import type { SimplePlayer } from '../../services/game/SimpleGameLoop.js';
import { logger } from '../../utils/logger.js';

export interface ProjectileRequest {
  playerId: string;
  projectileType: string;
  startPosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  timestamp: number;
  sequence: number;          // For client prediction reconciliation
}

export interface ProjectileHit {
  projectileId: string;
  targetId: string;
  hitPosition: { x: number; y: number };
  damage: number;
  timestamp: number;
}

export interface ProjectileValidation {
  valid: boolean;
  reason?: string;
  correctedPosition?: { x: number; y: number };
  correctedTarget?: { x: number; y: number };
}

export interface ProjectileFlowConfig {
  maxProjectilesPerPlayer: number;    // Anti-spam protection
  maxRange: number;                   // Maximum projectile range
  validationTolerance: number;        // Position validation tolerance
  lagCompensationMs: number;          // Lag compensation window
  hitValidationEnabled: boolean;      // Server-side hit validation
}

export interface ProjectileFlowCallbacks {
  onProjectileCreated?: (projectile: ProjectileData) => void;
  onProjectileHit?: (hit: ProjectileHit) => void;
  onProjectileDestroyed?: (projectileId: string, reason: string) => void;
  onProjectileRejected?: (playerId: string, reason: string) => void;
}

/**
 * SimpleProjectileFlow - Server-authoritative projectile management
 */
export class SimpleProjectileFlow {
  private simpleProjectiles: SimpleProjectiles;
  private basicCombat: BasicCombat;
  private config: ProjectileFlowConfig;
  private callbacks: ProjectileFlowCallbacks = {};
  
  // Player projectile tracking
  private playerProjectiles: Map<string, Set<string>> = new Map(); // playerId -> projectileIds
  private projectileOwners: Map<string, string> = new Map(); // projectileId -> playerId
  
  // Validation state
  private lastPlayerShot: Map<string, number> = new Map(); // playerId -> timestamp
  private currentArena: ArenaConfig | null = null;
  
  constructor(
    simpleProjectiles: SimpleProjectiles,
    basicCombat: BasicCombat,
    config?: Partial<ProjectileFlowConfig>
  ) {
    this.simpleProjectiles = simpleProjectiles;
    this.basicCombat = basicCombat;
    
    this.config = {
      maxProjectilesPerPlayer: 5,
      maxRange: 30.0,
      validationTolerance: 2.0,
      lagCompensationMs: 150,
      hitValidationEnabled: true,
      ...config
    };
    
    console.log('SimpleProjectileFlow initialized');
  }
  
  /**
   * Set callbacks for projectile events
   */
  setCallbacks(callbacks: ProjectileFlowCallbacks): void {
    this.callbacks = { ...callbacks };
  }
  
  /**
   * Set current arena for validation
   */
  setArena(arena: ArenaConfig | null): void {
    this.currentArena = arena;
  }
  
  /**
   * Process projectile request from client
   */
  processProjectileRequest(
    request: ProjectileRequest,
    players: Map<string, SimplePlayer>
  ): { success: boolean; projectileId?: string; reason?: string } {
    // Get player
    const player = players.get(request.playerId);
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }
    
    // Validate request
    const validation = this.validateProjectileRequest(request, player);
    if (!validation.valid) {
      if (this.callbacks.onProjectileRejected) {
        this.callbacks.onProjectileRejected(request.playerId, validation.reason || 'Invalid request');
      }
      return { success: false, reason: validation.reason };
    }
    
    // Create projectile
    const projectileId = this.createProjectileFromRequest(request, player, validation);
    
    if (projectileId) {
      // Track projectile ownership
      this.trackPlayerProjectile(request.playerId, projectileId);
      
      // Update last shot time
      this.lastPlayerShot.set(request.playerId, Date.now());
      
      if (this.callbacks.onProjectileCreated) {
        const projectileData = this.simpleProjectiles.getProjectile(projectileId);
        if (projectileData) {
          this.callbacks.onProjectileCreated(projectileData);
        }
      }
      
      logger.debug(`Created projectile ${projectileId} for player ${request.playerId}`);
      return { success: true, projectileId };
    }
    
    return { success: false, reason: 'Failed to create projectile' };
  }
  
  /**
   * Validate projectile request
   */
  private validateProjectileRequest(
    request: ProjectileRequest,
    player: SimplePlayer
  ): ProjectileValidation {
    // Check player state
    if (!player.isAlive) {
      return { valid: false, reason: 'Player is dead' };
    }
    
    // Check projectile limits
    const playerProjectileCount = this.playerProjectiles.get(request.playerId)?.size || 0;
    if (playerProjectileCount >= this.config.maxProjectilesPerPlayer) {
      return { valid: false, reason: 'Too many active projectiles' };
    }
    
    // Check rate limiting (basic spam protection)
    const lastShot = this.lastPlayerShot.get(request.playerId) || 0;
    const timeSinceLastShot = Date.now() - lastShot;
    if (timeSinceLastShot < 100) { // 100ms minimum between shots
      return { valid: false, reason: 'Shooting too fast' };
    }
    
    // Validate starting position (lag compensation)
    const positionValidation = this.validateStartPosition(request, player);
    if (!positionValidation.valid) {
      return positionValidation;
    }
    
    // Validate range
    const range = Math.sqrt(
      Math.pow(request.targetPosition.x - request.startPosition.x, 2) +
      Math.pow(request.targetPosition.y - request.startPosition.y, 2)
    );
    
    if (range > this.config.maxRange) {
      return { valid: false, reason: 'Target out of range' };
    }
    
    // Validate arena bounds
    if (this.currentArena) {
      if (request.targetPosition.x < 0 || request.targetPosition.x > this.currentArena.size.x ||
          request.targetPosition.y < 0 || request.targetPosition.y > this.currentArena.size.y) {
        return { valid: false, reason: 'Target outside arena' };
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Validate starting position with lag compensation
   */
  private validateStartPosition(
    request: ProjectileRequest,
    player: SimplePlayer
  ): ProjectileValidation {
    const lagCompensation = this.config.lagCompensationMs;
    const timeDelta = Date.now() - request.timestamp;
    
    // Allow some tolerance for network lag
    if (timeDelta > lagCompensation * 2) {
      return { valid: false, reason: 'Request too old' };
    }
    
    // Check if start position is reasonably close to player position
    const distance = Math.sqrt(
      Math.pow(request.startPosition.x - player.position.x, 2) +
      Math.pow(request.startPosition.y - player.position.y, 2)
    );
    
    if (distance > this.config.validationTolerance) {
      // Correct to player position
      return {
        valid: true,
        correctedPosition: { x: player.position.x, y: player.position.y }
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Create projectile data from validated request
   */
  private createProjectileFromRequest(
    request: ProjectileRequest,
    player: SimplePlayer,
    validation: ProjectileValidation
  ): string | null {
    const startPos = validation.correctedPosition || request.startPosition;
    const targetPos = validation.correctedTarget || request.targetPosition;
    
    // Calculate direction and velocity
    const dx = targetPos.x - startPos.x;
    const dy = targetPos.y - startPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const dirX = distance > 0 ? dx / distance : 1;
    const dirY = distance > 0 ? dy / distance : 0;
    
    // Get projectile config based on type and player class
    const projectileConfig = this.getProjectileConfig(request.projectileType, player.classType);
    
    // Calculate target position based on direction and range
    const range = projectileConfig.range || 10;
    const targetX = startPos.x + dirX * range;
    const targetY = startPos.y + dirY * range;
    
    // Use SimpleProjectiles to create properly formatted projectile
    const projectileId = this.simpleProjectiles.createProjectile(
      request.playerId,
      request.projectileType,
      startPos.x,
      startPos.y,
      targetX,
      targetY
    );
    
    return projectileId;
  }
  
  /**
   * Get projectile configuration
   */
  private getProjectileConfig(projectileType: string, classType: string): {
    speed: number;
    damage: number;
    piercing: boolean;
    lifespan: number;
    range: number;
  } {
    // Define projectile configs with proper index signature
    const configs: Record<string, { speed: number; damage: number; piercing: boolean; lifespan: number; range: number }> = {
      'arrow': { speed: 15.0, damage: 25, piercing: false, lifespan: 3.0, range: 12 },
      'powershot_arrow': { speed: 18.0, damage: 45, piercing: true, lifespan: 3.0, range: 15 },
      'multishot_arrow': { speed: 15.0, damage: 30, piercing: false, lifespan: 2.5, range: 10 },
      'berserker_projectile': { speed: 12.0, damage: 35, piercing: false, lifespan: 2.0, range: 8 }
    };
    
    return configs[projectileType] || configs['arrow'];
  }
  
  /**
   * Track player projectile
   */
  private trackPlayerProjectile(playerId: string, projectileId: string): void {
    if (!this.playerProjectiles.has(playerId)) {
      this.playerProjectiles.set(playerId, new Set());
    }
    
    this.playerProjectiles.get(playerId)!.add(projectileId);
    this.projectileOwners.set(projectileId, playerId);
  }
  
  /**
   * Remove projectile tracking
   */
  private untrackProjectile(projectileId: string): void {
    const ownerId = this.projectileOwners.get(projectileId);
    if (ownerId) {
      const playerProjectiles = this.playerProjectiles.get(ownerId);
      if (playerProjectiles) {
        playerProjectiles.delete(projectileId);
      }
      this.projectileOwners.delete(projectileId);
    }
  }
  
  /**
   * Process projectile hits and collisions
   */
  processProjectileUpdate(
    projectiles: Map<string, ProjectileData>,
    players: Map<string, SimplePlayer>
  ): void {
    const hits: ProjectileHit[] = [];
    const destroyedProjectiles: string[] = [];
    
    for (const [projectileId, projectile] of projectiles.entries()) {
      // Check for player hits
      for (const [playerId, player] of players.entries()) {
        if (playerId === projectile.ownerId) continue; // Can't hit self
        if (!player.isAlive) continue;
        
        const hit = this.checkProjectilePlayerCollision(projectile, player);
        if (hit) {
          hits.push({
            projectileId,
            targetId: playerId,
            hitPosition: { x: projectile.x, y: projectile.y },
            damage: projectile.damage,
            timestamp: Date.now()
          });
          
          if (!projectile.piercing) {
            destroyedProjectiles.push(projectileId);
          }
        }
      }
      
      // Check arena collisions
      if (this.currentArena && this.checkProjectileArenaCollision(projectile)) {
        destroyedProjectiles.push(projectileId);
      }
    }
    
    // Process hits
    for (const hit of hits) {
      this.processProjectileHit(hit, players);
    }
    
    // Remove destroyed projectiles
    for (const projectileId of destroyedProjectiles) {
      this.simpleProjectiles.removeProjectile(projectileId);
      this.untrackProjectile(projectileId);
      
      if (this.callbacks.onProjectileDestroyed) {
        this.callbacks.onProjectileDestroyed(projectileId, 'collision');
      }
    }
  }
  
  /**
   * Check projectile-player collision
   */
  private checkProjectilePlayerCollision(projectile: ProjectileData, player: SimplePlayer): boolean {
    const playerRadius = 0.8; // Player hitbox radius
    const projectileRadius = 0.2; // Projectile hitbox radius
    
    const distance = Math.sqrt(
      Math.pow(projectile.x - player.position.x, 2) +
      Math.pow(projectile.y - player.position.y, 2)
    );
    
    return distance <= (playerRadius + projectileRadius);
  }
  
  /**
   * Check projectile-arena collision
   */
  private checkProjectileArenaCollision(projectile: ProjectileData): boolean {
    if (!this.currentArena) return false;
    
    // Check arena bounds
    if (projectile.x < 0 || projectile.x > this.currentArena.size.x ||
        projectile.y < 0 || projectile.y > this.currentArena.size.y) {
      return true;
    }
    
    // Check obstacle collisions
    for (const obstacle of this.currentArena.obstacles) {
      if (obstacle.blocking) {
        if (projectile.x >= obstacle.position.x &&
            projectile.x <= obstacle.position.x + obstacle.size.x &&
            projectile.y >= obstacle.position.y &&
            projectile.y <= obstacle.position.y + obstacle.size.y) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Process projectile hit
   */
  private processProjectileHit(hit: ProjectileHit, players: Map<string, SimplePlayer>): void {
    const target = players.get(hit.targetId);
    if (!target) return;
    
    // Apply damage through combat system
    this.basicCombat.applyDamage(target, hit.damage);
    
    if (this.callbacks.onProjectileHit) {
      this.callbacks.onProjectileHit(hit);
    }
    
    logger.debug(`Projectile ${hit.projectileId} hit player ${hit.targetId} for ${hit.damage} damage`);
  }
  
  /**
   * Clean up player projectiles on disconnect
   */
  cleanupPlayerProjectiles(playerId: string): void {
    const playerProjectiles = this.playerProjectiles.get(playerId);
    if (playerProjectiles) {
      for (const projectileId of playerProjectiles) {
        this.simpleProjectiles.removeProjectile(projectileId);
        this.projectileOwners.delete(projectileId);
        
        if (this.callbacks.onProjectileDestroyed) {
          this.callbacks.onProjectileDestroyed(projectileId, 'player_disconnect');
        }
      }
      this.playerProjectiles.delete(playerId);
    }
    
    this.lastPlayerShot.delete(playerId);
  }
  
  /**
   * Get flow statistics
   */
  getStats(): {
    totalActiveProjectiles: number;
    projectilesByPlayer: Map<string, number>;
    recentHits: number;
    validationTolerance: number;
  } {
    const projectilesByPlayer = new Map<string, number>();
    
    for (const [playerId, projectiles] of this.playerProjectiles.entries()) {
      projectilesByPlayer.set(playerId, projectiles.size);
    }
    
    return {
      totalActiveProjectiles: this.projectileOwners.size,
      projectilesByPlayer,
      recentHits: 0, // Could track this if needed
      validationTolerance: this.config.validationTolerance
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ProjectileFlowConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('SimpleProjectileFlow config updated:', this.config);
  }
  
  /**
   * Reset flow state
   */
  reset(): void {
    this.playerProjectiles.clear();
    this.projectileOwners.clear();
    this.lastPlayerShot.clear();
    console.log('SimpleProjectileFlow reset');
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.reset();
    this.callbacks = {};
    console.log('SimpleProjectileFlow destroyed');
  }
}