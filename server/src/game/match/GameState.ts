/**
 * GameState - Authoritative game state container
 * 
 * This is the single source of truth for all game data.
 * All modifications must go through this class to ensure consistency.
 */

import { logger } from '../../utils/logger.js';
import type {
  GameState,
  PlayerState,
  ProjectileState,
  MatchState,
  MapData,
  GameEvent,
  DeltaUpdate,
  PlayerDelta,
  ProjectileDelta,
  Position,
  Velocity,
  SpawnPoint
} from '../types.js';
import { GAME_CONSTANTS, WEAPON_CONFIGS } from '../types.js';
import type { ClassType } from '@dueled/shared';

export class GameStateManager {
  private state: GameState;
  private lastUpdateTime: number;
  private eventIdCounter: number = 0;
  
  constructor(matchId: string, player1Id: string, player2Id: string, mapData: MapData) {
    this.lastUpdateTime = Date.now();
    
    // Initialize empty players map
    const players = new Map<string, PlayerState>();
    
    // Initialize empty projectiles map
    const projectiles = new Map<string, ProjectileState>();
    
    // Initialize match state
    const match: MatchState = {
      matchId,
      currentRound: 1,
      maxRounds: GAME_CONSTANTS.MAX_ROUNDS,
      roundsToWin: GAME_CONSTANTS.ROUNDS_TO_WIN,
      roundTimeLeft: GAME_CONSTANTS.ROUND_DURATION,
      roundDuration: GAME_CONSTANTS.ROUND_DURATION,
      intermissionTime: GAME_CONSTANTS.INTERMISSION_TIME,
      score: { player1: 0, player2: 0 },
      player1Id,
      player2Id,
      status: 'waiting',
      startTime: Date.now()
    };
    
    // Create initial game state
    this.state = {
      matchId,
      timestamp: this.lastUpdateTime,
      players,
      projectiles,
      match,
      mapData,
      events: []
    };
    
    logger.info(`GameState initialized for match ${matchId}`, {
      player1Id,
      player2Id,
      mapWalls: mapData.walls.length,
      spawnPoints: mapData.spawnPoints.length
    });
  }
  
  // ============================================================================
  // PLAYER MANAGEMENT
  // ============================================================================
  
  /**
   * Add a player to the game state
   */
  addPlayer(playerId: string, username: string, classType: ClassType): boolean {
    if (this.state.players.has(playerId)) {
      logger.warn(`Player ${playerId} already exists in game state`);
      return false;
    }
    
    // Find appropriate spawn point
    const spawnPoint = this.getSpawnPointForPlayer(playerId);
    if (!spawnPoint) {
      logger.error(`No spawn point available for player ${playerId}`);
      return false;
    }
    
    const playerState: PlayerState = {
      // Identity
      id: playerId,
      username,
      classType,
      
      // Transform
      position: { ...spawnPoint.position },
      angle: spawnPoint.angle,
      velocity: { x: 0, y: 0 },
      
      // Health & Combat
      health: GAME_CONSTANTS.BASE_HEALTH,
      maxHealth: GAME_CONSTANTS.BASE_HEALTH,
      armor: GAME_CONSTANTS.BASE_ARMOR,
      
      // Weapon State
      weaponCooldown: 0,
      lastAttackTime: 0,
      
      // Network/Anti-cheat
      lastInputTime: Date.now(),
      inputSequence: 0,
      
      // Status
      isAlive: true,
      isMoving: false,
      isDashing: false,
      dashCooldown: 0,
      
      // Round Stats
      roundKills: 0,
      roundDamageDealt: 0
    };
    
    this.state.players.set(playerId, playerState);
    this.updateTimestamp();
    
    logger.info(`Player added to game state`, {
      playerId,
      username,
      classType,
      spawnPosition: spawnPoint.position
    });
    
    return true;
  }
  
  /**
   * Remove a player from the game state
   */
  removePlayer(playerId: string): boolean {
    if (!this.state.players.has(playerId)) {
      logger.warn(`Cannot remove player ${playerId}: not found`);
      return false;
    }
    
    this.state.players.delete(playerId);
    this.updateTimestamp();
    
    logger.info(`Player removed from game state: ${playerId}`);
    return true;
  }
  
