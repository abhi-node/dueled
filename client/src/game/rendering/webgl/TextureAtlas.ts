/**
 * TextureAtlas - Efficient texture packing system for sprite rendering
 * 
 * Packs all game textures into a single 2048x2048 atlas for optimal performance
 * Designed for 1v1 arena combat with Archer vs Berserker sprites
 */

export interface AtlasRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  u: number;    // Normalized UV coordinates
  v: number;
  uvWidth: number;
  uvHeight: number;
}

export interface AtlasNode {
  x: number;
  y: number;
  width: number;
  height: number;
  used: boolean;
  right?: AtlasNode;
  down?: AtlasNode;
}

export interface PackedTexture {
  source: HTMLImageElement | HTMLCanvasElement | ImageData;
  name: string;
  width: number;
  height: number;
}

/**
 * TextureAtlas - Efficient texture packing and management
 */
export class TextureAtlas {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext;
  
  private atlasTexture: WebGLTexture | null = null;
  private regions: Map<string, AtlasRegion> = new Map();
  private root: AtlasNode;
  
  private size: number;
  private padding: number = 2; // Pixel padding between textures
  
  constructor(gl: WebGL2RenderingContext, size: number = 2048) {
    this.gl = gl;
    this.size = size;
    
    // Create canvas for texture packing
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.context = this.canvas.getContext('2d')!;
    
    // Initialize root node for bin packing
    this.root = {
      x: 0,
      y: 0,
      width: size,
      height: size,
      used: false
    };
    
    console.log(`TextureAtlas initialized: ${size}x${size}`);
  }
  
  /**
   * Pack multiple textures into the atlas
   */
  async packTextures(textures: PackedTexture[]): Promise<boolean> {
    // Clear canvas
    this.context.clearRect(0, 0, this.size, this.size);
    this.regions.clear();
    
    // Reset root node
    this.root = {
      x: 0,
      y: 0,
      width: this.size,
      height: this.size,
      used: false
    };
    
    // Sort textures by area (largest first) for better packing
    const sortedTextures = [...textures].sort((a, b) => 
      (b.width * b.height) - (a.width * a.height)
    );
    
    let packedCount = 0;
    
    for (const texture of sortedTextures) {
      const node = this.findNode(this.root, texture.width + this.padding * 2, texture.height + this.padding * 2);
      
      if (node) {
        const fit = this.splitNode(node, texture.width + this.padding * 2, texture.height + this.padding * 2);
        
        if (fit) {
          // Draw texture to canvas with padding
          const drawX = fit.x + this.padding;
          const drawY = fit.y + this.padding;
          
          try {
            this.context.drawImage(texture.source, drawX, drawY, texture.width, texture.height);
            
            // Create atlas region
            const region: AtlasRegion = {
              name: texture.name,
              x: drawX,
              y: drawY,
              width: texture.width,
              height: texture.height,
              u: drawX / this.size,
              v: drawY / this.size,
              uvWidth: texture.width / this.size,
              uvHeight: texture.height / this.size
            };
            
            this.regions.set(texture.name, region);
            packedCount++;
            
            console.log(`Packed texture '${texture.name}' at (${drawX}, ${drawY})`);
          } catch (error) {
            console.error(`Failed to draw texture '${texture.name}':`, error);
          }
        }
      } else {
        console.warn(`Could not pack texture '${texture.name}' (${texture.width}x${texture.height})`);
      }
    }
    
    console.log(`Packed ${packedCount}/${textures.length} textures into atlas`);
    
    // Create WebGL texture from canvas
    this.createAtlasTexture();
    
    return packedCount === textures.length;
  }
  
  /**
   * Find suitable node for texture placement using bin packing
   */
  private findNode(root: AtlasNode, width: number, height: number): AtlasNode | null {
    if (root.used) {
      // Try right child, then down child
      return this.findNode(root.right!, width, height) || 
             this.findNode(root.down!, width, height);
    } else if (width <= root.width && height <= root.height) {
      // Perfect fit
      return root;
    } else {
      // Doesn't fit
      return null;
    }
  }
  
  /**
   * Split node to accommodate texture
   */
  private splitNode(node: AtlasNode, width: number, height: number): AtlasNode {
    node.used = true;
    
    // Create right and down child nodes
    node.down = {
      x: node.x,
      y: node.y + height,
      width: node.width,
      height: node.height - height,
      used: false
    };
    
    node.right = {
      x: node.x + width,
      y: node.y,
      width: node.width - width,
      height: height,
      used: false
    };
    
    return node;
  }
  
