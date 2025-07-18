/**
 * MainGame - React component wrapper for the simplified modular game
 * Manages the lifecycle of the new GameRenderer + modular systems
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
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
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  
  // Get match data from navigation state
  const matchId = location.state?.matchId;
  const matchData = location.state?.matchData;
  const selectedClass = location.state?.selectedClass || 'berserker'; // Default to berserker if not specified
  
  // Store selected class in ref
  selectedClassRef.current = selectedClass as ClassType;
  
  console.log('🎮 MainGame: Navigation state:', {
    matchId,
    matchData,
    selectedClass,
    fullState: location.state
  });
  
  // Initialize WebSocket connection
  useEffect(() => {
    if (!matchId || !isAuthenticated) return;
    
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    const socket = io('http://localhost:3000/game', {
      auth: { token },
      autoConnect: true,
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      setConnectionStatus('connected');
      // Join the match with selected class
      socket.emit('join_match', { matchId, classType: selectedClassRef.current });
      console.log('🎮 MainGame: Emitting join_match with classType:', selectedClassRef.current);
    });
    
    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });
    
    socket.on('reconnect', () => {
      console.log('🎮 MainGame: Reconnected! Rejoining match...');
      setConnectionStatus('connected');
      // Automatically rejoin the match on reconnection
      socket.emit('join_match', { matchId, classType: selectedClassRef.current });
    });
    
    socket.on('game:update', (gameUpdate) => {
      // Update game state with server data
      if (gameStateRef.current) {
        gameStateRef.current.updateFromServer(gameUpdate);
      }
    });
    
    socket.on('player:rotated', (data) => {
      // Update player rotation in game state
      if (gameStateRef.current) {
        gameStateRef.current.updatePlayerRotation(data.playerId, data.angle);
      }
    });
    
    socket.on('match_ended', (data) => {
      console.log('Match ended:', data);
      // Handle match end through UI manager
      if (uiManagerRef.current) {
        uiManagerRef.current.showMatchEndScreen(data);
      }
    });
    
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId, isAuthenticated]);
  
  useEffect(() => {
    // Check authentication
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }
    
    // Initialize modular game system
    if (containerRef.current && !gameRendererRef.current) {
      try {
        console.log('🎮 Initializing modular game system...');
        
        // Create canvas element for WebGL rendering
        const canvas = document.createElement('canvas');
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '1';
        containerRef.current.appendChild(canvas);
        
        // Initialize game state manager
        gameStateRef.current = new GameStateManager();
        
        // Initialize network manager
        if (socketRef.current) {
          networkManagerRef.current = new NetworkManager(socketRef.current);
        }
        
        // Initialize input handler with canvas
        inputHandlerRef.current = new InputHandler(canvas);
        
        // Initialize UI manager with container ID
        uiManagerRef.current = new UIManager('main-game-container');
        
        // Initialize game renderer with canvas
        gameRendererRef.current = new GameRenderer(canvas);
        
        console.log('✅ Modular game system initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize modular game system:', error);
      }
    }
    
    // Cleanup
    return () => {
      if (gameRendererRef.current) {
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
        networkManagerRef.current.destroy();
        networkManagerRef.current = null;
      }
      gameStateRef.current = null;
    };
  }, [isAuthenticated, user, navigate, matchId, matchData, connectionStatus, selectedClass]);
  
  return (
    <div className="fixed inset-0 bg-gray-900">
      <div 
        id="main-game-container" 
        ref={containerRef}
        className="relative w-full h-full"
      />
      
      {/* Exit button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded shadow-lg transition-colors duration-200 z-50"
      >
        Exit Game
      </button>
    </div>
  );
} 