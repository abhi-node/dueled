/**
 * Simplified Sprite Sheet Manager
 * 
 * This class is purely functional - it loads sprite sheets and provides frames
 * No state management - that's handled by MainGameScene's renderSprites Map
 */

import type { ClassType } from '@dueled/shared';
import { SpriteSheet, type SpriteFrame, type SpriteAnimation, WalkDirection } from './SpriteSheet';

export class SpriteSheetManager {
  private spriteSheets: Map<ClassType, SpriteSheet> = new Map();
  private animationCache: Map<string, SpriteAnimation> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize all sprite sheets for all class types
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const classTypes: ClassType[] = ['berserker', 'mage', 'bomber', 'archer'];
    
    for (const classType of classTypes) {
      try {
        const spriteSheet = new SpriteSheet();
        await spriteSheet.load(`/assets/sprites/players/${classType}/${classType}_walk.png`);
        this.spriteSheets.set(classType, spriteSheet);
        console.log(`✅ SpriteSheetManager: Loaded ${classType} sprite sheet`);
      } catch (error) {
        console.error(`❌ SpriteSheetManager: Failed to load ${classType} sprite sheet:`, error);
      }
    }

    this.isInitialized = true;
    console.log('🎨 SpriteSheetManager: Initialization complete');
  }

  /**
   * Get a sprite frame for a specific class, direction, and animation state
   * This is the main method used by the rendering system
   */
  public getFrame(
    classType: ClassType,
    direction: WalkDirection,
    isMoving: boolean,
    timestamp: number
  ): SpriteFrame | null {
    const spriteSheet = this.spriteSheets.get(classType);
    if (!spriteSheet || !spriteSheet.isReady()) {
      console.warn(`🎨 SpriteSheetManager: No ready sprite sheet for ${classType}`);
      return null;
    }

    // Get cached animation or create new one
    const animationKey = `${classType}_${direction}`;
    let animation = this.animationCache.get(animationKey);
    
    if (!animation) {
      // Create and cache animation for this class and direction
      animation = spriteSheet.createAnimation(direction, 200); // 200ms per frame
      this.animationCache.set(animationKey, animation);
      console.log(`🎬 Created new animation for ${animationKey}`);
    }

    if (isMoving) {
      // CRITICAL: Update animation with timestamp BEFORE getting frame
      spriteSheet.updateAnimation(animation, timestamp);
      return spriteSheet.getCurrentFrame(animation);
    } else {
      // Return first frame (idle pose) for stationary sprites
      return animation.frames[0] || null;
    }
  }

  /**
   * Check if all sprite sheets are loaded and ready
   */
  public isReady(): boolean {
    if (!this.isInitialized) return false;
    
    for (const [classType, spriteSheet] of this.spriteSheets) {
      if (!spriteSheet.isReady()) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get a specific sprite sheet (for debugging)
   */
  public getSpriteSheet(classType: ClassType): SpriteSheet | null {
    return this.spriteSheets.get(classType) || null;
  }

  /**
   * Get the number of loaded sprite sheets
   */
  public getLoadedCount(): number {
    return this.spriteSheets.size;
  }
}

// Export singleton instance
export const spriteSheetManager = new SpriteSheetManager();