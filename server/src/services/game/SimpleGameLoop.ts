import { logger } from '../../utils/logger.js';
import { 
  Vector2, 
  ClassType, 
  MatchStatus,
  GameAction,
  ActionType
} from '@dueled/shared';

/**
 * SimpleGameLoop - Scalable foundation for 1v1 arena combat
 * 
 * Architecture designed for 2 classes (Berserker, Mage) with scalability to 4
 * Focus: Simple, efficient, server-authoritative game state management
 */

export interface SimpleGameState {
  matchId: string;
  players: Map<string, SimplePlayer>;
  projectiles: Map<string, SimpleProjectile>;
  arena: SimpleArena;
  gameTime: number;
  status: MatchStatus;
  lastUpdate: number;
  tickRate: number; // 60 ticks per second for smooth gameplay
  roundSystem: RoundState;
}

export interface SimplePlayer {
  id: string;
  username: string;
  classType: ClassType;
  position: Vector2;
  rotation: number;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  lastInputTime: number;
  // Simplified abilities - one per class
  abilityState: SimpleAbilityState;
  // Basic stats only
  stats: SimplePlayerStats;
}

export interface SimplePlayerStats {
  // Core combat stats
  damage: number;
  speed: number;
  // Class-specific scaling factors
  strength: number;      // Damage multiplier
  defense: number;       // Damage reduction
}

export interface SimpleAbilityState {
  id: string;
  cooldown: number;      // Cooldown duration in ms
  lastUsed: number;      // Timestamp of last use
  isReady: boolean;      // Computed availability
}

export interface SimpleProjectile {
  id: string;
  type: 'arrow' | 'ice_shard' | 'fire_bomb' | 'magic_missile';
  ownerId: string;
  position: Vector2;
  direction: Vector2;   // Normalized direction vector
  speed: number;        // Units per second
  damage: number;
  range: number;        // Max travel distance
  traveledDistance: number;
  createdAt: number;
}

export interface SimpleArena {
  id: string;
  name: string;
  size: Vector2;        // Arena dimensions
  spawnPoints: Vector2[]; // Player spawn positions
  walls: Wall[];        // Simple wall collision
}

export interface Wall {
  start: Vector2;
  end: Vector2;
  type: 'solid' | 'destructible';
}

export interface RoundState {
  currentRound: number;
  maxRounds: number;    // Best of 3 or 5
  roundTimeLimit: number; // 60 seconds per round
  roundStartTime: number;
  scores: Map<string, number>; // Player wins
  roundStatus: 'waiting' | 'active' | 'ended';
}

export interface PlayerInput {
  playerId: string;
  action: GameAction;
  timestamp: number;
}

/**
 * SimpleGameLoop - Main game state management class
 * 
 * Responsibilities:
 * - Process player inputs
 * - Update game physics (simplified)
 * - Handle combat resolution
 * - Manage round system
 * - Broadcast state updates
 */
export class SimpleGameLoop {
  private gameStates: Map<string, SimpleGameState> = new Map();
  private readonly TICK_RATE = 60; // 60 FPS server tick rate
  private readonly TICK_DURATION = 1000 / this.TICK_RATE;

