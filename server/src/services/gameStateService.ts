import { redis } from './redis.js';
import { logger } from '../utils/logger.js';
import { 
  GameState, 
  Match, 
  Player, 
  Vector2, 
  ClassType, 
  DamageType, 
  ObstacleType,
  ClassConfig,
  ClassStats,
  Arena,
  MatchStatus,
  GameAction,
  ActionType,
  Obstacle
} from '@dueled/shared';
import { 
  getClassConfig, 
  calculateEffectiveDamage, 
  calculateDashCooldown, 
  calculateEffectiveCooldown 
} from '@dueled/shared';

export interface ServerGameState {
  matchId: string;
  players: Map<string, ServerPlayer>;
  arena: Arena;
  gameTime: number;
  status: MatchStatus;
  lastUpdate: number;
  tickRate: number;
  events: GameEvent[];
  playerInputs: Map<string, PlayerInput[]>;
}

export interface ServerPlayer {
  id: string;
  username: string;
  classType: ClassType;
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  isAlive: boolean;
  lastInputTime: number;
  abilities: Map<string, AbilityState>;
  buffs: Buff[];
  stats: PlayerStats;
}

export interface PlayerStats {
  damage: number;
  speed: number;
  armorPenetration: number;
  cooldownReduction: number;
  range: number;
  // New stat system
  stamina: number;
  strength: number;
  intelligence: number;
}

export interface AbilityState {
  id: string;
  cooldown: number;
  lastUsed: number;
  charges: number;
  maxCharges: number;
}

export interface Buff {
  id: string;
  type: 'speed' | 'damage' | 'armor' | 'slow' | 'freeze' | 'burn';
  value: number;
  duration: number;
  startTime: number;
  source: string;
}

export interface GameEvent {
  id: string;
  type: string;
  playerId?: string;
  data: any;
  timestamp: number;
  processed: boolean;
}

export interface PlayerInput {
  playerId: string;
  action: GameAction;
  timestamp: number;
  processed: boolean;
}

export interface GameUpdate {
  matchId: string;
  tick: number;
  timestamp: number;
  players: Partial<ServerPlayer>[];
  events: GameEvent[];
  worldState?: any;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  correctedValue?: any;
}

export class GameStateService {
  private gameStates: Map<string, ServerGameState> = new Map();
  private readonly TICK_RATE = 20; // 20 TPS
  private readonly TICK_INTERVAL = 1000 / this.TICK_RATE;
  private readonly STATE_CACHE_TTL = 300; // 5 minutes
  private readonly MAX_EVENTS_PER_TICK = 100;
  private readonly INTERPOLATION_BUFFER = 100; // 100ms
  
  // Game loop timers
  private gameLoops: Map<string, NodeJS.Timeout> = new Map();
  
  // Game handler for broadcasting
  private gameHandler: any = null;
  
  setGameHandler(handler: any) {
    this.gameHandler = handler;
  }
  
  // Arena configuration - using same coordinate system as client (20x20 grid)
  private readonly ARENA_CONFIG = {
    width: 20,
    height: 20,
    obstacles: [
      {
        id: 'wall_1',
        position: { x: 5, y: 5 },
        size: { x: 2, y: 2 },
        type: ObstacleType.PILLAR
      },
      {
        id: 'wall_2',
        position: { x: 14, y: 5 },
        size: { x: 2, y: 2 },
        type: ObstacleType.PILLAR
      },
      {
        id: 'pillar_1',
        position: { x: 5, y: 14 },
        size: { x: 2, y: 2 },
        type: ObstacleType.PILLAR
      },
      {
        id: 'pillar_2',
        position: { x: 14, y: 14 },
        size: { x: 2, y: 2 },
        type: ObstacleType.PILLAR
      }
    ],
    spawnPoints: [
      { x: 2.5, y: 2.5 },    // Top-left - matches client spawn point
      { x: 17.5, y: 17.5 }   // Bottom-right - matches client spawn point
    ]
  };
  
