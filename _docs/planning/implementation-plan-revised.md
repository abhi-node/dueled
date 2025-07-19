# Dueled - Revised Implementation Plan
## Server-Authoritative Raycasting Architecture

### **Architecture Overview**

This implementation follows a strict **server-authoritative** model where:
- **Server**: Game state, physics, validation, combat resolution
- **Client**: Input capture, raycasting renderer, local prediction, UI
- **Communication**: Input commands up, state deltas down

---

## **Phase 1: Server Game Engine Foundation**

### **1.1 Match Management System (Best of 5 Rounds)**

**Server Components:**
```
/server/src/game/
├── match/
│   ├── MatchManager.ts          # Match lifecycle, round progression
│   ├── RoundSystem.ts           # Round timer, scoring, win conditions
│   └── GameState.ts             # Authoritative game state container
├── physics/
│   ├── CollisionSystem.ts       # AABB collision detection, ray-wall intersections
│   ├── MovementValidator.ts     # Input validation, anti-cheat
│   └── ProjectilePhysics.ts     # Projectile trajectories, impacts
├── combat/
│   ├── CombatResolver.ts        # Damage calculation, hit detection
│   ├── WeaponSystem.ts          # Weapon stats, cooldowns, ranges
│   └── HealthSystem.ts          # Health/armor management
└── world/
    ├── MapData.ts               # Wall definitions, spawn points
    └── EntityManager.ts         # Player/projectile tracking
```

**Match Flow:**
1. **Match Created** → Initialize 5-round system
2. **Round Start** → Reset player positions/health, 60s timer
3. **Round End** → Declare winner, track score (first to 3 wins)
4. **Match End** → Final scoring, cleanup

**Data Structures:**
```typescript
interface GameState {
  matchId: string;
  currentRound: number;
  roundTimeLeft: number;
  score: { player1: number; player2: number };
  players: Map<string, PlayerState>;
  projectiles: Map<string, ProjectileState>;
  mapData: WallDefinition[];
}

interface PlayerState {
  id: string;
  x: number; y: number;           // Authoritative position
  angle: number;                  // Facing direction
  health: number; armor: number;
  weapon: WeaponType;
  lastInputTime: number;          // Anti-cheat timing
  velocity: { x: number; y: number }; // For smooth interpolation
}
```

### **1.2 Physics & Collision System**

**Movement Validation:**
- Server validates all movement inputs against max speed
- Wall collision detection using AABB/ray intersection
- Anti-teleportation checks (max distance per tick)

**Projectile Physics:**
- Server-side ballistic calculation
- Ray-casting for instant hit weapons (archer arrows)
- Collision detection with walls and players

### **1.3 Server Tick Loop (20-30 Hz)**

```typescript
class GameLoop {
  private tickRate = 30; // 30 ticks per second
  
  private gameLoop() {
    // 1. Process all pending input commands
    this.processInputQueue();
    
    // 2. Update physics (movement, projectiles)
    this.updatePhysics();
    
    // 3. Resolve combat (hits, damage)
    this.resolveCombat();
    
    // 4. Generate delta update
    const delta = this.generateDelta();
    
    // 5. Broadcast to clients
    this.broadcastDelta(delta);
  }
}
```

---

## **Phase 2: Client Raycasting Renderer**

### **2.1 Input Capture System**

**Input Commands (Client → Server):**
```typescript
interface InputCommand {
  type: 'movement' | 'look' | 'attack' | 'ability';
  timestamp: number;
  sequenceId: number;
  data: {
    // Movement: forward/back (-1 to 1), strafe (-1 to 1)
    forward?: number; strafe?: number; sprint?: boolean;
    
    // Look: delta angle change
    angleDelta?: number;
    
    // Actions: weapon/ability usage
    action?: 'primary_attack' | 'secondary_attack' | 'dash';
  };
}
```

**Input Handling:**
- WASD → Normalized movement vector (-1 to 1)
- Mouse movement → Angle delta (radians per frame)
- Clicks/keys → Action commands
- 60 FPS input capture, batched and sent at 30 Hz

### **2.2 Raycasting Renderer**

**Core Raycasting Algorithm:**
```typescript
class RaycastRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fov = Math.PI / 3; // 60 degrees
  private renderDistance = 20;
  
  render(gameState: ClientGameState) {
    this.clearScreen();
    
    // Cast rays for each screen column
    for (let x = 0; x < this.canvas.width; x++) {
      const rayAngle = this.calculateRayAngle(x);
      const hit = this.castRay(gameState.playerPos, rayAngle, gameState.walls);
      this.renderWallSlice(x, hit);
    }
    
    // Render entities (players, projectiles)
    this.renderEntities(gameState);
    
    // Render UI overlay
    this.renderHUD(gameState);
  }
}
```

