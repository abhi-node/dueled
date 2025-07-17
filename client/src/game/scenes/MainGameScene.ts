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
import { projectileSpriteManager } from '../renderer/ProjectileSpriteManager';

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
  
  // Direct projectile management for rendering (bypasses CombatManager)
  private renderProjectiles: Map<string, {
    id: string;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    rotation: number;
    type: string;
    ownerId: string;
    createdAt: number;
    lastUpdate: number;
  }> = new Map();
  
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
  
  // Debug overlay
  private debugOverlayEnabled: boolean = false;
  private debugOverlayDiv!: HTMLDivElement;
  
  // Game loop
  private running: boolean = false;
  private lastTime: number = 0;
  private debugFrameCount: number = 0;
  
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
    
    // Set local player ID from match data with fallbacks
    if (matchData?.yourPlayerId) {
      this.localPlayerId = matchData.yourPlayerId;
      console.log(`🎮 MainGameScene: Local player ID set to ${this.localPlayerId}`);
    } else {
      // Fallback 1: Try to get from socket connection
      if (this.socket?.id) {
        this.localPlayerId = this.socket.id;
        console.log(`🎮 MainGameScene: Using socket ID as local player ID: ${this.localPlayerId}`);
      } else {
        // Fallback 2: Generate a temporary ID (will be updated later from network manager)
        this.localPlayerId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`🎮 MainGameScene: Generated temporary local player ID: ${this.localPlayerId}`);
      }
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
    
    // Set local player ID in raycaster if we have it
    if (this.localPlayerId) {
      this.raycaster.setLocalPlayerId(this.localPlayerId);
    }
    
    this.gameMap = new GameMap();
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
      Click: Lock Pointer • ESC: Unlock/Leave<br>
      <em>Debug: G: Combat Debug • D: Entity Debug</em>
    `;
    container.appendChild(instructions);
    
    // Create debug overlay
    this.debugOverlayDiv = document.createElement('div');
    this.debugOverlayDiv.style.position = 'absolute';
    this.debugOverlayDiv.style.top = '50%';
    this.debugOverlayDiv.style.left = '10px';
    this.debugOverlayDiv.style.transform = 'translateY(-50%)';
    this.debugOverlayDiv.style.color = '#00ff00';
    this.debugOverlayDiv.style.fontFamily = 'monospace';
    this.debugOverlayDiv.style.fontSize = '11px';
    this.debugOverlayDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.debugOverlayDiv.style.padding = '8px';
    this.debugOverlayDiv.style.borderRadius = '4px';
    this.debugOverlayDiv.style.border = '1px solid #00ff00';
    this.debugOverlayDiv.style.display = 'none';
    this.debugOverlayDiv.style.maxWidth = '300px';
    this.debugOverlayDiv.style.lineHeight = '1.2';
    container.appendChild(this.debugOverlayDiv);
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
      console.log('🎯 [STEP 1] DEBUG: L key pressed - initiating arrow firing sequence');
      console.log('🎯 [STEP 1] Local player ID:', this.localPlayerId);
      console.log('🎯 [STEP 1] Local player class:', this.localPlayerClass);
      console.log('🎯 [STEP 1] Network connected:', this.networkManager?.isConnectedToServer());
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
    
    // DEBUG: Add 'R' key to check rendering status
    if (event.key.toLowerCase() === 'r') {
      console.log('🎨 Rendering status:', {
        gameMapExists: !!this.gameMap,
        gameMapSize: this.gameMap ? `${this.gameMap.getGrid().length}x${this.gameMap.getGrid()[0]?.length}` : 'N/A',
        raycasterExists: !!this.raycaster,
        combatManagerExists: !!this.combatManager,
        projectileCount: this.combatManager ? this.combatManager.getProjectiles().size : 0,
        canvasSize: `${this.canvas.width}x${this.canvas.height}`,
        isRunning: this.running,
        fps: this.fps.toFixed(1),
        debugFrameCount: this.debugFrameCount
      });
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'C' key to check connection status
    if (event.key.toLowerCase() === 'c') {
      if (this.networkManager) {
        const diagnostics = this.networkManager.getDiagnosticInfo();
        console.log('🔍 Network diagnostics:', diagnostics);
      }
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'C' key to test connection status
    if (event.key.toLowerCase() === 'c') {
      console.log('🔌 DEBUG: C key pressed - checking connection status');
      const diagnostic = this.networkManager.getDiagnosticInfo();
      console.log('🔌 Connection diagnostic:', diagnostic);
      this.showNotification(`Connection: ${diagnostic.socketConnected ? 'Connected' : 'Disconnected'}`, 'info');
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'R' key to test rendering status
    if (event.key.toLowerCase() === 'r') {
      console.log('🎨 DEBUG: R key pressed - checking rendering status');
      const viewerState = this.raycaster.getPlayerState();
      console.log('🎨 Player state:', viewerState);
      console.log('🎨 Remote players:', this.remotePlayers.size);
      console.log('🎨 Projectiles in combat manager:', this.combatManager?.getProjectiles().size || 0);
      console.log('🎨 Running:', this.running);
      this.showNotification(`Rendering: ${this.running ? 'Active' : 'Inactive'}`, 'info');
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
    
    // DEBUG: Add 'M' key to check map integrity
    if (event.key.toLowerCase() === 'm') {
      console.log('🗺️ DEBUG: M key pressed - checking map integrity');
      const mapGrid = this.gameMap.getGrid();
      console.log('🗺️ Map dimensions:', mapGrid?.length, 'x', mapGrid?.[0]?.length);
      console.log('🗺️ Map corners:', {
        topLeft: mapGrid?.[0]?.[0],
        topRight: mapGrid?.[0]?.[19],
        bottomLeft: mapGrid?.[19]?.[0],
        bottomRight: mapGrid?.[19]?.[19]
      });
      
      // Count walls vs empty spaces
      let walls = 0;
      let empty = 0;
      if (mapGrid) {
        for (let y = 0; y < mapGrid.length; y++) {
          for (let x = 0; x < mapGrid[y].length; x++) {
            if (mapGrid[y][x] === 0) empty++;
            else walls++;
          }
        }
      }
      console.log('🗺️ Map composition:', { walls, empty, total: walls + empty });
      
      // If map seems corrupted, reinitialize it
      if (!mapGrid || mapGrid.length !== 20 || walls === 0) {
        console.log('🗺️ Map appears corrupted, reinitializing...');
        this.gameMap = new GameMap(20, 20, 'Simple Arena');
        this.showNotification('Map reinitialized', 'info');
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
    
    // Toggle debug overlay
    if (event.key.toLowerCase() === 'd') {
      this.debugOverlayEnabled = !this.debugOverlayEnabled;
      this.debugOverlayDiv.style.display = this.debugOverlayEnabled ? 'block' : 'none';
      this.showNotification(`Entity Debug: ${this.debugOverlayEnabled ? 'ON' : 'OFF'}`, 'info');
      event.preventDefault();
      return;
    }
    
    // DEBUG: Add 'H' key to check game state status
    if (event.key.toLowerCase() === 'h') {
      console.log('🔍 DEBUG: H key pressed - checking game state status');
      if (this.socket && this.socket.connected) {
        // Listen for the response first
        this.socket.once('debug:status', (status) => {
          console.log('📊 Game State Status:', status);
          if (status.error) {
            this.showNotification(`Error: ${status.error}`, 'warning');
          } else {
            this.showNotification(
              `Game: ${status.status}, Loop: ${status.gameLoopRunning ? 'Running' : 'Stopped'}, Projectiles: ${status.projectiles}`, 
              'info'
            );
          }
        });
        
        // Request the status
        this.socket.emit('debug:game_status');
      } else {
        console.error('🔌 Socket not connected');
        this.showNotification('Socket not connected', 'warning');
      }
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
    // Try multiple ways to get local player ID
    if (!this.localPlayerId) {
      // First try to get from match data
      if (this.matchData?.yourPlayerId) {
        this.localPlayerId = this.matchData.yourPlayerId;
        console.log('🔧 Fixed local player ID from match data:', this.localPlayerId);
      }
      // Then try network manager's player ID
      else if (this.networkManager?.getPlayerId()) {
        this.localPlayerId = this.networkManager.getPlayerId();
        console.log('🔧 Using network manager player ID:', this.localPlayerId);
      }
      // Then try socket ID
      else if (this.socket?.id) {
        this.localPlayerId = this.socket.id;
        console.log('🔧 Using socket ID as local player ID:', this.localPlayerId);
      }
      // Finally, generate a temporary ID
      else {
        this.localPlayerId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('🔧 Generated temporary local player ID:', this.localPlayerId);
      }
    }
    
    if (!this.localPlayerId) {
      console.warn('🚫 Cannot attack: No local player ID available');
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
      
      // 🔒 CLIENT-SIDE VALIDATION: Ensure playerState.angle is valid
      if (!playerState || typeof playerState.angle !== 'number' || Number.isNaN(playerState.angle)) {
        console.error('🚨 Invalid player angle, cannot attack:', { playerState, angle: playerState?.angle });
        this.showNotification('Attack failed - invalid camera angle', 'warning');
        return;
      }
      
      // Server expects tile coordinates, not pixels - so just use range directly
      const targetPosition = {
        x: playerState.x + Math.cos(playerState.angle) * range,
        y: playerState.y + Math.sin(playerState.angle) * range
      };
      
      const direction = {
        x: Math.cos(playerState.angle),
        y: Math.sin(playerState.angle)
      };
      
      // 🔒 CLIENT-SIDE VALIDATION: Ensure direction components are valid
      if (Number.isNaN(direction.x) || Number.isNaN(direction.y)) {
        console.error('🚨 Invalid direction calculated, cannot attack:', { direction, angle: playerState.angle });
        this.showNotification('Attack failed - invalid direction', 'warning');
        return;
      }
      
      console.log(`📤 [STEP 2] Sending attack to server:`, {
        playerId: this.localPlayerId,
        playerClass: this.localPlayerClass,
        position: { x: playerState.x, y: playerState.y },
        direction,
        targetPosition,
        attackType: 'basic',
        networkDiagnostic: this.networkManager.getDiagnosticInfo()
      });
      
      // Check connection before sending attack
      if (!this.networkManager.isConnectedToServer()) {
        console.warn('🔌 Network not connected - creating local debug projectile instead');
        
        // QUICK DEBUG FIX: Create local projectile when offline
        const now = Date.now();
        const projectileId = `debug_arrow_${now}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create local projectile directly in renderProjectiles map
        this.renderProjectiles.set(projectileId, {
          id: projectileId,
          position: { x: playerState.x, y: playerState.y },
          velocity: {
            x: Math.cos(playerState.angle) * 8, // Arrow speed
            y: Math.sin(playerState.angle) * 8
          },
          rotation: playerState.angle,
          type: 'arrow',
          ownerId: this.localPlayerId,
          createdAt: now,
          lastUpdate: now
        });
        
        console.log(`🏹 Created local debug projectile ${projectileId} at (${playerState.x.toFixed(1)}, ${playerState.y.toFixed(1)})`);
        this.showNotification('Local debug arrow fired!', 'info');
        
        // Start simple animation for the debug projectile
        this.animateLocalProjectile(projectileId);
        return;
      }
      
      // Send attack to server for authoritative processing
      console.log(`🏹 [STEP 2.5] Calling NetworkManager.sendAttack...`);
      this.networkManager.sendAttack({
        direction: direction,
        targetPosition: targetPosition,
        attackType: 'basic'
      });
      
      // DO NOT create local projectile - wait for server authority
      // This prevents duplicate projectiles and ensures all players see the same thing
      console.log(`🏹 [STEP 2.6] Basic attack sent to server for authority - waiting for server projectile...`);
      
      // Just update archer state for cooldown tracking locally
      const archerState = this.archerCombat.getArcherState(this.localPlayerId);
      if (archerState && this.archerCombat.canBasicAttack(this.localPlayerId)) {
        // Manually update last attack time for cooldown display
        const currentTime = Date.now() / 1000;
        archerState.lastBasicAttack = currentTime;
        archerState.isAttacking = true;
        
        // Reset attacking flag after short delay
        setTimeout(() => {
          archerState.isAttacking = false;
        }, 200);
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
      
      // DO NOT create local projectile - wait for server authority
      console.log(`⚡ Special attack (Dispatcher) sent to server for authority`);
      
      // Just update archer state for cooldown tracking locally
      const archerState = this.archerCombat.getArcherState(this.localPlayerId);
      if (archerState && this.archerCombat.canSpecialAttack(this.localPlayerId)) {
        // Manually update last attack time and charges for cooldown display
        const currentTime = Date.now() / 1000;
        archerState.lastSpecialAttack = currentTime;
        archerState.specialCharges--;
        archerState.isAttacking = true;
        
        // Reset attacking flag after short delay
        setTimeout(() => {
          archerState.isAttacking = false;
        }, 300);
        
        // Recharge special after cooldown
        setTimeout(() => {
          if (archerState.specialCharges < archerState.maxSpecialCharges) {
            archerState.specialCharges++;
          }
        }, archerState.specialAttackCooldown * 1000);
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
    
    // Get container dimensions – if the element doesn't have a layout yet
    // (width / height === 0) fall back to the viewport size.  If that is also
    // zero (very unlikely) schedule another attempt on the next animation
    // frame instead of applying an invalid size that would blank the render.
    let { width, height } = container.getBoundingClientRect();

    // Fallback to viewport if container has no size yet
    if (width === 0 || height === 0) {
      width = window.innerWidth;
      height = window.innerHeight;
      // If we *still* have no dimensions, try again next frame.
      if (width === 0 || height === 0) {
        requestAnimationFrame(() => this.handleResize());
        return;
      }
    }

    // Apply the calculated dimensions to both the element's *drawing* buffer
    // (width/height properties) and its CSS size (handled via 100% style).
    this.canvas.width = width;
    this.canvas.height = height;

    // Inform the ray-caster so it can recalculate internal parameters.
    this.raycaster.resize(width, height);
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
   * Update debug overlay with entity counts and system status
   */
  private updateDebugOverlay(): void {
    if (!this.debugOverlayEnabled) return;
    
    const projectileCountCombatManager = this.combatManager ? this.combatManager.getProjectiles().size : 0;
    const projectileCountRenderDirect = this.renderProjectiles.size;
    const projectileCountRaycaster = this.raycaster.getProjectileCount();
    const playerCount = this.remotePlayers.size;
    const spriteCount = this.spriteRenderer ? 'N/A' : 'No SpriteRenderer';
    
    this.debugOverlayDiv.innerHTML = `
      <strong>🔍 ENTITY DEBUG OVERLAY</strong><br><br>
      
      <strong>PROJECTILES:</strong><br>
      • CombatManager: ${projectileCountCombatManager}<br>
      • Direct Render: ${projectileCountRenderDirect}<br>
      • Raycaster: ${projectileCountRaycaster}<br><br>
      
      <strong>PLAYERS:</strong><br>
      • Remote Players: ${playerCount}<br>
      • Local Player: ${this.localPlayerId ? '✓' : '✗'}<br><br>
      
      <strong>SYSTEMS:</strong><br>
      • Game Running: ${this.running ? '✓' : '✗'}<br>
      • Network Connected: ${this.networkManager?.isConnectedToServer() ? '✅ CONNECTED' : '❌ OFFLINE'}<br>
      • Socket Status: ${this.networkManager?.getSocket()?.connected ? '✅ ACTIVE' : '❌ DISCONNECTED'}<br>
      • Player ID: ${this.localPlayerId ? this.localPlayerId.substr(0, 12) + '...' : 'None'}<br>
      • Combat Manager: ${this.combatManager ? '✓' : '✗'}<br>
      • Sprite Renderer: ${this.spriteRenderer ? '✓' : '✗'}<br>
      • Texture Manager: ${this.textureManager ? '✓' : '✗'}<br><br>
      
      <strong>PERFORMANCE:</strong><br>
      • FPS: ${this.fps.toFixed(1)}<br>
      • Frame: ${this.debugFrameCount}<br>
      • Map Grid: ${this.gameMap ? this.gameMap.getGrid().length + 'x' + this.gameMap.getGrid()[0]?.length : 'N/A'}<br><br>
      
      <em>Press D to toggle this overlay</em>
    `;
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
      
      // Remove local player sprite updates - we don't render our own sprite in first-person view
      // The local player should not see their own sprite
      
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
      this.debugFrameCount++;
    
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
      
      // Update debug overlay
      this.updateDebugOverlay();
      
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
    try {
      // Update projectiles in raycaster for 3D rendering
      this.updateProjectilesInRaycaster();
      
      // Check if gameMap exists and has valid grid
      if (!this.gameMap) {
        console.error('🚨 GameMap is null in render()');
        return;
      }
      
      const mapGrid = this.gameMap.getGrid();
      if (!mapGrid || mapGrid.length === 0) {
        console.error('🚨 GameMap grid is empty or null:', mapGrid);
        return;
      }
      
      // Add validation to check if grid has valid dimensions
      if (mapGrid.length !== 20 || mapGrid[0]?.length !== 20) {
        console.error('🚨 GameMap grid has invalid dimensions:', mapGrid.length, 'x', mapGrid[0]?.length);
      }
      
      
      // Clear canvas and render 3D scene (now includes projectiles)
      this.raycaster.render(mapGrid);
      
      // Update sprite directions based on camera view
      this.updateSpriteDirections();
      
      // Ensure all sprites are being rendered
      this.ensureAllSpritesRendered();
      
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
    } catch (error) {
      console.error('🚨 Error in render method:', error);
    }
  }

  /**
   * Update projectiles in raycaster for 3D rendering
   * Uses direct projectile management bypassing CombatManager for better performance
   */
  private updateProjectilesInRaycaster(): void {
    try {
      // Use direct render projectiles map for better control
      console.log(`[MainGameScene] Updating projectiles in Raycaster (direct):`, {
        count: this.renderProjectiles.size,
        projectileIds: Array.from(this.renderProjectiles.keys())
      });

      // First, collect all active projectile IDs
      const activeProjectileIds = new Set<string>();
      
      // Update or add active projectiles from direct management
      for (const [id, projectile] of this.renderProjectiles) {
        // Validate position is within map bounds
        if (projectile.position.x < 0 || projectile.position.x > 20 || 
            projectile.position.y < 0 || projectile.position.y > 20) {
          console.warn(`🚨 Projectile ${id} outside map bounds at (${projectile.position.x}, ${projectile.position.y})`);
          continue;
        }
        
        // Track this as an active projectile
        activeProjectileIds.add(id);
        
        // Update raycaster with projectile position and color
        const projectileColor = this.getProjectileColor(projectile.type);
        this.raycaster.persistProjectile(
          id,
          projectile.position.x,
          projectile.position.y,
          projectile.type,
          projectile.rotation,
          0.5, // size
          projectileColor
        );
        
        console.log(`[MainGameScene] Added/Updated projectile in Raycaster:`, {
          id,
          position: { x: projectile.position.x, y: projectile.position.y },
          angle: projectile.rotation,
          type: projectile.type
        });
      }
      
      // Remove stale projectiles from Raycaster
      const raycasterProjectileIds = this.raycaster.getProjectileIds();
      console.log(`[MainGameScene] Before cleanup - Raycaster has ${raycasterProjectileIds.length} projectiles`);
      
      let removedCount = 0;
      for (const projectileId of raycasterProjectileIds) {
        if (!activeProjectileIds.has(projectileId)) {
          this.raycaster.removeProjectile(projectileId);
          removedCount++;
          console.log(`[MainGameScene] Removed stale projectile ${projectileId} from Raycaster`);
        }
      }
      
      console.log(`[MainGameScene] Cleanup complete:`, {
        activeProjectiles: activeProjectileIds.size,
        removedProjectiles: removedCount,
        finalRaycasterCount: this.raycaster.getProjectileCount()
      });
    } catch (error) {
      console.error('🚨 Error updating projectiles in raycaster:', error);
      // Don't crash the render loop
    }
  }

  /**
   * Initialize combat system when game starts
   */
  private initializeCombat(): void {
    console.log(`⚔️ initializeCombat called with localPlayerId: ${this.localPlayerId}`);
    
    // Ensure we have local player ID using all available methods
    if (!this.localPlayerId) {
      if (this.matchData?.yourPlayerId) {
        this.localPlayerId = this.matchData.yourPlayerId;
        console.log('🔧 Setting local player ID from match data in combat init:', this.localPlayerId);
      } else if (this.networkManager?.getPlayerId()) {
        this.localPlayerId = this.networkManager.getPlayerId();
        console.log('🔧 Using network manager player ID in combat init:', this.localPlayerId);
      } else if (this.socket?.id) {
        this.localPlayerId = this.socket.id;
        console.log('🔧 Using socket ID as local player ID in combat init:', this.localPlayerId);
      } else {
        this.localPlayerId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('🔧 Generated temporary local player ID in combat init:', this.localPlayerId);
      }
    }
    
    if (!this.localPlayerId) {
      console.warn('⚠️ Cannot initialize combat: No local player ID');
      return;
    }
    
    const playerState = this.raycaster.getPlayerState();
    const position = { x: playerState.x, y: playerState.y };
    
    console.log(`⚔️ Registering player ${this.localPlayerId} at position:`, position);
    
    // Register local player for combat
    this.combatManager.registerPlayer(this.localPlayerId, position, this.localPlayerClass);
    
    // Initialize class-specific combat
    if (this.localPlayerClass === CT.ARCHER) {
      console.log(`🏹 Registering archer ${this.localPlayerId} at position:`, position, 'angle:', playerState.angle);
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
    
    // Initialize projectile sprite manager
    try {
      console.log('🚀 MainGameScene: Initializing projectile sprite manager...');
      await projectileSpriteManager.initialize();
      console.log('✅ MainGameScene: Projectile sprite manager initialized successfully');
    } catch (error) {
      console.error('❌ MainGameScene: Failed to initialize projectile sprite manager:', error);
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
    
    // Don't register local player sprite - we don't see our own sprite in first-person
    // Just send initial position with class info
    if (this.networkManager && this.localPlayerId && this.localPlayerClass) {
      // Send initial position with class info
      this.sendMovementUpdate();
    }
    
    // Start network connection
    this.networkManager.connect();
    
    // If we have a match ID, join it (with retry logic)
    if (this.matchId) {
      const attemptJoin = () => {
        if (this.networkManager.isConnectedToServer() && this.matchId) {
          this.networkManager.joinMatch(this.matchId, this.localPlayerClass);
        } else {
          console.log('🔌 Waiting for connection before joining match...');
          setTimeout(attemptJoin, 1000);
        }
      };
      
      // Try to join immediately if connected, otherwise wait
      attemptJoin();
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
    // SAFETY CHECK: Never add ourselves as a remote player
    if (playerId === this.localPlayerId) {
      console.warn(`⚠️ MainGameScene: Attempted to add local player ${playerId} as remote player. Ignoring.`);
      return;
    }
    
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
    
    // DON'T create any local player state - only store minimal data for rendering
    console.log(`🎯 MainGameScene: Remote player ${playerId} added for rendering only`);
    
    // Store minimal data for rendering purposes only
    this.remotePlayers.set(playerId, {
      position: data.position || defaultPosition,
      angle: data.angle || 0,
      classType: data.classType as ClassType,
      // No local state, health, armor, etc - server handles all that
    });
    
    // Update renderer immediately
    this.raycaster.updateOtherPlayer(playerId, playerData.position.x, playerData.position.y, color);
    
    // Update sprite renderer
    this.spriteRenderer.updatePlayerSprite(
      playerId,
      playerData.classType as ClassType,
      playerData.position,
      playerData.angle,
      { x: viewerState.x, y: viewerState.y },
      viewerState.angle
    );
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
   * Update player ID when received from network manager
   */
  public updatePlayerIdFromNetwork(playerId: string): void {
    if (!this.localPlayerId || this.localPlayerId.startsWith('temp_')) {
      const oldPlayerId = this.localPlayerId;
      this.localPlayerId = playerId;
      console.log(`🔧 MainGameScene: Updated local player ID from network: ${oldPlayerId} -> ${this.localPlayerId}`);
      
      // CRITICAL: Tell raycaster about local player ID
      if (this.raycaster) {
        this.raycaster.setLocalPlayerId(this.localPlayerId);
      }
      
      // CRITICAL: Remove any sprite registered for local player
      if (this.spriteRenderer) {
        this.spriteRenderer.removePlayerSprite(this.localPlayerId);
        console.log(`🔧 MainGameScene: Removed any sprite for local player ${this.localPlayerId}`);
      }
      
      // Re-initialize combat if needed
      if (this.combatManager && this.archerCombat) {
        console.log(`🔧 MainGameScene: Re-initializing combat after player ID update`);
        this.initializeCombat();
      }
    }
  }
  
  /**
   * Handle match joined event from server
   */
  public onMatchJoined(data: any): void {
    console.log('🎮 MainGameScene: Match joined, received data:', data);
    
    // CRITICAL: Set local player ID from server's yourPlayerId FIRST
    if (data.yourPlayerId) {
      this.localPlayerId = data.yourPlayerId;
      console.log(`🎮 MainGameScene: Local player ID set to ${this.localPlayerId} from yourPlayerId`);
      
      // CRITICAL: Tell raycaster about local player ID
      if (this.raycaster) {
        this.raycaster.setLocalPlayerId(this.localPlayerId);
      }
      
      // Update network manager's player ID too
      if (this.networkManager && 'updatePlayerIdFromNetwork' in this.networkManager) {
        (this.networkManager as any).updatePlayerIdFromNetwork(this.localPlayerId);
      }
    } else {
      console.error('⚠️ MainGameScene: No yourPlayerId in match_joined data!');
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
    
    // Handle existing players in the match - MUST filter out local player
    if (data.players) {
      console.log('🎮 MainGameScene: Processing players from match_joined:', data.players);
      console.log(`🎮 MainGameScene: Local player ID is: ${this.localPlayerId}`);
      
      data.players.forEach((player: any) => {
        console.log(`🎮 MainGameScene: Processing player:`, player);
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
        
        // CRITICAL: Only add OTHER players, not ourselves
        if (playerId !== this.localPlayerId) {
          console.log(`🎮 MainGameScene: Adding REMOTE player ${playerId} with class ${classType}`);
          
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
          console.log(`🎮 MainGameScene: Skipping LOCAL player ${playerId} with class ${classType} - we don't render our own sprite`);
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
    if (!gameUpdate || !gameUpdate.players) return;
    
    
    // Update all player positions EXCEPT our own
    for (const playerData of gameUpdate.players) {
      // CRITICAL: Filter out local player - we control our own position
      if (playerData.id && playerData.id !== this.localPlayerId) {
        this.onPlayerMoved(playerData.id, playerData.position, playerData.angle || 0);
      }
    }
    
    // Handle projectile updates if present
    if (gameUpdate.projectiles) {
      console.log(`🎯 [STEP 21] Processing ${gameUpdate.projectiles.length} projectiles from game update:`, gameUpdate.projectiles);
      this.onProjectileUpdate(gameUpdate.projectiles);
    }
    
    // ... existing code ...
    // UPDATE: Process ALL server state, not just positions
    for (const playerData of gameUpdate.players) {
      if (playerData.id === this.localPlayerId) {
        // Update our own health/armor from server (authoritative)
        if (playerData.health !== undefined) {
          this.playerHealth = playerData.health;
        }
        if (playerData.armor !== undefined) {
          this.playerArmor = playerData.armor;
        }
        // But skip position update - we control our own movement
        continue;
      }
      
      // For other players, update everything
      this.onPlayerMoved(playerData.id, playerData.position, playerData.angle || 0, playerData.classType);
      
      // Store their health/armor for UI display if needed
      let remotePlayer = this.remotePlayers.get(playerData.id);
      if (remotePlayer) {
        remotePlayer.health = playerData.health;
        remotePlayer.armor = playerData.armor;
        remotePlayer.isAlive = playerData.isAlive;
      }
    }
    
    // Process game events (kills, damage, etc)
    if (gameUpdate.events) {
      for (const event of gameUpdate.events) {
        this.processGameEvent(event);
      }
    }
  }

  /**
   * Process game events from server (damage, deaths, etc)
   */
  private processGameEvent(event: any): void {
    switch (event.type) {
      case 'damage_dealt':
        // Visual feedback for damage
        if (event.data.targetId === this.localPlayerId) {
          // Flash screen red or similar effect
          console.log(`💥 Took ${event.data.damage} damage`);
        }
        break;
        
      case 'player_death':
        if (event.playerId === this.localPlayerId) {
          console.log(`☠️ You died!`);
          this.showNotification('You have been eliminated!', 'warning');
        } else {
          const killer = event.data.killerId === this.localPlayerId ? 'You' : 'Someone';
          console.log(`☠️ ${killer} eliminated a player`);
        }
        break;
        
      case 'projectile_hit':
        // Visual/audio feedback for hits
        console.log(`🎯 Projectile hit at (${event.data.position.x}, ${event.data.position.y})`);
        break;
        
      case 'game_end':
        if (event.data.winnerId === this.localPlayerId) {
          this.showNotification('Victory!', 'success');
        } else {
          this.showNotification('Defeat!', 'warning');
        }
        break;
    }
  }

  /**
   * Handle projectile updates from server
   * Now updates direct projectile management instead of CombatManager
   */
  public onProjectileUpdate(serverProjectiles: any[]): void {
    console.log(`🎯 [STEP 22] Processing ${serverProjectiles.length} projectiles from server (direct management)`);
    
    // Get current projectiles for comparison
    const currentProjectileIds = new Set(this.renderProjectiles.keys());
    const serverProjectileIds = new Set(serverProjectiles.map(p => p.id));
    
    // Remove projectiles that are no longer on the server
    for (const id of currentProjectileIds) {
      if (!serverProjectileIds.has(id)) {
        console.log(`🗑️ Removing local projectile ${id} - not in server state`);
        this.renderProjectiles.delete(id);
        this.raycaster.removeProjectile(id);
      }
    }
    
    // Add or update projectiles from server
    for (const serverProjectile of serverProjectiles) {
      const existing = this.renderProjectiles.get(serverProjectile.id);
      
      if (existing) {
        // Update existing projectile
        existing.position = { ...serverProjectile.position };
        existing.velocity = { ...serverProjectile.velocity };
        existing.rotation = serverProjectile.rotation;
        existing.lastUpdate = Date.now();
        
        console.log(`📍 Updated projectile ${serverProjectile.id} to pos(${serverProjectile.position.x.toFixed(1)}, ${serverProjectile.position.y.toFixed(1)})`);
      } else {
        // Create new projectile
        this.renderProjectiles.set(serverProjectile.id, {
          id: serverProjectile.id,
          position: { ...serverProjectile.position },
          velocity: { ...serverProjectile.velocity },
          rotation: serverProjectile.rotation,
          type: serverProjectile.type,
          ownerId: serverProjectile.ownerId,
          createdAt: Date.now(),
          lastUpdate: Date.now()
        });
        
        console.log(`✅ [STEP 23] Created new projectile ${serverProjectile.id} at (${serverProjectile.position.x.toFixed(1)}, ${serverProjectile.position.y.toFixed(1)})`);
      }
    }
    
    console.log(`📊 Total projectiles after sync: ${this.renderProjectiles.size}`);
  }

  /**
   * Get projectile color for raycaster rendering
   */
  private getProjectileColor(type: string): string {
    switch (type) {
      case 'arrow': return '#ffd700'; // Gold
      case 'ice_shard': return '#60a5fa'; // Light blue
      case 'fire_bomb': return '#ef4444'; // Red
      case 'magic_missile': return '#8b5cf6'; // Purple
      default: return '#ffffff'; // White
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
    
    // Remove from raycaster
    this.raycaster.removeProjectile(data.projectileId);
    
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
   * Animate a local debug projectile (simple movement simulation)
   */
  private animateLocalProjectile(projectileId: string): void {
    const projectile = this.renderProjectiles.get(projectileId);
    if (!projectile) return;
    
    const startTime = Date.now();
    const maxLifetime = 3000; // 3 seconds
    const frameInterval = 16; // ~60fps
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      
      if (elapsed > maxLifetime || !this.renderProjectiles.has(projectileId)) {
        // Remove projectile after max lifetime
        this.renderProjectiles.delete(projectileId);
        console.log(`🗑️ Local debug projectile ${projectileId} expired`);
        return;
      }
      
      const currentProjectile = this.renderProjectiles.get(projectileId);
      if (currentProjectile) {
        // Simple physics: move projectile based on velocity
        const deltaTime = frameInterval / 1000; // Convert to seconds
        currentProjectile.position.x += currentProjectile.velocity.x * deltaTime;
        currentProjectile.position.y += currentProjectile.velocity.y * deltaTime;
        currentProjectile.lastUpdate = now;
        
        // Check bounds (remove if out of map)
        if (currentProjectile.position.x < 0 || currentProjectile.position.x > 20 ||
            currentProjectile.position.y < 0 || currentProjectile.position.y > 20) {
          this.renderProjectiles.delete(projectileId);
          console.log(`🗑️ Local debug projectile ${projectileId} left map bounds`);
          return;
        }
      }
      
      // Continue animation
      setTimeout(animate, frameInterval);
    };
    
    // Start animation
    animate();
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
  
  /**
   * Handle initial game state from server
   */
  public onInitialGameState(data: any): void {
    console.log('🎮 MainGameScene: Received initial game state:', data);
    
    // Set our health/armor from server
    const ourPlayer = data.players?.find((p: any) => p.id === this.localPlayerId);
    if (ourPlayer) {
      this.playerHealth = ourPlayer.health;
      this.playerMaxHealth = ourPlayer.maxHealth || 100;
      this.playerArmor = ourPlayer.armor;
      this.playerMaxArmor = ourPlayer.maxArmor || 50;
    }
    
    // Start the game if ready
    if (data.status === 'IN_PROGRESS' && !this.running) {
      console.log('🎮 Game is in progress, starting game loop');
      this.start();
    }
  }
} 