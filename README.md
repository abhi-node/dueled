# Dueled - Modern Arena Combat

**Real-time 1v1 arena combat game with Doom-style raycasting rendering and class-based gameplay.**

Experience intense, fast-paced duels in retro-styled 3D arenas. Choose from three distinct classes, master their unique weapons and abilities, and dominate the battlefield in this modern take on classic arena shooters.

## 🎮 Game Features

### 🔫 Three Combat Classes
- **🤠 Gunslinger**: Precision marksman with hitscan weapons. Lightning-fast draws and deadly accuracy at long range.
- **💥 Demolitionist**: Explosive specialist with area-denial weapons. Heavy armor and devastating AOE attacks.
- **🎯 Buckshot**: Close-quarters combat expert with spread weapons. Deadly in confined spaces with powerful knockback.

### 🏟️ Arena Combat
- **Doom-Style Rendering**: Retro 3D raycasting engine for authentic old-school aesthetics
- **Real-time 1v1 Duels**: Fast-paced competitive matches with responsive controls  
- **Dynamic Environments**: Stone arenas with walls, obstacles, and tactical positioning
- **Minimap & HUD**: Full situational awareness with health, ammo, and ability cooldowns

### ⚡ Core Mechanics
- **Hitscan & Ballistic Weapons**: Mix of instant-hit and projectile-based combat
- **Special Abilities**: Each class has unique primary and ultimate abilities
- **Movement System**: Smooth WASD movement with dash mechanics and stamina
- **Collision Detection**: Precise physics for fair and responsive gameplay

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Docker and Docker Compose (for PostgreSQL and Redis)

### Development Setup

1. **Clone and Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   ```bash
   # Copy environment files (already configured for Docker)
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

3. **Start Development Environment**
   ```bash
   # This will automatically:
   # - Start PostgreSQL and Redis containers
   # - Build shared package
   # - Start both client and server
   npm run dev
   ```
   
   **Alternative without Docker:**
   ```bash
   # Run without PostgreSQL/Redis (uses in-memory fallbacks)
   npm run dev:no-docker
   ```

4. **Open Your Browser**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Database: PostgreSQL on localhost:5433
   - Cache: Redis on localhost:6380

## 📁 Project Structure

```
Dueled/
├── client/                 # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── auth/      # Authentication system
│   │   │   ├── game/      # Game UI and HUD
│   │   │   ├── lobby/     # Matchmaking and menus
│   │   │   └── common/    # Shared components
│   │   ├── game/          # Custom raycasting game engine
│   │   │   ├── core/      # Game engine and state management
│   │   │   ├── render/    # Raycasting renderer and graphics
│   │   │   ├── input/     # Input handling and commands
│   │   │   ├── movement/  # Movement prediction and physics
│   │   │   ├── network/   # WebSocket communication
│   │   │   └── types/     # Game-specific TypeScript definitions
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API and authentication services
│   │   └── store/         # State management (Zustand)
├── server/                # Node.js backend (Express + TypeScript)
│   ├── src/
│   │   ├── controllers/   # API route handlers
│   │   ├── game/          # Game logic and systems
│   │   │   ├── combat/    # Combat resolution and damage
│   │   │   ├── physics/   # Server-side physics validation
│   │   │   ├── match/     # Match management and state
│   │   │   └── world/     # World data and entity management
│   │   ├── services/      # Authentication and matchmaking
│   │   ├── websocket/     # Real-time game communication
│   │   └── middleware/    # Express middleware and validation
├── shared/                # Shared types and utilities
│   ├── src/
│   │   ├── classes/       # Class configurations and stats
│   │   ├── movement/      # Movement calculations and validation
│   │   └── types/         # Shared TypeScript definitions
└── _docs/                 # Documentation and planning
    ├── planning/          # PRD and architecture docs
    └── phases/            # Implementation phases
