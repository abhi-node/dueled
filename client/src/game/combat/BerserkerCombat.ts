/**
 * Berserker Combat Handler
 * 
 * Implements all Berserker-specific combat mechanics:
 * - Basic wide projectile attack (slash wave) with short range
 * - Rage Mode special ability (damage boost when < 50% HP)
 * - Attack timing and cooldowns
 * - Input handling for attacks
 */

import { CombatManager } from './CombatManager.js';
import type { AttackData } from './CombatManager.js';
import type { Vector2 } from '@dueled/shared';
import { ClassType, getClassConfig, calculateEffectiveCooldown } from '@dueled/shared';

export interface BerserkerState {
  playerId: string;
  position: Vector2;
  facingAngle: number; // Current facing direction in radians
  lastBasicAttack: number;
  lastSpecialAttack: number;
  basicAttackCooldown: number; // in seconds
  specialAttackCooldown: number; // in seconds
  isAttacking: boolean;
  rageMode: boolean;
  rageModeActivated: boolean; // If rage mode has been triggered this life
  damageMultiplier: number;
  health: number;
  maxHealth: number;
}

export class BerserkerCombat {
  private combatManager: CombatManager;
  private berserkerStates: Map<string, BerserkerState> = new Map();
  
  // Berserker-specific constants
  private static readonly RAGE_MODE_THRESHOLD = 0.5; // 50% health
  private static readonly RAGE_MODE_DAMAGE_MULTIPLIER = 1.1; // 10% damage boost
  private static readonly BASIC_ATTACK_BASE_COOLDOWN = 1.2; // seconds
  private static readonly SPECIAL_ATTACK_COOLDOWN = 30; // seconds
  
  constructor(combatManager: CombatManager) {
    this.combatManager = combatManager;
  }

  /**
   * Initialize berserker state for a player
   */
  public initializeBerserker(playerId: string, position: Vector2, facingAngle: number = 0): void {
    const classConfig = getClassConfig(ClassType.BERSERKER);
    
    this.berserkerStates.set(playerId, {
      playerId,
      position,
      facingAngle,
      lastBasicAttack: 0,
      lastSpecialAttack: 0,
      basicAttackCooldown: calculateEffectiveCooldown(
        BerserkerCombat.BASIC_ATTACK_BASE_COOLDOWN,
        60 // Berserker agility is lower
      ),
      specialAttackCooldown: BerserkerCombat.SPECIAL_ATTACK_COOLDOWN,
      isAttacking: false,
      rageMode: false,
      rageModeActivated: false,
      damageMultiplier: 1.0,
      health: classConfig.health,
      maxHealth: classConfig.health
    });
  }

  /**
   * Update berserker state
   */
  public updateBerserker(playerId: string, position: Vector2, facingAngle: number, health: number): void {
    const state = this.berserkerStates.get(playerId);
    if (!state) return;
    
    state.position = position;
    state.facingAngle = facingAngle;
    state.health = health;
    
    // Auto-activate rage mode when health drops below 50%
    if (!state.rageModeActivated && health / state.maxHealth < BerserkerCombat.RAGE_MODE_THRESHOLD) {
      this.activateRageMode(playerId);
    }
  }

  /**
   * Try to perform basic attack
   */
  public tryBasicAttack(playerId: string, targetPosition: Vector2): boolean {
    const state = this.berserkerStates.get(playerId);
    if (!state) return false;
    
    const currentTime = Date.now() / 1000;
    const timeSinceLastAttack = currentTime - state.lastBasicAttack;
    
    if (timeSinceLastAttack < state.basicAttackCooldown) {
      return false; // Still on cooldown
    }
    
    // Update state
    state.lastBasicAttack = currentTime;
    state.isAttacking = true;
    
    // Create attack data
    const attackData: AttackData = {
      attackerId: playerId,
      targetPosition,
      classType: ClassType.BERSERKER,
      timestamp: Date.now()
    };
    
    // Let combat manager handle the projectile creation
    this.combatManager.handleAttack(attackData);
    
    // Reset attacking state after a short delay
    setTimeout(() => {
      if (state) state.isAttacking = false;
    }, 200);
    
    return true;
  }

  /**
   * Activate rage mode (automatic when < 50% health)
   */
  private activateRageMode(playerId: string): void {
    const state = this.berserkerStates.get(playerId);
    if (!state || state.rageModeActivated) return;
    
    state.rageMode = true;
    state.rageModeActivated = true;
    state.damageMultiplier = BerserkerCombat.RAGE_MODE_DAMAGE_MULTIPLIER;
    
    console.log(`🔥 Berserker ${playerId} entered RAGE MODE! Damage +${(BerserkerCombat.RAGE_MODE_DAMAGE_MULTIPLIER - 1) * 100}%`);
  }

  /**
   * Get current cooldowns for UI
   */
  public getCooldowns(playerId: string): { basic: number; special: number } {
    const state = this.berserkerStates.get(playerId);
    if (!state) return { basic: 0, special: 0 };
    
    const currentTime = Date.now() / 1000;
    
    const basicRemaining = Math.max(0, 
      state.basicAttackCooldown - (currentTime - state.lastBasicAttack)
    );
    
    const specialRemaining = Math.max(0,
      state.specialAttackCooldown - (currentTime - state.lastSpecialAttack)
    );
    
    return {
      basic: basicRemaining,
      special: specialRemaining
    };
  }

  /**
   * Get berserker state
   */
  public getBerserkerState(playerId: string): BerserkerState | undefined {
    return this.berserkerStates.get(playerId);
  }

  /**
   * Check if berserker can attack
   */
  public canAttack(playerId: string): boolean {
    const state = this.berserkerStates.get(playerId);
    if (!state) return false;
    
    const currentTime = Date.now() / 1000;
    return currentTime - state.lastBasicAttack >= state.basicAttackCooldown;
  }

  /**
   * Reset berserker state (on respawn)
   */
  public resetBerserker(playerId: string): void {
    const state = this.berserkerStates.get(playerId);
    if (!state) return;
    
    state.rageMode = false;
    state.rageModeActivated = false;
    state.damageMultiplier = 1.0;
    state.health = state.maxHealth;
    state.lastBasicAttack = 0;
    state.lastSpecialAttack = 0;
  }

  /**
   * Clean up berserker state
   */
  public removeBerserker(playerId: string): void {
    this.berserkerStates.delete(playerId);
  }

  /**
   * Get all berserker states (for debugging)
   */
  public getAllStates(): Map<string, BerserkerState> {
    return this.berserkerStates;
  }
}