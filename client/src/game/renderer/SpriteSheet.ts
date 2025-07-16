/**
 * SpriteSheet - Loads and parses 4x4 character sprite sheets
 * Each sprite sheet is 768x768 pixels with 192x192 individual sprites
 * Rows represent walking directions: forward, right, backward, left
 */

export interface SpriteFrame {
  imageData: ImageData;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface SpriteAnimation {
  frames: SpriteFrame[];
  currentFrame: number;
  frameTime: number;
  lastFrameTime: number;
}

export const WalkDirection = {
  FORWARD: 0,   // First row
  RIGHT: 1,     // Second row
  BACKWARD: 2,  // Third row
  LEFT: 3       // Fourth row
} as const;

export type WalkDirection = typeof WalkDirection[keyof typeof WalkDirection];

export class SpriteSheet {
  private image: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites: SpriteFrame[][] = []; // [row][col]
  private isLoaded: boolean = false;
  private loadPromise: Promise<void> | null = null;
  
  // Sprite sheet configuration
  private static readonly EXPECTED_SHEET_SIZE = 768; // 768x768 total (actual size)
  private static readonly SPRITE_SIZE = 192;  // 192x192 per sprite (768/4)
  private static readonly GRID_SIZE = 4;     // 4x4 grid
  
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SpriteSheet.SPRITE_SIZE;
    this.canvas.height = SpriteSheet.SPRITE_SIZE;
    
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context for sprite sheet canvas');
    }
    this.ctx = ctx;
  }
  
  /**
   * Load a sprite sheet from a URL
   */
  public async load(imageUrl: string): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    
    console.log(`🔄 SpriteSheet: Starting to load image from ${imageUrl}`);
    
    this.loadPromise = new Promise((resolve, reject) => {
      this.image = new Image();
      
      // Add timeout to catch hanging requests
      const timeout = setTimeout(() => {
        console.error(`⏰ SpriteSheet: Timeout loading image from ${imageUrl}`);
        reject(new Error(`Timeout loading sprite sheet: ${imageUrl}`));
      }, 10000); // 10 second timeout
      
      this.image.onload = () => {
        clearTimeout(timeout);
        console.log(`✅ SpriteSheet: Image loaded successfully from ${imageUrl}`);
        if (this.image) {
          console.log(`📏 Image dimensions: ${this.image.width}x${this.image.height}`);
        }
        try {
          this.parseSprites();
          this.isLoaded = true;
          console.log(`🎯 SpriteSheet: Successfully parsed ${this.sprites.length}x${this.sprites[0]?.length} sprites`);
          resolve();
        } catch (error) {
          console.error(`❌ SpriteSheet: Failed to parse sprites from ${imageUrl}:`, error);
          reject(error);
        }
      };
      
      this.image.onerror = (event) => {
        clearTimeout(timeout);
        console.error(`❌ SpriteSheet: Failed to load image from ${imageUrl}`);
        
        // Safely access image properties to prevent null reference errors
        const safeImageData = this.image ? {
          naturalWidth: this.image.naturalWidth || 0,
          naturalHeight: this.image.naturalHeight || 0,
          complete: this.image.complete || false
        } : { naturalWidth: 0, naturalHeight: 0, complete: false };
        
        console.error(`📋 Error details:`, {
          url: imageUrl,
          imageElement: this.image,
          event: event,
          ...safeImageData
        });
        
        // Try to get more specific error information
        if (safeImageData.naturalWidth === 0 && safeImageData.naturalHeight === 0) {
          console.error(`🔍 This appears to be a 404 or network error - image not found`);
        }
        
        reject(new Error(`Failed to load sprite sheet: ${imageUrl}`));
      };
      
      // Set the image source (no CORS needed for same-origin requests)
      this.image.src = imageUrl;
    });
    
    return this.loadPromise;
  }
  
  /**
   * Parse the loaded image into individual sprite frames
   */
  private parseSprites(): void {
    if (!this.image) {
      throw new Error('No image loaded');
    }
    
    // Validate image dimensions
    if (this.image.width !== SpriteSheet.EXPECTED_SHEET_SIZE || this.image.height !== SpriteSheet.EXPECTED_SHEET_SIZE) {
      throw new Error(`Invalid sprite sheet dimensions. Expected ${SpriteSheet.EXPECTED_SHEET_SIZE}x${SpriteSheet.EXPECTED_SHEET_SIZE}, got ${this.image.width}x${this.image.height}`);
    }
    
    // Create temporary canvas for extraction
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.image.width;
    tempCanvas.height = this.image.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) {
      throw new Error('Could not get temporary canvas context');
    }
    
    // Draw the full sprite sheet to temp canvas
    tempCtx.drawImage(this.image, 0, 0);
    
    // Initialize sprites array
    this.sprites = [];
    
    // Extract each sprite
    for (let row = 0; row < SpriteSheet.GRID_SIZE; row++) {
      this.sprites[row] = [];
      
      for (let col = 0; col < SpriteSheet.GRID_SIZE; col++) {
        const x = col * SpriteSheet.SPRITE_SIZE;
        const y = row * SpriteSheet.SPRITE_SIZE;
        
        // Extract sprite image data
        const imageData = tempCtx.getImageData(x, y, SpriteSheet.SPRITE_SIZE, SpriteSheet.SPRITE_SIZE);
        
        // Create individual canvas for this sprite
        const spriteCanvas = document.createElement('canvas');
        spriteCanvas.width = SpriteSheet.SPRITE_SIZE;
        spriteCanvas.height = SpriteSheet.SPRITE_SIZE;
        const spriteCtx = spriteCanvas.getContext('2d');
        
        if (!spriteCtx) {
          throw new Error('Could not get sprite canvas context');
        }
        
        // Put the sprite data on its canvas
        spriteCtx.putImageData(imageData, 0, 0);
        
        this.sprites[row][col] = {
          imageData,
          canvas: spriteCanvas,
          ctx: spriteCtx
        };
      }
    }
    
    console.log(`Loaded sprite sheet with ${this.sprites.length}x${this.sprites[0].length} sprites`);
  }
  
  /**
   * Get a specific sprite frame
   */
  public getSprite(row: number, col: number): SpriteFrame | null {
    if (!this.isLoaded) {
      console.warn('Sprite sheet not loaded yet');
      return null;
    }
    
    if (row < 0 || row >= SpriteSheet.GRID_SIZE || col < 0 || col >= SpriteSheet.GRID_SIZE) {
      console.warn(`Invalid sprite coordinates: (${row}, ${col})`);
      return null;
    }
    
    return this.sprites[row][col];
  }
  
  /**
   * Get a sprite by walking direction and frame
   */
  public getSpriteByDirection(direction: WalkDirection, frame: number): SpriteFrame | null {
    const clampedFrame = Math.max(0, Math.min(SpriteSheet.GRID_SIZE - 1, frame));
    return this.getSprite(direction, clampedFrame);
  }
  
  /**
   * Get all sprites for a walking direction (entire row)
   */
  public getWalkingAnimation(direction: WalkDirection): SpriteFrame[] {
    if (!this.isLoaded) {
      console.warn('Sprite sheet not loaded yet');
      return [];
    }
    
    return this.sprites[direction] || [];
  }
  
  /**
   * Create a sprite animation for a walking direction
   */
  public createAnimation(direction: WalkDirection, frameTime: number = 200): SpriteAnimation {
    return {
      frames: this.getWalkingAnimation(direction),
      currentFrame: 0,
      frameTime,
      lastFrameTime: 0
    };
  }
  
  /**
   * Update animation frame based on time
   */
  public updateAnimation(animation: SpriteAnimation, currentTime: number): void {
    if (animation.frames.length === 0) return;
    
    if (currentTime - animation.lastFrameTime >= animation.frameTime) {
      animation.currentFrame = (animation.currentFrame + 1) % animation.frames.length;
      animation.lastFrameTime = currentTime;
    }
  }
  
  /**
   * Get current frame from animation
   */
  public getCurrentFrame(animation: SpriteAnimation): SpriteFrame | null {
    if (animation.frames.length === 0) return null;
    return animation.frames[animation.currentFrame];
  }
  
  /**
   * Check if sprite sheet is loaded
   */
  public isReady(): boolean {
    return this.isLoaded;
  }
  
  /**
   * Get sprite dimensions
   */
  public static getSpriteSize(): number {
    return SpriteSheet.SPRITE_SIZE;
  }
  
  /**
   * Get grid size
   */
  public static getGridSize(): number {
    return SpriteSheet.GRID_SIZE;
  }
  
  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.sprites = [];
    this.isLoaded = false;
    this.loadPromise = null;
    if (this.image) {
      this.image.src = '';
      this.image = null;
    }
  }
}