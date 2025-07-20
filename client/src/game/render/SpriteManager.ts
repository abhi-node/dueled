/**
 * SpriteManager - Handles sprite sheet loading and frame rendering
 * 
 * Manages 4x4 sprite sheets (192x192) with 48x48 frames for player rendering.
 * Currently renders static frame (0,0) with support for future animation.
 */

export interface FrameCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ClassType = 'gunslinger' | 'demolitionist' | 'buckshot';

export class SpriteManager {
  // Sprite sheet constants
  private static readonly FRAME_SIZE = 48;
  private static readonly GRID_SIZE = 4;
  private static readonly SHEET_SIZE = SpriteManager.FRAME_SIZE * SpriteManager.GRID_SIZE; // 192x192
  
  // Sprite sheet cache
  private spriteSheets: Map<string, HTMLImageElement> = new Map();
  private loadingPromises: Map<string, Promise<HTMLImageElement>> = new Map();
  
  constructor() {
    // Initialize empty cache
  }
  
  /**
   * Get sprite sheet file path for player class
   */
  private getSpriteSheetPath(classType: ClassType): string {
    return `/assets/sprites/players/${classType}-sheet.png`;
  }
  
  /**
   * Calculate frame coordinates from row/col position
   */
  private getFrameCoordinates(row: number, col: number): FrameCoordinates {
    return {
      x: col * SpriteManager.FRAME_SIZE,
      y: row * SpriteManager.FRAME_SIZE,
      width: SpriteManager.FRAME_SIZE,
      height: SpriteManager.FRAME_SIZE
    };
  }
  
  /**
   * Load sprite sheet for given class type
   */
  async loadSpriteSheet(classType: ClassType): Promise<HTMLImageElement> {
    const path = this.getSpriteSheetPath(classType);
    
    // Return cached sprite if already loaded
    if (this.spriteSheets.has(classType)) {
      return this.spriteSheets.get(classType)!;
    }
    
    // Return existing loading promise if already in progress
    if (this.loadingPromises.has(classType)) {
      return this.loadingPromises.get(classType)!;
    }
    
    // Start loading sprite sheet
    const loadingPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // Cache the loaded sprite sheet
        this.spriteSheets.set(classType, img);
        this.loadingPromises.delete(classType);
        resolve(img);
      };
      
      img.onerror = () => {
        this.loadingPromises.delete(classType);
        reject(new Error(`Failed to load sprite sheet: ${path}`));
      };
      
      img.src = path;
    });
    
    this.loadingPromises.set(classType, loadingPromise);
    return loadingPromise;
  }
  
  /**
   * Draw specific frame from sprite sheet
   */
  drawFrame(
    ctx: CanvasRenderingContext2D,
    classType: ClassType,
    row: number,
    col: number,
    destX: number,
    destY: number
  ): boolean {
    const spriteSheet = this.spriteSheets.get(classType);
    
    if (!spriteSheet) {
      console.warn(`Sprite sheet not loaded for class: ${classType}`);
      return false;
    }
    
    const frameCoords = this.getFrameCoordinates(row, col);
    
    try {
      // Draw frame from sprite sheet to canvas
      ctx.drawImage(
        spriteSheet,
        frameCoords.x, frameCoords.y, frameCoords.width, frameCoords.height, // Source
        destX - SpriteManager.FRAME_SIZE / 2, destY - SpriteManager.FRAME_SIZE / 2, // Destination (centered)
        SpriteManager.FRAME_SIZE, SpriteManager.FRAME_SIZE // Size
      );
      return true;
    } catch (error) {
      console.error(`Error drawing frame (${row}, ${col}) for ${classType}:`, error);
      return false;
    }
  }
  
  /**
   * Draw forward-facing frame (0,0) for player
   */
  drawPlayerSprite(
    ctx: CanvasRenderingContext2D,
    classType: ClassType,
    x: number,
    y: number
  ): boolean {
    return this.drawFrame(ctx, classType, 0, 0, x, y);
  }
  
  /**
   * Preload all player sprite sheets
   */
  async preloadAllSprites(): Promise<void> {
    const classTypes: ClassType[] = ['gunslinger', 'demolitionist', 'buckshot'];
    
    try {
      await Promise.all(
        classTypes.map(classType => this.loadSpriteSheet(classType))
      );
      console.log('All player sprite sheets loaded successfully');
    } catch (error) {
      console.error('Failed to preload some sprite sheets:', error);
      throw error;
    }
  }
  
  /**
   * Check if sprite sheet is loaded for given class
   */
  isLoaded(classType: ClassType): boolean {
    return this.spriteSheets.has(classType);
  }
  
  /**
   * Get frame size for positioning calculations
   */
  static getFrameSize(): number {
    return SpriteManager.FRAME_SIZE;
  }
}