**Rendering Pipeline:**
1. **Wall Rendering**: Cast rays, calculate wall heights, draw vertical slices
2. **Entity Rendering**: Transform 2D positions to screen space, draw sprites
3. **Projectile Rendering**: Linear interpolation between positions
4. **UI Rendering**: Health bars, crosshair, minimap

### **2.3 Local Prediction System**

**Client-Side Prediction:**
```typescript
class PredictionSystem {
  private pendingInputs: InputCommand[] = [];
  private serverState: GameState;
  private predictedState: GameState;
  
  // Predict movement locally for responsive feel
  predictMovement(input: InputCommand): PredictedPosition {
    // Apply movement immediately on client
    const predicted = this.simulateMovement(this.predictedState.localPlayer, input);
    
    // Store for server reconciliation
    this.pendingInputs.push(input);
    
    return predicted;
  }
  
  // Reconcile with server updates
  reconcileWithServer(serverUpdate: DeltaUpdate) {
    // Find corresponding input sequence
    const serverSequence = serverUpdate.lastProcessedInput;
    
    // Remove acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(i => i.sequenceId > serverSequence);
    
    // Re-apply remaining inputs to server state
    this.reapplyPendingInputs();
  }
}
```

---

## **Phase 3: Client-Server Communication**

### **3.1 Input Command Protocol**

**Client → Server (30 Hz):**
```json
{
  "type": "input_batch",
  "commands": [
    {
      "type": "movement",
      "timestamp": 1234567890,
      "sequenceId": 123,
      "data": { "forward": 1, "strafe": 0, "sprint": false }
    },
    {
      "type": "look", 
      "timestamp": 1234567891,
      "sequenceId": 124,
      "data": { "angleDelta": 0.05 }
    }
  ]
}
```

### **3.2 Delta Update Protocol**

**Server → Client (30 Hz):**
```json
{
  "type": "game_state_delta",
  "timestamp": 1234567892,
  "lastProcessedInput": 124,
  "players": [
    {
      "id": "player1",
      "x": 10.5, "y": 15.2,
      "angle": 1.57,
      "health": 85,
      "velocity": { "x": 0.1, "y": 0 }
    }
  ],
  "projectiles": [
    {
      "id": "arrow_123",
      "x": 12.0, "y": 16.0,
      "angle": 0.78,
      "type": "arrow",
      "timeToLive": 2.5
    }
  ],
  "combatEvents": [
    {
      "type": "hit",
      "attackerId": "player1",
      "targetId": "player2", 
      "damage": 25
    }
  ]
}
```

---

## **Phase 4: Implementation Steps**

### **Step 1: Server Foundation (Week 1)**
1. **GameState Management**: Core state container, serialization
2. **Basic Movement**: Input processing, position updates
3. **Collision System**: Wall collision detection
4. **Match System**: Round progression, scoring

### **Step 2: Client Renderer (Week 2)**
1. **Canvas Setup**: Full-screen canvas, input capture
2. **Basic Raycasting**: Wall rendering, simple textures
3. **Entity Rendering**: Player/projectile sprites
4. **Input System**: Command generation, networking

### **Step 3: Integration (Week 3)**
1. **Client-Server Protocol**: Delta updates, input commands
2. **Local Prediction**: Smooth movement, lag compensation
3. **Combat System**: Weapon firing, hit detection
4. **UI/HUD**: Health bars, crosshair, minimap

### **Step 4: Polish (Week 4)**
1. **Performance Optimization**: Render culling, efficient updates
2. **Visual Polish**: Textures, lighting, particle effects
3. **Audio Integration**: Weapon sounds, footsteps
4. **Testing & Debugging**: Multiplayer stress testing

---

## **Common Pitfalls & Design Solutions**

### **Network Synchronization**
❌ **Pitfall**: Client-server desync, rubber-banding
✅ **Solution**: 
- Server reconciliation with input sequence numbers
- Client-side prediction with rollback
- Smooth interpolation between server updates

### **Performance Issues**
❌ **Pitfall**: Poor raycasting performance, frame drops
✅ **Solution**:
- Optimize ray-casting with DDA algorithm
- Render distance limits
- Entity culling outside view frustum
- Efficient sprite rendering

### **Input Lag**
❌ **Pitfall**: Unresponsive controls, delayed feedback
✅ **Solution**:
- Immediate client-side prediction
- Input buffering and batching
- Visual feedback for actions (muzzle flash, hit markers)

