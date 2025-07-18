/**
 * GameRenderer - Coordinates WebGL rendering for 1v1 arena combat
 * 
 * Replaces monolithic MainGameScene rendering with specialized WebGL systems
 * Designed for Archer vs Berserker combat with high-performance rendering
 */

import { WebGLContext } from './webgl/WebGLContext.js';
import { ShaderManager } from './webgl/ShaderManager.js';
import { GPURaycaster, ViewState, createSimpleArenaMap } from './webgl/GPURaycaster.js';
import { WebGLSpriteRenderer } from './webgl/WebGLSpriteRenderer.js';
import { TextureAtlas, createArenaSprites } from './webgl/TextureAtlas.js';

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  angle: number;
  height: number;
  classType: 'archer' | 'berserker';
  health: number;
  isAlive: boolean;
}

export interface ProjectileState {
  id: string;
  x: number;
  y: number;
  type: string;
  rotation: number;
  scale?: number;
}

export interface UIElement {
  type: 'health_bar' | 'armor_bar' | 'cooldown' | 'crosshair';
  x: number;
  y: number;
  width: number;
  height: number;
  value?: number; // 0-1 for bars
  color: [number, number, number, number];
}

export interface RenderStats {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  memoryUsage: number;
}

/**
 * GameRenderer - High-performance WebGL rendering coordination
 */