  /**
   * Create new game state for match
   */
  createGameState(matchId: string, players: { id: string; username: string; classType: ClassType }[], arenaId: string): SimpleGameState {
    const arena = this.loadArena(arenaId);
    const playerMap = new Map<string, SimplePlayer>();
    
    players.forEach((playerData, index) => {
      const classStats = this.getClassStats(playerData.classType);
      const spawnPosition = arena.spawnPoints[index] || { x: 5, y: 5 };
      
      const player: SimplePlayer = {
        id: playerData.id,
        username: playerData.username,
        classType: playerData.classType,
        position: spawnPosition,
        rotation: 0,
        health: classStats.maxHealth,
        maxHealth: classStats.maxHealth,
        isAlive: true,
        lastInputTime: Date.now(),
        abilityState: {
          id: this.getClassAbility(playerData.classType),
          cooldown: this.getAbilityCooldown(playerData.classType),
          lastUsed: 0,
          isReady: true
        },
        stats: {
          damage: classStats.damage,
          speed: classStats.speed,
          strength: classStats.strength,
          defense: classStats.defense
        }
      };
      
      playerMap.set(playerData.id, player);
    });

    const gameState: SimpleGameState = {
      matchId,
      players: playerMap,
      projectiles: new Map(),
      arena,
      gameTime: 0,
      status: 'waiting',
      lastUpdate: Date.now(),
      tickRate: this.TICK_RATE,
      roundSystem: {
        currentRound: 1,
        maxRounds: 3, // Best of 3 by default
        roundTimeLimit: 60000, // 60 seconds
        roundStartTime: Date.now(),
        scores: new Map(players.map(p => [p.id, 0])),
        roundStatus: 'waiting'
      }
    };

    this.gameStates.set(matchId, gameState);
    logger.info(`Created simple game state for match ${matchId} with ${players.length} players`);
    
    return gameState;
  }

  /**
   * Main game tick - processes all game logic
   */
  tick(matchId: string, inputs: PlayerInput[]): SimpleGameState | null {
    const gameState = this.gameStates.get(matchId);
    if (!gameState) return null;

    const now = Date.now();
    const deltaTime = now - gameState.lastUpdate;
    
    // Process inputs
    this.processInputs(gameState, inputs);
    
    // Update game systems
    this.updateProjectiles(gameState, deltaTime);
    this.updateAbilityCooldowns(gameState, now);
    this.updateRoundSystem(gameState, now);
    
    // Check win conditions
    this.checkWinConditions(gameState);
    
    gameState.gameTime += deltaTime;
    gameState.lastUpdate = now;
    
    return gameState;
  }

  /**
   * Process player inputs with server authority
   */
  private processInputs(gameState: SimpleGameState, inputs: PlayerInput[]): void {
    for (const input of inputs) {
      const player = gameState.players.get(input.playerId);
      if (!player || !player.isAlive) continue;

      switch (input.action.type) {
        case ActionType.MOVE:
          this.handleMovement(gameState, player, input.action);
          break;
        case ActionType.ATTACK:
          this.handleAttack(gameState, player, input.action);
          break;
        case ActionType.USE_ABILITY:
          this.handleAbility(gameState, player, input.action);
          break;
      }
      
      player.lastInputTime = input.timestamp;
    }
  }

  /**
   * Handle player movement with collision detection
   */
  private handleMovement(gameState: SimpleGameState, player: SimplePlayer, action: GameAction): void {
    if (!action.movement) return;

    const moveSpeed = player.stats.speed;
    const deltaTime = 1000 / this.TICK_RATE; // Fixed timestep
    
    // Calculate new position
    const newPosition = {
      x: player.position.x + action.movement.x * moveSpeed * (deltaTime / 1000),
      y: player.position.y + action.movement.y * moveSpeed * (deltaTime / 1000)
    };
    
    // Simple boundary checking
    newPosition.x = Math.max(0, Math.min(gameState.arena.size.x, newPosition.x));
    newPosition.y = Math.max(0, Math.min(gameState.arena.size.y, newPosition.y));
    
    // TODO: Add wall collision in SimplePhysics.ts
    player.position = newPosition;
    player.rotation = action.movement.angle || player.rotation;
  }

  /**
   * Handle attack actions - create projectiles
   */
  private handleAttack(gameState: SimpleGameState, player: SimplePlayer, action: GameAction): void {
    if (!action.attack) return;

    const projectile = this.createSimpleProjectile(
      player,
      action.attack.direction,
      'basic'
    );
    
    if (projectile) {
      gameState.projectiles.set(projectile.id, projectile);
      logger.debug(`Player ${player.id} created projectile ${projectile.id}`);
    }
  }