  /**
   * Update player position (server-authoritative)
   */
  updatePlayerPosition(playerId: string, position: Position, velocity: Velocity): boolean {
    const player = this.state.players.get(playerId);
    if (!player || !player.isAlive) {
      return false;
    }
    
    // Validate position bounds
    if (!this.isValidPosition(position)) {
      logger.warn(`Invalid position for player ${playerId}:`, position);
      return false;
    }
    
    player.position = { ...position };
    player.velocity = { ...velocity };
    player.isMoving = Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01;
    
    this.updateTimestamp();
    return true;
  }
  
  /**
   * Update player rotation
   */
  updatePlayerRotation(playerId: string, angle: number): boolean {
    const player = this.state.players.get(playerId);
    if (!player || !player.isAlive) {
      return false;
    }
    
    // Normalize angle to [0, 2π]
    player.angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    
    this.updateTimestamp();
    return true;
  }
  
  /**
   * Apply damage to a player
   */
  damagePlayer(playerId: string, damage: number, attackerId?: string): boolean {
    const player = this.state.players.get(playerId);
    if (!player || !player.isAlive) {
      return false;
    }
    
    // Calculate actual damage after armor
    const armorReduction = Math.min(player.armor * 0.5, damage * 0.7);
    const actualDamage = Math.max(1, Math.round(damage - armorReduction));
    
    // Apply damage
    player.health = Math.max(0, player.health - actualDamage);
    
    // Track attacker stats
    if (attackerId && this.state.players.has(attackerId)) {
      const attacker = this.state.players.get(attackerId)!;
      attacker.roundDamageDealt += actualDamage;
    }
    
    // Create damage event
    this.addEvent('player_hit', {
      attackerId: attackerId || 'unknown',
      victimId: playerId,
      damage: actualDamage,
      hitPosition: { ...player.position }
    });
    
    // Check if player died
    if (player.health <= 0) {
      player.isAlive = false;
      
      // Track kill
      if (attackerId && this.state.players.has(attackerId)) {
        const attacker = this.state.players.get(attackerId)!;
        attacker.roundKills += 1;
      }
      
      // Create death event
      this.addEvent('player_killed', {
        killerId: attackerId || 'unknown',
        victimId: playerId,
        weaponType: 'unknown',
        finalDamage: actualDamage
      });
      
      logger.info(`Player ${playerId} killed by ${attackerId || 'unknown'}`);
    }
    
    this.updateTimestamp();
    return true;
  }
  
  // ============================================================================
  // PROJECTILE MANAGEMENT
  // ============================================================================
  
  /**
   * Add a projectile to the game state
   */
  addProjectile(projectile: ProjectileState): boolean {
    if (this.state.projectiles.has(projectile.id)) {
      logger.warn(`Projectile ${projectile.id} already exists`);
      return false;
    }
    
    this.state.projectiles.set(projectile.id, { ...projectile });
    
    // Create projectile fired event
    this.addEvent('projectile_fired', {
      projectileId: projectile.id,
      ownerId: projectile.ownerId,
      type: projectile.type,
      position: { ...projectile.position }
    });
    
    this.updateTimestamp();
    return true;
  }
  
  /**
   * Remove a projectile from the game state
   */
  removeProjectile(projectileId: string): boolean {
    if (!this.state.projectiles.has(projectileId)) {
      return false;
    }
    
    const projectile = this.state.projectiles.get(projectileId)!;
    
    // Create impact event
    this.addEvent('projectile_impact', {
      projectileId,
      type: projectile.type,
      position: { ...projectile.position },
      ownerId: projectile.ownerId
    });
    
    this.state.projectiles.delete(projectileId);
    this.updateTimestamp();
    return true;
  }
  
