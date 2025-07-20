/**
 * MessageHandler - Server delta processing and state synchronization
 * 
 * Processes incoming delta updates from the server and applies them
 * to the client game state. Handles interpolation and reconciliation.
 */

import type {
  DeltaUpdate,
  PlayerDelta,
  ProjectileDelta,
  MatchDelta,
  MatchStartData,
  RoundStartData,
  RoundEndData
} from '../types/NetworkTypes.js';
import type {
  ClientGameState,
  ClientPlayerState,
  ClientProjectileState,
  GameEvent
} from '../types/GameTypes.js';
import type { HitscanFiredEvent } from '@dueled/shared';
import { getClassConfig } from '@dueled/shared';

export class MessageHandler {
  private gameState: ClientGameState | null = null;
  private lastProcessedSequence = 0;
  private serverTimeOffset = 0;
  
  // Event callbacks
  private callbacks = {
    onStateUpdate: (state: ClientGameState) => {},
    onPlayerUpdate: (playerId: string, player: ClientPlayerState) => {},
    onProjectileUpdate: (projectileId: string, projectile: ClientProjectileState) => {},
    onGameEvent: (event: GameEvent) => {},
    onMatchUpdate: (matchInfo: Partial<ClientGameState>) => {},
    onHitscanFired: (event: HitscanFiredEvent) => {}
  };
  
  constructor() {
    // Initialize with empty state
    this.gameState = null;
  }
  
  // ============================================================================
  // MATCH INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize game state from match start data
   */
  initializeMatch(data: MatchStartData): void {
    console.log('Initializing match:', data.matchId);
    
    this.gameState = {
      // Match info
      matchId: data.matchId,
      currentRound: 1,
      roundTimeLeft: data.roundDuration,
      score: { player1: 0, player2: 0 },
      
      // Players - determine player1/player2 assignment
      // Use lexicographic order to ensure consistent assignment across clients
      localPlayerId: data.yourPlayerId,
      player1Id: data.yourPlayerId < data.opponentId ? data.yourPlayerId : data.opponentId,
      player2Id: data.yourPlayerId < data.opponentId ? data.opponentId : data.yourPlayerId,
      players: new Map(),
      
      // Projectiles
      projectiles: new Map(),
      
      // Map data
      mapData: data.mapData,
      
      // Network state
      lastServerUpdate: Date.now(),
      serverTimeDelta: 0
    };
    
    // Create initial player objects with proper usernames and class types
    for (const [playerId, playerData] of Object.entries(data.players)) {
      const classConfig = getClassConfig(playerData.classType as any);
      
      const initialPlayer: ClientPlayerState = {
        // Identity
        id: playerId,
        username: playerData.username,
        classType: playerData.classType as any,
        
        // Transform - will be updated by first delta
        position: { x: 0, y: 0 },
        angle: 0,
        velocity: { x: 0, y: 0 },
        
        // Health & Combat - use class-specific values
        health: classConfig.stats.health,
        maxHealth: classConfig.stats.health,
        armor: classConfig.stats.defense,
        
        // Weapon State
        weaponCooldown: 0,
        lastAttackTime: 0,
        
        // Status
        isAlive: true,
        isMoving: false,
        isDashing: false,
        dashCooldown: 0,
        
        // Stats
        roundKills: 0,
        roundDamageDealt: 0,
        
        // Network
        lastInputSequence: 0,
        inputHistory: []
      };
      
      this.gameState.players.set(playerId, initialPlayer);
      console.log(`Created initial player: ${playerId} (${playerData.username}, ${playerData.classType})`);
    }
    
    // Reset sequence tracking
    this.lastProcessedSequence = 0;
    
    this.callbacks.onStateUpdate(this.gameState);
  }
  
  /**
   * Handle round start
   */
  handleRoundStart(data: RoundStartData): void {
    if (!this.gameState) {
      console.warn('Cannot handle round start: no game state');
      return;
    }
    
    console.log('Round', data.roundNumber, 'started');
    
    // Update match info
    this.gameState.currentRound = data.roundNumber;
    this.gameState.roundTimeLeft = data.roundDuration;
    
    // Reset players to spawn positions
    for (const [playerId, spawnData] of Object.entries(data.spawnPositions)) {
      const player = this.gameState.players.get(playerId);
      if (player) {
        player.position = { ...spawnData.position };
        player.angle = spawnData.angle;
        player.velocity = { x: 0, y: 0 };
        player.isAlive = true;
        player.health = player.maxHealth;
        player.lastUpdateTime = Date.now();
      }
    }
    
    // Clear projectiles
    this.gameState.projectiles.clear();
    
    this.callbacks.onStateUpdate(this.gameState);
  }
  
