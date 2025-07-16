/**
 * MainGame - React component wrapper for the main game
 * Manages the lifecycle of the ray-casted game scene
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { MainGameScene } from '../../game/scenes/MainGameScene';
import { useAuthStore } from '../../store/authStore';

export function MainGame() {
  const gameRef = useRef<MainGameScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  
  // Get match data from navigation state
  const matchId = location.state?.matchId;
  const matchData = location.state?.matchData;
  const selectedClass = location.state?.selectedClass || 'berserker'; // Default to berserker if not specified
  
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
      // Join the match
      socket.emit('join_match', { matchId });
    });
    
    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });
    
    socket.on('game:update', (gameUpdate) => {
      if (gameRef.current) {
        gameRef.current.handleGameUpdate(gameUpdate);
      }
    });
    
    socket.on('player:moved', (data) => {
      if (gameRef.current) {
        gameRef.current.onPlayerMoved(data.playerId, data.position, data.angle);
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
    
    // Initialize game
    if (containerRef.current && !gameRef.current) {
      try {
        gameRef.current = new MainGameScene('main-game-container', matchId, matchData, socketRef.current, selectedClass);
        gameRef.current.start();
      } catch (error) {
        console.error('Failed to initialize game:', error);
      }
    }
    
    // Cleanup
    return () => {
      if (gameRef.current) {
        gameRef.current.stop();
        gameRef.current = null;
      }
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