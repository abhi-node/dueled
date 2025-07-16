# Dueled - 1v1 Combat Simulator

Real-time 1v1 combat simulator with class-based gameplay built with React, Node.js, and Phaser 3.

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
│   │   │   ├── auth/      # Authentication components
│   │   │   ├── game/      # Game-specific UI
│   │   │   ├── lobby/     # Matchmaking and lobby
│   │   │   └── common/    # Shared components
│   │   ├── game/          # Phaser 3 game engine
│   │   │   └── scenes/    # Game scenes
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API and WebSocket services
│   │   └── store/         # State management
├── server/                # Node.js backend (Express + TypeScript)
│   ├── src/
│   │   ├── controllers/   # API route handlers
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Express middleware
│   │   ├── websocket/     # Socket.IO handlers
│   │   └── utils/         # Utility functions
├── shared/                # Shared types and utilities
│   └── src/types/         # TypeScript definitions
└── _docs/                 # Documentation
    ├── planning/          # PRD and architecture
    └── phases/            # Implementation phases
```

## 🎮 Current Features

### ✅ Completed (Week 1)
- **Monorepo Setup**: Client, server, and shared packages
- **Authentication System**: Login, register, and anonymous play
- **Main Menu**: Class selection and matchmaking UI
- **Basic Game Engine**: Phaser 3 integration with simple arena
- **Real-time Communication**: Socket.IO WebSocket setup
- **Responsive UI**: Tailwind CSS with game-themed styling

### 🔄 In Progress
- Database integration (PostgreSQL)
- Redis session management
- Advanced matchmaking system

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

## 🎯 Game Classes

- **🗡️ Berserker**: High damage, heavy armor, rage mode
- **🧙 Mage**: Ice projectiles, crowd control, medium range
- **💣 Bomber**: AOE explosives, armor penetration
- **🏹 Archer**: Long range, piercing shots, high mobility

## 🔧 Configuration

### Environment Variables

**Server (.env)**
```bash
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://dueled_user:dueled_password@localhost:5433/dueled
REDIS_URL=redis://localhost:6380
```

**Client (.env)**
```bash
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
VITE_APP_NAME=Dueled
```

## 🧪 Database & Testing

### Docker Development Database
- **PostgreSQL**: Full database with schema, indexes, and seed data
- **Redis**: Session management and caching
- **Graceful Fallbacks**: Works without Docker (in-memory storage)
- **Test Data**: Includes sample players and matches

### Testing Framework
- **Jest**: Unit and integration tests
- **Playwright**: End-to-end testing
- **Database Testing**: Isolated test database

## 📚 Development Notes

- **Hot Reloading**: Both client and server support hot reloading
- **Type Safety**: Full TypeScript support across all packages
- **Code Quality**: ESLint and Prettier configured
- **Modular Architecture**: Clean separation between packages
- **Game Engine**: Phaser 3 integrated with React lifecycle

## 🎯 Next Steps (Week 2)

1. Complete authentication implementation
2. Add WebSocket matchmaking
3. Implement basic player movement
4. Create game state synchronization
5. Add match history and statistics

---

**Ready to duel? Start the development environment and visit http://localhost:5173**