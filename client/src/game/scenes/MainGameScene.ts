/**
 * MainGameScene - Main game scene with ray-casted rendering
 * Handles the game loop, player input, and rendering
 */

import Phaser from 'phaser';
import { Socket } from 'socket.io-client';
import { Raycaster } from '../renderer/Raycaster.js';
import { GameMap } from '../world/GameMap.js';
import { MainNetworkManager } from '../network/MainNetworkManager.js';
import { TextureManager } from '../renderer/TextureManager.js';
import { CombatManager } from '../combat/CombatManager.js';
import { ArcherCombat } from '../combat/ArcherCombat.js';
import { Projectile } from '../combat/Projectile.js';
import type { Vector2, ClassType, ClassConfig } from '@dueled/shared';
import { getClassConfig, calculateDashCooldown, ClassType as CT } from '@dueled/shared';
import { projectileSpriteManager } from '../renderer/ProjectileSpriteManager';
import { angleToDirection } from '../utils/direction';
import { spriteSheetManager } from '../renderer/SpriteSheetManager';

export class MainGameScene {
  private canvas: HTMLCanvasElement;
  private raycaster: Raycaster;
  private gameMap: GameMap;
  private networkManager: MainNetworkManager;
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

  // NEW: Unified sprite management for rendering (models after renderProjectiles)
  private renderSprites: Map<string, {
    id: string;
    position: { x: number; y: number };
    angle: number;  // Direction the player is facing
    classType: ClassType;
    health: number;
    armor: number;
    isAlive: boolean;
    isMoving: boolean;
    velocity: { x: number; y: number };  // For interpolation
    lastUpdate: number;
    username?: string;
  }> = new Map();

