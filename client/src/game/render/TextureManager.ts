/**
 * TextureManager - Handles loading and sampling 64×64 wall textures
 * 
 * Loads PNG textures from /assets/textures/walls/ and provides fast pixel access
 * for raycasting texture mapping.
 */

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export class TextureManager {
  private textures: Map<string, ImageData> = new Map();
  private textureImages: Map<string, HTMLImageElement> = new Map(); // For drawImage optimization
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loadingPromises: Map<string, Promise<void>> = new Map();
  
  // Texture constants
  private readonly TEXTURE_SIZE = 64;
  private readonly TEXTURE_BASE_PATH = '/assets/textures/walls/';
  
  constructor() {
    // Create off-screen canvas for texture processing
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.TEXTURE_SIZE;
    this.canvas.height = this.TEXTURE_SIZE;
    
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create 2D context for TextureManager');
    }
    this.ctx = ctx;
    
    console.log('TextureManager initialized for 64×64 textures');
  }
  
  /**
   * Load a texture from the assets directory
   */
  async loadTexture(textureId: string): Promise<void> {
    // Return existing loading promise if already loading
    if (this.loadingPromises.has(textureId)) {
      return this.loadingPromises.get(textureId)!;
    }
    
    // Return immediately if already loaded
    if (this.textures.has(textureId)) {
      return Promise.resolve();
    }
    
    const loadPromise = this.loadTextureInternal(textureId);
    this.loadingPromises.set(textureId, loadPromise);
    
    try {
      await loadPromise;
    } finally {
      this.loadingPromises.delete(textureId);
    }
  }
  
  /**
   * Internal texture loading implementation
   */
  private async loadTextureInternal(textureId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const imagePath = `${this.TEXTURE_BASE_PATH}${textureId}.png`;
      
      img.onload = () => {
        try {
          // Verify texture dimensions
          if (img.width !== this.TEXTURE_SIZE || img.height !== this.TEXTURE_SIZE) {
            throw new Error(`Texture ${textureId} is ${img.width}×${img.height}, expected ${this.TEXTURE_SIZE}×${this.TEXTURE_SIZE}`);
          }
          
          // Draw image to canvas and extract pixel data
          this.ctx.clearRect(0, 0, this.TEXTURE_SIZE, this.TEXTURE_SIZE);
          this.ctx.drawImage(img, 0, 0);
          
          const imageData = this.ctx.getImageData(0, 0, this.TEXTURE_SIZE, this.TEXTURE_SIZE);
          this.textures.set(textureId, imageData);
          
          // Store the image element for fast drawImage operations
          this.textureImages.set(textureId, img);
          
          console.log(`✅ Texture loaded: ${textureId} (${img.width}×${img.height})`);
          resolve();
        } catch (error) {
          console.error(`❌ Failed to process texture ${textureId}:`, error);
          reject(error);
        }
      };
      
      img.onerror = () => {
        const error = new Error(`Failed to load texture: ${imagePath}`);
        console.error(`❌ Texture load failed: ${textureId} at ${imagePath}`);
        reject(error);
      };
      
      img.src = imagePath;
    });
  }
  
  /**
   * Get pixel color at specific texture coordinates
   * @param textureId - ID of the texture
   * @param u - U coordinate (0-63)
   * @param v - V coordinate (0-63) 
   * @returns RGBA color values
   */
  getPixel(textureId: string, u: number, v: number): RGBAColor | null {
    const texture = this.textures.get(textureId);
    if (!texture) {
      console.warn(`Texture not found: ${textureId}`);
      return null;
    }
    
    // Clamp coordinates to texture bounds
    const x = Math.floor(Math.max(0, Math.min(this.TEXTURE_SIZE - 1, u)));
    const y = Math.floor(Math.max(0, Math.min(this.TEXTURE_SIZE - 1, v)));
    
    // Calculate pixel index in ImageData array (RGBA = 4 bytes per pixel)
    const pixelIndex = (y * this.TEXTURE_SIZE + x) * 4;
    const data = texture.data;
    
    return {
      r: data[pixelIndex],     // Red
      g: data[pixelIndex + 1], // Green
      b: data[pixelIndex + 2], // Blue
      a: data[pixelIndex + 3]  // Alpha
    };
  }
  
  /**
   * Get pixel color as CSS rgba string
   */
  getPixelAsCSS(textureId: string, u: number, v: number): string | null {
    const pixel = this.getPixel(textureId, u, v);
    if (!pixel) {
      return null;
    }
    
    return `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`;
  }
  
  /**
   * Get texture image for fast drawImage operations
   */
  getTextureImage(textureId: string): HTMLImageElement | null {
    return this.textureImages.get(textureId) || null;
  }
  
  /**
   * Check if a texture is loaded
   */
  isTextureLoaded(textureId: string): boolean {
    return this.textures.has(textureId) && this.textureImages.has(textureId);
  }
  
  /**
   * Get all loaded texture IDs
   */
  getLoadedTextures(): string[] {
    return Array.from(this.textures.keys());
  }
  
  /**
   * Preload multiple textures
   */
  async preloadTextures(textureIds: string[]): Promise<void> {
    console.log(`Preloading ${textureIds.length} textures...`);
    
    const loadPromises = textureIds.map(id => 
      this.loadTexture(id).catch(error => {
        console.warn(`Failed to preload texture ${id}:`, error);
        // Continue loading other textures even if one fails
      })
    );
    
    await Promise.allSettled(loadPromises);
    
    const loadedCount = textureIds.filter(id => this.isTextureLoaded(id)).length;
    console.log(`✅ Preloaded ${loadedCount}/${textureIds.length} textures`);
  }
  
  /**
   * Clear all loaded textures (for memory management)
   */
  clearTextures(): void {
    this.textures.clear();
    this.textureImages.clear();
    this.loadingPromises.clear();
    console.log('All textures cleared from memory');
  }
  
  /**
   * Get memory usage info for debugging
   */
  getMemoryInfo(): { textureCount: number; estimatedMemoryMB: number } {
    const textureCount = this.textures.size;
    // Each 64×64 RGBA texture = 64 * 64 * 4 bytes = 16,384 bytes ≈ 16KB
    const estimatedMemoryMB = (textureCount * 16 * 1024) / (1024 * 1024);
    
    return { textureCount, estimatedMemoryMB };
  }
}