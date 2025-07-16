# Dueled Assets Directory

This directory contains all game assets organized by category.

## Directory Structure

### `/sprites/` - Game Sprites
- **`/players/`** - Player character sprites
  - `/berserker/` - Berserker class sprites (animations, portraits)
  - `/mage/` - Mage class sprites (animations, portraits)
  - `/bomber/` - Bomber class sprites (animations, portraits)
  - `/archer/` - Archer class sprites (animations, portraits)
- **`/weapons/`** - Weapon sprites
  - `/swords/` - Berserker weapons (two-handed swords)
  - `/staffs/` - Mage weapons (magic staffs)
  - `/bombs/` - Bomber weapons (explosive devices)
  - `/bows/` - Archer weapons (longbows, crossbows)
- **`/projectiles/`** - Projectile sprites (arrows, ice shards, fireballs)
- **`/items/`** - Pickup items, power-ups
- **`/effects/`** - Visual effects (explosions, magic, sparks)

### `/textures/` - Environment Textures
- **`/walls/`** - Wall textures for different arena themes
- **`/floors/`** - Floor tile textures
- **`/ceilings/`** - Ceiling tile textures
- **`/obstacles/`** - Pillar and obstacle textures

### `/audio/` - Sound Assets
- **`/music/`** - Background music tracks
- **`/sfx/`** - Sound effects (weapons, impacts, abilities)
- **`/voice/`** - Voice lines and announcements

### `/ui/` - User Interface Assets
- **`/icons/`** - UI icons (abilities, status, classes)
- **`/hud/`** - HUD elements (health bars, minimaps)
- **`/menus/`** - Menu backgrounds and elements

## Asset Guidelines

### Sprite Specifications
- **Format**: PNG with transparency
- **Player Sprites**: 64x64 pixels recommended
- **Weapon Sprites**: Variable size based on weapon type
- **Animation Frames**: Multiple files for animated sprites

### Texture Specifications
- **Format**: PNG or JPG
- **Wall Textures**: 64x64 or 128x128 pixels
- **Floor/Ceiling**: Seamlessly tileable
- **Resolution**: Power of 2 dimensions preferred

### Naming Convention
- Use descriptive names: `berserker_idle_01.png`
- Animation frames: `mage_attack_01.png`, `mage_attack_02.png`
- Texture variants: `stone_wall_01.png`, `stone_wall_damaged.png`