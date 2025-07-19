/**
 * MainGame - Enhanced game component with GameEngine integration
 * 
 * Integrates the new GameEngine, raycasting renderer, and game systems
 * with the existing matchmaking flow.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { GameCanvas } from './GameCanvas';

export function MainGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, isAuthenticated } = useAuthStore();
  const [showGame, setShowGame] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get match data from navigation state
  const matchId = location.state?.matchId;
  const selectedClass = location.state?.selectedClass || 'archer';
  
  console.log('🎮 [DEBUG] MainGame navigation state:', { matchId, selectedClass });

  useEffect(() => {
    // Validate required game state
    if (!matchId || !isAuthenticated || !user) {
      console.log('❌ [DEBUG] Missing game requirements, redirecting to menu');
      navigate('/');
      return;
    }
    
    console.log('✅ [DEBUG] Game requirements validated, starting initialization');

    // Brief delay to allow UI transition, then show game
    const timer = setTimeout(() => {
      setShowGame(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [matchId, isAuthenticated, user, navigate]);

  const handleGameEnd = () => {
    console.log('🎌 Game ended, returning to menu');
    navigate('/');
  };

  const handleGameError = (errorMessage: string) => {
    console.error('🚨 Game error:', errorMessage);
    setError(errorMessage);
  };

  if (!matchId || !isAuthenticated || !user) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white space-y-4">
          <h2 className="text-3xl font-bold">Invalid Game State</h2>
          <p>Redirecting to menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-red-900 flex items-center justify-center">
        <div className="text-center text-white space-y-6">
          <h1 className="text-4xl font-bold">Game Error</h1>
          <p className="text-xl">{error}</p>
          <button
            onClick={handleGameEnd}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg"
          >
            Return to Menu
          </button>
        </div>
      </div>
    );
  }

  if (!showGame) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white space-y-6">
          <h1 className="text-4xl font-bold">Dueled</h1>
          
          <div className="space-y-4">
            <div className="text-xl">Initializing game systems...</div>
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
          
          <div className="bg-gray-800 p-6 rounded-lg max-w-md mx-auto">
            <div className="space-y-2 text-left">
              <div><span className="text-gray-400">Player:</span> {user.username}</div>
              <div><span className="text-gray-400">Class:</span> {selectedClass}</div>
              <div><span className="text-gray-400">Match ID:</span> {matchId}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  console.log('🎮 [DEBUG] Rendering GameCanvas');
  
  return (
    <GameCanvas
      matchId={matchId}
      selectedClass={selectedClass}
      authToken={token || ''}
      onGameEnd={handleGameEnd}
      onError={handleGameError}
    />
  );
}