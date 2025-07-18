/**
 * MainGame - React component wrapper for the main game
 * Manages the lifecycle of the ray-casted game scene
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
// TODO: Replace MainGameScene with modular architecture
// import { GameRenderer } from '../../game/rendering/GameRenderer';
// import { GameStateManager } from '../../game/state/GameStateManager';
// import { NetworkManager } from '../../game/network/NetworkManager';
// import { InputHandler } from '../../game/input/InputHandler';
// import { UIManager } from '../../game/ui/UIManager';
import { useAuthStore } from '../../store/authStore';
import type { ClassType } from '@dueled/shared';

export function MainGame() {
  // TODO: Replace with modular system
  const gameRef = useRef<any>(null);
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
      // TODO: Replace with modular system
      // if (gameRef.current) {
      //   gameRef.current.handleGameUpdate(gameUpdate);
      // }
    });
    
    
    socket.on('player:rotated', (data) => {
      // TODO: Replace with modular system
      // if (gameRef.current && gameRef.current.onPlayerRotated) {
      //   gameRef.current.onPlayerRotated(data.playerId, data.angle, data.classType);
      // }
    });
    
    socket.on('match_ended', (data) => {
      console.log('Match ended:', data);
      // TODO: Replace with modular system
      // if (gameRef.current && gameRef.current.onMatchEnded) {
      //   gameRef.current.onMatchEnded(data);
      // }
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
    
    // TODO: Initialize new modular game system
    // Initialize game
    if (containerRef.current && !gameRef.current) {
      try {
        // gameRef.current = new MainGameScene('main-game-container', matchId, matchData, socketRef.current, selectedClassRef.current);
        // gameRef.current.start();
        console.log('Game initialization temporarily disabled during refactor');
      } catch (error) {
        console.error('Failed to initialize game:', error);
      }
    }
    
    // Cleanup
    return () => {
      // TODO: Replace with modular system cleanup
      // if (gameRef.current) {
      //   gameRef.current.stop();
      //   gameRef.current = null;
      // }
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