### **Cheat Prevention**
❌ **Pitfall**: Speed hacking, teleportation, aim bots
✅ **Solution**:
- Server validates all movement distances
- Rate limiting on actions
- Sanity checks on mouse movement
- Server-side hit detection

### **Scalability**
❌ **Pitfall**: High server CPU usage, memory leaks
✅ **Solution**:
- Efficient data structures (spatial hashing)
- Object pooling for projectiles
- Proper cleanup of finished matches
- Delta compression for large updates

---

## **Technical Architecture Diagram**

```
┌─────────────────┐    Input Commands     ┌─────────────────┐
│     CLIENT      │ ──────────────────► │     SERVER      │
│                 │                      │                 │
│ • Input Capture │                      │ • Game State    │
│ • Raycaster     │                      │ • Physics       │
│ • Local Predict │                      │ • Combat        │
│ • UI/HUD        │                      │ • Validation    │
│                 │ ◄────────────────── │ • Match Mgmt    │
└─────────────────┘    Delta Updates     └─────────────────┘
```

This architecture ensures clean separation of concerns, prevents cheating, and provides smooth gameplay experience with proper lag compensation.

---

## **Phase 5: Game Polish & Production Features**

### **5.1 Combat System Integration**

**Projectile System Implementation:**
- Integrate projectile rendering into the raycasting renderer
- Implement projectile input handling in the InputManager
- Add projectile trajectory visualization and impact effects
- Ensure proper client-server synchronization for projectile states

**Hitbox System Integration:**
- Migrate existing server hitbox system to client rendering
- Integrate hitbox detection with current collision system
- Implement visual feedback for successful hits
- Add damage number display and hit markers

### **5.2 Enhanced Round System**

**Comprehensive Round Management:**
- Implement round end position reset instead of WebSocket closure
- Add proper score tracking and updates between rounds
- Create smooth round transition animations and UI
- Implement match-end detection and final score display
- Add countdown timers for round start/intermission periods

### **5.3 Complete UI System**

**Real-time Health & Armor Bars:**
- Connect health bar to actual player health from server
- Connect armor bar to actual player armor from server
- Add smooth bar animations for damage/healing
- Implement color-coded health states (green/yellow/red)

**Minimap Implementation:**
- Add top-down minimap view showing current map layout
- Display player positions and orientations on minimap
- Show walls, spawn points, and key map features
- Implement minimap toggle and positioning controls

### **5.4 Visual Assets & Texturing**

**Wall & Floor Texturing:**
- Replace solid color walls with actual texture assets
- Implement floor texture rendering in raycasting system
- Add texture coordinate mapping for proper wall alignment
- Create texture atlas for efficient rendering performance

**Player Sprite System:**
- Replace red circles with actual player sprite assets
- Implement directional player sprites showing facing direction
- Add weapon-specific player animations and poses
- Create class-specific visual appearance for each character type

**Weapon UI Overlay:**
- Add weapon display overlay showing equipped weapon (gun/bow/etc.)
- Implement weapon-specific crosshair designs
- Add ammunition counter and weapon cooldown indicators
- Create weapon switching animations and effects

### **5.5 Match Lifecycle & Cleanup**

**Proper WebSocket Management:**
- Implement graceful WebSocket closure after all rounds finish
- Add automatic return to lobby after match completion
- Handle disconnect/reconnect scenarios during matches
- Implement timeout handling for inactive players

**ELO Rating System:**
- Calculate and update player ELO scores based on match results
- Store ELO changes in database after match completion
- Display ELO gain/loss to players after matches
- Implement ELO-based matchmaking improvements

### **5.6 Leaderboard System**

**Simple Leaderboard Implementation:**
- Create leaderboard UI showing top players by ELO rating
- Add personal ranking display for current player
- Implement leaderboard refresh and real-time updates
- Add filtering options (daily/weekly/all-time rankings)
- Display additional stats (wins/losses, K/D ratio, etc.)

### **5.7 Implementation Priority Order**

**High Priority (Core Gameplay):**
1. Enhanced round system with proper position reset
2. Real-time health & armor bar connections
3. Projectile system integration
4. Hitbox system integration

**Medium Priority (Polish):**
5. Player sprite system replacing circles
6. Weapon UI overlay implementation
7. Minimap implementation
8. Basic wall texturing

**Low Priority (Progression):**
9. Match lifecycle cleanup and ELO updates
10. Simple leaderboard system
11. Advanced texturing and visual effects

This phase transforms the current functional game into a polished, production-ready multiplayer experience with proper visual assets, comprehensive UI, and player progression systems.