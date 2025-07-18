/**
 * WebGLSpriteRenderer - High-performance instanced sprite rendering
 * 
 * Designed for 1v1 arena combat with Archer vs Berserker
 * Uses instanced rendering for optimal performance with many sprites
 */

import { ShaderManager } from './ShaderManager.js';
import { WebGLContext } from './WebGLContext.js';

export interface SpriteData {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  textureIndex: number;
  color: [number, number, number, number]; // RGBA
  visible: boolean;
}

export interface SpriteAtlas {
  texture: WebGLTexture;
  width: number;
  height: number;
  sprites: Map<string, SpriteRegion>;
}

export interface SpriteRegion {
  name: string;
  u: number;    // UV coordinates
  v: number;
  width: number;  // UV width/height
  height: number;
}

export interface RenderBatch {
  texture: WebGLTexture;
  sprites: SpriteData[];
  count: number;
}

/**
 * WebGLSpriteRenderer - Instanced sprite rendering system
 */
export class WebGLSpriteRenderer {
  private gl: WebGL2RenderingContext;
  private shaderManager: ShaderManager;
  
  private spriteVAO: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  
  private maxInstances: number = 1000;
  private instanceData: Float32Array;
  private instanceCount: number = 0;
  
  private spriteAtlas: SpriteAtlas | null = null;
  private batches: RenderBatch[] = [];
  
  private viewMatrix: Float32Array;
  private projectionMatrix: Float32Array;
  private cameraPosition: [number, number] = [0, 0];
  
  constructor(webglContext: WebGLContext, shaderManager: ShaderManager) {
    this.gl = webglContext.getContext()!;
    this.shaderManager = shaderManager;
    
    // Instance data: position(3) + scale(2) + rotation(1) + texIndex(1) + color(4) = 11 floats per instance
    this.instanceData = new Float32Array(this.maxInstances * 11);
    
    // Initialize matrices
    this.viewMatrix = new Float32Array(16);
    this.projectionMatrix = new Float32Array(16);
    this.createOrthographicMatrix(this.projectionMatrix, -20, 20, -15, 15, -10, 10);
    
    this.initializeSpriteShaders();
    this.createSpriteGeometry();
    
    console.log('WebGLSpriteRenderer initialized:', {
      maxInstances: this.maxInstances,
      instanceDataSize: this.instanceData.length
    });
  }
  
  /**
   * Initialize sprite rendering shaders
   */
  private initializeSpriteShaders(): void {
    const spriteVertexShader = `#version 300 es
      // Per-vertex attributes (quad)
      in vec3 a_position;
      in vec2 a_texCoord;
      
      // Per-instance attributes
      in vec3 a_instancePos;
      in vec2 a_instanceScale;
      in float a_instanceRotation;
      in float a_instanceTexIndex;
      in vec4 a_instanceColor;
      
      uniform mat4 u_projectionMatrix;
      uniform mat4 u_viewMatrix;
      uniform vec2 u_cameraPos;
      
      out vec2 v_texCoord;
      out vec4 v_color;
      out float v_texIndex;
      
      mat2 rotate2D(float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return mat2(c, -s, s, c);
      }
      
      void main() {
        // Apply instance scale and rotation to quad
        vec2 rotatedPos = rotate2D(a_instanceRotation) * (a_position.xy * a_instanceScale);
        
        // Billboard sprite position
        vec3 worldPos = a_instancePos + vec3(rotatedPos, 0.0);
        
        // Apply camera translation
        worldPos.xy -= u_cameraPos;
        
        gl_Position = u_projectionMatrix * u_viewMatrix * vec4(worldPos, 1.0);
        
        v_texCoord = a_texCoord;
        v_color = a_instanceColor;
        v_texIndex = a_instanceTexIndex;
      }`;
    
    const spriteFragmentShader = `#version 300 es
      precision mediump float;
      
      in vec2 v_texCoord;
      in vec4 v_color;
      in float v_texIndex;
      
      uniform sampler2D u_spriteAtlas;
      uniform vec2 u_atlasSize;
      uniform float u_alpha;
      
      out vec4 outColor;
      
      void main() {
        // Sample from sprite atlas
        vec4 texColor = texture(u_spriteAtlas, v_texCoord);
        
        // Alpha test for transparency
        if (texColor.a < 0.1) {
          discard;
        }
        
        // Apply instance color and global alpha
        outColor = texColor * v_color * vec4(1.0, 1.0, 1.0, u_alpha);
      }`;
    
    // Compile instanced sprite shader
    this.shaderManager.compileShader({
      name: 'instanced_sprite',
      vertex: spriteVertexShader,
      fragment: spriteFragmentShader
    });
  }
  