```

## 🎯 Class System

### 🤠 Gunslinger
**Role**: Precision Marksman  
- **Weapon**: Six-Shooter (Hitscan)
- **Primary**: Quick Draw - Instant shot with increased damage
- **Ultimate**: Fan the Hammer - Rapid 6-shot burst
- **Playstyle**: Long-range precision, high mobility, glass cannon

### 💥 Demolitionist  
**Role**: Explosive Specialist
- **Weapon**: Grenade Launcher (Ballistic AOE)
- **Primary**: Sticky Bombs - Delayed explosive traps
- **Ultimate**: Carpet Bomb - Area devastation
- **Playstyle**: Area denial, heavy armor, crowd control

### 🎯 Buckshot
**Role**: Close-Quarters Specialist
- **Weapon**: Combat Shotgun (Spread)
- **Primary**: Shell Shock - Powerful knockback blast
- **Ultimate**: Dragon Breath - Fire damage cone
- **Playstyle**: Close-range dominance, mobility, burst damage

## 🛠️ Available Scripts

### Root Level
```bash
npm run dev          # Start Docker + client + server
npm run dev:no-docker # Start client + server only (no Docker)
npm run build        # Build all packages
npm run test         # Run all tests
npm run lint         # Lint all packages
npm run format       # Format code with Prettier

# Docker commands
npm run docker:start    # Start PostgreSQL and Redis
npm run docker:stop     # Stop containers
npm run docker:restart  # Restart containers
npm run docker:status   # Show container status
npm run docker:logs     # View container logs
npm run docker:reset    # Reset all data (destroys data!)
npm run docker:test     # Test database connections
```

### Client (Frontend)
```bash
cd client
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Lint client code
```

### Server (Backend)
```bash
cd server
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Start production server
npm run lint         # Lint server code
```

## 🔧 Configuration

### Environment Variables

**Server (.env)** - Essential Variables:
```bash
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
DATABASE_URL=postgresql://dueled_user:dueled_password@localhost:5433/dueled
REDIS_URL=redis://localhost:6380
```

**Client (.env)**:
```bash
VITE_API_URL=http://localhost:3000
```

**Additional Configuration** (all optional with sensible defaults):
```bash
# WebSocket & Game Configuration
WEBSOCKET_HEARTBEAT_INTERVAL=30000
WEBSOCKET_CONNECTION_TIMEOUT=60000
MAX_PLAYERS_PER_MATCH=2

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Server Timeouts
REQUEST_TIMEOUT_MS=30000
HEALTH_CHECK_INTERVAL_MS=30000
```

📝 **See `.env.example` files for complete configuration options**

## 🎮 Technical Highlights

### Custom Raycasting Engine
- **Doom-Style 3D**: Classic pseudo-3D rendering technique
- **60 FPS Performance**: Optimized rendering pipeline
- **Texture Mapping**: Wall, floor, and ceiling textures
- **Sprite Rendering**: 2D sprites in 3D space with proper depth sorting

### Real-Time Networking
- **WebSocket Architecture**: Low-latency bi-directional communication
- **Client-Side Prediction**: Smooth movement with lag compensation  
- **Server Reconciliation**: Authoritative game state with client validation
- **Input Buffering**: Reliable command processing

### Modern Development
- **TypeScript**: Full type safety across client, server, and shared code
- **Modular Architecture**: Clean separation of concerns
- **Hot Reloading**: Instant development feedback
- **Docker Integration**: Consistent development environment

## 🧪 Database & Testing

### Docker Development Database
- **PostgreSQL**: Player data, match history, and rankings
- **Redis**: Session management and real-time data caching
- **Graceful Fallbacks**: Works without Docker (in-memory storage)
- **Test Data**: Includes sample players and match statistics

### Testing Framework
- **Jest**: Unit and integration tests
- **Vitest**: Modern test runner for Vite projects
- **Database Testing**: Isolated test database for reliable testing

## 📚 Development Notes

- **Hot Reloading**: Both client and server support hot reloading
- **Type Safety**: Full TypeScript support across all packages
- **Code Quality**: ESLint and Prettier configured
- **Modular Architecture**: Clean separation between packages
- **Game Engine**: Custom raycasting engine integrated with React

---

**Ready to duel? Start the development environment and visit http://localhost:5173**

*Experience the thrill of 1v1 arena combat with retro aesthetics and modern gameplay mechanics.*