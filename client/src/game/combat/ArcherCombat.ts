/**
 * Archer Combat Handler
 * 
 * Implements all Archer-specific combat mechanics:
 * - Basic piercing arrows with 50% armor penetration
 * - Dispatcher special ability (homing arrow)
 * - Attack timing and cooldowns
 * - Input handling for attacks
 */

import { CombatManager } from './CombatManager.js';
import type { AttackData } from './CombatManager.js';
import type { Vector2 } from '@dueled/shared';
import { ClassType, getClassConfig, calculateEffectiveCooldown } from '@dueled/shared';

export interface ArcherState {
  playerId: string;
  position: Vector2;
  facingAngle: number; // Current facing direction in radians
  lastBasicAttack: number;
  lastSpecialAttack: number;
  basicAttackCooldown: number; // in seconds
  specialAttackCooldown: number; // in seconds
  isAttacking: boolean;
  specialCharges: number;
  maxSpecialCharges: number;
}

export class ArcherCombat {
  private combatManager: CombatManager;
  private archerStates: Map<string, ArcherState> = new Map();
  
  constructor(combatManager: CombatManager) {
    this.combatManager = combatManager;
  }

  /**
   * Register an archer for combat tracking
   */
  public registerArcher(playerId: string, position: Vector2, facingAngle: number): void {
    const classConfig = getClassConfig(ClassType.ARCHER);
    const weapon = classConfig.weapon;
    const special = classConfig.specialAbility;
    
    // Calculate cooldowns based on archer's intelligence stat
    const basicCooldown = 1.0 / weapon.attackSpeed; // Convert attacks per second to cooldown
    const specialCooldown = calculateEffectiveCooldown(special.baseCooldown, classConfig.stats.intelligence);
    
    const archerState: ArcherState = {
      playerId,
      position: { ...position },
      facingAngle,
      lastBasicAttack: 0,
      lastSpecialAttack: 0,
      basicAttackCooldown: basicCooldown,
      specialAttackCooldown: specialCooldown,
      isAttacking: false,
      specialCharges: 1,
      maxSpecialCharges: 1
    };
    
    this.archerStates.set(playerId, archerState);
    
    // Register with combat manager
    this.combatManager.registerPlayer(playerId, position, ClassType.ARCHER);
    
    console.log(`🏹 Archer registered: ${playerId} (Basic: ${basicCooldown.toFixed(2)}s, Special: ${specialCooldown.toFixed(1)}s)`);
  }

  /**
   * Update archer position and facing direction
   */
  public updateArcherPosition(playerId: string, position: Vector2, facingAngle: number): void {
    const archer = this.archerStates.get(playerId);
    if (archer) {
      archer.position = { ...position };
      archer.facingAngle = facingAngle;
      
      // Update combat manager
      this.combatManager.updatePlayerPosition(playerId, position);
    }
  }

  /**
   * Attempt basic attack (piercing arrow)
   */
  public tryBasicAttack(playerId: string, targetPosition?: Vector2): boolean {
    const archer = this.archerStates.get(playerId);
    if (!archer) return false;
    
    const currentTime = Date.now() / 1000;
    
    // Check cooldown
    if (currentTime - archer.lastBasicAttack < archer.basicAttackCooldown) {
      return false;
    }
    
    // Calculate target position if not provided (shoot in facing direction)
    let attackTarget = targetPosition;
    if (!attackTarget) {
      const range = getClassConfig(ClassType.ARCHER).weapon.range;
      attackTarget = {
        x: archer.position.x + Math.cos(archer.facingAngle) * range * 32, // Convert tiles to pixels
        y: archer.position.y + Math.sin(archer.facingAngle) * range * 32
      };
    }
    
    // Create attack data
    const attackData: AttackData = {
      attackerId: playerId,
      targetPosition: attackTarget,
      classType: ClassType.ARCHER,
      attackType: 'basic',
      timestamp: Date.now()
    };
    
    // Execute attack through combat manager
    const projectile = this.combatManager.archerBasicAttack(attackData);
    
    if (projectile) {
      archer.lastBasicAttack = currentTime;
      archer.isAttacking = true;
      
      // Reset attacking flag after short delay
      setTimeout(() => {
        archer.isAttacking = false;
      }, 200);
      
      console.log(`🏹 ${playerId} fired basic arrow at (${attackTarget.x.toFixed(1)}, ${attackTarget.y.toFixed(1)})`);
      return true;
    }
    
    return false;
  }