  // Class configurations - now using shared configurations
  private getClassConfig(classType: ClassType): ClassConfig {
    return getClassConfig(classType);
  }

  /**
   * Initialize game state for a new match
   */
  async initializeGameState(matchId: string, player1: Player, player2: Player, player1Class: ClassType, player2Class: ClassType): Promise<boolean> {
    try {
      // Create server players
      const serverPlayer1 = this.createServerPlayer(player1, player1Class, 0);
      const serverPlayer2 = this.createServerPlayer(player2, player2Class, 1);
      
      // Create game state
      const gameState: ServerGameState = {
        matchId,
        players: new Map([
          [player1.id, serverPlayer1],
          [player2.id, serverPlayer2]
        ]),
        arena: this.ARENA_CONFIG,
        gameTime: 0,
        status: MatchStatus.WAITING,
        lastUpdate: Date.now(),
        tickRate: this.TICK_RATE,
        events: [],
        playerInputs: new Map([
          [player1.id, []],
          [player2.id, []]
        ])
      };
      
      // Store in memory
      this.gameStates.set(matchId, gameState);
      
      // Cache in Redis
      await this.cacheGameState(matchId, gameState);
      
      logger.info(`Game state initialized for match ${matchId}`);
      return true;
    } catch (error) {
      logger.error('Error initializing game state:', error);
      return false;
    }
  }

  /**
   * Start the game loop for a match
   */
  async startGameLoop(matchId: string): Promise<boolean> {
    try {
      const gameState = await this.getGameState(matchId);
      if (!gameState) {
        logger.error(`Cannot start game loop: Game state not found for match ${matchId}`);
        return false;
      }
      
      // Update status to in progress
      gameState.status = MatchStatus.IN_PROGRESS;
      await this.updateGameState(matchId, gameState);
      
      // Start fixed timestep game loop
      const gameLoop = setInterval(() => {
        this.processGameTick(matchId).catch(error => {
          logger.error(`Game loop error for match ${matchId}:`, error);
        });
      }, this.TICK_INTERVAL);
      
      this.gameLoops.set(matchId, gameLoop);
      
      logger.info(`Game loop started for match ${matchId} at ${this.TICK_RATE} TPS`);
      return true;
    } catch (error) {
      logger.error('Error starting game loop:', error);
      return false;
    }
  }

  /**
   * Stop the game loop for a match
   */
  async stopGameLoop(matchId: string): Promise<void> {
    const gameLoop = this.gameLoops.get(matchId);
    if (gameLoop) {
      clearInterval(gameLoop);
      this.gameLoops.delete(matchId);
      logger.info(`Game loop stopped for match ${matchId}`);
    }
  }

  /**
   * Process a single game tick
   */
  private async processGameTick(matchId: string): Promise<void> {
    try {
      const gameState = await this.getGameState(matchId);
      if (!gameState || gameState.status !== MatchStatus.IN_PROGRESS) {
        return;
      }
      
      const now = Date.now();
      const deltaTime = now - gameState.lastUpdate;
      
      // Process player inputs
      await this.processPlayerInputs(gameState, deltaTime);
      
      // Update game physics
      this.updateGamePhysics(gameState, deltaTime);
      
      // Process abilities and effects
      this.processAbilities(gameState, deltaTime);
      
      // Update buffs and debuffs
      this.updateBuffs(gameState, deltaTime);
      
      // Check win conditions
      this.checkWinConditions(gameState);
      
      // Update game time
      gameState.gameTime += deltaTime;
      gameState.lastUpdate = now;
      
      // Generate and broadcast game update
      const gameUpdate = this.generateGameUpdate(gameState);
      await this.broadcastGameUpdate(matchId, gameUpdate);
      
      // Cache updated state
      await this.cacheGameState(matchId, gameState);
      
      // Clean up old events
      this.cleanupOldEvents(gameState);
    } catch (error) {
      logger.error(`Error processing game tick for match ${matchId}:`, error);
    }
  }

