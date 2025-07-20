/**
 * Minimap - Real-time tactical overview component
 * 
 * Canvas-based minimap showing arena layout, walls, and player positions
 * with coordinate mapping from game world to minimap pixels.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { 
  ClientGameState
} from '../types/GameTypes.js';

interface MinimapProps {
  gameState: ClientGameState | null;
  size?: number; // Size in pixels (square minimap)
  className?: string;
}

interface MinimapCache {
  staticMap: ImageData | null;
  walls: any[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export const Minimap: React.FC<MinimapProps> = ({ 
  gameState, 
  size = 120,
  className = ""
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<MinimapCache>({
    staticMap: null,
    walls: [],
    bounds: { minX: 0, maxX: 30, minY: 0, maxY: 30 }
  });
  
  // ============================================================================
  // COORDINATE MAPPING
  // ============================================================================
  
  /**
   * Convert game world coordinates to minimap pixel coordinates
   */
  const worldToMinimap = useCallback((worldX: number, worldY: number, bounds: any, mapSize: number) => {
    const mapWidth = bounds.maxX - bounds.minX;
    const mapHeight = bounds.maxY - bounds.minY;
    
    // Normalize to 0-1 range
    const normalizedX = (worldX - bounds.minX) / mapWidth;
    const normalizedY = (worldY - bounds.minY) / mapHeight;
    
    // Convert to pixel coordinates
    const pixelX = Math.floor(normalizedX * mapSize);
    const pixelY = Math.floor(normalizedY * mapSize);
    
    return { x: pixelX, y: pixelY };
  }, []);
  
  // ============================================================================
  // STATIC MAP RENDERING (CACHED)
  // ============================================================================
  
  /**
   * Render static elements (walls, bounds) to cached ImageData
   */
  const renderStaticMap = useCallback((
    ctx: CanvasRenderingContext2D,
    walls: any[],
    bounds: any,
    mapSize: number
  ): ImageData => {
    // Clear canvas with dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, mapSize, mapSize);
    
    // Draw arena bounds
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, mapSize, mapSize);
    
    // Draw walls
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (const wall of walls) {
      const start = worldToMinimap(wall.start.x, wall.start.y, bounds, mapSize);
      const end = worldToMinimap(wall.end.x, wall.end.y, bounds, mapSize);
      
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    }
    
    ctx.stroke();
    
    return ctx.getImageData(0, 0, mapSize, mapSize);
  }, [worldToMinimap]);
  
  // ============================================================================
  // DYNAMIC RENDERING (PLAYERS)
  // ============================================================================
  
  /**
   * Render dynamic elements (players, projectiles) on top of static map
   */
  const renderDynamicElements = useCallback((
    ctx: CanvasRenderingContext2D,
    gameState: ClientGameState,
    staticMap: ImageData,
    mapSize: number
  ) => {
    // Restore static map as base
    ctx.putImageData(staticMap, 0, 0);
    
    const bounds = gameState.mapData.bounds;
    
    // Render players
    for (const [playerId, player] of gameState.players) {
      const playerPos = worldToMinimap(player.position.x, player.position.y, bounds, mapSize);
      
      // Determine player color
      const isLocalPlayer = playerId === gameState.localPlayerId;
      const playerColor = isLocalPlayer ? '#00ff00' : '#ff4444'; // Green for local, red for enemy
      
      // Draw player dot
      ctx.fillStyle = playerColor;
      ctx.beginPath();
      ctx.arc(playerPos.x, playerPos.y, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw facing direction arrow
      const arrowLength = 6;
      const arrowEndX = playerPos.x + Math.cos(player.angle) * arrowLength;
      const arrowEndY = playerPos.y + Math.sin(player.angle) * arrowLength;
      
      ctx.strokeStyle = playerColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(playerPos.x, playerPos.y);
      ctx.lineTo(arrowEndX, arrowEndY);
      ctx.stroke();
      
      // Draw player name (if space allows)
      if (mapSize > 100) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          player.username.substring(0, 6), 
          playerPos.x, 
          playerPos.y - 8
        );
      }
    }
    
    // Render projectiles (if any)
    for (const [, projectile] of gameState.projectiles) {
      const projPos = worldToMinimap(projectile.position.x, projectile.position.y, bounds, mapSize);
      
      ctx.fillStyle = '#ffff00'; // Yellow for projectiles
      ctx.beginPath();
      ctx.arc(projPos.x, projPos.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [worldToMinimap]);
  
  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================
  
  /**
   * Check if static map cache needs to be regenerated
   */
  const needsStaticRefresh = useCallback((gameState: ClientGameState): boolean => {
    const cache = cacheRef.current;
    
    // Need refresh if no cache exists
    if (!cache.staticMap) return true;
    
    // Need refresh if map data changed
    if (!gameState.mapData) return true;
    
    // Compare bounds
    const currentBounds = gameState.mapData.bounds;
    if (
      cache.bounds.minX !== currentBounds.minX ||
      cache.bounds.maxX !== currentBounds.maxX ||
      cache.bounds.minY !== currentBounds.minY ||
      cache.bounds.maxY !== currentBounds.maxY
    ) {
      return true;
    }
    
    // Compare wall count (simplified check)
    if (cache.walls.length !== gameState.mapData.walls.length) return true;
    
    return false;
  }, []);
  
  // ============================================================================
  // MAIN RENDER LOOP
  // ============================================================================
  
  /**
   * Main rendering function called on every frame
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState || !gameState.mapData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const cache = cacheRef.current;
    
    // Regenerate static map cache if needed
    if (needsStaticRefresh(gameState)) {
      console.log('🗺️ Regenerating minimap static cache');
      cache.staticMap = renderStaticMap(
        ctx,
        gameState.mapData.walls,
        gameState.mapData.bounds,
        size
      );
      cache.walls = [...gameState.mapData.walls];
      cache.bounds = { ...gameState.mapData.bounds };
    }
    
    // Render dynamic elements on top of cached static map
    if (cache.staticMap) {
      renderDynamicElements(ctx, gameState, cache.staticMap, size);
    }
  }, [gameState, size, needsStaticRefresh, renderStaticMap, renderDynamicElements]);
  
  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  /**
   * Render minimap when game state changes
   */
  useEffect(() => {
    render();
  }, [render]);
  
  /**
   * Setup canvas properties
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set canvas size
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    
    // Setup rendering context
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false; // Crisp pixel rendering
    }
  }, [size]);
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  if (!gameState || !gameState.mapData) {
    return (
      <div 
        className={`bg-gray-800 border border-gray-600 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-gray-400 text-xs">No Map</span>
      </div>
    );
  }
  
  return (
    <div className={`relative ${className}`}>
      {/* Minimap Canvas */}
      <canvas
        ref={canvasRef}
        className="border border-gray-600 bg-gray-900"
        style={{ 
          width: size, 
          height: size,
          imageRendering: 'pixelated'
        }}
      />
      
      {/* Minimap Label */}
      <div className="absolute -top-5 left-0 text-xs text-gray-300 font-mono">
        MINIMAP
      </div>
      
      {/* Legend (if space allows) */}
      {size >= 120 && (
        <div className="absolute -bottom-12 left-0 text-xs text-gray-400 font-mono">
          <div className="flex items-center gap-1 mb-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>You</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>Enemy</span>
          </div>
        </div>
      )}
    </div>
  );
};