import { Vector2, ClassType, DamageType } from '@dueled/shared';
import { SimplePlayer, SimpleProjectile, SimpleGameState } from './SimpleGameLoop.js';
import { SimplePhysics } from './SimplePhysics.js';
import { logger } from '../../utils/logger.js';

/**
 * BasicCombat - Simple, scalable combat system for 1v1 arena
 * 
 * Features:
 * - Simple projectile creation and tracking
 * - Point-to-point projectile movement
 * - Basic damage calculation with class modifiers
 * - Server-authoritative hit detection
 * - Extensible for 4 classes
 */

export interface CombatResult {
  hit: boolean;
  damage: number;
  targetId?: string;
  projectileId?: string;
  hitPosition?: Vector2;
  damageType: DamageType;
}

export interface ProjectileCreationData {
  ownerId: string;
  startPosition: Vector2;
  direction: Vector2;
  projectileType: ProjectileType;
  isAbility: boolean;
}

export type ProjectileType = 'melee_swing' | 'ice_shard' | 'arrow' | 'fire_bomb' | 'charge' | 'frost_nova';

/**
 * BasicCombat handles all combat mechanics with simple, efficient algorithms
 */
export class BasicCombat {
  private physics: SimplePhysics;
  
  constructor() {
    this.physics = new SimplePhysics();
  }

  /**
   * Create projectile for attack - simple point-to-point movement
   */
  createProjectile(
    gameState: SimpleGameState,
    data: ProjectileCreationData
  ): SimpleProjectile | null {
    const owner = gameState.players.get(data.ownerId);
    if (!owner || !owner.isAlive) {
      logger.warn(`Cannot create projectile: owner ${data.ownerId} not found or dead`);
      return null;
    }

    const projectileStats = this.getProjectileStats(owner.classType, data.projectileType, data.isAbility);
    const projectileId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // Calculate damage with owner's stats
    const baseDamage = this.calculateBaseDamage(owner, data.isAbility);
    const finalDamage = baseDamage * projectileStats.damageMultiplier;

    const projectile: SimpleProjectile = {
      id: projectileId,
      type: this.mapProjectileTypeToSimple(data.projectileType),
      ownerId: data.ownerId,
      position: { ...data.startPosition },
      direction: this.normalizeVector(data.direction),
      speed: projectileStats.speed,
      damage: finalDamage,
      range: projectileStats.range,
      traveledDistance: 0,
      createdAt: Date.now()
    };

    logger.debug(`Created projectile ${projectileId}: type=${data.projectileType}, damage=${finalDamage}, range=${projectileStats.range}`);
    return projectile;
  }

  /**
   * Update all projectiles - simple movement and collision detection
   */
  updateProjectiles(gameState: SimpleGameState, deltaTime: number): CombatResult[] {
    const results: CombatResult[] = [];
    const projectilesToRemove: string[] = [];
    
    for (const projectile of gameState.projectiles.values()) {
      // Move projectile
      const moveResult = this.moveProjectile(projectile, deltaTime);
      
      // Check range limit
      if (projectile.traveledDistance >= projectile.range) {
        projectilesToRemove.push(projectile.id);
        continue;
      }

      // Check wall/boundary collisions
      const wallCollision = this.physics.validateProjectileMovement(projectile.position, gameState.arena);
      if (wallCollision.collided) {
        projectilesToRemove.push(projectile.id);
        logger.debug(`Projectile ${projectile.id} hit wall`);
        continue;
      }

      // Check player collisions
      const hitResult = this.checkProjectilePlayerCollisions(projectile, gameState);
      if (hitResult) {
        results.push(hitResult);
        projectilesToRemove.push(projectile.id);
      }
    }

    // Remove expired/hit projectiles
    for (const id of projectilesToRemove) {
      gameState.projectiles.delete(id);
    }

    return results;
  }