  /**
   * Process player inputs for this tick
   */
  private async processPlayerInputs(gameState: ServerGameState, deltaTime: number): Promise<void> {
    for (const [playerId, inputs] of gameState.playerInputs) {
      const player = gameState.players.get(playerId);
      if (!player || !player.isAlive) continue;
      
      // Process unprocessed inputs
      const unprocessedInputs = inputs.filter(input => !input.processed);
      const inputsToProcess = unprocessedInputs.slice(0, this.MAX_EVENTS_PER_TICK);
      
      for (const input of inputsToProcess) {
        await this.processPlayerInput(gameState, player, input, deltaTime);
        input.processed = true;
      }
      
      // Remove processed inputs (keep recent ones for validation)
      const cutoffTime = Date.now() - this.INTERPOLATION_BUFFER;
      gameState.playerInputs.set(playerId, inputs.filter(input => input.timestamp > cutoffTime));
    }
  }

  /**
   * Process a single player input
   */
  private async processPlayerInput(gameState: ServerGameState, player: ServerPlayer, input: PlayerInput, deltaTime: number): Promise<void> {
    const action = input.action;
    
    // Validate input timing
    if (input.timestamp < player.lastInputTime) {
      logger.warn(`Out of order input from player ${player.id}`);
      return;
    }
    
    player.lastInputTime = input.timestamp;
    
    // Process action based on type
    switch (action.type) {
      case ActionType.MOVE:
        this.processMovement(gameState, player, action.data);
        break;
        
      case ActionType.ATTACK:
        await this.processAttack(gameState, player, action.data);
        break;
        
      case ActionType.USE_ABILITY:
        await this.processAbility(gameState, player, action.data);
        break;
        
      default:
        logger.warn(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Process player movement
   */
  private processMovement(gameState: ServerGameState, player: ServerPlayer, moveData: any): void {
    const { position, velocity, rotation } = moveData;
    
    // Validate position
    const validationResult = this.validatePosition(position, gameState.arena);
    if (!validationResult.valid) {
      logger.warn(`Invalid position from player ${player.id}: ${validationResult.error}`);
      return;
    }
    
    // Validate velocity
    const maxSpeed = this.getPlayerMaxSpeed(player);
    const velocityMagnitude = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (velocityMagnitude > maxSpeed * 1.1) { // 10% tolerance
      logger.warn(`Player ${player.id} exceeding max speed: ${velocityMagnitude} > ${maxSpeed}`);
      // Normalize velocity
      velocity.x = (velocity.x / velocityMagnitude) * maxSpeed;
      velocity.y = (velocity.y / velocityMagnitude) * maxSpeed;
    }
    
    // Check collision with obstacles
    const correctedPosition = this.checkCollisions(position, player, gameState.arena);
    
    // Update player state
    player.position = correctedPosition;
    player.velocity = velocity;
    player.rotation = rotation;
  }

  /**
   * Process player attack
   */
  private async processAttack(gameState: ServerGameState, player: ServerPlayer, attackData: any): Promise<void> {
    const { target, direction, attackType } = attackData;
    
    // Calculate damage based on class and stats
    const baseDamage = this.getPlayerBaseDamage(player);
    const finalDamage = this.calculateDamage(baseDamage, player.stats);
    
    // Determine attack area/targets
    const affectedPlayers = this.getPlayersInAttackRange(gameState, player, attackData);
    
    // Apply damage to affected players
    for (const targetPlayer of affectedPlayers) {
      if (targetPlayer.id === player.id) continue; // Can't damage self
      
      const damageDealt = this.applyDamage(targetPlayer, finalDamage, player.classType);
      
      // Create damage event
      const damageEvent: GameEvent = {
        id: `damage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'damage_dealt',
        playerId: player.id,
        data: {
          targetId: targetPlayer.id,
          damage: damageDealt,
          damageType: this.getDamageType(player.classType),
          attackType
        },
        timestamp: Date.now(),
        processed: false
      };
      
      gameState.events.push(damageEvent);
      
      // Check if target died
      if (targetPlayer.health <= 0) {
        targetPlayer.isAlive = false;
        
        const deathEvent: GameEvent = {
          id: `death_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'player_death',
          playerId: targetPlayer.id,
          data: {
            killerId: player.id,
            position: targetPlayer.position
          },
          timestamp: Date.now(),
          processed: false
        };
        
        gameState.events.push(deathEvent);
      }
    }
  }

  /**
   * Process player ability use
   */
  private async processAbility(gameState: ServerGameState, player: ServerPlayer, abilityData: any): Promise<void> {
    const { abilityId, target, position } = abilityData;
    
    const ability = player.abilities.get(abilityId);
    if (!ability) {
      logger.warn(`Player ${player.id} tried to use unknown ability: ${abilityId}`);
      return;
    }
    
    // Check cooldown
    const now = Date.now();
    if (now - ability.lastUsed < ability.cooldown) {
      logger.warn(`Player ${player.id} ability ${abilityId} on cooldown`);
      return;
    }
    
    // Check charges
    if (ability.charges <= 0) {
      logger.warn(`Player ${player.id} ability ${abilityId} out of charges`);
      return;
    }
    
    // Process ability effect
    await this.processAbilityEffect(gameState, player, abilityId, { target, position });
    
    // Update ability state
    ability.lastUsed = now;
    ability.charges = Math.max(0, ability.charges - 1);
    
    // Create ability event
    const abilityEvent: GameEvent = {
      id: `ability_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'ability_used',
      playerId: player.id,
      data: {
        abilityId,
        target,
        position
      },
      timestamp: now,
      processed: false
    };
    
    gameState.events.push(abilityEvent);
  }

  /**
   * Update game physics
   */
  private updateGamePhysics(gameState: ServerGameState, deltaTime: number): void {
    for (const player of gameState.players.values()) {
      if (!player.isAlive) continue;
      
      // Apply velocity to position
      const dt = deltaTime / 1000; // Convert to seconds
      const newPosition = {
        x: player.position.x + player.velocity.x * dt,
        y: player.position.y + player.velocity.y * dt
      };
      
      // Check bounds and collisions
      const correctedPosition = this.checkCollisions(newPosition, player, gameState.arena);
      player.position = correctedPosition;
    }
  }

  /**
   * Process abilities and effects
   */
  private processAbilities(gameState: ServerGameState, deltaTime: number): void {
    const now = Date.now();
    
    for (const player of gameState.players.values()) {
      // Regenerate ability charges
      for (const ability of player.abilities.values()) {
        if (ability.charges < ability.maxCharges) {
          const timeSinceLastUse = now - ability.lastUsed;
          const chargeRegenTime = ability.cooldown * 0.5; // Charges regenerate at half cooldown rate
          
          if (timeSinceLastUse >= chargeRegenTime) {
            ability.charges = Math.min(ability.maxCharges, ability.charges + 1);
          }
        }
      }
    }
  }

  /**
   * Update buffs and debuffs
   */
  private updateBuffs(gameState: ServerGameState, deltaTime: number): void {
    const now = Date.now();
    
    for (const player of gameState.players.values()) {
      // Update buffs
      player.buffs = player.buffs.filter(buff => {
        const elapsed = now - buff.startTime;
        return elapsed < buff.duration;
      });
      
      // Recalculate stats based on active buffs
      this.recalculatePlayerStats(player);
    }
  }

  /**
   * Check win conditions
   */
  private checkWinConditions(gameState: ServerGameState): void {
    const alivePlayers = Array.from(gameState.players.values()).filter(p => p.isAlive);
    
    if (alivePlayers.length <= 1) {
      gameState.status = MatchStatus.COMPLETED;
      
      if (alivePlayers.length === 1) {
        const winner = alivePlayers[0];
        const winEvent: GameEvent = {
          id: `win_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'game_end',
          playerId: winner.id,
          data: {
            winnerId: winner.id,
            reason: 'elimination'
          },
          timestamp: Date.now(),
          processed: false
        };
        
        gameState.events.push(winEvent);
      }
      
      // Stop game loop
      this.stopGameLoop(gameState.matchId);
    }
  }

