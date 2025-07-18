/**
 * SimpleSpectator - Basic spectator mode for 1v1 arena matches
 * 
 * Allows players to observe ongoing matches with minimal overhead
 * Designed for simple viewing with basic camera controls
 */

import type { SimplePlayer } from '../core/SimpleGameLoop.js';
import type { ProjectileData } from '../projectiles/SimpleProjectiles.js';
import type { MatchState } from '../arena/RoundSystem.js';
import { logger } from '../../utils/logger.js';

export interface SpectatorInfo {
  id: string;
  username?: string;
  joinedAt: number;
  isActive: boolean;
}

export interface SpectatorView {
  cameraPosition: { x: number; y: number };
  cameraZoom: number;
  followTarget: string | null;     // Player ID to follow, or null for free camera
  showUI: boolean;
  showPlayerNames: boolean;
  showHealthBars: boolean;
}

export interface SpectatorUpdate {
  timestamp: number;
  players: Array<{
    id: string;
    username: string;
    position: { x: number; y: number };
    rotation: number;
    health: number;
    maxHealth: number;
    classType: string;
    isAlive: boolean;
  }>;
  projectiles: Array<{
    id: string;
    position: { x: number; y: number };
    rotation: number;
    type: string;
    ownerId: string;
  }>;
  match: {
    roundNumber: number;
    timeLeft: number;
    score: { player1: number; player2: number };
    status: string;
  };
}

export interface SpectatorConfig {
  maxSpectators: number;
  updateRate: number;              // Hz - update frequency for spectators
  allowFreeCamera: boolean;        // Allow free camera movement
  allowPlayerFollow: boolean;      // Allow following specific players
  spectatorTimeout: number;        // Auto-disconnect inactive spectators (ms)
}

export interface SpectatorCallbacks {
  onSpectatorJoined?: (spectator: SpectatorInfo) => void;
  onSpectatorLeft?: (spectatorId: string) => void;
  onViewChanged?: (spectatorId: string, view: SpectatorView) => void;
  onSpectatorUpdate?: (update: SpectatorUpdate) => void;
}

/**
 * SimpleSpectator - Manages spectator connections and views
 */
export class SimpleSpectator {
  private config: SpectatorConfig;
  private callbacks: SpectatorCallbacks = {};
  
  // Spectator tracking
  private spectators: Map<string, SpectatorInfo> = new Map();
  private spectatorViews: Map<string, SpectatorView> = new Map();
  
  // Match data for broadcasting
  private lastUpdate: number = 0;
  private matchId: string;
  
  // Arena bounds for camera limits
  private arenaBounds: { width: number; height: number } = { width: 30, height: 30 };
  
