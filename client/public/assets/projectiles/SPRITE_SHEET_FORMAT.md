# Projectile Sprite Sheet Format - 4x4 Grid Specification

## Overview
All projectile sprites in Dueled use a standardized 4x4 grid format (16 frames total) with continuous animation looping through all frames sequentially.

## File Specifications

### Image Format
- **File Type**: PNG with transparency
- **Grid Size**: 4 columns × 4 rows (16 frames total)
- **Frame Size**: 48×48 pixels per frame
- **Total Image Size**: 192×192 pixels
- **Color Depth**: 32-bit RGBA

### Required Sprite Sheets

#### 1. Basic Arrow (`arrow_sheet.png`)
- **Description**: Standard piercing arrows for Archer class
- **Path**: `/assets/projectiles/arrow_sheet.png`

**Frame Layout:**
```
Continuous Animation: [0][1][2][3]
                     [4][5][6][7]
                     [8][9][10][11]
                     [12][13][14][15]

Animation loops continuously through frames 0-15 in sequence
```

#### 2. Homing Arrow (`homing_arrow_sheet.png`)
- **Description**: Special homing arrows for Dispatcher ability
- **Path**: `/assets/projectiles/homing_arrow_sheet.png`

**Frame Layout:**
```
Continuous Animation: [0][1][2][3]
                     [4][5][6][7]
                     [8][9][10][11]
                     [12][13][14][15]

Animation loops continuously with homing glow effects throughout
```

## Frame-by-Frame Specifications

### Continuous Animation (Frames 0-15)
- **Purpose**: Single looping animation for the entire projectile lifecycle
- **Duration**: 100ms per frame (continuous loop)
- **Total Loop Time**: 1.6 seconds (16 frames × 100ms)

#### Animation Content Guidelines:
- **Frames 0-3**: Primary projectile appearance and initial movement
- **Frames 4-7**: Mid-flight animation with rotation or particle effects
- **Frames 8-11**: Enhanced effects (trails, glow, special indicators)
- **Frames 12-15**: Return to beginning state for seamless looping

#### Special Effect Integration:
- **Piercing Arrows**: Blue glow effects integrated throughout animation
- **Homing Arrows**: Purple pulse effects that increase intensity mid-animation
- **Basic Arrows**: Standard wooden arrow with natural rotation
- **Future Projectiles**: Effects should be distributed across all 16 frames

## Visual Design Guidelines

### Arrow Aesthetics
- **Style**: Fantasy medieval with slight magical enhancement
- **Colors**: 
  - Wood shaft: Browns (#8B4513, #A0522D)
  - Metal tip: Silver/steel (#C0C0C0, #DCDCDC)
  - Fletching: Dark colors (#2F4F4F, #800000)
  - Piercing glow: Blue (#3B82F6, #60A5FA)
  - Homing glow: Purple (#8B5CF6, #A78BFA)

### Animation Requirements
- **Smooth rotation**: Arrow should rotate naturally in flight
- **Consistent size**: All frames should maintain same apparent size
- **Clear direction**: Arrow tip should clearly indicate travel direction
- **Transparency**: Use alpha blending for glow effects

## Technical Implementation

### Loading Code Example
```typescript
const arrowSpriteSheet = {
  path: '/assets/projectiles/arrow_sheet.png',
  frameWidth: 48,
  frameHeight: 48,
  totalFrames: 16
};
```

### Animation Implementation
```typescript
// Simple continuous frame animation
updateAnimation(deltaTime: number): void {
  this.animationTime += deltaTime;
  
  if (this.animationTime >= 100) { // 100ms per frame
    this.animationTime = 0;
    this.animationFrame = (this.animationFrame + 1) % 16; // Loop 0-15
  }
}

// 4x4 grid coordinate calculation
const col = this.animationFrame % 4;
const row = Math.floor(this.animationFrame / 4);
const srcX = col * 48;
const srcY = row * 48;
```

## Future Projectiles

### Ice Shard (`ice_shard_sheet.png`)
- **Row 0**: Crystalline spinning animation
- **Row 1**: Shattering impact with ice particles
- **Row 2**: Frost trail effects
- **Row 3**: Freezing glow (slow effect indicator)

### Fire Bomb (`fire_bomb_sheet.png`)
- **Row 0**: Spinning bomb with lit fuse
- **Row 1**: Explosive impact animation
- **Row 2**: Fire trail/smoke
- **Row 3**: Pre-explosion glow (armor burn indicator)

### Magic Missile (`magic_missile_sheet.png`)
- **Row 0**: Pulsing energy orb
- **Row 1**: Energy dissipation
- **Row 2**: Magical spark trail
- **Row 3**: Mana glow effects

## File Organization
```
/public/assets/projectiles/
├── arrow_sheet.png              # Basic archer arrows
├── homing_arrow_sheet.png       # Dispatcher special ability
├── ice_shard_sheet.png          # Mage projectiles (future)
├── fire_bomb_sheet.png          # Bomber projectiles (future)
├── magic_missile_sheet.png      # Generic magic (future)
└── SPRITE_SHEET_FORMAT.md       # This specification
```

## Performance Considerations
- **Texture atlasing**: All projectile sprites share same format for efficient GPU usage
- **Memory usage**: 192×192 pixels = 144KB per sprite sheet (uncompressed)
- **Animation performance**: 10 FPS animation (100ms per frame) for smooth 60 FPS gameplay
- **Simplified animation**: Single continuous loop reduces animation complexity
- **LOD support**: Consider half-resolution versions for distant projectiles

## Quality Assurance Checklist
- [ ] All 16 frames present and correctly positioned in 4×4 grid
- [ ] Consistent frame size (48×48 pixels)
- [ ] Total image size exactly 192×192 pixels
- [ ] Proper transparency/alpha channels
- [ ] Smooth animation loops (frame 15 → frame 0)
- [ ] Continuous animation flows naturally through all 16 frames
- [ ] Clear visual hierarchy (projectile > effects)
- [ ] Readable at various zoom levels
- [ ] Special effects integrated throughout animation cycle
- [ ] Consistent art style across all sheets 