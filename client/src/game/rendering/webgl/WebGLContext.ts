/**
 * WebGLContext - Setup and manage WebGL2 context for high-performance rendering
 * 
 * Designed for 1v1 arena combat with Archer vs Berserker
 * Target: 60 FPS at 1920x1080 with GPU-accelerated ray casting
 */

export interface WebGLConfig {
  antialias: boolean;
  alpha: boolean;
  depth: boolean;
  preserveDrawingBuffer: boolean;
  powerPreference: 'default' | 'high-performance' | 'low-power';
  failIfMajorPerformanceCaveat: boolean;
}

export interface WebGLCapabilities {
  webgl2Supported: boolean;
  maxTextureSize: number;
  maxTextureUnits: number;
  maxVertexAttributes: number;
  maxVaryingVectors: number;
  maxFragmentUniforms: number;
  instancingSupported: boolean;
  floatTexturesSupported: boolean;
  depthTextureSupported: boolean;
}

export interface RenderStats {
  frameCount: number;
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  shaderSwitches: number;
  textureBinds: number;
}

/**
 * WebGLContext - High-performance WebGL2 setup for arena combat
 */
export class WebGLContext {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private config: WebGLConfig;
  private capabilities: WebGLCapabilities | null = null;
  private renderStats: RenderStats;
  private lastFrameTime = 0;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement, config?: Partial<WebGLConfig>) {
    this.canvas = canvas;
    this.config = {
      antialias: true,
      alpha: false, // Better performance without alpha
      depth: true,
      preserveDrawingBuffer: false, // Better performance
      powerPreference: 'high-performance', // Request dedicated GPU
      failIfMajorPerformanceCaveat: true, // Fail if software rendering
      ...config
    };

    this.renderStats = {
      frameCount: 0,
      fps: 0,
      frameTime: 0,
      drawCalls: 0,
      triangles: 0,
      shaderSwitches: 0,
      textureBinds: 0
    };

    this.initialize();
  }

  /**
   * Initialize WebGL2 context with optimal settings
   */
  private initialize(): void {
    // Try WebGL2 first
    this.gl = this.canvas.getContext('webgl2', this.config) as WebGL2RenderingContext;
    
    if (!this.gl) {
      // Fallback to WebGL1 (limited functionality)
      console.warn('WebGL2 not supported, falling back to WebGL1');
      this.gl = this.canvas.getContext('webgl', this.config) as WebGL2RenderingContext;
    }

    if (!this.gl) {
      throw new Error('WebGL not supported - cannot run game');
    }

    // Setup capabilities
    this.capabilities = this.detectCapabilities();
    
    // Configure optimal settings for arena combat
    this.setupOptimalSettings();
    
    console.log('WebGL Context initialized:', this.capabilities);
  }

  /**
   * Detect WebGL capabilities for optimization
   */
  private detectCapabilities(): WebGLCapabilities {
    if (!this.gl) throw new Error('WebGL context not initialized');

    const gl = this.gl;
    
    // Check WebGL2 support
    const webgl2Supported = gl instanceof WebGL2RenderingContext;
    
    // Get limits
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const maxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS);
    const maxFragmentUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);

    // Check extensions
    const instancingSupported = webgl2Supported || !!gl.getExtension('ANGLE_instanced_arrays');
    const floatTexturesSupported = webgl2Supported || !!gl.getExtension('OES_texture_float');
    const depthTextureSupported = webgl2Supported || !!gl.getExtension('WEBGL_depth_texture');

    return {
      webgl2Supported,
      maxTextureSize,
      maxTextureUnits,
      maxVertexAttributes,
      maxVaryingVectors,
      maxFragmentUniforms,
      instancingSupported,
      floatTexturesSupported,
      depthTextureSupported
    };
  }

  /**
   * Setup optimal WebGL settings for arena combat
   */
  private setupOptimalSettings(): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Enable depth testing for 3D perspective
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Enable face culling for performance
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    // Setup blending for sprites
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Clear color (arena background)
    gl.clearColor(0.1, 0.1, 0.15, 1.0); // Dark blue-gray

    // Viewport
    this.resizeViewport();

    console.log('WebGL optimal settings configured');
  }

  /**
   * Resize viewport to canvas dimensions
   */
  resizeViewport(): void {
    if (!this.gl) return;

    const canvas = this.canvas;
    const gl = this.gl;

    // Set canvas size to match display size
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    // Set viewport
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /**
   * Begin frame rendering
   */
  beginFrame(): void {
    if (!this.gl) return;

    const gl = this.gl;
    
    // Update frame stats
    const now = performance.now();
    this.renderStats.frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameCount++;

    // Calculate FPS every 60 frames
    if (this.frameCount % 60 === 0) {
      this.renderStats.fps = Math.round(1000 / this.renderStats.frameTime);
    }

    // Reset frame stats
    this.renderStats.drawCalls = 0;
    this.renderStats.triangles = 0;
    this.renderStats.shaderSwitches = 0;
    this.renderStats.textureBinds = 0;

    // Clear buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /**
   * End frame rendering
   */
  endFrame(): void {
    if (!this.gl) return;

    // Force GPU to finish (optional, for debugging)
    // this.gl.finish();
    
    this.renderStats.frameCount = this.frameCount;
  }

  /**
   * Create and compile shader
   */
  createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const shader = gl.createShader(type);
    
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      console.error('Shader compilation error:', error);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Create and link shader program
   */
  createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const program = gl.createProgram();
    
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      console.error('Program linking error:', error);
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  /**
   * Create texture from image data
   */
  createTexture(
    width: number, 
    height: number, 
    data?: Uint8Array | HTMLImageElement | HTMLCanvasElement,
    options?: {
      format?: number;
      type?: number;
      wrapS?: number;
      wrapT?: number;
      minFilter?: number;
      magFilter?: number;
      generateMipmaps?: boolean;
    }
  ): WebGLTexture | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const texture = gl.createTexture();
    
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set texture parameters
    const opts = {
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      generateMipmaps: false,
      ...options
    };

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrapT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.magFilter);

    // Upload texture data
    if (data instanceof HTMLImageElement || data instanceof HTMLCanvasElement) {
      gl.texImage2D(gl.TEXTURE_2D, 0, opts.format, opts.format, opts.type, data);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, opts.format, width, height, 0, opts.format, opts.type, data || null);
    }

    // Generate mipmaps if requested
    if (opts.generateMipmaps) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    this.renderStats.textureBinds++;
    return texture;
  }

  /**
   * Create buffer with data
   */
  createBuffer(target: number, data: ArrayBuffer | ArrayBufferView, usage: number = WebGL2RenderingContext.STATIC_DRAW): WebGLBuffer | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const buffer = gl.createBuffer();
    
    if (!buffer) return null;

    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, usage);

    return buffer;
  }

  /**
   * Track draw call for stats
   */
  trackDrawCall(triangleCount: number = 0): void {
    this.renderStats.drawCalls++;
    this.renderStats.triangles += triangleCount;
  }

  /**
   * Track shader switch for stats
   */
  trackShaderSwitch(): void {
    this.renderStats.shaderSwitches++;
  }

  /**
   * Track texture bind for stats
   */
  trackTextureBind(): void {
    this.renderStats.textureBinds++;
  }

  /**
   * Get rendering statistics
   */
  getRenderStats(): RenderStats {
    return { ...this.renderStats };
  }

  /**
   * Get WebGL capabilities
   */
  getCapabilities(): WebGLCapabilities | null {
    return this.capabilities;
  }

  /**
   * Get WebGL context
   */
  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  /**
   * Get canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Check if WebGL2 is supported
   */
  isWebGL2(): boolean {
    return this.capabilities?.webgl2Supported || false;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // WebGL context cleanup is handled by browser
    this.gl = null;
    this.capabilities = null;
  }

  /**
   * Debug info for development
   */
  getDebugInfo(): {
    vendor: string;
    renderer: string;
    version: string;
    shadingLanguageVersion: string;
    extensions: string[];
  } {
    if (!this.gl) {
      return {
        vendor: 'Unknown',
        renderer: 'Unknown', 
        version: 'Unknown',
        shadingLanguageVersion: 'Unknown',
        extensions: []
      };
    }

    const gl = this.gl;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    
    return {
      vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      extensions: gl.getSupportedExtensions() || []
    };
  }
}