  /**
   * Generate game update for broadcasting
   */
  private generateGameUpdate(gameState: ServerGameState): GameUpdate {
    const tick = Math.floor(gameState.gameTime / this.TICK_INTERVAL);
    
    // Create delta update with only changed data
    const playerUpdates = Array.from(gameState.players.values()).map(player => ({
      id: player.id,
      position: player.position,
      velocity: player.velocity,
      rotation: player.rotation,
      health: player.health,
      armor: player.armor,
      isAlive: player.isAlive,
      buffs: player.buffs.filter(buff => buff.startTime > gameState.lastUpdate - this.TICK_INTERVAL)
    }));
    
    // Get new events since last update
    const newEvents = gameState.events.filter(event => 
      event.timestamp > gameState.lastUpdate - this.TICK_INTERVAL
    );
    
    return {
      matchId: gameState.matchId,
      tick,
      timestamp: Date.now(),
      players: playerUpdates,
      events: newEvents
    };
  }

  /**
   * Broadcast game update to all players
   */
  private async broadcastGameUpdate(matchId: string, gameUpdate: GameUpdate): Promise<void> {
    try {
      // Store update in Redis for WebSocket handler
      await redis.lpush(`match:${matchId}:updates`, JSON.stringify(gameUpdate));
      
      // Trigger WebSocket broadcast
      const broadcastEvent = {
        type: 'game_update',
        matchId,
        data: gameUpdate
      };
      
      await redis.lpush('websocket:broadcasts', JSON.stringify(broadcastEvent));
      
      // Direct broadcast if gameHandler is available
      if (this.gameHandler) {
        this.gameHandler.broadcastGameUpdate(matchId, gameUpdate);
      }
    } catch (error) {
      logger.error('Error broadcasting game update:', error);
    }
  }

