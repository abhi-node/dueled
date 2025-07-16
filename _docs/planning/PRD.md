# Dueled - 1v1 Combat Simulator
## Product Requirements Document

### Executive Summary

Dueled is a web-based, real-time 1v1 combat simulator featuring class-based gameplay with unique weapons and abilities. Players engage in arena-style duels with a Doom-inspired aesthetic, utilizing a modern web tech stack for accessibility and performance. The game features a matchmaking system, rating system, and balanced class mechanics to create competitive and engaging gameplay.

### Technology Stack

#### Frontend
- **React 18+** - Modern component-based UI framework
- **Phaser 3** - Lightweight 2D game engine for web
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Vite** - Fast build tool and development server

#### Backend
- **Node.js + Express** - TypeScript backend server
- **Socket.IO** - Real-time bidirectional communication
- **PostgreSQL** - Player data and match history
- **Redis** - Session management and matchmaking queue
- **JWT** - Authentication tokens

#### Testing & Development
- **Jest** - Unit and integration testing
- **Playwright** - End-to-end testing
- **ESLint + Prettier** - Code quality and formatting
- **Docker** - Containerization for deployment

### Core Features

#### 1. User Authentication & Profile System
- **Anonymous play** - Quick start without registration
- **Account creation** - Optional registration for persistent stats
- **Profile management** - Player statistics and match history
- **Rating system** - Glicko-2 ELO implementation

#### 2. Class System & Stat System

##### Core Stat System
Each class has six primary stats that determine their capabilities:

- **Health**: Maximum health points - survivability measure
- **Defense**: Damage reduction (armor) - uses formula: `finalDamage = baseDamage * (1 - defense / (defense + 100))`
- **Speed**: Base movement speed for general movement
- **Stamina**: Determines dash cooldown reduction (Q/E dash abilities)
- **Strength**: Base damage multiplier for all attacks
- **Intelligence**: Special ability cooldown reduction

##### Movement & Control System
- **WASD Movement**: Standard four-directional movement
- **Q Key - Left Dash**: Quick dash to the left with distance based on stamina
- **E Key - Right Dash**: Quick dash to the right with distance based on stamina
- **Dash Mechanics**: Base 3-second cooldown, reduced by stamina stat (1% per stamina point, max 70% reduction)

##### Berserker Class
- **Role**: Tank/Melee DPS - High survivability with devastating close-range attacks
- **Primary Weapon**: Two-Handed Greatsword
- **Attack Type**: Melee AOE slash (120° arc)
- **Stats**: Health 150, Defense 50, Speed 85, Stamina 60, Strength 90, Intelligence 40
- **Weapon Damage**: 85 base damage, 2.5 tile range, 0.67 attacks/sec (1.5s cooldown)
- **Special Ability**: **Rage Mode** - Rechargeable ability providing 20% damage boost for 10 seconds (25s base cooldown)
- **Inherent Abilities**: None

##### Mage Class
- **Role**: Ranged Support/Control - Medium survivability with crowd control and area denial
- **Primary Weapon**: Frost Staff
- **Attack Type**: Ice projectiles with inherent frost effect
- **Stats**: Health 100, Defense 30, Speed 95, Stamina 80, Strength 70, Intelligence 90
- **Weapon Damage**: 65 base damage, 9 tile range, 1.0 attacks/sec (1.0s cooldown)
- **Projectile Speed**: 300 pixels/second - moderate speed with tracking capability
- **Special Ability**: **Ice Age** - Map-wide frost effect slowing all enemies by 20% for 6 seconds (30s base cooldown)
- **Inherent Abilities**: Ice projectiles slow enemies by 30% for 2 seconds on hit

##### Bomber Class
- **Role**: Area Denial/Burst DPS - Explosive specialist with armor-piercing capabilities
- **Primary Weapon**: Incendiary Grenades
- **Attack Type**: Thrown explosives with AOE damage
- **Stats**: Health 120, Defense 40, Speed 88, Stamina 70, Strength 85, Intelligence 65
- **Weapon Damage**: 75 direct damage, 50 AOE damage, 6 tile range, 3-tile explosion radius, 0.83 attacks/sec (1.2s cooldown)
- **Projectile Speed**: 200 pixels/second - slower arcing grenades with gravity effect
- **Special Ability**: **Enhanced Explosives** - Next 3 bombs have 30% increased damage and larger radius for 15 seconds (35s base cooldown)
- **Inherent Abilities**: **Armor Burn** - AOE fire damage bypasses 25% of target armor

