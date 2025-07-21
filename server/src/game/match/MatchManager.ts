/**
 * MatchManager - Complete match lifecycle management
 * 
 * Orchestrates GameState, RoundSystem, and player interactions.
 * Handles match creation, player management, and cleanup.
 */

import { logger } from '../../utils/logger.js';
import { GameStateManager } from './GameState.js';
import { RoundSystem, type RoundSystemCallbacks, type MatchResult } from './RoundSystem.js';
import { CollisionSystem } from '../physics/CollisionSystem.js';
import { ProjectilePhysics } from '../physics/ProjectilePhysics.js';
import { MovementCalculator, type MovementConfig } from '@dueled/shared';
import type {
  InputCommand,
  DeltaUpdate,
  MapData,
  PlayerState,
  ProjectileState
} from '../types.js';
import { GAME_CONSTANTS, WEAPON_CONFIGS } from '../types.js';
import type { ClassTypeValue } from '@dueled/shared';

export interface MatchPlayer {
  id: string;
  username: string;
  classType: ClassTypeValue;
  rating: number;
  connected: boolean;
  lastInputTime: number;
}

export interface MatchManagerCallbacks {
  onMatchStart?: (matchId: string) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onMatchCompletelyFinished?: (matchId: string) => void;
  onPlayerDisconnected?: (matchId: string, playerId: string) => void;
  onDeltaUpdate?: (matchId: string, delta: DeltaUpdate) => void;
  onRoundStart?: (matchId: string, roundNumber: number) => void;
  onRoundEnd?: (matchId: string, result: any) => void;
  onCountdownTick?: (matchId: string, roundNumber: number, countdown: number) => void;
  onCountdownComplete?: (matchId: string, roundNumber: number) => void;
}

export class MatchManager {
  private matchId: string;
  private gameState: GameStateManager;
  private roundSystem: RoundSystem;
  private callbacks: MatchManagerCallbacks;
  
  // Physics Systems
  private collisionSystem: CollisionSystem;
  private projectilePhysics: ProjectilePhysics;
  private movementCalculator: MovementCalculator;
  
  // Players
  private players: Map<string, MatchPlayer> = new Map();
  private spectators: Set<string> = new Set();
  
  // Game Loop
  private gameLoopTimer: NodeJS.Timeout | null = null;
  private readonly TICK_RATE = 30; // 30 Hz
  private readonly TICK_INTERVAL = 1000 / this.TICK_RATE;
  
  // Input Processing
  private inputQueue: Map<string, InputCommand[]> = new Map(); // playerId -> commands
  private lastSequenceProcessed: Map<string, number> = new Map();
  
  // State
  private isActive: boolean = false;
  private createdAt: number;
  
