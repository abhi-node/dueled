/**
 * BaseSpriteManager - Base class for sprite management
 * Provides common functionality for loading and managing sprite sheets
 */

export interface SpriteFrame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface SpriteSheetConfig {
  path: string;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  framesPerRow?: number;
}

export abstract class BaseSpriteManager {
  protected spriteSheets: Map<string, HTMLImageElement> = new Map();
  protected frameCache: Map<string, SpriteFrame[]> = new Map();
  protected fallbackSprites: Map<string, HTMLCanvasElement> = new Map();
  protected loadingPromises: Map<string, Promise<void>> = new Map();
  
  constructor() {
    // Initialize in derived classes
  }
  
  /**
   * Load a sprite sheet
   */
  protected async loadSpriteSheet(key: string, config: SpriteSheetConfig): Promise<void> {
    // Check if already loading
    const existingPromise = this.loadingPromises.get(key);
    if (existingPromise) {
      return existingPromise;
    }
    
    const loadPromise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        this.spriteSheets.set(key, img);
        this.createFrameCache(key, img, config);
        console.log(`✅ Loaded sprite sheet: ${key}`);
        resolve();
      };
      
      img.onerror = (error) => {
        console.error(`❌ Failed to load sprite sheet ${key}:`, error);
        this.createFallbackSprite(key, config);
        resolve(); // Resolve anyway with fallback
      };
      
      img.src = config.path;
    });
    
    this.loadingPromises.set(key, loadPromise);
    return loadPromise;
  }
  
  /**
   * Create frame cache from sprite sheet
   */
  protected createFrameCache(key: string, img: HTMLImageElement, config: SpriteSheetConfig): void {
    const frames: SpriteFrame[] = [];
    const framesPerRow = config.framesPerRow || Math.floor(img.width / config.frameWidth);
    
    for (let i = 0; i < config.totalFrames; i++) {
      const col = i % framesPerRow;
      const row = Math.floor(i / framesPerRow);
      
      const canvas = document.createElement('canvas');
      canvas.width = config.frameWidth;
      canvas.height = config.frameHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(
          img,
          col * config.frameWidth,
          row * config.frameHeight,
          config.frameWidth,
          config.frameHeight,
          0,
          0,
          config.frameWidth,
          config.frameHeight
        );
        
        frames.push({ canvas, ctx });
      }
    }
    
    this.frameCache.set(key, frames);
  }
  
  /**
   * Create a fallback sprite when image fails to load
   */
  protected abstract createFallbackSprite(key: string, config: SpriteSheetConfig): void;
  
  /**
   * Get a specific frame from a sprite sheet
   */
  protected getFrame(key: string, frameIndex: number): SpriteFrame | null {
    const frames = this.frameCache.get(key);
    if (!frames || frames.length === 0) {
      // Try fallback
      const fallback = this.fallbackSprites.get(key);
      if (fallback) {
        const ctx = fallback.getContext('2d');
        if (ctx) {
          return { canvas: fallback, ctx };
        }
      }
      return null;
    }
    
    // Wrap frame index
    const safeIndex = frameIndex % frames.length;
    return frames[safeIndex];
  }
  
  /**
   * Initialize the sprite manager
   */
  abstract initialize(): Promise<void>;
  
  /**
   * Dispose of resources
   */
  dispose(): void {
    this.spriteSheets.clear();
    this.frameCache.clear();
    this.fallbackSprites.clear();
    this.loadingPromises.clear();
  }
}