  /**
   * Simple projectile movement - point to point
   */
  private moveProjectile(projectile: SimpleProjectile, deltaTime: number): void {
    const moveDistance = projectile.speed * (deltaTime / 1000);
    
    projectile.position.x += projectile.direction.x * moveDistance;
    projectile.position.y += projectile.direction.y * moveDistance;
    projectile.traveledDistance += moveDistance;
  }

  /**
   * Check projectile collisions with all players
   */
  private checkProjectilePlayerCollisions(
    projectile: SimpleProjectile,
    gameState: SimpleGameState
  ): CombatResult | null {
    for (const player of gameState.players.values()) {
      // Skip owner and dead players
      if (player.id === projectile.ownerId || !player.isAlive) continue;

      // Simple circle-circle collision detection
      if (this.physics.checkProjectilePlayerCollision(projectile.position, player.position)) {
        return this.processHit(projectile, player);
      }
    }
    return null;
  }

  /**
   * Process hit and apply damage
   */
  private processHit(projectile: SimpleProjectile, target: SimplePlayer): CombatResult {
    const effectiveDamage = this.calculateEffectiveDamage(projectile.damage, target);
    
    // Apply damage
    target.health = Math.max(0, target.health - effectiveDamage);
    
    if (target.health <= 0) {
      target.isAlive = false;
      logger.info(`Player ${target.id} eliminated by projectile from ${projectile.ownerId}`);
    }

    return {
      hit: true,
      damage: effectiveDamage,
      targetId: target.id,
      projectileId: projectile.id,
      hitPosition: { ...projectile.position },
      damageType: this.getProjectileDamageType(projectile.type)
    };
  }

  /**
   * Calculate base damage with owner stats
   */
  private calculateBaseDamage(owner: SimplePlayer, isAbility: boolean): number {
    const baseDamage = owner.stats.damage;
    const strengthMultiplier = 1 + (owner.stats.strength * 0.02); // 2% per strength point
    const abilityMultiplier = isAbility ? 1.5 : 1.0; // Abilities do 50% more damage
    
    return baseDamage * strengthMultiplier * abilityMultiplier;
  }

  /**
   * Calculate effective damage with target defense
   */
  private calculateEffectiveDamage(baseDamage: number, target: SimplePlayer): number {
    const defenseReduction = target.stats.defense * 0.5; // Each defense point reduces damage by 0.5
    const finalDamage = Math.max(1, baseDamage - defenseReduction); // Minimum 1 damage
    
    return Math.round(finalDamage);
  }

  /**
   * Get projectile stats for different classes and abilities
   */
  private getProjectileStats(classType: ClassType, projectileType: ProjectileType, isAbility: boolean) {
    const baseStats = {
      [ClassType.BERSERKER]: {
        melee_swing: { speed: 0, range: 1.5, damageMultiplier: 1.0 }, // Instant melee
        charge: { speed: 15, range: 4, damageMultiplier: 1.8 }
      },
      [ClassType.MAGE]: {
        ice_shard: { speed: 8, range: 12, damageMultiplier: 1.0 },
        frost_nova: { speed: 0, range: 4, damageMultiplier: 1.2 } // AOE ability
      },
      [ClassType.ARCHER]: {
        arrow: { speed: 18, range: 15, damageMultiplier: 1.0 },
        piercing_shot: { speed: 20, range: 18, damageMultiplier: 1.4 }
      },
      [ClassType.BOMBER]: {
        fire_bomb: { speed: 6, range: 8, damageMultiplier: 1.3 },
        explosive_trap: { speed: 0, range: 3, damageMultiplier: 1.6 }
      }
    };

    const classStats = baseStats[classType];
    const projectileStats = classStats?.[projectileType as keyof typeof classStats];
    
    if (!projectileStats) {
      logger.warn(`Unknown projectile type ${projectileType} for class ${classType}`);
      return { speed: 8, range: 8, damageMultiplier: 1.0 };
    }

    return projectileStats;
  }