  /**
   * Create sprite geometry and vertex arrays
   */
  private createSpriteGeometry(): void {
    const gl = this.gl;
    
    // Create quad vertices (billboard)
    const quadVertices = new Float32Array([
      // Position     // TexCoord
      -0.5, -0.5, 0.0, 0.0, 0.0,
       0.5, -0.5, 0.0, 1.0, 0.0,
      -0.5,  0.5, 0.0, 0.0, 1.0,
      -0.5,  0.5, 0.0, 0.0, 1.0,
       0.5, -0.5, 0.0, 1.0, 0.0,
       0.5,  0.5, 0.0, 1.0, 1.0
    ]);
    
    // Create quad vertex buffer
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    
    // Create instance data buffer
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);
    
    // Create VAO
    this.spriteVAO = gl.createVertexArray();
    gl.bindVertexArray(this.spriteVAO);
    
    // Set up quad vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    
    // Position
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 5 * 4, 0);
    
    // TexCoord
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
    
    // Set up instance attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    
    const instanceStride = 11 * 4; // 11 floats * 4 bytes
    
    // Instance position (attribute 2)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, instanceStride, 0);
    gl.vertexAttribDivisor(2, 1);
    
    // Instance scale (attribute 3)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, instanceStride, 3 * 4);
    gl.vertexAttribDivisor(3, 1);
    
    // Instance rotation (attribute 4)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, instanceStride, 5 * 4);
    gl.vertexAttribDivisor(4, 1);
    
    // Instance texture index (attribute 5)
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, instanceStride, 6 * 4);
    gl.vertexAttribDivisor(5, 1);
    
    // Instance color (attribute 6)
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 4, gl.FLOAT, false, instanceStride, 7 * 4);
    gl.vertexAttribDivisor(6, 1);
    
    gl.bindVertexArray(null);
  }
  
  /**
   * Load sprite atlas texture
   */
  loadSpriteAtlas(atlasTexture: WebGLTexture, width: number, height: number, sprites: Map<string, SpriteRegion>): void {
    this.spriteAtlas = {
      texture: atlasTexture,
      width,
      height,
      sprites
    };
    
    console.log('Sprite atlas loaded:', {
      size: `${width}x${height}`,
      spriteCount: sprites.size
    });
  }
  
  /**
   * Begin sprite rendering batch
   */
  beginBatch(): void {
    this.instanceCount = 0;
    this.batches.length = 0;
  }
  
  /**
   * Add sprite to current batch
   */
  addSprite(sprite: SpriteData): void {
    if (!sprite.visible || this.instanceCount >= this.maxInstances) {
      return;
    }
    
    const offset = this.instanceCount * 11;
    
    // Position
    this.instanceData[offset + 0] = sprite.x;
    this.instanceData[offset + 1] = sprite.y;
    this.instanceData[offset + 2] = sprite.z;
    
    // Scale
    this.instanceData[offset + 3] = sprite.scaleX;
    this.instanceData[offset + 4] = sprite.scaleY;
    
    // Rotation
    this.instanceData[offset + 5] = sprite.rotation;
    
    // Texture index
    this.instanceData[offset + 6] = sprite.textureIndex;
    
    // Color
    this.instanceData[offset + 7] = sprite.color[0];
    this.instanceData[offset + 8] = sprite.color[1];
    this.instanceData[offset + 9] = sprite.color[2];
    this.instanceData[offset + 10] = sprite.color[3];
    
    this.instanceCount++;
  }
  
  /**
   * Add multiple sprites at once
   */
  addSprites(sprites: SpriteData[]): void {
    for (const sprite of sprites) {
      this.addSprite(sprite);
    }
  }
  
  /**
   * Flush and render current batch
   */
  renderBatch(alpha: number = 1.0): void {
    if (this.instanceCount === 0 || !this.spriteAtlas || !this.spriteVAO) {
      return;
    }
    
    const gl = this.gl;
    
    // Use sprite shader
    const shader = this.shaderManager.useShader('instanced_sprite');
    if (!shader) {
      console.error('Instanced sprite shader not found');
      return;
    }
    
    // Update instance buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, this.instanceCount * 11));
    
    // Set uniforms
    this.shaderManager.setUniform('u_projectionMatrix', this.projectionMatrix);
    this.shaderManager.setUniform('u_viewMatrix', this.viewMatrix);
    this.shaderManager.setUniform('u_cameraPos', this.cameraPosition);
    this.shaderManager.setUniform('u_atlasSize', [this.spriteAtlas.width, this.spriteAtlas.height]);
    this.shaderManager.setUniform('u_alpha', alpha);
    
    // Bind sprite atlas
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.spriteAtlas.texture);
    this.shaderManager.setUniform('u_spriteAtlas', 0);
    
    // Enable blending for sprites
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Render instances
    gl.bindVertexArray(this.spriteVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
    gl.bindVertexArray(null);
    
    // Track render stats
    if (this.gl instanceof WebGLContext) {
      (this.gl as any).trackDrawCall(this.instanceCount * 2); // 2 triangles per sprite
    }
    
    // Reset for next batch
    this.instanceCount = 0;
  }
  
  /**
   * Set camera position for rendering
   */
  setCameraPosition(x: number, y: number): void {
    this.cameraPosition[0] = x;
    this.cameraPosition[1] = y;
    this.updateViewMatrix();
  }
  
  /**
   * Set camera zoom level
   */
  setCameraZoom(zoom: number): void {
    const halfWidth = 20 / zoom;
    const halfHeight = 15 / zoom;
    this.createOrthographicMatrix(this.projectionMatrix, -halfWidth, halfWidth, -halfHeight, halfHeight, -10, 10);
  }
  
  /**
   * Update view matrix based on camera
   */
  private updateViewMatrix(): void {
    // Simple identity matrix for now (camera translation handled in shader)
    this.viewMatrix.fill(0);
    this.viewMatrix[0] = 1;  // m00
    this.viewMatrix[5] = 1;  // m11
    this.viewMatrix[10] = 1; // m22
    this.viewMatrix[15] = 1; // m33
  }
  
  /**
   * Create orthographic projection matrix
   */
  private createOrthographicMatrix(
    out: Float32Array,
    left: number, right: number,
    bottom: number, top: number,
    near: number, far: number
  ): void {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    
    out.fill(0);
    out[0] = -2 * lr;
    out[5] = -2 * bt;
    out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
  }
  
  /**
   * Get sprite region by name
   */
  getSpriteRegion(name: string): SpriteRegion | null {
    return this.spriteAtlas?.sprites.get(name) || null;
  }
  
  /**
   * Create sprite data helper
   */
  createSprite(
    x: number, y: number, z: number = 0,
    spriteName: string,
    scale: number = 1,
    rotation: number = 0,
    color: [number, number, number, number] = [1, 1, 1, 1]
  ): SpriteData | null {
    const region = this.getSpriteRegion(spriteName);
    if (!region) {
      console.warn(`Sprite region '${spriteName}' not found`);
      return null;
    }
    
    return {
      x, y, z,
      scaleX: scale,
      scaleY: scale,
      rotation,
      textureIndex: 0, // Will be handled by atlas UV coordinates
      color,
      visible: true
    };
  }
  
  /**
   * Batch render for players (Archer vs Berserker)
   */
  renderPlayers(players: Array<{
    x: number;
    y: number;
    angle: number;
    classType: 'archer' | 'berserker';
    health: number;
    isAlive: boolean;
  }>): void {
    this.beginBatch();
    
    for (const player of players) {
      if (!player.isAlive) continue;
      
      // Health-based transparency
      const alpha = Math.max(0.3, player.health / 100);
      
      const sprite = this.createSprite(
        player.x,
        player.y,
        1, // Above floor
        player.classType,
        1.5, // Player size
        player.angle,
        [1, 1, 1, alpha]
      );
      
      if (sprite) {
        this.addSprite(sprite);
      }
    }
    
    this.renderBatch();
  }
  
  /**
   * Batch render for projectiles
   */
  renderProjectiles(projectiles: Array<{
    x: number;
    y: number;
    projectileType: string;
    rotation: number;
    scale?: number;
  }>): void {
    this.beginBatch();
    
    for (const projectile of projectiles) {
      const sprite = this.createSprite(
        projectile.x,
        projectile.y,
        0.5, // Above floor, below players
        projectile.projectileType,
        projectile.scale || 0.8,
        projectile.rotation,
        [1, 1, 1, 1]
      );
      
      if (sprite) {
        this.addSprite(sprite);
      }
    }
    
    this.renderBatch();
  }
  
  /**
   * Render UI elements (health bars, etc.)
   */
  renderUI(elements: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    color: [number, number, number, number];
    spriteName?: string;
  }>): void {
    this.beginBatch();
    
    for (const element of elements) {
      const sprite: SpriteData = {
        x: element.x,
        y: element.y,
        z: 10, // UI layer
        scaleX: element.width,
        scaleY: element.height,
        rotation: 0,
        textureIndex: 0,
        color: element.color,
        visible: true
      };
      
      this.addSprite(sprite);
    }
    
    this.renderBatch();
  }
  
  /**
   * Get rendering statistics
   */
  getStats(): {
    maxInstances: number;
    currentInstances: number;
    atlasSize: string;
    memoryUsage: number;
  } {
    const atlasMemory = this.spriteAtlas ? 
      this.spriteAtlas.width * this.spriteAtlas.height * 4 : 0;
    const instanceMemory = this.instanceData.byteLength;
    const quadMemory = 6 * 5 * 4; // 6 vertices * 5 components * 4 bytes
    
    return {
      maxInstances: this.maxInstances,
      currentInstances: this.instanceCount,
      atlasSize: this.spriteAtlas ? 
        `${this.spriteAtlas.width}x${this.spriteAtlas.height}` : 'None',
      memoryUsage: atlasMemory + instanceMemory + quadMemory
    };
  }
  
  /**
   * Resize instance buffer
   */
  resize(newMaxInstances: number): void {
    if (newMaxInstances === this.maxInstances) return;
    
    this.maxInstances = newMaxInstances;
    this.instanceData = new Float32Array(this.maxInstances * 11);
    
    // Update GPU buffer
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);
    
    console.log(`Sprite renderer resized to ${newMaxInstances} max instances`);
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    const gl = this.gl;
    
    if (this.spriteVAO) {
      gl.deleteVertexArray(this.spriteVAO);
      this.spriteVAO = null;
    }
    
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer);
      this.quadBuffer = null;
    }
    
    if (this.instanceBuffer) {
      gl.deleteBuffer(this.instanceBuffer);
      this.instanceBuffer = null;
    }
    
    this.spriteAtlas = null;
    this.batches.length = 0;
    
    console.log('WebGLSpriteRenderer destroyed');
  }
}

