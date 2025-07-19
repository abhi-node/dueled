# Dueled Game Pivot Plan

## New Game Direction: Raycasting Doom-Style Multiplayer

### Overview
Pivoting from top-down 2D gameplay to a first-person raycasting engine similar to classic Doom, with real-time 1v1 multiplayer functionality.

## Technical Architecture Decisions

### Rendering Engine: Canvas 2D + Pure TypeScript

**DECISION: Canvas 2D raycasting with pure TypeScript, building on existing React/Auth infrastructure**

#### Why Canvas 2D Over Other Options:
1. **Proven Approach**: Original Doom used similar 2D projection techniques
2. **Simplicity**: No complex 3D mathematics or shader programming required
3. **Performance**: Canvas 2D is optimized and sufficient for 60fps raycasting
4. **Browser Compatibility**: Works across all modern browsers without WebGL concerns
5. **Educational Value**: Clear understanding of raycasting fundamentals
6. **Debugging**: Easier to debug 2D canvas operations vs WebGL shaders

#### Integration with Existing Infrastructure:
- **Auth System**: Leverage existing JWT authentication and user management
- **Matchmaking**: Build on SimpleMatchmaking service with ELO-based pairing
- **Database**: Use existing PostgreSQL schema for players, matches, stats
- **WebSockets**: Extend SimpleGameHandler for real-time game communication
- **React Framework**: Canvas component within existing React application structure

### Existing Infrastructure Analysis

#### Authentication System (PRESERVED)
**Components:**
- `SimpleAuth` service with JWT tokens and session management
- PostgreSQL `players` table with `player_stats` for ratings
- Auth middleware for protected routes and WebSocket authentication
- Client-side Zustand store with auth persistence
- Anonymous guest play support

**Endpoints:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login  
- `POST /api/auth/anonymous` - Guest session creation
- `GET /api/auth/me` - Profile retrieval

#### Matchmaking System (EXTENDED)
**Components:**
- `SimpleMatchmaking` service with ELO-based queue management
- Real-time WebSocket integration via `SimpleGameHandler`
- Class selection system (archer, berserker) with expansion planned
- Rating-based matching with expanding search radius over time
- Queue statistics and wait time estimation

**Flow:**
1. User selects class and joins queue via WebSocket
2. Server matches players based on ELO rating (±100-400 range)
3. Match found notification sent to both players
4. Players redirect to game with match ID and selected classes

#### Database Schema (LEVERAGED)
```sql
-- Players table with auth and profile data
players (id, username, email, password_hash, is_anonymous, created_at, last_login)

-- Player statistics and ratings
player_stats (player_id, rating, matches_played, wins, losses)

-- Match history and results  
matches (id, player1_id, player2_id, winner_id, match_duration, created_at)
```

### Raycasting Game Architecture

#### Client-Side Rendering (Canvas 2D + TypeScript)

**Core Components:**
```typescript
// Main game canvas component
GameCanvas {
  - Canvas 2D context management
  - 60fps rendering loop
  - Input event handling
  - Screen buffer management
}

// Raycasting engine
RaycastEngine {
  - DDA algorithm implementation
  - Wall distance calculations
  - Texture mapping and scaling
  - Floor/ceiling rendering
}

// Entity renderer
EntityRenderer {
  - Player sprite billboarding
  - Projectile rendering
  - Distance-based scaling
  - Z-order sorting
}

// Game state manager
GameStateManager {
  - Local player state
  - Opponent state interpolation
  - Projectile tracking
  - Map data caching
}
```

**Rendering Pipeline:**
1. **Clear canvas buffer**
2. **Cast rays for walls** (320-640 rays across screen width)
3. **Render wall strips** with texture mapping and distance scaling
4. **Render floor/ceiling** using horizontal scanline algorithm
5. **Render entities** (players, projectiles) as scaled sprites
6. **Draw UI overlay** (crosshair, health, ammo, minimap)

#### Server-Side Game Logic (Extended SimpleGameHandler)

**Game State Management:**
```typescript
// Match game state
interface MatchGameState {
  matchId: string;
  players: {
    [playerId: string]: PlayerState;
  };
  projectiles: ProjectileState[];
  mapData: MapConfiguration;
  matchStatus: 'initializing' | 'active' | 'finished';
  startTime: number;
}

// Player state (server authority)
interface PlayerState {
  id: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  weapon: WeaponType;
  ammo: number;
  classType: ClassType;
  lastInputTime: number;
}

// Projectile state
interface ProjectileState {
  id: string;
  x: number;
  y: number;
  direction: number;
  speed: number;
  damage: number;
  ownerId: string;
  spawnTime: number;
}
```

**Server Update Loop (30 TPS):**
```typescript
1. Process client input commands
2. Validate movement against map boundaries
3. Update player positions and rotations
4. Process attack commands and spawn projectiles
5. Update projectile positions and check collisions
6. Generate delta state updates
7. Broadcast updates to match participants
```

### Communication Protocol Design

#### Input Commands (Client → Server)
```typescript
// Movement input (sent every frame with input)
interface MovementInput {
  type: 'movement';
  timestamp: number;
  sequenceId: number;
  inputs: {
    forward: boolean;
    backward: boolean;
    strafeLeft: boolean;
    strafeRight: boolean;
    turnLeft: boolean;
    turnRight: boolean;
    mouseDeltaX?: number;
  };
}

// Action input (sent on key press)
interface ActionInput {
  type: 'action';
  timestamp: number;
  action: {
    attack: boolean;
    reload: boolean;
    switchWeapon: boolean;
  };
}
```

