/**
 * WebGLOptimizer - Optimizes WebGL rendering for 60 FPS at 1920x1080
 * 
 * Implements performance optimizations for arena combat rendering
 * Designed to maintain 60 FPS with dynamic quality adjustments
 */

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;        // ms per frame
  gpuTime: number;          // GPU rendering time estimate
  drawCalls: number;        // Number of draw calls per frame
  triangles: number;        // Triangles rendered per frame
  textureMemory: number;    // Estimated texture memory usage (MB)
  bufferMemory: number;     // Estimated buffer memory usage (MB)
}

export interface QualitySettings {
  renderScale: number;         // 0.5 - 2.0 (render resolution multiplier)
  shadowQuality: 'off' | 'low' | 'medium' | 'high';
  textureQuality: 'low' | 'medium' | 'high';
  particleCount: number;       // Max particles to render
  lodDistance: number;         // Distance for level-of-detail switching
  vsync: boolean;             // VSync enabled
  antialiasing: 'off' | 'fxaa' | 'msaa2x' | 'msaa4x';
}

export interface OptimizationConfig {
  targetFPS: number;          // Target FPS (default: 60)
  maxFrameTime: number;       // Max acceptable frame time (ms)
  adaptiveQuality: boolean;   // Auto-adjust quality for performance
  profileGPU: boolean;        // Enable GPU profiling
  batchDrawCalls: boolean;    // Batch similar draw calls
  cullBackfaces: boolean;     // Enable backface culling
  frustumCulling: boolean;    // Enable frustum culling
}

/**
 * WebGLOptimizer - Performance optimization for WebGL rendering
 */
export class WebGLOptimizer {
  private gl: WebGL2RenderingContext;
  private config: OptimizationConfig;
  private qualitySettings: QualitySettings;
  
  // Performance tracking
  private frameTimings: number[] = [];
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private lastFPSUpdate: number = 0;
  
  // GPU profiling
  private timerExt: any = null;
  private gpuQueries: WebGLQuery[] = [];
  private gpuTimings: number[] = [];
  
  // Draw call batching
  private batchedCalls: Map<string, any[]> = new Map();
  private drawCallCount: number = 0;
  
  // Memory tracking
  private textureMemoryUsage: number = 0;
  private bufferMemoryUsage: number = 0;
  
  constructor(
    gl: WebGL2RenderingContext,
    config?: Partial<OptimizationConfig>
  ) {
    this.gl = gl;
    
    this.config = {
      targetFPS: 60,
      maxFrameTime: 16.67, // 60 FPS = 16.67ms per frame
      adaptiveQuality: true,
      profileGPU: true,
      batchDrawCalls: true,
      cullBackfaces: true,
      frustumCulling: true,
      ...config
    };
    
    // Default quality settings for 1920x1080
    this.qualitySettings = {
      renderScale: 1.0,
      shadowQuality: 'medium',
      textureQuality: 'high',
      particleCount: 200,
      lodDistance: 50.0,
      vsync: true,
      antialiasing: 'fxaa'
    };
    
    this.initializeOptimizations();
    console.log('WebGLOptimizer initialized for 1920x1080 @ 60 FPS');
  }
  
  /**
   * Initialize WebGL optimizations
   */
  private initializeOptimizations(): void {
    const gl = this.gl;
    
    // Enable basic optimizations
    if (this.config.cullBackfaces) {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }
    
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    
    // Enable GPU profiling if available
    if (this.config.profileGPU) {
      this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (this.timerExt) {
        console.log('GPU profiling enabled');
      }
    }
    
    // Check for performance-relevant extensions
    const extensions = [
      'EXT_texture_filter_anisotropic',
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_etc',
      'OES_vertex_array_object'
    ];
    
    for (const ext of extensions) {
      const extension = gl.getExtension(ext);
      if (extension) {
        console.log(`Enabled extension: ${ext}`);
      }
    }
  }
  