  /**
   * Add player input to processing queue
   */
  async addPlayerInput(matchId: string, playerId: string, action: GameAction): Promise<boolean> {
    try {
      const gameState = await this.getGameState(matchId);
      if (!gameState) {
        return false;
      }
      
      const input: PlayerInput = {
        playerId,
        action,
        timestamp: Date.now(),
        processed: false
      };
      
      const playerInputs = gameState.playerInputs.get(playerId) || [];
      playerInputs.push(input);
      gameState.playerInputs.set(playerId, playerInputs);
      
      return true;
    } catch (error) {
      logger.error('Error adding player input:', error);
      return false;
    }
  }

  /**
   * Get current game state
   */
  async getGameState(matchId: string): Promise<ServerGameState | null> {
    try {
      // Check memory cache first
      const memoryState = this.gameStates.get(matchId);
      if (memoryState) {
        return memoryState;
      }
      
      // Check Redis cache
      const cachedState = await redis.get(`gamestate:${matchId}`);
      if (cachedState) {
        const gameState = this.deserializeGameState(JSON.parse(cachedState));
        this.gameStates.set(matchId, gameState);
        return gameState;
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting game state:', error);
      return null;
    }
  }

  /**
   * Update game state
   */
  async updateGameState(matchId: string, gameState: ServerGameState): Promise<void> {
    try {
      this.gameStates.set(matchId, gameState);
      await this.cacheGameState(matchId, gameState);
    } catch (error) {
      logger.error('Error updating game state:', error);
    }
  }

  /**
   * Cache game state in Redis
   */
  private async cacheGameState(matchId: string, gameState: ServerGameState): Promise<void> {
    try {
      const serializedState = this.serializeGameState(gameState);
      await redis.setex(`gamestate:${matchId}`, this.STATE_CACHE_TTL, JSON.stringify(serializedState));
    } catch (error) {
      logger.error('Error caching game state:', error);
    }
  }

  /**
   * Serialize game state for storage
   */
  private serializeGameState(gameState: ServerGameState): any {
    return {
      ...gameState,
      players: Array.from(gameState.players.entries()),
      playerInputs: Array.from(gameState.playerInputs.entries())
    };
  }

  /**
   * Deserialize game state from storage
   */
  private deserializeGameState(serializedState: any): ServerGameState {
    return {
      ...serializedState,
      players: new Map(serializedState.players),
      playerInputs: new Map(serializedState.playerInputs)
    };
  }

  /**
   * Helper methods
   */
  private createServerPlayer(player: Player, classType: ClassType, spawnIndex: number): ServerPlayer {
    const classConfig = this.getClassConfig(classType);
    const stats = classConfig.stats;
    const spawnPoint = this.ARENA_CONFIG.spawnPoints[spawnIndex];
    
    return {
      id: player.id,
      username: player.username || 'Anonymous',
      classType,
      position: { ...spawnPoint },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      health: stats.health,
      maxHealth: stats.health,
      armor: stats.defense,
      maxArmor: stats.defense,
      isAlive: true,
      lastInputTime: 0,
      abilities: new Map(classConfig.specialAbility ? [classConfig.specialAbility].map(ability => [ability.id, {
        id: ability.id,
        cooldown: calculateEffectiveCooldown(ability.baseCooldown, stats.intelligence),
        lastUsed: 0,
        charges: 1,
        maxCharges: 1
      }]) : []),
      buffs: [],
      stats: {
        damage: classConfig.weapon.damage,
        speed: stats.speed,
        armorPenetration: 0,
        cooldownReduction: 0,
        range: classConfig.weapon.range,
        // New stats
        stamina: stats.stamina,
        strength: stats.strength,
        intelligence: stats.intelligence
      }
    };
  }

  private validatePosition(position: Vector2, arena: Arena): ValidationResult {
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      return { valid: false, error: 'Invalid position format' };
    }
    
    if (position.x < 0 || position.x > arena.width || position.y < 0 || position.y > arena.height) {
      return { valid: false, error: 'Position out of bounds' };
    }
    
    return { valid: true };
  }

