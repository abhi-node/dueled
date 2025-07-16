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
  projectiles: Map<string, ServerProjectile>; // Add projectile tracking
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
  projectiles?: Partial<ServerProjectile>[];
  events: GameEvent[];
  worldState?: any;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  correctedValue?: any;
}

export interface ServerProjectile {
  id: string;
  type: 'arrow' | 'ice_shard' | 'fire_bomb' | 'magic_missile';
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  speed: number;
  damage: number;
  range: number;
  distanceTraveled: number;
  size: { width: number; height: number };
  piercing: boolean;
  homing: boolean;
  targetId?: string;
  armorPenetration: number;
  isActive: boolean;
  createdAt: number;
  lastUpdate: number;
}

export interface ProjectileHit {
  projectileId: string;
  targetId: string;
  damage: number;
  finalDamage: number;
  armorReduction: number;
  effects: string[];
  position: Vector2;
  isKilled: boolean;
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
        ]),
        projectiles: new Map()
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
      logger.info(`🚀 Attempting to start game loop for match ${matchId}`);
      
      // Check if game loop is already running
      if (this.gameLoops.has(matchId)) {
        logger.warn(`⚠️ Game loop already running for match ${matchId}`);
        return true; // Already running is considered success
      }
      
      const gameState = await this.getGameState(matchId);
      if (!gameState) {
        logger.error(`Cannot start game loop: Game state not found for match ${matchId}`);
        return false;
      }
      
      logger.info(`📊 Game state status before start: ${gameState.status}`);
      
      // Update status to in progress
      gameState.status = MatchStatus.IN_PROGRESS;
      await this.updateGameState(matchId, gameState);
      
      logger.info(`✅ Game state status updated to: ${gameState.status}`);
      
      // Start fixed timestep game loop
      const gameLoop = setInterval(() => {
        this.processGameTick(matchId).catch(error => {
          logger.error(`Game loop error for match ${matchId}:`, error);
        });
      }, this.TICK_INTERVAL);
      
      this.gameLoops.set(matchId, gameLoop);
      
      logger.info(`🎮 Game loop started for match ${matchId} at ${this.TICK_RATE} TPS (tick every ${this.TICK_INTERVAL}ms)`);
      
      // Do an immediate tick to test
      this.processGameTick(matchId).catch(error => {
        logger.error(`Initial game tick error for match ${matchId}:`, error);
      });
      
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
        logger.warn(`⏸️ Skipping tick for match ${matchId}: status=${gameState?.status}`);
        return;
      }
      
      const now = Date.now();
      const deltaTime = now - gameState.lastUpdate;
      
      // Log tick info periodically
      if (Math.floor(gameState.gameTime / 1000) % 5 === 0 && deltaTime < 100) {
        logger.debug(`🎮 Game tick ${Math.floor(gameState.gameTime / this.TICK_INTERVAL)} for match ${matchId}`);
      }
      
      // Process player inputs
      await this.processPlayerInputs(gameState, deltaTime);
      
      // Update projectile physics and collisions
      this.updateProjectiles(gameState, deltaTime);
      
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
    let totalInputsProcessed = 0;
    
    for (const [playerId, inputs] of gameState.playerInputs) {
      const player = gameState.players.get(playerId);
      if (!player || !player.isAlive) continue;
      
      // Process unprocessed inputs
      const unprocessedInputs = inputs.filter(input => !input.processed);
      
      if (unprocessedInputs.length > 0) {
        logger.info(`📥 Processing ${unprocessedInputs.length} inputs for player ${playerId}`);
      }
      
      const inputsToProcess = unprocessedInputs.slice(0, this.MAX_EVENTS_PER_TICK);
      
      for (const input of inputsToProcess) {
        await this.processPlayerInput(gameState, player, input, deltaTime);
        input.processed = true;
        totalInputsProcessed++;
      }
      
      // Remove processed inputs (keep recent ones for validation)
      const cutoffTime = Date.now() - this.INTERPOLATION_BUFFER;
      gameState.playerInputs.set(playerId, inputs.filter(input => input.timestamp > cutoffTime));
    }
    
    if (totalInputsProcessed > 0) {
      logger.info(`✅ Processed ${totalInputsProcessed} total player inputs this tick`);
    }
  }

  /**
   * Process a single player input
   */
  private async processPlayerInput(gameState: ServerGameState, player: ServerPlayer, input: PlayerInput, deltaTime: number): Promise<void> {
    const action = input.action;
    
    logger.info(`🎮 Processing ${action.type} action for player ${player.id}`);
    
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
        logger.info(`⚔️ Processing ATTACK action for player ${player.id}`);
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
    const { direction, attackType, targetPosition } = attackData;
    
    logger.info(`⚔️ Processing ${attackType || 'basic'} attack from player ${player.id} (${player.classType})`);
    
    // Check if this is a projectile-based attack
    if (this.isProjectileClass(player.classType)) {
      logger.info(`🏹 Player ${player.id} is projectile class, processing projectile attack`);
      await this.processProjectileAttack(gameState, player, attackData);
    } else {
      // Handle melee/instant attacks for other classes
      logger.info(`🗡️ Player ${player.id} is melee class, processing melee attack`);
      await this.processMeleeAttack(gameState, player, attackData);
    }
  }

  /**
   * Process projectile-based attack (Archer, Mage with projectiles)
   */
  private async processProjectileAttack(gameState: ServerGameState, player: ServerPlayer, attackData: any): Promise<void> {
    const { direction, attackType, targetPosition } = attackData;
    
    // Calculate direction vector
    let attackDirection = direction;
    if (targetPosition) {
      const dx = targetPosition.x - player.position.x;
      const dy = targetPosition.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        attackDirection = { x: dx / distance, y: dy / distance };
      }
    }
    
    // Determine projectile type based on class
    let projectileType = 'arrow';
    if (player.classType === ClassType.ARCHER) {
      projectileType = 'arrow';
    } else if (player.classType === ClassType.MAGE) {
      projectileType = 'magic_missile';
    }
    
    // Create projectile
    const projectile = this.createProjectile(gameState, {
      type: projectileType,
      ownerId: player.id,
      position: player.position,
      direction: attackDirection,
      classType: player.classType,
      attackType: attackType || 'basic'
    });
    
    if (projectile) {
      logger.debug(`Player ${player.id} (${player.classType}) fired ${projectileType} projectile`);
    }
  }

  /**
   * Process melee/instant attack (Berserker, Bomber)
   */
  private async processMeleeAttack(gameState: ServerGameState, player: ServerPlayer, attackData: any): Promise<void> {
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
   * Check if class uses projectile-based attacks
   */
  private isProjectileClass(classType: ClassType): boolean {
    const result = classType === ClassType.ARCHER || classType === ClassType.MAGE;
    logger.debug(`🔍 isProjectileClass check: ${classType} -> ${result}`);
    return result;
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
    
    // Include all active projectiles for synchronization
    const allProjectiles = Array.from(gameState.projectiles.values());
    const activeProjectiles = allProjectiles.filter(projectile => projectile.isActive);
    
    if (allProjectiles.length > 0) {
      logger.info(`📊 Projectiles in game state: ${allProjectiles.length} total, ${activeProjectiles.length} active`);
    }
    
    const projectileUpdates = activeProjectiles.map(projectile => ({
      id: projectile.id,
      type: projectile.type,
      ownerId: projectile.ownerId,
      position: projectile.position,
      velocity: projectile.velocity,
      rotation: projectile.rotation,
      damage: projectile.damage,
      piercing: projectile.piercing,
      homing: projectile.homing,
      targetId: projectile.targetId
    }));
    
    // Get new events since last update
    const newEvents = gameState.events.filter(event => 
      event.timestamp > gameState.lastUpdate - this.TICK_INTERVAL
    );
    
    const update = {
      matchId: gameState.matchId,
      tick,
      timestamp: Date.now(),
      players: playerUpdates,
      projectiles: projectileUpdates,
      events: newEvents
    };
    
    if (projectileUpdates.length > 0) {
      logger.info(`📤 Including ${projectileUpdates.length} projectiles in game update for match ${gameState.matchId}`);
    }
    
    return update;
  }

  /**
   * Broadcast game update to all players
   */
  private async broadcastGameUpdate(matchId: string, gameUpdate: GameUpdate): Promise<void> {
    try {
      // Log projectile count for debugging
      if (gameUpdate.projectiles && gameUpdate.projectiles.length > 0) {
        logger.info(`📡 Broadcasting game update for match ${matchId} with ${gameUpdate.projectiles.length} projectiles`);
      }
      
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
      logger.info(`➕ Adding ${action.type} input for player ${playerId} in match ${matchId}`);
      
      const gameState = await this.getGameState(matchId);
      if (!gameState) {
        logger.error(`❌ Cannot add input: Game state not found for match ${matchId}`);
        return false;
      }
      
      logger.info(`📊 Game state status: ${gameState.status}, Players: ${gameState.players.size}, Projectiles: ${gameState.projectiles.size}`);
      
      const input: PlayerInput = {
        playerId,
        action,
        timestamp: Date.now(),
        processed: false
      };
      
      const playerInputs = gameState.playerInputs.get(playerId) || [];
      playerInputs.push(input);
      gameState.playerInputs.set(playerId, playerInputs);
      
      logger.info(`✅ Input added. Player ${playerId} now has ${playerInputs.length} inputs queued`);
      
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
      // Always check memory cache first
      const memoryState = this.gameStates.get(matchId);
      if (memoryState) {
        logger.debug(`🧠 Using in-memory game state for ${matchId} - Projectiles: ${memoryState.projectiles.size}`);
        return memoryState;
      }
      
      logger.warn(`⚠️ Game state not in memory for ${matchId}, checking Redis cache...`);
      
      // Check Redis cache only if not in memory
      const cachedState = await redis.get(`gamestate:${matchId}`);
      if (cachedState) {
        const gameState = this.deserializeGameState(JSON.parse(cachedState));
        // Put it back in memory
        this.gameStates.set(matchId, gameState);
        logger.info(`📥 Restored game state from cache for ${matchId} - Projectiles: ${gameState.projectiles.size}`);
        return gameState;
      }
      
      logger.error(`❌ Game state not found anywhere for match ${matchId}`);
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
      // Ensure we're updating the in-memory reference
      this.gameStates.set(matchId, gameState);
      
      // Also update cache
      await this.cacheGameState(matchId, gameState);
      
      logger.debug(`📝 Updated game state for match ${matchId} - Projectiles: ${gameState.projectiles.size}`);
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
      playerInputs: Array.from(gameState.playerInputs.entries()),
      projectiles: Array.from(gameState.projectiles.entries()),
      events: gameState.events.slice(-100) // Keep only last 100 events
    };
  }

  /**
   * Deserialize game state from storage
   */
  private deserializeGameState(serializedState: any): ServerGameState {
    return {
      ...serializedState,
      players: new Map(serializedState.players || []),
      playerInputs: new Map(serializedState.playerInputs || []),
      projectiles: new Map(serializedState.projectiles || [])
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

  /**
   * Create projectile on server (called from attack processing)
   */
  public createProjectile(gameState: ServerGameState, projectileData: {
    type: string;
    ownerId: string;
    position: Vector2;
    direction: Vector2;
    classType: ClassType;
    attackType: 'basic' | 'special';
  }): ServerProjectile | null {
    const owner = gameState.players.get(projectileData.ownerId);
    if (!owner || !owner.isAlive) return null;

    const classConfig = this.getClassConfig(projectileData.classType);
    const weapon = classConfig.weapon;
    
    // Generate unique projectile ID
    const projectileId = `${projectileData.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate projectile properties based on class and attack type
    const isSpecial = projectileData.attackType === 'special';
    const damageMultiplier = isSpecial ? 1.2 : 1.0; // Special attacks do 20% more damage
    const speedMultiplier = isSpecial ? 0.9 : 1.0; // Special attacks are slightly slower
    const rangeMultiplier = isSpecial ? 1.5 : 1.0; // Special attacks have longer range
    
    const baseDamage = calculateEffectiveDamage(weapon.damage * damageMultiplier, owner.stats.strength);
    const projectileSpeed = isSpecial ? 120 : 150; // Slowed down for debugging - match client speeds
    
    // Create projectile on server
    const projectile: ServerProjectile = {
      id: projectileId,
      type: projectileData.type as 'arrow' | 'ice_shard' | 'fire_bomb' | 'magic_missile',
      ownerId: projectileData.ownerId,
      position: {
        x: projectileData.position.x + projectileData.direction.x * 20, // Start projectile slightly away from owner
        y: projectileData.position.y + projectileData.direction.y * 20
      },
      velocity: {
        x: projectileData.direction.x * projectileSpeed,
        y: projectileData.direction.y * projectileSpeed
      },
      rotation: Math.atan2(projectileData.direction.y, projectileData.direction.x),
      damage: baseDamage,
      speed: projectileSpeed,
      range: weapon.range * rangeMultiplier * 32, // Convert tiles to pixels
      distanceTraveled: 0,
      size: { width: 24, height: 6 }, // Standard arrow size
      piercing: projectileData.type === 'arrow', // Arrows pierce
      homing: isSpecial && projectileData.classType === ClassType.ARCHER,
      targetId: undefined, // Will be set for homing projectiles
      armorPenetration: projectileData.classType === ClassType.ARCHER ? 50 : 0,
      isActive: true,
      createdAt: Date.now(),
      lastUpdate: Date.now()
    };
    
    // For homing projectiles, find nearest enemy
    if (projectile.homing) {
      const nearestEnemy = this.findNearestPlayer(gameState, projectileData.ownerId, projectileData.position);
      if (nearestEnemy) {
        projectile.targetId = nearestEnemy.id;
      }
    }
    
    // Add projectile to game state
    gameState.projectiles.set(projectileId, projectile);
    
    // Verify it was added
    const wasAdded = gameState.projectiles.has(projectileId);
    logger.info(`🎯 Projectile ${projectileId} ${wasAdded ? 'successfully added' : 'FAILED to add'} to game state. Total projectiles: ${gameState.projectiles.size}`);
    
    // Create projectile creation event
    const createEvent: GameEvent = {
      id: `projectile_created_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'projectile_created',
      playerId: projectileData.ownerId,
      data: {
        projectileId: projectileId,
        type: projectileData.type,
        position: projectile.position,
        velocity: projectile.velocity,
        damage: projectile.damage
      },
      timestamp: Date.now(),
      processed: false
    };
    gameState.events.push(createEvent);
    
    logger.info(`🏹 Created ${projectileData.type} projectile ${projectileId} for ${projectileData.ownerId} at (${projectile.position.x.toFixed(1)}, ${projectile.position.y.toFixed(1)}) with velocity (${projectile.velocity.x.toFixed(1)}, ${projectile.velocity.y.toFixed(1)})`);
    
    return projectile;
  }

  /**
   * Update all projectiles - physics and collision detection
   */
  private updateProjectiles(gameState: ServerGameState, deltaTime: number): void {
    const deltaSeconds = deltaTime / 1000;
    const projectilesToRemove: string[] = [];
    const hits: ProjectileHit[] = [];
    
    // Create target map for homing projectiles
    const targetMap = new Map<string, Vector2>();
    for (const [playerId, player] of gameState.players) {
      if (player.isAlive) {
        targetMap.set(playerId, player.position);
      }
    }
    
    // Log if we have projectiles to update
    if (gameState.projectiles.size > 0) {
      logger.info(`🎯 Updating ${gameState.projectiles.size} projectiles, deltaTime: ${deltaTime}ms`);
    }
    
    for (const [projectileId, projectile] of gameState.projectiles) {
      if (!projectile.isActive) {
        projectilesToRemove.push(projectileId);
        continue;
      }
      
      // Log projectile state before update
      const beforePos = { x: projectile.position.x, y: projectile.position.y };
      
      // Update position based on velocity
      projectile.position.x += projectile.velocity.x * deltaSeconds;
      projectile.position.y += projectile.velocity.y * deltaSeconds;
      projectile.lastUpdate = Date.now();
      
      // Update distance traveled
      const distanceMoved = Math.sqrt(
        Math.pow(projectile.velocity.x * deltaSeconds, 2) + 
        Math.pow(projectile.velocity.y * deltaSeconds, 2)
      );
      projectile.distanceTraveled += distanceMoved;
      
      logger.debug(`📍 Projectile ${projectileId} moved from (${beforePos.x.toFixed(1)}, ${beforePos.y.toFixed(1)}) to (${projectile.position.x.toFixed(1)}, ${projectile.position.y.toFixed(1)}), distance: ${distanceMoved.toFixed(1)}`);
      
      // Update homing behavior
      if (projectile.homing && projectile.targetId) {
        this.updateProjectileHoming(projectile, targetMap, deltaSeconds);
      }
      
      // Update position
      const moveDistance = projectile.speed * deltaSeconds;
      const newPosition = {
        x: projectile.position.x + projectile.velocity.x * moveDistance,
        y: projectile.position.y + projectile.velocity.y * moveDistance
      };
      
      // Check arena bounds
      if (this.isProjectileOutOfBounds(newPosition, gameState.arena)) {
        projectilesToRemove.push(projectileId);
        continue;
      }
      
      // Check wall collisions
      if (this.checkProjectileWallCollision(newPosition, gameState.arena)) {
        projectilesToRemove.push(projectileId);
        continue;
      }
      
      // Update projectile state
      projectile.position = newPosition;
      projectile.distanceTraveled += moveDistance;
      projectile.rotation = Math.atan2(projectile.velocity.y, projectile.velocity.x);
      projectile.lastUpdate = Date.now();
      
      // Check range limit
      if (projectile.distanceTraveled >= projectile.range) {
        projectilesToRemove.push(projectileId);
        continue;
      }
      
      // Check player collisions
      for (const [playerId, player] of gameState.players) {
        // Skip owner and dead players
        if (playerId === projectile.ownerId || !player.isAlive) continue;
        
        if (this.checkProjectilePlayerCollision(projectile, player)) {
          // Calculate damage
          const hit = this.calculateProjectileDamage(projectile, player);
          hits.push(hit);
          
          // Apply damage
          player.health -= hit.finalDamage;
          player.isAlive = player.health > 0;
          
          // Remove projectile unless it's piercing and target survived
          if (!projectile.piercing || !player.isAlive) {
            projectilesToRemove.push(projectileId);
          }
          
          logger.debug(`Projectile ${projectileId} hit player ${playerId} for ${hit.finalDamage} damage`);
          break; // Only hit one target per update
        }
      }
    }
    
    // Remove inactive/expired projectiles
    for (const projectileId of projectilesToRemove) {
      const projectile = gameState.projectiles.get(projectileId);
      if (projectile) {
        // Create projectile destroyed event
        const destroyEvent: GameEvent = {
          id: `projectile_destroyed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'projectile_destroyed',
          playerId: projectile.ownerId,
          data: {
            projectileId: projectileId,
            position: projectile.position
          },
          timestamp: Date.now(),
          processed: false
        };
        gameState.events.push(destroyEvent);
      }
      gameState.projectiles.delete(projectileId);
    }
    
    // Process hits
    for (const hit of hits) {
      const hitEvent: GameEvent = {
        id: `projectile_hit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'projectile_hit',
        playerId: hit.targetId,
        data: hit,
        timestamp: Date.now(),
        processed: false
      };
      gameState.events.push(hitEvent);
      
      // Check if target died
      const target = gameState.players.get(hit.targetId);
      if (target && !target.isAlive) {
        const deathEvent: GameEvent = {
          id: `death_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'player_death',
          playerId: hit.targetId,
          data: {
            killerId: gameState.projectiles.get(hit.projectileId)?.ownerId,
            position: target.position,
            cause: 'projectile'
          },
          timestamp: Date.now(),
          processed: false
        };
        gameState.events.push(deathEvent);
      }
    }
  }

  /**
   * Update homing projectile behavior
   */
  private updateProjectileHoming(projectile: ServerProjectile, targetMap: Map<string, Vector2>, deltaSeconds: number): void {
    if (!projectile.targetId) return;
    
    const targetPosition = targetMap.get(projectile.targetId);
    if (!targetPosition) return;
    
    // Calculate direction to target
    const dx = targetPosition.x - projectile.position.x;
    const dy = targetPosition.y - projectile.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Calculate new velocity with homing behavior
      const targetDirection = { x: dx / distance, y: dy / distance };
      const homingStrength = 2.0; // How strong the homing effect is
      const currentVel = projectile.velocity;
      
      // Blend current velocity with target direction
      projectile.velocity.x = currentVel.x + (targetDirection.x - currentVel.x) * homingStrength * deltaSeconds;
      projectile.velocity.y = currentVel.y + (targetDirection.y - currentVel.y) * homingStrength * deltaSeconds;
      
      // Normalize velocity
      const velMagnitude = Math.sqrt(projectile.velocity.x * projectile.velocity.x + projectile.velocity.y * projectile.velocity.y);
      if (velMagnitude > 0) {
        projectile.velocity.x /= velMagnitude;
        projectile.velocity.y /= velMagnitude;
      }
    }
  }

  /**
   * Check if projectile is out of arena bounds
   */
  private isProjectileOutOfBounds(position: Vector2, arena: Arena): boolean {
    return position.x < 0 || position.x > arena.width || 
           position.y < 0 || position.y > arena.height;
  }

  /**
   * Check projectile collision with walls
   */
  private checkProjectileWallCollision(position: Vector2, arena: Arena): boolean {
    // Simple wall collision - check against arena obstacles
    for (const obstacle of arena.obstacles) {
      if (position.x >= obstacle.position.x && 
          position.x <= obstacle.position.x + obstacle.size.x &&
          position.y >= obstacle.position.y && 
          position.y <= obstacle.position.y + obstacle.size.y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check projectile collision with player
   */
  private checkProjectilePlayerCollision(projectile: ServerProjectile, player: ServerPlayer): boolean {
    const dx = projectile.position.x - player.position.x;
    const dy = projectile.position.y - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const playerRadius = 16; // Standard player hitbox radius
    const projectileRadius = Math.max(projectile.size.width, projectile.size.height) / 2;
    
    return distance <= (playerRadius + projectileRadius);
  }

  /**
   * Calculate projectile damage with armor penetration
   */
  private calculateProjectileDamage(projectile: ServerProjectile, target: ServerPlayer): ProjectileHit {
    const baseDamage = projectile.damage;
    
    // Calculate armor after penetration
    let effectiveArmor = target.armor;
    if (projectile.armorPenetration > 0) {
      effectiveArmor = target.armor * (1 - projectile.armorPenetration / 100);
    }
    
    // Apply armor reduction formula
    const armorReduction = effectiveArmor / (effectiveArmor + 100);
    const finalDamage = Math.max(1, Math.round(baseDamage * (1 - armorReduction)));
    
    const effects: string[] = [];
    if (projectile.piercing) effects.push('piercing');
    if (projectile.homing) effects.push('homing');
    
    return {
      projectileId: projectile.id,
      targetId: target.id,
      damage: baseDamage,
      finalDamage: finalDamage,
      armorReduction: armorReduction,
      effects: effects,
      position: { ...projectile.position },
      isKilled: target.health - finalDamage <= 0
    };
  }

  /**
   * Find nearest target for homing projectiles
   */
  private findNearestTarget(gameState: ServerGameState, attacker: ServerPlayer): string | undefined {
    let nearestDistance = Infinity;
    let nearestTarget: string | undefined;
    
    for (const [playerId, player] of gameState.players) {
      if (playerId === attacker.id || !player.isAlive) continue;
      
      const dx = player.position.x - attacker.position.x;
      const dy = player.position.y - attacker.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTarget = playerId;
      }
    }
    
    return nearestTarget;
  }

  private findNearestPlayer(gameState: ServerGameState, ownerId: string, position: Vector2): ServerPlayer | undefined {
    let nearestDistance = Infinity;
    let nearestPlayer: ServerPlayer | undefined;

    for (const [playerId, player] of gameState.players) {
      if (playerId === ownerId || !player.isAlive) continue;

      const dx = player.position.x - position.x;
      const dy = player.position.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlayer = player;
      }
    }

    return nearestPlayer;
  }

  /**
   * Get game state status for debugging
   */
  async getGameStateStatus(matchId: string): Promise<any> {
    const gameState = await this.getGameState(matchId);
    if (!gameState) {
      return { error: 'Game state not found' };
    }
    
    const gameLoop = this.gameLoops.get(matchId);
    
    return {
      matchId,
      status: gameState.status,
      gameTime: gameState.gameTime,
      tickRate: gameState.tickRate,
      players: gameState.players.size,
      projectiles: gameState.projectiles.size,
      events: gameState.events.length,
      gameLoopRunning: !!gameLoop,
      playerInputs: Array.from(gameState.playerInputs.entries()).map(([playerId, inputs]) => ({
        playerId,
        pendingInputs: inputs.filter(i => !i.processed).length,
        totalInputs: inputs.length
      }))
    };
  }
}

export const gameStateService = new GameStateService();