  constructor(
    matchId: string,
    player1: { id: string; username: string; classType: ClassTypeValue; rating: number },
    player2: { id: string; username: string; classType: ClassTypeValue; rating: number },
    mapData: MapData,
    callbacks: MatchManagerCallbacks = {}
  ) {
    this.matchId = matchId;
    this.callbacks = callbacks;
    this.createdAt = Date.now();
    
    // Initialize game state
    this.gameState = new GameStateManager(matchId, player1.id, player2.id, mapData);
    
    // Initialize physics systems with dynamic map bounds
    this.collisionSystem = new CollisionSystem(mapData.walls, mapData.bounds);
    this.projectilePhysics = new ProjectilePhysics();
    
    // Initialize movement calculator with server config
    const movementConfig: MovementConfig = {
      baseSpeed: GAME_CONSTANTS.PLAYER_SPEED,
      sprintMultiplier: GAME_CONSTANTS.SPRINT_MULTIPLIER,
      movementThreshold: 0.01
    };
    this.movementCalculator = new MovementCalculator(movementConfig);
    
    // Add players to game state
    this.gameState.addPlayer(player1.id, player1.username, player1.classType);
    this.gameState.addPlayer(player2.id, player2.username, player2.classType);
    
    // Initialize players map
    this.players.set(player1.id, {
      ...player1,
      connected: true,
      lastInputTime: Date.now()
    });
    this.players.set(player2.id, {
      ...player2,
      connected: true,
      lastInputTime: Date.now()
    });
    
    // Initialize input tracking
    this.inputQueue.set(player1.id, []);
    this.inputQueue.set(player2.id, []);
    this.lastSequenceProcessed.set(player1.id, 0);
    this.lastSequenceProcessed.set(player2.id, 0);
    
    // Setup round system callbacks
    const roundCallbacks: RoundSystemCallbacks = {
      onRoundStart: (roundNumber) => {
        logger.info(`Round ${roundNumber} started in match ${matchId}`);
        this.callbacks.onRoundStart?.(matchId, roundNumber);
      },
      onRoundEnd: (result) => {
        logger.info(`Round ended in match ${matchId}`, result);
        this.callbacks.onRoundEnd?.(matchId, result);
      },
      onMatchEnd: (result) => {
        logger.info(`Match ${matchId} ended`, result);
        this.stop();
        this.callbacks.onMatchEnd?.(result);
      },
      onMatchCompletelyFinished: (matchId) => {
        logger.info(`Match ${matchId} completely finished - triggering final cleanup`);
        this.callbacks.onMatchCompletelyFinished?.(matchId);
      },
      onCountdownTick: (roundNumber, countdown) => {
        logger.debug(`Countdown tick: Round ${roundNumber}, ${countdown}s remaining`);
        this.callbacks.onCountdownTick?.(matchId, roundNumber, countdown);
      },
      onCountdownComplete: (roundNumber) => {
        logger.info(`Countdown complete for round ${roundNumber} in match ${matchId}`);
        this.callbacks.onCountdownComplete?.(matchId, roundNumber);
      },
      onTimeWarning: (timeLeft) => {
        logger.debug(`Time warning: ${timeLeft}s remaining in match ${matchId}`);
      }
    };
    
    // Initialize round system
    this.roundSystem = new RoundSystem(
      this.gameState,
      matchId,
      player1.id,
      player2.id,
      roundCallbacks
    );
    
    logger.info(`MatchManager created`, {
      matchId,
      player1: player1.username,
      player2: player2.username,
      mapWalls: mapData.walls.length
    });
  }
  
  // ============================================================================
  // MATCH LIFECYCLE
  // ============================================================================
  
  /**
   * Start the match systems but wait for player readiness
   */
  start(): void {
    if (this.isActive) {
      logger.warn(`Match ${this.matchId} already active`);
      return;
    }
    
    this.isActive = true;
    
    // Start game loop
    this.startGameLoop();
    
    // Notify callback that match systems are ready
    this.callbacks.onMatchStart?.(this.matchId);
    
    logger.info(`Match ${this.matchId} systems started`);
    
    // Start rounds immediately
    this.roundSystem.startMatch();
  }
  
  
  /**
   * Stop the match and cleanup resources
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }
    
    this.isActive = false;
    
    // Stop game loop
    this.stopGameLoop();
    
    // Cleanup round system
    this.roundSystem.destroy();
    
    logger.info(`Match ${this.matchId} stopped`);
  }
  
  /**
   * Force end the match (disconnect/forfeit)
   */
  forceEnd(winnerId: string, reason: string = 'forfeit'): void {
    if (!this.isActive) {
      return;
    }
    
    logger.info(`Force ending match ${this.matchId}`, { winnerId, reason });
    
    // End through round system
    this.roundSystem.endMatch(winnerId, reason as any);
  }
  
  // ============================================================================
  // PLAYER MANAGEMENT
  // ============================================================================
  