  /**
   * Update projectile position
   */
  updateProjectile(projectileId: string, position: Position, velocity?: Velocity): boolean {
    const projectile = this.state.projectiles.get(projectileId);
    if (!projectile) {
      return false;
    }
    
    projectile.position = { ...position };
    if (velocity) {
      projectile.velocity = { ...velocity };
    }
    
    // Check if projectile is out of bounds
    if (!this.isValidPosition(position)) {
      this.removeProjectile(projectileId);
      return true;
    }
    
    // Check time to live
    const currentTime = Date.now();
    const age = (currentTime - projectile.spawnTime) / 1000;
    if (age >= projectile.timeToLive) {
      this.removeProjectile(projectileId);
      return true;
    }
    
    this.updateTimestamp();
    return true;
  }
  
  // ============================================================================
  // MATCH MANAGEMENT
  // ============================================================================
  
  /**
   * Start a new round
   */
  startRound(): void {
    this.state.match.status = 'active';
    this.state.match.roundTimeLeft = GAME_CONSTANTS.ROUND_DURATION;
    
    // Reset all players
    this.resetPlayersForRound();
    
    // Clear all projectiles
    this.state.projectiles.clear();
    
    // Clear events (important: prevents event spam)
    this.state.events = [];
    
    this.addEvent('round_start', {
      roundNumber: this.state.match.currentRound,
      timeLeft: this.state.match.roundTimeLeft
    });
    
    logger.info(`Round ${this.state.match.currentRound} started for match ${this.state.matchId}`);
    this.updateTimestamp();
  }
  
  /**
   * Update round time (called by RoundSystem tick)
   */
  updateRoundTime(newTimeLeft: number): void {
    if (newTimeLeft !== this.state.match.roundTimeLeft) {
      this.state.match.roundTimeLeft = Math.max(0, newTimeLeft);
      this.updateTimestamp();
      
      // Log significant time changes for debugging
      if (newTimeLeft % 10 === 0 || newTimeLeft <= 5) {
        logger.debug(`Round time updated: ${newTimeLeft}s remaining`);
      }
    }
  }
  
  /**
   * End the current round
   */
  endRound(winnerId: string, reason: 'elimination' | 'timeout' | 'forfeit'): void {
    const isPlayer1Winner = winnerId === this.state.match.player1Id;
    
    // Update score
    if (isPlayer1Winner) {
      this.state.match.score.player1++;
    } else {
      this.state.match.score.player2++;
    }
    
    const roundDuration = GAME_CONSTANTS.ROUND_DURATION - this.state.match.roundTimeLeft;
    
    // Create round end event
    this.addEvent('round_end', {
      roundNumber: this.state.match.currentRound,
      winnerId,
      reason,
      duration: roundDuration,
      finalScore: { ...this.state.match.score }
    });
    
    // Check if match is over
    const maxScore = Math.max(this.state.match.score.player1, this.state.match.score.player2);
    if (maxScore >= GAME_CONSTANTS.ROUNDS_TO_WIN) {
      this.endMatch(winnerId);
    } else {
      // Prepare for next round
      this.state.match.currentRound++;
      this.state.match.status = 'intermission';
    }
    
    logger.info(`Round ${this.state.match.currentRound} ended`, {
      winnerId,
      reason,
      score: this.state.match.score
    });
    
    this.updateTimestamp();
  }
  
  /**
   * End the entire match
   */
  endMatch(winnerId: string): void {
    this.state.match.status = 'completed';
    this.state.match.winnerId = winnerId;
    this.state.match.endTime = Date.now();
    this.state.match.totalDuration = this.state.match.endTime - this.state.match.startTime;
    
    this.addEvent('match_end', {
      matchId: this.state.matchId,
      winnerId,
      finalScore: { ...this.state.match.score },
      totalDuration: this.state.match.totalDuration
    });
    
    logger.info(`Match ${this.state.matchId} completed`, {
      winnerId,
      finalScore: this.state.match.score,
      duration: this.state.match.totalDuration
    });
    
    this.updateTimestamp();
  }
  
  // ============================================================================
  // STATE ACCESS
  // ============================================================================
  
  /**
   * Get complete game state (read-only)
   */
  getState(): Readonly<GameState> {
    return {
      ...this.state,
      players: new Map(this.state.players),
      projectiles: new Map(this.state.projectiles),
      events: [...this.state.events]
    };
  }
  
