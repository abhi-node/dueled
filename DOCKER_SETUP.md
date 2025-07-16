# Docker Development Environment - Setup Complete ✅

## 🚀 Quick Start
```bash
npm run dev    # Starts PostgreSQL, Redis, and development servers
```

## 📦 What's Included

### PostgreSQL Database (Port 5433)
- **Image**: postgres:15-alpine
- **Database**: dueled
- **User**: dueled_user
- **Password**: dueled_password
- **Features**: Complete schema with indexes, seed data, health checks

### Redis Cache (Port 6380)
- **Image**: redis:7-alpine
- **Persistence**: Data volume for development
- **Health Checks**: Automatic connection monitoring

## 🛠️ Available Commands

```bash
# Main development command
npm run dev              # Start Docker + shared build + client + server

# Alternative without Docker
npm run dev:no-docker    # Start without Docker (uses in-memory fallbacks)

# Docker management
npm run docker:start     # Start PostgreSQL and Redis containers
npm run docker:stop      # Stop all containers
npm run docker:restart   # Restart containers
npm run docker:status    # Show container status and health
npm run docker:logs      # View container logs
npm run docker:reset     # Reset all data (WARNING: destroys data!)
npm run docker:test      # Test database connections

# Testing
npm run test:setup       # Run full environment test
```

## 🔧 Configuration

### Ports (Changed to Avoid Conflicts)
- **PostgreSQL**: 5433 (mapped from container's 5432)
- **Redis**: 6380 (mapped from container's 6379)
- **Server**: 3000
- **Client**: 5173

### Environment Variables
```bash
DATABASE_URL=postgresql://dueled_user:dueled_password@localhost:5433/dueled
REDIS_URL=redis://localhost:6380
```

## 📊 Database Schema

### Tables Created
- `players` - User accounts and profiles
- `player_stats` - Ratings, match counts, statistics
- `matches` - Match history with detailed metadata
- `match_events` - Event log for replays and anti-cheat
- `player_sessions` - JWT session management

### Seed Data Included
- 3 test players (TestPlayer1, TestPlayer2, GuestUser1)
- Sample match history
- Realistic player statistics

### Performance Features
- Proper indexes on all frequently queried columns
- Health checks for connection monitoring
- Connection pooling
- Automatic cleanup functions

## 🔄 Graceful Fallbacks

The system works in multiple scenarios:

1. **Full Docker**: PostgreSQL + Redis + Application
2. **No Docker**: In-memory storage for development
3. **Partial**: Database available, Redis unavailable (or vice versa)

## 🧪 Testing

### Quick Environment Test
```bash
npm run test:setup
```

This verifies:
- ✅ Docker containers are healthy
- ✅ PostgreSQL connection works
- ✅ Redis connection works
- ✅ Shared package builds
- ✅ Server builds successfully

### Manual Testing
```bash
# Check container status
npm run docker:status

# View logs if issues occur
npm run docker:logs

# Test database connectivity
npm run docker:test
```

## 🚨 Troubleshooting

### Port Conflicts
If you see "port already allocated" errors:
1. Check what's using the ports: `lsof -i :5433` or `lsof -i :6380`
2. Stop conflicting services or change ports in `docker-compose.dev.yml`

### Container Issues
```bash
# Stop and remove all containers
npm run docker:stop

# Start fresh
npm run docker:start

# View detailed logs
npm run docker:logs postgres  # or redis
```

### Database Connection Issues
```bash
# Test connections
npm run docker:test

# Reset database (WARNING: loses all data)
npm run docker:reset
```

## 📈 Next Steps

With Docker setup complete, you can now:

1. **Develop with Real Database**: Full PostgreSQL features
2. **Test Realistic Scenarios**: Use seed data and schema
3. **Debug Database Queries**: View logs and monitor performance
4. **Prototype Features**: Quick data reset and testing

## 🎯 Benefits

- **Zero Configuration**: Just run `npm run dev`
- **Production-like**: Real PostgreSQL database
- **Development Friendly**: Seed data, easy reset, detailed logging
- **Flexible**: Works with or without Docker
- **Robust**: Health checks, graceful fallbacks, error handling

**Your development environment is now ready for serious game development! 🎮**