  /**
   * Attempt special attack (Dispatcher - homing arrow)
   */
  public trySpecialAttack(playerId: string): boolean {
    const archer = this.archerStates.get(playerId);
    if (!archer) return false;
    
    const currentTime = Date.now() / 1000;
    
    // Check cooldown and charges
    if (currentTime - archer.lastSpecialAttack < archer.specialAttackCooldown || archer.specialCharges <= 0) {
      return false;
    }
    
    // Create attack data (target position not needed for homing)
    const attackData: AttackData = {
      attackerId: playerId,
      targetPosition: { x: 0, y: 0 }, // Will be set automatically to nearest enemy
      classType: ClassType.ARCHER,
      attackType: 'special',
      timestamp: Date.now()
    };
    
    // Execute special attack through combat manager
    const projectile = this.combatManager.archerSpecialAttack(attackData);
    
    if (projectile) {
      archer.lastSpecialAttack = currentTime;
      archer.specialCharges--;
      archer.isAttacking = true;
      
      // Reset attacking flag after short delay
      setTimeout(() => {
        archer.isAttacking = false;
      }, 300);
      
      // Recharge special after cooldown
      setTimeout(() => {
        if (archer.specialCharges < archer.maxSpecialCharges) {
          archer.specialCharges++;
        }
      }, archer.specialAttackCooldown * 1000);
      
      console.log(`⚡ ${playerId} fired Dispatcher (homing arrow)`);
      return true;
    }
    
    return false;
  }

  /**
   * Check if basic attack is ready
   */
  public canBasicAttack(playerId: string): boolean {
    const archer = this.archerStates.get(playerId);
    if (!archer) return false;
    
    const currentTime = Date.now() / 1000;
    return (currentTime - archer.lastBasicAttack) >= archer.basicAttackCooldown;
  }

  /**
   * Check if special attack is ready
   */
  public canSpecialAttack(playerId: string): boolean {
    const archer = this.archerStates.get(playerId);
    if (!archer) return false;
    
    const currentTime = Date.now() / 1000;
    return (currentTime - archer.lastSpecialAttack) >= archer.specialAttackCooldown && archer.specialCharges > 0;
  }

  /**
   * Get remaining cooldown times for UI
   */
  public getCooldowns(playerId: string): { basic: number; special: number; specialCharges: number } {
    const archer = this.archerStates.get(playerId);
    if (!archer) return { basic: 0, special: 0, specialCharges: 0 };
    
    const currentTime = Date.now() / 1000;
    
    const basicRemaining = Math.max(0, archer.basicAttackCooldown - (currentTime - archer.lastBasicAttack));
    const specialRemaining = Math.max(0, archer.specialAttackCooldown - (currentTime - archer.lastSpecialAttack));
    
    return {
      basic: basicRemaining,
      special: specialRemaining,
      specialCharges: archer.specialCharges
    };
  }

  /**
   * Get archer combat state for debugging
   */
  public getArcherState(playerId: string): ArcherState | undefined {
    return this.archerStates.get(playerId);
  }

  /**
   * Remove archer from tracking
   */
  public unregisterArcher(playerId: string): void {
    this.archerStates.delete(playerId);
    this.combatManager.unregisterPlayer(playerId);
    console.log(`🏹 Archer unregistered: ${playerId}`);
  }

  /**
   * Handle mouse/pointer input for aiming and attacking
   */
  public handlePointerInput(playerId: string, screenPosition: Vector2, worldPosition: Vector2, isAttack: boolean): boolean {
    const archer = this.archerStates.get(playerId);
    if (!archer) return false;
    
    // Update facing direction based on mouse position
    const dx = worldPosition.x - archer.position.x;
    const dy = worldPosition.y - archer.position.y;
    archer.facingAngle = Math.atan2(dy, dx);
    
    // Perform attack if requested
    if (isAttack) {
      return this.tryBasicAttack(playerId, worldPosition);
    }
    
    return false;
  }

  /**
   * Handle keyboard input for special abilities
   */
  public handleKeyboardInput(playerId: string, key: string): boolean {
    switch (key.toLowerCase()) {
      case ' ': // Spacebar for basic attack
      case 'click':
        return this.tryBasicAttack(playerId);
        
      case 'f': // F key for special attack
        return this.trySpecialAttack(playerId);
        
      default:
        return false;
    }
  }

  /**
   * Update archer combat states
   */
  public update(deltaTime: number): void {
    // Update is handled by the CombatManager
    // This method is here for future archer-specific update logic
  }
} 