  /**
   * Map complex projectile types to simple ones for rendering
   */
  private mapProjectileTypeToSimple(projectileType: ProjectileType): SimpleProjectile['type'] {
    const mapping = {
      'melee_swing': 'magic_missile' as const,
      'ice_shard': 'ice_shard' as const,
      'arrow': 'arrow' as const,
      'fire_bomb': 'fire_bomb' as const,
      'charge': 'magic_missile' as const,
      'frost_nova': 'ice_shard' as const
    };

    return mapping[projectileType] || 'magic_missile';
  }

  /**
   * Get damage type for different projectiles
   */
  private getProjectileDamageType(projectileType: SimpleProjectile['type']): DamageType {
    const damageTypes = {
      'arrow': DamageType.PHYSICAL,
      'ice_shard': DamageType.MAGICAL,
      'fire_bomb': DamageType.FIRE,
      'magic_missile': DamageType.MAGICAL
    };

    return damageTypes[projectileType] || DamageType.PHYSICAL;
  }

  /**
   * Handle melee attacks (instant hit for Berserker)
   */
  handleMeleeAttack(
    gameState: SimpleGameState,
    attackerId: string,
    direction: Vector2,
    isAbility: boolean = false
  ): CombatResult[] {
    const attacker = gameState.players.get(attackerId);
    if (!attacker || !attacker.isAlive) return [];

    const results: CombatResult[] = [];
    const meleeRange = isAbility ? 2.0 : 1.5; // Abilities have longer range
    const meleeArc = isAbility ? Math.PI : Math.PI * 0.75; // Abilities have wider arc

    for (const target of gameState.players.values()) {
      if (target.id === attackerId || !target.isAlive) continue;

      // Check if target is in range
      const distance = this.calculateDistance(attacker.position, target.position);
      if (distance > meleeRange) continue;

      // Check if target is in attack arc
      const toTarget = {
        x: target.position.x - attacker.position.x,
        y: target.position.y - attacker.position.y
      };
      const targetAngle = Math.atan2(toTarget.y, toTarget.x);
      const attackAngle = Math.atan2(direction.y, direction.x);
      const angleDiff = Math.abs(this.normalizeAngle(targetAngle - attackAngle));

      if (angleDiff <= meleeArc / 2) {
        const damage = this.calculateBaseDamage(attacker, isAbility);
        const effectiveDamage = this.calculateEffectiveDamage(damage, target);
        
        target.health = Math.max(0, target.health - effectiveDamage);
        
        if (target.health <= 0) {
          target.isAlive = false;
          logger.info(`Player ${target.id} eliminated by melee attack from ${attackerId}`);
        }

        results.push({
          hit: true,
          damage: effectiveDamage,
          targetId: target.id,
          hitPosition: { ...target.position },
          damageType: DamageType.PHYSICAL
        });
      }
    }

    return results;
  }

  /**
   * Handle AOE abilities (Frost Nova, etc.)
   */
  handleAOEAbility(
    gameState: SimpleGameState,
    casterId: string,
    centerPosition: Vector2,
    radius: number,
    damageMultiplier: number = 1.0
  ): CombatResult[] {
    const caster = gameState.players.get(casterId);
    if (!caster || !caster.isAlive) return [];

    const results: CombatResult[] = [];

    for (const target of gameState.players.values()) {
      if (target.id === casterId || !target.isAlive) continue;

      const distance = this.calculateDistance(centerPosition, target.position);
      if (distance <= radius) {
        const baseDamage = this.calculateBaseDamage(caster, true);
        const aoeDamage = baseDamage * damageMultiplier;
        const effectiveDamage = this.calculateEffectiveDamage(aoeDamage, target);
        
        target.health = Math.max(0, target.health - effectiveDamage);
        
        if (target.health <= 0) {
          target.isAlive = false;
          logger.info(`Player ${target.id} eliminated by AOE ability from ${casterId}`);
        }

        results.push({
          hit: true,
          damage: effectiveDamage,
          targetId: target.id,
          hitPosition: { ...target.position },
          damageType: DamageType.MAGICAL
        });
      }
    }

    return results;
  }

