/**
 * BasicAbilities - Simple abilities for Archer vs Berserker combat
 * 
 * Replaces complex ability system with clean, balanced abilities
 * Designed for 1v1 arena combat with straightforward mechanics
 */

import { SimplePlayer } from '../../services/game/SimpleGameLoop.js';
import { SimpleProjectiles, ProjectileData } from '../projectiles/SimpleProjectiles.js';
import { logger } from '../../utils/logger.js';

export interface AbilityConfig {
  name: string;
  cooldown: number;        // Seconds
  damage: number;          // Base damage
  range: number;           // Effective range
  manaCost?: number;       // Mana/energy cost (if applicable)
  duration?: number;       // Effect duration (if applicable)
}

export interface AbilityResult {
  success: boolean;
  damage?: number;
  projectileId?: string;
  effects?: string[];
  message?: string;
}

export interface PlayerAbilityState {
  playerId: string;
  lastUsed: Map<string, number>; // ability name -> timestamp
  activeEffects: Map<string, number>; // effect name -> end timestamp
}

/**
 * BasicAbilities - Simple ability system for arena combat
 */
export class BasicAbilities {
  private simpleProjectiles: SimpleProjectiles;
  private playerStates: Map<string, PlayerAbilityState> = new Map();
  
  // Archer abilities
  private readonly ARCHER_ABILITIES: Map<string, AbilityConfig> = new Map([
    ['powershot', {
      name: 'Power Shot',
      cooldown: 8.0,
      damage: 45,
      range: 25.0
    }],
    ['multishot', {
      name: 'Multi Shot',
      cooldown: 12.0,
      damage: 30,
      range: 20.0
    }]
  ]);
  
  // Berserker abilities
  private readonly BERSERKER_ABILITIES: Map<string, AbilityConfig> = new Map([
    ['charge', {
      name: 'Berserker Charge',
      cooldown: 10.0,
      damage: 50,
      range: 8.0,
      duration: 2.0
    }],
    ['whirlwind', {
      name: 'Whirlwind',
      cooldown: 15.0,
      damage: 35,
      range: 6.0,
      duration: 3.0
    }]
  ]);
  
  constructor(simpleProjectiles: SimpleProjectiles) {
    this.simpleProjectiles = simpleProjectiles;
    logger.info('BasicAbilities initialized with Archer and Berserker abilities');
  }
  
  /**
   * Initialize player ability state
   */
  initializePlayer(playerId: string): void {
    if (!this.playerStates.has(playerId)) {
      this.playerStates.set(playerId, {
        playerId,
        lastUsed: new Map(),
        activeEffects: new Map()
      });
      
      logger.debug(`Initialized ability state for player ${playerId}`);
    }
  }
  
  /**
   * Remove player ability state
   */
  removePlayer(playerId: string): void {
    this.playerStates.delete(playerId);
    logger.debug(`Removed ability state for player ${playerId}`);
  }
  
  /**
   * Use archer ability
   */
  useArcherAbility(
    player: SimplePlayer,
    abilityName: string,
    targetX: number,
    targetY: number
  ): AbilityResult {
    const ability = this.ARCHER_ABILITIES.get(abilityName);
    if (!ability) {
      return { success: false, message: `Unknown archer ability: ${abilityName}` };
    }
    
    // Check cooldown
    const cooldownResult = this.checkCooldown(player.id, abilityName, ability.cooldown);
    if (!cooldownResult.success) {
      return cooldownResult;
    }
    
    // Check range
    const distance = Math.sqrt(
      Math.pow(targetX - player.position.x, 2) + Math.pow(targetY - player.position.y, 2)
    );
    
    if (distance > ability.range) {
      return { success: false, message: 'Target out of range' };
    }
    
    // Execute ability
    switch (abilityName) {
      case 'powershot':
        return this.executePowerShot(player, targetX, targetY, ability);
      case 'multishot':
        return this.executeMultiShot(player, targetX, targetY, ability);
      default:
        return { success: false, message: 'Ability not implemented' };
    }
  }
  
  /**
   * Use berserker ability
   */
  useBerserkerAbility(
    player: SimplePlayer,
    abilityName: string,
    targetX?: number,
    targetY?: number
  ): AbilityResult {
    const ability = this.BERSERKER_ABILITIES.get(abilityName);
    if (!ability) {
      return { success: false, message: `Unknown berserker ability: ${abilityName}` };
    }
    
    // Check cooldown
    const cooldownResult = this.checkCooldown(player.id, abilityName, ability.cooldown);
    if (!cooldownResult.success) {
      return cooldownResult;
    }
    
    // Execute ability
    switch (abilityName) {
      case 'charge':
        return this.executeBerserkerCharge(player, targetX || player.position.x, targetY || player.position.y, ability);
      case 'whirlwind':
        return this.executeWhirlwind(player, ability);
      default:
        return { success: false, message: 'Ability not implemented' };
    }
  }
  