  /**
   * Begin frame performance measurement
   */
  beginFrame(): void {
    this.lastFrameTime = performance.now();
    this.drawCallCount = 0;
    
    // Clear batched calls
    this.batchedCalls.clear();
    
    // Start GPU timer
    if (this.timerExt && this.config.profileGPU) {
      const query = this.gl.createQuery();
      if (query) {
        this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, query);
        this.gpuQueries.push(query);
      }
    }
  }
  
  /**
   * End frame and calculate metrics
   */
  endFrame(): PerformanceMetrics {
    const frameTime = performance.now() - this.lastFrameTime;
    this.frameTimings.push(frameTime);
    
    // Limit timing history
    if (this.frameTimings.length > 120) { // 2 seconds at 60 FPS
      this.frameTimings.shift();
    }
    
    // End GPU timer
    if (this.timerExt && this.config.profileGPU && this.gpuQueries.length > 0) {
      this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
    }
    
    this.frameCount++;
    
    // Calculate FPS
    const now = performance.now();
    if (now - this.lastFPSUpdate > 1000) { // Update every second
      this.lastFPSUpdate = now;
      
      // Adaptive quality adjustment
      if (this.config.adaptiveQuality) {
        this.adjustQualityForPerformance();
      }
    }
    
    return this.calculateMetrics();
  }
  
  /**
   * Calculate current performance metrics
   */
  private calculateMetrics(): PerformanceMetrics {
    const avgFrameTime = this.frameTimings.length > 0 
      ? this.frameTimings.reduce((sum, time) => sum + time, 0) / this.frameTimings.length
      : 0;
    
    const fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
    
    // Get GPU timing
    let gpuTime = 0;
    if (this.timerExt && this.gpuQueries.length > 0) {
      // Check for completed queries
      for (let i = this.gpuQueries.length - 1; i >= 0; i--) {
        const query = this.gpuQueries[i];
        if (this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) {
          const timeElapsed = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT);
          this.gpuTimings.push(timeElapsed / 1000000); // Convert to ms
          
          this.gl.deleteQuery(query);
          this.gpuQueries.splice(i, 1);
          
          // Limit GPU timing history
          if (this.gpuTimings.length > 60) {
            this.gpuTimings.shift();
          }
        }
      }
      
      if (this.gpuTimings.length > 0) {
        gpuTime = this.gpuTimings.reduce((sum, time) => sum + time, 0) / this.gpuTimings.length;
      }
    }
    
    return {
      fps: Math.round(fps),
      frameTime: Math.round(avgFrameTime * 100) / 100,
      gpuTime: Math.round(gpuTime * 100) / 100,
      drawCalls: this.drawCallCount,
      triangles: 0, // Would need to be tracked per draw call
      textureMemory: this.textureMemoryUsage,
      bufferMemory: this.bufferMemoryUsage
    };
  }
  
  /**
   * Adjust quality settings based on performance
   */
  private adjustQualityForPerformance(): void {
    const avgFrameTime = this.frameTimings.length > 0 
      ? this.frameTimings.reduce((sum, time) => sum + time, 0) / this.frameTimings.length
      : 0;
    
    const currentFPS = avgFrameTime > 0 ? 1000 / avgFrameTime : 60;
    const targetFPS = this.config.targetFPS;
    
    // If performance is poor, reduce quality
    if (currentFPS < targetFPS * 0.9) { // 10% tolerance
      this.reduceQuality();
    }
    // If performance is very good, try to increase quality
    else if (currentFPS > targetFPS * 1.1 && avgFrameTime < this.config.maxFrameTime * 0.8) {
      this.increaseQuality();
    }
  }
  
  /**
   * Reduce quality settings for better performance
   */
  private reduceQuality(): void {
    let adjusted = false;
    
    // Reduce render scale first
    if (this.qualitySettings.renderScale > 0.75) {
      this.qualitySettings.renderScale = Math.max(0.75, this.qualitySettings.renderScale - 0.1);
      adjusted = true;
    }
    // Reduce shadows
    else if (this.qualitySettings.shadowQuality !== 'off') {
      const shadowLevels = ['off', 'low', 'medium', 'high'];
      const currentIndex = shadowLevels.indexOf(this.qualitySettings.shadowQuality);
      if (currentIndex > 0) {
        this.qualitySettings.shadowQuality = shadowLevels[currentIndex - 1] as any;
        adjusted = true;
      }
    }
    // Reduce particles
    else if (this.qualitySettings.particleCount > 50) {
      this.qualitySettings.particleCount = Math.max(50, this.qualitySettings.particleCount - 25);
      adjusted = true;
    }
    // Reduce texture quality
    else if (this.qualitySettings.textureQuality !== 'low') {
      const textureLevels = ['low', 'medium', 'high'];
      const currentIndex = textureLevels.indexOf(this.qualitySettings.textureQuality);
      if (currentIndex > 0) {
        this.qualitySettings.textureQuality = textureLevels[currentIndex - 1] as any;
        adjusted = true;
      }
    }
    // Disable antialiasing
    else if (this.qualitySettings.antialiasing !== 'off') {
      this.qualitySettings.antialiasing = 'off';
      adjusted = true;
    }
    
    if (adjusted) {
      console.log('Quality reduced for performance:', this.qualitySettings);
    }
  }
  
  /**
   * Increase quality settings when performance allows
   */
  private increaseQuality(): void {
    let adjusted = false;
    
    // Increase render scale first
    if (this.qualitySettings.renderScale < 1.0) {
      this.qualitySettings.renderScale = Math.min(1.0, this.qualitySettings.renderScale + 0.05);
      adjusted = true;
    }
    // Improve antialiasing
    else if (this.qualitySettings.antialiasing === 'off') {
      this.qualitySettings.antialiasing = 'fxaa';
      adjusted = true;
    }
    // Improve texture quality
    else if (this.qualitySettings.textureQuality !== 'high') {
      const textureLevels = ['low', 'medium', 'high'];
      const currentIndex = textureLevels.indexOf(this.qualitySettings.textureQuality);
      if (currentIndex < textureLevels.length - 1) {
        this.qualitySettings.textureQuality = textureLevels[currentIndex + 1] as any;
        adjusted = true;
      }
    }
    // Increase particles
    else if (this.qualitySettings.particleCount < 200) {
      this.qualitySettings.particleCount = Math.min(200, this.qualitySettings.particleCount + 25);
      adjusted = true;
    }
    
    if (adjusted) {
      console.log('Quality increased:', this.qualitySettings);
    }
  }
  
  /**
   * Batch draw call for optimization
   */
  batchDrawCall(type: string, data: any): void {
    if (!this.config.batchDrawCalls) {
      this.executeDrawCall(type, [data]);
      return;
    }
    
    if (!this.batchedCalls.has(type)) {
      this.batchedCalls.set(type, []);
    }
    
    this.batchedCalls.get(type)!.push(data);
  }
  
  /**
   * Flush all batched draw calls
   */
  flushBatchedCalls(): void {
    for (const [type, calls] of this.batchedCalls.entries()) {
      if (calls.length > 0) {
        this.executeDrawCall(type, calls);
      }
    }
    
    this.batchedCalls.clear();
  }
  
  /**
   * Execute batched draw calls
   */
  private executeDrawCall(type: string, calls: any[]): void {
    // This would be implemented based on specific rendering needs
    this.drawCallCount++;
  }
  
  /**
   * Update texture memory usage
   */
  updateTextureMemory(bytes: number): void {
    this.textureMemoryUsage = bytes / (1024 * 1024); // Convert to MB
  }
  
  /**
   * Update buffer memory usage
   */
  updateBufferMemory(bytes: number): void {
    this.bufferMemoryUsage = bytes / (1024 * 1024); // Convert to MB
  }
  
  /**
   * Get current quality settings
   */
  getQualitySettings(): QualitySettings {
    return { ...this.qualitySettings };
  }
  
  /**
   * Set quality settings manually
   */
  setQualitySettings(settings: Partial<QualitySettings>): void {
    this.qualitySettings = { ...this.qualitySettings, ...settings };
    console.log('Quality settings updated:', this.qualitySettings);
  }
  
  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(metrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.fps < this.config.targetFPS * 0.9) {
      recommendations.push('Consider reducing render scale or shadow quality');
    }
    
    if (metrics.drawCalls > 100) {
      recommendations.push('Enable draw call batching to reduce CPU overhead');
    }
    
    if (metrics.textureMemory > 256) {
      recommendations.push('Consider reducing texture quality or using compressed textures');
    }
    
    if (metrics.frameTime > this.config.maxFrameTime * 1.2) {
      recommendations.push('Frame time is too high - enable adaptive quality');
    }
    
    return recommendations;
  }
  
  /**
   * Reset performance history
   */
  resetMetrics(): void {
    this.frameTimings = [];
    this.gpuTimings = [];
    this.frameCount = 0;
    this.lastFPSUpdate = performance.now();
    console.log('Performance metrics reset');
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    // Clean up GPU queries
    for (const query of this.gpuQueries) {
      this.gl.deleteQuery(query);
    }
    this.gpuQueries = [];
    
    this.resetMetrics();
    console.log('WebGLOptimizer destroyed');
  }
}