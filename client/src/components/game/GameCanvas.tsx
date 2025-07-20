/**
 * GameCanvas - React component that integrates GameEngine with raycasting renderer
 * 
 * Manages canvas lifecycle, game engine initialization, and React integration.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '../../game/core/GameEngine.js';
import { RaycastRenderer } from '../../game/render/RaycastRenderer.js';
import { HUD } from '../../game/render/HUD.jsx';
import type { 
  ClientGameState
} from '../../game/types/GameTypes.js';
import type { 
  ConnectionInfo,
  NetworkError,
  MatchStartData,
  MatchEndData,
  RoundStartData,
  RoundEndData
} from '../../game/types/NetworkTypes.js';
import { DEFAULT_INPUT_CONFIG } from '../../game/types/InputTypes.js';

interface GameCanvasProps {
  matchId: string;
  selectedClass: string;
  serverUrl?: string;
  authToken: string;
  onGameEnd?: () => void;
  onError?: (error: string) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  matchId,
  selectedClass,
  serverUrl = 'http://localhost:3000',
  authToken,
  onGameEnd,
  onError
}) => {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<RaycastRenderer | null>(null);
  const animationFrameRef = useRef<number | undefined>();
  
  // State
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({ state: 'disconnected' });
  const [inputStats, setInputStats] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
  // Real-time game state ref for render loop (avoids React async state issues)
  const gameStateRef = useRef<ClientGameState | null>(null);
  
  // Initialization guard to prevent double initialization
  const initializingRef = useRef(false);
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize game systems when canvas becomes available
   * Key fix: Canvas element is always rendered, so ref is always available
   */
  useEffect(() => {
    console.log('🎯 [DEBUG] GameCanvas initialization check', {
      hasCanvas: !!canvasRef.current,
      isInitialized,
      isInitializing: initializingRef.current,
      hasMatchId: !!matchId,
      hasSelectedClass: !!selectedClass
    });
    
    // Only initialize if we have everything we need and haven't initialized yet
    if (canvasRef.current && !isInitialized && !initializingRef.current && matchId && selectedClass) {
      console.log('🚀 [DEBUG] Starting game initialization');
      
      // Set guard to prevent double initialization
      initializingRef.current = true;
      
      initializeGameSystems();
    }
  }, [isInitialized, matchId, selectedClass]);
  
  /**
   * Initialize all game systems in proper sequence
   */
  const initializeGameSystems = async () => {
    try {
      const canvas = canvasRef.current!;
      
      // Setup canvas
      setupCanvas(canvas);
      
      // Initialize renderer
      const renderer = new RaycastRenderer(canvas);
      rendererRef.current = renderer;
      
      // Initialize game engine
      console.log('⚙️ [DEBUG] Creating GameEngine');
      const gameEngine = new GameEngine(DEFAULT_INPUT_CONFIG);
      gameEngineRef.current = gameEngine;
      
      // Connect renderer to game state manager for interpolation
      renderer.setGameStateManager(gameEngine.getGameStateManager());
      
      // Connect renderer to game engine for effects
      gameEngine.setRenderer(renderer);
      
      // Setup callbacks and start engine
      gameEngine.initialize(canvas, {
        onConnectionChange: handleConnectionChange,
        onMatchStart: handleMatchStart,
        onMatchEnd: handleMatchEnd,
        onRoundStart: handleRoundStart,
        onRoundEnd: handleRoundEnd,
        onStateUpdate: handleStateUpdate,
        onError: handleNetworkError
      });
      
      gameEngine.start();
      
      // Connect to server (existing socket or new connection)
      await connectToGameServer(gameEngine);
      
      // Start render loop
      startRenderLoop();
      
      setIsInitialized(true);
      console.log('✅ [DEBUG] Game initialization complete');
      
    } catch (err) {
      console.error('❌ [DEBUG] Game initialization failed:', err);
      initializingRef.current = false; // Reset guard on error
      setError(err instanceof Error ? err.message : 'Failed to initialize game');
      onError?.(err instanceof Error ? err.message : 'Failed to initialize game');
    }
  };
  
  /**
   * Setup canvas dimensions and resize handling
   */
  const setupCanvas = (canvas: HTMLCanvasElement) => {
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Return cleanup function for future use
    return () => window.removeEventListener('resize', resizeCanvas);
  };
  
  /**
   * Connect to game server using existing socket or creating new connection
   */
  const connectToGameServer = async (gameEngine: GameEngine) => {
    const existingSocket = (window as any).gameSocket;
    
    if (existingSocket && existingSocket.connected) {
      console.log('🔗 [DEBUG] Using existing matchmaking socket');
      await gameEngine.connectWithExistingSocket(existingSocket, matchId, selectedClass);
    } else {
      console.log('🔗 [DEBUG] Creating new server connection');
      await gameEngine.connectToServer(serverUrl, authToken);
    }
  };
  
  /**
   * Component lifecycle management - simplified cleanup detection
   */
  useEffect(() => {
    console.log('🏗️ [DEBUG] GameCanvas mounted');
    
    return () => {
      console.log('🧹 [DEBUG] GameCanvas unmounting');
      
      // Simple cleanup: only clean up if we have initialized systems
      if (isInitialized && (gameEngineRef.current || rendererRef.current)) {
        console.log('🧹 [DEBUG] Cleaning up initialized game systems');
        cleanup();
      }
    };
  }, [isInitialized]);
  
  // ============================================================================
  // GAME ENGINE CALLBACKS
  // ============================================================================
  
  const handleConnectionChange = useCallback((info: ConnectionInfo) => {
    console.log('🔗 Connection changed:', info);
    setConnectionInfo(info);
  }, []);
  
  const handleMatchStart = useCallback((data: MatchStartData) => {
    console.log('🎯 Match started:', data);
    // Match initialization is handled by the game engine
  }, []);
  
  const handleMatchEnd = useCallback((data: MatchEndData) => {
    console.log('🏁 Match ended:', data);
    onGameEnd?.();
  }, [onGameEnd]);
  
  const handleRoundStart = useCallback((data: RoundStartData) => {
    console.log('⚡ Round started:', data.roundNumber);
  }, []);
  
  const handleRoundEnd = useCallback((data: RoundEndData) => {
    console.log('🎌 Round ended:', data);
  }, []);
  
  /**
   * Handle game state updates from GameEngine
   * 
   * Updates both the real-time render state (via ref) and React state
   * for UI components. Called when server sends state updates.
   * 
   * @param state - Updated client game state
   */
  const handleStateUpdate = useCallback((state: ClientGameState) => {
    // Update ref immediately for real-time render loop (no React delays)
    gameStateRef.current = state;
    
    // Update React state for UI components (HUD, overlays)
    setGameState(state);
    
    // Update input statistics for debug display
    if (gameEngineRef.current) {
      setInputStats(gameEngineRef.current.getInputStats());
    }
  }, []);
  
  const handleNetworkError = useCallback((error: NetworkError) => {
    console.error('🚨 Network error:', error);
    setError(error.message);
    onError?.(error.message);
  }, [onError]);
  
  // ============================================================================
  // RENDER LOOP
  // ============================================================================
  
  const startRenderLoop = useCallback(() => {
    const renderFrame = () => {
      if (!rendererRef.current) {
        animationFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }
      
      try {
        // Use ref for real-time rendering (avoids React async state issues)
        const currentGameState = gameStateRef.current;
        
        if (currentGameState && currentGameState.players && currentGameState.players.size > 0) {
          // Render the game world with current state
          rendererRef.current.render(currentGameState);
        } else {
          // Show waiting message when no game state available or no players
          rendererRef.current.renderNoPlayer();
        }
      } catch (err) {
        console.error('❌ Render error:', err);
      }
      
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };
    
    animationFrameRef.current = requestAnimationFrame(renderFrame);
  }, []); // Remove gameState dependency to prevent stale closures
  
  // ============================================================================
  // CLEANUP
  // ============================================================================
  
  /**
   * Clean up game systems and resources
   */
  const cleanup = useCallback(() => {
    console.log('🧹 [DEBUG] Cleaning up game systems');
    
    try {
      // Stop render loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      
      // Destroy game engine
      if (gameEngineRef.current) {
        gameEngineRef.current.destroy();
        gameEngineRef.current = null;
      }
      
      // Clear renderer reference
      if (rendererRef.current) {
        rendererRef.current = null;
      }
      
      // Reset initialization state
      initializingRef.current = false;
      
      console.log('✅ [DEBUG] Cleanup completed');
    } catch (err) {
      console.error('❌ [DEBUG] Cleanup error:', err);
    }
  }, []);
  
  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================
  
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'F3':
          e.preventDefault();
          setShowDebug(!showDebug);
          break;
        case 'Escape':
          e.preventDefault();
          onGameEnd?.();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showDebug, onGameEnd]);
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  if (error) {
    return (
      <div className="fixed inset-0 bg-red-900 flex items-center justify-center">
        <div className="text-center text-white space-y-4">
          <h2 className="text-3xl font-bold">Game Error</h2>
          <p className="text-lg">{error}</p>
          <button
            onClick={onGameEnd}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold"
          >
            Return to Menu
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 bg-black">
      {/* Game Canvas - Always render so ref is available */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-none"
        style={{ imageRendering: 'pixelated' }}
      />
      
      {/* Initialization Loading Overlay */}
      {!isInitialized && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
          <div className="text-center text-white space-y-4">
            <h2 className="text-3xl font-bold">Initializing Game</h2>
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-300">Setting up raycasting renderer...</p>
          </div>
        </div>
      )}
      
      {/* HUD Overlay - Only show when initialized */}
      {isInitialized && (
        <HUD
          gameState={gameState}
          connectionInfo={connectionInfo}
          showDebug={showDebug}
          inputStats={inputStats}
        />
      )}
      
      {/* Connection Status Overlay */}
      {connectionInfo.state === 'connecting' && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="text-center text-white space-y-4">
            <h3 className="text-2xl font-bold">Connecting to Game</h3>
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        </div>
      )}
      
      {/* Instructions Overlay (shows briefly at start) */}
      {connectionInfo.state === 'in_match' && !gameState && isInitialized && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="text-center text-white space-y-4 max-w-md">
            <h3 className="text-2xl font-bold">Game Controls</h3>
            <div className="text-left space-y-2">
              <div><strong>WASD:</strong> Move</div>
              <div><strong>Mouse:</strong> Look around</div>
              <div><strong>Left Click:</strong> Attack</div>
              <div><strong>Space:</strong> Dash</div>
              <div><strong>Shift:</strong> Sprint</div>
              <div><strong>F3:</strong> Toggle debug info</div>
              <div><strong>Escape:</strong> Exit game</div>
            </div>
            <p className="text-sm text-gray-300">
              Click to start playing!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};