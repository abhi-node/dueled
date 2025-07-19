/**
 * GameRenderer - Canvas 2D rendering for 1v1 arena combat
 * 
 * RESTORED: Back to optimized CanvasRenderer with dev branch performance improvements
 * Focus on functionality and cross-platform compatibility
 */

import { CanvasRenderer, type CanvasPlayerState, type CanvasMapData, type CanvasProjectile } from './CanvasRenderer.js';

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  angle: number;
  height: number;
  classType: 'archer' | 'berserker';
  health: number;
  maxHealth: number;
  isAlive: boolean;
}

export interface ProjectileState {
  id: string;
  x: number;
  y: number;
  angle: number;
  type: 'arrow' | 'fireball' | 'bomb';
  scale: number;
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
 * GameRenderer - Canvas 2D rendering coordination
 */
export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private canvasRenderer: CanvasRenderer;
  
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
    
    // Initialize optimized CanvasRenderer
    this.canvasRenderer = new CanvasRenderer(canvas);
    
    console.log('GameRenderer initialized with optimized CanvasRenderer');
  }
  
  /**
   * Initialize renderer with game assets
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Initialize canvas renderer
      await this.canvasRenderer.initialize();
      
      // Resize to current canvas dimensions
      this.resize();
      
      this.initialized = true;
      console.log('✅ GameRenderer initialization complete');
    } catch (error) {
      console.error('❌ Failed to initialize GameRenderer:', error);
      throw error;
    }
  }
  
  /**
   * Set local player ID for camera following
   */
  setLocalPlayer(playerId: string): void {
    this.localPlayerId = playerId;
    this.canvasRenderer.setLocalPlayer(playerId);
  }
  
  /**
   * Update map data from server
   */
  updateMapData(mapData: {
    arenaType: string;
    size: { x: number; y: number };
    walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    spawnPoints: Array<{ position: { x: number; y: number }; rotation: number }>;
  }): void {
    console.log('🗺️ GameRenderer: Updating map data:', mapData);
    
    // Convert to CanvasMapData format
    const canvasMapData: CanvasMapData = {
      walls: mapData.walls,
      size: mapData.size,
      spawnPoints: mapData.spawnPoints
    };
    
    // Update canvas renderer with new map
    this.canvasRenderer.updateMapFromServer(canvasMapData);
    
    console.log('✅ GameRenderer: Map data updated successfully');
  }
  
  /**
   * Update player state
   */
  updatePlayer(player: PlayerState): void {
    this.players.set(player.id, { ...player });
    
    // Convert to CanvasPlayerState format
    const canvasPlayer: CanvasPlayerState = {
      id: player.id,
      x: player.x,
      y: player.y,
      angle: player.angle,
      classType: player.classType,
      health: player.health,
      maxHealth: player.maxHealth,
      isAlive: player.isAlive
    };
    
    this.canvasRenderer.updatePlayer(canvasPlayer);
  }
  
  /**
   * Remove player
   */
  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.canvasRenderer.removePlayer(playerId);
  }
  
  /**
   * Update projectile state
   */
  updateProjectile(projectile: ProjectileState): void {
    this.projectiles.set(projectile.id, { ...projectile });
    
    // Convert to CanvasProjectile format
    const canvasProjectile: CanvasProjectile = {
      id: projectile.id,
      x: projectile.x,
      y: projectile.y,
      angle: projectile.angle,
      type: projectile.type,
      scale: projectile.scale
    };
    
    this.canvasRenderer.updateProjectile(canvasProjectile);
  }
  
  /**
   * Remove projectile
   */
  removeProjectile(projectileId: string): void {
    this.projectiles.delete(projectileId);
    this.canvasRenderer.removeProjectile(projectileId);
  }
  
  /**
   * Set UI elements for rendering
   */
  setUIElements(elements: UIElement[]): void {
    this.uiElements = [...elements];
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
    this.lastFrameTime = currentTime;
    
    // Update FPS
    this.updateFPS(currentTime);
    
    // Render using CanvasRenderer
    this.canvasRenderer.render();
    
    this.frameCount++;
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
    
    let width = rect.width * devicePixelRatio;
    let height = rect.height * devicePixelRatio;
    
    // Fallback to canvas's actual dimensions if getBoundingClientRect returns 0
    if (width === 0 || height === 0) {
      width = this.canvas.width || 800;
      height = this.canvas.height || 600;
      console.warn('⚠️ getBoundingClientRect returned 0, using canvas dimensions:', { width, height });
    }
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      // Update canvas renderer
      this.canvasRenderer.resize(width, height);
      
      console.log(`GameRenderer resized to ${width}x${height} (${devicePixelRatio}x DPR)`);
    }
  }
  
  
  /**
   * Get comprehensive rendering statistics
   */
  getRenderStats(): RenderStats {
    return {
      fps: this.currentFPS,
      frameTime: this.lastFrameTime,
      drawCalls: this.players.size + this.projectiles.size + 1, // Raycasting + sprites
      triangles: 0, // Canvas doesn't use triangles
      memoryUsage: 512 * 1024 // Estimate 512KB for canvas
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
    canvasRenderer: any;
    renderStats: RenderStats;
  } {
    return {
      initialized: this.initialized,
      localPlayerId: this.localPlayerId,
      players: this.players.size,
      projectiles: this.projectiles.size,
      uiElements: this.uiElements.length,
      canvasRenderer: this.canvasRenderer.getDebugInfo(),
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
    
    this.canvasRenderer.destroy();
    
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