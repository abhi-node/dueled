import Phaser from 'phaser';
import type { Vector2, ClassType, ClassConfig, ClassStats } from '@dueled/shared';
import { getClassConfig, calculateEffectiveDamage, calculateDashCooldown, calculateEffectiveCooldown } from '@dueled/shared';

export class Player {
  public sprite!: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private playerId: string = '';
  private playerName: string = '';
  private classType: ClassType = 'berserker' as ClassType;
  private classConfig!: ClassConfig;
  private isLocal: boolean = false;
  
  // Core stats from class configuration
  private baseStats!: ClassStats;
  private maxHealth: number = 100;
  private currentHealth: number = 100;
  private armor: number = 0;
  private speed: number = 200;
  
  // New stat system
  private stamina: number = 50;
  private strength: number = 50;
  private intelligence: number = 50;
  
  // Cooldown and ability tracking
  private dashCooldownTime: number = 3.0;
  private lastDashTime: number = 0;
  private specialAbilityCooldown: number = 0;
  private lastSpecialAbilityTime: number = 0;
  
  // Movement and combat
  private lastPosition: Vector2 = { x: 0, y: 0 };
  private _targetPosition: Vector2 = { x: 0, y: 0 };
  private velocity: Vector2 = { x: 0, y: 0 };
  private _interpolationAlpha: number = 0;
  private nameTag!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private _animations: Map<string, Phaser.Animations.Animation> = new Map();
  private currentAnimation: string = 'idle';
  private _facing: 'left' | 'right' = 'right';
  private isMoving: boolean = false;
  private _lastMoveTime: number = 0;
  private moveBuffer: Vector2[] = [];
  private attackCooldown: number = 0;
  private abilityCooldown: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, classType: ClassType, isLocal: boolean) {
    this.scene = scene;
    this.classType = classType;
    this.isLocal = isLocal;
    
    this.loadClassConfiguration();
    this.createSprite(x, y);
    this.setupPhysics();
    this.setupAnimations();
    this.createUI();
    this.setupClassStats();
  }

  /**
   * Load class configuration and apply base stats
   */
  private loadClassConfiguration(): void {
    this.classConfig = getClassConfig(this.classType);
    this.baseStats = this.classConfig.stats;
    
    console.log(`🎯 Player: Loaded ${this.classType} configuration:`, this.classConfig);
  }

  private createSprite(x: number, y: number): void {
    // Create sprite based on class type
    const spriteKey = `player-${this.classType}`;
    
    // For now, create a simple rectangle if sprite doesn't exist
    if (!this.scene.textures.exists(spriteKey)) {
      this.sprite = this.scene.physics.add.sprite(x, y, 'wall');
      this.sprite.setDisplaySize(30, 30);
      
      // Set color based on class
      const classColors = {
        berserker: 0xff4444,
        mage: 0x4444ff,
        bomber: 0xff8800,
        archer: 0x44ff44,
      };
      
      this.sprite.setTint(classColors[this.classType]);
    } else {
      this.sprite = this.scene.physics.add.sprite(x, y, spriteKey);
    }
    
    // Set sprite properties
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(10);
    
    // Add glow effect for local player
    if (this.isLocal) {
      this.sprite.setTint(0xccccff);
    }
    
    // Store initial position
    this.lastPosition = { x, y };
    this._targetPosition = { x, y };
  }

  private setupPhysics(): void {
    // Enable physics
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setDrag(500);
    this.sprite.setBounce(0.2);
    
    // Set physics body size
    this.sprite.body!.setSize(24, 24);
    
    // Set physics properties
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (body && 'setMaxVelocity' in body) {
      body.setMaxVelocity(this.speed, this.speed);
    }
  }

  private setupAnimations(): void {
    // Create animations for each class
    this.createIdleAnimation();
    this.createWalkAnimation();
    this.createAttackAnimation();
    this.createAbilityAnimation();
    
    // Start with idle animation
    this.playAnimation('idle');
  }

  private createIdleAnimation(): void {
    // Simple idle animation (placeholder)
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 1.05,
      duration: 1000,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });
  }

  private createWalkAnimation(): void {
    // Walking animation will be implemented when we have sprite sheets
    // For now, just a simple bob
  }

  private createAttackAnimation(): void {
    // Attack animation placeholder
  }

  private createAbilityAnimation(): void {
    // Ability animation placeholder
  }

  private createUI(): void {
    // Create name tag
    this.nameTag = this.scene.add.text(this.sprite.x, this.sprite.y - 50, this.playerName, {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#000000',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5);
    
    // Create health bar
    this.healthBar = this.scene.add.graphics();
    this.updateHealthBar();
  }

  private setupClassStats(): void {
    // Apply stats from class configuration
    this.maxHealth = this.baseStats.health;
    this.currentHealth = this.baseStats.health;
    this.armor = this.baseStats.defense;
    this.speed = this.baseStats.speed;
    this.stamina = this.baseStats.stamina;
    this.strength = this.baseStats.strength;
    this.intelligence = this.baseStats.intelligence;
    
    // Calculate derived stats
    this.dashCooldownTime = calculateDashCooldown(this.stamina);
    this.specialAbilityCooldown = calculateEffectiveCooldown(
      this.classConfig.specialAbility.baseCooldown, 
      this.intelligence
    );
    
    // Update physics body max velocity
    if (this.sprite.body && 'setMaxVelocity' in this.sprite.body) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setMaxVelocity(this.speed, this.speed);
    }
    
    console.log(`🎯 Player: ${this.classType} stats applied:`, {
      health: this.maxHealth,
      armor: this.armor,
      speed: this.speed,
      stamina: this.stamina,
      strength: this.strength,
      intelligence: this.intelligence,
      dashCooldown: this.dashCooldownTime,
      specialCooldown: this.specialAbilityCooldown
    });
  }

  public update(time: number, delta: number): void {
    // Update cooldowns
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.abilityCooldown = Math.max(0, this.abilityCooldown - delta);
    
    // Update position interpolation for remote players
    if (!this.isLocal) {
      this.updatePositionInterpolation(delta);
    }
    
    // Update animations
    this.updateAnimations();
    
    // Update UI
    this.updateUI();
    
    // Check for movement
    this.checkMovement();
    
    // Update facing direction
    this.updateFacing();
  }

  private updatePositionInterpolation(delta: number): void {
    // Smooth interpolation for remote players
    if (this.moveBuffer.length > 0) {
      const target = this.moveBuffer[0];
      const distance = Phaser.Math.Distance.Between(
        this.sprite.x, this.sprite.y,
        target.x, target.y
      );
      
      if (distance < 5) {
        // Close enough, move to exact position
        this.sprite.setPosition(target.x, target.y);
        this.moveBuffer.shift();
      } else {
        // Interpolate towards target
        const interpolationSpeed = 0.1;
        const newX = Phaser.Math.Interpolation.Linear([this.sprite.x, target.x], interpolationSpeed);
        const newY = Phaser.Math.Interpolation.Linear([this.sprite.y, target.y], interpolationSpeed);
        this.sprite.setPosition(newX, newY);
      }
    }
  }

  private updateAnimations(): void {
    // Update current animation based on state
    if (this.isMoving) {
      this.playAnimation('walk');
    } else {
      this.playAnimation('idle');
    }
  }

  private updateUI(): void {
    // Update name tag position
    this.nameTag.setPosition(this.sprite.x, this.sprite.y - 50);
    
    // Update health bar
    this.updateHealthBar();
  }

  private updateHealthBar(): void {
    const healthPercentage = this.currentHealth / this.maxHealth;
    
    this.healthBar.clear();
    
    // Background
    this.healthBar.fillStyle(0x2d3748);
    this.healthBar.fillRect(this.sprite.x - 25, this.sprite.y - 40, 50, 6);
    
    // Health bar
    const healthColor = healthPercentage > 0.5 ? 0x48bb78 : healthPercentage > 0.25 ? 0xed8936 : 0xe53e3e;
    this.healthBar.fillStyle(healthColor);
    this.healthBar.fillRect(this.sprite.x - 24, this.sprite.y - 39, 48 * healthPercentage, 4);
    
    // Border
    this.healthBar.lineStyle(1, 0x4a5568);
    this.healthBar.strokeRect(this.sprite.x - 25, this.sprite.y - 40, 50, 6);
  }

  private checkMovement(): void {
    const currentPos = { x: this.sprite.x, y: this.sprite.y };
    const distance = Phaser.Math.Distance.Between(
      this.lastPosition.x, this.lastPosition.y,
      currentPos.x, currentPos.y
    );
    
    this.isMoving = distance > 1;
    this.lastPosition = currentPos;
  }

  private updateFacing(): void {
    if (this.velocity.x > 0) {
      this._facing = 'right';
      this.sprite.setFlipX(false);
    } else if (this.velocity.x < 0) {
      this._facing = 'left';
      this.sprite.setFlipX(true);
    }
  }

  private playAnimation(animationName: string): void {
    if (this.currentAnimation !== animationName) {
      this.currentAnimation = animationName;
      // Play animation if it exists
      if (this.sprite.anims && this.sprite.anims.exists(animationName)) {
        this.sprite.anims.play(animationName);
      }
    }
  }

  // Movement methods
  public moveUp(): void {
    if (this.isLocal) {
      this.sprite.setVelocityY(-this.speed);
      this.velocity.y = -this.speed;
    }
  }

  public moveDown(): void {
    if (this.isLocal) {
      this.sprite.setVelocityY(this.speed);
      this.velocity.y = this.speed;
    }
  }

  public moveLeft(): void {
    if (this.isLocal) {
      this.sprite.setVelocityX(-this.speed);
      this.velocity.x = -this.speed;
    }
  }

  public moveRight(): void {
    if (this.isLocal) {
      this.sprite.setVelocityX(this.speed);
      this.velocity.x = this.speed;
    }
  }

  public stopMovement(): void {
    if (this.isLocal) {
      this.sprite.setVelocity(0, 0);
      this.velocity = { x: 0, y: 0 };
    }
  }

  // Combat methods
  /**
   * Dash mechanics for Q/E keys
   */
  public canDash(): boolean {
    const currentTime = Date.now();
    return (currentTime - this.lastDashTime) >= (this.dashCooldownTime * 1000);
  }

  public performDash(direction: 'left' | 'right'): boolean {
    if (!this.canDash()) {
      return false;
    }

    const dashDistance = 2.0; // tiles
    const dashDirection = direction === 'left' ? -1 : 1;
    
    // Calculate new position
    const currentPos = this.getPosition();
    const newX = currentPos.x + (dashDirection * dashDistance);
    
    // TODO: Add collision detection for dash target position
    
    // Apply dash movement
    this.setPosition({ x: newX, y: currentPos.y });
    this.lastDashTime = Date.now();
    
    console.log(`🏃 Player: Performed ${direction} dash, cooldown: ${this.dashCooldownTime}s`);
    return true;
  }

  /**
   * Special ability activation
   */
  public canUseSpecialAbility(): boolean {
    const currentTime = Date.now();
    return (currentTime - this.lastSpecialAbilityTime) >= (this.specialAbilityCooldown * 1000);
  }

  public useSpecialAbility(): boolean {
    if (!this.canUseSpecialAbility()) {
      return false;
    }

    const ability = this.classConfig.specialAbility;
    this.lastSpecialAbilityTime = Date.now();
    
    console.log(`⚡ Player: Used special ability ${ability.name} (${this.classType})`);
    
    // TODO: Implement specific ability effects based on ability.effects
    return true;
  }

  /**
   * Attack with class-specific weapon
   */
  public attack(): boolean {
    if (this.attackCooldown > 0) {
      return false;
    }

    const weapon = this.classConfig.weapon;
    const effectiveDamage = calculateEffectiveDamage(weapon.damage, this.strength);
    
    // Set cooldown based on weapon attack speed
    this.attackCooldown = 1.0 / weapon.attackSpeed;
    
    console.log(`⚔️ Player: ${this.classType} attacks with ${weapon.name} for ${effectiveDamage} damage`);
    
    // TODO: Implement attack logic based on weapon type and effects
    return true;
  }

  // Network methods
  public updatePosition(position: Vector2, velocity?: Vector2): void {
    if (!this.isLocal) {
      this._targetPosition = position;
      this.moveBuffer.push(position);
      
      // Limit buffer size
      if (this.moveBuffer.length > 10) {
        this.moveBuffer.shift();
      }
      
      if (velocity) {
        this.velocity = velocity;
      }
    }
  }

  /**
   * Take damage with armor calculation
   */
  public takeDamage(damage: number, damageType: string = 'physical'): number {
    // Apply armor reduction using the PRD formula
    const armorReduction = this.armor / (this.armor + 100);
    let effectiveDamage = damage * (1 - armorReduction);
    
    // Apply weapon-specific modifiers
    if (damageType === 'armor_burn') {
      // Fire damage bypasses 25% armor (Bomber ability)
      const bypassedArmor = this.armor * 0.25;
      const reducedArmor = this.armor - bypassedArmor;
      const bypassReduction = reducedArmor / (reducedArmor + 100);
      effectiveDamage = damage * (1 - bypassReduction);
    } else if (damageType === 'piercing') {
      // Piercing ignores 50% armor (Archer ability)
      const reducedArmor = this.armor * 0.5;
      const piercingReduction = reducedArmor / (reducedArmor + 100);
      effectiveDamage = damage * (1 - piercingReduction);
    }
    
    this.currentHealth -= effectiveDamage;
    this.currentHealth = Math.max(0, this.currentHealth);
    
    console.log(`💥 Player: Took ${effectiveDamage} damage (${damageType}), health: ${this.currentHealth}/${this.maxHealth}`);
    
    return effectiveDamage;
  }

  private playDamageEffect(damage: number): void {
    // Red flash effect
    this.sprite.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      this.sprite.clearTint();
    });
    
    // Damage number popup
    const damageText = this.scene.add.text(this.sprite.x, this.sprite.y - 60, `-${Math.round(damage)}`, {
      fontSize: '14px',
      color: '#ff0000',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    
    // Animate damage text
    this.scene.tweens.add({
      targets: damageText,
      y: damageText.y - 30,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        damageText.destroy();
      },
    });
  }

  private handleDeath(): void {
    // Play death animation
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        this.sprite.setVisible(false);
      },
    });
    
    // Hide UI
    this.nameTag.setVisible(false);
    this.healthBar.setVisible(false);
  }

  // Getters and setters
  public getPosition(): Vector2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  public setPosition(position: Vector2): void {
    this.sprite.setPosition(position.x, position.y);
    this.lastPosition = position;
  }

  public getVelocity(): Vector2 {
    return this.velocity;
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public setPlayerId(id: string): void {
    this.playerId = id;
  }

  public getPlayerName(): string {
    return this.playerName;
  }

  public setPlayerName(name: string): void {
    this.playerName = name;
    this.nameTag.setText(name);
  }

  public getClassType(): ClassType {
    return this.classType;
  }

  public getCurrentHealth(): number {
    return this.currentHealth;
  }

  public getMaxHealth(): number {
    return this.maxHealth;
  }

  public isAlive(): boolean {
    return this.currentHealth > 0;
  }

  public getAttackCooldown(): number {
    return this.attackCooldown;
  }

  public getAbilityCooldown(): number {
    return this.abilityCooldown;
  }

  /**
   * Get current stats for UI display
   */
  public getStats(): ClassStats & { currentHealth: number; maxHealth: number } {
    return {
      health: this.maxHealth,
      defense: this.armor,
      speed: this.speed,
      stamina: this.stamina,
      strength: this.strength,
      intelligence: this.intelligence,
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth
    };
  }

  /**
   * Get class configuration for external access
   */
  public getClassConfig(): ClassConfig {
    return this.classConfig;
  }

  public destroy(): void {
    this.sprite.destroy();
    this.nameTag.destroy();
    this.healthBar.destroy();
  }
}