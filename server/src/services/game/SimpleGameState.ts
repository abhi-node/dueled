/**
 * SimpleGameState - Lightweight game state management for 1v1 arena combat
 * 
 * Replaces the complex 1,824-line gameStateService.ts with simple state handling
 * Focuses on basic movement, instant hit detection, and server-authoritative logic
 */

import { SimpleGameLoop, type SimplePlayer } from './SimpleGameLoop.js';
import { BasicCombat } from './BasicCombat.js';
import { ArenaMap, type ArenaConfig } from '../../game/arena/ArenaMap.js';
import { RoundSystem } from '../../game/arena/RoundSystem.js';
import { SimpleProjectileFlow } from '../../game/projectiles/SimpleProjectileFlow.js';
import { SimpleSpriteCoordinator } from '../../game/rendering/SimpleSpriteCoordinator.js';
import { SimpleProjectiles, type ProjectileData } from '../../game/projectiles/SimpleProjectiles.js';
import { logger } from '../../utils/logger.js';
import type { ClassType } from '@dueled/shared';


export interface GameStateConfig {
  maxPlayers: number;           // Always 2 for 1v1
  tickRate: number;            // Server update rate (Hz)
  matchTimeoutMs: number;      // Auto-end match timeout
  arenaType: string;           // Which arena layout to use
}

export interface PlayerState {
  id: string;
  username: string;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  classType: ClassType;
  isAlive: boolean;
  lastUpdate: number;
}

export interface MatchStateUpdate {
  matchId: string;
  timestamp: number;
  players: PlayerState[];
  projectiles: ProjectileData[];
  roundInfo: {
    currentRound: number;
    timeLeft: number;
    score: { player1: number; player2: number };
    status: string;
  };
}

export interface SimpleGameStateCallbacks {
  onPlayerDied?: (playerId: string, killerId?: string) => void;
  onRoundEnded?: (matchId: string, winner: string) => void;
  onMatchEnded?: (matchId: string, finalWinner: string) => void;
  onStateUpdate?: (update: MatchStateUpdate) => void;
}

/**
 * SimpleGameState - Manages active game matches with minimal complexity
 */
export class SimpleGameState {
  private config: GameStateConfig;
  private callbacks: SimpleGameStateCallbacks = {};
  
  // Active matches
  private activeMatches: Map<string, {
    gameLoop: SimpleGameLoop;
    projectiles: SimpleProjectiles;
    combat: BasicCombat;
    arena: ArenaConfig;
    roundSystem: RoundSystem;
    projectileFlow: SimpleProjectileFlow;
    spriteCoordinator: SimpleSpriteCoordinator;
    players: Map<string, SimplePlayer>;
    lastUpdate: number;
    updateTimer: NodeJS.Timeout | null;
  }> = new Map();
  
  // Player lookup
  private playerToMatch: Map<string, string> = new Map();
  
