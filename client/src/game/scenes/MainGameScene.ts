/**
 * MainGameScene - Main game scene with ray-casted rendering
 * Handles the game loop, player input, and rendering
 */

import Phaser from 'phaser';
import { Socket } from 'socket.io-client';
import { Raycaster } from '../renderer/Raycaster.js';
import { GameMap } from '../world/GameMap.js';
import { MainNetworkManager } from '../network/MainNetworkManager.js';
import { SpriteRenderer } from '../renderer/SpriteRenderer.js';
import { TextureManager } from '../renderer/TextureManager.js';
import { CombatManager } from '../combat/CombatManager.js';
import { ArcherCombat } from '../combat/ArcherCombat.js';
import { Projectile } from '../combat/Projectile.js';
import type { Vector2, ClassType, ClassConfig } from '@dueled/shared';
import { getClassConfig, calculateDashCooldown, ClassType as CT } from '@dueled/shared';

export class MainGameScene {
  private canvas: HTMLCanvasElement;
  private raycaster: Raycaster;
  private gameMap: GameMap;
  private networkManager: MainNetworkManager;
  private spriteRenderer: SpriteRenderer;
  private textureManager: TextureManager;
  
  // Combat system
  private combatManager: CombatManager;
  private archerCombat: ArcherCombat;
  
  // UI elements
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private statsDiv!: HTMLDivElement;
  private notificationDiv!: HTMLDivElement;
  private playerStatsDiv!: HTMLDivElement; // New enhanced player stats
  
  // Game state
  private matchId?: string;
  private matchData: any;
  private socket: Socket | null = null;
  private localPlayerId: string = '';
  private localPlayerClass: ClassType;
  private classConfig!: ClassConfig;
  private remotePlayers: Map<string, any> = new Map();
  
  // Input handling
  private keys: Set<string> = new Set();
  private pointerLocked: boolean = false;
  private mouseSensitivity: number = 0.002;
  private pitchSensitivity: number = 0.001;
  
  // Rotation update tracking
  private lastRotationUpdateTime: number = 0;
  private rotationUpdateInterval: number = 100;
  
  // Player stats tracking
  private playerHealth: number = 100;
  private playerMaxHealth: number = 100;
  private playerArmor: number = 50;
  private playerMaxArmor: number = 50;
  private dashCooldownTime: number = 3.0;
  private lastDashTime: number = 0;
  private specialCooldownTime: number = 25.0;
  private lastSpecialTime: number = 0;
  
  // Combat state
  private debugCombat: boolean = false; // Show hitboxes in debug mode
  
  // Performance tracking
  private fps: number = 0;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  
  // Game loop
  private running: boolean = false;
  private lastTime: number = 0;
  
  // Input state
  private mouseX: number = 0;
  private mouseY: number = 0;
  
  // Initial position
  private initialPosition?: Vector2;
  
  constructor(containerId: string, matchId?: string, matchData?: any, socket?: Socket | null, selectedClass?: ClassType) {
    this.matchId = matchId;
    this.matchData = matchData;
    this.socket = socket || null;
    
    if (!selectedClass) {
      console.error('⚠️ MainGameScene: No class selected! This should not happen.');
      throw new Error('Player class is required');
    }
    
    this.localPlayerClass = selectedClass;
    this.classConfig = getClassConfig(selectedClass);
    
    // Initialize player stats from class configuration
    this.playerMaxHealth = this.classConfig.stats.health;
    this.playerHealth = this.playerMaxHealth;
    this.playerMaxArmor = this.classConfig.stats.defense;
    this.playerArmor = this.playerMaxArmor;
    this.dashCooldownTime = calculateDashCooldown(this.classConfig.stats.stamina);
    this.specialCooldownTime = this.classConfig.specialAbility.baseCooldown;
    
    console.log(`🎮 MainGameScene: Constructor called with:`, {
      matchId,
      socket: !!socket,
      selectedClass,
      localPlayerClass: this.localPlayerClass,
      classConfig: this.classConfig
    });
    
    // Set local player ID from match data
    if (matchData?.yourPlayerId) {
      this.localPlayerId = matchData.yourPlayerId;
      console.log(`🎮 MainGameScene: Local player ID set to ${this.localPlayerId}`);
    }
    
    // Create main canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 600;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.cursor = 'crosshair';
    
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    
    container.innerHTML = ''; // Clear container
    container.appendChild(this.canvas);
    
    // Initialize systems
    this.raycaster = new Raycaster(this.canvas);
    this.gameMap = new GameMap(30, 30, 'Simple Arena');
    this.networkManager = new MainNetworkManager(this, this.socket);
    this.spriteRenderer = new SpriteRenderer();
    this.textureManager = new TextureManager();
    
    // Initialize combat systems
    this.combatManager = new CombatManager();
    this.archerCombat = new ArcherCombat(this.combatManager);
    
    // Create UI elements
    this.createUI(container);
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup resize handler
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    
    // Handle browser tab/window close
    window.addEventListener('beforeunload', () => this.handlePageUnload());
  }
  
  /**
   * Create enhanced UI elements
   */
  private createUI(container: HTMLElement): void {
    // Create minimap
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 120;
    this.minimapCanvas.height = 120;
    this.minimapCanvas.style.position = 'absolute';
    this.minimapCanvas.style.top = '10px';
    this.minimapCanvas.style.right = '10px';
    this.minimapCanvas.style.border = '2px solid #64748b';
    this.minimapCanvas.style.backgroundColor = '#1a202c';
    container.appendChild(this.minimapCanvas);
    
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context for minimap');
    }
    this.minimapCtx = ctx;
    
    // Create performance stats display
    this.statsDiv = document.createElement('div');
    this.statsDiv.style.position = 'absolute';
    this.statsDiv.style.top = '10px';
    this.statsDiv.style.left = '10px';
    this.statsDiv.style.color = '#10b981';
    this.statsDiv.style.fontFamily = 'monospace';
    this.statsDiv.style.fontSize = '12px';
    this.statsDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    this.statsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    this.statsDiv.style.padding = '8px';
    this.statsDiv.style.borderRadius = '4px';
    container.appendChild(this.statsDiv);
    
    // Create enhanced player stats UI
    this.playerStatsDiv = document.createElement('div');
    this.playerStatsDiv.style.position = 'absolute';
    this.playerStatsDiv.style.bottom = '20px';
    this.playerStatsDiv.style.left = '20px';
    this.playerStatsDiv.style.color = '#ffffff';
    this.playerStatsDiv.style.fontFamily = 'Arial, sans-serif';
    this.playerStatsDiv.style.fontSize = '14px';
    this.playerStatsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.playerStatsDiv.style.padding = '12px';
    this.playerStatsDiv.style.borderRadius = '8px';
    this.playerStatsDiv.style.border = '2px solid #4f46e5';
    this.playerStatsDiv.style.minWidth = '250px';
    container.appendChild(this.playerStatsDiv);
    
