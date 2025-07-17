/**
 * TextureManager - Loads and manages textures for walls, floors, and ceilings
 */

export interface Texture {
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
  width: number;
  height: number;
  scaledCanvas?: HTMLCanvasElement; // 128x128 scaled version
  scaledImageData?: ImageData;
}

export class TextureManager {
  private textures: Map<string, Texture> = new Map();
  private loadPromises: Map<string, Promise<Texture>> = new Map();
  
  // Target size for scaled textures
  private readonly SCALED_SIZE = 128;
  
  // Texture categories - only stone for now
  private wallTextures: string[] = ['stone'];
  private floorTextures: string[] = ['stone'];
  private ceilingTextures: string[] = ['stone'];
  
  /**
   * Initialize and load all textures
   */
  public async initialize(): Promise<void> {
    console.log('🎨 TextureManager: Starting initialization...');
    
    const loadPromises: Promise<void>[] = [];
    
    // Load wall textures
    for (const textureName of this.wallTextures) {
      const promise = this.loadTexture(`wall_${textureName}`, `/assets/textures/walls/wall_${textureName}.png`)
        .then(() => console.log(`✅ Loaded wall texture: ${textureName}`))
        .catch(err => console.warn(`❌ Failed to load wall texture ${textureName}:`, err));
      loadPromises.push(promise);
    }
    
    // Load floor textures
    for (const textureName of this.floorTextures) {
      const promise = this.loadTexture(`floor_${textureName}`, `/assets/textures/floors/floor_${textureName}.png`)
        .then(() => console.log(`✅ Loaded floor texture: ${textureName}`))
        .catch(err => console.warn(`❌ Failed to load floor texture ${textureName}:`, err));
      loadPromises.push(promise);
    }
    
    // Load ceiling textures
    for (const textureName of this.ceilingTextures) {
      const promise = this.loadTexture(`ceiling_${textureName}`, `/assets/textures/ceilings/ceiling_${textureName}.png`)
        .then(() => console.log(`✅ Loaded ceiling texture: ${textureName}`))
        .catch(err => console.warn(`❌ Failed to load ceiling texture ${textureName}:`, err));
      loadPromises.push(promise);
    }
    
    await Promise.allSettled(loadPromises);
    console.log(`🎯 TextureManager: Loaded ${this.textures.size} textures`);
  }
  
  /**
   * Load a single texture
   */
  private async loadTexture(name: string, url: string): Promise<Texture> {
    // Check if already loading
    if (this.loadPromises.has(name)) {
      return this.loadPromises.get(name)!;
    }
    
    // Check if already loaded
    if (this.textures.has(name)) {
      return this.textures.get(name)!;
    }
    
    // Create load promise
    const loadPromise = new Promise<Texture>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      
      image.onload = () => {
        try {
          // Create canvas for texture
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            throw new Error('Could not get 2D context');
          }
          
          // Draw image to canvas
          ctx.drawImage(image, 0, 0);
          
          // Get image data for pixel access
          const imageData = ctx.getImageData(0, 0, image.width, image.height);
          
          // Create scaled 64x64 version for performance
          const scaledCanvas = document.createElement('canvas');
          scaledCanvas.width = this.SCALED_SIZE;
          scaledCanvas.height = this.SCALED_SIZE;
          const scaledCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
          
          if (!scaledCtx) {
            throw new Error('Could not get 2D context for scaled canvas');
          }
          
          // Draw scaled version
          scaledCtx.imageSmoothingEnabled = false; // Preserve pixelated look
          scaledCtx.drawImage(image, 0, 0, this.SCALED_SIZE, this.SCALED_SIZE);
          
          // Get scaled image data
          const scaledImageData = scaledCtx.getImageData(0, 0, this.SCALED_SIZE, this.SCALED_SIZE);
          
          const texture: Texture = {
            image,
            canvas,
            ctx,
            imageData,
            width: image.width,
            height: image.height,
            scaledCanvas,
            scaledImageData
          };
          
          this.textures.set(name, texture);
          resolve(texture);
        } catch (error) {
          reject(error);
        }
      };
      
      image.onerror = () => {
        reject(new Error(`Failed to load texture: ${url}`));
      };
      
      // OPTIMIZED: Removed cache-busting to avoid texture reloading
      image.src = url;
    });
    
    this.loadPromises.set(name, loadPromise);
    return loadPromise;
  }
  
  /**
   * Get a texture by name
   */
  public getTexture(name: string): Texture | null {
    return this.textures.get(name) || null;
  }
  
  /**
   * Get texture for a specific wall type
   */
  public getWallTexture(wallType: number): Texture | null {
    // For now, always return stone texture for all wall types
    return this.getTexture('wall_stone');
  }
  
  /**
   * Get texture for floor
   */
  public getFloorTexture(floorType: number = 1): Texture | null {
    // For now, always return stone texture
    return this.getTexture('floor_stone');
  }
  
  /**
   * Get texture for ceiling
   */
  public getCeilingTexture(ceilingType: number = 1): Texture | null {
    // For now, always return stone texture
    return this.getTexture('ceiling_stone');
  }
  
  /**
   * Get pixel color from texture at UV coordinates
   */
  public getTexturePixel(texture: Texture, u: number, v: number): { r: number; g: number; b: number; a: number } {
    // Wrap UV coordinates
    u = u % 1;
    v = v % 1;
    if (u < 0) u += 1;
    if (v < 0) v += 1;
    
    // Use scaled texture for performance
    const useScaled = texture.scaledImageData !== undefined;
    const imageData = useScaled ? texture.scaledImageData! : texture.imageData;
    const width = useScaled ? this.SCALED_SIZE : texture.width;
    const height = useScaled ? this.SCALED_SIZE : texture.height;
    
    // Convert to pixel coordinates
    const x = Math.floor(u * width);
    const y = Math.floor(v * height);
    
    // Get pixel data
    const index = (y * width + x) * 4;
    const data = imageData.data;
    
    return {
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
      a: data[index + 3]
    };
  }
  
  /**
   * Dispose of all textures
   */
  public dispose(): void {
    this.textures.clear();
    this.loadPromises.clear();
  }
}