  /**
   * Handle ability usage
   */
  private handleAbility(gameState: SimpleGameState, player: SimplePlayer, action: GameAction): void {
    if (!player.abilityState.isReady) return;

    // Use ability based on class type
    switch (player.classType) {
      case ClassType.BERSERKER:
        this.useBerserkerCharge(gameState, player, action);
        break;
      case ClassType.MAGE:
        this.useMageFrostNova(gameState, player, action);
        break;
    }
    
    // Set cooldown
    player.abilityState.lastUsed = Date.now();
    player.abilityState.isReady = false;
  }

  /**
   * Class-specific ability implementations
   */
  private useBerserkerCharge(gameState: SimpleGameState, player: SimplePlayer, action: GameAction): void {
    // Simple charge: increase damage and speed temporarily
    const chargeDistance = 3.0; // tiles
    const direction = action.ability?.direction || { x: Math.cos(player.rotation), y: Math.sin(player.rotation) };
    
    // Create charge projectile for gap closing
    const chargeProjectile = this.createSimpleProjectile(player, direction, 'charge');
    if (chargeProjectile) {
      gameState.projectiles.set(chargeProjectile.id, chargeProjectile);
    }
  }

  private useMageFrostNova(gameState: SimpleGameState, player: SimplePlayer, action: GameAction): void {
    // Simple frost nova: damage + slow effect in radius
    const novaRadius = 4.0; // tiles
    
    // Check for enemies in radius (simplified - no complex collision)
    for (const target of gameState.players.values()) {
      if (target.id === player.id || !target.isAlive) continue;
      
      const distance = this.calculateDistance(player.position, target.position);
      if (distance <= novaRadius) {
        this.applyDamage(target, player.stats.damage * 1.5); // Ability does more damage
        logger.debug(`Frost nova hit ${target.id} for ${player.stats.damage * 1.5} damage`);
      }
    }
  }

  /**
   * Update projectiles - simple point-to-point movement
   */
  private updateProjectiles(gameState: SimpleGameState, deltaTime: number): void {
    const projectilesToRemove: string[] = [];
    
    for (const projectile of gameState.projectiles.values()) {
      // Move projectile
      const moveDistance = projectile.speed * (deltaTime / 1000);
      projectile.position.x += projectile.direction.x * moveDistance;
      projectile.position.y += projectile.direction.y * moveDistance;
      projectile.traveledDistance += moveDistance;
      
      // Check range limit
      if (projectile.traveledDistance >= projectile.range) {
        projectilesToRemove.push(projectile.id);
        continue;
      }
      
      // Check player collisions
      for (const player of gameState.players.values()) {
        if (player.id === projectile.ownerId || !player.isAlive) continue;
        
        const distance = this.calculateDistance(projectile.position, player.position);
        if (distance < 0.5) { // Hit threshold
          this.applyDamage(player, projectile.damage);
          projectilesToRemove.push(projectile.id);
          logger.debug(`Projectile ${projectile.id} hit player ${player.id} for ${projectile.damage} damage`);
          break;
        }
      }
    }
    
    // Remove expired/hit projectiles
    for (const id of projectilesToRemove) {
      gameState.projectiles.delete(id);
    }
  }

  /**
   * Apply damage with defense calculation
   */
  private applyDamage(target: SimplePlayer, baseDamage: number): void {
    const effectiveDamage = Math.max(1, baseDamage - target.stats.defense);
    target.health = Math.max(0, target.health - effectiveDamage);
    
    if (target.health <= 0) {
      target.isAlive = false;
      logger.info(`Player ${target.id} has been eliminated`);
    }
  }

