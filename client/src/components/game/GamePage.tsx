import { useEffect, useRef } from 'react';
import { GameManager } from '../../game/GameManager';

export function GamePage() {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameManagerRef = useRef<GameManager | null>(null);

  useEffect(() => {
    if (gameRef.current) {
      gameManagerRef.current = new GameManager();
      gameManagerRef.current.initialize('game-container');
    }

    return () => {
      if (gameManagerRef.current) {
        gameManagerRef.current.destroy();
        gameManagerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Game UI Header */}
      <div className="bg-arena-800 border-b border-arena-600 p-4">
        <div className="flex justify-between items-center">
          <div className="flex space-x-8">
            {/* Player 1 Info */}
            <div className="text-center">
              <div className="text-sm text-arena-300">Player 1</div>
              <div className="text-lg font-bold text-dueled-500">User123</div>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-arena-700 rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full" style={{ width: '75%' }}></div>
                </div>
                <span className="text-sm text-arena-300">75/100</span>
              </div>
            </div>

            {/* VS Indicator */}
            <div className="flex items-center">
              <span className="text-2xl font-bold text-dueled-500">VS</span>
            </div>

            {/* Player 2 Info */}
            <div className="text-center">
              <div className="text-sm text-arena-300">Player 2</div>
              <div className="text-lg font-bold text-dueled-500">Opponent</div>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-arena-700 rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full" style={{ width: '60%' }}></div>
                </div>
                <span className="text-sm text-arena-300">60/100</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm text-arena-300">Match Time</div>
            <div className="text-xl font-bold text-white">2:45</div>
          </div>
        </div>
      </div>

      {/* Game Canvas Area */}
      <div className="flex-1 relative bg-arena-900">
        <div 
          ref={gameRef}
          className="w-full h-full flex items-center justify-center"
          id="game-container"
        >
          {/* Phaser 3 game will be rendered here */}
        </div>

        {/* Game Controls Overlay */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex justify-between items-end">
            {/* Ability Buttons */}
            <div className="flex space-x-2">
              <button className="btn-primary px-4 py-2 rounded">
                Q - Attack
              </button>
              <button className="btn-secondary px-4 py-2 rounded">
                E - Special
              </button>
            </div>

            {/* Chat/Communication */}
            <div className="bg-arena-800 bg-opacity-90 rounded p-2 max-w-xs">
              <div className="text-xs text-arena-300 mb-1">Quick Chat:</div>
              <div className="flex space-x-1">
                <button className="text-xs bg-arena-700 px-2 py-1 rounded hover:bg-arena-600">
                  GG
                </button>
                <button className="text-xs bg-arena-700 px-2 py-1 rounded hover:bg-arena-600">
                  Nice!
                </button>
                <button className="text-xs bg-arena-700 px-2 py-1 rounded hover:bg-arena-600">
                  GL HF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}