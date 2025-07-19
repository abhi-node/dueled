/**
 * MainGame - React component wrapper for the simplified modular game
 * Manages the lifecycle of the new GameRenderer + modular systems
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { GameRenderer } from '../../game/rendering/GameRenderer';
import { GameStateManager } from '../../game/state/GameStateManager';
import { NetworkManager } from '../../game/network/NetworkManager';
import { InputHandler } from '../../game/input/InputHandler';
import { UIManager } from '../../game/ui/UIManager';
import { useAuthStore } from '../../store/authStore';
import type { ClassType } from '@dueled/shared';

export function MainGame() {
  // Modular system refs
  const gameRendererRef = useRef<GameRenderer | null>(null);
  const gameStateRef = useRef<GameStateManager | null>(null);
  const networkManagerRef = useRef<NetworkManager | null>(null);
  const inputHandlerRef = useRef<InputHandler | null>(null);
  const uiManagerRef = useRef<UIManager | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedClassRef = useRef<ClassType>('berserker' as ClassType);
  const hasInitializedRef = useRef(false); // Prevent double initialization
  const hasJoinedMatchRef = useRef(false); // Prevent double join
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const renderLoopRef = useRef<number | null>(null);
  
  // Get match data from navigation state
  const matchId = location.state?.matchId;
  const matchData = location.state?.matchData;
  const selectedClass = location.state?.selectedClass || 'berserker';
  
  // Store selected class in ref
  selectedClassRef.current = selectedClass as ClassType;
  
  console.log('🎮 MainGame: Navigation state:', {
    matchId,
    matchData,
    selectedClass,
    fullState: location.state,
    matchDataMatchId: matchData?.matchId
  });

  // Render loop function with 60 FPS limiting
  const startRenderLoop = () => {
    let frameCount = 0;
    let lastFrameTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS; // 16.67ms per frame
    
    const renderFrame = (currentTime: number) => {
      // Frame rate limiting - only render if enough time has passed
      if (currentTime - lastFrameTime >= frameInterval) {
        if (gameRendererRef.current) {
          gameRendererRef.current.render();
          
          // Debug log every 60 frames (~1 second at 60fps)
          frameCount++;
          if (frameCount % 60 === 0) {
            const stats = gameRendererRef.current.getRenderStats();
            const actualFPS = Math.round(1000 / (currentTime - lastFrameTime));
            console.log('📊 Render stats:', { ...stats, actualFPS, targetFPS });
          }
          if (frameCount % 300 === 0) {
            console.log('🔄 Render loop still running, frame:', frameCount);
          }
        } else {
          console.warn('⚠️ Render loop running but no gameRenderer');
        }
        
        lastFrameTime = currentTime;
      }
      
      renderLoopRef.current = requestAnimationFrame(renderFrame);
    };
    console.log(`🚀 Starting render loop (${targetFPS} FPS limited)`);
    renderFrame(performance.now());
  };

  // Stop render loop
  const stopRenderLoop = () => {
    if (renderLoopRef.current) {
      cancelAnimationFrame(renderLoopRef.current);
      renderLoopRef.current = null;
    }
  };
  
  // Initialize socket and join match - only runs once
  useEffect(() => {
    if (!matchId || !isAuthenticated || hasJoinedMatchRef.current) return;
    
    // Get socket from window (stored by MainMenu)
    const gameSocket = (window as any).gameSocket;
    
    if (!gameSocket) {
      console.error('❌ No socket passed from MainMenu');
      setConnectionStatus('disconnected');
      setTimeout(() => {
        navigate('/');
      }, 3000);
      return;
    }
    
    // Store socket in ref for other effects
    socketRef.current = gameSocket;
    setConnectionStatus(gameSocket.connected ? 'connected' : 'connecting');
    
    console.log('✅ Using socket from MainMenu:', gameSocket.id);
    
    // Initialize NetworkManager
    networkManagerRef.current = new NetworkManager(gameSocket);
    console.log('NetworkManager initialized with socket');
    
    // Set up NetworkManager callbacks
    networkManagerRef.current.setCallbacks({
      onPlayerUpdate: (player) => {
        // OPTIMIZED: Removed frequent console logs for better performance
        // OPTIMIZED: Route all updates through GameStateManager only (eliminates duplicate processing)
        if (gameStateRef.current) {
          gameStateRef.current.updatePlayer(player);
        }
        // REMOVED: Direct GameRenderer update (now handled by GameStateManager callback)
      },
      onPlayerJoined: (player) => {
        // OPTIMIZED: Reduced console logging frequency
        // OPTIMIZED: Route all updates through GameStateManager only (eliminates duplicate processing)
        if (gameStateRef.current) {
          gameStateRef.current.updatePlayer(player);
        }
        // REMOVED: Direct GameRenderer update (now handled by GameStateManager callback)
      },
      onPlayerLeft: (playerId) => {
        // OPTIMIZED: Route all updates through GameStateManager only (eliminates duplicate processing)
        if (gameStateRef.current) {
          gameStateRef.current.removePlayer(playerId);
        }
        // REMOVED: Direct GameRenderer update (now handled by GameStateManager callback)
      },
      onProjectileUpdate: (projectiles) => {
        // OPTIMIZED: Route projectiles through GameStateManager for consistency
        // TODO: GameStateManager needs projectile support to handle this properly
        // For now, keep direct update until GameStateManager supports projectiles
        if (gameRendererRef.current) {
          projectiles.forEach(projectile => {
            const projectileState = {
              id: projectile.id,
              x: projectile.x,
              y: projectile.y,
              angle: projectile.rotation,
              type: projectile.type as 'arrow' | 'fireball' | 'bomb',
              scale: 1.0
            };
            gameRendererRef.current?.updateProjectile(projectileState);
          });
        }
      },
      onProjectileRemoved: (projectileId) => {
        // OPTIMIZED: Keep direct update for now (same as projectile updates above)
        if (gameRendererRef.current) {
          gameRendererRef.current.removeProjectile(projectileId);
        }
      },
      onMatchUpdate: (data) => {
        // OPTIMIZED: Reduced console logging frequency
        
        // OPTIMIZED: Simplified match update handling
        if (gameStateRef.current) {
          gameStateRef.current.updateMatch({
            matchId: data.matchId,
            status: data.status,
            roundNumber: data.roundNumber,
            roundTimeLeft: data.roundTimeLeft
          });
        }
        
        // Set local player ID (essential for camera following)
        if (gameRendererRef.current && data.yourPlayerId) {
          gameRendererRef.current.setLocalPlayer(data.yourPlayerId);
        }
        
        // OPTIMIZED: Let regular player updates handle initial players instead of duplicate processing
        // Initial players will be processed through onPlayerUpdate callbacks
      },
      onGameEvent: (event) => {
        console.log('Game event:', event);
      },
      onConnectionError: (error: string) => {
        console.error('Network connection error:', error);
        
        // Handle match not found - could be timing issue, try to navigate back
        if (error.includes('Match') && error.includes('not found')) {
          console.log('🔄 Match not found, redirecting to main menu...');
          setTimeout(() => {
            navigate('/');
          }, 3000);
        }
      },
      onDisconnected: (reason) => {
        console.log('Network disconnected:', reason);
        setConnectionStatus('disconnected');
      },
      onReconnected: () => {
        console.log('Network reconnected');
        setConnectionStatus('connected');
      },
      onMapUpdate: (mapData) => {
        console.log('🗺️ MainGame: Map data received:', mapData);
        if (gameRendererRef.current && mapData) {
          console.log('🗺️ Updating GameRenderer with server map data');
          gameRendererRef.current.updateMapData(mapData);
        }
      },
      onPlayerIdAssigned: (data) => {
        console.log('🎯 MainGame: Player ID assigned:', data);
        if (gameRendererRef.current) {
          console.log('🎯 Setting local player ID in GameRenderer:', data.yourPlayerId);
          gameRendererRef.current.setLocalPlayer(data.yourPlayerId);
        }
      }
    });
    
    // Join match function with async wait for server readiness
    const sendJoinMatch = () => {
      console.log('🚀 Preparing to join match:', { 
        matchId, 
        classType: selectedClassRef.current,
        socketId: gameSocket.id,
        connected: gameSocket.connected
      });
      
      // Get authentication token
      let token = localStorage.getItem('authToken');
      if (!token) {
        try {
          const storeData = localStorage.getItem('dueled-auth');
          if (storeData) {
            const parsed = JSON.parse(storeData);
            token = parsed.state?.token;
          }
        } catch (error) {
          console.warn('Failed to parse auth store data:', error);
        }
      }
      
      if (!token) {
        console.error('❌ No authentication token available');
        setConnectionStatus('disconnected');
        return;
      }
      
      // Set up authentication handlers
      const handleAuthenticated = () => {
        console.log('✅ Socket authenticated, waiting for match initialization...');
        console.log('🔍 Socket state after auth:', {
          connected: gameSocket.connected,
          id: gameSocket.id
        });
        
        // Wait for server to signal that match is ready
        const handleMatchInitializationComplete = (data: { matchId: string; message: string; timestamp: number }) => {
          console.log('🎯 Match initialization complete:', data);
          console.log('🚀 Now joining match...');
          
          gameSocket.emit('join_match', { 
            matchId, 
            classType: selectedClassRef.current 
          });
          hasJoinedMatchRef.current = true;
          
          console.log('📡 join_match sent, waiting for initial_game_state response...');
        };
        
        // Set up timeout in case server doesn't respond
        const timeout = setTimeout(() => {
          console.warn('⏰ Timeout waiting for match initialization, joining anyway...');
          gameSocket.emit('join_match', { 
            matchId, 
            classType: selectedClassRef.current 
          });
          hasJoinedMatchRef.current = true;
        }, 10000); // 10 second timeout
        
        // Listen for match ready signal
        gameSocket.once('match_initialization_complete', (data: { matchId: string; message: string; timestamp: number }) => {
          clearTimeout(timeout);
          handleMatchInitializationComplete(data);
        });
      };
      
      const handleAuthError = (error: any) => {
        console.error('❌ Socket authentication failed:', error);
        setConnectionStatus('disconnected');
        setTimeout(() => navigate('/'), 3000);
      };
      
      // Set up one-time listeners
      gameSocket.once('authenticated', handleAuthenticated);
      gameSocket.once('auth_error', handleAuthError);
      
      // Send authentication
      console.log('🔐 Sending authentication with token length:', token.length);
      console.log('🔍 Socket state before auth:', {
        connected: gameSocket.connected,
        id: gameSocket.id
      });
      gameSocket.emit('authenticate', { token });
    };
    
    // If socket is already connected, start join process immediately
    if (gameSocket.connected) {
      console.log('🔗 Socket connected, starting authentication and match join...');
      sendJoinMatch();
    } else {
      // Wait for connection
      gameSocket.once('connect', () => {
        console.log('🔗 Socket connected, starting authentication and match join...');
        setConnectionStatus('connected');
        sendJoinMatch();
      });
    }
    
    // Handle disconnection
    gameSocket.on('disconnect', (reason: any) => {
      console.log('Socket disconnected:', reason);
      setConnectionStatus('disconnected');
    });
    
  }, [matchId, isAuthenticated, navigate]); // Removed passedSocket dependency
  
  // Initialize game systems - only runs once
  useEffect(() => {
    console.log('🔍 Game systems useEffect triggered:', {
      isAuthenticated,
      hasUser: !!user,
      hasInitialized: hasInitializedRef.current,
      containerRefCurrent: !!containerRef.current,
      containerElement: containerRef.current,
      gameRendererExists: !!gameRendererRef.current
    });
    
    if (!isAuthenticated || !user || hasInitializedRef.current) {
      console.log('🚫 Early return from game systems useEffect');
      return;
    }
    
    // Additional check: if GameRenderer already exists, don't reinitialize
    if (gameRendererRef.current) {
      console.log('🚫 GameRenderer already exists, skipping initialization');
      return;
    }
    
    // Initialize modular game system
    if (containerRef.current) {
      console.log('✅ Container ref exists, proceeding with initialization');
      const initializeGameSystems = async () => {
        try {
        hasInitializedRef.current = true;
        console.log('🎮 Initializing modular game system...');
        
        // Note: No longer need to wait since CSS sizing fixes the issue
        
        // Create canvas element for WebGL rendering
        const canvas = document.createElement('canvas');
        
        // Fix TypeScript error by storing containerRef.current in a variable
        const container = containerRef.current;
        if (!container) {
          console.error('❌ Container ref is null!');
          return;
        }
        
        let containerWidth = container.clientWidth;
        let containerHeight = container.clientHeight;
        
        // If container still has no size, force sensible defaults
        if (containerWidth === 0 || containerHeight === 0) {
          containerWidth = 800;
          containerHeight = 600;
          console.warn('⚠️ Container has no size, using defaults:', { containerWidth, containerHeight });
        }
        
        // Limit canvas size to reasonable maximums to avoid overflow issues
        const maxWidth = Math.min(containerWidth, 1920);
        const maxHeight = Math.min(containerHeight, 1080);
        
        containerWidth = maxWidth;
        containerHeight = maxHeight;
        
        console.log('🖼️ Canvas sizing debug:', {
          containerClientWidth: container.clientWidth,
          containerClientHeight: container.clientHeight,
          finalWidth: containerWidth,
          finalHeight: containerHeight,
          containerBoundingRect: container.getBoundingClientRect()
        });
        
        canvas.width = containerWidth;
        canvas.height = containerHeight;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';   // CSS size for getBoundingClientRect
        canvas.style.height = '100%';  // CSS size for getBoundingClientRect
        canvas.style.zIndex = '10';
        canvas.style.display = 'block';
        canvas.style.maxWidth = '100vw';
        canvas.style.maxHeight = '100vh';
        canvas.style.objectFit = 'contain';
        container.appendChild(canvas);
        
        console.log('🎯 Canvas created and added to DOM:', {
          width: canvas.width,
          height: canvas.height,
          cssWidth: canvas.style.width,
          cssHeight: canvas.style.height,
          zIndex: canvas.style.zIndex,
          position: canvas.style.position
        });
        
        // Note: MinimalRenderer test removed - proceeding with normal renderer
        
        // Initialize game state manager
        gameStateRef.current = new GameStateManager();
        
        // Set up GameStateManager callbacks
        gameStateRef.current.setEventCallbacks({
          onPlayerUpdate: (player) => {
            if (gameRendererRef.current) {
              const playerState = {
                id: player.id,
                x: player.position.x,
                y: player.position.y,
                angle: player.rotation,
                height: 1.0,
                classType: player.classType as 'archer' | 'berserker',
                health: player.health,
                maxHealth: 100,
                isAlive: player.isAlive
              };
              gameRendererRef.current.updatePlayer(playerState);
            }
          },
          onPlayerJoined: (player) => {
            if (gameRendererRef.current) {
              const playerState = {
                id: player.id,
                x: player.position.x,
                y: player.position.y,
                angle: player.rotation,
                height: 1.0,
                classType: player.classType as 'archer' | 'berserker',
                health: player.health,
                maxHealth: 100,
                isAlive: player.isAlive
              };
              gameRendererRef.current.updatePlayer(playerState);
            }
          },
          onPlayerLeft: (playerId) => {
            if (gameRendererRef.current) {
              gameRendererRef.current.removePlayer(playerId);
            }
          },
          onProjectileAdded: (projectile) => {
            if (gameRendererRef.current) {
              const projectileState = {
                id: projectile.id,
                x: projectile.position.x,
                y: projectile.position.y,
                angle: projectile.rotation,
                type: projectile.type as 'arrow' | 'fireball' | 'bomb',
                scale: 1.0
              };
              gameRendererRef.current.updateProjectile(projectileState);
            }
          },
          onProjectileRemoved: (projectileId) => {
            if (gameRendererRef.current) {
              gameRendererRef.current.removeProjectile(projectileId);
            }
          },
          onMatchUpdate: (match) => {
            console.log('Match updated:', match);
          },
          onGameEvent: (event) => {
            console.log('Game event:', event);
          },
          onStateChange: (state) => {
            console.log('Game state changed:', {
              players: state.players.size,
              projectiles: state.projectiles.size,
              connected: state.connected
            });
          }
        });
        
        // Initialize input handler with canvas
        inputHandlerRef.current = new InputHandler(canvas);
        
        // Set up input callbacks for client-side movement with server sync
        inputHandlerRef.current.setCallbacks({
          onMovement: (forward: number, strafe: number, sprint: boolean) => {
            if (gameRendererRef.current && gameStateRef.current) {
              const localPlayer = gameStateRef.current.getLocalPlayer();
              if (localPlayer) {
                // CLIENT-SIDE: Calculate new position immediately for responsive controls
                const speed = sprint ? 8.0 : 5.0; // units per second
                const deltaTime = 1/60; // 60 FPS frame time
                
                // Get current player rotation for movement direction
                const currentRotation = localPlayer.rotation;
                
                // Calculate movement in world space based on player rotation
                const forwardX = Math.cos(currentRotation) * forward;
                const forwardY = Math.sin(currentRotation) * forward;
                const strafeX = Math.cos(currentRotation + Math.PI/2) * strafe;
                const strafeY = Math.sin(currentRotation + Math.PI/2) * strafe;
                
                // Combine forward and strafe movement
                const moveX = (forwardX + strafeX) * speed * deltaTime;
                const moveY = (forwardY + strafeY) * speed * deltaTime;
                
                const newX = localPlayer.position.x + moveX;
                const newY = localPlayer.position.y + moveY;
                
                // CLIENT-SIDE: Update local player position immediately for responsiveness
                const updatedPlayer = {
                  id: localPlayer.id,
                  x: newX,
                  y: newY,
                  angle: currentRotation,
                  height: 1.0,
                  classType: localPlayer.classType as 'archer' | 'berserker',
                  health: localPlayer.health,
                  maxHealth: localPlayer.maxHealth || 100,
                  isAlive: localPlayer.isAlive
                };
                
                gameRendererRef.current.updatePlayer(updatedPlayer);
                
                // SERVER SYNC: Send movement to server (will be reconciled with server state)
                if (networkManagerRef.current) {
                  networkManagerRef.current.sendMovementUpdate(newX, newY, localPlayer.classType);
                }
              }
            }
          },
          onRotation: (yaw: number, pitch: number) => {
            if (gameRendererRef.current && gameStateRef.current) {
              const localPlayer = gameStateRef.current.getLocalPlayer();
              if (localPlayer) {
                // CLIENT-SIDE: Update rotation immediately for responsive controls
                const newRotation = localPlayer.rotation + yaw;
                
                const updatedPlayer = {
                  id: localPlayer.id,
                  x: localPlayer.position.x,
                  y: localPlayer.position.y,
                  angle: newRotation,
                  height: 1.0,
                  classType: localPlayer.classType as 'archer' | 'berserker',
                  health: localPlayer.health,
                  maxHealth: localPlayer.maxHealth || 100,
                  isAlive: localPlayer.isAlive
                };
                
                gameRendererRef.current.updatePlayer(updatedPlayer);
                
                // SERVER SYNC: Send rotation to server
                if (networkManagerRef.current) {
                  networkManagerRef.current.sendRotationUpdate(newRotation);
                }
              }
            }
          },
          onPrimaryAttack: () => {
            if (networkManagerRef.current) {
              networkManagerRef.current.sendPrimaryAttack();
            }
          },
          onSpecialAbility: () => {
            if (networkManagerRef.current) {
              networkManagerRef.current.sendSpecialAbility();
            }
          },
          onDash: () => {
            if (networkManagerRef.current) {
              // Get current movement direction for dash
              if (gameStateRef.current) {
                const localPlayer = gameStateRef.current.getLocalPlayer();
                if (localPlayer) {
                  const dashDirection = {
                    x: Math.cos(localPlayer.rotation),
                    y: Math.sin(localPlayer.rotation)
                  };
                  networkManagerRef.current.sendDash(dashDirection);
                }
              }
            }
          }
        });
        
        // Enable input handler
        inputHandlerRef.current.enable();
        
        // Set up continuous movement processing (60 FPS)
        const movementUpdateInterval = setInterval(() => {
          if (inputHandlerRef.current && gameRendererRef.current && gameStateRef.current) {
            const inputState = inputHandlerRef.current.getInputState();
            const localPlayer = gameStateRef.current.getLocalPlayer();
            
            // Only process if there's movement input and we have a local player
            if (localPlayer && (inputState.movement.forward !== 0 || inputState.movement.strafe !== 0)) {
              // CLIENT-SIDE: Calculate new position for smooth movement
              const speed = inputState.movement.sprint ? 8.0 : 5.0;
              const deltaTime = 1/60; // 60 FPS
              
              const currentRotation = localPlayer.rotation;
              
              // Calculate movement in world space
              const forwardX = Math.cos(currentRotation) * inputState.movement.forward;
              const forwardY = Math.sin(currentRotation) * inputState.movement.forward;
              const strafeX = Math.cos(currentRotation + Math.PI/2) * inputState.movement.strafe;
              const strafeY = Math.sin(currentRotation + Math.PI/2) * inputState.movement.strafe;
              
              const moveX = (forwardX + strafeX) * speed * deltaTime;
              const moveY = (forwardY + strafeY) * speed * deltaTime;
              
              const newX = localPlayer.position.x + moveX;
              const newY = localPlayer.position.y + moveY;
              
              // Update local player immediately
              const updatedPlayer = {
                id: localPlayer.id,
                x: newX,
                y: newY,
                angle: currentRotation,
                height: 1.0,
                classType: localPlayer.classType as 'archer' | 'berserker',
                health: localPlayer.health,
                maxHealth: localPlayer.maxHealth || 100,
                isAlive: localPlayer.isAlive
              };
              
              gameRendererRef.current.updatePlayer(updatedPlayer);
              
              // Update the GameStateManager too
              gameStateRef.current.updatePlayer({
                id: localPlayer.id,
                username: localPlayer.username,
                position: { x: newX, y: newY },
                rotation: currentRotation,
                health: localPlayer.health,
                maxHealth: localPlayer.maxHealth || 100,
                classType: localPlayer.classType,
                isAlive: localPlayer.isAlive,
                lastInputTime: Date.now()
              });
            }
          }
        }, 16); // 60 FPS (16ms interval)
        
        // Store interval on window for cleanup access
        (window as any).movementUpdateInterval = movementUpdateInterval;
        
        // Initialize UI manager with container ID
        uiManagerRef.current = new UIManager('main-game-container');
        
        // Initialize game renderer with canvas
        gameRendererRef.current = new GameRenderer(canvas);
        
        // Initialize renderer asynchronously
        gameRendererRef.current.initialize().then(() => {
          console.log('✅ GameRenderer initialized, starting render loop');
          startRenderLoop();
        }).catch(error => {
          console.error('❌ GameRenderer initialization failed:', error);
        });
        
        console.log('✅ Modular game system initialized successfully');
        } catch (error) {
          console.error('❌ Failed to initialize modular game system:', error);
          hasInitializedRef.current = false; // Allow retry
        }
      };
      
      initializeGameSystems();
    } else {
      console.error('❌ Container ref is null! Cannot initialize game systems');
      console.log('🔍 Container ref debug:', {
        containerRef,
        containerRefCurrent: containerRef.current,
        documentReady: document.readyState,
        containerInDOM: document.getElementById('main-game-container')
      });
    }
    
    // Cleanup
    return () => {
      console.log('🧹 Game systems cleanup triggered');
      stopRenderLoop();
      
      // Clear movement interval if it was created
      if (typeof window !== 'undefined' && window.movementUpdateInterval) {
        clearInterval(window.movementUpdateInterval);
        delete window.movementUpdateInterval;
      }
      
      if (gameRendererRef.current) {
        console.log('🧹 Destroying GameRenderer');
        gameRendererRef.current.destroy();
        gameRendererRef.current = null;
      }
      if (inputHandlerRef.current) {
        inputHandlerRef.current.destroy();
        inputHandlerRef.current = null;
      }
      if (uiManagerRef.current) {
        uiManagerRef.current.destroy();
        uiManagerRef.current = null;
      }
      if (networkManagerRef.current) {
        if (process.env.NODE_ENV === 'production') {
          // Real navigation away – close connection
          networkManagerRef.current.destroy();
        } else {
          // Dev StrictMode unmount – just detach handlers
          networkManagerRef.current.detach();
        }
        networkManagerRef.current = null;
      }
      gameStateRef.current = null;
      
      // DON'T delete window.gameSocket during development cleanup
      // Only clear it during actual component unmount (when user navigates away)
      
      // Reset initialization flags for next mount
      hasInitializedRef.current = false;
      hasJoinedMatchRef.current = false;
    };
  }, [isAuthenticated, user]); // Minimal dependencies
  
  // Additional effect to ensure container is ready
  useEffect(() => {
    console.log('🔍 Container readiness check:', {
      containerExists: !!containerRef.current,
      containerSize: containerRef.current ? {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        rect: containerRef.current.getBoundingClientRect()
      } : null
    });
  });
  
  // Cleanup socket when component actually unmounts (user navigates away)
  useEffect(() => {
    return () => {
      // Only delete when the user really leaves /game,
      // not during StrictMode's dev-only re-mount.
      if (process.env.NODE_ENV === 'production') {
        console.log('🧹 MainGame: Component unmounting, cleaning up socket');
        delete (window as any).gameSocket;
      }
    };
  }, []);
  
  return (
    <div className="fixed inset-0 bg-gray-900">
      <div 
        id="main-game-container" 
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        style={{ maxWidth: '100vw', maxHeight: '100vh' }}
      />
      
      {/* Connection status indicator */}
      {connectionStatus !== 'connected' && (
        <div className="absolute top-4 right-4 px-4 py-2 bg-yellow-600 text-white font-semibold rounded shadow-lg">
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </div>
      )}
      
      {/* Exit button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded shadow-lg transition-colors duration-200 z-50"
      >
        Exit Game
      </button>
      
      {/* Controls help */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white p-4 rounded-lg z-50">
        <div className="text-sm space-y-1">
          <div className="font-semibold mb-2">Controls:</div>
          <div>🖱️ Click canvas to enable mouse look</div>
          <div>⌨️ WASD to move</div>
          <div>⇧ Hold Shift to sprint</div>
          <div>🖱️ Mouse to look around (after clicking)</div>
          <div>🖱️ Left click to attack</div>
          <div>🖱️ Right click for special ability</div>
          <div>␣ Space to dash</div>
        </div>
      </div>
    </div>
  );
}