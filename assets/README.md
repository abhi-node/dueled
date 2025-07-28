# Dueled Assets Directory

This directory contains all game assets organized by category for the modern arena combat game.

## Directory Structure

### `/sprites/` - Game Sprites
- **`/players/`** - Player character sprites and animations
  - `/gunslinger/` - Gunslinger class sprites (precision marksman)
  - `/demolitionist/` - Demolitionist class sprites (explosive specialist)  
  - `/buckshot/` - Buckshot class sprites (close-quarters combat)
- **`/weapons/`** - Weapon sprites and effects
  - `/six_shooter/` - Gunslinger's hitscan weapon
  - `/grenade_launcher/` - Demolitionist's ballistic weapon
  - `/combat_shotgun/` - Buckshot's spread weapon
- **`/projectiles/`** - Projectile sprites (grenades, pellets, explosions)
- **`/abilities/`** - Special ability visual effects
  - `/quick_draw/` - Gunslinger ability effects
  - `/sticky_bombs/` - Demolitionist trap effects
  - `/shell_shock/` - Buckshot knockback effects
- **`/effects/`** - Combat visual effects (muzzle flashes, explosions, impacts)

### `/textures/` - Environment Textures
- **`/walls/`** - Wall textures for arena environments
  - `wall_stone.png` - Primary stone wall texture
  - `wall_metal.png` - Metal wall variant
- **`/floors/`** - Floor tile textures
  - `floor_stone.png` - Stone arena flooring
- **`/ceilings/`** - Ceiling tile textures  
  - `ceiling_stone.png` - Stone ceiling texture
- **`/obstacles/`** - Pillar and barrier textures for tactical positioning

### `/audio/` - Sound Assets *(Future Implementation)*
- **`/music/`** - Background music tracks
  - `/arena/` - Combat arena ambient music
  - `/menu/` - Main menu and lobby music
- **`/sfx/`** - Sound effects
  - `/weapons/` - Weapon firing and reload sounds
  - `/impacts/` - Projectile hit and explosion sounds
  - `/abilities/` - Special ability sound effects
  - `/ui/` - Menu and interface sounds
- **`/voice/`** - Voice lines and announcements
  - `/announcer/` - Match start/end announcements
  - `/classes/` - Class-specific voice lines

### `/ui/` - User Interface Assets *(Future Implementation)*
- **`/icons/`** - UI icons and symbols
  - `/classes/` - Class selection icons
  - `/abilities/` - Ability cooldown indicators
  - `/status/` - Health, ammo, and status icons
- **`/hud/`** - HUD elements and overlays
  - `/crosshairs/` - Weapon-specific crosshair designs
  - `/health_bars/` - Health and status bar graphics
  - `/minimap/` - Minimap icons and indicators
- **`/menus/`** - Menu backgrounds and elements
  - `/backgrounds/` - Menu background images
  - `/buttons/` - Custom button graphics

## Asset Guidelines

### Sprite Specifications
- **Format**: PNG with transparency (24-bit + alpha)
- **Player Sprites**: 64x64 pixels for consistent scaling
- **Weapon Sprites**: Variable size based on weapon type
- **Animation Frames**: Multiple files for animated sequences
- **Naming**: Descriptive with frame numbers (e.g., `gunslinger_walk_01.png`)

### Texture Specifications  
- **Format**: PNG or JPG (PNG preferred for quality)
- **Wall Textures**: 64x64 or 128x128 pixels for raycasting renderer
- **Floor/Ceiling**: Must be seamlessly tileable for proper mapping
- **Resolution**: Power of 2 dimensions (64, 128, 256, 512)
- **Optimization**: Compressed for web delivery while maintaining quality

### Current Asset Status

#### ✅ Available Assets
- **Player Sprites**: Basic walk animations for all classes
  - `gunslinger/gunslinger_walk.png`
  - `demolitionist/demolitionist_walk.png` *(Note: may be named differently)*
  - `buckshot/buckshot_walk.png` *(Note: may be named differently)*
- **Textures**: Core environment textures
  - Stone walls, floors, and ceilings
  - Metal wall variants
- **Projectiles**: Arrow sprite sheet for projectile reference

#### 🔄 Needed Assets
- **Combat Animations**: Attack, idle, death animations for all classes
- **Weapon Sprites**: Individual weapon graphics
- **Ability Effects**: Visual effects for special abilities
- **UI Elements**: Health bars, crosshairs, icons
- **Audio Assets**: Sound effects and music

### Asset Integration

#### Raycasting Renderer
- **Wall Textures**: Loaded by `TextureManager.ts`
- **Floor/Ceiling**: Applied during raycasting calculations
- **Optimization**: Textures cached for performance

#### Sprite System
- **Player Sprites**: Managed by `SpriteManager.ts`
- **Depth Sorting**: Sprites rendered with proper 3D depth
- **Animation**: Frame-based animation system

#### Performance Considerations
- **Texture Size**: Balance quality vs. memory usage
- **Compression**: Web-optimized without quality loss
- **Caching**: Assets cached for smooth gameplay
- **Loading**: Progressive loading for better UX

### Naming Conventions

#### Classes
- `gunslinger_*` - Precision marksman assets
- `demolitionist_*` - Explosive specialist assets  
- `buckshot_*` - Close-quarters combat assets

#### Animation States
- `*_idle_##.png` - Standing idle animation
- `*_walk_##.png` - Walking animation
- `*_attack_##.png` - Attack animation
- `*_death_##.png` - Death animation

#### Weapons & Effects
- `weapon_[class]_[action].png` - Weapon sprites
- `effect_[ability]_##.png` - Ability effect frames
- `projectile_[type].png` - Projectile graphics

#### Environment
- `[material]_[surface].png` - Environment textures
- `obstacle_[type].png` - Barrier and pillar textures

---

**Asset Pipeline**: All assets are processed through the game's texture and sprite management systems for optimal performance in the raycasting renderer.