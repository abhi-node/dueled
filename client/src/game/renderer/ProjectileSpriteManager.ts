/**
 * ProjectileSpriteManager - Manages loading and rendering of projectile sprites
 * Extends BaseSpriteManager for consistent sprite management
 */

import { BaseSpriteManager, type SpriteSheetConfig } from './BaseSpriteManager';
import { SpriteSheet, WalkDirection } from './SpriteSheet';
import type { SpriteAnimation, SpriteFrame } from './SpriteSheet';

export interface ProjectileSprite {
  type: string;
  spriteSheet: SpriteSheet;
  animation: SpriteAnimation;
  frameTime: number;
}

export class ProjectileSpriteManager extends BaseSpriteManager {
  private projectileSheets: Map<string, SpriteSheet> = new Map();
  private projectileSprites: Map<string, ProjectileSprite> = new Map();
  private isInitialized: boolean = false;
  private loadingPromise: Promise<void> | null = null;
  
  // Animation settings
  private static readonly PROJECTILE_FRAME_TIME = 100; // ms per frame
  
  constructor() {
    super();
  }
  
  /**
   * Initialize projectile sprite manager with all projectile types
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.loadingPromise) return this.loadingPromise;
    
    console.log('🚀 ProjectileSpriteManager: Starting initialization...');
    
    const projectileTypes = [
      { type: 'arrow', path: '/assets/projectiles/arrow_sheet.png', frames: 16 },
      { type: 'ice_shard', path: '/assets/projectiles/ice_shard_sheet.png', frames: 16 },
      { type: 'fire_bomb', path: '/assets/projectiles/fire_bomb_sheet.png', frames: 16 },
      { type: 'magic_missile', path: '/assets/projectiles/magic_missile_sheet.png', frames: 16 }
    ];
    
    const loadPromises: Promise<void>[] = [];
    let successCount = 0;
    let failCount = 0;
    
    this.loadingPromise = (async () => {
      for (const projectileType of projectileTypes) {
        const spriteSheet = new SpriteSheet();
        this.projectileSheets.set(projectileType.type, spriteSheet);
        
        console.log(`📁 ProjectileSpriteManager: Loading sprite sheet for ${projectileType.type} from: ${projectileType.path}`);
        
        const loadPromise = spriteSheet.load(projectileType.path).then(() => {
          successCount++;
          console.log(`✅ ProjectileSpriteManager: Successfully loaded sprite sheet for ${projectileType.type} (${successCount}/${projectileTypes.length})`);
          console.log(`🎨 Sprite sheet loaded with ${SpriteSheet.getSpriteSize()}x${SpriteSheet.getSpriteSize()} sprites in ${SpriteSheet.getGridSize()}x${SpriteSheet.getGridSize()} grid`);
          
          // Create animation for this projectile type - use all frames (row 0)
          const animation = spriteSheet.createAnimation(WalkDirection.FORWARD, ProjectileSpriteManager.PROJECTILE_FRAME_TIME);
          
          // SURGICAL CHANGE: Override animation frames to use all 16 frames instead of just row 0
          const allFrames: SpriteFrame[] = [];
          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
              const frame = spriteSheet.getSprite(row, col);
              if (frame) {
                allFrames.push(frame);
              }
            }
          }
          animation.frames = allFrames;
          console.log(`🎯 ProjectileSpriteManager: Created animation with ${allFrames.length} frames for ${projectileType.type}`);
          
          const projectileSprite: ProjectileSprite = {
            type: projectileType.type,
            spriteSheet,
            animation,
            frameTime: ProjectileSpriteManager.PROJECTILE_FRAME_TIME
          };
          
          this.projectileSprites.set(projectileType.type, projectileSprite);
        }).catch(error => {
          failCount++;
          console.warn(`❌ ProjectileSpriteManager: Failed to load sprite sheet for ${projectileType.type} (${failCount} failures):`, error);
          console.warn(`🔗 Expected path: ${projectileType.path}`);
          
          // Create a fallback sprite sheet with colored rectangles
          console.log(`🎨 Creating fallback sprite for ${projectileType.type}`);
          this.createFallbackSprite(projectileType.type);
        });
        
        loadPromises.push(loadPromise);
      }
      
      await Promise.all(loadPromises);
      
      this.isInitialized = true;
      console.log(`✅ ProjectileSpriteManager initialization complete: ${successCount} loaded, ${failCount} failed`);
    })();
    
    return this.loadingPromise;
  }
  
  /**
   * Create a fallback sprite for projectiles that failed to load
   * Implements the abstract method from BaseSpriteManager
   */
  protected createFallbackSprite(type: string, config?: SpriteSheetConfig): void {
    const canvas = document.createElement('canvas');
    canvas.width = 192; // SpriteSheet expects 192x192
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Define projectile colors
    const colors: Record<string, string> = {
      arrow: '#8B4513',      // Brown
      ice_shard: '#00FFFF',  // Cyan
      fire_bomb: '#FF4500',  // Orange Red
      magic_missile: '#9370DB' // Medium Purple
    };
    
    const color = colors[type] || '#FFFFFF';
    const spriteSize = 48; // 48x48 per sprite
    
    // Draw 16 frames in a 4x4 grid
    for (let frame = 0; frame < 16; frame++) {
      const col = frame % 4;
      const row = Math.floor(frame / 4);
      const x = col * spriteSize;
      const y = row * spriteSize;
      
      // Draw projectile shape
      ctx.save();
      ctx.translate(x + spriteSize / 2, y + spriteSize / 2);
      ctx.rotate((frame / 16) * Math.PI * 2); // Rotate through frames
      
      // Draw arrow/projectile shape (scaled for 48x48 sprites)
      ctx.fillStyle = color;
      ctx.beginPath();
      if (type === 'arrow') {
        // Arrow shape (scaled down from 192x192 to 48x48)
        ctx.moveTo(-20, 0);
        ctx.lineTo(15, -5);
        ctx.lineTo(20, 0);
        ctx.lineTo(15, 5);
        ctx.closePath();
      } else {
        // Generic projectile shape
        ctx.ellipse(0, 0, 20, 8, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      
      // Add glow effect
      ctx.shadowBlur = 5;
      ctx.shadowColor = color;
      ctx.fill();
      
      ctx.restore();
    }
    
    // Store in base class fallback sprites
    this.fallbackSprites.set(type, canvas);
    
    // Create sprite sheet from canvas and load it
    const spriteSheet = new SpriteSheet();
    const dataUrl = canvas.toDataURL();
    
    // Load the fallback sprite from data URL
    spriteSheet.load(dataUrl).then(() => {
      // Create animation for this projectile type
      const animation = spriteSheet.createAnimation(WalkDirection.FORWARD, ProjectileSpriteManager.PROJECTILE_FRAME_TIME);
      
      // SURGICAL CHANGE: Override animation frames to use all 16 frames instead of just row 0
      const allFrames: SpriteFrame[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const frame = spriteSheet.getSprite(row, col);
          if (frame) {
            allFrames.push(frame);
          }
        }
      }
      animation.frames = allFrames;
      console.log(`🎯 ProjectileSpriteManager: Created fallback animation with ${allFrames.length} frames for ${type}`);
      
      const projectileSprite: ProjectileSprite = {
        type,
        spriteSheet,
        animation,
        frameTime: ProjectileSpriteManager.PROJECTILE_FRAME_TIME
      };
      
      this.projectileSprites.set(type, projectileSprite);
      console.log(`✅ Created fallback sprite for ${type}`);
    }).catch(error => {
      console.error(`Failed to create fallback sprite for ${type}:`, error);
    });
  }
  
  /**
   * Get the current sprite frame for a projectile
   */
  public getProjectileFrame(type: string, timestamp?: number): SpriteFrame | null {
    const projectileSprite = this.projectileSprites.get(type);
    if (!projectileSprite) {
      // Performance optimized: no logging in hot path
      return null;
    }
    
    // Update animation if timestamp provided
    if (timestamp !== undefined) {
      projectileSprite.spriteSheet.updateAnimation(projectileSprite.animation, timestamp);
    }
    
    // Get current animation frame
    const frame = projectileSprite.spriteSheet.getCurrentFrame(projectileSprite.animation);
    return frame;
  }
  
  /**
   * Check if manager is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
  
  /**
   * Get all loaded projectile types
   */
  public getLoadedTypes(): string[] {
    return Array.from(this.projectileSprites.keys());
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.projectileSheets.clear();
    this.projectileSprites.clear();
    this.isInitialized = false;
    this.loadingPromise = null;
  }
}

// Export singleton instance
export const projectileSpriteManager = new ProjectileSpriteManager();