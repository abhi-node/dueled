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

#### 2. Class System

##### Berserker Class
- **Primary Weapon**: Two-handed sword
- **Attack Type**: Melee AOE slash (120° arc)
- **Damage**: High (80-100 base damage)
- **Range**: Short (2-3 tiles)
- **Speed**: Slow attack rate (1.5s cooldown)
- **Health**: 150 HP
- **Armor**: 50 armor points
- **Special**: Rage mode (10% damage boost when below 50% HP)

##### Mage Class
- **Primary Weapon**: Ice projectiles
- **Attack Type**: Ranged projectile with slow effect
- **Damage**: Medium (60-80 base damage)
- **Range**: Long (8-10 tiles)
- **Speed**: Medium attack rate (1.0s cooldown)
- **Health**: 100 HP
- **Armor**: 30 armor points
- **Special**: Frost effect (30% movement speed reduction for 2s)

##### Bomber Class
- **Primary Weapon**: Fire bombs
- **Attack Type**: Thrown explosives with AOE
- **Damage**: High AOE (70-90 base damage, 3-tile radius)
- **Range**: Medium (5-7 tiles)
- **Speed**: Medium attack rate (1.2s cooldown)
- **Health**: 120 HP
- **Armor**: 40 armor points
- **Special**: Armor burn (fire damage bypasses 25% armor)

##### Archer Class
- **Primary Weapon**: Longbow with arrows
- **Attack Type**: High-velocity piercing projectile
- **Damage**: Medium-High (75-95 base damage)
- **Range**: Very Long (12-15 tiles)
- **Speed**: Fast attack rate (0.8s cooldown)
- **Health**: 80 HP
- **Armor**: 20 armor points
- **Special**: Piercing shot (ignores 50% armor)

#### 3. Combat System
- **Real-time physics** - Phaser 3 physics engine
- **Collision detection** - Precise hitboxes for weapons and projectiles
- **Damage calculation** - Armor reduction formula: `finalDamage = baseDamage * (1 - armor / (armor + 100))`
- **Status effects** - Slow, burn, rage, etc.
- **Environmental interactions** - Destructible/interactive map elements

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