  /**
   * Handle round end
   */
  handleRoundEnd(data: RoundEndData): void {
    if (!this.gameState) {
      console.warn('Cannot handle round end: no game state');
      return;
    }
    
    console.log('Round ended, winner:', data.winnerId);
    
    // Update score
    this.gameState.score = { ...data.currentScore };
    this.gameState.roundTimeLeft = 0;
    
    this.callbacks.onMatchUpdate({
      score: this.gameState.score,
      roundTimeLeft: 0
    });
  }
  
  // ============================================================================
  // DELTA PROCESSING
  // ============================================================================
  
  /**
   * Process incoming delta update from server
   */
  /**
   * Process server delta update
   * 
   * Applies incremental changes from the server to the local game state.
   * Handles player updates, projectile updates, match state changes, and events.
   * 
   * @param delta - Delta update from server containing incremental changes
   */
  processDeltaUpdate(delta: DeltaUpdate): void {
    if (!this.gameState) {
      console.warn('Cannot process delta: no game state');
      return;
    }
    
    // Update network timing
    this.gameState.lastServerUpdate = Date.now();
    this.serverTimeOffset = Date.now() - delta.timestamp;
    
    // Track processed sequence
    if (delta.lastProcessedInput > this.lastProcessedSequence) {
      this.lastProcessedSequence = delta.lastProcessedInput;
    }
    
    // Process each type of update
    if (delta.players) {
      this.processPlayerDeltas(delta.players);
    }
    
    if (delta.projectiles) {
      this.processProjectileDeltas(delta.projectiles);
    }
    
    if (delta.match) {
      this.processMatchDelta(delta.match);
    }
    
    if (delta.events) {
      this.processGameEvents(delta.events);
    }
    
    // Notify GameEngine of the updated state
    this.callbacks.onStateUpdate(this.gameState);
  }
  
  // ============================================================================
  // PLAYER UPDATES
  // ============================================================================
  
  private processPlayerDeltas(playerDeltas: PlayerDelta[]): void {
    if (!this.gameState) return;
    
    for (const delta of playerDeltas) {
      let player = this.gameState.players.get(delta.id);
      
      // Create new player if doesn't exist
      if (!player) {
        player = this.createPlayerFromDelta(delta);
        this.gameState.players.set(delta.id, player);
      } else {
        // Update existing player
        this.updatePlayerFromDelta(player, delta);
      }
      
      // Update timestamp
      player.lastUpdateTime = Date.now();
      
      // Notify callback
      this.callbacks.onPlayerUpdate(delta.id, player);
    }
  }
  
  private createPlayerFromDelta(delta: PlayerDelta): ClientPlayerState {
    const isLocal = delta.id === this.gameState?.localPlayerId;
    
    // Use class-specific defaults for temporary player creation
    const defaultClassType = 'gunslinger' as any;
    const classConfig = getClassConfig(defaultClassType);
    
    return {
      // Identity
      id: delta.id,
      username: 'Unknown', // Will be set from full state
      classType: defaultClassType, // Will be set from full state
      
      // Transform
      position: delta.position || { x: 0, y: 0 },
      angle: delta.angle || 0,
      velocity: delta.velocity || { x: 0, y: 0 },
      
      // Health & Combat - Use class-specific defaults
      health: delta.health || classConfig.stats.health,
      maxHealth: classConfig.stats.health, // Will be set from full state
      armor: delta.armor || 0,
      
      // Weapon State
      weaponCooldown: delta.weaponCooldown || 0,
      
      // Status
      isAlive: delta.isAlive !== undefined ? delta.isAlive : true,
      isMoving: delta.isMoving || false,
      isDashing: delta.isDashing || false,
      
      // Client-specific
      isLocalPlayer: isLocal,
      lastUpdateTime: Date.now()
    };
  }
  
  private updatePlayerFromDelta(player: ClientPlayerState, delta: PlayerDelta): void {
    // Update only provided fields
    if (delta.position !== undefined) {
      player.position = { ...delta.position };
    }
    
    if (delta.angle !== undefined) {
      player.angle = delta.angle;
    }
    
    if (delta.velocity !== undefined) {
      player.velocity = { ...delta.velocity };
    }
    
    if (delta.health !== undefined) {
      player.health = delta.health;
    }
    
    if (delta.maxHealth !== undefined) {
      player.maxHealth = delta.maxHealth;
    }
    
    if (delta.armor !== undefined) {
      player.armor = delta.armor;
    }
    
    if (delta.weaponCooldown !== undefined) {
      player.weaponCooldown = delta.weaponCooldown;
    }
    
    if (delta.isAlive !== undefined) {
      player.isAlive = delta.isAlive;
    }
    
    if (delta.isMoving !== undefined) {
      player.isMoving = delta.isMoving;
    }
    
    if (delta.isDashing !== undefined) {
      player.isDashing = delta.isDashing;
    }
  }
  
