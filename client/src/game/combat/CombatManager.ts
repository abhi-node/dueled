/**
 * Combat Manager for Dueled
 * 
 * Handles all combat mechanics including:
 * - Player hitboxes and collision detection
 * - Projectile management and collision
 * - Damage calculation with armor penetration
 * - Attack timing and cooldowns
 * - Special ability effects
 */

import { Projectile } from './Projectile.js';
import type { ProjectileConfig, ProjectileState } from './Projectile.js';
import type { Vector2, ClassType, ClassConfig } from '@dueled/shared';
import { getClassConfig, calculateEffectiveDamage } from '@dueled/shared';

export interface PlayerHitbox {
  playerId: string;
  position: Vector2;
  radius: number; // Circular hitbox for simplicity
  classType: ClassType;
  health: number;
  maxHealth: number;
  armor: number;
  isAlive: boolean;
}

export interface DamageResult {
  targetId: string;
  damage: number;
  damageType: string;
  armorReduction: number;
  finalDamage: number;
  isKilled: boolean;
  effects: string[]; // Status effects applied
}

export interface AttackData {
  attackerId: string;
  targetPosition: Vector2;
  classType: ClassType;
  attackType: 'basic' | 'special';
  timestamp: number;
}

export class CombatManager {
  private projectiles: Map<string, Projectile> = new Map();
  private playerHitboxes: Map<string, PlayerHitbox> = new Map();
  private lastProjectileId: number = 0;
  
  // Combat constants
  private static readonly PLAYER_RADIUS = 16; // pixels
  private static readonly TILE_SIZE = 32; // pixels per tile
  
  /**
   * Register a player for combat tracking
   */
  public registerPlayer(playerId: string, position: Vector2, classType: ClassType): void {
    const classConfig = getClassConfig(classType);
    
    this.playerHitboxes.set(playerId, {
      playerId,
      position: { ...position },
      radius: CombatManager.PLAYER_RADIUS,
      classType,
      health: classConfig.stats.health,
      maxHealth: classConfig.stats.health,
      armor: classConfig.stats.defense,
      isAlive: true
    });
    
    console.log(`🎯 Combat: Registered player ${playerId} as ${classType}`);
  }

  /**
   * Update player position for collision detection
   */
  public updatePlayerPosition(playerId: string, position: Vector2): void {
    const hitbox = this.playerHitboxes.get(playerId);
    if (hitbox) {
      hitbox.position = { ...position };
    }
  }

  /**
   * Update player health and stats
   */
  public updatePlayerHealth(playerId: string, health: number, armor: number): void {
    const hitbox = this.playerHitboxes.get(playerId);
    if (hitbox) {
      hitbox.health = health;
      hitbox.armor = armor;
      hitbox.isAlive = health > 0;
    }
  }

  /**
   * Remove player from combat tracking
   */
  public unregisterPlayer(playerId: string): void {
    this.playerHitboxes.delete(playerId);
    
    // Remove any projectiles owned by this player
    for (const [projectileId, projectile] of this.projectiles) {
      if (projectile.getOwnerId() === playerId) {
        this.projectiles.delete(projectileId);
      }
    }
    
    console.log(`❌ Combat: Unregistered player ${playerId}`);
  }

