/**
 * GPURaycaster - GPU-accelerated raycasting for arena environments
 * 
 * Replaces CPU-intensive raycasting with WebGL shaders for 60 FPS performance
 * Designed for 1v1 arena combat with simple wall rendering
 */

import { ShaderManager } from './ShaderManager.js';
import { WebGLContext } from './WebGLContext.js';

export interface ArenaWall {
  start: { x: number; y: number };
  end: { x: number; y: number };
  height: number;
  textureId: number;
}

export interface ArenaMap {
  walls: ArenaWall[];
  floorTexture: number;
  ceilingTexture: number;
  ambientLight: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface RaycastSettings {
  fov: number;          // Field of view in radians
  maxDistance: number;  // Maximum ray distance
  wallHeight: number;   // Standard wall height
  resolution: number;   // Ray resolution multiplier
}

export interface ViewState {
  playerX: number;
  playerY: number;
  playerAngle: number;
  playerHeight: number;
}

/**
 * GPURaycaster - High-performance WebGL raycasting
 */
export class GPURaycaster {
  private gl: WebGL2RenderingContext;
  private shaderManager: ShaderManager;
  private canvas: HTMLCanvasElement;
  
  private raycastFramebuffer: WebGLFramebuffer | null = null;
  private raycastTexture: WebGLTexture | null = null;
  private raycastDepthBuffer: WebGLRenderbuffer | null = null;
  
  private wallDataTexture: WebGLTexture | null = null;
  private floorQuadBuffer: WebGLBuffer | null = null;
  private wallQuadVAO: WebGLVertexArrayObject | null = null;
  
  private settings: RaycastSettings;
  private arenaMap: ArenaMap | null = null;
  
  private renderWidth: number;
  private renderHeight: number;
  
  constructor(webglContext: WebGLContext, shaderManager: ShaderManager) {
    this.gl = webglContext.getContext()!;
    this.shaderManager = shaderManager;
    this.canvas = webglContext.getCanvas();
    
    this.renderWidth = this.canvas.width;
    this.renderHeight = this.canvas.height;
    
    this.settings = {
      fov: Math.PI / 3, // 60 degrees
      maxDistance: 50.0,
      wallHeight: 2.0,
      resolution: 1.0
    };
    
    this.initializeRaycastShaders();
    this.createFramebuffer();
    this.createGeometry();
    
    console.log('GPURaycaster initialized:', {
      resolution: `${this.renderWidth}x${this.renderHeight}`,
      settings: this.settings
    });
  }
  