#### State Updates (Server → Client)
```typescript
// Game state delta (30 TPS)
interface GameStateDelta {
  type: 'game_state';
  timestamp: number;
  tickId: number;
  players: {
    [playerId: string]: {
      x: number;
      y: number;
      angle: number;
      health: number;
      weapon: string;
      ammo: number;
    };
  };
  projectiles: {
    [projectileId: string]: {
      x: number;
      y: number;
      direction: number;
      type: string;
    };
  };
  events: GameEvent[];
}

// Combat events (immediate)
interface GameEvent {
  type: 'projectile_spawn' | 'projectile_hit' | 'player_damage' | 'player_death';
  timestamp: number;
  data: any;
}
```

### Map Data Structure

#### Simple Grid-Based Maps
```typescript
interface MapData {
  width: number;
  height: number;
  tileSize: number;
  walls: number[][]; // 2D array: 0=empty, 1=wall, 2=wall_type2, etc.
  textures: {
    [wallType: number]: string; // texture file paths
  };
  spawnPoints: {
    player1: { x: number; y: number; angle: number };
    player2: { x: number; y: number; angle: number };
  };
}

// Example 16x16 test map
const testMap: MapData = {
  width: 16,
  height: 16,
  tileSize: 64,
  walls: [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,2,2,0,0,0,0,0,0,1],
    // ... rest of map data
  ],
  textures: {
    1: '/textures/walls/wall_stone.png',
    2: '/textures/walls/wall_wood.png'
  },
  spawnPoints: {
    player1: { x: 128, y: 128, angle: 0 },
    player2: { x: 896, y: 896, angle: Math.PI }
  }
};
```

### Performance Optimizations

#### Client-Side Optimizations
1. **Ray Count Scaling**: Adjust ray count based on screen width (320-640 rays)
2. **Distance Culling**: Skip rendering entities beyond view distance
3. **Texture Caching**: Pre-load and cache all texture assets
4. **Input Buffering**: Batch input commands to reduce network traffic
5. **Interpolation**: Smooth enemy movement between server updates
6. **Level-of-Detail**: Reduce texture detail for distant walls

#### Server-Side Optimizations  
1. **Delta Compression**: Only send changed state values
2. **Spatial Partitioning**: Only process nearby entities for collision
3. **Input Validation Caching**: Cache movement validation results
4. **Projectile Pooling**: Reuse projectile objects to reduce GC pressure
5. **Rate Limiting**: Prevent input flooding from clients

### Integration Points

#### Matchmaking to Game Handoff
```typescript
// Extended SimpleGameHandler for raycasting game
class RaycastGameHandler extends SimpleGameHandler {
  
  // Override match initialization
  protected initializeMatch(match: MatchPair): void {
    const gameState = this.createInitialGameState(match);
    this.activeGameStates.set(match.matchId, gameState);
    this.startGameLoop(match.matchId);
  }
  
  // Game-specific input processing
  protected processGameInput(socket: Socket, input: MovementInput | ActionInput): void {
    const playerId = this.getPlayerIdFromSocket(socket);
    const gameState = this.getGameStateForPlayer(playerId);
    
    if (input.type === 'movement') {
      this.processMovementInput(gameState, playerId, input);
    } else if (input.type === 'action') {
      this.processActionInput(gameState, playerId, input);
    }
  }
}
```

#### Client-Side Game Component
```typescript
// Extended MainGame component for raycasting
export function RaycastGame() {
  const { matchId, selectedClass } = useMatchData();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<RaycastEngine | null>(null);
  
  useEffect(() => {
    if (canvasRef.current && matchId) {
      // Initialize raycasting engine
      gameEngineRef.current = new RaycastEngine(canvasRef.current);
      
      // Connect to game socket
      const gameSocket = initializeGameSocket(matchId, selectedClass);
      gameEngineRef.current.setNetworkLayer(gameSocket);
      
      // Start game loop
      gameEngineRef.current.start();
    }
    
    return () => {
      gameEngineRef.current?.stop();
    };
  }, [matchId, selectedClass]);
  
  return (
    <div className="game-container">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="game-canvas"
      />
      <GameUI />
    </div>
  );
}
```

## Implementation Plan

### Phase 1: Raycasting Foundation (Week 1)
- [ ] Create basic Canvas 2D raycasting engine
- [ ] Implement DDA wall casting algorithm  
- [ ] Add texture mapping for walls
- [ ] Create simple test map with spawn points
- [ ] Implement basic player movement (local only)

### Phase 2: Multiplayer Integration (Week 2)
- [ ] Extend SimpleGameHandler for raycasting game logic
- [ ] Implement client-server input/state communication
- [ ] Add opponent rendering as billboarded sprite
- [ ] Create movement validation and anti-cheat measures
- [ ] Integrate with existing matchmaking flow

### Phase 3: Combat System (Week 3)
- [ ] Add projectile physics and rendering
- [ ] Implement hit detection and damage system
- [ ] Create weapon switching and reload mechanics
- [ ] Add health/ammo UI and game end conditions
- [ ] Balance combat for fair 1v1 gameplay

### Phase 4: Polish & Optimization (Week 4)
- [ ] Optimize rendering performance for consistent 60fps
- [ ] Add visual effects (muzzle flash, hit impacts, particles)
- [ ] Implement sound system for immersive audio
- [ ] Create additional maps and game modes
- [ ] Add spectator mode and match replay system

## Key Benefits of This Approach

1. **Leverages Existing Infrastructure**: Auth, matchmaking, database all preserved
2. **Proven Technology**: Canvas 2D raycasting is battle-tested approach
3. **Educational Value**: Learn fundamental 3D rendering concepts
4. **Performance**: 60fps achievable with proper optimization
5. **Simplicity**: No complex 3D math or shader programming required
6. **Extensibility**: Easy to add new weapons, maps, and game modes
7. **Debugging**: Canvas 2D operations are straightforward to debug 