  // ============================================================================
  // PROJECTILE UPDATES
  // ============================================================================
  
  private processProjectileDeltas(projectileDeltas: ProjectileDelta[]): void {
    if (!this.gameState) return;
    
    for (const delta of projectileDeltas) {
      let projectile = this.gameState.projectiles.get(delta.id);
      
      // Create new projectile if doesn't exist
      if (!projectile) {
        projectile = this.createProjectileFromDelta(delta);
        if (projectile) {
          this.gameState.projectiles.set(delta.id, projectile);
        }
      } else {
        // Update existing projectile
        this.updateProjectileFromDelta(projectile, delta);
      }
      
      if (projectile) {
        // Update timestamp
        projectile.lastUpdateTime = Date.now();
        
        // Remove if expired
        if (projectile.timeToLive <= 0) {
          this.gameState.projectiles.delete(delta.id);
        } else {
          // Notify callback
          this.callbacks.onProjectileUpdate(delta.id, projectile);
        }
      }
    }
  }
  
  private createProjectileFromDelta(delta: ProjectileDelta): ClientProjectileState | null {
    // Need full data to create projectile
    if (!delta.type || !delta.ownerId || !delta.position) {
      console.warn('Cannot create projectile from incomplete delta:', delta);
      return null;
    }
    
    return {
      id: delta.id,
      type: delta.type as any, // Type assertion for projectile type
      
      // Transform
      position: { ...delta.position },
      velocity: delta.velocity || { x: 0, y: 0 },
      angle: delta.angle || 0,
      
      // Properties
      damage: delta.damage || 0,
      speed: delta.speed || 0,
      
      // Lifecycle
      ownerId: delta.ownerId,
      timeToLive: delta.timeToLive || 1,
      
      // Client-specific
      lastUpdateTime: Date.now()
    };
  }
  
  private updateProjectileFromDelta(projectile: ClientProjectileState, delta: ProjectileDelta): void {
    // Update only provided fields
    if (delta.position !== undefined) {
      projectile.position = { ...delta.position };
    }
    
    if (delta.velocity !== undefined) {
      projectile.velocity = { ...delta.velocity };
    }
    
    if (delta.angle !== undefined) {
      projectile.angle = delta.angle;
    }
    
    if (delta.timeToLive !== undefined) {
      projectile.timeToLive = delta.timeToLive;
    }
  }
  
  // ============================================================================
  // MATCH UPDATES
  // ============================================================================
  
  private processMatchDelta(matchDelta: MatchDelta): void {
    if (!this.gameState) return;
    
    let hasChanges = false;
    
    if (matchDelta.currentRound !== undefined) {
      this.gameState.currentRound = matchDelta.currentRound;
      hasChanges = true;
    }
    
    if (matchDelta.roundTimeLeft !== undefined) {
      this.gameState.roundTimeLeft = matchDelta.roundTimeLeft;
      hasChanges = true;
    }
    
    if (matchDelta.score !== undefined) {
      this.gameState.score = { ...matchDelta.score };
      hasChanges = true;
    }
    
    if (hasChanges) {
      this.callbacks.onMatchUpdate({
        currentRound: this.gameState.currentRound,
        roundTimeLeft: this.gameState.roundTimeLeft,
        score: this.gameState.score
      });
    }
  }
  
  // ============================================================================
  // GAME EVENTS
  // ============================================================================
  
  private processGameEvents(events: GameEvent[]): void {
    for (const event of events) {
      console.log('Game event:', event.type, event.data);
      
      // Handle specific event types
      switch (event.type) {
        case 'hitscan_fired':
          console.log('Processing hitscan fired event:', event.data);
          this.callbacks.onHitscanFired(event as HitscanFiredEvent);
          break;
      }
      
      // Always call the general callback
      this.callbacks.onGameEvent(event);
    }
  }
  
  // ============================================================================
  // STATE ACCESS
  // ============================================================================
  
  /**
   * Get current game state
   */
  getGameState(): ClientGameState | null {
    return this.gameState;
  }
  
  /**
   * Get local player
   */
  getLocalPlayer(): ClientPlayerState | null {
    if (!this.gameState) return null;
    return this.gameState.players.get(this.gameState.localPlayerId) || null;
  }
  
  /**
   * Get last processed input sequence
   */
  getLastProcessedSequence(): number {
    return this.lastProcessedSequence;
  }
  
  /**
   * Get server time offset
   */
  getServerTimeOffset(): number {
    return this.serverTimeOffset;
  }
  
  // ============================================================================
  // CALLBACK MANAGEMENT
  // ============================================================================
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: Partial<typeof this.callbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  
  /**
   * Clear game state (on match end)
   */
  clear(): void {
    this.gameState = null;
    this.lastProcessedSequence = 0;
    this.serverTimeOffset = 0;
  }
}