  constructor(matchId: string, config?: Partial<SpectatorConfig>) {
    this.matchId = matchId;
    
    this.config = {
      maxSpectators: 10,
      updateRate: 15, // 15 Hz for spectators (lower than players)
      allowFreeCamera: true,
      allowPlayerFollow: true,
      spectatorTimeout: 300000, // 5 minutes
      ...config
    };
    
    console.log(`SimpleSpectator initialized for match ${matchId}`);
  }
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: SpectatorCallbacks): void {
    this.callbacks = { ...callbacks };
  }
  
  /**
   * Set arena bounds for camera limits
   */
  setArenaBounds(width: number, height: number): void {
    this.arenaBounds = { width, height };
  }
  
  /**
   * Add spectator to match
   */
  addSpectator(spectatorId: string, username?: string): boolean {
    // Check spectator limit
    if (this.spectators.size >= this.config.maxSpectators) {
      logger.warn(`Cannot add spectator ${spectatorId}: Maximum spectators reached`);
      return false;
    }
    
    // Check if already spectating
    if (this.spectators.has(spectatorId)) {
      logger.warn(`Spectator ${spectatorId} already in match`);
      return false;
    }
    
    // Create spectator info
    const spectator: SpectatorInfo = {
      id: spectatorId,
      username,
      joinedAt: Date.now(),
      isActive: true
    };
    
    // Create default view
    const view: SpectatorView = {
      cameraPosition: { x: this.arenaBounds.width / 2, y: this.arenaBounds.height / 2 },
      cameraZoom: 1.0,
      followTarget: null,
      showUI: true,
      showPlayerNames: true,
      showHealthBars: true
    };
    
    this.spectators.set(spectatorId, spectator);
    this.spectatorViews.set(spectatorId, view);
    
    logger.info(`Spectator ${spectatorId} joined match ${this.matchId}`);
    
    if (this.callbacks.onSpectatorJoined) {
      this.callbacks.onSpectatorJoined(spectator);
    }
    
    return true;
  }
  
  /**
   * Remove spectator from match
   */
  removeSpectator(spectatorId: string): boolean {
    const spectator = this.spectators.get(spectatorId);
    if (!spectator) return false;
    
    this.spectators.delete(spectatorId);
    this.spectatorViews.delete(spectatorId);
    
    logger.info(`Spectator ${spectatorId} left match ${this.matchId}`);
    
    if (this.callbacks.onSpectatorLeft) {
      this.callbacks.onSpectatorLeft(spectatorId);
    }
    
    return true;
  }
  
  /**
   * Update spectator camera view
   */
  updateSpectatorView(
    spectatorId: string,
    updates: Partial<SpectatorView>
  ): boolean {
    const view = this.spectatorViews.get(spectatorId);
    if (!view) return false;
    
    // Apply updates with validation
    if (updates.cameraPosition) {
      view.cameraPosition = this.validateCameraPosition(updates.cameraPosition);
    }
    
    if (updates.cameraZoom !== undefined) {
      view.cameraZoom = Math.max(0.5, Math.min(3.0, updates.cameraZoom)); // Limit zoom
    }
    
    if (updates.followTarget !== undefined && this.config.allowPlayerFollow) {
      view.followTarget = updates.followTarget;
    }
    
    if (updates.showUI !== undefined) view.showUI = updates.showUI;
    if (updates.showPlayerNames !== undefined) view.showPlayerNames = updates.showPlayerNames;
    if (updates.showHealthBars !== undefined) view.showHealthBars = updates.showHealthBars;
    
    if (this.callbacks.onViewChanged) {
      this.callbacks.onViewChanged(spectatorId, view);
    }
    
    return true;
  }
  
  /**
   * Validate camera position within arena bounds
   */
  private validateCameraPosition(position: { x: number; y: number }): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(this.arenaBounds.width, position.x)),
      y: Math.max(0, Math.min(this.arenaBounds.height, position.y))
    };
  }
  
  /**
   * Update spectator camera to follow target
   */
  private updateFollowCameras(players: Map<string, SimplePlayer>): void {
    for (const [spectatorId, view] of this.spectatorViews.entries()) {
      if (view.followTarget) {
        const targetPlayer = players.get(view.followTarget);
        if (targetPlayer) {
          view.cameraPosition = { x: targetPlayer.x, y: targetPlayer.y };
        } else {
          // Target no longer exists, switch to free camera
          view.followTarget = null;
        }
      }
    }
  }
  
  /**
   * Generate spectator update
   */
  generateSpectatorUpdate(
    players: Map<string, SimplePlayer>,
    projectiles: Map<string, ProjectileData>,
    matchState: MatchState
  ): SpectatorUpdate | null {
    const now = Date.now();
    const updateInterval = 1000 / this.config.updateRate;
    
    // Check if enough time has passed
    if (now - this.lastUpdate < updateInterval) {
      return null;
    }
    
    this.lastUpdate = now;
    
    // Update follow cameras
    this.updateFollowCameras(players);
    
    // Convert players to spectator format
    const playerData = Array.from(players.values()).map(player => ({
      id: player.id,
      username: player.username || 'Unknown',
      position: { x: player.x, y: player.y },
      rotation: player.rotation,
      health: player.health,
      maxHealth: player.maxHealth,
      classType: player.classType,
      isAlive: player.isAlive
    }));
    
    // Convert projectiles to spectator format
    const projectileData = Array.from(projectiles.values()).map(projectile => ({
      id: projectile.id,
      position: { x: projectile.x, y: projectile.y },
      rotation: Math.atan2(projectile.velocityY, projectile.velocityX),
      type: projectile.type,
      ownerId: projectile.ownerId
    }));
    
    return {
      timestamp: now,
      players: playerData,
      projectiles: projectileData,
      match: {
        roundNumber: matchState.currentRound,
        timeLeft: matchState.timeLeft,
        score: { ...matchState.score },
        status: matchState.state
      }
    };
  }
  
  /**
   * Broadcast update to all spectators
   */
  broadcastUpdate(update: SpectatorUpdate): void {
    if (this.spectators.size === 0) return;
    
    if (this.callbacks.onSpectatorUpdate) {
      this.callbacks.onSpectatorUpdate(update);
    }
  }
  
  /**
   * Get spectator by ID
   */
  getSpectator(spectatorId: string): SpectatorInfo | null {
    return this.spectators.get(spectatorId) || null;
  }
  
  /**
   * Get spectator view
   */
  getSpectatorView(spectatorId: string): SpectatorView | null {
    return this.spectatorViews.get(spectatorId) || null;
  }
  
  /**
   * Get all spectators
   */
  getAllSpectators(): SpectatorInfo[] {
    return Array.from(this.spectators.values());
  }
  
  /**
   * Clean up inactive spectators
   */
  cleanupInactiveSpectators(): void {
    const now = Date.now();
    const inactiveSpectators: string[] = [];
    
    for (const [spectatorId, spectator] of this.spectators.entries()) {
      if (now - spectator.joinedAt > this.config.spectatorTimeout) {
        inactiveSpectators.push(spectatorId);
      }
    }
    
    for (const spectatorId of inactiveSpectators) {
      this.removeSpectator(spectatorId);
      logger.info(`Removed inactive spectator ${spectatorId}`);
    }
  }
  
  /**
   * Get spectator statistics
   */
  getStats(): {
    totalSpectators: number;
    maxSpectators: number;
    updateRate: number;
    averageViewTime: number;
  } {
    const now = Date.now();
    let totalViewTime = 0;
    
    for (const spectator of this.spectators.values()) {
      totalViewTime += now - spectator.joinedAt;
    }
    
    const averageViewTime = this.spectators.size > 0 ? totalViewTime / this.spectators.size : 0;
    
    return {
      totalSpectators: this.spectators.size,
      maxSpectators: this.config.maxSpectators,
      updateRate: this.config.updateRate,
      averageViewTime: averageViewTime / 1000 // Convert to seconds
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SpectatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`SimpleSpectator config updated for match ${this.matchId}:`, this.config);
  }
  
  /**
   * Reset spectator system
   */
  reset(): void {
    const spectatorIds = Array.from(this.spectators.keys());
    
    for (const spectatorId of spectatorIds) {
      this.removeSpectator(spectatorId);
    }
    
    this.lastUpdate = 0;
    console.log(`SimpleSpectator reset for match ${this.matchId}`);
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.reset();
    this.callbacks = {};
    console.log(`SimpleSpectator destroyed for match ${this.matchId}`);
  }
}