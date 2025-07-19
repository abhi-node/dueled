/**
 * GameEngine - Main game coordinator for client-side systems
 * 
 * Orchestrates input capture, network communication, state management,
 * and coordinates the 60 FPS game loop.
 */

import { InputManager } from '../input/InputManager.js';
import { InputCommandGenerator } from '../input/InputCommands.js';
import { InputQueue } from '../input/InputQueue.js';
import { GameSocket } from '../network/GameSocket.js';
import { MessageHandler } from '../network/MessageHandler.js';
import { ClientGameStateManager } from './GameState.js';
import type { 
  InputConfig,
  InputCommand,
  MouseState
} from '../types/InputTypes.js';
import { DEFAULT_INPUT_CONFIG } from '../types/InputTypes.js';
import type {
  ConnectionInfo,
  MatchStartData,
  MatchEndData,
  RoundStartData,
  RoundEndData,
  DeltaUpdate,
  NetworkError
} from '../types/NetworkTypes.js';
import type { ClientGameState } from '../types/GameTypes.js';
import { GAME_CONSTANTS, PREDICTION_CONSTANTS } from '../types/GameConstants.js';

export interface GameEngineCallbacks {
  onConnectionChange?: (info: ConnectionInfo) => void;
  onMatchStart?: (data: MatchStartData) => void;
  onMatchEnd?: (data: MatchEndData) => void;
  onRoundStart?: (data: RoundStartData) => void;
  onRoundEnd?: (data: RoundEndData) => void;
  onStateUpdate?: (state: ClientGameState) => void;
  onError?: (error: NetworkError) => void;
}

export class GameEngine {
  // Core systems
  private inputManager: InputManager;
  private inputCommandGenerator: InputCommandGenerator;
  private inputQueue: InputQueue;
  private gameSocket: GameSocket;
  private messageHandler: MessageHandler;
  private gameStateManager: ClientGameStateManager;
  
  // Game loop
  private gameLoopId: number | null = null;
  private isRunning = false;
  private readonly TARGET_FPS = 60;
  private readonly FRAME_TIME = 1000 / this.TARGET_FPS;
  
  // Configuration
  private inputConfig: InputConfig;
  private callbacks: GameEngineCallbacks = {};
  
  // State
  private canvas: HTMLCanvasElement | null = null;
  
  // Local player state (client authoritative)
  private localPlayerAngle: number = 0;
  private localPlayerPosition: { x: number; y: number } | null = null;
  private lastReconciliationTime: number = 0;
  