##### Archer Class
- **Role**: Precision DPS/Sniper - High mobility with long-range precision attacks
- **Primary Weapon**: Elven Longbow
- **Attack Type**: High-velocity piercing projectiles
- **Stats**: Health 80, Defense 20, Speed 105, Stamina 95, Strength 80, Intelligence 75
- **Weapon Damage**: 80 base damage, 13 tile range, 1.25 attacks/sec (0.8s cooldown)
- **Projectile Speed**: 400 pixels/second - fast but visible projectiles with high precision
- **Special Ability**: **Dispatcher** - Fire a homing arrow that tracks nearest enemy for 120% normal damage (20s base cooldown)
- **Inherent Abilities**: **Piercing Shot** - All arrows naturally ignore 50% of target armor

#### 3. Combat System
- **Real-time physics** - Phaser 3 physics engine
- **Collision detection** - Precise hitboxes for weapons and projectiles
- **Damage calculation** - Enhanced armor reduction with strength scaling:
  - Base formula: `finalDamage = baseDamage * (1 - defense / (defense + 100))`
  - Strength modifier: `effectiveDamage = baseDamage * (1 + strength * 0.008)`
  - Special damage types bypass armor differently (piercing 50%, armor burn 25%)
- **Status effects** - Frost slow, rage boost, armor burn, etc.
- **Environmental interactions** - Destructible/interactive map elements

##### Advanced Stat Calculations
- **Dash Cooldown**: `3.0 * (1 - stamina * 0.01)` seconds (max 70% reduction)
- **Special Ability Cooldown**: `baseCooldown * (1 - intelligence * 0.005)` seconds (max 50% reduction)
- **Effective Damage**: `weaponDamage * (1 + strength * 0.008)`
- **Movement Speed**: Base speed from class configuration
- **Armor Reduction**: `damage * (1 - defense / (defense + 100))`

#### 4. Matchmaking System
- **Quick match** - Automatic pairing based on rating
- **Custom lobby** - Create/join specific matches
- **Rating brackets** - Balanced matches within skill ranges
- **Queue management** - Redis-based matchmaking queue
- **Reconnection handling** - Rejoin active matches

#### 5. Arena System
- **Map pool** - 5-8 unique arena layouts
- **Obstacle variety** - Walls, pillars, destructible barriers
- **Spawn points** - Balanced starting positions
- **Map rotation** - Automatic or player choice

### API Endpoints

#### Authentication
```
POST /api/auth/login          - Player login
POST /api/auth/register       - Account creation
POST /api/auth/anonymous      - Anonymous session
DELETE /api/auth/logout       - Session termination
```

#### Player Management
```
GET /api/player/profile       - Get player profile
PUT /api/player/profile       - Update player settings
GET /api/player/stats         - Retrieve player statistics
GET /api/player/matches       - Match history
```

#### Matchmaking
```
POST /api/matchmaking/queue   - Join matchmaking queue
DELETE /api/matchmaking/queue - Leave queue
GET /api/matchmaking/status   - Queue status
POST /api/lobby/create        - Create custom lobby
POST /api/lobby/join/:id      - Join specific lobby
```

#### Game Management
```
GET /api/game/active          - Get active match data
POST /api/game/action         - Submit game action
GET /api/game/state           - Current game state
POST /api/game/surrender      - Forfeit match
```

#### Real-time Events (Socket.IO)
```
match_found       - Matchmaking successful
game_start        - Match initialization
player_action     - Real-time game actions
game_update       - State synchronization
match_end         - Game conclusion
player_disconnect - Handle disconnections
```

### Technical Requirements

#### Performance Targets
- **Latency**: <100ms server response time
- **Frame Rate**: 60 FPS consistent gameplay
- **Load Time**: <3 seconds initial load
- **Bundle Size**: <2MB total JavaScript
- **Concurrent Users**: 1000+ simultaneous players