  private checkCollisions(position: Vector2, player: ServerPlayer, arena: Arena): Vector2 {
    const correctedPosition = { ...position };
    
    // Check arena bounds
    correctedPosition.x = Math.max(0, Math.min(arena.width, correctedPosition.x));
    correctedPosition.y = Math.max(0, Math.min(arena.height, correctedPosition.y));
    
    // Check obstacle collisions
    for (const obstacle of arena.obstacles) {
      if (this.isPositionInObstacle(correctedPosition, obstacle)) {
        // Push player out of obstacle
        const pushDirection = this.calculatePushDirection(correctedPosition, obstacle);
        correctedPosition.x += pushDirection.x;
        correctedPosition.y += pushDirection.y;
      }
    }
    
    return correctedPosition;
  }

  private isPositionInObstacle(position: Vector2, obstacle: Obstacle): boolean {
    return position.x >= obstacle.position.x && 
           position.x <= obstacle.position.x + obstacle.size.x &&
           position.y >= obstacle.position.y && 
           position.y <= obstacle.position.y + obstacle.size.y;
  }

  private calculatePushDirection(position: Vector2, obstacle: Obstacle): Vector2 {
    const centerX = obstacle.position.x + obstacle.size.x / 2;
    const centerY = obstacle.position.y + obstacle.size.y / 2;
    
    const dx = position.x - centerX;
    const dy = position.y - centerY;
    
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude === 0) return { x: 1, y: 0 };
    
