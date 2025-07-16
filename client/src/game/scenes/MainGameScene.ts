/**
 * MainGameScene - Main game scene with ray-casted rendering
 * Handles the game loop, player input, and rendering
 */

import { Raycaster } from '../renderer/Raycaster';
import { GameMap } from '../world/GameMap';
import { MainNetworkManager } from '../network/MainNetworkManager';
import { SpriteRenderer } from '../renderer/SpriteRenderer';
import { TextureManager } from '../renderer/TextureManager';
import type { Vector2, ClassType } from '@dueled/shared';
import type { Socket } from 'socket.io-client';

export class MainGameScene {
  private canvas: HTMLCanvasElement;
  private raycaster: Raycaster;
  private gameMap: GameMap;
  private networkManager: MainNetworkManager;
  private spriteRenderer: SpriteRenderer;
  private textureManager: TextureManager;
  
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
  private lastRotationUpdateTime: number = 0;
  private rotationUpdateInterval: number = 100; // Send rotation updates every 100ms
  
  // UI elements
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private statsDiv!: HTMLDivElement;
  private notificationDiv!: HTMLDivElement;
  
  private matchId?: string;
  private matchData?: any;
  private socket?: Socket | null;
  private initialPosition?: Vector2;
  private localPlayerClass: ClassType;
  
  constructor(containerId: string, matchId?: string, matchData?: any, socket?: Socket | null, selectedClass?: ClassType) {
    this.matchId = matchId;
    this.matchData = matchData;
    this.socket = socket;
    
    if (!selectedClass) {
      console.error('⚠️ MainGameScene: No class selected! This should not happen.');
      throw new Error('Player class is required');
    }
    
    this.localPlayerClass = selectedClass;
    
    console.log(`🎮 MainGameScene: Constructor called with:`, {
      matchId,
      socket: !!socket,
      selectedClass,
      localPlayerClass: this.localPlayerClass
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
    instructions.innerHTML = 'WASD: Move • Mouse: Look & Pitch • Arrow Keys/PgUp/PgDn: Pitch • Click: Lock Pointer • ESC: Unlock/Leave Game';
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
    
    // Send rotation update to server when camera rotates
    if (deltaX !== 0) {
      this.sendRotationUpdate();
    }
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
    this.isRunning = false;
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
    
    try {
      // Calculate delta time and FPS
      const deltaTime = currentTime - this.lastFrameTime;
      this.fps = 1000 / deltaTime;
      this.lastFrameTime = currentTime;
    
    // Process input
    this.processInput();
    
    // Send periodic rotation updates
    if (currentTime - this.lastRotationUpdateTime > this.rotationUpdateInterval) {
      this.sendRotationUpdate();
      this.lastRotationUpdateTime = currentTime;
    }
    
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
    } catch (error) {
      console.error('🚨 Game loop error:', error);
      // Try to continue anyway
      if (this.isRunning) {
        requestAnimationFrame((time) => this.gameLoop(time));
      }
    }
  }
  
  /**
   * Start the game
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('🎮 MainGameScene: Starting game initialization...');
    
    // Don't start the game loop yet, wait for proper initialization
    this.lastFrameTime = performance.now();
    
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
    if (this.isRunning) return; // Already started
    
    // Check if we have necessary initialization
    const hasValidPosition = this.initialPosition || this.gameMap.getSpawnPoints().length > 0;
    const hasTextureManager = this.textureManager !== null;
    const hasSpriteRenderer = this.spriteRenderer !== null;
    
    if (hasValidPosition && hasTextureManager && hasSpriteRenderer) {
      console.log('🎮 MainGameScene: All systems ready, starting game loop!');
      this.isRunning = true;
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

  /**
   * Handle match ended event from server
   */
  public onMatchEnded(data: any): void {
    console.log('🚨 Match ended:', data);
    
    // Stop the game immediately
    this.isRunning = false;
    
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
    this.isRunning = false;
    
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
      if (this.isRunning) {
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