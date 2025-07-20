# Dueled - AI Development Context

## Project Overview
Dueled is a web-based real-time 1v1 combat simulator with class-based gameplay. Players engage in arena-style duels with three unique classes: Gunslinger, Demolitionist, and Buckshot.

## Tech Stack

### Frontend
- **React 18+** - Component-based UI with hooks
- **TypeScript** - Type-safe development
- **Phaser 3** - 2D game engine for combat mechanics
- **Tailwind CSS** - Utility-first styling
- **Vite** - Build tool and dev server

### Backend
- **Node.js + Express** - TypeScript REST API
- **Socket.IO** - Real-time WebSocket communication
- **PostgreSQL** - Player data and match history
- **Redis** - Session management and matchmaking queue
- **JWT** - Authentication tokens

### Deployment
- **Vercel** - Frontend and serverless functions
- **Vercel Postgres** - Database hosting
- **Vercel KV** - Redis hosting

## Project Structure
```
Dueled/
├── client/          # React frontend
├── server/          # Node.js backend
├── shared/          # Shared types and utilities
├── _docs/           # Documentation
│   ├── planning/    # PRD and architecture
│   └── phases/      # Implementation phases
```

## Development Phases

### Phase 1: MVP (Weeks 1-4)
- Core infrastructure and matchmaking
- **Goal**: Two players can queue and see each other in game world

### Phase 2: Combat (Weeks 5-8)
- Complete combat system with all three classes
- **Goal**: Fully functional combat with balanced mechanics

### Phase 3: Polish & Deploy (Weeks 9-12)
- Performance optimization and Vercel deployment
- **Goal**: Production-ready game

## Code Style Guidelines

### General
- Use functional components with hooks
- Prefer TypeScript interfaces over types
- Use descriptive variable names with auxiliary verbs
- Implement proper error handling with throws
- Add JSDoc comments for all functions

### React
- Use custom hooks for complex logic
- Implement proper error boundaries
- Use React.memo for performance optimization
- Keep components under 200 lines

### Node.js
- Use async/await over promises
- Implement proper middleware for Express
- Use environment variables for configuration
- Add request validation and rate limiting

## Game Classes

### Gunslinger
- **Weapon**: Six-Shooter (hitscan, precision)
- **Stats**: 80 HP, 20 armor, 120 speed
- **Special**: Quick Draw (instant shot) & Fan the Hammer (6-shot burst)

### Demolitionist
- **Weapon**: Grenade Launcher (explosive, AOE)
- **Stats**: 150 HP, 50 armor, 80 speed
- **Special**: Sticky Bombs & Carpet Bomb (area denial)

### Buckshot
- **Weapon**: Combat Shotgun (4-pellet spread, close-range)
- **Stats**: 120 HP, 40 armor, 100 speed
- **Special**: Shell Shock (knockback) & Dragon Breath (fire DOT)

## Performance Targets
- **Client**: 60 FPS, <2s load time
- **Server**: <100ms API response
- **WebSocket**: <50ms latency
- **Database**: <50ms queries

## Security Requirements
- Server-side validation for all game actions
- Rate limiting on all endpoints
- Input sanitization and validation
- Anti-cheat measures with replay system

## Development Context
- AI-first codebase (modular, scalable, well-documented)
- Files should not exceed 500 lines
- Comprehensive testing at each phase
- Focus on clean, readable code over clever optimizations
- Progressive enhancement approach

## Important Considerations
- If working from a phase implementation plan, check off the tasks that were completed
- Allow the user to test changes periodically