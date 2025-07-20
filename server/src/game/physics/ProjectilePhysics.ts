/**
 * ProjectilePhysics - Simple ballistic calculation and projectile movement
 * 
 * Handles projectile trajectories, lifetime, and basic physics simulation
 */

import { logger } from '../../utils/logger.js';
import type { 
  Position, 
  Velocity, 
  ProjectileState,
  PlayerState,
  GameState
} from '../types.js';
import { GAME_CONSTANTS, WEAPON_CONFIGS } from '../types.js';
import type { ClassType } from '@dueled/shared';
import type { CollisionSystem } from './CollisionSystem.js';

export interface ProjectileUpdateResult {
  updated: ProjectileState[];
  expired: string[]; // IDs of projectiles that should be removed
}

export interface HitscanResult {
  hit: boolean;
  hitType: 'wall' | 'player' | 'none';
  hitPosition: Position;
  hitPlayerId?: string;
  wallId?: string;
  distance: number;
}

/**
 * Simple projectile physics system
 */
export class ProjectilePhysics {
  private projectileIdCounter = 0;
  
  /**
   * Create a new projectile
   */
  createProjectile(
    ownerId: string,
    startPosition: Position,
    angle: number,
    classType: ClassType
  ): ProjectileState {
    const weaponConfig = WEAPON_CONFIGS[classType];
    const projectileId = `proj_${this.projectileIdCounter++}_${Date.now()}`;
    
    // Calculate initial velocity based on angle and weapon speed
    const velocity: Velocity = {
      x: Math.cos(angle) * weaponConfig.projectileSpeed,
      y: Math.sin(angle) * weaponConfig.projectileSpeed
    };
    
    const projectile: ProjectileState = {
      id: projectileId,
      type: weaponConfig.projectileType,
      
      // Transform
      position: { ...startPosition },
      velocity,
      angle,
      
      // Properties from weapon config
      damage: weaponConfig.damage,
      speed: weaponConfig.projectileSpeed,
      range: weaponConfig.range,
      
      // Lifecycle
      ownerId,
      spawnTime: Date.now(),
      timeToLive: this.calculateTimeToLive(weaponConfig.range, weaponConfig.projectileSpeed),
      
      // Physics properties
      hasGravity: false, // Keep simple for now
      piercing: weaponConfig.piercing,
      explosive: weaponConfig.explosive,
      explosionRadius: weaponConfig.explosionRadius
    };
    
    logger.debug(`Created projectile ${projectileId}`, {
      type: projectile.type,
      speed: projectile.speed,
      ttl: projectile.timeToLive
    });
    
    return projectile;
  }
  
  /**
   * Update all projectiles for one physics tick
   */
  updateProjectiles(
    projectiles: Map<string, ProjectileState>,
    deltaTime: number // Time in seconds since last update
  ): ProjectileUpdateResult {
    const updated: ProjectileState[] = [];
    const expired: string[] = [];
    const currentTime = Date.now();
    
    for (const [id, projectile] of projectiles) {
      // Check if projectile has expired
      const age = (currentTime - projectile.spawnTime) / 1000; // Convert to seconds
      
      if (age >= projectile.timeToLive) {
        expired.push(id);
        continue;
      }
      
      // Update position based on velocity
      const newPosition: Position = {
        x: projectile.position.x + projectile.velocity.x * deltaTime,
        y: projectile.position.y + projectile.velocity.y * deltaTime
      };
      
      // Create updated projectile
      const updatedProjectile: ProjectileState = {
        ...projectile,
        position: newPosition
      };
      
      updated.push(updatedProjectile);
    }
    
    return { updated, expired };
  }
  
  /**
   * Process hitscan weapon (instant hit detection)
   */
  processHitscanWeapon(
    startPosition: Position,
    angle: number,
    range: number,
    ownerId: string,
    gameState: GameState,
    collisionSystem: CollisionSystem
  ): HitscanResult {
    // Calculate end position based on range
    const endPosition: Position = {
      x: startPosition.x + Math.cos(angle) * range,
      y: startPosition.y + Math.sin(angle) * range
    };
    
    // Check ALL potential hits along the raycast line
    const players = Array.from(gameState.players.values());
    
    const playerHit = collisionSystem.checkLinePlayerCollision(
      startPosition,
      endPosition,
      ownerId,
      players
    );
    
    const wallHit = collisionSystem.checkProjectileWallCollision(
      startPosition, 
      endPosition, 
      0.1 // Small radius for precise bullets
    );
    
    // Find the CLOSEST hit (smallest distance)
    const hits = [];
    
    if (playerHit.hit && playerHit.distance !== undefined) {
      hits.push({
        type: 'player' as const,
        distance: playerHit.distance,
        position: playerHit.hitPosition!,
        playerId: playerHit.playerId!
      });
    }
    
    if (wallHit.hit && wallHit.distance !== undefined) {
      hits.push({
        type: 'wall' as const,
        distance: wallHit.distance,
        position: wallHit.position!,
        wallId: wallHit.wallId
      });
    }
    
    if (hits.length === 0) {
      logger.debug(`Hitscan missed - no hits detected`);
      return {
        hit: false,
        hitType: 'none',
        hitPosition: endPosition,
        distance: range
      };
    }
    
    // Sort by distance and take the closest hit
    hits.sort((a, b) => a.distance - b.distance);
    const closestHit = hits[0];
    
    if (closestHit.type === 'player') {
      logger.debug(`Hitscan hit player ${closestHit.playerId} at distance ${closestHit.distance} (closest hit)`);
      return {
        hit: true,
        hitType: 'player',
        hitPosition: closestHit.position,
        hitPlayerId: closestHit.playerId,
        distance: closestHit.distance
      };
    } else {
      logger.debug(`Hitscan hit wall at distance ${closestHit.distance} (closest hit, blocked)`);
      return {
        hit: true,
        hitType: 'wall',
        hitPosition: closestHit.position,
        wallId: closestHit.wallId,
        distance: closestHit.distance
      };
    }
  }
  