  /**
   * Handle archer basic attack (piercing arrow)
   */
  public archerBasicAttack(attackData: AttackData): Projectile | null {
    const attacker = this.playerHitboxes.get(attackData.attackerId);
    if (!attacker || !attacker.isAlive) return null;
    
    const classConfig = getClassConfig(attackData.classType);
    const weapon = classConfig.weapon;
    
    // Calculate attack direction
    const dx = attackData.targetPosition.x - attacker.position.x;
    const dy = attackData.targetPosition.y - attacker.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return null;
    
    // Normalize direction and set projectile speed
    const direction = { x: dx / distance, y: dy / distance };
    const projectileSpeed = 150; // SLOWED DOWN from 400 for debugging visibility
    
    // Create arrow projectile configuration
    const projectileConfig: ProjectileConfig = {
      id: `arrow_${++this.lastProjectileId}`,
      type: 'arrow',
      damage: calculateEffectiveDamage(weapon.damage, attacker.classType === 'archer' ? 80 : 70), // Use strength stat
      speed: projectileSpeed,
      range: weapon.range,
      size: { width: 32, height: 12 }, // Made larger for visibility
      piercing: true, // Archer inherent ability
      homing: false,
      armorPenetration: 50, // Piercing shot ignores 50% armor
      effects: weapon.effects,
      spriteSheet: {
        path: '/assets/projectiles/arrow_sheet.png',
        frameWidth: 48,
        frameHeight: 48,
        totalFrames: 16
      }
    };
    
    // Create projectile state
    const projectileState: ProjectileState = {
      id: projectileConfig.id,
      position: { 
        x: attacker.position.x + direction.x * CombatManager.PLAYER_RADIUS, 
        y: attacker.position.y + direction.y * CombatManager.PLAYER_RADIUS 
      },
      velocity: direction,
      rotation: Math.atan2(direction.y, direction.x),
      distanceTraveled: 0,
      isActive: true,
      ownerId: attackData.attackerId,
      createdAt: attackData.timestamp,
      lastUpdate: attackData.timestamp
    };
    
    // Create and register projectile
    const projectile = new Projectile(projectileConfig, projectileState);
    this.projectiles.set(projectileConfig.id, projectile);
    
    console.log(`🏹 Archer basic attack: ${attackData.attackerId} fired arrow at (${attackData.targetPosition.x.toFixed(1)}, ${attackData.targetPosition.y.toFixed(1)}) with speed ${projectileSpeed}`);
    
    return projectile;
  }

  /**
   * Handle archer special ability (Dispatcher - homing arrow)
   */
  public archerSpecialAttack(attackData: AttackData): Projectile | null {
    const attacker = this.playerHitboxes.get(attackData.attackerId);
    if (!attacker || !attacker.isAlive) return null;
    
    // Find nearest enemy
    let nearestEnemy: PlayerHitbox | null = null;
    let nearestDistance = Infinity;
    
    for (const [playerId, hitbox] of this.playerHitboxes) {
      if (playerId !== attackData.attackerId && hitbox.isAlive) {
        const dx = hitbox.position.x - attacker.position.x;
        const dy = hitbox.position.y - attacker.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestEnemy = hitbox;
        }
      }
    }
    
    if (!nearestEnemy) {
      console.warn('🏹 Dispatcher: No target found for homing arrow');
      return null;
    }
    
    const classConfig = getClassConfig(attackData.classType);
    const weapon = classConfig.weapon;
    
    // Calculate initial direction toward target
    const dx = nearestEnemy.position.x - attacker.position.x;
    const dy = nearestEnemy.position.y - attacker.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const direction = { x: dx / distance, y: dy / distance };
    
    // Create homing arrow configuration (120% damage as per special ability)
    const projectileConfig: ProjectileConfig = {
      id: `homing_arrow_${++this.lastProjectileId}`,
      type: 'arrow',
      damage: calculateEffectiveDamage(weapon.damage * 1.2, 80), // 120% damage + strength scaling
      speed: 120, // Even slower for homing arrow to be visible
      range: weapon.range * 1.5, // Extended range
      size: { width: 36, height: 14 }, // Slightly larger for special arrow
      piercing: true,
      homing: true,
      armorPenetration: 50,
      effects: weapon.effects,
      spriteSheet: {
        path: '/assets/projectiles/homing_arrow_sheet.png',
        frameWidth: 48,
        frameHeight: 48,
        totalFrames: 16
      }
    };
    
    // Create homing projectile state
    const projectileState: ProjectileState = {
      id: projectileConfig.id,
      position: { 
        x: attacker.position.x + direction.x * CombatManager.PLAYER_RADIUS, 
        y: attacker.position.y + direction.y * CombatManager.PLAYER_RADIUS 
      },
      velocity: direction,
      rotation: Math.atan2(direction.y, direction.x),
      distanceTraveled: 0,
      isActive: true,
      ownerId: attackData.attackerId,
      targetId: nearestEnemy.playerId, // Set homing target
      createdAt: attackData.timestamp,
      lastUpdate: attackData.timestamp
    };
    
    // Create and register homing projectile
    const projectile = new Projectile(projectileConfig, projectileState);
    this.projectiles.set(projectileConfig.id, projectile);
    
    console.log(`⚡ Dispatcher: ${attackData.attackerId} fired homing arrow at ${nearestEnemy.playerId}`);
    