  /**
   * Create WebGL texture from packed canvas
   */
  private createAtlasTexture(): void {
    if (this.atlasTexture) {
      this.gl.deleteTexture(this.atlasTexture);
    }
    
    this.atlasTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.atlasTexture);
    
    // Upload canvas to GPU
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.canvas
    );
    
    // Set texture parameters for pixel art
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    
    console.log('Atlas texture created and uploaded to GPU');
  }
  
  /**
   * Add single texture to atlas (dynamic packing)
   */
  async addTexture(source: HTMLImageElement | HTMLCanvasElement, name: string): Promise<AtlasRegion | null> {
    const width = source.width;
    const height = source.height;
    
    const node = this.findNode(this.root, width + this.padding * 2, height + this.padding * 2);
    
    if (!node) {
      console.warn(`Cannot add texture '${name}' - no space in atlas`);
      return null;
    }
    
    const fit = this.splitNode(node, width + this.padding * 2, height + this.padding * 2);
    const drawX = fit.x + this.padding;
    const drawY = fit.y + this.padding;
    
    // Draw to canvas
    this.context.drawImage(source, drawX, drawY, width, height);
    
    // Create region
    const region: AtlasRegion = {
      name,
      x: drawX,
      y: drawY,
      width,
      height,
      u: drawX / this.size,
      v: drawY / this.size,
      uvWidth: width / this.size,
      uvHeight: height / this.size
    };
    
    this.regions.set(name, region);
    
    // Update GPU texture
    this.updateAtlasTexture(drawX, drawY, width, height, source);
    
    return region;
  }
  
  /**
   * Update specific region of atlas texture
   */
  private updateAtlasTexture(
    x: number, y: number, width: number, height: number,
    source: HTMLImageElement | HTMLCanvasElement
  ): void {
    if (!this.atlasTexture) return;
    
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.atlasTexture);
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      x, y,
      width, height,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    );
  }
  
  /**
   * Get texture region by name
   */
  getRegion(name: string): AtlasRegion | null {
    return this.regions.get(name) || null;
  }
  
  /**
   * Get all regions
   */
  getAllRegions(): Map<string, AtlasRegion> {
    return new Map(this.regions);
  }
  
  /**
   * Get atlas WebGL texture
   */
  getTexture(): WebGLTexture | null {
    return this.atlasTexture;
  }
  
  /**
   * Get atlas canvas (for debugging)
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
  
  /**
   * Get atlas utilization stats
   */
  getStats(): {
    size: number;
    totalPixels: number;
    usedPixels: number;
    utilization: number;
    regionCount: number;
    memoryUsage: number;
  } {
    let usedPixels = 0;
    
    for (const region of this.regions.values()) {
      usedPixels += (region.width + this.padding * 2) * (region.height + this.padding * 2);
    }
    
    const totalPixels = this.size * this.size;
    const utilization = (usedPixels / totalPixels) * 100;
    
    return {
      size: this.size,
      totalPixels,
      usedPixels,
      utilization,
      regionCount: this.regions.size,
      memoryUsage: totalPixels * 4 // RGBA bytes
    };
  }
  
  /**
   * Export atlas as data URL (for debugging)
   */
  exportDataURL(): string {
    return this.canvas.toDataURL();
  }
  
  /**
   * Create debug visualization
   */
  createDebugVisualization(): HTMLCanvasElement {
    const debugCanvas = document.createElement('canvas');
    debugCanvas.width = this.size;
    debugCanvas.height = this.size;
    const ctx = debugCanvas.getContext('2d')!;
    
    // Draw atlas content
    ctx.drawImage(this.canvas, 0, 0);
    
    // Draw region boundaries
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 1;
    
    for (const region of this.regions.values()) {
      ctx.strokeRect(region.x - this.padding, region.y - this.padding, 
                    region.width + this.padding * 2, region.height + this.padding * 2);
      
      // Draw region name
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.fillText(region.name, region.x, region.y - 4);
    }
    
    return debugCanvas;
  }
  
  /**
   * Clear atlas and reset
   */
  clear(): void {
    this.context.clearRect(0, 0, this.size, this.size);
    this.regions.clear();
    
    this.root = {
      x: 0,
      y: 0,
      width: this.size,
      height: this.size,
      used: false
    };
    
    if (this.atlasTexture) {
      this.gl.deleteTexture(this.atlasTexture);
      this.atlasTexture = null;
    }
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.clear();
    console.log('TextureAtlas destroyed');
  }
}

/**
 * Helper function to create default arena sprites
 */