  /**
   * Create simple projectile
   */
  private createSimpleProjectile(
    owner: SimplePlayer, 
    direction: Vector2, 
    type: 'basic' | 'charge'
  ): SimpleProjectile | null {
    const projectileId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // Get projectile properties based on class
    const projectileType = this.getProjectileType(owner.classType);
    const projectileStats = this.getProjectileStats(owner.classType, type);
    
    return {
      id: projectileId,
      type: projectileType,
      ownerId: owner.id,
      position: { ...owner.position },
      direction: this.normalizeVector(direction),
      speed: projectileStats.speed,
      damage: owner.stats.damage * projectileStats.damageMultiplier,
      range: projectileStats.range,
      traveledDistance: 0,
      createdAt: Date.now()
    };
  }

  /**
   * Utility functions for scalable class system
   */
  private getClassStats(classType: ClassType) {
    const classConfigs = {
      [ClassType.BERSERKER]: {
        maxHealth: 150,
        damage: 45,
        speed: 5.0,
        strength: 15,
        defense: 8
      },
      [ClassType.MAGE]: {
        maxHealth: 100,
        damage: 35,
        speed: 4.5,
        strength: 12,
        defense: 4
      },
      // Ready for future expansion
      [ClassType.ARCHER]: {
        maxHealth: 80,
        damage: 40,
        speed: 5.5,
        strength: 10,
        defense: 3
      },
      [ClassType.BOMBER]: {
        maxHealth: 120,
        damage: 50,
        speed: 4.0,
        strength: 14,
        defense: 6
      }
    };
    
    return classConfigs[classType];
  }

  private getClassAbility(classType: ClassType): string {
    const abilities = {
      [ClassType.BERSERKER]: 'charge',
      [ClassType.MAGE]: 'frost_nova',
      [ClassType.ARCHER]: 'piercing_shot',
      [ClassType.BOMBER]: 'explosive_trap'
    };
    
    return abilities[classType];
  }

  private getAbilityCooldown(classType: ClassType): number {
    const cooldowns = {
      [ClassType.BERSERKER]: 8000,  // 8 seconds
      [ClassType.MAGE]: 10000,      // 10 seconds
      [ClassType.ARCHER]: 6000,     // 6 seconds
      [ClassType.BOMBER]: 12000     // 12 seconds
    };
    
    return cooldowns[classType];
  }

  private getProjectileType(classType: ClassType): SimpleProjectile['type'] {
    const projectileTypes = {
      [ClassType.BERSERKER]: 'magic_missile' as const, // Charge effect
      [ClassType.MAGE]: 'ice_shard' as const,
      [ClassType.ARCHER]: 'arrow' as const,
      [ClassType.BOMBER]: 'fire_bomb' as const
    };
    
    return projectileTypes[classType];
  }

  private getProjectileStats(classType: ClassType, type: 'basic' | 'charge') {
    const baseStats = {
      [ClassType.BERSERKER]: { speed: 12, damageMultiplier: 1.0, range: 6 },
      [ClassType.MAGE]: { speed: 8, damageMultiplier: 1.0, range: 12 },
      [ClassType.ARCHER]: { speed: 15, damageMultiplier: 1.0, range: 15 },
      [ClassType.BOMBER]: { speed: 6, damageMultiplier: 1.2, range: 8 }
    };
    
    const stats = baseStats[classType];
    
    // Modify for special abilities
    if (type === 'charge') {
      stats.speed *= 2;
      stats.damageMultiplier *= 1.5;
    }
    
    return stats;
  }

  /**
   * Update ability cooldowns
   */
  private updateAbilityCooldowns(gameState: SimpleGameState, now: number): void {
    for (const player of gameState.players.values()) {
      if (!player.abilityState.isReady) {
        const timeSinceUse = now - player.abilityState.lastUsed;
        if (timeSinceUse >= player.abilityState.cooldown) {
          player.abilityState.isReady = true;
        }
      }
    }
  }