    return projectile;
  }

  /**
   * Update all projectiles and check for collisions
   */
  public update(deltaTime: number, walls: number[][]): DamageResult[] {
    const damageResults: DamageResult[] = [];
    const projectilesToRemove: string[] = [];
    
    // Create target map for homing projectiles
    const targetMap = new Map<string, Vector2>();
    for (const [playerId, hitbox] of this.playerHitboxes) {
      if (hitbox.isAlive) {
        targetMap.set(playerId, hitbox.position);
      }
    }
    
    // Update each projectile
    for (const [projectileId, projectile] of this.projectiles) {
      // Update projectile physics
      const stillActive = projectile.update(deltaTime, targetMap, walls);
      
      if (!stillActive) {
        projectilesToRemove.push(projectileId);
        continue;
      }
      
      // Check collisions with players
      for (const [playerId, hitbox] of this.playerHitboxes) {
        // Skip owner and dead players
        if (playerId === projectile.getOwnerId() || !hitbox.isAlive) continue;
        
        // Check collision
        if (projectile.checkTargetCollision(hitbox.position, hitbox.radius)) {
          // Calculate damage
          const damageResult = this.calculateDamage(projectile, hitbox);
          damageResults.push(damageResult);
          
          // Apply damage to player
          hitbox.health -= damageResult.finalDamage;
          hitbox.isAlive = hitbox.health > 0;
          
          // Deactivate projectile (unless piercing and target survived)
          if (!projectile.getConfig().piercing || !hitbox.isAlive) {
            projectile.deactivate();
            projectilesToRemove.push(projectileId);
          }
          
          console.log(`💥 Hit: ${projectile.getConfig().type} from ${projectile.getOwnerId()} hit ${playerId} for ${damageResult.finalDamage} damage`);
          
          break; // Only hit one target per update
        }
      }
    }
    
    // Remove inactive projectiles
    for (const projectileId of projectilesToRemove) {
      this.projectiles.delete(projectileId);
    }
    
    return damageResults;
  }

  /**
   * Calculate damage with armor penetration and effects
   */
  private calculateDamage(projectile: Projectile, target: PlayerHitbox): DamageResult {
    const config = projectile.getConfig();
    const baseDamage = config.damage;
    
    // Calculate armor after penetration
    let effectiveArmor = target.armor;
    if (config.armorPenetration > 0) {
      effectiveArmor = target.armor * (1 - config.armorPenetration / 100);
    }
    
    // Apply armor reduction formula from PRD
    const armorReduction = effectiveArmor / (effectiveArmor + 100);
    const finalDamage = Math.max(1, Math.round(baseDamage * (1 - armorReduction)));
    
    const effects: string[] = [];
    
    // Add special effects
    if (config.piercing) {
      effects.push('piercing');
    }
    
    if (config.homing) {
      effects.push('homing');
    }
    
    return {
      targetId: target.playerId,
      damage: baseDamage,
      damageType: config.type,
      armorReduction: armorReduction,
      finalDamage: finalDamage,
      isKilled: target.health - finalDamage <= 0,
      effects: effects
    };
  }

  /**
   * Render all active projectiles
   */
  public render(ctx: CanvasRenderingContext2D, cameraOffset: Vector2): void {
    for (const projectile of this.projectiles.values()) {
      projectile.render(ctx, cameraOffset);
    }
  }

  /**
   * Render player hitboxes for debugging
   */
  public renderHitboxes(ctx: CanvasRenderingContext2D, cameraOffset: Vector2, debug: boolean = false): void {
    if (!debug) return;
    
    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    
    for (const hitbox of this.playerHitboxes.values()) {
      if (!hitbox.isAlive) continue;
      
      const screenX = hitbox.position.x - cameraOffset.x;
      const screenY = hitbox.position.y - cameraOffset.y;
      
      ctx.beginPath();
      ctx.arc(screenX, screenY, hitbox.radius, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Draw player ID
      ctx.fillStyle = '#00ff00';
      ctx.font = '12px Arial';
      ctx.fillText(hitbox.playerId.substring(0, 8), screenX - 20, screenY - 25);
    }
    
    ctx.restore();
  }

  // Getters
  public getProjectiles(): Map<string, Projectile> { return this.projectiles; }
  public getPlayerHitboxes(): Map<string, PlayerHitbox> { return this.playerHitboxes; }
  public getPlayerHitbox(playerId: string): PlayerHitbox | undefined { return this.playerHitboxes.get(playerId); }
} 