/**
 * MainGameScene - Main game scene with ray-casted rendering
 * Handles the game loop, player input, and rendering
 */

import { Raycaster } from '../renderer/Raycaster';
import { GameMap } from '../world/GameMap';
import { MainNetworkManager } from '../network/MainNetworkManager';
import { SpriteRenderer } from '../renderer/SpriteRenderer';
import type { Vector2, ClassType } from '@dueled/shared';
import type { Socket } from 'socket.io-client';

export class MainGameScene {
  private canvas: HTMLCanvasElement;
  private raycaster: Raycaster;
  private gameMap: GameMap;
  private networkManager: MainNetworkManager;
  private spriteRenderer: SpriteRenderer;
  
  // Player state
  private localPlayerId: string = '';
  private remotePlayers: Map<string, { position: Vector2; angle: number; classType: ClassType }> = new Map();
  
  // Input state
  private keys: Set<string> = new Set();
  private mouseX: number = 0;
  private mouseY: number = 0;
  private mouseSensitivity: number = 0.002;
  private pitchSensitivity: number = 0.0008; // Reduced for smoother pitch control
  private pointerLocked: boolean = false;
  
  // Game state
  private isRunning: boolean = false;
  private lastFrameTime: number = 0;
  private fps: number = 0;
  
  // UI elements
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private statsDiv!: HTMLDivElement;
  private notificationDiv!: HTMLDivElement;
  
  private matchId?: string;
  private matchData?: any;
  private socket?: Socket | null;
  private initialPosition?: Vector2;
  private localPlayerClass: ClassType = 'berserker' as ClassType;
  
  constructor(containerId: string, matchId?: string, matchData?: any, socket?: Socket | null, selectedClass?: ClassType) {
    this.matchId = matchId;
    this.matchData = matchData;
    this.socket = socket;
    this.localPlayerClass = selectedClass || ('berserker' as ClassType);
    
    console.log(`🎮 MainGameScene: Local player class set to ${this.localPlayerClass}`);
    
    // Set local player ID from match data
    if (matchData?.yourPlayerId) {
      this.localPlayerId = matchData.yourPlayerId;
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
    this.gameMap = new GameMap(20, 20, 'Arena 1');
    this.networkManager = new MainNetworkManager(this, this.socket);
    this.spriteRenderer = new SpriteRenderer();
    
    // Create UI elements
    this.createUI(container);
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup resize handler
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }
  
  /**
   * Create UI elements
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
    
    // Create stats display
    this.statsDiv = document.createElement('div');
    this.statsDiv.style.position = 'absolute';
    this.statsDiv.style.top = '10px';
    this.statsDiv.style.left = '10px';
    this.statsDiv.style.color = '#10b981';
    this.statsDiv.style.fontFamily = 'monospace';
    this.statsDiv.style.fontSize = '14px';
    this.statsDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    container.appendChild(this.statsDiv);
    
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
    instructions.style.left = '50%';
    instructions.style.transform = 'translateX(-50%)';
    instructions.style.color = '#94a3b8';
    instructions.style.fontFamily = 'Arial, sans-serif';
    instructions.style.fontSize = '12px';
    instructions.style.textAlign = 'center';
    instructions.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
    instructions.innerHTML = 'WASD: Move • Mouse: Look & Pitch • Arrow Keys/PgUp/PgDn: Pitch • Click: Lock Pointer • ESC: Unlock';
    container.appendChild(instructions);
  }
  
  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Keyboard events
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    
    // Mouse events
    this.canvas.addEventListener('click', () => this.requestPointerLock());
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    
    // Pointer lock events
    document.addEventListener('pointerlockchange', () => this.handlePointerLockChange());
    document.addEventListener('pointerlockerror', () => {
      console.error('Pointer lock error');
    });
  }
  
  /**
   * Handle keyboard input
   */
  private handleKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.key.toLowerCase());
    
