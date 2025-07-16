# Technical Architecture - Dueled

## System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │   Game Server   │    │    Database     │
│   (React +      │◄──►│   (Node.js +    │◄──►│   (PostgreSQL   │
│    Phaser 3)    │    │    Socket.IO)   │    │   + Redis)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Frontend Architecture

### Project Structure
```
client/
├── src/
│   ├── components/        # React UI components
│   │   ├── auth/         # Authentication components
│   │   ├── game/         # Game-specific UI
│   │   ├── lobby/        # Matchmaking and lobby
│   │   └── common/       # Shared components
│   ├── game/             # Phaser 3 game engine
│   │   ├── scenes/       # Game scenes
│   │   ├── entities/     # Game objects (players, projectiles)
│   │   ├── systems/      # Game systems (combat, physics)
│   │   └── utils/        # Game utilities
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API and WebSocket services
│   ├── store/            # State management
│   └── types/            # TypeScript definitions
├── public/               # Static assets
└── tests/               # Frontend tests
```

### Phaser 3 Game Engine Implementation

#### Scene Management
```typescript
// game/scenes/GameScene.ts
export class GameScene extends Phaser.Scene {
  private player1: Player;
  private player2: Player;
  private arena: Arena;
  private combatSystem: CombatSystem;
  private networkManager: NetworkManager;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Initialize arena
    this.arena = new Arena(this);
    
    // Create players
    this.player1 = new Player(this, 'player1');
    this.player2 = new Player(this, 'player2');
    
    // Setup combat system
    this.combatSystem = new CombatSystem(this);
    
    // Initialize networking
    this.networkManager = new NetworkManager(this);
  }

  update() {
    // Game loop logic
    this.combatSystem.update();
    this.networkManager.processMessages();
  }
}
```

#### Class System Implementation
```typescript
// game/entities/classes/BaseClass.ts
export abstract class BaseClass {
  protected health: number;
  protected armor: number;
  protected speed: number;
  protected weapon: Weapon;
  
  abstract attack(target: Vector2): void;
  abstract getSpecialAbility(): SpecialAbility;
  
  takeDamage(damage: number, damageType: DamageType): void {
    const effectiveDamage = this.calculateDamage(damage, damageType);
    this.health -= effectiveDamage;
  }
  
  private calculateDamage(baseDamage: number, damageType: DamageType): number {
    let armorReduction = this.armor;
    
    // Special damage type modifiers
    switch (damageType) {
      case DamageType.FIRE:
        armorReduction *= 0.75; // Fire bypasses 25% armor
        break;
      case DamageType.PIERCING:
        armorReduction *= 0.5; // Piercing ignores 50% armor
        break;
    }
    
    return baseDamage * (1 - armorReduction / (armorReduction + 100));
  }
}
```

#### Real-time Physics Integration
```typescript
// game/systems/PhysicsSystem.ts
export class PhysicsSystem {
  private matter: Phaser.Physics.Matter.MatterPhysics;
  private projectiles: Map<string, Projectile> = new Map();
  
  constructor(scene: Phaser.Scene) {
    this.matter = scene.matter;
    this.setupCollisionHandlers();
  }
  
  private setupCollisionHandlers(): void {
    this.matter.world.on('collisionstart', (event) => {
      event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        this.handleCollision(bodyA.gameObject, bodyB.gameObject);
      });
    });
  }
  
  private handleCollision(objA: GameObject, objB: GameObject): void {
    if (objA instanceof Projectile && objB instanceof Player) {
      this.handleProjectileHit(objA, objB);
    }
  }
}
```

### State Management
```typescript
// store/gameStore.ts
interface GameState {
  currentMatch: Match | null;
  playerStats: PlayerStats;
  matchmaking: MatchmakingState;
  gameState: 'menu' | 'queue' | 'game' | 'results';
}

export const useGameStore = create<GameState>((set, get) => ({
  currentMatch: null,
  playerStats: {},
  matchmaking: { inQueue: false, estimatedWait: 0 },
  gameState: 'menu',
  
  actions: {
    joinQueue: async (classType: ClassType) => {
      set({ gameState: 'queue' });
      await gameService.joinMatchmaking(classType);
    },
    
    updateGameState: (newState: GameState) => {
      set(newState);
    }
  }
}));
```