  /**
   * Handle player connection/reconnection
   */
  connectPlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      logger.warn(`Cannot connect unknown player ${playerId} to match ${this.matchId}`);
      return false;
    }
    
    player.connected = true;
    player.lastInputTime = Date.now();
    
    logger.info(`Player ${playerId} connected to match ${this.matchId}`);
    
    return true;
  }
  
  /**
   * Handle player disconnection
   */
  disconnectPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    
    player.connected = false;
    
    // Clear input queue
    this.inputQueue.set(playerId, []);
    
    // Notify round system
    this.roundSystem.onPlayerDisconnected(playerId);
    
    // Notify callback
    this.callbacks.onPlayerDisconnected?.(this.matchId, playerId);
    
    logger.info(`Player ${playerId} disconnected from match ${this.matchId}`);
  }
  
  /**
   * Add spectator to match
   */
  addSpectator(spectatorId: string): void {
    this.spectators.add(spectatorId);
    logger.info(`Spectator ${spectatorId} added to match ${this.matchId}`);
  }
  
  /**
   * Remove spectator from match
   */
  removeSpectator(spectatorId: string): void {
    this.spectators.delete(spectatorId);
    logger.info(`Spectator ${spectatorId} removed from match ${this.matchId}`);
  }
  
  // ============================================================================
  // INPUT PROCESSING
  // ============================================================================
  
  /**
   * Queue input command from player
   */
  queueInput(playerId: string, command: InputCommand): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.connected) {
      return false;
    }
    
    // Validate input timing (anti-cheat)
    const now = Date.now();
    const timeSinceLastInput = now - player.lastInputTime;
    
    if (timeSinceLastInput < 10) { // Max 100 inputs per second
      logger.warn(`Input rate limit exceeded for player ${playerId}`);
      return false;
    }
    
    // Validate command age
    const commandAge = now - command.timestamp;
    if (commandAge > GAME_CONSTANTS.MAX_INPUT_AGE) {
      logger.warn(`Stale input command from player ${playerId}`, { age: commandAge });
      return false;
    }
    
    // Add to queue
    const queue = this.inputQueue.get(playerId) || [];
    queue.push(command);
    this.inputQueue.set(playerId, queue);
    
    player.lastInputTime = now;
    
    return true;
  }
  
  /**
   * Process all queued inputs for a tick
   */
  private processInputs(): void {
    for (const [playerId, commands] of this.inputQueue) {
      if (commands.length === 0) {
        continue;
      }
      
      // Sort by sequence ID to handle out-of-order packets
      commands.sort((a, b) => a.sequenceId - b.sequenceId);
      
      // Process each command
      for (const command of commands) {
        this.processPlayerInput(playerId, command);
        this.lastSequenceProcessed.set(playerId, command.sequenceId);
      }
      
      // Clear processed commands
      this.inputQueue.set(playerId, []);
    }
  }
  
  /**
   * Process a single input command
   */
  private processPlayerInput(playerId: string, command: InputCommand): void {
    const player = this.gameState.getPlayer(playerId);
    if (!player || !player.isAlive) {
      return;
    }
    
    switch (command.type) {
      case 'movement':
        this.processMovementInput(playerId, command);
        break;
        
      case 'look':
        this.processLookInput(playerId, command);
        break;
        
      case 'attack':
        this.processAttackInput(playerId, command);
        break;
        
      case 'ability':
        this.processAbilityInput(playerId, command);
        break;
        
      default:
        logger.warn(`Unknown input type: ${command.type}`);
    }
  }
  
  /**
   * Process movement input (WASD) using shared movement calculator
   */
  private processMovementInput(playerId: string, command: InputCommand): void {
    const { forward = 0, strafe = 0, sprint = false } = command.data;
    
    const player = this.gameState.getPlayer(playerId);
    if (!player || !player.isAlive) {
      return;
    }
    
    const deltaTime = this.TICK_INTERVAL / 1000; // Convert to seconds
    
    // Use shared movement calculator for consistent behavior
    const movementInput = {
      forward,
      strafe,
      sprint,
      angle: player.angle
    };
    
    const movementResult = this.movementCalculator.calculateMovement(
      player.position,
      movementInput,
      deltaTime
    );
    
    // Apply collision detection to the calculated movement
    const collisionResult = this.collisionSystem.validatePlayerMovement(
      player.position,
      movementResult.position,
      movementResult.velocity
    );
    
    // Use corrected position if collision occurred, otherwise use calculated position
    const finalPosition = collisionResult.collided && collisionResult.correctedPosition
      ? collisionResult.correctedPosition
      : movementResult.position;
    
    const finalVelocity = collisionResult.collided && collisionResult.correctedVelocity
      ? collisionResult.correctedVelocity
      : movementResult.velocity;
    
    // Apply bounds validation (if map has bounds)
    const gameState = this.gameState.getState();
    const validatedPosition = this.movementCalculator.validateMovement(
      player.position,
      finalPosition,
      gameState.mapData.bounds
    );
    
    // Update player position and velocity
    this.gameState.updatePlayerPosition(playerId, validatedPosition, finalVelocity);
    
    // Debug logging for movement (reduce frequency to avoid spam)
    if (Math.random() < 0.05) { // Log 5% of movements
      logger.debug(`Player ${playerId} movement`, {
        input: { forward, strafe, sprint },
        oldPos: player.position,
        newPos: validatedPosition,
        velocity: finalVelocity,
        collided: collisionResult.collided
      });
    }
  }
  
  /**
   * Process look input (mouse movement)
   */
  private processLookInput(playerId: string, command: InputCommand): void {
    const { angleDelta = 0 } = command.data;
    
    // Validate angle change (anti-cheat)
    const maxDelta = GAME_CONSTANTS.MAX_ANGLE_DELTA;
    const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, angleDelta));
    
    const player = this.gameState.getPlayer(playerId)!;
    const newAngle = player.angle + clampedDelta;
    
    this.gameState.updatePlayerRotation(playerId, newAngle);
  }
  
  /**
   * Process attack input
   */
  private processAttackInput(playerId: string, command: InputCommand): void {
    const { action } = command.data;
    
    logger.info(`⚔️ ATTACK INPUT: Player ${playerId} action: ${action}`);
    
    if (action === 'primary_attack') {
      const player = this.gameState.getPlayer(playerId);
      if (!player || !player.isAlive) {
        return;
      }
      
      // Check weapon cooldown
      const currentTime = Date.now();
      if (player.weaponCooldown > currentTime) {
        return; // Still on cooldown
      }
      
      // Get weapon configuration
      const weaponConfig = WEAPON_CONFIGS[player.classType];
      if (!weaponConfig) {
        logger.error(`No weapon config found for class ${player.classType}`);
        return;
      }
      
      // Branch: Hitscan vs Ballistic
      if (weaponConfig.projectileSpeed === 0) {
        // HITSCAN PROCESSING
        logger.debug(`Processing hitscan attack for player ${playerId}`);
        
        logger.info(`🎯 HITSCAN ATTACK: Player ${playerId} shooting`, {
          shooterPosition: player.position,
          shooterAngle: player.angle,
          shooterAlive: player.isAlive,
          range: weaponConfig.range,
          playersInGame: this.gameState.getAllPlayers().map(p => ({
            id: p.id,
            position: p.position,
            alive: p.isAlive
          }))
        });
        
        const hitscanResult = this.projectilePhysics.processHitscanWeapon(
          player.position,
          player.angle,
          weaponConfig.range,
          playerId,
          this.gameState.getState(),
          this.collisionSystem
        );
        
        logger.info(`🎯 HITSCAN RESULT:`, {
          shooterId: playerId,
          hitType: hitscanResult.hitType,
          hitPlayerId: hitscanResult.hitPlayerId,
          hitPosition: hitscanResult.hitPosition,
          distance: hitscanResult.distance
        });
        
        // Apply damage immediately if hit player
        if (hitscanResult.hitType === 'player' && hitscanResult.hitPlayerId) {
          logger.info(`💥 DAMAGE APPLIED: ${playerId} hit ${hitscanResult.hitPlayerId} for ${weaponConfig.damage} damage`);
          this.gameState.damagePlayer(
            hitscanResult.hitPlayerId,
            weaponConfig.damage,
            playerId
          );
        } else {
          logger.info(`❌ NO DAMAGE: ${playerId} missed (${hitscanResult.hitType})`);
        }
        
        // Create hitscan event for client rendering
        this.gameState.addEvent('hitscan_fired', {
          shooterId: playerId,
          startPosition: player.position,
          endPosition: hitscanResult.hitPosition,
          hitType: hitscanResult.hitType,
          damage: weaponConfig.damage,
          hitPlayerId: hitscanResult.hitPlayerId
        });
        
        logger.debug(`Hitscan processed - ${hitscanResult.hitType} at distance ${hitscanResult.distance}`);
        
      } else {
        // BALLISTIC PROCESSING (existing system)
        logger.debug(`Processing ballistic attack for player ${playerId}`);
        
        const projectile = this.projectilePhysics.createProjectile(
          playerId,
          player.position,
          player.angle,
          player.classType
        );
        
        // Add projectile to game state
        this.gameState.addProjectile(projectile);
        
        logger.debug(`Player ${playerId} fired ${projectile.type}`, {
          projectileId: projectile.id,
          position: projectile.position,
          angle: projectile.angle
        });
      }
      
      // Set weapon cooldown for both hitscan and ballistic
      // TODO: Update weapon cooldown in GameState player state
    }
  }
  
  /**
   * Process ability input
   */
  private processAbilityInput(playerId: string, command: InputCommand): void {
    const { action } = command.data;
    
    if (action === 'dash') {
      // TODO: Implement dash ability
      logger.debug(`Player ${playerId} used dash`);
    }
  }
  
  // ============================================================================
  // GAME LOOP
  // ============================================================================
  
  /**
   * Start the main game loop
   */
  private startGameLoop(): void {
    this.gameLoopTimer = setInterval(() => {
      this.tick();
    }, this.TICK_INTERVAL);
    
    logger.debug(`Game loop started for match ${this.matchId} at ${this.TICK_RATE} Hz`);
  }
  
  /**
   * Stop the game loop
   */
  private stopGameLoop(): void {
    if (this.gameLoopTimer) {
      clearInterval(this.gameLoopTimer);
      this.gameLoopTimer = null;
    }
  }
  
  /**
   * Single game tick
   */
  private tick(): void {
    if (!this.isActive) {
      return;
    }
    
    // 1. Process all queued inputs
    this.processInputs();
    
    // 2. Update game physics
    this.updatePhysics();
    
    // 3. Process combat/collisions
    this.processCombat();
    
    // 4. Check win conditions
    this.checkWinConditions();
    
    // 5. Generate and send delta update
    this.sendDeltaUpdate();
  }
  
  /**
   * Update physics simulation
   */
  private updatePhysics(): void {
    const gameState = this.gameState.getState();
    const deltaTime = this.TICK_INTERVAL / 1000; // Convert to seconds
    
    // Update all projectiles using physics system
    const projectileUpdate = this.projectilePhysics.updateProjectiles(
      gameState.projectiles,
      deltaTime
    );
    
    // Update projectile positions in game state
    for (const updatedProjectile of projectileUpdate.updated) {
      this.gameState.updateProjectile(
        updatedProjectile.id,
        updatedProjectile.position,
        updatedProjectile.velocity
      );
    }
    
    // Remove expired projectiles
    for (const expiredId of projectileUpdate.expired) {
      this.gameState.removeProjectile(expiredId);
    }
  }
  
  /**
   * Process combat and collisions
   */
  private processCombat(): void {
    const gameState = this.gameState.getState();
    const players = this.gameState.getAllPlayers();
    
    // Check projectile collisions
    for (const [projectileId, projectile] of gameState.projectiles) {
      // Check projectile vs wall collisions
      const wallHit = this.collisionSystem.checkProjectileWallCollision(
        projectile.position,
        {
          x: projectile.position.x + projectile.velocity.x * 0.1,
          y: projectile.position.y + projectile.velocity.y * 0.1
        }
      );
      
      if (wallHit.hit) {
        // Remove projectile on wall hit
        this.gameState.removeProjectile(projectileId);
        continue;
      }
      
      // Check projectile vs player collisions
      const playerHit = this.collisionSystem.checkProjectilePlayerCollision(
        projectile.position,
        0.1, // Small projectile radius
        players.filter(p => p.id !== projectile.ownerId) // Don't hit owner
      );
      
      if (playerHit.hit && playerHit.playerId) {
        // Apply damage to hit player
        this.gameState.damagePlayer(playerHit.playerId, projectile.damage, projectile.ownerId);
        
        // Remove projectile (unless piercing)
        if (!projectile.piercing) {
          this.gameState.removeProjectile(projectileId);
        }
      }
    }
  }
  
  /**
   * Check for round/match win conditions
   */
  private checkWinConditions(): void {
    const players = this.gameState.getAllPlayers();
    const alivePlayers = players.filter(p => p.isAlive);
    
    if (alivePlayers.length <= 1) {
      // Round over by elimination
      const winnerId = alivePlayers.length === 1 ? alivePlayers[0].id 
                    : players[0].id; // Fallback
      
      this.roundSystem.onPlayerEliminated(
        players.find(p => !p.isAlive)?.id || '',
        winnerId
      );
    }
  }
  
  /**
   * Generate and send delta update to clients
   */
  private sendDeltaUpdate(): void {
    // Send player-specific deltas for proper reconciliation
    for (const [playerId, player] of this.players) {
      if (!player.connected) {
        continue;
      }
      
      const lastSeq = this.lastSequenceProcessed.get(playerId) || 0;
      const delta = this.gameState.generateDelta();
      
      // Include player-specific sequence number for reconciliation
      delta.lastProcessedInput = lastSeq;
      
      // Add sequence number to player data for client reconciliation
      if (delta.players) {
        const playerDelta = delta.players.find(p => p.id === playerId);
        if (playerDelta) {
          (playerDelta as any).lastProcessedSequence = lastSeq;
        }
      }
      
      // Send to this specific player through callback
      // Note: The callback system will need to be updated to support player-specific deltas
      this.callbacks.onDeltaUpdate?.(this.matchId, delta);
    }
    
    // Debug logging for delta content (reduced frequency)
    if (Math.random() < 0.05) { // Log 5% of deltas to avoid spam
      logger.debug(`🔄 [DEBUG] Sending delta updates`, {
        matchId: this.matchId,
        connectedPlayers: Array.from(this.players.values()).filter(p => p.connected).length,
        sequences: Object.fromEntries(this.lastSequenceProcessed)
      });
    }
  }
  
  // ============================================================================
  // STATE ACCESS
  // ============================================================================
  
  /**
   * Get current match state for external systems
   */
  getMatchState() {
    return {
      matchId: this.matchId,
      isActive: this.isActive,
      createdAt: this.createdAt,
      players: Array.from(this.players.values()),
      spectators: Array.from(this.spectators),
      gameState: this.gameState.getState(),
      roundInfo: this.roundSystem.getRoundInfo(),
      matchStats: this.roundSystem.getMatchStats()
    };
  }
  
  /**
   * Get delta update for specific player (with their sequence)
   */
  getDeltaForPlayer(playerId: string): DeltaUpdate {
    const lastSeq = this.lastSequenceProcessed.get(playerId) || 0;
    const delta = this.gameState.generateDelta(lastSeq);
    delta.lastProcessedInput = lastSeq;
    return delta;
  }
  
  /**
   * Check if match is active
   */
  isMatchActive(): boolean {
    return this.isActive;
  }
  
  /**
   * Get match duration in milliseconds
   */
  getMatchDuration(): number {
    return Date.now() - this.createdAt;
  }
  
  /**
   * Destroy the match manager and clean up all resources
   */
  destroy(): void {
    logger.info(`Destroying MatchManager for match ${this.matchId}`);
    
    this.stop();
    this.players.clear();
    this.spectators.clear();
    this.inputQueue.clear();
    this.lastSequenceProcessed.clear();
  }
}