export async function createArenaSprites(): Promise<PackedTexture[]> {
  const sprites: PackedTexture[] = [];
  
  // Create Archer sprite
  const archerCanvas = document.createElement('canvas');
  archerCanvas.width = 64;
  archerCanvas.height = 64;
  const archerCtx = archerCanvas.getContext('2d')!;
  
  // Archer body (green)
  archerCtx.fillStyle = '#4CAF50';
  archerCtx.fillRect(16, 32, 32, 24);
  
  // Archer head
  archerCtx.fillStyle = '#FFDBCB';
  archerCtx.beginPath();
  archerCtx.arc(32, 20, 8, 0, Math.PI * 2);
  archerCtx.fill();
  
  // Bow
  archerCtx.strokeStyle = '#8D6E63';
  archerCtx.lineWidth = 3;
  archerCtx.beginPath();
  archerCtx.arc(48, 32, 12, -Math.PI/2, Math.PI/2, false);
  archerCtx.stroke();
  
  sprites.push({
    source: archerCanvas,
    name: 'archer',
    width: 64,
    height: 64
  });
  
  // Create Berserker sprite
  const berserkerCanvas = document.createElement('canvas');
  berserkerCanvas.width = 64;
  berserkerCanvas.height = 64;
  const berserkerCtx = berserkerCanvas.getContext('2d')!;
  
  // Berserker body (red)
  berserkerCtx.fillStyle = '#F44336';
  berserkerCtx.fillRect(16, 32, 32, 24);
  
  // Berserker head
  berserkerCtx.fillStyle = '#FFDBCB';
  berserkerCtx.beginPath();
  berserkerCtx.arc(32, 20, 8, 0, Math.PI * 2);
  berserkerCtx.fill();
  
  // Sword
  berserkerCtx.fillStyle = '#9E9E9E';
  berserkerCtx.fillRect(48, 16, 4, 32);
  berserkerCtx.fillStyle = '#795548';
  berserkerCtx.fillRect(46, 44, 8, 8);
  
  sprites.push({
    source: berserkerCanvas,
    name: 'berserker',
    width: 64,
    height: 64
  });
  
  // Create Arrow projectile
  const arrowCanvas = document.createElement('canvas');
  arrowCanvas.width = 24;
  arrowCanvas.height = 8;
  const arrowCtx = arrowCanvas.getContext('2d')!;
  
  // Arrow shaft
  arrowCtx.fillStyle = '#8D6E63';
  arrowCtx.fillRect(4, 2, 16, 4);
  
  // Arrow head
  arrowCtx.fillStyle = '#616161';
  arrowCtx.fillRect(20, 1, 4, 6);
  
  // Arrow fletching
  arrowCtx.fillStyle = '#FFC107';
  arrowCtx.fillRect(0, 1, 4, 6);
  
  sprites.push({
    source: arrowCanvas,
    name: 'arrow',
    width: 24,
    height: 8
  });
  
  // Create Sword slash effect
  const slashCanvas = document.createElement('canvas');
  slashCanvas.width = 48;
  slashCanvas.height = 48;
  const slashCtx = slashCanvas.getContext('2d')!;
  
  // Slash arc
  slashCtx.strokeStyle = '#FFC107';
  slashCtx.lineWidth = 6;
  slashCtx.globalAlpha = 0.8;
  slashCtx.beginPath();
  slashCtx.arc(24, 24, 18, -Math.PI/4, Math.PI/4);
  slashCtx.stroke();
  
  sprites.push({
    source: slashCanvas,
    name: 'slash',
    width: 48,
    height: 48
  });
  
  // Create Health bar background
  const healthBgCanvas = document.createElement('canvas');
  healthBgCanvas.width = 64;
  healthBgCanvas.height = 8;
  const healthBgCtx = healthBgCanvas.getContext('2d')!;
  
  healthBgCtx.fillStyle = '#333333';
  healthBgCtx.fillRect(0, 0, 64, 8);
  
  sprites.push({
    source: healthBgCanvas,
    name: 'health_bg',
    width: 64,
    height: 8
  });
  
  // Create Health bar fill
  const healthFillCanvas = document.createElement('canvas');
  healthFillCanvas.width = 64;
  healthFillCanvas.height = 8;
  const healthFillCtx = healthFillCanvas.getContext('2d')!;
  
  const gradient = healthFillCtx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, '#4CAF50');
  gradient.addColorStop(0.5, '#FFC107');
  gradient.addColorStop(1, '#F44336');
  healthFillCtx.fillStyle = gradient;
  healthFillCtx.fillRect(0, 0, 64, 8);
  
  sprites.push({
    source: healthFillCanvas,
    name: 'health_fill',
    width: 64,
    height: 8
  });
  
  return sprites;
}