  /**
   * Get specific player state
   */
  getPlayer(playerId: string): Readonly<PlayerState> | null {
    const player = this.state.players.get(playerId);
    return player ? { ...player } : null;
  }
  
  /**
   * Get all players as array
   */
  getAllPlayers(): ReadonlyArray<PlayerState> {
    return Array.from(this.state.players.values()).map(p => ({ ...p }));
  }
  
  /**
   * Get match state
   */
  getMatchState(): Readonly<MatchState> {
    return { ...this.state.match };
  }
  
  /**
   * Generate delta update with only changed data
   */
  generateDelta(lastSequence: number = 0): DeltaUpdate {
    // For now, return full state delta
    // TODO: Implement proper delta compression
    const playerDeltas: PlayerDelta[] = Array.from(this.state.players.values()).map(player => ({
      id: player.id,
      position: player.position,
      angle: player.angle,
      velocity: player.velocity,
      health: player.health,
      armor: player.armor,
      weaponCooldown: player.weaponCooldown,
      isAlive: player.isAlive,
      isMoving: player.isMoving,
      isDashing: player.isDashing
    }));
    
    const projectileDeltas: ProjectileDelta[] = Array.from(this.state.projectiles.values()).map(proj => ({
      id: proj.id,
      position: proj.position,
      velocity: proj.velocity,
      angle: proj.angle,
      timeToLive: proj.timeToLive,
      type: proj.type,
      ownerId: proj.ownerId,
      damage: proj.damage
    }));
    
    const delta = {
      timestamp: this.state.timestamp,
      lastProcessedInput: lastSequence,
      players: playerDeltas,
      projectiles: projectileDeltas,
      match: { ...this.state.match },
      events: [...this.state.events]
    };
    
    // Clear events after they're included in delta to prevent repeated broadcasting
    this.state.events = [];
    
    return delta;
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  private updateTimestamp(): void {
    this.state.timestamp = Date.now();
  }
  
  private addEvent(type: any, data: Record<string, any>): void {
    const event: GameEvent = {
      id: `event_${this.eventIdCounter++}`,
      type,
      timestamp: Date.now(),
      data
    };
    
    this.state.events.push(event);
  }
  
  private resetPlayersForRound(): void {
    let spawnIndex = 0;
    
    for (const [playerId, player] of this.state.players) {
      // Find spawn point
      const spawnPoint = this.getSpawnPointForPlayer(playerId);
      if (spawnPoint) {
        player.position = { ...spawnPoint.position };
        player.angle = spawnPoint.angle;
      }
      
      // Reset health and status
      player.health = player.maxHealth;
      player.isAlive = true;
      player.isMoving = false;
      player.isDashing = false;
      player.velocity = { x: 0, y: 0 };
      
      // Reset cooldowns
      player.weaponCooldown = 0;
      player.dashCooldown = 0;
      
      // Reset round stats
      player.roundKills = 0;
      player.roundDamageDealt = 0;
      
      spawnIndex++;
    }
  }
  
  private getSpawnPointForPlayer(playerId: string): SpawnPoint | null {
    const isPlayer1 = playerId === this.state.match.player1Id;
    
    // Find team-specific spawn points
    const teamSpawns = this.state.mapData.spawnPoints.filter(sp => 
      sp.team === (isPlayer1 ? 'player1' : 'player2')
    );
    
    if (teamSpawns.length > 0) {
      return teamSpawns[0];
    }
    
    // Fallback to any available spawn point
    if (this.state.mapData.spawnPoints.length > 0) {
      const index = isPlayer1 ? 0 : Math.min(1, this.state.mapData.spawnPoints.length - 1);
      return this.state.mapData.spawnPoints[index];
    }
    
    return null;
  }
  
  private isValidPosition(position: Position): boolean {
    const bounds = GAME_CONSTANTS.MAP_BOUNDS;
    return position.x >= bounds.minX && position.x <= bounds.maxX &&
           position.y >= bounds.minY && position.y <= bounds.maxY;
  }
}