## Backend Architecture

### Project Structure
```
server/
├── src/
│   ├── controllers/      # API route handlers
│   ├── services/         # Business logic
│   │   ├── auth/        # Authentication service
│   │   ├── matchmaking/ # Matchmaking system
│   │   ├── game/        # Game state management
│   │   └── rating/      # ELO rating system
│   ├── models/          # Database models
│   ├── middleware/      # Express middleware
│   ├── websocket/       # Socket.IO handlers
│   ├── utils/           # Utility functions
│   └── types/           # TypeScript definitions
├── tests/               # Backend tests
└── config/             # Configuration files
```

### Real-time Communication Architecture

#### Socket.IO Implementation
```typescript
// websocket/GameHandler.ts
export class GameHandler {
  private io: Server;
  private activeMatches: Map<string, GameMatch> = new Map();
  
  constructor(io: Server) {
    this.io = io;
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    this.io.on('connection', (socket) => {
      socket.on('join_match', this.handleJoinMatch.bind(this, socket));
      socket.on('player_action', this.handlePlayerAction.bind(this, socket));
      socket.on('disconnect', this.handleDisconnect.bind(this, socket));
    });
  }
  
  private handlePlayerAction(socket: Socket, action: PlayerAction): void {
    const match = this.getMatchForPlayer(socket.id);
    if (!match) return;
    
    // Validate action server-side
    if (!this.validateAction(action, match)) {
      socket.emit('action_rejected', { reason: 'Invalid action' });
      return;
    }
    
    // Process action
    match.processAction(action);
    
    // Broadcast to all players in match
    this.io.to(match.id).emit('game_update', match.getState());
  }
}
```

#### Anti-cheat System
```typescript
// services/game/AntiCheatService.ts
export class AntiCheatService {
  private actionHistory: Map<string, ActionHistory> = new Map();
  
  validateAction(playerId: string, action: PlayerAction): boolean {
    const history = this.actionHistory.get(playerId) || new ActionHistory();
    
    // Check action rate limiting
    if (this.isActionTooFrequent(history, action)) {
      return false;
    }
    
    // Validate action physics
    if (!this.validateActionPhysics(action)) {
      return false;
    }
    
    // Check for impossible movements
    if (!this.validateMovement(history, action)) {
      return false;
    }
    
    history.addAction(action);
    this.actionHistory.set(playerId, history);
    
    return true;
  }
  
  private validateActionPhysics(action: PlayerAction): boolean {
    // Implement physics validation
    // Check if action is possible given current game state
    return true;
  }
}
```

### Database Schema

```sql
-- Players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE,
    email VARCHAR(100),
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_anonymous BOOLEAN DEFAULT FALSE
);

-- Player stats table
CREATE TABLE player_stats (
    player_id UUID PRIMARY KEY REFERENCES players(id),
    rating INTEGER DEFAULT 1000,
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    favorite_class VARCHAR(20),
    total_damage_dealt BIGINT DEFAULT 0,
    total_damage_taken BIGINT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id UUID REFERENCES players(id),
    player2_id UUID REFERENCES players(id),
    player1_class VARCHAR(20),
    player2_class VARCHAR(20),
    winner_id UUID REFERENCES players(id),
    match_duration INTEGER, -- in seconds
    arena_map VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);

-- Match events table (for replay system)
CREATE TABLE match_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id),
    player_id UUID REFERENCES players(id),
    event_type VARCHAR(50),
    event_data JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

### Matchmaking System

```typescript
// services/matchmaking/MatchmakingService.ts
export class MatchmakingService {
  private redis: Redis;
  private queueKey = 'matchmaking:queue';
  
  constructor(redis: Redis) {
    this.redis = redis;
    this.startMatchmakingLoop();
  }
  
  async addToQueue(playerId: string, classType: ClassType, rating: number): Promise<void> {
    const queueEntry = {
      playerId,
      classType,
      rating,
      timestamp: Date.now()
    };
    
    await this.redis.zadd(this.queueKey, rating, JSON.stringify(queueEntry));
  }
  
