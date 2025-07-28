# Dueled Game Client

**React + TypeScript frontend for the Dueled arena combat game**

This is the client-side application for Dueled, featuring a custom raycasting renderer, React UI components, and real-time WebSocket communication for 1v1 arena combat.

## 🎮 Client Features

### 🎨 User Interface
- **React 18**: Modern React with TypeScript for type safety
- **Tailwind CSS**: Utility-first styling with custom game themes
- **Responsive Design**: Works on desktop and tablet devices
- **Game-Themed UI**: Retro-futuristic styling matching the arena combat theme

### 🖼️ Custom Game Engine
- **Raycasting Renderer**: Doom-style 3D rendering in pure TypeScript
- **Real-Time Performance**: 60 FPS rendering with optimized algorithms
- **Texture Mapping**: Dynamic wall, floor, and ceiling textures
- **Sprite System**: 2D sprites rendered in 3D space with depth sorting

### 🎯 Core Systems
- **Input Management**: Responsive WASD movement and mouse controls
- **Movement Prediction**: Client-side prediction for smooth gameplay
- **Network Communication**: WebSocket integration for real-time multiplayer
- **State Management**: Zustand for efficient state management

## 🚀 Development

### Quick Start
```bash
# From client directory
npm install
npm run dev
```

### Available Scripts
```bash
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

## 📁 Client Architecture

```
client/src/
├── components/          # React UI components
│   ├── auth/           # Login, register, user profile
│   ├── common/         # Shared components (navbar, loading, toast)
│   ├── game/           # Game-specific UI (canvas, HUD)
│   └── lobby/          # Main menu, class selection, matchmaking
├── game/               # Custom game engine
│   ├── core/           # Game engine, state management
│   ├── input/          # Input handling and command processing
│   ├── movement/       # Movement prediction and physics
│   ├── network/        # WebSocket communication
│   ├── render/         # Raycasting renderer and graphics
│   ├── types/          # Game-specific TypeScript types
│   └── utils/          # Math utilities and helpers
├── hooks/              # Custom React hooks
├── services/           # API communication and auth
├── store/              # Zustand state management
└── utils/              # General utilities and helpers
```

## 🎮 Game Engine Details

### Raycasting Renderer (`game/render/`)
- **RaycastRenderer.ts**: Main rendering engine
- **TextureManager.ts**: Texture loading and management
- **SpriteManager.ts**: Sprite rendering and depth sorting
- **HUD.tsx**: Heads-up display components
- **Minimap.tsx**: Real-time minimap rendering

### Input System (`game/input/`)
- **InputManager.ts**: Keyboard and mouse event handling
- **InputCommands.ts**: Command pattern for input actions
- **InputQueue.ts**: Input buffering for network synchronization

### Network Layer (`game/network/`)
- **GameSocket.ts**: WebSocket connection management
- **MessageHandler.ts**: Game message processing and validation

### Core Engine (`game/core/`)
- **GameEngine.ts**: Main game loop and system coordination
- **GameState.ts**: Centralized game state management

## 🎯 Class System Integration

The client renders and handles all three combat classes:

### 🤠 Gunslinger
- **Sprite**: `gunslinger-sheet.png`
- **Weapon Effects**: Hitscan ray visualization
- **Abilities**: Quick Draw and Fan the Hammer animations

### 💥 Demolitionist  
- **Projectiles**: Ballistic trajectory calculation and rendering
- **Explosions**: Area-of-effect visual effects
- **Abilities**: Sticky bomb placement and carpet bombing

### 🎯 Buckshot
- **Spread Weapons**: Multiple pellet trajectory visualization
- **Knockback**: Player movement effects from weapon impacts
- **Abilities**: Shell shock blast and dragon breath cone effects

## 🛠️ Technical Stack

### Frontend Framework
- **React 18**: Component-based UI with hooks
- **TypeScript**: Full type safety and IntelliSense
- **Vite**: Fast development server and building

### Styling & UI
- **Tailwind CSS**: Utility-first CSS framework
- **Custom Components**: Game-themed UI components
- **Responsive Design**: Mobile-friendly layouts

### Game Rendering
- **Canvas 2D**: HTML5 Canvas for raycasting renderer
- **WebGL**: Hardware-accelerated graphics (future enhancement)
- **RequestAnimationFrame**: Smooth 60 FPS rendering loop

### State Management
- **Zustand**: Lightweight state management
- **Local Storage**: Persistent settings and preferences
- **Session Storage**: Temporary game state

### Networking
- **Socket.IO Client**: Real-time WebSocket communication
- **Axios**: RESTful API communication for authentication
- **Connection Management**: Automatic reconnection and error handling

## 🔧 Configuration

### Environment Variables
```bash
# .env
VITE_API_URL=http://localhost:3000     # Backend API URL
VITE_WS_URL=ws://localhost:3000        # WebSocket URL (optional)
VITE_ENV=development                   # Environment mode
```

### Build Configuration
- **Vite Config**: Optimized for game development
- **TypeScript Config**: Strict type checking
- **ESLint Config**: Code quality and consistency

## 🎮 Development Notes

### Performance Considerations
- **Rendering Optimization**: Efficient raycasting algorithms
- **Memory Management**: Texture and sprite caching
- **Network Optimization**: Minimal data transfer for real-time gameplay

### Browser Compatibility
- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **Canvas 2D Support**: Required for raycasting renderer
- **WebSocket Support**: Required for multiplayer functionality

### Asset Loading
- **Texture Streaming**: Progressive texture loading
- **Sprite Sheets**: Efficient sprite management
- **Audio Assets**: Sound effect and music integration (future)

---

**Ready to build? Run `npm run dev` and start developing the ultimate arena combat experience!**