    // Create notifications area
    this.notificationDiv = document.createElement('div');
    this.notificationDiv.style.position = 'absolute';
    this.notificationDiv.style.top = '10px';
    this.notificationDiv.style.left = '50%';
    this.notificationDiv.style.transform = 'translateX(-50%)';
    this.notificationDiv.style.color = '#10b981';
    this.notificationDiv.style.fontFamily = 'Arial, sans-serif';
    this.notificationDiv.style.fontSize = '14px';
    this.notificationDiv.style.textAlign = 'center';
    this.notificationDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    this.notificationDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    this.notificationDiv.style.padding = '8px 16px';
    this.notificationDiv.style.borderRadius = '8px';
    this.notificationDiv.style.display = 'none';
    this.notificationDiv.style.zIndex = '1000';
    container.appendChild(this.notificationDiv);
    
    // Create instructions
    const instructions = document.createElement('div');
    instructions.style.position = 'absolute';
    instructions.style.bottom = '10px';
    instructions.style.right = '20px';
    instructions.style.color = '#94a3b8';
    instructions.style.fontFamily = 'Arial, sans-serif';
    instructions.style.fontSize = '12px';
    instructions.style.textAlign = 'right';
    instructions.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
    instructions.innerHTML = `
      <strong>${this.classConfig.name} Controls:</strong><br>
      WASD: Move • Mouse: Look & Pitch<br>
      Q: Dash Left • E: Dash Right<br>
      Left Click/Space: Attack • F: Special Ability<br>
      Click: Lock Pointer • ESC: Unlock/Leave
    `;
    container.appendChild(instructions);
  }

  /**
   * Create enhanced stat bar
   */
  private createStatBar(current: number, max: number, color: string, bgColor: string = '#4a5568'): string {
    const percentage = Math.max(0, Math.min(100, (current / max) * 100));
    const barWidth = 150;
    const fillWidth = (barWidth * percentage) / 100;
    
    return `
      <div style="
        width: ${barWidth}px;
        height: 16px;
        background-color: ${bgColor};
        border: 1px solid #64748b;
        border-radius: 8px;
        overflow: hidden;
        position: relative;
        margin: 2px 0;
      ">
        <div style="
          width: ${fillWidth}px;
          height: 100%;
          background-color: ${color};
          transition: width 0.3s ease;
          border-radius: 7px;
        "></div>
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 11px;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        ">${current}/${max}</div>
      </div>
    `;
  }

  /**
   * Create cooldown bar
   */
  private createCooldownBar(remainingTime: number, totalTime: number, label: string, color: string): string {
    const percentage = Math.max(0, Math.min(100, ((totalTime - remainingTime) / totalTime) * 100));
    const barWidth = 150;
    const fillWidth = (barWidth * percentage) / 100;
    const isReady = remainingTime <= 0;
    
    return `
      <div style="
        width: ${barWidth}px;
        height: 14px;
        background-color: #4a5568;
        border: 1px solid #64748b;
        border-radius: 6px;
        overflow: hidden;
        position: relative;
        margin: 2px 0;
        opacity: ${isReady ? '1' : '0.7'};
      ">
        <div style="
          width: ${fillWidth}px;
          height: 100%;
          background-color: ${isReady ? color : '#6b7280'};
          transition: width 0.1s ease;
          border-radius: 5px;
        "></div>
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 10px;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        ">${label} ${isReady ? 'READY' : remainingTime.toFixed(1)}s</div>
      </div>
    `;
  }

  /**
   * Setup event listeners including Q/E dash handling
   */
  private setupEventListeners(): void {
    // Keyboard events
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    
    // Mouse events
    this.canvas.addEventListener('click', (e) => this.handleMouseClick(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    
    // Pointer lock events
    document.addEventListener('pointerlockchange', () => this.handlePointerLockChange());
    document.addEventListener('pointerlockerror', () => {
      console.error('Pointer lock error');
    });
  }
  
  /**
   * Enhanced keyboard input handling with Q/E dash support and combat
   */
  private handleKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.key.toLowerCase());
    
    // Handle special key combinations
    if (event.key === 'Escape') {
      if (this.pointerLocked) {
        // First ESC unlocks pointer
        document.exitPointerLock();
      } else {
        // Second ESC (or ESC when not locked) shows leave confirmation
        this.showLeaveConfirmation();
      }
      event.preventDefault();
      return;
    }

    // Handle dash inputs
    if (event.key.toLowerCase() === 'q') {
      this.handleDash('left');
      event.preventDefault();
      return;
    }
    
    if (event.key.toLowerCase() === 'e') {
      this.handleDash('right');
      event.preventDefault();
      return;
    }

    // Handle combat inputs
    if (event.key === ' ') { // Spacebar for basic attack
      this.handleBasicAttack();
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'L' key for testing arrow firing
    if (event.key.toLowerCase() === 'l') {
      console.log('🎯 DEBUG: L key pressed - firing arrow');
      this.handleBasicAttack();
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'P' key to test server projectile creation
    if (event.key.toLowerCase() === 'p') {
      console.log('🧪 DEBUG: P key pressed - testing server projectile creation');
      if (this.socket && this.socket.connected) {
        this.socket.emit('debug:test_projectile');
      }
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'O' key to check game status
    if (event.key.toLowerCase() === 'o') {
      console.log('🔍 DEBUG: O key pressed - checking game status');
      if (this.socket && this.socket.connected) {
        this.socket.emit('debug:game_status');
        this.socket.once('debug:status', (status: any) => {
          console.log('📊 Game Status:', status);
        });
      }
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'I' key to force initialize game state
    if (event.key.toLowerCase() === 'i') {
      console.log('🔧 DEBUG: I key pressed - force initializing game state');
      if (this.socket && this.socket.connected && this.matchId) {
        this.socket.emit('debug:init_game', { matchId: this.matchId });
        this.socket.once('debug:init_result', (result: any) => {
          console.log('🎮 Game init result:', result);
        });
      }
      event.preventDefault();
      return;
    }

    // Handle special ability
    if (event.key.toLowerCase() === 'f') {
      this.handleSpecialAbility();
      event.preventDefault();
      return;
    }

    // Toggle debug mode
    if (event.key.toLowerCase() === 'g') {
      this.debugCombat = !this.debugCombat;
      this.showNotification(`Debug mode: ${this.debugCombat ? 'ON' : 'OFF'}`, 'info');
      event.preventDefault();
      return;
    }
    
    // Prevent default for game keys
    if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  }
  
  private handleKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.key.toLowerCase());
  }
  
  /**
   * Handle mouse movement for aiming and combat
   */
  private handleMouseMove(event: MouseEvent): void {
    if (!this.pointerLocked) return;
    
    const deltaX = event.movementX;
    const deltaY = event.movementY;
    
    // Horizontal movement for rotation (fix inversion: positive deltaX should turn right)
    this.raycaster.rotatePlayer(deltaX * this.mouseSensitivity);
    
    // Vertical movement for pitch
    this.raycaster.adjustPitch(-deltaY * this.pitchSensitivity);
    
    // Send rotation update to server when camera rotates
    if (deltaX !== 0) {
      this.sendRotationUpdate();
    }

    // Update archer facing direction for combat
    if (this.localPlayerClass === CT.ARCHER && this.localPlayerId) {
      const playerState = this.raycaster.getPlayerState();
      this.archerCombat.updateArcherPosition(
        this.localPlayerId, 
        { x: playerState.x, y: playerState.y }, 
        playerState.angle
      );
    }
  }

  /**
   * Handle mouse clicks for combat
   */
  private handleMouseClick(event: MouseEvent): void {
    if (!this.pointerLocked) {
      this.requestPointerLock();
      return;
    }

    // Left click for basic attack
    if (event.button === 0) {
      this.handleBasicAttack();
    }
    // Right click for special attack
    else if (event.button === 2) {
      this.handleSpecialAbility();
    }
  }

  /**
   * Handle basic attack input
   */
  private handleBasicAttack(): void {
    // First try to get localPlayerId from match data if not set
    if (!this.localPlayerId && this.matchData?.yourPlayerId) {
      this.localPlayerId = this.matchData.yourPlayerId;
      console.log('🔧 Fixed local player ID from match data:', this.localPlayerId);
    }
    
    if (!this.localPlayerId) {
      console.warn('🚫 Cannot attack: No local player ID');
      return;
    }

    if (this.localPlayerClass === CT.ARCHER) {
      // Check cooldown first
      const cooldowns = this.archerCombat.getCooldowns(this.localPlayerId);
      if (cooldowns.basic > 0) {
        this.showNotification(`Attack cooling down: ${cooldowns.basic.toFixed(1)}s`, 'warning');
        return;
      }
      
      // Calculate target position (shoot forward)
      const playerState = this.raycaster.getPlayerState();
      const range = getClassConfig(CT.ARCHER).weapon.range;
      const targetPosition = {
        x: playerState.x + Math.cos(playerState.angle) * range * 32,
        y: playerState.y + Math.sin(playerState.angle) * range * 32
      };
      
      const direction = {
        x: Math.cos(playerState.angle),
        y: Math.sin(playerState.angle)
      };
      
      console.log(`📤 Sending attack to server:`, {
        playerId: this.localPlayerId,
        position: { x: playerState.x, y: playerState.y },
        direction,
        targetPosition,
        attackType: 'basic'
      });
      
      // Send attack to server for authoritative processing
      this.networkManager.sendAttack({
        direction: direction,
        targetPosition: targetPosition,
        attackType: 'basic'
      });
      
      // Still do local attack for immediate feedback (will be overridden by server)
      const success = this.archerCombat.tryBasicAttack(this.localPlayerId, targetPosition);
      if (success) {
        console.log(`🏹 Local basic attack executed, sent to server for authority`);
      } else {
        console.log(`❌ Local basic attack failed`);
      }
    }
    // TODO: Add other class basic attacks
  }

  /**
   * Handle special ability input
   */
  private handleSpecialAbility(): void {
    if (!this.localPlayerId) return;

    if (this.localPlayerClass === CT.ARCHER) {
      // Check cooldown first
      const cooldowns = this.archerCombat.getCooldowns(this.localPlayerId);
      if (cooldowns.special > 0) {
        this.showNotification(`${this.classConfig.specialAbility.name} cooling down: ${cooldowns.special.toFixed(1)}s`, 'warning');
        return;
      } else if (cooldowns.specialCharges <= 0) {
        this.showNotification(`No ${this.classConfig.specialAbility.name} charges available`, 'warning');
        return;
      }
      
      // For homing attack, we don't need a specific target position as server will find nearest enemy
      const playerState = this.raycaster.getPlayerState();
      const direction = {
        x: Math.cos(playerState.angle),
        y: Math.sin(playerState.angle)
      };
      
      // Send special attack to server
      this.networkManager.sendAttack({
        direction: direction,
        attackType: 'special'
      });
      
      // Still do local attack for immediate feedback
      const success = this.archerCombat.trySpecialAttack(this.localPlayerId);
      if (success) {
        console.log(`⚡ Local special attack (Dispatcher) executed, sent to server for authority`);
      }
    }
    // TODO: Add other class special abilities
  }
  
  /**
   * Request pointer lock
   */
  private requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }
  
  /**
   * Handle pointer lock change
   */
  private handlePointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  }
  
  /**
   * Handle window resize
   */
  private handleResize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    this.raycaster.resize(rect.width, rect.height);
  }

  /**
   * Handle page unload (browser tab close)
   */
  private handlePageUnload(): void {
    // Disconnect from the network immediately
    if (this.networkManager) {
      this.networkManager.disconnect();
    }
    
    // Stop the game
    this.running = false;
  }
  
  /**
   * Send movement update with class information
   */
  private sendMovementUpdate(): void {
    const state = this.raycaster.getPlayerState();
    this.networkManager.sendMovement({
      x: state.x,
      y: state.y,
      angle: state.angle,
      classType: this.localPlayerClass
    });
  }
  
  /**
   * Send rotation update without movement
   */
  private sendRotationUpdate(): void {
    const state = this.raycaster.getPlayerState();
    this.networkManager.sendRotation({
      angle: state.angle,
      classType: this.localPlayerClass
    });
  }
  
  /**
   * Process player input
   */
  private processInput(): void {
    let forward = 0;
    let strafe = 0;
    let pitchChange = 0;
    
    // Movement controls
    if (this.keys.has('w')) forward += 1;
    if (this.keys.has('s')) forward -= 1;
    if (this.keys.has('a')) strafe -= 1;
    if (this.keys.has('d')) strafe += 1;
    
    // Pitch controls (up/down looking)
    if (this.keys.has('arrowup') || this.keys.has('pageup')) pitchChange -= 0.01;
    if (this.keys.has('arrowdown') || this.keys.has('pagedown')) pitchChange += 0.01;
    
    // Normalize diagonal movement
    if (forward !== 0 && strafe !== 0) {
      const factor = 1 / Math.sqrt(2);
      forward *= factor;
      strafe *= factor;
    }
    
    // Apply pitch change
    if (pitchChange !== 0) {
      this.raycaster.adjustPitch(pitchChange);
    }
    
    // Move player
    if (forward !== 0 || strafe !== 0) {
      this.raycaster.movePlayer(forward, strafe, this.gameMap.getGrid());
      
      // Update combat positions
      this.updateCombatPositions();
      
      // Send position update to server with class information
      this.sendMovementUpdate();
    }
  }
  
  /**
   * Update minimap
   */
  private updateMinimap(): void {
    const playerState = this.raycaster.getPlayerState();
    const minimapData = this.gameMap.generateMinimap({ x: playerState.x, y: playerState.y });
    
    this.minimapCtx.putImageData(minimapData, 0, 0);
    
    // Draw player direction indicator
    const scale = 4;
    const centerX = playerState.x * scale;
    const centerY = playerState.y * scale;
    const dirX = Math.cos(playerState.angle) * 10;
    const dirY = Math.sin(playerState.angle) * 10;
    
    this.minimapCtx.strokeStyle = '#10b981';
    this.minimapCtx.lineWidth = 2;
    this.minimapCtx.beginPath();
    this.minimapCtx.moveTo(centerX, centerY);
    this.minimapCtx.lineTo(centerX + dirX, centerY + dirY);
    this.minimapCtx.stroke();
  }
  
  /**
   * Enhanced update stats display with combat cooldowns
   */
  private updateStats(): void {
    const playerState = this.raycaster.getPlayerState();
    const currentTime = Date.now() / 1000;
    
    // Update performance stats
    this.statsDiv.innerHTML = `
      FPS: ${this.fps.toFixed(0)}<br>
      Pos: ${playerState.x.toFixed(1)}, ${playerState.y.toFixed(1)}<br>
      Angle: ${(playerState.angle * 180 / Math.PI).toFixed(0)}°<br>
      Pitch: ${(playerState.pitch * 180 / Math.PI).toFixed(0)}°<br>
      Combat: ${this.debugCombat ? 'DEBUG' : 'OFF'}
    `;
    
    // Calculate cooldown times
    const dashRemainingTime = Math.max(0, this.dashCooldownTime - (currentTime - this.lastDashTime));
    const specialRemainingTime = Math.max(0, this.specialCooldownTime - (currentTime - this.lastSpecialTime));
    
    // Get class-specific cooldowns
    let basicAttackRemaining = 0;
    let specialAbilityRemaining = specialRemainingTime;
    
    if (this.localPlayerClass === CT.ARCHER && this.localPlayerId) {
      const cooldowns = this.archerCombat.getCooldowns(this.localPlayerId);
      basicAttackRemaining = cooldowns.basic;
      specialAbilityRemaining = cooldowns.special;
    }
    
    // Update enhanced player stats
    this.playerStatsDiv.innerHTML = `
      <div style="margin-bottom: 8px;">
        <strong style="color: #4f46e5;">${this.classConfig.name}</strong>
      </div>
      
      <div style="margin-bottom: 4px;">
        <div style="font-size: 12px; color: #f87171; margin-bottom: 2px;">Health</div>
        ${this.createStatBar(this.playerHealth, this.playerMaxHealth, '#ef4444')}
      </div>
      
      <div style="margin-bottom: 4px;">
        <div style="font-size: 12px; color: #60a5fa; margin-bottom: 2px;">Armor</div>
        ${this.createStatBar(this.playerArmor, this.playerMaxArmor, '#3b82f6')}
      </div>
      
      <div style="margin-bottom: 4px;">
        <div style="font-size: 12px; color: #34d399; margin-bottom: 2px;">Abilities</div>
        ${this.createCooldownBar(dashRemainingTime, this.dashCooldownTime, 'Dash (Q/E)', '#10b981')}
        ${this.createCooldownBar(basicAttackRemaining, this.classConfig.weapon.attackSpeed ? 1.0 / this.classConfig.weapon.attackSpeed : 1.0, 'Attack (LMB)', '#f59e0b')}
        ${this.createCooldownBar(specialAbilityRemaining, this.specialCooldownTime, this.classConfig.specialAbility.name.substring(0, 8), '#8b5cf6')}
      </div>
    `;
  }
  
  /**
   * Update sprite directions based on current viewer position/angle
   */
  private updateSpriteDirections(): void {
    try {
      const viewerState = this.raycaster.getPlayerState();
      if (!viewerState || !this.spriteRenderer) return;
      
      // Update local player sprite (if it exists and we have the necessary data)
      if (this.localPlayerId && this.localPlayerClass) {
        this.spriteRenderer.updatePlayerSprite(
          this.localPlayerId,
          this.localPlayerClass,
          { x: viewerState.x, y: viewerState.y },
          viewerState.angle,
          { x: viewerState.x, y: viewerState.y },
          viewerState.angle
        );
      }
      
      // Update all remote player sprites with current viewer perspective
      for (const [playerId, playerData] of this.remotePlayers) {
        if (!playerData || !playerData.position) continue;
        
        this.spriteRenderer.updatePlayerSprite(
          playerId,
          playerData.classType as ClassType,
          playerData.position,
          playerData.angle,
          { x: viewerState.x, y: viewerState.y },
          viewerState.angle
        );
      }
    } catch (error) {
      console.error('Error in updateSpriteDirections:', error);
      // Don't crash the game loop
    }
  }
  
  /**
   * Ensure all remote players have sprites rendered, even if they haven't moved
   */
  private ensureAllSpritesRendered(): void {
    try {
      const viewerState = this.raycaster.getPlayerState();
      
      // Make sure all remote players are visible in the raycaster
      for (const [playerId, playerData] of this.remotePlayers) {
        // Validate player data
        if (!playerData || !playerData.position) continue;
        
        // Log if class type is missing
        if (!playerData.classType) {
          console.warn(`⚠️ Player ${playerId} has no class type stored!`);
          continue;
        }
        
        // Get color based on class
        const classColors: Record<string, string> = {
          berserker: '#ff4444',
          mage: '#4444ff',
          bomber: '#ff8800',
          archer: '#44ff44'
        };
        const color = classColors[playerData.classType as string] || '#ff00ff';
        
        // Update raycaster with current position (this ensures they're always rendered)
        this.raycaster.updateOtherPlayer(playerId, playerData.position.x, playerData.position.y, color);
        
        // Also ensure sprite is created/updated (with safety check)
        if (this.spriteRenderer && viewerState) {
          this.spriteRenderer.updatePlayerSprite(
            playerId,
            playerData.classType as ClassType,
            playerData.position,
            playerData.angle,
            { x: viewerState.x, y: viewerState.y },
            viewerState.angle
          );
        }
      }
    } catch (error) {
      console.error('Error in ensureAllSpritesRendered:', error);
      // Don't crash the game loop
    }
  }
  
  /**
   * Show notification message
   */
  private showNotification(message: string, type: 'success' | 'warning' | 'special' | 'info' = 'info'): void {
    if (!this.notificationDiv) return;
    
    const colors = {
      success: '#10b981',
      warning: '#f59e0b',
      special: '#8b5cf6',
      info: '#3b82f6'
    };
    
    this.notificationDiv.style.color = colors[type];
    this.notificationDiv.style.display = 'block';
    this.notificationDiv.textContent = message;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (this.notificationDiv) {
        this.notificationDiv.style.display = 'none';
      }
    }, 3000);
  }
  
  /**
   * Enhanced game loop with combat system
   */
  private gameLoop(currentTime: number): void {
    if (!this.running) return;
    
    try {
      // Calculate delta time and FPS
      const deltaTime = currentTime - this.lastTime;
      this.fps = 1000 / deltaTime;
      this.lastTime = currentTime;
    
      // Process input
      this.processInput();
      
      // Update combat system
      if (this.combatManager) {
        const damageResults = this.combatManager.update(deltaTime, this.gameMap.getGrid());
        
        // Handle damage results
        for (const damage of damageResults) {
          console.log(`💥 Damage: ${damage.finalDamage} to ${damage.targetId} (${damage.effects.join(', ')})`);
          
          // Update local player health if hit
          if (damage.targetId === this.localPlayerId) {
            this.playerHealth = Math.max(0, this.playerHealth - damage.finalDamage);
            this.showNotification(`Hit for ${damage.finalDamage} damage!`, 'warning');
            
            if (damage.isKilled) {
              this.showNotification('You have been defeated!', 'warning');
            }
          }
        }
      }
      
      // Render frame
      this.render();
      
      // Update stats display
      this.updateStats();
      
      // Update minimap
      this.updateMinimap();
      
      // Continue game loop
      requestAnimationFrame((time) => this.gameLoop(time));
    } catch (error) {
      console.error('🚨 Game loop error:', error);
      // Try to continue anyway
      if (this.running) {
        requestAnimationFrame((time) => this.gameLoop(time));
      }
    }
  }

  /**
   * Enhanced render method with combat visuals
   */
  private render(): void {
    // Update projectiles in raycaster for 3D rendering
    this.updateProjectilesInRaycaster();
    
    // Clear canvas and render 3D scene (now includes projectiles)
    this.raycaster.render(this.gameMap.getGrid());
    
    // Update sprite animations
    this.spriteRenderer.update(Date.now());
    
    // Render debug hitboxes on top if needed
    if (this.debugCombat && this.combatManager) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        const cameraOffset = { x: 0, y: 0 }; // TODO: Calculate proper camera offset
        this.combatManager.renderHitboxes(ctx, cameraOffset, true);
      }
    }
  }

  /**
   * Update projectiles in raycaster for 3D rendering
   */
  private updateProjectilesInRaycaster(): void {
    if (!this.combatManager) return;
    
    // Clear existing projectiles
    this.raycaster.clearProjectiles();
    
    // Get all active projectiles from combat manager
    const projectilesMap = this.combatManager.getProjectiles();
    
    console.log(`🎯 Updating ${projectilesMap.size} projectiles in raycaster`);
    
    // Add each projectile to raycaster for 3D rendering
    for (const projectile of projectilesMap.values()) {
      if (projectile.isActive()) {
        const state = projectile.getState();
        const config = projectile.getConfig();
        
        console.log(`🏹 Adding projectile ${state.id} at (${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}) to raycaster`);
        
        this.raycaster.updateProjectile(
          state.id,
          state.position.x,
          state.position.y,
          config.type,
          state.rotation,
          0.5 // Size for 3D rendering
        );
      }
    }
  }

  /**
   * Initialize combat system when game starts
   */
  private initializeCombat(): void {
    // Ensure we have local player ID
    if (!this.localPlayerId && this.matchData?.yourPlayerId) {
      this.localPlayerId = this.matchData.yourPlayerId;
      console.log('🔧 Setting local player ID from match data in combat init:', this.localPlayerId);
    }
    
    if (!this.localPlayerId) {
      console.warn('⚠️ Cannot initialize combat: No local player ID');
      return;
    }
    
    const playerState = this.raycaster.getPlayerState();
    const position = { x: playerState.x, y: playerState.y };
    
    // Register local player for combat
    this.combatManager.registerPlayer(this.localPlayerId, position, this.localPlayerClass);
    
    // Initialize class-specific combat
    if (this.localPlayerClass === CT.ARCHER) {
      this.archerCombat.registerArcher(this.localPlayerId, position, playerState.angle);
      console.log(`🏹 Archer combat initialized for ${this.localPlayerId}`);
    }
    
    console.log(`⚔️ Combat system initialized for ${this.classConfig.name}`);
  }

  /**
   * Update combat positions when player moves
   */
  private updateCombatPositions(): void {
    if (!this.localPlayerId) return;
    
    const playerState = this.raycaster.getPlayerState();
    const position = { x: playerState.x, y: playerState.y };
    
    // Update combat manager
    this.combatManager.updatePlayerPosition(this.localPlayerId, position);
    
    // Update class-specific combat
    if (this.localPlayerClass === CT.ARCHER) {
      this.archerCombat.updateArcherPosition(this.localPlayerId, position, playerState.angle);
    }
  }
  public async start(): Promise<void> {
    if (this.running) return;
    
    console.log('🎮 MainGameScene: Starting game initialization...');
    
    // Don't start the game loop yet, wait for proper initialization
    this.lastTime = performance.now();
    
    // Initialize texture manager
    try {
      console.log('🎨 MainGameScene: Initializing texture manager...');
      await this.textureManager.initialize();
      console.log('🎨 MainGameScene: Texture manager initialized successfully');
      
      // Pass texture manager to raycaster
      this.raycaster.setTextureManager(this.textureManager);
      console.log('🎨 MainGameScene: Texture manager passed to raycaster');
    } catch (error) {
      console.error('🎨 MainGameScene: Failed to initialize texture manager:', error);
    }
    
    // Note: EnhancedGameMap uses grid-based rendering, no need to set flexible map
    console.log('🗺️ MainGameScene: Using enhanced grid-based map');
    
    // Initialize sprite renderer
    try {
      console.log('🎮 MainGameScene: About to initialize sprite renderer...');
      await this.spriteRenderer.initialize();
      console.log('🎮 MainGameScene: Sprite renderer initialized successfully');
      
      // Pass sprite renderer to raycaster
      this.raycaster.setSpriteRenderer(this.spriteRenderer);
      console.log('🎮 MainGameScene: Sprite renderer passed to raycaster');
    } catch (error) {
      console.error('🎮 MainGameScene: Failed to initialize sprite renderer:', error);
    }
    
    // Set initial player position - use server spawn if available, otherwise random
    let spawnPoint: Vector2;
    if (this.initialPosition) {
      spawnPoint = this.initialPosition;
    } else {
      spawnPoint = this.gameMap.getRandomSpawnPoint();
    }
    
    // Debug spawn point (minimal logging)
    console.log('🎯 Spawn point:', spawnPoint);
    
    this.raycaster.setPlayerPosition(spawnPoint.x, spawnPoint.y);
    
    // Register local player sprite for direction tracking
    // This ensures the local player's sprite direction updates with camera movement
    if (this.spriteRenderer && this.localPlayerId && this.localPlayerClass) {
      const playerState = this.raycaster.getPlayerState();
      this.spriteRenderer.updatePlayerSprite(
        this.localPlayerId,
        this.localPlayerClass,
        spawnPoint,
        playerState.angle
      );
      console.log(`🎯 MainGameScene: Registered local player sprite - ID: ${this.localPlayerId}, Class: ${this.localPlayerClass}`);
      
      // Send initial position with class info
      this.sendMovementUpdate();
    }
    
    // Start network connection
    this.networkManager.connect();
    
    // If we have a match ID, join it
    if (this.matchId) {
      this.networkManager.joinMatch(this.matchId, this.localPlayerClass);
    }
    
    // Wait for network readiness before starting game loop
    console.log('🎮 MainGameScene: Initialization complete, waiting for network...');
    
    // Start a delayed initialization check
    setTimeout(() => this.checkReadinessAndStart(), 1000);
  }
  
  /**
   * Check if everything is ready and start the game loop
   */
  private checkReadinessAndStart(): void {
    if (this.running) return; // Already started
    
    // Check if we have necessary initialization
    const hasValidPosition = this.initialPosition || this.gameMap.getSpawnPoints().length > 0;
    const hasTextureManager = this.textureManager !== null;
    const hasSpriteRenderer = this.spriteRenderer !== null;
    
    if (hasValidPosition && hasTextureManager && hasSpriteRenderer) {
      console.log('🎮 MainGameScene: All systems ready, starting game loop!');
      
      // Initialize combat system
      this.initializeCombat();
      
      this.running = true;
      requestAnimationFrame((time) => this.gameLoop(time));
    } else {
      console.log('🎮 MainGameScene: Still waiting for initialization... retrying in 500ms');
      setTimeout(() => this.checkReadinessAndStart(), 500);
    }
  }
  
  /**
   * Stop the game
   */
  public stop(): void {
    this.running = false;
    this.networkManager.disconnect();
    
    // Cleanup sprite renderer
    this.spriteRenderer.dispose();
    
    // Exit pointer lock
    if (this.pointerLocked) {
      document.exitPointerLock();
    }
  }
  
  /**
   * Handle network events
   */
  public onPlayerJoined(playerId: string, data: any): void {
    // Get proper spawn position - use server spawn points if available
    const spawnPoints = this.gameMap.getSpawnPoints();
    const defaultPosition = spawnPoints.length > 1 ? spawnPoints[1] : { x: 17, y: 17 }; // Use second spawn point
    
    console.log(`🎯 MainGameScene: onPlayerJoined called for ${playerId} with data:`, data);
    
    const playerData = {
      position: data.position || defaultPosition,
      angle: data.angle || 0,
      classType: data.classType as ClassType
    };
    
    if (!playerData.classType) {
      console.error(`⚠️ MainGameScene: Player ${playerId} joined without class type! This should not happen.`);
      return; // Don't add player without class type
    }
    
    console.log(`🎯 MainGameScene: Player ${playerId} joined with class ${playerData.classType} (original: ${data.classType})`);
    
    this.remotePlayers.set(playerId, playerData);
    
    // Get viewer (local player) position and angle for sprite direction calculation
    const viewerState = this.raycaster.getPlayerState();
    
    // Update renderer with player color based on class (fallback for non-sprite rendering)
    const classColors: Record<string, string> = {
      berserker: '#ff4444',
      mage: '#4444ff',
      bomber: '#ff8800',
      archer: '#44ff44'
    };
    const color = classColors[playerData.classType as string] || '#ff00ff';
    
    // Ensure player is immediately visible in raycaster FIRST
    this.raycaster.updateOtherPlayer(playerId, playerData.position.x, playerData.position.y, color);
    
    // THEN update sprite renderer with viewer perspective
    this.spriteRenderer.updatePlayerSprite(
      playerId, 
      playerData.classType as ClassType, 
      playerData.position, 
      playerData.angle,
      { x: viewerState.x, y: viewerState.y },
      viewerState.angle
    );
    
    // Show notification
    const username = data.username || `Player ${playerId.substring(0, 8)}`;
    this.showNotification(`${username} has joined the game`, 'info');
    
    console.log(`Player ${username} joined at position (${playerData.position.x}, ${playerData.position.y})`);
  }
  
  public onPlayerLeft(playerId: string, data?: any): void {
    const player = this.remotePlayers.get(playerId);
    const username = data?.username || `Player ${playerId.substring(0, 8)}`;
    
    this.remotePlayers.delete(playerId);
    this.raycaster.removeOtherPlayer(playerId);
    this.spriteRenderer.removePlayerSprite(playerId);
    
    // Show notification
    this.showNotification(`${username} has disconnected`, 'info');
    
    console.log(`Player ${username} left the game`);
  }

  /**
   * Handle match ended event from server
   */
  public onMatchEnded(data: any): void {
    console.log('🚨 Match ended:', data);
    
    // Stop the game immediately
    this.running = false;
    
    // Show notification with the reason
    let message = 'Match ended';
    if (data.reason === 'player_disconnect' && data.disconnectedPlayer) {
      message = data.message || `${data.disconnectedPlayer.username} has left the game. Match ended.`;
    }
    
    // Show a prominent notification that doesn't auto-hide
    this.showMatchEndedNotification(message);
    
    // Disconnect from the network after a delay
    setTimeout(() => {
      this.networkManager.disconnect();
      
      // Redirect to lobby/main menu after notification
      this.returnToLobby();
    }, 3000);
  }

  /**
   * Show a special notification for match ended
   */
  private showMatchEndedNotification(message: string): void {
    // Update the notification with warning colors and longer duration
    this.notificationDiv.innerHTML = message;
    this.notificationDiv.style.display = 'block';
    this.notificationDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.9)'; // Red background
    this.notificationDiv.style.color = '#ffffff';
    this.notificationDiv.style.border = '2px solid #dc2626';
    this.notificationDiv.style.fontSize = '16px';
    this.notificationDiv.style.fontWeight = 'bold';
    this.notificationDiv.style.zIndex = '2000';
    
    // Don't auto-hide - user needs to see this
    console.log('🚨 Match ended notification shown:', message);
  }

  /**
   * Show leave game confirmation
   */
  private showLeaveConfirmation(): void {
    // Use browser's built-in confirm dialog for simplicity
    const shouldLeave = confirm('Are you sure you want to leave the match? This will end the game for both players.');
    
    if (shouldLeave) {
      this.leaveGame();
    }
  }

  /**
   * Leave the game voluntarily
   */
  private leaveGame(): void {
    console.log('🚪 Player is leaving the game voluntarily');
    
    // Show notification that we're leaving
    this.showMatchEndedNotification('You left the game. Match ended.');
    
    // Stop the game immediately
    this.running = false;
    
    // Disconnect from the network (this will trigger server cleanup)
    this.networkManager.disconnect();
    
    // Return to lobby after a short delay
    setTimeout(() => {
      this.returnToLobby();
    }, 2000);
  }

  /**
   * Return to lobby/main menu
   */
  private returnToLobby(): void {
    console.log('🔄 Returning to lobby...');
    
    // Clear all game data
    this.remotePlayers.clear();
    this.stop();
    
    // Redirect to the main page or lobby
    if (window.location.pathname.includes('/game')) {
      window.location.href = '/';
    } else {
      // If we're in a SPA context, emit an event or call a callback
      window.dispatchEvent(new CustomEvent('returnToLobby'));
    }
  }
  
  public onPlayerMoved(playerId: string, position: Vector2, angle: number, classType?: ClassType): void {
    // Removed console.log for performance
    
    let player = this.remotePlayers.get(playerId);
    if (!player) {
      // Create player if it doesn't exist
      if (!classType) {
        console.error(`⚠️ MainGameScene: Cannot create player ${playerId} without class type!`);
        return;
      }
      player = {
        position: position,
        angle: angle,
        classType: classType
      };
      this.remotePlayers.set(playerId, player);
    } else {
      player.position = position;
      player.angle = angle;
      // Update class if provided
      if (classType) {
        player.classType = classType;
      }
    }
    
    // Get viewer (local player) position and angle for sprite direction calculation
    const viewerState = this.raycaster.getPlayerState();
    
    // Update sprite renderer with viewer perspective
    this.spriteRenderer.updatePlayerSprite(
      playerId, 
      player.classType as ClassType, 
      position, 
      angle,
      { x: viewerState.x, y: viewerState.y },
      viewerState.angle
    );
    
    // Update renderer (fallback for non-sprite rendering)
    const classColors: Record<string, string> = {
      berserker: '#ff4444',
      mage: '#4444ff',
      bomber: '#ff8800',
      archer: '#44ff44'
    };
    const color = classColors[player.classType as string] || '#ff00ff';
    // Removed console.log for performance
    this.raycaster.updateOtherPlayer(playerId, position.x, position.y, color);
  }
  
  public onPlayerRotated(playerId: string, angle: number, classType?: ClassType): void {
    // Removed console.log for performance
    
    let player = this.remotePlayers.get(playerId);
    if (!player) {
      // Create player if it doesn't exist (shouldn't happen but just in case)
      if (!classType) {
        console.error(`⚠️ MainGameScene: Cannot create player ${playerId} in rotation without class type!`);
        return;
      }
      player = {
        position: { x: 10, y: 10 }, // Default position
        angle: angle,
        classType: classType
      };
      this.remotePlayers.set(playerId, player);
    } else {
      player.angle = angle;
      // Update class if provided
      if (classType) {
        player.classType = classType;
      }
    }
    
    // Get viewer (local player) position and angle for sprite direction calculation
    const viewerState = this.raycaster.getPlayerState();
    
    // Update sprite renderer with new rotation and viewer perspective
    this.spriteRenderer.updatePlayerSprite(
      playerId, 
      player.classType as ClassType, 
      player.position, 
      angle,
      { x: viewerState.x, y: viewerState.y },
      viewerState.angle
    );
    
    // Update renderer (fallback for non-sprite rendering)
    const classColors: Record<string, string> = {
      berserker: '#ff4444',
      mage: '#4444ff',
      bomber: '#ff8800',
      archer: '#44ff44'
    };
    const color = classColors[player.classType as string] || '#ff00ff';
    this.raycaster.updateOtherPlayer(playerId, player.position.x, player.position.y, color);
  }
  
  /**
   * Handle match joined event from server
   */
  public onMatchJoined(data: any): void {
    console.log('🎮 MainGameScene: Match joined, received data:', data);
    
    // Set local player ID if provided
    if (data.yourPlayerId && !this.localPlayerId) {
      this.localPlayerId = data.yourPlayerId;
      console.log(`🎮 MainGameScene: Local player ID set to ${this.localPlayerId}`);
    }
    
    // Set initial spawn position from server
    if (data.initialPosition) {
      this.initialPosition = data.initialPosition;
      console.log(`🎯 MainGameScene: Initial position set to (${data.initialPosition.x}, ${data.initialPosition.y})`);
      
      // If game is already running, update position immediately
      if (this.running) {
        this.raycaster.setPlayerPosition(data.initialPosition.x, data.initialPosition.y);
        console.log(`🎯 MainGameScene: Updated raycaster position immediately`);
      }
    }
    
    // Handle existing players in the match
    if (data.players) {
      console.log('🎮 MainGameScene: Processing players from match_joined:', data.players);
      data.players.forEach((player: any) => {
        console.log(`🎮 MainGameScene: Processing player:`, player);
        // The server sends player1 and player2 objects with playerId, username, rating, classType
        const playerId = player.playerId;
        const classType = player.classType;
        
        if (!playerId) {
          console.error('⚠️ MainGameScene: Player object missing playerId:', player);
          return;
        }
        
        if (!classType) {
          console.error('⚠️ MainGameScene: Player object missing classType:', player);
          console.error('⚠️ Full player object:', JSON.stringify(player, null, 2));
          return;
        }
        
        if (playerId !== this.localPlayerId) {
          // Log what we're about to process
          console.log(`🎮 MainGameScene: Adding remote player ${playerId} with class ${classType}`);
          
          // Add position data for immediate visibility
          const playerData = {
            username: player.username,
            classType: classType,
            position: player.position || this.getOpponentSpawnPosition(),
            angle: player.angle || 0
          };
          console.log(`🎮 MainGameScene: Created playerData for ${playerId}:`, playerData);
          this.onPlayerJoined(playerId, playerData);
          
          // Ensure sprite is immediately visible (not just on movement)
          console.log(`🎯 Setting up sprite for existing player ${playerId} at position (${playerData.position.x}, ${playerData.position.y}) with class ${playerData.classType}`);
        } else {
          console.log(`🎮 MainGameScene: Skipping local player ${playerId} with class ${classType}`);
        }
      });
    }
  }
  
  /**
   * Get opponent spawn position (different from local player)
   */
  private getOpponentSpawnPosition(): Vector2 {
    const spawnPoints = this.gameMap.getSpawnPoints();
    // If local player is at spawn 0, opponent should be at spawn 1
    return spawnPoints.length > 1 ? spawnPoints[1] : { x: 17, y: 17 };
  }
  
  /**
   * Handle game state update from server
   */
  public handleGameUpdate(gameUpdate: any) {
    console.log(`📨 Received game:update event:`, {
      matchId: gameUpdate?.matchId,
      tick: gameUpdate?.tick,
      playerCount: gameUpdate?.players?.length,
      projectileCount: gameUpdate?.projectiles?.length,
      eventCount: gameUpdate?.events?.length
    });
    
    if (!gameUpdate || !gameUpdate.players) return;
    
    // Update all player positions
    for (const playerData of gameUpdate.players) {
      if (playerData.id !== this.localPlayerId) {
        this.onPlayerMoved(playerData.id, playerData.position, playerData.angle || 0);
      }
    }
    
    // Handle projectile updates if present
    if (gameUpdate.projectiles && this.onProjectileUpdate) {
      console.log(`🎯 Processing ${gameUpdate.projectiles.length} projectiles from game update`);
      this.onProjectileUpdate(gameUpdate.projectiles);
    }
    
    // Handle game events if present
    if (gameUpdate.events && this.onGameEvents) {
      console.log(`📋 Processing ${gameUpdate.events.length} game events`);
      this.onGameEvents(gameUpdate.events);
    }
  }

  /**
   * Handle projectile updates from server (authoritative)
   */
  public onProjectileUpdate(serverProjectiles: any[]): void {
    if (!this.combatManager) return;
    
    console.log(`📦 Received projectile update with ${serverProjectiles.length} projectiles`);
    
    // Get current projectiles map
    const currentProjectiles = this.combatManager.getProjectiles();
    const serverProjectileIds = new Set(serverProjectiles.map(p => p.id));
    
    // Remove projectiles that no longer exist on server
    for (const [projectileId, projectile] of currentProjectiles) {
      if (!serverProjectileIds.has(projectileId)) {
        currentProjectiles.delete(projectileId);
        console.log(`🗑️ Removed projectile ${projectileId} (no longer on server)`);
      }
    }
    
    // Create/update projectiles from server data
    for (const serverProjectile of serverProjectiles) {
      // Check if we already have this projectile
      let existingProjectile = currentProjectiles.get(serverProjectile.id);
      
      if (existingProjectile) {
        // Update existing projectile position from server
        const state = existingProjectile.getState();
        state.position = { ...serverProjectile.position };
        state.velocity = { ...serverProjectile.velocity };
        state.rotation = serverProjectile.rotation;
        state.isActive = true;
        console.log(`📍 Updated projectile ${serverProjectile.id} position`);
      } else {
        // Create new projectile from server data
        const projectileConfig = {
          id: serverProjectile.id,
          type: serverProjectile.type,
          damage: serverProjectile.damage,
          speed: 200, // Slower speed for debugging visibility
          range: 13,
          size: { width: 32, height: 12 }, // Larger size for visibility
          piercing: serverProjectile.piercing || false,
          homing: serverProjectile.homing || false,
          armorPenetration: 50,
          effects: [],
          spriteSheet: {
            path: '/assets/projectiles/arrow_sheet.png',
            frameWidth: 48,
            frameHeight: 48,
            totalFrames: 16
          }
        };
        
        const projectileState = {
          id: serverProjectile.id,
          position: { ...serverProjectile.position },
          velocity: { ...serverProjectile.velocity },
          rotation: serverProjectile.rotation,
          distanceTraveled: 0,
          isActive: true,
          ownerId: serverProjectile.ownerId,
          targetId: serverProjectile.targetId,
          createdAt: Date.now(),
          lastUpdate: Date.now()
        };
        
        // Import Projectile class and create instance
        const projectile = new Projectile(projectileConfig, projectileState);
        currentProjectiles.set(serverProjectile.id, projectile);
        
        console.log(`🆕 Created projectile ${serverProjectile.id} from server (owner: ${serverProjectile.ownerId})`);
      }
    }
  }

  /**
   * Handle game events from server (projectile creation, hits, deaths)
   */
  public onGameEvents(events: any[]): void {
    for (const event of events) {
      this.handleGameEvent(event);
    }
  }

  /**
   * Handle individual game event
   */
  private handleGameEvent(event: any): void {
    switch (event.type) {
      case 'projectile_created':
        this.handleProjectileCreated(event);
        break;
      case 'projectile_hit':
        this.handleProjectileHit(event);
        break;
      case 'projectile_destroyed':
        this.handleProjectileDestroyed(event);
        break;
      case 'player_death':
        this.handlePlayerDeath(event);
        break;
      default:
        console.log(`Unhandled game event: ${event.type}`);
    }
  }

  /**
   * Handle projectile creation event from server
   */
  private handleProjectileCreated(event: any): void {
    const data = event.data;
    console.log(`🏹 Server created projectile: ${data.projectileId} by ${event.playerId}`);
    
    // Visual feedback for projectile creation
    if (event.playerId !== this.localPlayerId) {
      this.showNotification(`${event.playerId.substring(0, 8)} fired ${data.type}!`, 'info');
    }
  }

  /**
   * Handle projectile hit event from server
   */
  private handleProjectileHit(event: any): void {
    const hitData = event.data;
    console.log(`💥 Server projectile hit: ${hitData.finalDamage} damage to ${hitData.targetId}`);
    
    // Apply damage if this is the local player
    if (hitData.targetId === this.localPlayerId) {
      this.playerHealth = Math.max(0, this.playerHealth - hitData.finalDamage);
      this.showNotification(`Hit for ${hitData.finalDamage} damage!`, 'warning');
      
      if (hitData.isKilled) {
        this.showNotification('You have been defeated!', 'warning');
      }
    }
    
    // Visual effect at hit location
    this.createHitEffect(hitData.position, hitData.effects);
  }

  /**
   * Handle projectile destroyed event from server
   */
  private handleProjectileDestroyed(event: any): void {
    const data = event.data;
    
    // Remove projectile from local tracking
    if (this.combatManager) {
      this.combatManager.getProjectiles().delete(data.projectileId);
    }
    
    console.log(`🗑️ Server destroyed projectile: ${data.projectileId}`);
  }

  /**
   * Handle player death event from server
   */
  private handlePlayerDeath(event: any): void {
    const data = event.data;
    console.log(`💀 Player death: ${event.playerId} killed by ${data.killerId}`);
    
    if (event.playerId === this.localPlayerId) {
      this.showNotification('You have been defeated!', 'warning');
      // TODO: Handle local player death (respawn, end game, etc.)
    } else {
      this.showNotification(`Player ${event.playerId.substring(0, 8)} was defeated!`, 'info');
      // Remove dead player from rendering
      this.remotePlayers.delete(event.playerId);
    }
  }

  /**
   * Create visual hit effect
   */
  private createHitEffect(position: Vector2, effects: string[]): void {
    // TODO: Implement visual hit effects based on position and effects
    console.log(`✨ Creating hit effect at (${position.x}, ${position.y}) with effects: ${effects.join(', ')}`);
  }

  /**
   * Handle dash input (Q for left, E for right)
   */
  private handleDash(direction: 'left' | 'right'): void {
    const currentTime = Date.now() / 1000; // Convert to seconds
    const dashCooldown = this.dashCooldownTime;
    
    // Check if dash is off cooldown
    if (currentTime - this.lastDashTime < dashCooldown) {
      const remainingCooldown = dashCooldown - (currentTime - this.lastDashTime);
      this.showNotification(`Dash cooling down: ${remainingCooldown.toFixed(1)}s`, 'warning');
      return;
    }
    
    // Perform dash
    const dashDistance = 2.0; // tiles
    const playerState = this.raycaster.getPlayerState();
    
    // Calculate dash direction (perpendicular to current facing direction)
    const dashAngle = playerState.angle + (direction === 'left' ? -Math.PI / 2 : Math.PI / 2);
    const deltaX = Math.cos(dashAngle) * dashDistance;
    const deltaY = Math.sin(dashAngle) * dashDistance;
    
    const newX = playerState.x + deltaX;
    const newY = playerState.y + deltaY;
    
    // Check collision before dashing
    const mapGrid = this.gameMap.getGrid();
    const targetMapX = Math.floor(newX);
    const targetMapY = Math.floor(newY);
    
    // Simple collision check - ensure target is within bounds and not a wall
    if (targetMapX >= 0 && targetMapX < mapGrid[0].length && 
        targetMapY >= 0 && targetMapY < mapGrid.length && 
        mapGrid[targetMapY][targetMapX] === 0) {
      
      // Perform the dash
      this.raycaster.setPlayerPosition(newX, newY);
      this.lastDashTime = currentTime;
      
      // Send dash action to server
      this.sendDashUpdate(direction, { x: newX, y: newY });
      
      // Show feedback
      this.showNotification(`Dashed ${direction}!`, 'success');
      
      console.log(`🏃 Performed ${direction} dash to ${newX.toFixed(1)}, ${newY.toFixed(1)}`);
    } else {
      // Collision detected
      this.showNotification(`Can't dash ${direction} - blocked!`, 'warning');
      console.log(`❌ Dash ${direction} blocked by collision`);
    }
  }

  /**
   * Send dash action to server
   */
  private sendDashUpdate(direction: 'left' | 'right', newPosition: Vector2): void {
    if (!this.socket || !this.localPlayerId) return;
    
    const playerState = this.raycaster.getPlayerState();
    
    this.socket.emit('player:dash', {
      playerId: this.localPlayerId,
      direction: direction,
      position: newPosition,
      angle: playerState.angle,
      classType: this.localPlayerClass,
      timestamp: Date.now()
    });
    
    console.log(`📡 Sent dash update: ${direction} to ${newPosition.x.toFixed(1)}, ${newPosition.y.toFixed(1)}`);
  }
} 