    // Prevent default for game keys
    if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  }
  
  private handleKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.key.toLowerCase());
  }
  
  /**
   * Handle mouse movement
   */
  private handleMouseMove(event: MouseEvent): void {
    if (!this.pointerLocked) return;
    
    const deltaX = event.movementX;
    const deltaY = event.movementY;
    
    // Horizontal movement for rotation (fix inversion: positive deltaX should turn right)
    this.raycaster.rotatePlayer(deltaX * this.mouseSensitivity);
    
    // Vertical movement for pitch
    this.raycaster.adjustPitch(-deltaY * this.pitchSensitivity);
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
      
      // Send position update to server
      const state = this.raycaster.getPlayerState();
      this.networkManager.sendMovement({
        x: state.x,
        y: state.y,
        angle: state.angle
      });
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
   * Update stats display
   */
  private updateStats(): void {
    const playerState = this.raycaster.getPlayerState();
    this.statsDiv.innerHTML = `
      FPS: ${this.fps.toFixed(0)}<br>
      Pos: ${playerState.x.toFixed(1)}, ${playerState.y.toFixed(1)}<br>
      Angle: ${(playerState.angle * 180 / Math.PI).toFixed(0)}°<br>
      Pitch: ${(playerState.pitch * 180 / Math.PI).toFixed(0)}°
    `;
  }
  
  /**
   * Update sprite directions based on current viewer position/angle
   */
  private updateSpriteDirections(): void {
    const viewerState = this.raycaster.getPlayerState();
    
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
  
  /**
   * Ensure all remote players have sprites rendered, even if they haven't moved
   */
  private ensureAllSpritesRendered(): void {
    // Make sure all remote players are visible in the raycaster
    for (const [playerId, playerData] of this.remotePlayers) {
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
    }
  }
  
  /**
   * Show notification message
   */
  private showNotification(message: string, duration: number = 3000): void {
    this.notificationDiv.innerHTML = message;
    this.notificationDiv.style.display = 'block';
    
    // Auto-hide after duration
    setTimeout(() => {
      this.notificationDiv.style.display = 'none';
    }, duration);
  }
  
  /**
   * Game loop
   */
  private gameLoop(currentTime: number): void {
    if (!this.isRunning) return;
    
    // Calculate delta time and FPS
    const deltaTime = currentTime - this.lastFrameTime;
    this.fps = 1000 / deltaTime;
    this.lastFrameTime = currentTime;
    
    // Process input
    this.processInput();
    
    // Update sprite animations
    this.spriteRenderer.update(currentTime);
    
    // Update sprite directions based on current camera position/angle
    this.updateSpriteDirections();
    
    // Ensure all remote players have sprites rendered
    this.ensureAllSpritesRendered();
    
    // Update game state
    // TODO: Update remote players, projectiles, etc.
    
    // Render
    this.raycaster.render(this.gameMap.getGrid());
    
    // Update UI
    this.updateMinimap();
    this.updateStats();
    
    // Continue loop
    requestAnimationFrame((time) => this.gameLoop(time));
  }
  
  /**
   * Start the game
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    
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
    }
    
    // Start network connection
    this.networkManager.connect();
    
    // If we have a match ID, join it
    if (this.matchId) {
      this.networkManager.joinMatch(this.matchId);
    }
    
    // Start game loop
    requestAnimationFrame((time) => this.gameLoop(time));
  }
  
  /**
   * Stop the game
   */
  public stop(): void {
    this.isRunning = false;
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
    
    const playerData = {
      position: data.position || defaultPosition,
      angle: data.angle || 0,
      classType: (data.classType as ClassType) || ('berserker' as ClassType)
    };
    
    console.log(`🎯 MainGameScene: Player ${playerId} joined with class ${playerData.classType}`);
    
    this.remotePlayers.set(playerId, playerData);
    
    // Get viewer (local player) position and angle for sprite direction calculation
    const viewerState = this.raycaster.getPlayerState();
    
    // Update sprite renderer with viewer perspective
    this.spriteRenderer.updatePlayerSprite(
      playerId, 
      playerData.classType as ClassType, 
      playerData.position, 
      playerData.angle,
      { x: viewerState.x, y: viewerState.y },
      viewerState.angle
    );
    
    // Update renderer with player color based on class (fallback for non-sprite rendering)
    const classColors: Record<string, string> = {
      berserker: '#ff4444',
      mage: '#4444ff',
      bomber: '#ff8800',
      archer: '#44ff44'
    };
    const color = classColors[playerData.classType as string] || '#ff00ff';
    
    // Ensure player is immediately visible
    this.raycaster.updateOtherPlayer(playerId, playerData.position.x, playerData.position.y, color);
    
    // Show notification
    const username = data.username || `Player ${playerId.substring(0, 8)}`;
    this.showNotification(`${username} has joined the game`, 3000);
    
    console.log(`Player ${username} joined at position (${playerData.position.x}, ${playerData.position.y})`);
  }
  
  public onPlayerLeft(playerId: string, data?: any): void {
    const player = this.remotePlayers.get(playerId);
    const username = data?.username || `Player ${playerId.substring(0, 8)}`;
    
    this.remotePlayers.delete(playerId);
    this.raycaster.removeOtherPlayer(playerId);
    this.spriteRenderer.removePlayerSprite(playerId);
    
    // Show notification
    this.showNotification(`${username} has disconnected`, 3000);
    
    console.log(`Player ${username} left the game`);
  }
  
  public onPlayerMoved(playerId: string, position: Vector2, angle: number, classType?: ClassType): void {
    console.log(`MainGameScene: Player ${playerId} moved to (${position.x.toFixed(2)}, ${position.y.toFixed(2)}), angle: ${angle.toFixed(2)}`);
    
    let player = this.remotePlayers.get(playerId);
    if (!player) {
      console.log(`MainGameScene: Creating new remote player ${playerId} with class ${classType || 'berserker'}`);
      // Create player if it doesn't exist
      player = {
        position: position,
        angle: angle,
        classType: classType || ('berserker' as ClassType) // Use provided class or default
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
    console.log(`MainGameScene: Updating raycaster for player ${playerId} with color ${color}`);
    this.raycaster.updateOtherPlayer(playerId, position.x, position.y, color);
  }
  
  /**
   * Handle match joined event from server
   */
  public onMatchJoined(data: any): void {
    console.log('Match joined, received data:', data);
    
    // Set initial spawn position from server
    if (data.initialPosition) {
      this.initialPosition = data.initialPosition;
      
      // If game is already running, update position immediately
      if (this.isRunning) {
        this.raycaster.setPlayerPosition(data.initialPosition.x, data.initialPosition.y);
      }
    }
    
    // Handle existing players in the match
    if (data.players) {
      data.players.forEach((player: any) => {
        if (player.playerId !== this.localPlayerId) {
          // Add position data for immediate visibility
          const playerData = {
            username: player.username,
            classType: player.classType,
            position: player.position || this.getOpponentSpawnPosition(),
            angle: player.angle || 0
          };
          this.onPlayerJoined(player.playerId, playerData);
          
          // Ensure sprite is immediately visible (not just on movement)
          console.log(`🎯 Setting up sprite for existing player ${player.playerId} at position (${playerData.position.x}, ${playerData.position.y})`);
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
    
    // Update all player positions
    for (const [playerId, playerData] of Object.entries(gameUpdate.players)) {
      if (playerId !== this.localPlayerId) {
        const data = playerData as any;
        this.onPlayerMoved(playerId, data.position, data.angle);
      }
    }
  }
} 