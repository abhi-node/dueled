import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { NetworkManager } from '../network/NetworkManager';
import type { GameAction, Vector2, ActionType } from '@dueled/shared';

export class InputManager {
  private scene: Phaser.Scene;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: any = null;
  private mouse: Phaser.Input.Pointer | null = null;
  private isEnabled: boolean = false;
  private inputBuffer: any[] = [];
  private lastInputTime: number = 0;
  private inputSequence: number = 0;
  private keyStates: Map<string, boolean> = new Map();
  private lastMoveTime: number = 0;
  private movementThreshold: number = 16; // Send move updates every 16ms (60fps)
  private lastSentPosition: Vector2 = { x: 0, y: 0 };
  private positionThreshold: number = 2; // Only send if moved more than 2 pixels
  private networkManager: NetworkManager | null = null;
  private touchControls: any = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupTouchControls();
  }

  public setupInput(cursors: Phaser.Types.Input.Keyboard.CursorKeys, wasd: any): void {
    this.cursors = cursors;
    this.wasd = wasd;
    this.mouse = this.scene.input.activePointer;
    
    this.setupKeyboardEvents();
    this.setupMouseEvents();
  }

  private setupKeyboardEvents(): void {
    if (!this.scene.input.keyboard) return;

    // Handle key down events
    this.scene.input.keyboard.on('keydown', (event: KeyboardEvent) => {
      if (!this.isEnabled) return;

      const key = event.code;
      this.keyStates.set(key, true);
      
      // Handle special keys
      switch (key) {
        case 'Space':
          this.handleAttack();
          break;
        case 'KeyQ':
          this.handleAbility();
          break;
        case 'KeyE':
          this.handleSecondaryAbility();
          break;
        case 'Escape':
          this.handlePause();
          break;
        case 'Tab':
          event.preventDefault();
          this.handleScoreboard();
          break;
        case 'Enter':
          this.handleChat();
          break;
      }
    });

    // Handle key up events
    this.scene.input.keyboard.on('keyup', (event: KeyboardEvent) => {
      const key = event.code;
      this.keyStates.delete(key);
    });
  }

  private setupMouseEvents(): void {
    if (!this.scene.input) return;

    // Handle mouse clicks
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.isEnabled) return;

      if (pointer.leftButtonDown()) {
        this.handleAttack();
      } else if (pointer.rightButtonDown()) {
        this.handleAbility();
      }
    });

    // Handle mouse movement for aiming
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isEnabled) return;
      
      this.updateAiming(pointer);
    });
  }

  private setupTouchControls(): void {
    // Touch controls for mobile devices
    if (this.scene.sys.game.device.input.touch) {
      this.createVirtualControls();
    }
  }

  private createVirtualControls(): void {
    // Create virtual joystick and buttons for mobile
    // This would be implemented with UI elements
    const { width, height } = this.scene.cameras.main;
    
    // Virtual joystick area (left side)
    const joystickArea = this.scene.add.zone(100, height - 100, 150, 150);
    joystickArea.setInteractive();
    
    // Attack button (right side)
    const attackButton = this.scene.add.circle(width - 80, height - 120, 40, 0xff4444, 0.5);
    attackButton.setInteractive();
    attackButton.on('pointerdown', () => this.handleAttack());
    
    // Ability button (right side)
    const abilityButton = this.scene.add.circle(width - 80, height - 60, 30, 0x4444ff, 0.5);
    abilityButton.setInteractive();
    abilityButton.on('pointerdown', () => this.handleAbility());
    
    // Store references
    this.touchControls = {
      joystick: joystickArea,
      attackButton,
      abilityButton,
    };
  }

  public update(player: Player): void {
    if (!this.isEnabled || !player) return;

    this.processMovementInput(player);
    this.processInputBuffer();
    this.sendMovementUpdates(player);
  }

  private processMovementInput(player: Player): void {
    let velocityX = 0;
    let velocityY = 0;
    let isMoving = false;

    // Check keyboard input
    if (this.cursors && this.wasd) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) {
        velocityX = -1;
        isMoving = true;
      }
      if (this.cursors.right.isDown || this.wasd.D.isDown) {
        velocityX = 1;
        isMoving = true;
      }
      if (this.cursors.up.isDown || this.wasd.W.isDown) {
        velocityY = -1;
        isMoving = true;
      }
      if (this.cursors.down.isDown || this.wasd.S.isDown) {
        velocityY = 1;
        isMoving = true;
      }
    }

    // Normalize diagonal movement
    if (velocityX !== 0 && velocityY !== 0) {
      velocityX *= 0.707; // 1/sqrt(2)
      velocityY *= 0.707;
    }

    // Apply movement
    if (isMoving) {
      if (velocityX < 0) player.moveLeft();
      else if (velocityX > 0) player.moveRight();
      
      if (velocityY < 0) player.moveUp();
      else if (velocityY > 0) player.moveDown();
    } else {
      player.stopMovement();
    }
  }

  private processInputBuffer(): void {
    // Process queued inputs
    const now = Date.now();
    
    while (this.inputBuffer.length > 0) {
      const input = this.inputBuffer.shift();
      if (now - input.timestamp < 100) { // Only process recent inputs
        this.executeInput(input);
      }
    }
  }

  private executeInput(input: any): void {
    // Execute buffered input
    switch (input.type) {
      case 'attack':
        this.sendAttackAction();
        break;
      case 'ability':
        this.sendAbilityAction();
        break;
      case 'move':
        this.sendMoveAction(input.position, input.velocity);
        break;
    }
  }

  private sendMovementUpdates(player: Player): void {
    const now = Date.now();
    
    // Throttle movement updates
    if (now - this.lastMoveTime < this.movementThreshold) {
      return;
    }

    const position = player.getPosition();
    const velocity = player.getVelocity();
    
    // Only send if position changed significantly
    const distance = Phaser.Math.Distance.Between(
      this.lastSentPosition.x, this.lastSentPosition.y,
      position.x, position.y
    );
    
    if (distance > this.positionThreshold) {
      this.sendMoveAction(position, velocity);
      this.lastSentPosition = position;
      this.lastMoveTime = now;
    }
  }

  private updateAiming(pointer: Phaser.Input.Pointer): void {
    // Update aiming direction based on mouse position
    // This would affect attack direction
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    
    // Store aiming direction for use in attacks
    this.scene.data.set('aimDirection', {
      x: worldPoint.x,
      y: worldPoint.y,
    });
  }

  private handleAttack(): void {
    this.queueInput('attack', {
      timestamp: Date.now(),
      sequence: this.inputSequence++,
    });
  }

  private handleAbility(): void {
    this.queueInput('ability', {
      timestamp: Date.now(),
      sequence: this.inputSequence++,
    });
  }

  private handleSecondaryAbility(): void {
    this.queueInput('secondaryAbility', {
      timestamp: Date.now(),
      sequence: this.inputSequence++,
    });
  }

  private handlePause(): void {
    this.scene.scene.pause();
    // Show pause menu
    this.scene.scene.launch('PauseMenu');
  }

  private handleScoreboard(): void {
    // Toggle scoreboard visibility
    this.scene.events.emit('toggle-scoreboard');
  }

  private handleChat(): void {
    // Open chat input
    this.scene.events.emit('open-chat');
  }

  private queueInput(type: string, data: any): void {
    this.inputBuffer.push({
      type,
      ...data,
      timestamp: Date.now(),
    });
  }

  private sendAttackAction(): void {
    const aimDirection = this.scene.data.get('aimDirection');
    
    const action: GameAction = {
      type: 'attack' as ActionType,
      playerId: this.networkManager?.getPlayerId() || '',
      data: {
        direction: aimDirection,
        timestamp: Date.now(),
        sequence: this.inputSequence++,
      },
      timestamp: Date.now(),
    };

    this.networkManager?.sendPlayerAction(action);
  }

  private sendAbilityAction(): void {
    const aimDirection = this.scene.data.get('aimDirection');
    
    const action: GameAction = {
      type: 'use_ability' as ActionType,
      playerId: this.networkManager?.getPlayerId() || '',
      data: {
        abilityId: 'primary',
        direction: aimDirection,
        timestamp: Date.now(),
        sequence: this.inputSequence++,
      },
      timestamp: Date.now(),
    };

    this.networkManager?.sendPlayerAction(action);
  }

  private sendMoveAction(position: Vector2, velocity: Vector2): void {
    const action: GameAction = {
      type: 'move' as ActionType,
      playerId: this.networkManager?.getPlayerId() || '',
      data: {
        position,
        velocity,
        timestamp: Date.now(),
        sequence: this.inputSequence++,
      },
      timestamp: Date.now(),
    };

    this.networkManager?.sendPlayerAction(action);
  }

  // Input prediction methods
  public predictMovement(player: Player, deltaTime: number): Vector2 {
    // Predict where the player will be based on current input
    const currentPosition = player.getPosition();
    const velocity = player.getVelocity();
    
    return {
      x: currentPosition.x + velocity.x * deltaTime,
      y: currentPosition.y + velocity.y * deltaTime,
    };
  }

  public reconcilePosition(player: Player, serverPosition: Vector2): void {
    // Reconcile predicted position with server authoritative position
    const currentPosition = player.getPosition();
    const distance = Phaser.Math.Distance.Between(
      currentPosition.x, currentPosition.y,
      serverPosition.x, serverPosition.y
    );
    
    // If the difference is significant, snap to server position
    if (distance > 50) {
      player.updatePosition(serverPosition);
    } else if (distance > 10) {
      // Smooth interpolation for smaller differences
      const lerpFactor = 0.3;
      const newPosition = {
        x: Phaser.Math.Interpolation.Linear([currentPosition.x, serverPosition.x], lerpFactor),
        y: Phaser.Math.Interpolation.Linear([currentPosition.y, serverPosition.y], lerpFactor),
      };
      player.updatePosition(newPosition);
    }
  }

  // Public methods
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    
    if (!enabled) {
      this.clearInputBuffer();
    }
  }

  public isInputEnabled(): boolean {
    return this.isEnabled;
  }

  public setNetworkManager(networkManager: NetworkManager): void {
    this.networkManager = networkManager;
  }

  public clearInputBuffer(): void {
    this.inputBuffer = [];
  }

  public getInputLatency(): number {
    return Date.now() - this.lastInputTime;
  }

  public isKeyPressed(key: string): boolean {
    return this.keyStates.get(key) || false;
  }

  public getMousePosition(): Vector2 {
    if (!this.mouse) return { x: 0, y: 0 };
    
    const worldPoint = this.scene.cameras.main.getWorldPoint(this.mouse.x, this.mouse.y);
    return {
      x: worldPoint.x,
      y: worldPoint.y,
    };
  }

  public destroy(): void {
    this.clearInputBuffer();
    this.keyStates.clear();
    
    if (this.touchControls) {
      Object.values(this.touchControls).forEach((control: any) => {
        if (control.destroy) control.destroy();
      });
    }
  }
}