  /**
   * Execute Archer Power Shot
   */
  private executePowerShot(
    player: SimplePlayer,
    targetX: number,
    targetY: number,
    ability: AbilityConfig
  ): AbilityResult {
    // Calculate direction
    const dx = targetX - player.position.x;
    const dy = targetY - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    // Create high-damage arrow projectile using SimpleProjectiles
    const projectileId = this.simpleProjectiles.createProjectile(
      player.id,
      'powershot_arrow',
      player.position.x,
      player.position.y,
      targetX,
      targetY
    );
    
    // Projectile already created above
    this.recordAbilityUse(player.id, ability.name);
    
    logger.info(`${player.id} used Power Shot dealing ${ability.damage} damage`);
    
    return {
      success: true,
      damage: ability.damage,
      projectileId: projectileId || 'failed',
      effects: ['piercing'],
      message: 'Power Shot fired!'
    };
  }
  
  /**
   * Execute Archer Multi Shot
   */
  private executeMultiShot(
    player: SimplePlayer,
    targetX: number,
    targetY: number,
    ability: AbilityConfig
  ): AbilityResult {
    // Calculate base direction
    const dx = targetX - player.position.x;
    const dy = targetY - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const baseAngle = Math.atan2(dy, dx);
    const projectileIds: string[] = [];
    
    // Fire 3 arrows in a spread
    const angles = [baseAngle - 0.3, baseAngle, baseAngle + 0.3]; // ~17 degree spread
    
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      
      // Calculate target position based on angle
      const range = 10; // 10 tiles range
      const targetPosX = player.position.x + dirX * range;
      const targetPosY = player.position.y + dirY * range;
      
      const projectileId = this.simpleProjectiles.createProjectile(
        player.id,
        'multishot_arrow',
        player.position.x,
        player.position.y,
        targetPosX,
        targetPosY
      );
      
      // Projectile already created above
      if (projectileId) projectileIds.push(projectileId);
    }
    
    this.recordAbilityUse(player.id, ability.name);
    
    logger.info(`${player.id} used Multi Shot firing ${angles.length} arrows`);
    