  private async startMatchmakingLoop(): void {
    setInterval(async () => {
      await this.processQueue();
    }, 1000); // Check every second
  }
  
  private async processQueue(): Promise<void> {
    const queueEntries = await this.redis.zrange(this.queueKey, 0, -1);
    
    for (let i = 0; i < queueEntries.length - 1; i++) {
      const player1 = JSON.parse(queueEntries[i]);
      const player2 = JSON.parse(queueEntries[i + 1]);
      
      if (this.isValidMatch(player1, player2)) {
        await this.createMatch(player1, player2);
        await this.removeFromQueue(player1.playerId, player2.playerId);
      }
    }
  }
  
  private isValidMatch(player1: QueueEntry, player2: QueueEntry): boolean {
    const ratingDiff = Math.abs(player1.rating - player2.rating);
    const timeDiff = Date.now() - Math.max(player1.timestamp, player2.timestamp);
    
    // Gradually increase acceptable rating difference over time
    const maxRatingDiff = 50 + (timeDiff / 1000 * 5); // +5 rating per second
    
    return ratingDiff <= maxRatingDiff;
  }
}
```

### Rating System (Glicko-2 Implementation)

```typescript
// services/rating/GlickoRatingService.ts
export class GlickoRatingService {
  private readonly SYSTEM_CONSTANT = 0.5;
  private readonly VOLATILITY_CONSTANT = 0.06;
  
  updateRatings(winner: PlayerRating, loser: PlayerRating): {
    winner: PlayerRating;
    loser: PlayerRating;
  } {
    const winnerUpdate = this.calculateNewRating(winner, loser, 1);
    const loserUpdate = this.calculateNewRating(loser, winner, 0);
    
    return {
      winner: winnerUpdate,
      loser: loserUpdate
    };
  }
  
  private calculateNewRating(
    player: PlayerRating,
    opponent: PlayerRating,
    score: number
  ): PlayerRating {
    // Convert to Glicko-2 scale
    const mu = (player.rating - 1500) / 173.7178;
    const phi = player.deviation / 173.7178;
    
    const muOpponent = (opponent.rating - 1500) / 173.7178;
    const phiOpponent = opponent.deviation / 173.7178;
    
    // Glicko-2 calculations
    const g = this.g(phiOpponent);
    const E = this.E(mu, muOpponent, phiOpponent);
    
    const variance = 1 / (g * g * E * (1 - E));
    const delta = variance * g * (score - E);
    
    // Update volatility
    const newVolatility = this.updateVolatility(
      player.volatility,
      phi,
      variance,
      delta
    );
    
    // Update rating and deviation
    const newPhi = Math.sqrt(phi * phi + newVolatility * newVolatility);
    const newPhiStar = 1 / Math.sqrt(1 / (newPhi * newPhi) + 1 / variance);
    const newMu = mu + newPhiStar * newPhiStar * g * (score - E);
    
    return {
      rating: Math.round(newMu * 173.7178 + 1500),
      deviation: Math.round(newPhiStar * 173.7178),
      volatility: newVolatility
    };
  }
  
  private g(phi: number): number {
    return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
  }
  
  private E(mu: number, muOpponent: number, phiOpponent: number): number {
    return 1 / (1 + Math.exp(-this.g(phiOpponent) * (mu - muOpponent)));
  }
}
```

## Performance Optimization

### Client-Side Optimization

#### Asset Management
```typescript
// game/utils/AssetManager.ts
export class AssetManager {
  private loadedAssets: Map<string, any> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();
  
  async loadAsset(key: string, path: string): Promise<any> {
    if (this.loadedAssets.has(key)) {
      return this.loadedAssets.get(key);
    }
    
    if (this.loadingPromises.has(key)) {
      return await this.loadingPromises.get(key);
    }
    
    const promise = this.loadAssetAsync(key, path);
    this.loadingPromises.set(key, promise);
    
    const asset = await promise;
    this.loadedAssets.set(key, asset);
    this.loadingPromises.delete(key);
    
    return asset;
  }
  