  /**
   * Update round system and match progression
   */
  private updateRoundSystem(gameState: SimpleGameState, now: number): void {
    const round = gameState.roundSystem;
    
    if (round.roundStatus === 'active') {
      const roundDuration = now - round.roundStartTime;
      
      // Check round time limit
      if (roundDuration >= round.roundTimeLimit) {
        this.endRound(gameState, 'timeout');
      }
    }
  }

  /**
   * Check win conditions for rounds and matches
   */
  private checkWinConditions(gameState: SimpleGameState): void {
    const alivePlayers = Array.from(gameState.players.values()).filter(p => p.isAlive);
    
    if (alivePlayers.length <= 1 && gameState.roundSystem.roundStatus === 'active') {
      const winner = alivePlayers[0];
      this.endRound(gameState, winner ? 'elimination' : 'draw');
    }
  }

  /**
   * End current round and check for match completion
   */
  private endRound(gameState: SimpleGameState, reason: 'elimination' | 'timeout' | 'draw'): void {
    const round = gameState.roundSystem;
    round.roundStatus = 'ended';
    
    // Determine round winner
    if (reason === 'elimination') {
      const winner = Array.from(gameState.players.values()).find(p => p.isAlive);
      if (winner) {
        const currentScore = round.scores.get(winner.id) || 0;
        round.scores.set(winner.id, currentScore + 1);
        logger.info(`Round ${round.currentRound} won by ${winner.id}`);
      }
    }
    
    // Check if match is complete
    const maxScore = Math.max(...Array.from(round.scores.values()));
    const requiredWins = Math.ceil(round.maxRounds / 2);
    
    if (maxScore >= requiredWins) {
      gameState.status = 'ended';
      logger.info(`Match ${gameState.matchId} ended`);
    } else {
      // Start next round
      round.currentRound++;
      this.startNewRound(gameState);
    }
  }

  /**
   * Start new round
   */
  private startNewRound(gameState: SimpleGameState): void {
    const round = gameState.roundSystem;
    round.roundStatus = 'active';
    round.roundStartTime = Date.now();
    
    // Reset player states
    let spawnIndex = 0;
    for (const player of gameState.players.values()) {
      const classStats = this.getClassStats(player.classType);
      player.health = classStats.maxHealth;
      player.isAlive = true;
      player.position = gameState.arena.spawnPoints[spawnIndex] || { x: 5, y: 5 };
      player.abilityState.isReady = true;
      spawnIndex++;
    }
    
    // Clear projectiles
    gameState.projectiles.clear();
    
    logger.info(`Started round ${round.currentRound} in match ${gameState.matchId}`);
  }

  /**
   * Utility functions
   */
  private calculateDistance(pos1: Vector2, pos2: Vector2): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private normalizeVector(vector: Vector2): Vector2 {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: vector.x / length, y: vector.y / length };
  }

  private loadArena(arenaId: string): SimpleArena {
    // Simple arena configurations
    const arenas = {
      'arena_1': {
        id: 'arena_1',
        name: 'Classic Arena',
        size: { x: 20, y: 20 },
        spawnPoints: [
          { x: 2, y: 10 },
          { x: 18, y: 10 }
        ],
        walls: [
          // Arena boundaries
          { start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, type: 'solid' as const },
          { start: { x: 20, y: 0 }, end: { x: 20, y: 20 }, type: 'solid' as const },
          { start: { x: 20, y: 20 }, end: { x: 0, y: 20 }, type: 'solid' as const },
          { start: { x: 0, y: 20 }, end: { x: 0, y: 0 }, type: 'solid' as const }
        ]
      }
    };
    
    return arenas[arenaId] || arenas['arena_1'];
  }

  /**
   * Get game state (for broadcasting to clients)
   */
  getGameState(matchId: string): SimpleGameState | null {
    return this.gameStates.get(matchId) || null;
  }

  /**
   * Clean up game state
   */
  destroyGameState(matchId: string): void {
    this.gameStates.delete(matchId);
    logger.info(`Cleaned up game state for match ${matchId}`);
  }
}