    return {
      success: true,
      damage: ability.damage,
      effects: ['multi_projectile'],
      message: `Multi Shot fired ${angles.length} arrows!`
    };
  }
  
  /**
   * Execute Berserker Charge
   */
  private executeBerserkerCharge(
    player: SimplePlayer,
    targetX: number,
    targetY: number,
    ability: AbilityConfig
  ): AbilityResult {
    // Calculate charge direction
    const dx = targetX - player.position.x;
    const dy = targetY - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 2.0) {
      return { success: false, message: 'Too close to charge' };
    }
    
    const maxChargeDistance = Math.min(distance, ability.range);
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    // Move player forward
    const newX = player.position.x + dirX * maxChargeDistance;
    const newY = player.position.y + dirY * maxChargeDistance;
    
    // Apply charge effect
    this.applyEffect(player.id, 'berserker_charge', ability.duration || 2.0);
    
    this.recordAbilityUse(player.id, ability.name);
    
    logger.info(`${player.id} used Berserker Charge moving ${maxChargeDistance.toFixed(1)} units`);
    
    return {
      success: true,
      damage: ability.damage,
      effects: ['charge_damage', 'movement_boost'],
      message: 'Berserker Charge activated!'
    };
  }
  
  /**
   * Execute Whirlwind
   */
  private executeWhirlwind(
    player: SimplePlayer,
    ability: AbilityConfig
  ): AbilityResult {
    // Apply whirlwind effect
    this.applyEffect(player.id, 'whirlwind', ability.duration || 3.0);
    
    this.recordAbilityUse(player.id, ability.name);
    
    logger.info(`${player.id} used Whirlwind for ${ability.duration} seconds`);
    
    return {
      success: true,
      damage: ability.damage,
      effects: ['area_damage', 'damage_over_time'],
      message: 'Whirlwind activated!'
    };
  }
  
  /**
   * Check if ability is off cooldown
   */
  private checkCooldown(playerId: string, abilityName: string, cooldown: number): AbilityResult {
    const playerState = this.playerStates.get(playerId);
    if (!playerState) {
      this.initializePlayer(playerId);
      return { success: true };
    }
    
    const lastUsed = playerState.lastUsed.get(abilityName);
    if (!lastUsed) {
      return { success: true };
    }
    
    const timeSinceUse = (Date.now() - lastUsed) / 1000;
    const remainingCooldown = cooldown - timeSinceUse;
    
    if (remainingCooldown > 0) {
      return {
        success: false,
        message: `Ability on cooldown for ${remainingCooldown.toFixed(1)} seconds`
      };
    }
    
    return { success: true };
  }
  
  /**
   * Record ability use timestamp
   */
  private recordAbilityUse(playerId: string, abilityName: string): void {
    const playerState = this.playerStates.get(playerId);
    if (playerState) {
      playerState.lastUsed.set(abilityName, Date.now());
    }
  }
  
  /**
   * Apply temporary effect to player
   */
  private applyEffect(playerId: string, effectName: string, duration: number): void {
    const playerState = this.playerStates.get(playerId);
    if (playerState) {
      const endTime = Date.now() + (duration * 1000);
      playerState.activeEffects.set(effectName, endTime);
      
      logger.debug(`Applied effect ${effectName} to ${playerId} for ${duration} seconds`);
    }
  }
  
  /**
   * Check if player has active effect
   */
  hasActiveEffect(playerId: string, effectName: string): boolean {
    const playerState = this.playerStates.get(playerId);
    if (!playerState) return false;
    
    const endTime = playerState.activeEffects.get(effectName);
    if (!endTime) return false;
    
    if (Date.now() > endTime) {
      playerState.activeEffects.delete(effectName);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get remaining cooldown for ability
   */
  getRemainingCooldown(playerId: string, abilityName: string, classType: 'archer' | 'berserker'): number {
    const abilities = classType === 'archer' ? this.ARCHER_ABILITIES : this.BERSERKER_ABILITIES;
    const ability = abilities.get(abilityName);
    if (!ability) return 0;
    
    const playerState = this.playerStates.get(playerId);
    if (!playerState) return 0;
    
    const lastUsed = playerState.lastUsed.get(abilityName);
    if (!lastUsed) return 0;
    
    const timeSinceUse = (Date.now() - lastUsed) / 1000;
    const remainingCooldown = ability.cooldown - timeSinceUse;
    
    return Math.max(0, remainingCooldown);
  }
  
  /**
   * Get all abilities for class
   */
  getClassAbilities(classType: 'archer' | 'berserker'): AbilityConfig[] {
    const abilities = classType === 'archer' ? this.ARCHER_ABILITIES : this.BERSERKER_ABILITIES;
    return Array.from(abilities.values());
  }
  
  /**
   * Get player's active effects
   */
  getActiveEffects(playerId: string): string[] {
    const playerState = this.playerStates.get(playerId);
    if (!playerState) return [];
    
    const now = Date.now();
    const activeEffects: string[] = [];
    
    for (const [effectName, endTime] of playerState.activeEffects.entries()) {
      if (now < endTime) {
        activeEffects.push(effectName);
      } else {
        playerState.activeEffects.delete(effectName);
      }
    }
    
    return activeEffects;
  }
  
  /**
   * Update and clean expired effects
   */
  update(): void {
    const now = Date.now();
    
    for (const playerState of this.playerStates.values()) {
      // Clean up expired effects
      for (const [effectName, endTime] of playerState.activeEffects.entries()) {
        if (now > endTime) {
          playerState.activeEffects.delete(effectName);
          logger.debug(`Effect ${effectName} expired for player ${playerState.playerId}`);
        }
      }
    }
  }
  
  /**
   * Get ability statistics
   */
  getStats(): {
    totalPlayers: number;
    totalAbilities: number;
    activeEffects: number;
    archerAbilities: number;
    berserkerAbilities: number;
  } {
    let activeEffects = 0;
    
    for (const playerState of this.playerStates.values()) {
      activeEffects += playerState.activeEffects.size;
    }
    
    return {
      totalPlayers: this.playerStates.size,
      totalAbilities: this.ARCHER_ABILITIES.size + this.BERSERKER_ABILITIES.size,
      activeEffects,
      archerAbilities: this.ARCHER_ABILITIES.size,
      berserkerAbilities: this.BERSERKER_ABILITIES.size
    };
  }
  
  /**
   * Clean up all player states
   */
  destroy(): void {
    this.playerStates.clear();
    logger.info('BasicAbilities destroyed');
  }
}