  private loadAssetAsync(key: string, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Implement asset loading logic
      // Support for images, audio, JSON data
    });
  }
}
```

#### Object Pooling
```typescript
// game/utils/ObjectPool.ts
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  
  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 10) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }
  
  acquire(): T {
    const obj = this.pool.pop() || this.createFn();
    return obj;
  }
  
  release(obj: T): void {
    this.resetFn(obj);
    this.pool.push(obj);
  }
}
```

### Server-Side Optimization

#### Connection Management
```typescript
// websocket/ConnectionManager.ts
export class ConnectionManager {
  private connections: Map<string, Socket> = new Map();
  private playerSockets: Map<string, string> = new Map();
  
  addConnection(socket: Socket, playerId: string): void {
    this.connections.set(socket.id, socket);
    this.playerSockets.set(playerId, socket.id);
    
    socket.on('disconnect', () => {
      this.removeConnection(socket.id);
    });
  }
  
  removeConnection(socketId: string): void {
    const socket = this.connections.get(socketId);
    if (socket) {
      // Find and remove player mapping
      for (const [playerId, sId] of this.playerSockets.entries()) {
        if (sId === socketId) {
          this.playerSockets.delete(playerId);
          break;
        }
      }
      
      this.connections.delete(socketId);
    }
  }
  
  getPlayerSocket(playerId: string): Socket | undefined {
    const socketId = this.playerSockets.get(playerId);
    return socketId ? this.connections.get(socketId) : undefined;
  }
}
```

## Testing Strategy

### Unit Testing Example
```typescript
// tests/game/combat.test.ts
describe('Combat System', () => {
  let combatSystem: CombatSystem;
  let berserker: BerserkerClass;
  let mage: MageClass;
  
  beforeEach(() => {
    combatSystem = new CombatSystem();
    berserker = new BerserkerClass();
    mage = new MageClass();
  });
  
  describe('Damage Calculation', () => {
    it('should calculate correct damage with armor reduction', () => {
      const baseDamage = 100;
      const armor = 50;
      const expectedDamage = baseDamage * (1 - armor / (armor + 100));
      
      const actualDamage = combatSystem.calculateDamage(baseDamage, armor);
      
      expect(actualDamage).toBeCloseTo(expectedDamage);
    });
    
    it('should apply fire damage armor bypass', () => {
      const baseDamage = 100;
      const armor = 50;
      const effectiveArmor = armor * 0.75; // 25% bypass
      const expectedDamage = baseDamage * (1 - effectiveArmor / (effectiveArmor + 100));
      
      const actualDamage = combatSystem.calculateDamage(baseDamage, armor, DamageType.FIRE);
      
      expect(actualDamage).toBeCloseTo(expectedDamage);
    });
  });
});
```

### Integration Testing
```typescript
// tests/matchmaking/integration.test.ts
describe('Matchmaking Integration', () => {
  let matchmakingService: MatchmakingService;
  let redis: Redis;
  
  beforeEach(async () => {
    redis = new Redis(process.env.REDIS_URL);
    matchmakingService = new MatchmakingService(redis);
    await redis.flushall();
  });
  
  it('should match players with similar ratings', async () => {
    const player1 = { id: '1', rating: 1000, class: 'berserker' };
    const player2 = { id: '2', rating: 1020, class: 'mage' };
    
    await matchmakingService.addToQueue(player1.id, player1.class, player1.rating);
    await matchmakingService.addToQueue(player2.id, player2.class, player2.rating);
    
    // Wait for matchmaking to process
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const match = await matchmakingService.getActiveMatch(player1.id);
    expect(match).toBeDefined();
    expect(match.players).toContain(player1.id);
    expect(match.players).toContain(player2.id);
  });
});
```

## Deployment Architecture

### Docker Configuration
```dockerfile
# Dockerfile.client
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```dockerfile
# Dockerfile.server
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Load Balancing
```yaml
# docker-compose.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - server
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
  
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    scale: 3
    depends_on:
      - redis
      - postgres
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/dueled
      - REDIS_URL=redis://redis:6379
  
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
  
  postgres:
    image: postgres:13
    environment:
      - POSTGRES_DB=dueled
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    ports:
      - "5432:5432"
```

This technical architecture provides a comprehensive foundation for implementing the Dueled game with proper separation of concerns, performance optimization, and scalability considerations. 