  /**
   * Initialize specialized raycasting shaders
   */
  private initializeRaycastShaders(): void {
    // Advanced raycasting fragment shader
    const raycastFragmentShader = `#version 300 es
      precision highp float;
      
      in vec2 v_texCoord;
      in vec2 v_screenPos;
      
      uniform vec2 u_resolution;
      uniform vec2 u_playerPos;
      uniform float u_playerAngle;
      uniform float u_playerHeight;
      uniform float u_fov;
      uniform float u_maxDistance;
      uniform float u_wallHeight;
      uniform float u_time;
      uniform sampler2D u_wallData;
      uniform sampler2D u_wallTexture;
      
      out vec4 outColor;
      
      // Arena boundaries (simple box for now)
      const vec2 ARENA_MIN = vec2(-15.0, -15.0);
      const vec2 ARENA_MAX = vec2(15.0, 15.0);
      
      // Distance to arena walls
      float distanceToWalls(vec2 pos) {
        vec2 d = max(ARENA_MIN - pos, pos - ARENA_MAX);
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }
      
      // Simple raycast against arena boundaries
      vec3 raycastArena(vec2 origin, vec2 direction) {
        float t = 0.0;
        vec3 color = vec3(0.1, 0.1, 0.15); // Background/sky
        
        // March the ray
        for (int i = 0; i < 128; i++) {
          vec2 pos = origin + direction * t;
          float dist = distanceToWalls(pos);
          
          if (dist < 0.01) {
            // Hit wall - calculate lighting
            float lighting = 1.0 - (t / u_maxDistance);
            lighting = clamp(lighting, 0.2, 1.0);
            
            // Simple wall color based on position
            vec3 wallColor = vec3(0.6, 0.6, 0.7);
            if (abs(pos.x - ARENA_MIN.x) < 0.1 || abs(pos.x - ARENA_MAX.x) < 0.1) {
              wallColor = vec3(0.7, 0.5, 0.5); // Red-ish for X walls
            }
            if (abs(pos.y - ARENA_MIN.y) < 0.1 || abs(pos.y - ARENA_MAX.y) < 0.1) {
              wallColor = vec3(0.5, 0.7, 0.5); // Green-ish for Y walls
            }
            
            color = wallColor * lighting;
            break;
          }
          
          t += max(dist * 0.5, 0.01); // Step forward
          if (t > u_maxDistance) break;
        }
        
        return color;
      }
      
      void main() {
        // Convert screen coordinates to ray direction
        vec2 uv = v_texCoord;
        float screenX = (uv.x - 0.5) * 2.0; // -1 to 1
        
        // Calculate ray direction based on FOV
        float rayAngle = u_playerAngle + screenX * (u_fov * 0.5);
        vec2 rayDir = vec2(cos(rayAngle), sin(rayAngle));
        
        // Cast ray and get color
        vec3 wallColor = raycastArena(u_playerPos, rayDir);
        
        // Height-based rendering (simple floor/ceiling)
        float screenY = (uv.y - 0.5) * 2.0; // -1 to 1
        float horizon = (u_playerHeight - 1.0) * 0.1; // Adjust horizon based on player height
        
        vec3 finalColor;
        if (screenY > horizon + 0.3) {
          // Ceiling
          finalColor = vec3(0.3, 0.3, 0.4);
        } else if (screenY < horizon - 0.3) {
          // Floor
          finalColor = vec3(0.4, 0.4, 0.3);
        } else {
          // Walls
          finalColor = wallColor;
        }
        
        // Add some fog/distance fading
        float fogFactor = 1.0 - clamp(length(rayDir * 20.0) / u_maxDistance, 0.0, 0.8);
        finalColor *= fogFactor;
        
        outColor = vec4(finalColor, 1.0);
      }`;
    
    // Vertex shader for fullscreen quad
    const raycastVertexShader = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      
      out vec2 v_texCoord;
      out vec2 v_screenPos;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
        v_screenPos = a_position;
      }`;
    
    // Compile raycasting shader
    this.shaderManager.compileShader({
      name: 'gpu_raycaster',
      vertex: raycastVertexShader,
      fragment: raycastFragmentShader
    });
  }
  
  /**
   * Create framebuffer for off-screen rendering
   */
  private createFramebuffer(): void {
    const gl = this.gl;
    
    // Create framebuffer
    this.raycastFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.raycastFramebuffer);
    
    // Create color texture
    this.raycastTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.raycastTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.renderWidth, this.renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Attach color texture to framebuffer
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.raycastTexture, 0);
    
    // Create depth buffer
    this.raycastDepthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.raycastDepthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.renderWidth, this.renderHeight);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.raycastDepthBuffer);
    
    // Check framebuffer completeness
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Raycast framebuffer not complete');
    }
    
    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  
  /**
   * Create geometry for rendering
   */
  private createGeometry(): void {
    const gl = this.gl;
    
    // Create fullscreen quad for raycasting
    const quadVertices = new Float32Array([
      // Position  // TexCoord
      -1.0, -1.0,  0.0, 0.0,
       1.0, -1.0,  1.0, 0.0,
      -1.0,  1.0,  0.0, 1.0,
      -1.0,  1.0,  0.0, 1.0,
       1.0, -1.0,  1.0, 0.0,
       1.0,  1.0,  1.0, 1.0
    ]);
    
    this.floorQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.floorQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    
    // Create VAO for the quad
    this.wallQuadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.wallQuadVAO);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.floorQuadBuffer);
    
    // Position attribute
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * 4, 0);
    
    // TexCoord attribute
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
    
    gl.bindVertexArray(null);
  }
  
  /**
   * Load arena map for raycasting
   */
  loadArenaMap(map: ArenaMap): void {
    this.arenaMap = map;
    this.updateWallDataTexture();
    console.log('Arena map loaded:', {
      walls: map.walls.length,
      bounds: map.bounds
    });
  }
  
  /**
   * Update wall data texture for GPU access
   */
  private updateWallDataTexture(): void {
    if (!this.arenaMap) return;
    
    const gl = this.gl;
    const walls = this.arenaMap.walls;
    
    // Pack wall data into texture (each wall = 4 pixels: startX, startY, endX, endY, height, textureId, ...)
    const wallData = new Float32Array(walls.length * 8); // 2 pixels per wall, RGBA per pixel
    
    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      const offset = i * 8;
      
      // First pixel: start position + end X
      wallData[offset + 0] = wall.start.x;
      wallData[offset + 1] = wall.start.y;
      wallData[offset + 2] = wall.end.x;
      wallData[offset + 3] = wall.end.y;
      
      // Second pixel: height, texture, and unused
      wallData[offset + 4] = wall.height;
      wallData[offset + 5] = wall.textureId;
      wallData[offset + 6] = 0.0; // Unused
      wallData[offset + 7] = 0.0; // Unused
    }
    
    // Create or update wall data texture
    if (!this.wallDataTexture) {
      this.wallDataTexture = gl.createTexture();
    }
    
    gl.bindTexture(gl.TEXTURE_2D, this.wallDataTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, walls.length * 2, 1, 0, gl.RGBA, gl.FLOAT, wallData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  
  /**
   * Render raycasted view to framebuffer
   */
  renderRaycastView(viewState: ViewState): WebGLTexture | null {
    if (!this.raycastFramebuffer || !this.wallQuadVAO) {
      console.warn('GPURaycaster not properly initialized');
      return null;
    }
    
    const gl = this.gl;
    
    // Bind raycast framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.raycastFramebuffer);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);
    
    // Use raycasting shader
    const shader = this.shaderManager.useShader('gpu_raycaster');
    if (!shader) {
      console.error('GPU raycaster shader not found');
      return null;
    }
    
    // Set uniforms
    this.shaderManager.setUniform('u_resolution', [this.renderWidth, this.renderHeight]);
    this.shaderManager.setUniform('u_playerPos', [viewState.playerX, viewState.playerY]);
    this.shaderManager.setUniform('u_playerAngle', viewState.playerAngle);
    this.shaderManager.setUniform('u_playerHeight', viewState.playerHeight);
    this.shaderManager.setUniform('u_fov', this.settings.fov);
    this.shaderManager.setUniform('u_maxDistance', this.settings.maxDistance);
    this.shaderManager.setUniform('u_wallHeight', this.settings.wallHeight);
    this.shaderManager.setUniform('u_time', performance.now() * 0.001);
    
    // Bind wall data texture if available
    if (this.wallDataTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.wallDataTexture);
      this.shaderManager.setUniform('u_wallData', 0);
    }
    
    // Clear and render fullscreen quad
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.bindVertexArray(this.wallQuadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    
    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    return this.raycastTexture;
  }
  
  /**
   * Present raycast result to screen
   */
  presentToScreen(): void {
    if (!this.raycastTexture) return;
    
    const gl = this.gl;
    
    // Bind back buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    
    // Use basic shader for presentation
    const shader = this.shaderManager.useShader('ui');
    if (!shader) return;
    
    // Create identity projection for fullscreen quad
    const projectionMatrix = new Float32Array([
      2.0, 0.0, 0.0, 0.0,
      0.0, 2.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      -1.0, -1.0, 0.0, 1.0
    ]);
    
    this.shaderManager.setUniform('u_projectionMatrix', projectionMatrix);
    this.shaderManager.setUniform('u_hasTexture', 1);
    
    // Bind raycast texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.raycastTexture);
    this.shaderManager.setUniform('u_texture', 0);
    
    // Render fullscreen quad
    if (this.wallQuadVAO) {
      gl.bindVertexArray(this.wallQuadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }
  }
  
  /**
   * Update rendering settings
   */
  updateSettings(newSettings: Partial<RaycastSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    console.log('Raycast settings updated:', this.settings);
  }
  
  /**
   * Resize rendering resolution
   */
  resize(width: number, height: number): void {
    if (width === this.renderWidth && height === this.renderHeight) return;
    
    this.renderWidth = width;
    this.renderHeight = height;
    
    // Recreate framebuffer with new dimensions
    this.destroyFramebuffer();
    this.createFramebuffer();
    
    console.log(`GPURaycaster resized to ${width}x${height}`);
  }
  
  /**
   * Get current render resolution
   */
  getResolution(): { width: number; height: number } {
    return {
      width: this.renderWidth,
      height: this.renderHeight
    };
  }
  
  /**
   * Get rendering performance stats
   */
  getStats(): {
    resolution: string;
    settings: RaycastSettings;
    memoryUsage: number;
  } {
    // Estimate memory usage
    const textureMemory = this.renderWidth * this.renderHeight * 4; // RGBA
    const depthMemory = this.renderWidth * this.renderHeight * 2;   // 16-bit depth
    const wallDataMemory = this.arenaMap ? this.arenaMap.walls.length * 8 * 4 : 0; // Float32
    
    return {
      resolution: `${this.renderWidth}x${this.renderHeight}`,
      settings: { ...this.settings },
      memoryUsage: textureMemory + depthMemory + wallDataMemory
    };
  }
  
  /**
   * Destroy framebuffer resources
   */
  private destroyFramebuffer(): void {
    const gl = this.gl;
    
    if (this.raycastFramebuffer) {
      gl.deleteFramebuffer(this.raycastFramebuffer);
      this.raycastFramebuffer = null;
    }
    
    if (this.raycastTexture) {
      gl.deleteTexture(this.raycastTexture);
      this.raycastTexture = null;
    }
    
    if (this.raycastDepthBuffer) {
      gl.deleteRenderbuffer(this.raycastDepthBuffer);
      this.raycastDepthBuffer = null;
    }
  }
  
  /**
   * Clean up all resources
   */
  destroy(): void {
    const gl = this.gl;
    
    this.destroyFramebuffer();
    
    if (this.wallDataTexture) {
      gl.deleteTexture(this.wallDataTexture);
      this.wallDataTexture = null;
    }
    
    if (this.floorQuadBuffer) {
      gl.deleteBuffer(this.floorQuadBuffer);
      this.floorQuadBuffer = null;
    }
    
    if (this.wallQuadVAO) {
      gl.deleteVertexArray(this.wallQuadVAO);
      this.wallQuadVAO = null;
    }
    
    console.log('GPURaycaster destroyed');
  }
}

/**
 * Helper function to create a simple arena map
 */
export function createSimpleArenaMap(): ArenaMap {
  const walls: ArenaWall[] = [
    // Outer arena boundaries
    { start: { x: -15, y: -15 }, end: { x: 15, y: -15 }, height: 2.0, textureId: 0 }, // Bottom
    { start: { x: 15, y: -15 }, end: { x: 15, y: 15 }, height: 2.0, textureId: 0 },   // Right
    { start: { x: 15, y: 15 }, end: { x: -15, y: 15 }, height: 2.0, textureId: 0 },  // Top
    { start: { x: -15, y: 15 }, end: { x: -15, y: -15 }, height: 2.0, textureId: 0 }, // Left
    
    // Inner obstacles
    { start: { x: -5, y: -5 }, end: { x: 5, y: -5 }, height: 1.5, textureId: 1 },
    { start: { x: 5, y: -5 }, end: { x: 5, y: 5 }, height: 1.5, textureId: 1 },
    { start: { x: 5, y: 5 }, end: { x: -5, y: 5 }, height: 1.5, textureId: 1 },
    { start: { x: -5, y: 5 }, end: { x: -5, y: -5 }, height: 1.5, textureId: 1 }
  ];
  
  return {
    walls,
    floorTexture: 0,
    ceilingTexture: 1,
    ambientLight: 0.3,
    bounds: { minX: -15, minY: -15, maxX: 15, maxY: 15 }
  };
}