  /**
   * Validate attack action (rate limiting, cooldowns, etc.)
   */
  validateAttack(player: SimplePlayer, isAbility: boolean): boolean {
    const now = Date.now();
    
    // Basic rate limiting (prevent spam)
    const timeSinceLastInput = now - player.lastInputTime;
    const minAttackInterval = isAbility ? 500 : 200; // 500ms for abilities, 200ms for basic attacks
    
    if (timeSinceLastInput < minAttackInterval) {
      return false;
    }

    // Check ability cooldown
    if (isAbility && !player.abilityState.isReady) {
      return false;
    }

    return true;
  }

  /**
   * Apply damage to a target player
   */
  applyDamage(target: SimplePlayer, damage: number, damageType: DamageType = DamageType.PHYSICAL): number {
    const defense = target.stats.defense;
    let effectiveDamage = damage;
    
    // Apply defense reduction
    if (damageType === DamageType.PHYSICAL) {
      effectiveDamage = Math.max(1, damage - defense);
    } else if (damageType === DamageType.MAGICAL) {
      effectiveDamage = Math.max(1, damage - defense * 0.5); // Magic penetrates armor better
    }
    
    const oldHealth = target.health;
    target.health = Math.max(0, target.health - effectiveDamage);
    const actualDamage = oldHealth - target.health;
    
    if (target.health <= 0) {
      target.isAlive = false;
      logger.info(`Player ${target.id} has been eliminated`);
    }
    
    logger.debug(`Player ${target.id} took ${actualDamage} damage (${oldHealth} -> ${target.health})`);
    return actualDamage;
  }

  /**
   * Apply healing (for future consumables/abilities)
   */
  /**
   * Apply temporary buff to player
   */
  applyBuff(target: SimplePlayer, buffType: string, multiplier: number, duration: number): void {
    // Simple buff system - could be expanded later
    logger.debug(`Applied ${buffType} buff to ${target.id}: ${multiplier}x for ${duration}ms`);
  }

  applyHealing(target: SimplePlayer, healAmount: number): number {
    const oldHealth = target.health;
    target.health = Math.min(target.maxHealth, target.health + healAmount);
    const actualHealing = target.health - oldHealth;
    
    logger.debug(`Player ${target.id} healed for ${actualHealing} HP (${oldHealth} -> ${target.health})`);
    return actualHealing;
  }

  /**
   * Check if player can attack (alive, not stunned, etc.)
   */
  canPlayerAttack(player: SimplePlayer): boolean {
    return player.isAlive && player.health > 0;
  }

  /**
   * Get combat stats for UI display
   */
  getCombatStats(player: SimplePlayer): {
    damage: number;
    defense: number;
    attackSpeed: number;
    abilityReady: boolean;
  } {
    return {
      damage: Math.round(this.calculateBaseDamage(player, false)),
      defense: player.stats.defense,
      attackSpeed: 1.0, // Could be modified by items/buffs later
      abilityReady: player.abilityState.isReady
    };
  }

  /**
   * Utility functions
   */
  private calculateDistance(pos1: Vector2, pos2: Vector2): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private normalizeVector(vector: Vector2): Vector2 {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: vector.x / length, y: vector.y / length };
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Debug utilities
   */
  debugCombatResult(result: CombatResult): void {
    logger.debug(`Combat Result: hit=${result.hit}, damage=${result.damage}, ` +
                `target=${result.targetId}, type=${result.damageType}`);
  }

  /**
   * Performance monitoring
   */
  getPerformanceMetrics(): {
    activeProjectiles: number;
    averageProjectileSpeed: number;
  } {
    // This could be extended to track performance metrics
    return {
      activeProjectiles: 0,
      averageProjectileSpeed: 0
    };
  }
}