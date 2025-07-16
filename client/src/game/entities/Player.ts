import Phaser from 'phaser';
import type { Vector2, ClassType } from '@dueled/shared';

export class Player {
  public sprite!: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private playerId: string = '';
  private playerName: string = '';
  private classType: ClassType = 'berserker' as ClassType;
  private isLocal: boolean = false;
  private maxHealth: number = 100;
  private currentHealth: number = 100;
  private armor: number = 0;
  private speed: number = 200;
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
    
    this.createSprite(x, y);
    this.setupPhysics();
    this.setupAnimations();
    this.createUI();
    this.setupClassStats();
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
    // Set stats based on class type
    const classStats = {
      berserker: { health: 150, armor: 50, speed: 180 },
      mage: { health: 100, armor: 30, speed: 160 },
      bomber: { health: 120, armor: 40, speed: 170 },
      archer: { health: 80, armor: 20, speed: 220 },
    };
    
    const stats = classStats[this.classType];
    this.maxHealth = stats.health;
    this.currentHealth = stats.health;
    this.armor = stats.armor;
    this.speed = stats.speed;
    
    // Update physics body max velocity
    this.sprite.body!.setMaxVelocity(this.speed, this.speed);
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
      this.facing = 'right';
      this.sprite.setFlipX(false);
    } else if (this.velocity.x < 0) {
      this.facing = 'left';
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
  public attack(): boolean {
    if (this.attackCooldown > 0) return false;
    
    // Set cooldown based on class
    const attackCooldowns = {
      berserker: 800,
      mage: 1200,
      bomber: 1500,
      archer: 600,
    };
    
    this.attackCooldown = attackCooldowns[this.classType];
    
    // Play attack animation
    this.playAttackEffect();
    
    return true;
  }

  public useAbility(): boolean {
    if (this.abilityCooldown > 0) return false;
    
    // Set cooldown based on class
    const abilityCooldowns = {
      berserker: 5000,
      mage: 8000,
      bomber: 10000,
      archer: 6000,
    };
    
    this.abilityCooldown = abilityCooldowns[this.classType];
    
    // Play ability effect
    this.playAbilityEffect();
    
    return true;
  }

  private playAttackEffect(): void {
    // Create attack effect
    const attackEffect = this.scene.add.circle(this.sprite.x, this.sprite.y, 30, 0xfbbf24, 0.5);
    attackEffect.setDepth(5);
    
    // Animate attack effect
    this.scene.tweens.add({
      targets: attackEffect,
      alpha: 0,
      scale: 2,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        attackEffect.destroy();
      },
    });
    
    // Screen shake for local player
    if (this.isLocal) {
      this.scene.cameras.main.shake(100, 0.01);
    }
  }

  private playAbilityEffect(): void {
    // Create ability effect based on class
    const effectColors = {
      berserker: 0xff4444,
      mage: 0x4444ff,
      bomber: 0xff8800,
      archer: 0x44ff44,
    };
    
    const abilityEffect = this.scene.add.circle(this.sprite.x, this.sprite.y, 50, effectColors[this.classType], 0.7);
    abilityEffect.setDepth(5);
    
    // Animate ability effect
    this.scene.tweens.add({
      targets: abilityEffect,
      alpha: 0,
      scale: 3,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        abilityEffect.destroy();
      },
    });
  }

  // Network methods
  public updatePosition(position: Vector2, velocity?: Vector2): void {
    if (!this.isLocal) {
      this.targetPosition = position;
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

  public takeDamage(damage: number, damageType: string = 'physical'): void {
    // Calculate damage reduction based on armor
    let finalDamage = damage;
    if (damageType === 'physical') {
      finalDamage = Math.max(1, damage - this.armor * 0.1);
    }
    
    this.currentHealth = Math.max(0, this.currentHealth - finalDamage);
    
    // Play damage effect
    this.playDamageEffect(finalDamage);
    
    // Check if dead
    if (this.currentHealth <= 0) {
      this.handleDeath();
    }
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

  public destroy(): void {
    this.sprite.destroy();
    this.nameTag.destroy();
    this.healthBar.destroy();
  }
}