  /**
   * Calculate projectile trajectory for instant hit weapons (like archer arrows)
   */
  calculateInstantHitTrajectory(
    startPosition: Position,
    angle: number,
    maxRange: number
  ): Position {
    return {
      x: startPosition.x + Math.cos(angle) * maxRange,
      y: startPosition.y + Math.sin(angle) * maxRange
    };
  }
  
  /**
   * Calculate explosion positions for AOE projectiles
   */
  calculateExplosionArea(
    centerPosition: Position,
    explosionRadius: number
  ): { center: Position; radius: number; affectedPositions: Position[] } {
    // For simple implementation, just return center and radius
    // The collision system will handle checking which players are in range
    return {
      center: { ...centerPosition },
      radius: explosionRadius,
      affectedPositions: [] // TODO: Could pre-calculate grid positions if needed
    };
  }
  
  /**
   * Check if a projectile should hit a target at given position
   */
  checkDirectHit(
    projectilePos: Position,
    targetPos: Position,
    hitRadius: number = 0.5
  ): boolean {
    const distance = Math.sqrt(
      Math.pow(projectilePos.x - targetPos.x, 2) + 
      Math.pow(projectilePos.y - targetPos.y, 2)
    );
    
    return distance <= hitRadius;
  }
  
  /**
   * Calculate damage based on distance for explosive projectiles
   */
  calculateExplosiveDamage(
    baseDamage: number,
    explosionCenter: Position,
    targetPosition: Position,
    explosionRadius: number
  ): number {
    const distance = Math.sqrt(
      Math.pow(explosionCenter.x - targetPosition.x, 2) + 
      Math.pow(explosionCenter.y - targetPosition.y, 2)
    );
    
    if (distance > explosionRadius) {
      return 0; // Outside explosion radius
    }
    
    // Linear damage falloff (100% at center, 0% at edge)
    const damageMultiplier = 1 - (distance / explosionRadius);
    return Math.round(baseDamage * damageMultiplier);
  }
  
  /**
   * Simulate projectile path for prediction (used by AI or advanced features)
   */
  simulateProjectilePath(
    startPosition: Position,
    velocity: Velocity,
    timeToLive: number,
    stepSize: number = 0.1 // seconds per step
  ): Position[] {
    const path: Position[] = [];
    let currentPos = { ...startPosition };
    let currentTime = 0;
    
    while (currentTime < timeToLive) {
      path.push({ ...currentPos });
      
      // Update position
      currentPos.x += velocity.x * stepSize;
      currentPos.y += velocity.y * stepSize;
      currentTime += stepSize;
    }
    
    return path;
  }
  
  /**
   * Calculate time to live based on range and speed
   */
  private calculateTimeToLive(range: number, speed: number): number {
    if (speed <= 0) {
      return 1.0; // Default 1 second for melee "projectiles"
    }
    
    // Time = Distance / Speed, with a small buffer
    const baseTime = range / speed;
    return Math.max(0.5, baseTime * 1.2); // At least 0.5s, with 20% buffer
  }
  
  /**
   * Get projectile statistics for debugging
   */
  getProjectileStats(projectiles: Map<string, ProjectileState>): {
    total: number;
    byType: Record<string, number>;
    oldestAge: number;
    averageSpeed: number;
  } {
    const currentTime = Date.now();
    const stats = {
      total: projectiles.size,
      byType: {} as Record<string, number>,
      oldestAge: 0,
      averageSpeed: 0
    };
    
    let totalSpeed = 0;
    
    for (const projectile of projectiles.values()) {
      // Count by type
      stats.byType[projectile.type] = (stats.byType[projectile.type] || 0) + 1;
      
      // Track oldest
      const age = (currentTime - projectile.spawnTime) / 1000;
      stats.oldestAge = Math.max(stats.oldestAge, age);
      
      // Sum speed for average
      totalSpeed += projectile.speed;
    }
    
    stats.averageSpeed = projectiles.size > 0 ? totalSpeed / projectiles.size : 0;
    
    return stats;
  }
  
  /**
   * Calculate distance between two positions
   */
  private getDistance(pos1: Position, pos2: Position): number {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + 
      Math.pow(pos1.y - pos2.y, 2)
    );
  }
}