  constructor(config?: Partial<GameStateConfig>) {
    this.config = {
      maxPlayers: 2,
      tickRate: 30, // 30 Hz server updates
      matchTimeoutMs: 300000, // 5 minutes
      arenaType: 'standard',
      ...config
    };
    
    logger.info('SimpleGameState initialized');
  }
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: SimpleGameStateCallbacks): void {
    this.callbacks = { ...callbacks };
  }
  
  /**
   * Create new match
   */
  createMatch(
    matchId: string, 
    player1: { id: string; username: string; classType: ClassType },
    player2: { id: string; username: string; classType: ClassType }
  ): boolean {
    if (this.activeMatches.has(matchId)) {
      logger.warn(`Match ${matchId} already exists`);
      return false;
    }
    
    try {
      // Create game systems
      const gameLoop = new SimpleGameLoop();
      const projectiles = new SimpleProjectiles();
      const combat = new BasicCombat();
      const arena = ArenaMap.getArena(this.config.arenaType);
      if (!arena) {
        logger.error(`Arena ${this.config.arenaType} not found`);
        return false;
      }
      const roundSystem = new RoundSystem(matchId, player1.id, player2.id, { maxRounds: 3 });
      
      // Create projectile flow system
      const projectileFlow = new SimpleProjectileFlow(projectiles, combat);
      projectileFlow.setArena(arena);
      
      // Create sprite coordinator
      const spriteCoordinator = new SimpleSpriteCoordinator();
      
      // Create players
      const players = new Map<string, SimplePlayer>();
      
      // Create simple game state for this match
      const gameState = gameLoop.createGameState(
        matchId,
        [player1, player2],
        this.config.arenaType
      );
      
      // Extract players from game state
      for (const [playerId, player] of gameState.players) {
        players.set(playerId, player);
        this.playerToMatch.set(playerId, matchId);
      }
      
      if (players.size !== 2) {
        logger.error(`Failed to create players for match ${matchId}`);
        return false;
      }
      
      // Setup callbacks
      projectileFlow.setCallbacks({
        onProjectileHit: (hit) => {
          const targetPlayer = players.get(hit.targetId);
          if (this.callbacks.onPlayerDied && targetPlayer && targetPlayer.health <= 0) {
            const killerProjectile = projectiles.getProjectile(hit.projectileId);
            const killerId = killerProjectile?.ownerId;
            this.callbacks.onPlayerDied(hit.targetId, killerId);
          }
        }
      });
      
      roundSystem.setCallbacks({
        onRoundEnd: (result) => {
          if (this.callbacks.onRoundEnded) {
            this.callbacks.onRoundEnded(matchId, result.winnerId || 'draw');
          }
        },
        onMatchEnd: (result) => {
          if (this.callbacks.onMatchEnded) {
            this.callbacks.onMatchEnded(matchId, result.winnerId || 'draw');
          }
          this.endMatch(matchId);
        }
      });
      
      // Start game loop
      const updateTimer = setInterval(() => {
        this.updateMatch(matchId);
      }, 1000 / this.config.tickRate);
      
      // Store match
      this.activeMatches.set(matchId, {
        gameLoop,
        projectiles,
        combat,
        arena,
        roundSystem,
        projectileFlow,
        spriteCoordinator,
        players,
        lastUpdate: Date.now(),
        updateTimer
      });
      
      logger.info(`Match ${matchId} created with players ${player1.id} vs ${player2.id}`);
      return true;
      
    } catch (error) {
      logger.error(`Error creating match ${matchId}:`, error);
      return false;
    }
  }
  
  /**
   * Update player position
   */
  updatePlayerPosition(playerId: string, x: number, y: number, rotation: number): boolean {
    const matchId = this.playerToMatch.get(playerId);
    if (!matchId) return false;
    
    const match = this.activeMatches.get(matchId);
    if (!match) return false;
    
    const player = match.players.get(playerId);
    if (!player || !player.isAlive) return false;
    
    // Simple validation - ensure player stays in arena
    const validX = Math.max(0, Math.min(match.arena.size.x, x));
    const validY = Math.max(0, Math.min(match.arena.size.y, y));
    
    player.position.x = validX;
    player.position.y = validY;
    player.rotation = rotation;
    player.lastInputTime = Date.now();
    
    return true;
  }
  
  /**
   * Handle player attack
   */
  handlePlayerAttack(playerId: string, targetX: number, targetY: number): boolean {
    const matchId = this.playerToMatch.get(playerId);
    if (!matchId) return false;
    
    const match = this.activeMatches.get(matchId);
    if (!match) return false;
    
    const player = match.players.get(playerId);
    if (!player || !player.isAlive) return false;
    
    // Create projectile request
    const projectileRequest = {
      playerId,
      projectileType: player.classType === 'archer' ? 'arrow' : 'berserker_projectile',
      startPosition: { x: player.position.x, y: player.position.y },
      targetPosition: { x: targetX, y: targetY },
      timestamp: Date.now(),
      sequence: 0
    };
    
    const result = match.projectileFlow.processProjectileRequest(projectileRequest, match.players);
    return result.success;
  }
  
  /**
   * Handle special ability
   */
  handleSpecialAbility(playerId: string, targetX?: number, targetY?: number): boolean {
    const matchId = this.playerToMatch.get(playerId);
    if (!matchId) return false;
    
    const match = this.activeMatches.get(matchId);
    if (!match) return false;
    
    const player = match.players.get(playerId);
    if (!player || !player.isAlive) return false;
    
    // Simple ability handling based on class
    if (player.classType === 'archer' && targetX !== undefined && targetY !== undefined) {
      // Archer power shot
      const projectileRequest = {
        playerId,
        projectileType: 'powershot_arrow',
        startPosition: { x: player.position.x, y: player.position.y },
        targetPosition: { x: targetX, y: targetY },
        timestamp: Date.now(),
        sequence: 0
      };
      
      const result = match.projectileFlow.processProjectileRequest(projectileRequest, match.players);
      return result.success;
    } else if (player.classType === 'berserker') {
      // Berserker rage (temporary damage boost)
      match.combat.applyBuff(player, 'damage_boost', 1.2, 5000); // 20% damage boost for 5 seconds
      return true;
    }
    
    return false;
  }
  
  /**
   * Update match state
   */
  private updateMatch(matchId: string): void {
    const match = this.activeMatches.get(matchId);
    if (!match) return;
    
    const deltaTime = (Date.now() - match.lastUpdate) / 1000;
    match.lastUpdate = Date.now();
    
    // Update projectiles
    match.projectiles.update(deltaTime);
    
    // Process projectile collisions
    match.projectileFlow.processProjectileUpdate(
      match.projectiles.getAllProjectiles(),
      match.players
    );
    
    // Update round system
    match.roundSystem.update(deltaTime);
    
    // Check for round end conditions
    const alivePlayers = Array.from(match.players.values()).filter(p => p.isAlive);
    if (alivePlayers.length <= 1 && match.roundSystem.getState().state === 'active') {
      const winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : null;
      const allPlayers = Array.from(match.players.values());
      const finalHealths = {
        player1: allPlayers[0]?.health || 0,
        player2: allPlayers[1]?.health || 0
      };
      match.roundSystem.endRound(winnerId, 'elimination', finalHealths);
      
      // Respawn players for next round if match continues
      if (!match.roundSystem.isMatchComplete()) {
        this.respawnPlayers(matchId);
      }
    }
    
    // Generate and broadcast state update
    const stateUpdate = this.generateStateUpdate(matchId);
    if (stateUpdate && this.callbacks.onStateUpdate) {
      this.callbacks.onStateUpdate(stateUpdate);
    }
  }
  
  /**
   * Respawn players for new round
   */
  private respawnPlayers(matchId: string): void {
    const match = this.activeMatches.get(matchId);
    if (!match) return;
    
    let spawnIndex = 0;
    for (const player of match.players.values()) {
      player.health = player.maxHealth;
      player.isAlive = true;
      player.position.x = match.arena.spawnPoints[spawnIndex].position.x;
      player.position.y = match.arena.spawnPoints[spawnIndex].position.y;
      spawnIndex = (spawnIndex + 1) % match.arena.spawnPoints.length;
    }
    
    // Clear all projectiles
    match.projectiles.clear();
    
    logger.info(`Players respawned for match ${matchId}`);
  }
  
  /**
   * Generate state update
   */
  private generateStateUpdate(matchId: string): MatchStateUpdate | null {
    const match = this.activeMatches.get(matchId);
    if (!match) return null;
    
    // Convert players to state format
    const playerStates: PlayerState[] = Array.from(match.players.values()).map(player => ({
      id: player.id,
      username: player.username,
      x: player.position.x,
      y: player.position.y,
      rotation: player.rotation,
      health: player.health,
      maxHealth: player.maxHealth,
      classType: player.classType,
      isAlive: player.isAlive,
      lastUpdate: player.lastInputTime
    }));
    
    // Get projectiles
    const projectiles = Array.from(match.projectiles.getAllProjectiles().values());
    
    // Get round info
    const matchState = match.roundSystem.getState();
    
    return {
      matchId,
      timestamp: Date.now(),
      players: playerStates,
      projectiles,
      roundInfo: {
        currentRound: matchState.currentRound,
        timeLeft: matchState.timeLeft,
        score: { ...matchState.score },
        status: matchState.state
      }
    };
  }
  
  /**
   * End match and cleanup
   */
  endMatch(matchId: string): boolean {
    const match = this.activeMatches.get(matchId);
    if (!match) return false;
    
    // Clear update timer
    if (match.updateTimer) {
      clearInterval(match.updateTimer);
    }
    
    // Remove player mappings
    for (const playerId of match.players.keys()) {
      this.playerToMatch.delete(playerId);
    }
    
    // Cleanup systems
    match.projectiles.clear();
    match.gameLoop.destroy();
    match.roundSystem.destroy();
    match.projectileFlow.destroy();
    match.spriteCoordinator.destroy();
    
    this.activeMatches.delete(matchId);
    
    logger.info(`Match ${matchId} ended and cleaned up`);
    return true;
  }
  
  /**
   * Remove player from match (disconnect)
   */
  removePlayer(playerId: string): boolean {
    const matchId = this.playerToMatch.get(playerId);
    if (!matchId) return false;
    
    const match = this.activeMatches.get(matchId);
    if (!match) return false;
    
    // Mark player as disconnected and end match
    const player = match.players.get(playerId);
    if (player) {
      player.isAlive = false;
    }
    
    // Cleanup player projectiles
    match.projectileFlow.cleanupPlayerProjectiles(playerId);
    
    // Auto-end match on disconnect
    this.endMatch(matchId);
    
    logger.info(`Player ${playerId} removed from match ${matchId}`);
    return true;
  }
  
  /**
   * Get match state
   */
  getMatchState(matchId: string): MatchStateUpdate | null {
    return this.generateStateUpdate(matchId);
  }
  
  /**
   * Get player's current match
   */
  getPlayerMatch(playerId: string): string | null {
    return this.playerToMatch.get(playerId) || null;
  }
  
  /**
   * Get all active matches
   */
  getActiveMatches(): string[] {
    return Array.from(this.activeMatches.keys());
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    totalMatches: number;
    totalPlayers: number;
    averageMatchDuration: number;
  } {
    return {
      totalMatches: this.activeMatches.size,
      totalPlayers: this.playerToMatch.size,
      averageMatchDuration: 0 // Could track this if needed
    };
  }
  
  /**
   * Clean up all matches
   */
  destroy(): void {
    for (const matchId of this.activeMatches.keys()) {
      this.endMatch(matchId);
    }
    
    this.playerToMatch.clear();
    logger.info('SimpleGameState destroyed');
  }
}