  // OLD: Will be removed once new system is working
  private renderPlayers: Map<string, {
    id: string;
    position: { x: number; y: number };
    angle: number;
    classType: ClassType;
    isMoving: boolean;
    velocity: { x: number; y: number };
    health: number;
    armor: number;
    isAlive: boolean;
    lastUpdate: number;
    username?: string;
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
  
  // Rendering optimization
  private lastPlayerCleanup: number = 0;
  
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
    
    // Removed debug 'L' key to prevent duplicate attacks
    
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
      console.log('🎨 Remote players:', this.renderPlayers.size);
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
      // Calculate target position (shoot forward) 
      const playerState = this.raycaster.getPlayerState();
      const range = getClassConfig(CT.ARCHER).weapon.range;
      
      // 🔒 CLIENT-SIDE VALIDATION: Ensure playerState.angle is valid
      if (!playerState || typeof playerState.angle !== 'number' || Number.isNaN(playerState.angle)) {
        console.error('🚨 Invalid player angle, cannot attack:', { playerState, angle: playerState?.angle });
        this.showNotification('Attack failed - invalid camera angle', 'warning');
        return;
      }
      
      const targetPosition = {
        x: playerState.x + Math.cos(playerState.angle) * range,
        y: playerState.y + Math.sin(playerState.angle) * range
      };
      
      // Use the ArcherCombat system which has proper cooldown handling
      const success = this.archerCombat.tryBasicAttack(this.localPlayerId, targetPosition);
      
      if (!success) {
        const cooldowns = this.archerCombat.getCooldowns(this.localPlayerId);
        if (cooldowns.basic > 0) {
          this.showNotification(`Attack cooling down: ${cooldowns.basic.toFixed(1)}s`, 'warning');
        }
        return;
      }
      
      // If ArcherCombat succeeded, send to server
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
      
      // Send attack to server for authoritative processing  
      if (this.networkManager.isConnectedToServer()) {
        this.networkManager.sendAttack({
          direction: direction,
          targetPosition: targetPosition,
          attackType: 'basic'
        });
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
    const playerCount = this.renderPlayers.size;
    const spriteCount = this.renderSprites.size;
    
    this.debugOverlayDiv.innerHTML = `
      <strong>🔍 ENTITY DEBUG OVERLAY</strong><br><br>
      
      <strong>PROJECTILES:</strong><br>
      • CombatManager: ${projectileCountCombatManager}<br>
      • Direct Render: ${projectileCountRenderDirect}<br>
      • Raycaster: ${projectileCountRaycaster}<br><br>
      
      <strong>PLAYERS:</strong><br>
      • Remote Players: ${playerCount}<br>
      • Active Sprites: ${spriteCount}<br>
      • Local Player: ${this.localPlayerId ? '✓' : '✗'}<br><br>
      
      <strong>SYSTEMS:</strong><br>
      • Game Running: ${this.running ? '✓' : '✗'}<br>
      • Network Connected: ${this.networkManager?.isConnectedToServer() ? '✅ CONNECTED' : '❌ OFFLINE'}<br>
      • Socket Status: ${this.networkManager?.getSocket()?.connected ? '✅ ACTIVE' : '❌ DISCONNECTED'}<br>
      • Player ID: ${this.localPlayerId ? this.localPlayerId.substr(0, 12) + '...' : 'None'}<br>
      • Combat Manager: ${this.combatManager ? '✓' : '✗'}<br>
      • Sprite System: ${this.renderSprites.size >= 0 ? '✓' : '✗'}<br>
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
    
    // Generate remote player debug info
    let opponentDebugInfo = '';
    if (this.debugCombat && this.renderPlayers.size > 0) {
      opponentDebugInfo = '<br><strong>Opponents:</strong><br>';
      for (const [playerId, player] of this.renderPlayers) {
        const raycasterPos = this.raycaster.getOtherPlayerPosition(playerId);
        opponentDebugInfo += `${player.username || playerId.substring(0, 8)}: Server(${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)})`;
        if (raycasterPos) {
          const posDiff = Math.sqrt(Math.pow(player.position.x - raycasterPos.x, 2) + Math.pow(player.position.y - raycasterPos.y, 2));
          opponentDebugInfo += ` Render(${raycasterPos.x.toFixed(1)}, ${raycasterPos.y.toFixed(1)}) Δ${posDiff.toFixed(2)}<br>`;
        } else {
          opponentDebugInfo += ` Render(Not Found)<br>`;
        }
      }
    }

    // Generate projectile debug info
    let projectileDebugInfo = '';
    if (this.debugCombat && this.renderProjectiles.size > 0) {
      projectileDebugInfo = '<br><strong>Projectiles:</strong><br>';
      for (const [id, projectile] of this.renderProjectiles) {
        const velocity = Math.sqrt(projectile.velocity.x ** 2 + projectile.velocity.y ** 2);
        const angle = (projectile.rotation * 180 / Math.PI).toFixed(0);
        projectileDebugInfo += `${projectile.type}: (${projectile.position.x.toFixed(1)}, ${projectile.position.y.toFixed(1)}) `;
        projectileDebugInfo += `V${velocity.toFixed(1)} ∠${angle}°<br>`;
      }
    }

    // Update performance stats
    this.statsDiv.innerHTML = `
      FPS: ${this.fps.toFixed(0)}<br>
      Pos: ${playerState.x.toFixed(1)}, ${playerState.y.toFixed(1)}<br>
      Angle: ${(playerState.angle * 180 / Math.PI).toFixed(0)}°<br>
      Pitch: ${(playerState.pitch * 180 / Math.PI).toFixed(0)}°<br>
      Combat: ${this.debugCombat ? 'DEBUG' : 'OFF'}${opponentDebugInfo}${projectileDebugInfo}
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
      
      // NEW: Update sprites in raycaster for 3D rendering
      this.updateSpritesInRaycaster();
      
      // OLD: Update players in raycaster for 3D rendering (will be removed)
      // this.updatePlayersInRaycaster();
      
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
      
      
      // Clear canvas and render 3D scene (now includes projectiles and players)
      this.raycaster.render(mapGrid);
      
      // Update sprite animations
      // Sprite system is handled in render loop
      
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
      if (this.debugCombat) {
        console.log(`[MainGameScene] Updating projectiles in Raycaster (direct):`, {
          count: this.renderProjectiles.size,
          projectileIds: Array.from(this.renderProjectiles.keys())
        });
      }

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
        
        if (this.debugCombat) {
          console.log(`[MainGameScene] Added/Updated projectile in Raycaster:`, {
            id,
            position: { x: projectile.position.x, y: projectile.position.y },
            angle: projectile.rotation,
            type: projectile.type
          });
        }
      }
      