export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private webglContext: WebGLContext;
  private shaderManager: ShaderManager;
  private gpuRaycaster: GPURaycaster;
  private spriteRenderer: WebGLSpriteRenderer;
  private textureAtlas: TextureAtlas;
  
  private localPlayerId: string = '';
  private players: Map<string, PlayerState> = new Map();
  private projectiles: Map<string, ProjectileState> = new Map();
  private uiElements: UIElement[] = [];
  
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  private currentFPS: number = 60;
  
  private initialized: boolean = false;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    // Initialize WebGL systems
    this.webglContext = new WebGLContext(canvas);
    this.shaderManager = new ShaderManager(this.webglContext.getContext()!);
    this.gpuRaycaster = new GPURaycaster(this.webglContext, this.shaderManager);
    this.spriteRenderer = new WebGLSpriteRenderer(this.webglContext, this.shaderManager);
    this.textureAtlas = new TextureAtlas(this.webglContext.getContext()!, 2048);
    
    console.log('GameRenderer initialized with WebGL systems');
  }
  
  /**
   * Initialize renderer with game assets
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Create and load arena sprites
      const arenaSprites = await createArenaSprites();
      await this.textureAtlas.packTextures(arenaSprites);
      
      // Load sprite atlas into renderer
      const atlasTexture = this.textureAtlas.getTexture();
      const atlasRegions = this.textureAtlas.getAllRegions();
      
      if (atlasTexture) {
        this.spriteRenderer.loadSpriteAtlas(atlasTexture, 2048, 2048, atlasRegions);
      }
      
      // Load arena map into raycaster
      const arenaMap = createSimpleArenaMap();
      this.gpuRaycaster.loadArenaMap(arenaMap);
      
      // Resize to current canvas dimensions
      this.resize();
      
      this.initialized = true;
      console.log('GameRenderer initialization complete');
    } catch (error) {
      console.error('Failed to initialize GameRenderer:', error);
      throw error;
    }
  }
  
  /**
   * Set local player ID for camera following
   */
  setLocalPlayer(playerId: string): void {
    this.localPlayerId = playerId;
  }
  
  /**
   * Update player state
   */
  updatePlayer(player: PlayerState): void {
    this.players.set(player.id, { ...player });
  }
  
  /**
   * Remove player
   */
  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }
  
  /**
   * Update projectile state
   */
  updateProjectile(projectile: ProjectileState): void {
    this.projectiles.set(projectile.id, { ...projectile });
  }
  
  /**
   * Remove projectile
   */
  removeProjectile(projectileId: string): void {
    this.projectiles.delete(projectileId);
  }
  
  /**
   * Set UI elements for rendering
   */
  setUIElements(elements: UIElement[]): void {
    this.uiElements = [...elements];
  }
  
  /**
   * Update camera based on local player
   */
  private updateCamera(): ViewState | null {
    const localPlayer = this.players.get(this.localPlayerId);
    if (!localPlayer) return null;
    
    // Set camera position for sprite renderer
    this.spriteRenderer.setCameraPosition(localPlayer.x, localPlayer.y);
    
    // Return view state for raycaster
    return {
      playerX: localPlayer.x,
      playerY: localPlayer.y,
      playerAngle: localPlayer.angle,
      playerHeight: localPlayer.height
    };
  }
  
  /**
   * Render complete game frame
   */
  render(): void {
    if (!this.initialized) {
      console.warn('GameRenderer not initialized');
      return;
    }
    
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    
    // Update FPS
    this.updateFPS(currentTime);
    
    // Begin frame
    this.webglContext.beginFrame();
    
    // Update camera
    const viewState = this.updateCamera();
    
    if (viewState) {
      // Render raycasted environment
      this.gpuRaycaster.renderRaycastView(viewState);
      
      // Present raycasted view to screen
      this.gpuRaycaster.presentToScreen();
      
      // Render sprites (players and projectiles)
      this.renderSprites();
      
      // Render UI elements
      this.renderUI();
    } else {
      // No local player - just clear screen
      const gl = this.webglContext.getContext()!;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    
    // End frame
    this.webglContext.endFrame();
    this.frameCount++;
  }
  
  /**
   * Render all sprites (players and projectiles)
   */
  private renderSprites(): void {
    // Render players
    const playerData = Array.from(this.players.values()).map(player => ({
      x: player.x,
      y: player.y,
      angle: player.angle,
      classType: player.classType,
      health: player.health,
      isAlive: player.isAlive
    }));
    
    this.spriteRenderer.renderPlayers(playerData);
    
    // Render projectiles
    const projectileData = Array.from(this.projectiles.values()).map(projectile => ({
      x: projectile.x,
      y: projectile.y,
      projectileType: projectile.type,
      rotation: projectile.rotation,
      scale: projectile.scale
    }));
    
    this.spriteRenderer.renderProjectiles(projectileData);
  }
  
  /**
   * Render UI elements
   */
  private renderUI(): void {
    if (this.uiElements.length === 0) return;
    
    // Convert UI elements to sprite format
    const uiSprites = this.uiElements.map(element => ({
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      color: element.color,
      spriteName: element.type
    }));
    
    this.spriteRenderer.renderUI(uiSprites);
  }
  
  /**
   * Update FPS calculation
   */
  private updateFPS(currentTime: number): void {
    if (currentTime - this.fpsUpdateTime >= 1000) {
      this.currentFPS = Math.round((this.frameCount * 1000) / (currentTime - this.fpsUpdateTime));
      this.frameCount = 0;
      this.fpsUpdateTime = currentTime;
    }
  }
  
  /**
   * Handle canvas resize
   */
  resize(): void {
    // Update canvas resolution
    const rect = this.canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    const width = rect.width * devicePixelRatio;
    const height = rect.height * devicePixelRatio;
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      
      // Update WebGL viewport
      this.webglContext.resizeViewport();
      
      // Update raycaster resolution
      this.gpuRaycaster.resize(width, height);
      
      console.log(`GameRenderer resized to ${width}x${height} (${devicePixelRatio}x DPR)`);
    }
  }
  
  /**
   * Update rendering settings
   */
  updateRaycastSettings(settings: {
    fov?: number;
    maxDistance?: number;
    wallHeight?: number;
    resolution?: number;
  }): void {
    this.gpuRaycaster.updateSettings(settings);
  }
  
  /**
   * Set camera zoom level
   */
  setCameraZoom(zoom: number): void {
    this.spriteRenderer.setCameraZoom(zoom);
  }
  
  /**
   * Get comprehensive rendering statistics
   */
  getRenderStats(): RenderStats {
    const webglStats = this.webglContext.getRenderStats();
    const raycastStats = this.gpuRaycaster.getStats();
    const spriteStats = this.spriteRenderer.getStats();
    const atlasStats = this.textureAtlas.getStats();
    
    return {
      fps: this.currentFPS,
      frameTime: this.lastFrameTime,
      drawCalls: webglStats.drawCalls,
      triangles: webglStats.triangles,
      memoryUsage: raycastStats.memoryUsage + spriteStats.memoryUsage + atlasStats.memoryUsage
    };
  }
  
  /**
   * Get player count for debugging
   */
  getPlayerCount(): number {
    return this.players.size;
  }
  
  /**
   * Get projectile count for debugging
   */
  getProjectileCount(): number {
    return this.projectiles.size;
  }
  
  /**
   * Export debug information
   */
  getDebugInfo(): {
    initialized: boolean;
    localPlayerId: string;
    players: number;
    projectiles: number;
    uiElements: number;
    webglCapabilities: any;
    raycastSettings: any;
    renderStats: RenderStats;
  } {
    return {
      initialized: this.initialized,
      localPlayerId: this.localPlayerId,
      players: this.players.size,
      projectiles: this.projectiles.size,
      uiElements: this.uiElements.length,
      webglCapabilities: this.webglContext.getCapabilities(),
      raycastSettings: this.gpuRaycaster.getStats(),
      renderStats: this.getRenderStats()
    };
  }
  
  /**
   * Clear all game state
   */
  clear(): void {
    this.players.clear();
    this.projectiles.clear();
    this.uiElements = [];
    this.localPlayerId = '';
  }
  
  /**
   * Destroy renderer and clean up resources
   */
  destroy(): void {
    this.clear();
    
    this.gpuRaycaster.destroy();
    this.spriteRenderer.destroy();
    this.textureAtlas.destroy();
    this.shaderManager.destroy();
    this.webglContext.destroy();
    
    this.initialized = false;
    console.log('GameRenderer destroyed');
  }
}

/**
 * Helper function to create UI elements for arena combat
 */
export function createArenaUI(player: PlayerState): UIElement[] {
  const elements: UIElement[] = [];
  
  // Health bar background
  elements.push({
    type: 'health_bar',
    x: -8,
    y: 7,
    width: 16,
    height: 1,
    color: [0.2, 0.2, 0.2, 0.8]
  });
  
  // Health bar fill
  const healthPercent = player.health / 100;
  elements.push({
    type: 'health_bar',
    x: -8,
    y: 7,
    width: 16 * healthPercent,
    height: 1,
    value: healthPercent,
    color: [
      1 - healthPercent, // Red increases as health decreases
      healthPercent,     // Green decreases as health decreases
      0,
      0.9
    ]
  });
  
  // Crosshair
  elements.push({
    type: 'crosshair',
    x: 0,
    y: 0,
    width: 0.5,
    height: 0.5,
    color: [1, 1, 1, 0.8]
  });
  
  return elements;
}