/**
 * Helper function to create a simple sprite atlas
 */
export function createSimpleSpriteAtlas(gl: WebGL2RenderingContext): {
  texture: WebGLTexture;
  sprites: Map<string, SpriteRegion>;
} {
  // Create a simple colored atlas for testing
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  // Clear with transparent
  ctx.clearRect(0, 0, size, size);
  
  const sprites = new Map<string, SpriteRegion>();
  
  // Archer sprite (top-left quadrant)
  ctx.fillStyle = '#4CAF50'; // Green
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#2E7D32'; // Darker green for bow
  ctx.fillRect(16, 16, 32, 8);
  sprites.set('archer', { name: 'archer', u: 0, v: 0, width: 64/size, height: 64/size });
  
  // Berserker sprite (top-right quadrant)
  ctx.fillStyle = '#F44336'; // Red
  ctx.fillRect(64, 0, 64, 64);
  ctx.fillStyle = '#B71C1C'; // Darker red for weapon
  ctx.fillRect(80, 16, 8, 32);
  sprites.set('berserker', { name: 'berserker', u: 64/size, v: 0, width: 64/size, height: 64/size });
  
  // Arrow projectile (bottom-left)
  ctx.fillStyle = '#8D6E63'; // Brown
  ctx.fillRect(0, 64, 32, 8);
  ctx.fillStyle = '#5D4037'; // Darker brown
  ctx.fillRect(0, 68, 8, 4);
  sprites.set('arrow', { name: 'arrow', u: 0, v: 64/size, width: 32/size, height: 8/size });
  
  // Sword slash effect (bottom-right)
  ctx.fillStyle = '#FFC107'; // Yellow
  ctx.fillRect(64, 64, 48, 48);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#FF8F00'; // Orange
  ctx.fillRect(72, 72, 32, 32);
  ctx.globalAlpha = 1.0;
  sprites.set('slash', { name: 'slash', u: 64/size, v: 64/size, width: 48/size, height: 48/size });
  
  // Create WebGL texture
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  return { texture, sprites };
}