    return {
      x: (dx / magnitude) * 2,
      y: (dy / magnitude) * 2
    };
  }

  private getPlayerMaxSpeed(player: ServerPlayer): number {
    return player.stats.speed;
  }

  private getPlayerBaseDamage(player: ServerPlayer): number {
    return player.stats.damage;
  }

  private calculateDamage(baseDamage: number, stats: PlayerStats): number {
    return baseDamage * (1 + stats.armorPenetration / 100);
  }

  private getPlayersInAttackRange(gameState: ServerGameState, attacker: ServerPlayer, attackData: any): ServerPlayer[] {
    const affected: ServerPlayer[] = [];
    const range = attacker.stats.range;
    
    for (const player of gameState.players.values()) {
      if (player.id === attacker.id || !player.isAlive) continue;
      
      const distance = Math.sqrt(
        Math.pow(player.position.x - attacker.position.x, 2) +
        Math.pow(player.position.y - attacker.position.y, 2)
      );
      
      if (distance <= range) {
        affected.push(player);
      }
    }
    
    return affected;
  }

  private applyDamage(player: ServerPlayer, damage: number, attackerClass: ClassType): number {
    const effectiveArmor = player.armor;
    const damageReduction = effectiveArmor / (effectiveArmor + 100);
    const finalDamage = damage * (1 - damageReduction);
    
    player.health = Math.max(0, player.health - finalDamage);
    
    return finalDamage;
  }

  private getDamageType(classType: ClassType): string {
    switch (classType) {
      case ClassType.BERSERKER: return 'physical';
      case ClassType.MAGE: return 'ice';
      case ClassType.BOMBER: return 'fire';
      case ClassType.ARCHER: return 'piercing';
      default: return 'physical';
    }
  }

  private async processAbilityEffect(gameState: ServerGameState, player: ServerPlayer, abilityId: string, data: any): Promise<void> {
    // Placeholder for ability effects - would be expanded with actual ability implementations
    logger.debug(`Processing ability ${abilityId} for player ${player.id}`);
  }

  private recalculatePlayerStats(player: ServerPlayer): void {
    // Reset to base stats
    const classConfig = this.getClassConfig(player.classType);
    player.stats = {
      damage: classConfig.weapon.damage,
      speed: classConfig.stats.speed,
      armorPenetration: 0,
      cooldownReduction: 0,
      range: classConfig.weapon.range,
      // New stats
      stamina: classConfig.stats.stamina,
      strength: classConfig.stats.strength,
      intelligence: classConfig.stats.intelligence
    };
    
    // Apply buff effects
    for (const buff of player.buffs) {
      switch (buff.type) {
        case 'speed':
          player.stats.speed += buff.value;
          break;
        case 'damage':
          player.stats.damage += buff.value;
          break;
        case 'armor':
          player.armor += buff.value;
          break;
      }
    }
  }

  private getAbilityCooldown(abilityId: string): number {
    const cooldowns: Record<string, number> = {
      'rage': 20000,
      'whirlwind': 15000,
      'ice_shard': 3000,
      'frost_nova': 12000,
      'fire_bomb': 8000,
      'armor_burn': 18000,
      'piercing_shot': 5000,
      'rapid_fire': 10000
    };
    
    return cooldowns[abilityId] || 10000;
  }

  private getAbilityMaxCharges(abilityId: string): number {
    const charges: Record<string, number> = {
      'ice_shard': 3,
      'piercing_shot': 2,
      'fire_bomb': 2
    };
    
    return charges[abilityId] || 1;
  }

  private cleanupOldEvents(gameState: ServerGameState): void {
    const cutoffTime = Date.now() - 30000; // Keep events for 30 seconds
    gameState.events = gameState.events.filter(event => event.timestamp > cutoffTime);
  }

  /**
   * Clean up resources for a match
   */
  async cleanup(matchId: string): Promise<void> {
    try {
      await this.stopGameLoop(matchId);
      this.gameStates.delete(matchId);
      await redis.delete(`gamestate:${matchId}`);
      
      logger.info(`Game state cleaned up for match ${matchId}`);
    } catch (error) {
      logger.error('Error cleaning up game state:', error);
    }
  }
}

export const gameStateService = new GameStateService();