  constructor(inputConfig: InputConfig = DEFAULT_INPUT_CONFIG) {
    this.inputConfig = inputConfig;
    
    // Initialize systems
    this.inputManager = new InputManager(inputConfig);
    this.inputCommandGenerator = new InputCommandGenerator();
    this.inputQueue = new InputQueue();
    this.gameSocket = new GameSocket();
    this.messageHandler = new MessageHandler();
    this.gameStateManager = new ClientGameStateManager();
    
    // Setup system connections
    this.setupSystemConnections();
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize the game engine with canvas and callbacks
   */
  initialize(canvas: HTMLCanvasElement, callbacks: GameEngineCallbacks = {}): void {
    console.log('Initializing GameEngine');
    
    this.canvas = canvas;
    this.callbacks = callbacks;
    
    // Setup input queue callback
    this.inputQueue.setCallbacks(
      this.onInputBatchReady.bind(this),
      this.onInputError.bind(this)
    );
    
    // Setup network callbacks
    this.gameSocket.setCallbacks({
      onConnectionChange: this.onConnectionChange.bind(this),
      onDeltaUpdate: this.onDeltaUpdate.bind(this),
      onMatchStart: this.onMatchStart.bind(this),
      onMatchEnd: this.onMatchEnd.bind(this),
      onRoundStart: this.onRoundStart.bind(this),
      onRoundEnd: this.onRoundEnd.bind(this),
      onError: this.onNetworkError.bind(this)
    });
    
    // Setup message handler callbacks
    this.messageHandler.setCallbacks({
      onStateUpdate: this.onStateUpdate.bind(this),
      onPlayerUpdate: this.onPlayerUpdate.bind(this),
      onProjectileUpdate: this.onProjectileUpdate.bind(this)
    });
    
    console.log('GameEngine initialized');
  }
  
  // ============================================================================
  // GAME LOOP
  // ============================================================================
  
  /**
   * Start the game engine
   */
  start(): void {
    if (this.isRunning) {
      console.warn('GameEngine already running');
      return;
    }
    
    if (!this.canvas) {
      throw new Error('Canvas not set. Call initialize() first.');
    }
    
    console.log('Starting GameEngine');
    
    this.isRunning = true;
    
    // Start input systems
    this.inputManager.start(this.canvas);
    this.inputQueue.start();
    
    // Start game loop
    this.startGameLoop();
    
    console.log('GameEngine started');
  }
  
  /**
   * Stop the game engine
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    console.log('Stopping GameEngine');
    
    this.isRunning = false;
    
    // Stop game loop
    this.stopGameLoop();
    
    // Stop input systems
    this.inputManager.stop();
    this.inputQueue.stop();
    
    // Disconnect from server
    this.gameSocket.disconnect('client_shutdown');
    
    // Clear state
    this.gameStateManager.clearState();
    
    console.log('GameEngine stopped');
  }
  
  private startGameLoop(): void {
    let lastTime = performance.now();
    
    const gameLoop = (currentTime: number) => {
      if (!this.isRunning) {
        return;
      }
      
      const deltaTime = currentTime - lastTime;
      
      // Run at target FPS
      if (deltaTime >= this.FRAME_TIME) {
        this.tick(deltaTime);
        lastTime = currentTime;
      }
      
      this.gameLoopId = requestAnimationFrame(gameLoop);
    };
    
    this.gameLoopId = requestAnimationFrame(gameLoop);
    console.log(`Game loop started at ${this.TARGET_FPS} FPS`);
  }
  
  private stopGameLoop(): void {
    if (this.gameLoopId) {
      cancelAnimationFrame(this.gameLoopId);
      this.gameLoopId = null;
    }
  }
  
  private tick(deltaTime: number): void {
    // Only process input if we're connected and in a match
    if (this.gameSocket.isInMatch() && this.inputManager.isInputActive()) {
      this.processInput();
      
      // Apply continuous movement prediction every frame for smoothness
      this.applyContinuousMovement(deltaTime);
    }
    
    // Update game state (prediction, interpolation, etc.)
    this.updateGameState(deltaTime);
  }
  
  // ============================================================================
  // INPUT PROCESSING
  // ============================================================================
  
  private processInput(): void {
    // Get current input state
    const keyState = this.inputManager.getKeyState();
    const mouseState = this.inputManager.getMouseState();
    
    // Handle mouse look immediately (client authoritative)
    this.processMouseLook(mouseState);
    
    // Generate input commands
    const commands = this.inputCommandGenerator.generateCommands(keyState, mouseState);
    
    // Add movement commands to prediction system (server authoritative)
    for (const command of commands) {
      if (command.type === 'movement') {
        // Apply movement prediction immediately for responsive feel
        this.applyMovementPrediction(command);
        
        // Add to prediction system for server reconciliation
        this.gameStateManager.addPendingInput(command);
      }
      // Don't add look commands to prediction - we handle them locally
    }
    
    // Queue for network transmission (includes look commands for other players)
    this.inputQueue.enqueueCommands(commands);
  }
  
  /**
   * Process mouse look immediately on client (no server validation needed)
   * CRITICAL: This method MUST NEVER modify position, only angle
   */
  private processMouseLook(mouseState: MouseState): void {
    const { deltaX } = mouseState;
    
    if (Math.abs(deltaX) > 0.001) {
      // Store position before angle change for verification
      const positionBefore = this.localPlayerPosition ? { ...this.localPlayerPosition } : null;
      
      // Convert mouse delta to angle change (same as InputCommands logic)
      const angleDelta = deltaX * 0.002;
      
      // ONLY MODIFY ANGLE - NEVER POSITION
      this.localPlayerAngle += angleDelta;
      
      // Normalize angle to 0-2π range
      while (this.localPlayerAngle < 0) this.localPlayerAngle += Math.PI * 2;
      while (this.localPlayerAngle >= Math.PI * 2) this.localPlayerAngle -= Math.PI * 2;
      
      // CRITICAL SAFEGUARD: Ensure position wasn't accidentally modified
      if (positionBefore && this.localPlayerPosition) {
        const positionChanged = Math.abs(positionBefore.x - this.localPlayerPosition.x) > 0.0001 || 
                               Math.abs(positionBefore.y - this.localPlayerPosition.y) > 0.0001;
        if (positionChanged) {
          console.error('🚨 [CRITICAL BUG] Mouse movement changed position! Restoring position.', {
            before: positionBefore,
            corrupted: this.localPlayerPosition,
            angleDelta
          });
          // Restore the position immediately
          this.localPlayerPosition.x = positionBefore.x;
          this.localPlayerPosition.y = positionBefore.y;
        }
      }
    }
  }

  /**
   * Apply continuous smooth movement every frame based on current input state
   */
  private applyContinuousMovement(deltaTime: number): void {
    // Don't apply movement if position isn't initialized yet
    if (!this.localPlayerPosition) return;

    // Get current input state
    const keyState = this.inputManager.getKeyState();
    
    // Calculate movement vector ONLY from keyboard input
    let forward = 0;
    let strafe = 0;
    
    // CRITICAL: Only use boolean key states, never floating point values
    if (keyState.forward === true) forward += 1;
    if (keyState.backward === true) forward -= 1;
    if (keyState.right === true) strafe += 1;
    if (keyState.left === true) strafe -= 1;
    
    // Additional safeguard: Verify key states are actually booleans
    if (typeof keyState.forward !== 'boolean' || 
        typeof keyState.backward !== 'boolean' ||
        typeof keyState.left !== 'boolean' ||
        typeof keyState.right !== 'boolean') {
      console.error('🚨 [BUG] Invalid key state types detected!', keyState);
      return; // Abort movement if key states are corrupted
    }
    
    // Only apply movement if there's significant input (prevent floating point drift)
    const hasSignificantInput = Math.abs(forward) > PREDICTION_CONSTANTS.MOVEMENT_INPUT_THRESHOLD || 
                               Math.abs(strafe) > PREDICTION_CONSTANTS.MOVEMENT_INPUT_THRESHOLD;
    
    if (hasSignificantInput) {
      // Normalize diagonal movement
      if (Math.abs(forward) > 0 && Math.abs(strafe) > 0) {
        const magnitude = Math.sqrt(forward * forward + strafe * strafe);
        forward /= magnitude;
        strafe /= magnitude;
      }
      
      // Apply movement using frame-rate independent deltaTime
      const speed = GAME_CONSTANTS.PLAYER_SPEED;
      const sprintMultiplier = keyState.sprint ? GAME_CONSTANTS.SPRINT_MULTIPLIER : 1;
      const frameTime = deltaTime / 1000; // Convert ms to seconds
      
      // Calculate movement in player's facing direction
      const moveDistance = speed * sprintMultiplier * frameTime;
      const forwardX = Math.cos(this.localPlayerAngle) * forward * moveDistance;
      const forwardY = Math.sin(this.localPlayerAngle) * forward * moveDistance;
      const strafeX = Math.cos(this.localPlayerAngle + Math.PI/2) * strafe * moveDistance;
      const strafeY = Math.sin(this.localPlayerAngle + Math.PI/2) * strafe * moveDistance;
      
      // Update local predicted position smoothly
      this.localPlayerPosition.x += forwardX + strafeX;
      this.localPlayerPosition.y += forwardY + strafeY;
    }
  }

  /**
   * Apply movement prediction immediately for responsive feel (legacy method for input commands)
   */
  private applyMovementPrediction(command: InputCommand): void {
    // Movement commands are now handled by applyContinuousMovement() for smoother feel
    // This method remains for potential future command-based prediction logic
  }
  
  private onInputBatchReady(batch: any): void {
    // Send to server
    this.gameSocket.sendInputBatch(batch);
  }
  
  private onInputError(error: string): void {
    console.error('Input system error:', error);
    this.callbacks.onError?.({
      code: 'INPUT_ERROR',
      message: error,
      timestamp: Date.now(),
      recoverable: true
    });
  }
  
  // ============================================================================
  // NETWORK HANDLING
  // ============================================================================
  
  /**
   * Connect to game server
   */
  async connectToServer(serverUrl: string, authToken: string): Promise<void> {
    try {
      await this.gameSocket.connect(serverUrl, authToken);
    } catch (error) {
      console.error('Failed to connect to server:', error);
      throw error;
    }
  }
  
  /**
   * Connect using existing socket from matchmaking
   */
  async connectWithExistingSocket(existingSocket: any, matchId: string, selectedClass: string): Promise<void> {
    try {
      console.log('🔗 [DEBUG] GameEngine.connectWithExistingSocket START', { matchId, selectedClass });
      
      // Use the existing socket for game communication
      console.log('📡 [DEBUG] Calling gameSocket.connectWithExistingSocket');
      await this.gameSocket.connectWithExistingSocket(existingSocket);
      console.log('✅ [DEBUG] gameSocket.connectWithExistingSocket completed');
      
      // Join the match using the existing socket
      console.log('📤 [DEBUG] Emitting join_match event', { matchId, classType: selectedClass });
      existingSocket.emit('join_match', { 
        matchId, 
        classType: selectedClass 
      });
      console.log('✅ [DEBUG] join_match event emitted');
      
      console.log('🎉 [DEBUG] GameEngine.connectWithExistingSocket COMPLETE');
    } catch (error) {
      console.error('❌ [DEBUG] Failed to connect with existing socket:', error);
      throw error;
    }
  }
  
  /**
   * Disconnect from game server
   */
  disconnectFromServer(reason = 'user_disconnect'): void {
    this.gameSocket.disconnect(reason);
  }
  
  private onConnectionChange(info: ConnectionInfo): void {
    console.log('Connection state changed:', info.state);
    this.callbacks.onConnectionChange?.(info);
  }
  
  private onDeltaUpdate(delta: DeltaUpdate): void {
    // Process delta through message handler
    this.messageHandler.processDeltaUpdate(delta);
    
    // Acknowledge processed inputs
    this.gameStateManager.acknowledgeInputs(delta.lastProcessedInput);
  }
  
  private onMatchStart(data: MatchStartData): void {
    console.log('Match starting:', data.matchId);
    
    // Initialize game state
    this.messageHandler.initializeMatch(data);
    
    // Reset input systems
    this.inputCommandGenerator.resetSequence();
    
    // Reset local player state
    this.localPlayerAngle = 0;
    this.localPlayerPosition = null; // Will be initialized on first movement
    
    this.callbacks.onMatchStart?.(data);
  }
  
  private onMatchEnd(data: MatchEndData): void {
    console.log('Match ended');
    
    // Clear game state
    this.gameStateManager.clearState();
    this.messageHandler.clear();
    
    this.callbacks.onMatchEnd?.(data);
  }
  
  private onRoundStart(data: RoundStartData): void {
    console.log('Round', data.roundNumber, 'starting');
    
    this.messageHandler.handleRoundStart(data);
    this.callbacks.onRoundStart?.(data);
  }
  
  private onRoundEnd(data: RoundEndData): void {
    console.log('Round ended, winner:', data.winnerId);
    
    this.messageHandler.handleRoundEnd(data);
    this.callbacks.onRoundEnd?.(data);
  }
  
  private onNetworkError(error: NetworkError): void {
    console.error('Network error:', error);
    this.callbacks.onError?.(error);
  }
  
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  private updateGameState(deltaTime: number): void {
    // Update any client-side predictions or interpolations here
    // This is where frame-rate independent updates would happen
  }
  
  private onStateUpdate(state: ClientGameState): void {
    // Check if this is the first state (initialization)
    if (!this.gameStateManager.getCurrentState()) {
      console.log('🎯 [DEBUG] Initializing client game state for first time');
      // Initialize state for the first time
      this.gameStateManager.initializeState(state);
      
      // Initialize local position from server (one time only)
      const localPlayer = state.players.get(state.localPlayerId);
      if (localPlayer) {
        this.localPlayerPosition = { x: localPlayer.position.x, y: localPlayer.position.y };
        this.localPlayerAngle = localPlayer.angle;
      }
    } else {
      // Server reconciliation: check if our prediction was wrong
      this.reconcileWithServer(state);
      
      // Update existing state with delta/new data
      this.gameStateManager.updateFromServer(state);
    }
    
    // Notify callbacks with the updated state from the game state manager
    const currentState = this.gameStateManager.getCurrentState();
    if (currentState) {
      this.callbacks.onStateUpdate?.(currentState);
    }
  }

  /**
   * Reconcile local prediction with server state using smart adaptive thresholds
   */
  private reconcileWithServer(serverState: ClientGameState): void {
    if (!this.localPlayerPosition) return;

    const serverPlayer = serverState.players.get(serverState.localPlayerId);
    if (!serverPlayer) return;

    // Calculate position difference
    const deltaX = serverPlayer.position.x - this.localPlayerPosition.x;
    const deltaY = serverPlayer.position.y - this.localPlayerPosition.y;
    const positionDiff = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Smart movement detection - check if input has changed recently
    const keyState = this.inputManager.getKeyState();
    const isCurrentlyMoving = keyState.forward || keyState.backward || keyState.left || keyState.right;
    
    // Don't reconcile if player just started moving (give prediction time to work)
    const timeSinceLastReconciliation = Date.now() - this.lastReconciliationTime;
    const recentlyReconciled = timeSinceLastReconciliation < 500; // 500ms grace period
    
    if (isCurrentlyMoving && recentlyReconciled) {
      // Skip reconciliation - let client prediction handle it
      return;
    }
    
    // Use different thresholds based on movement state
    const threshold = isCurrentlyMoving 
      ? PREDICTION_CONSTANTS.MOVING_RECONCILIATION_THRESHOLD
      : PREDICTION_CONSTANTS.STATIC_RECONCILIATION_THRESHOLD;

    if (positionDiff > threshold) {
      // Adaptive correction strength based on error magnitude
      let correctionFactor;
      if (positionDiff > PREDICTION_CONSTANTS.SNAP_CORRECTION_THRESHOLD) {
        // Large error: snap immediately (likely a teleport or major desync)
        correctionFactor = 1.0;
      } else if (positionDiff > PREDICTION_CONSTANTS.SMALL_ERROR_THRESHOLD) {
        // Medium error: correct gently
        correctionFactor = PREDICTION_CONSTANTS.MEDIUM_CORRECTION_FACTOR;
      } else {
        // Small error: barely noticeable correction
        correctionFactor = PREDICTION_CONSTANTS.GENTLE_CORRECTION_FACTOR;
      }

      // Apply the correction smoothly
      this.localPlayerPosition.x += deltaX * correctionFactor;
      this.localPlayerPosition.y += deltaY * correctionFactor;

      // Mark reconciliation time
      this.lastReconciliationTime = Date.now();

      console.log('🔄 [DEBUG] Smart reconciliation applied', {
        difference: positionDiff.toFixed(3),
        threshold: threshold.toFixed(1),
        correctionFactor: correctionFactor.toFixed(3),
        isMoving: isCurrentlyMoving,
        recentlyReconciled
      });
    }
  }
  
  private onPlayerUpdate(playerId: string, player: any): void {
    this.gameStateManager.updatePlayer(playerId, player);
  }
  
  private onProjectileUpdate(projectileId: string, projectile: any): void {
    this.gameStateManager.updateProjectile(projectileId, projectile);
  }
  
  // ============================================================================
  // SYSTEM CONNECTIONS
  // ============================================================================
  
  private setupSystemConnections(): void {
    // Systems are connected through callbacks in initialize()
    console.log('System connections established');
  }
  
  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  /**
   * Get current game state
   */
  getGameState(): ClientGameState | null {
    return this.gameStateManager.getCurrentState();
  }

  /**
   * Get game state manager for interpolation support
   */
  getGameStateManager(): ClientGameStateManager {
    return this.gameStateManager;
  }
  
  /**
   * Get connection info
   */
  getConnectionInfo(): ConnectionInfo {
    return this.gameSocket.getConnectionInfo();
  }
  
  /**
   * Check if engine is running
   */
  isEngineRunning(): boolean {
    return this.isRunning;
  }
  
  /**
   * Check if connected to server
   */
  isConnected(): boolean {
    return this.gameSocket.isConnected();
  }
  
  /**
   * Check if in active match
   */
  isInMatch(): boolean {
    return this.gameSocket.isInMatch();
  }
  
  /**
   * Update input configuration
   */
  updateInputConfig(config: Partial<InputConfig>): void {
    this.inputConfig = { ...this.inputConfig, ...config };
    this.inputManager.updateConfig(this.inputConfig);
  }
  
  /**
   * Send ready signal
   */
  sendPlayerReady(): void {
    this.gameSocket.sendPlayerReady();
  }
  
  /**
   * Get input statistics
   */
  getInputStats(): any {
    return {
      queue: this.inputQueue.getStats(),
      sequence: this.inputCommandGenerator.getCurrentSequence()
    };
  }
  
  /**
   * Get local player angle (client authoritative)
   */
  getLocalPlayerAngle(): number {
    return this.localPlayerAngle;
  }

  /**
   * Get local player position (client predicted)
   */
  getLocalPlayerPosition(): { x: number; y: number } | null {
    return this.localPlayerPosition;
  }

  /**
   * Check if position reconciliation occurred recently (within last frame)
   */
  wasRecentlyReconciled(): boolean {
    const RECONCILIATION_GRACE_PERIOD = 300; // 300ms grace period for smoother movement
    return (Date.now() - this.lastReconciliationTime) < RECONCILIATION_GRACE_PERIOD;
  }
  
  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.stop();
    this.gameSocket.destroy();
    
    // Clear callbacks
    this.callbacks = {};
  }
}