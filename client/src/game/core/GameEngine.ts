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
import { MovementPredictor } from '../movement/MovementPredictor.js';
import { MovementCalculator } from '@dueled/shared';
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
  private movementPredictor: MovementPredictor;
  
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
  
  // Local player state (now managed by MovementPredictor)
  private isMovementInitialized: boolean = false;
  
  constructor(inputConfig: InputConfig = DEFAULT_INPUT_CONFIG) {
    this.inputConfig = inputConfig;
    
    // Initialize systems
    this.inputManager = new InputManager(inputConfig);
    this.inputCommandGenerator = new InputCommandGenerator();
    this.inputQueue = new InputQueue();
    this.gameSocket = new GameSocket();
    this.messageHandler = new MessageHandler();
    this.gameStateManager = new ClientGameStateManager();
    
    // Initialize movement predictor with default config
    const movementConfig = MovementCalculator.createDefaultConfig();
    this.movementPredictor = new MovementPredictor(movementConfig);
    
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
    this.movementPredictor.reset();
    this.isMovementInitialized = false;
    
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
  
  /**
   * Process player input and generate commands
   * 
   * Handles input processing pipeline:
   * 1. Processes mouse look (client-authoritative)
   * 2. Generates input commands for server
   * 3. Applies local movement prediction
   * 4. Queues commands for network transmission
   */
  private processInput(): void {
    if (!this.isMovementInitialized) {
      return;
    }
    
    const keyState = this.inputManager.getKeyState();
    const mouseState = this.inputManager.getMouseState();
    
    // Handle mouse look immediately (client authoritative)
    this.processMouseLook(mouseState);
    
    // Generate input commands for server
    const commands = this.inputCommandGenerator.generateCommands(keyState, mouseState);
    
    // Process movement commands with local prediction
    for (const command of commands) {
      if (command.type === 'movement') {
        this.processMovementCommand(command);
        this.gameStateManager.addPendingInput(command);
      }
    }
    
    // Queue commands for network transmission
    this.inputQueue.enqueueCommands(commands);
  }
  
  /**
   * Process mouse look input (client-authoritative)
   * 
   * Mouse look is processed immediately on the client for responsive
   * camera movement without waiting for server confirmation.
   * 
   * @param mouseState - Current mouse input state
   */
  private processMouseLook(mouseState: MouseState): void {
    const { deltaX } = mouseState;
    
    if (Math.abs(deltaX) > 0.001) {
      // Convert mouse delta to angle change
      const angleDelta = deltaX * 0.002;
      const currentAngle = this.movementPredictor.getCurrentAngle();
      let newAngle = currentAngle + angleDelta;
      
      // Normalize angle to 0-2π range
      while (newAngle < 0) newAngle += Math.PI * 2;
      while (newAngle >= Math.PI * 2) newAngle -= Math.PI * 2;
      
      // Update angle in movement predictor
      this.movementPredictor.updateAngle(newAngle);
    }
  }

  /**
   * Apply continuous client-side movement prediction
   * 
   * Processes current input state every frame to provide smooth,
   * responsive movement between discrete input commands sent to server.
   * 
   * @param deltaTime - Time since last frame in milliseconds
   */
  private applyContinuousMovement(deltaTime: number): void {
    if (!this.isMovementInitialized) {
      return;
    }

    const keyState = this.inputManager.getKeyState();
    
    // Convert key states to movement input
    let forward = 0;
    let strafe = 0;
    
    if (keyState.forward === true) forward += 1;
    if (keyState.backward === true) forward -= 1;
    if (keyState.right === true) strafe -= 1;  // D key moves right (negative strafe)
    if (keyState.left === true) strafe += 1;   // A key moves left (positive strafe)
    
    // Apply movement prediction for smooth interpolation
    const sequenceId = this.inputCommandGenerator.getCurrentSequence() + 1;
    const deltaTimeSeconds = deltaTime / 1000;
    
    this.movementPredictor.predictMovement(
      sequenceId,
      {
        forward,
        strafe,
        sprint: keyState.sprint || false
      },
      deltaTimeSeconds
    );
  }

  /**
   * Process movement command using new prediction system
   */
  private processMovementCommand(command: InputCommand): void {
    if (!this.isMovementInitialized) {
      return;
    }
    
    // Extract movement data from command
    const { forward = 0, strafe = 0, sprint = false } = command.data;
    
    // Use movement predictor for command-based movement
    const deltaTimeSeconds = 1/60; // Assume 60 FPS for command processing
    
    this.movementPredictor.predictMovement(
      command.sequenceId,
      {
        forward,
        strafe,
        sprint
      },
      deltaTimeSeconds
    );
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
  
  /**
   * Handle delta updates from server
   * 
   * Processes incremental state updates from the server and applies them
   * to the local game state through the message handler.
   * 
   * @param delta - Server delta update containing changes since last update
   */
  private onDeltaUpdate(delta: DeltaUpdate): void {
    // Process delta through message handler
    this.messageHandler.processDeltaUpdate(delta);
    
    // Acknowledge processed inputs for server reconciliation
    this.gameStateManager.acknowledgeInputs(delta.lastProcessedInput);
  }
  
  private onMatchStart(data: MatchStartData): void {
    console.log('Match starting:', data.matchId);
    
    // Initialize game state
    this.messageHandler.initializeMatch(data);
    
    // Reset input systems
    this.inputCommandGenerator.resetSequence();
    
    // Reset movement predictor
    this.movementPredictor.reset();
    this.isMovementInitialized = false;
    
    this.callbacks.onMatchStart?.(data);
  }
  
  private onMatchEnd(data: MatchEndData): void {
    console.log('Match ended');
    
    // Clear game state
    this.gameStateManager.clearState();
    this.messageHandler.clear();
    
    // Reset movement system
    this.movementPredictor.reset();
    this.isMovementInitialized = false;
    
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
  
  /**
   * Update local game state with client-side predictions
   * 
   * Runs every frame (60 FPS) to update the local player's position
   * with movement predictions. This ensures smooth movement between
   * server updates (30 Hz).
   * 
   * @param _deltaTime - Time since last frame (unused, predictor manages time)
   */
  private updateGameState(_deltaTime: number): void {
    // Only update if movement system is initialized
    if (!this.isMovementInitialized) {
      return;
    }
    
    const currentState = this.gameStateManager.getCurrentState();
    if (!currentState) {
      return;
    }
    
    const localPlayer = currentState.players.get(currentState.localPlayerId);
    if (!localPlayer) {
      return;
    }
    
    // Update local player with latest predicted values
    // This ensures smooth 60 FPS movement even with 30 Hz server updates
    localPlayer.position = this.movementPredictor.getCurrentPosition();
    localPlayer.angle = this.movementPredictor.getCurrentAngle();
    localPlayer.velocity = this.movementPredictor.getCurrentVelocity();
    
    // Note: We don't call onStateUpdate here to avoid excessive React re-renders
    // The renderer accesses the state directly via gameStateRef
  }
  
  /**
   * Handle complete state updates from MessageHandler
   * 
   * This is the central state update handler that:
   * 1. Initializes the game state on first update
   * 2. Initializes movement prediction when player position data is available
   * 3. Handles ongoing server reconciliation
   * 
   * @param state - Complete client game state
   */
  private onStateUpdate(state: ClientGameState): void {
    
    // Check if this is the first state (initialization)
    if (!this.gameStateManager.getCurrentState()) {
      console.log('🎯 [DEBUG] Initializing client game state for first time');
      // Initialize state for the first time
      this.gameStateManager.initializeState(state);
    }
    
    // Initialize movement when we first get local player position data
    if (!this.isMovementInitialized) {
      const localPlayer = state.players.get(state.localPlayerId);
      if (localPlayer && localPlayer.position) {
        // Initialize movement prediction system with server-provided position
        this.movementPredictor.initialize(localPlayer.position, localPlayer.angle);
        this.isMovementInitialized = true;
      } else {
        // Wait for server to send player position data
      }
    }
    
    // Handle ongoing state updates
    if (this.gameStateManager.getCurrentState()) {
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
   * Reconcile local prediction with server state using new movement predictor
   */
  private reconcileWithServer(serverState: ClientGameState): void {
    if (!this.isMovementInitialized) return;

    const serverPlayer = serverState.players.get(serverState.localPlayerId);
    if (!serverPlayer) return;

    // Use movement predictor's reconciliation system
    // Assume server updates include the last processed sequence ID
    const serverUpdate = {
      position: serverPlayer.position,
      velocity: serverPlayer.velocity || { x: 0, y: 0 },
      sequenceId: (serverPlayer as any).lastProcessedSequence || 0,
      timestamp: Date.now()
    };

    const wasReconciled = this.movementPredictor.reconcileWithServer(serverUpdate);
    
    if (wasReconciled) {
      console.log('🔄 [DEBUG] Position reconciled with server', {
        serverPos: serverPlayer.position,
        predictedPos: this.movementPredictor.getCurrentPosition()
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
   * Get current player position from movement predictor
   */
  getCurrentPlayerPosition(): { x: number; y: number } | null {
    if (!this.isMovementInitialized) {
      return null;
    }
    return this.movementPredictor.getCurrentPosition();
  }
  
  /**
   * Get current player angle from movement predictor
   */
  getCurrentPlayerAngle(): number {
    if (!this.isMovementInitialized) {
      return 0;
    }
    return this.movementPredictor.getCurrentAngle();
  }
  
  /**
   * Get current player velocity from movement predictor
   */
  getCurrentPlayerVelocity(): { x: number; y: number } {
    if (!this.isMovementInitialized) {
      return { x: 0, y: 0 };
    }
    return this.movementPredictor.getCurrentVelocity();
  }
  
  /**
   * Check if movement system is initialized
   */
  isMovementReady(): boolean {
    return this.isMovementInitialized;
  }
  
  /**
   * Get movement predictor debug info
   */
  getMovementDebugInfo(): any {
    if (!this.isMovementInitialized) {
      return { error: 'Movement not initialized' };
    }
    return this.movementPredictor.getDebugInfo();
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
   * Get local player angle (for backward compatibility)
   */
  getLocalPlayerAngle(): number {
    if (!this.isMovementInitialized) {
      return 0;
    }
    return this.movementPredictor.getCurrentAngle();
  }
  
  /**
   * Get local player position (for backward compatibility)
   */
  getLocalPlayerPosition(): { x: number; y: number } | null {
    if (!this.isMovementInitialized) {
      return null;
    }
    return this.movementPredictor.getCurrentPosition();
  }
  
  /**
   * Check if position reconciliation occurred recently (for backward compatibility)
   */
  wasRecentlyReconciled(): boolean {
    if (!this.isMovementInitialized) {
      return false;
    }
    return this.movementPredictor.isCorrectingMovement();
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