      // Remove stale projectiles from Raycaster
      const raycasterProjectileIds = this.raycaster.getProjectileIds();
      if (this.debugCombat) {
        console.log(`[MainGameScene] Before cleanup - Raycaster has ${raycasterProjectileIds.length} projectiles`);
      }
      
      let removedCount = 0;
      for (const projectileId of raycasterProjectileIds) {
        if (!activeProjectileIds.has(projectileId)) {
          this.raycaster.removeProjectile(projectileId);
          removedCount++;
          // Performance optimized: no logging in hot path
        }
      }
      
      // Performance optimized: no logging in hot path
    } catch (error) {
      console.error('🚨 Error updating projectiles in raycaster:', error);
      // Don't crash the render loop
    }
  }

  /**
   * NEW: Update sprites in raycaster for 3D rendering
   * Models exactly after updateProjectilesInRaycaster for consistency
   */
  private updateSpritesInRaycaster(): void {
    try {
      // Use direct render sprites map for better control
      if (this.debugCombat) {
        console.log(`[MainGameScene] Updating sprites in Raycaster (direct):`, {
          count: this.renderSprites.size,
          spriteIds: Array.from(this.renderSprites.keys())
        });
      }

      // Get viewer state for sprite direction calculation
      const viewerState = this.raycaster.getPlayerState();
      const now = Date.now();

      // First, collect all active sprite IDs
      const activeSpriteIds = new Set<string>();

      if (this.renderSprites.size > 0) {
        console.log(`🎨 Updating ${this.renderSprites.size} sprites in raycaster`);
      }
      
      // Update or add active sprites from direct management
      for (const [id, sprite] of this.renderSprites) {
        // Skip local player - never render ourselves
        if (id === this.localPlayerId) continue;

        // Validate position is within map bounds
        if (sprite.position.x < 0 || sprite.position.x > 20 || 
            sprite.position.y < 0 || sprite.position.y > 20) {
          console.warn(`🚨 Sprite ${id} outside map bounds at (${sprite.position.x}, ${sprite.position.y})`);
          continue;
        }
        
        // Track this as an active sprite
        activeSpriteIds.add(id);
        
        // Calculate correct sprite direction based on viewer perspective
        const direction = this.calculateSpriteDirection(
          sprite.angle,
          { x: viewerState.x, y: viewerState.y },
          sprite.position
        );
        
        // Get sprite frame from sprite sheet manager
        const spriteFrame = spriteSheetManager.getFrame(
          sprite.classType,
          direction,
          sprite.isMoving,
          now
        );
        
        if (!spriteFrame) {
          console.warn(`🚨 No sprite frame for ${id} (${sprite.classType}, ${direction})`);
        }
        
        // Persist sprite to raycaster for rendering
        this.raycaster.persistSprite(
          id,
          sprite.position.x,
          sprite.position.y,
          sprite.angle,
          sprite.classType,
          spriteFrame,
          1.0 // size
        );
        
        if (this.debugCombat) {
          console.log(`[MainGameScene] Added/Updated sprite in Raycaster:`, {
            id,
            position: { x: sprite.position.x, y: sprite.position.y },
            angle: sprite.angle,
            direction,
            classType: sprite.classType
          });
        }
      }
      
      // Remove stale sprites from Raycaster
      const raycasterSpriteIds = this.raycaster.getSpriteIds();
      if (this.debugCombat) {
        console.log(`[MainGameScene] Before cleanup - Raycaster has ${raycasterSpriteIds.length} sprites`);
      }
      
      let removedCount = 0;
      for (const spriteId of raycasterSpriteIds) {
        if (!activeSpriteIds.has(spriteId)) {
          this.raycaster.removeSprite(spriteId);
          removedCount++;
          // Performance optimized: no logging in hot path
        }
      }
      
      // Performance optimized: no logging in hot path
    } catch (error) {
      console.error('🚨 Error updating sprites in raycaster:', error);
      // Don't crash the render loop
    }
  }

  /**
   * OLD: Update players in raycaster for 3D rendering
   * Uses direct player management similar to projectiles
   */
  private updatePlayersInRaycaster(): void {
    try {
      // Get viewer state for sprite direction calculation
      const viewerState = this.raycaster.getPlayerState();
      
      // Track which players have been updated to avoid duplicates
      const updatedPlayers = new Set<string>();
      
      // Update all active players
      for (const [id, player] of this.renderPlayers) {
        // Skip if already updated this frame
        if (updatedPlayers.has(id)) continue;
        
        // Validate position is within map bounds
        if (player.position.x < 0 || player.position.x > 20 || 
            player.position.y < 0 || player.position.y > 20) {
          console.warn(`🚨 Player ${id} outside map bounds at (${player.position.x}, ${player.position.y})`);
          continue;
        }
        
        // Update raycaster with player data
        const classColors: Record<string, string> = {
          berserker: '#ff4444',
          mage: '#4444ff',
          bomber: '#ff8800',
          archer: '#44ff44'
        };
        const color = classColors[player.classType] || '#ff00ff';
        
        // Only update raycaster if position or angle changed significantly
        const existingPlayer = this.raycaster.getOtherPlayerPosition(id);
        const positionChanged = !existingPlayer || 
          Math.abs(existingPlayer.x - player.position.x) > 0.01 ||
          Math.abs(existingPlayer.y - player.position.y) > 0.01;
        
        // OLD SYSTEM: Removed to prevent duplicate rendering
        // The old updateOtherPlayer populates the legacy otherPlayers map
        // This has been replaced by the unified sprite system
        /*
        if (positionChanged) {
          this.raycaster.updateOtherPlayer(
            id,
            player.position.x,
            player.position.y,
            player.angle,
            player.classType,
            player.isMoving,
            player.health,
            player.armor,
            player.isAlive,
            color
          );
        }
        */
        
        // Sprites are now updated via unified updateSpritesInRaycaster method
        
        updatedPlayers.add(id);
      }
      
      // Remove stale players from raycaster - but throttle this to prevent flickering
      const now = Date.now();
      if (!this.lastPlayerCleanup || now - this.lastPlayerCleanup > 1000) { // Clean up once per second
        const activeIds = new Set(this.renderPlayers.keys());
        for (const id of this.raycaster.getAllOtherPlayers().keys()) {
          if (!activeIds.has(id)) {
            this.raycaster.removeOtherPlayer(id);
            this.removeSprite(id);
          }
        }
        this.lastPlayerCleanup = now;
      }
    } catch (error) {
      console.error('🚨 Error updating players in raycaster:', error);
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
    

    // Initialize NEW sprite sheet manager
    try {
      console.log('🎨 MainGameScene: Initializing new sprite sheet manager...');
      await spriteSheetManager.initialize();
      console.log('🎨 MainGameScene: Sprite sheet manager initialized successfully');
    } catch (error) {
      console.error('🎨 MainGameScene: Failed to initialize sprite sheet manager:', error);
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
    const hasSpriteSheetManager = spriteSheetManager.isReady();
    
    if (hasValidPosition && hasTextureManager && hasSpriteSheetManager) {
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
    
    // Cleanup sprite system
    this.renderSprites.clear();
    
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
    
    const classType = data.classType as ClassType;
    if (!classType) {
      console.error(`⚠️ MainGameScene: Player ${playerId} joined without class type! This should not happen.`);
      return; // Don't add player without class type
    }
    
    console.log(`🎯 MainGameScene: Player ${playerId} joined with class ${classType} (original: ${data.classType})`);
    
    // Create player in renderPlayers Map (unified state)
    const player = this.createDefaultPlayer(playerId, classType);
    player.position = data.position || defaultPosition;
    player.angle = data.angle || 0;
    player.health = data.health || 100;
    player.armor = data.armor || 50;
    player.isAlive = data.isAlive !== false;
    player.username = data.username;
    
    this.renderPlayers.set(playerId, player);
    
    
    // Show notification
    const username = data.username || `Player ${playerId.substring(0, 8)}`;
    this.showNotification(`${username} has joined the game`, 'info');
    
    console.log(`🎯 MainGameScene: Remote player ${playerId} added at position (${player.position.x}, ${player.position.y})`);
    console.log(`🎯 MainGameScene: Remote player ${playerId} added for rendering only`);
  }
  
  public onPlayerLeft(playerId: string, data?: any): void {
    const player = this.renderPlayers.get(playerId);
    const username = data?.username || player?.username || `Player ${playerId.substring(0, 8)}`;
    
    // Remove from unified state
    this.renderPlayers.delete(playerId);
    
    // Remove from rendering systems
    this.removeSprite(playerId);
    this.raycaster.removeOtherPlayer(playerId);
    
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
    this.renderPlayers.clear();
    this.renderSprites.clear();
    this.stop();
    
    // Redirect to the main page or lobby
    if (window.location.pathname.includes('/game')) {
      window.location.href = '/';
    } else {
      // If we're in a SPA context, emit an event or call a callback
      window.dispatchEvent(new CustomEvent('returnToLobby'));
    }
  }
  
  private createDefaultPlayer(playerId: string, classType: ClassType = CT.BERSERKER): typeof this.renderPlayers extends Map<string, infer T> ? T : never {
    return {
      id: playerId,
      position: { x: 10, y: 10 },
      angle: 0,
      classType: classType,
      isMoving: false,
      velocity: { x: 0, y: 0 },
      health: 100,
      armor: 50,
      isAlive: true,
      lastUpdate: Date.now()
    };
  }

  // NEW: Sprite management helper methods
  private createDefaultSprite(playerId: string, classType: ClassType = CT.BERSERKER): typeof this.renderSprites extends Map<string, infer T> ? T : never {
    return {
      id: playerId,
      position: { x: 10, y: 10 },
      angle: 0,
      classType: classType,
      health: 100,
      armor: 50,
      isAlive: true,
      isMoving: false,
      velocity: { x: 0, y: 0 },
      lastUpdate: Date.now()
    };
  }

  private updateSprite(playerId: string, updates: Partial<{
    position: { x: number; y: number };
    angle: number;
    classType: ClassType;
    health: number;
    armor: number;
    isAlive: boolean;
    isMoving: boolean;
    velocity: { x: number; y: number };
    username: string;
  }>): void {
    let sprite = this.renderSprites.get(playerId);
    
    if (!sprite) {
      // Create new sprite if it doesn't exist
      if (!updates.classType) {
        console.warn(`🚨 Cannot create sprite for ${playerId} without classType`);
        return;
      }
      sprite = this.createDefaultSprite(playerId, updates.classType);
      console.log(`🎨 Created new sprite for ${playerId} with class ${updates.classType}`);
    }

    // Update only provided fields
    Object.assign(sprite, updates, { lastUpdate: Date.now() });
    this.renderSprites.set(playerId, sprite);
  }

  /**
   * Remove a sprite from the rendering system
   */
  private removeSprite(playerId: string): void {
    this.renderSprites.delete(playerId);
    this.raycaster.removeSprite(playerId);
  }

  /**
   * Calculate sprite direction based on viewer perspective
   * This is the CRITICAL function that fixes sprite direction issues
   * 
   * Example: If player faces north and viewer is south of player, sprite should show FORWARD
   */
  private calculateSpriteDirection(
    spriteAngle: number,      // Direction sprite is facing (in radians)
    viewerPosition: Vector2,   // Where viewer is
    spritePosition: Vector2    // Where sprite is
  ): import('../renderer/SpriteSheet').WalkDirection {
    // Calculate angle from viewer to sprite (FIXED: was sprite to viewer)
    // According to memory: sprite.angle - atan2(sprite.y - viewer.y, sprite.x - viewer.x) + PI
    const dx = spritePosition.x - viewerPosition.x;  // Fixed: was viewerPosition.x - spritePosition.x
    const dy = spritePosition.y - viewerPosition.y;  // Fixed: was viewerPosition.y - spritePosition.y
    const angleFromViewerToSprite = Math.atan2(dy, dx);
    
    // Calculate relative angle (how sprite appears to viewer)
    // CRITICAL FIX: Added + Math.PI offset for correct viewing perspective
    let relativeAngle = spriteAngle - angleFromViewerToSprite + Math.PI;  // Added + PI
    
    // Normalize to [-PI, PI]
    while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
    while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
    
    // Convert to walk direction using existing utility
    const direction = angleToDirection(relativeAngle);
    
    // Debug logging (throttled to prevent spam)
    if (Math.random() < 0.01) { // Log 1% of calculations
      console.log(`🧭 Sprite direction calc: angle=${(spriteAngle * 180 / Math.PI).toFixed(1)}°, viewerToSprite=${(angleFromViewerToSprite * 180 / Math.PI).toFixed(1)}°, relative=${(relativeAngle * 180 / Math.PI).toFixed(1)}°, direction=${direction}`);
    }
    
    return direction;
  }

  /**
   * Unified player update method - handles all player state changes
   * This method replaces onPlayerMoved, onPlayerRotated, and consolidates player updates
   */
  public onPlayerUpdate(playerId: string, updateData: {
    position?: Vector2;
    angle?: number;
    classType?: ClassType;
    isMoving?: boolean;
    health?: number;
    armor?: number;
    isAlive?: boolean;
    username?: string;
    velocity?: { x: number; y: number };
  }): void {
    // CRITICAL: Skip updates for local player
    if (playerId === this.localPlayerId) {
      console.warn(`⚠️ MainGameScene: Attempted to update local player ${playerId}. Ignoring.`);
      return;
    }

    // Get or create player in unified state
    let player = this.renderPlayers.get(playerId);
    if (!player) {
      if (!updateData.classType) {
        console.error(`⚠️ MainGameScene: Cannot create player ${playerId} without class type!`);
        return;
      }
      player = this.createDefaultPlayer(playerId, updateData.classType);
    }

    // Update player data with provided values
    if (updateData.position !== undefined) {
      player.position = { ...updateData.position };
    }
    if (updateData.angle !== undefined) {
      player.angle = updateData.angle;
    }
    if (updateData.classType !== undefined) {
      player.classType = updateData.classType;
    }
    if (updateData.isMoving !== undefined) {
      player.isMoving = updateData.isMoving;
    }
    if (updateData.health !== undefined) {
      player.health = updateData.health;
    }
    if (updateData.armor !== undefined) {
      player.armor = updateData.armor;
    }
    if (updateData.isAlive !== undefined) {
      player.isAlive = updateData.isAlive;
    }
    if (updateData.username !== undefined) {
      player.username = updateData.username;
    }
    if (updateData.velocity !== undefined) {
      player.velocity = { ...updateData.velocity };
    }

    player.lastUpdate = Date.now();
    this.renderPlayers.set(playerId, player);

    // Update unified sprite system
    this.updateSprite(playerId, {
      position: player.position,
      angle: player.angle,
      classType: player.classType,
      health: player.health,
      armor: player.armor,
      isAlive: player.isAlive,
      isMoving: player.isMoving,
      velocity: player.velocity || { x: 0, y: 0 },
      username: player.username
    });

  }

  public onPlayerMoved(playerId: string, position: Vector2, angle: number, classType?: ClassType, isMoving?: boolean): void {
    // Use unified update method
    this.onPlayerUpdate(playerId, {
      position,
      angle,
      classType,
      isMoving
    });
  }
  
  public onPlayerRotated(playerId: string, angle: number, classType?: ClassType): void {
    // Use unified update method
    this.onPlayerUpdate(playerId, {
      angle,
      classType
    });
  }
  
  /**
   * Update player ID when received from network manager
   */
  public updatePlayerIdFromNetwork(playerId: string): void {
    const oldPlayerId = this.localPlayerId;
    
    if (!this.localPlayerId || this.localPlayerId.startsWith('temp_')) {
      this.localPlayerId = playerId;
      console.log(`🔧 MainGameScene: Updated local player ID from network: ${oldPlayerId} -> ${this.localPlayerId}`);
      
      // CRITICAL: Tell raycaster about local player ID
      if (this.raycaster) {
        this.raycaster.setLocalPlayerId(this.localPlayerId);
      }
      
      // CRITICAL: Remove any sprite registered for local player
      this.removeSprite(this.localPlayerId);
      console.log(`🔧 MainGameScene: Removed any sprite for local player ${this.localPlayerId}`);
      
      // Re-initialize combat if needed
      if (this.combatManager && this.archerCombat) {
        console.log(`🔧 MainGameScene: Re-initializing combat after player ID update`);
        this.initializeCombat();
      }
    }
    
    // CRITICAL: Purge local player from rendering system
    // This handles the race condition where player:joined fired before localPlayerId was set
    if (this.renderPlayers.has(this.localPlayerId)) {
      console.log(`🧹 MainGameScene: Purging local player ${this.localPlayerId} from renderPlayers`);
      this.renderPlayers.delete(this.localPlayerId);
      this.removeSprite(this.localPlayerId);
    }
    
    // CRITICAL: Remove local player from raycaster's otherPlayers
    if (this.raycaster) {
      this.raycaster.removeOtherPlayer(this.localPlayerId);
      console.log(`🧹 MainGameScene: Removed local player ${this.localPlayerId} from raycaster`);
    }
    
    // CRITICAL: Remove any sprites for the old player ID as well
    if (oldPlayerId && oldPlayerId !== this.localPlayerId) {
      if (this.renderPlayers.has(oldPlayerId)) {
        console.log(`🧹 MainGameScene: Purging old player ID ${oldPlayerId} from renderPlayers`);
        this.renderPlayers.delete(oldPlayerId);
      }
      this.removeSprite(oldPlayerId);
      if (this.raycaster) {
        this.raycaster.removeOtherPlayer(oldPlayerId);
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
    
    // Process ALL player data in a single loop
    for (const playerData of gameUpdate.players) {
      if (playerData.id === this.localPlayerId) {
        // Update our own health/armor from server (authoritative)
        if (playerData.health !== undefined) {
          this.playerHealth = playerData.health;
        }
        if (playerData.armor !== undefined) {
          this.playerArmor = playerData.armor;
        }
        // Skip position update - we control our own movement
        continue;
      }
      
      // For remote players, update position and state
      if (playerData.id) {
        // Update position with server-authoritative data
        this.onPlayerMoved(playerData.id, playerData.position, playerData.angle || 0, playerData.classType);
        
        // Store their health/armor for UI display in renderPlayers
        let remotePlayer = this.renderPlayers.get(playerData.id);
        if (remotePlayer) {
          remotePlayer.health = playerData.health;
          remotePlayer.armor = playerData.armor;
          remotePlayer.isAlive = playerData.isAlive;
        }
      }
    }
    
    // Handle projectile updates if present
    if (gameUpdate.projectiles) {
      if (this.debugCombat) {
        console.log(`🎯 [STEP 21] Processing ${gameUpdate.projectiles.length} projectiles from game update:`, gameUpdate.projectiles);
      }
      this.onProjectileUpdate(gameUpdate.projectiles);
    }
    
    // Handle player updates if present
    if (gameUpdate.players) {
      if (this.debugCombat) {
        console.log(`👥 [STEP 21B] Processing ${gameUpdate.players.length} players from game update:`, gameUpdate.players);
      }
      this.onPlayersUpdate(gameUpdate.players);
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
    if (this.debugCombat) {
      console.log(`🎯 [STEP 22] Processing ${serverProjectiles.length} projectiles from server (direct management)`);
    }
    
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
    
    // Also sync with CombatManager for unified projectile management
    if (this.combatManager) {
      this.combatManager.syncServerProjectiles(serverProjectiles);
    }
    
    console.log(`📊 Total projectiles after sync: ${this.renderProjectiles.size}`);
  }

  /**
   * Handle server player state updates (unified player sync)
   */
  public onPlayersUpdate(serverPlayers: any[]): void {
    if (this.debugCombat) {
      console.log(`👥 Processing ${serverPlayers.length} players from server (unified sync)`);
    }
    
    // Get current players for comparison
    const currentPlayerIds = new Set(this.renderPlayers.keys());
    const serverPlayerIds = new Set(serverPlayers.map(p => p.id));
    
    // Remove players that are no longer on the server
    for (const id of currentPlayerIds) {
      if (!serverPlayerIds.has(id) && id !== this.localPlayerId) {
        console.log(`🗑️ Removing remote player ${id} - not in server state`);
        this.renderPlayers.delete(id);
        this.removeSprite(id);
      }
    }
    
    // Add or update players from server using unified update method
    for (const serverPlayer of serverPlayers) {
      // Skip local player - we manage that separately
      if (serverPlayer.id === this.localPlayerId) continue;
      
      // Use unified update method for all player changes
      this.onPlayerUpdate(serverPlayer.id, {
        position: serverPlayer.position,
        angle: serverPlayer.angle,
        classType: serverPlayer.classType,
        health: serverPlayer.health,
        armor: serverPlayer.armor,
        isAlive: serverPlayer.isAlive,
        isMoving: serverPlayer.isMoving,
        username: serverPlayer.username
      });
    }
    
    console.log(`📊 Total players after sync: ${this.renderPlayers.size}`);
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
      this.renderPlayers.delete(event.playerId);
      this.removeSprite(event.playerId);
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