#### Security & Anti-Cheat
- **Server-side validation** - All game actions verified
- **Rate limiting** - Prevent spam and abuse
- **Input sanitization** - Protect against injection attacks
- **Replay system** - Match verification and analysis

#### Scalability
- **Horizontal scaling** - Multiple game server instances
- **Database sharding** - Partitioned player data
- **CDN integration** - Asset delivery optimization
- **Load balancing** - Distributed traffic management

### User Experience Flow

#### 1. Game Entry
1. Player visits web application
2. Choose anonymous play or account login
3. Main menu with play options displayed

#### 2. Match Setup
1. Select "Quick Match" or "Custom Lobby"
2. Choose preferred class (or random selection)
3. Enter matchmaking queue
4. Wait for opponent pairing

#### 3. Pre-Game
1. Match found notification
2. Class selection confirmation
3. Arena loading screen
4. 3-2-1 countdown timer

#### 4. Combat Phase
1. Players spawn at opposite ends
2. Real-time combat begins
3. Health/armor bars update
4. Status effects display
5. Environmental feedback

#### 5. Match Conclusion
1. Victory/defeat screen
2. Rating change notification
3. Match statistics summary
4. Options to rematch or return to menu

### Testing Strategy

#### Unit Tests
- **Game mechanics** - Damage calculation, class abilities
- **Matchmaking logic** - Queue management, rating system
- **Authentication** - JWT handling, session management
- **API endpoints** - Request/response validation

#### Integration Tests
- **Database operations** - Player data persistence
- **Real-time communication** - Socket.IO message handling
- **External services** - Authentication providers

#### End-to-End Tests
- **Complete user flows** - Registration through match completion
- **Cross-browser compatibility** - Chrome, Firefox, Safari
- **Performance testing** - Load testing with multiple concurrent users
- **Network conditions** - Latency and packet loss simulation

### Implementation Phases

#### Phase 1: Core Infrastructure (Weeks 1-2)
- Project setup and configuration
- Authentication system
- Basic UI components
- Database schema and models

#### Phase 2: Game Engine (Weeks 3-4)
- Phaser 3 integration
- Basic character movement
- Combat system implementation
- Class abilities and balancing

#### Phase 3: Matchmaking (Weeks 5-6)
- Queue system implementation
- Real-time communication
- Match state management
- Basic arena creation

#### Phase 4: Polish & Testing (Weeks 7-8)
- UI/UX improvements
- Comprehensive testing
- Performance optimization
- Deployment preparation

### Success Metrics

#### Technical Metrics
- **Uptime**: 99.9% server availability
- **Response Time**: <100ms average API response
- **Error Rate**: <0.1% failed requests
- **User Retention**: 70% return rate after first match

#### Gameplay Metrics
- **Match Duration**: 2-5 minutes average
- **Class Balance**: <10% win rate variance between classes
- **Player Satisfaction**: >4.0/5.0 rating
- **Concurrent Users**: 500+ during peak hours

### Future Enhancements

#### Short-term (3-6 months)
- **Additional classes** - Expand to 6-8 unique classes
- **Tournament mode** - Bracket-style competitions
- **Spectator mode** - Watch live matches
- **Mobile responsiveness** - Touch-optimized controls

#### Long-term (6+ months)
- **Team battles** - 2v2 or 3v3 modes
- **Ranked seasons** - Competitive seasons with rewards
- **Custom maps** - User-generated content
- **Esports integration** - Tournament hosting tools

### Risk Assessment

#### Technical Risks
- **Real-time synchronization** - Network latency affecting gameplay
- **Scaling challenges** - Performance under high load
- **Cross-browser compatibility** - Phaser 3 consistency issues

#### Business Risks
- **User acquisition** - Building initial player base
- **Retention** - Maintaining long-term engagement
- **Competition** - Established gaming platforms

#### Mitigation Strategies
- **Extensive testing** - Comprehensive QA process
- **Performance monitoring** - Real-time analytics
- **Community building** - Discord/social media presence
- **Iterative development** - Regular updates and improvements 