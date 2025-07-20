/**
 * HUD - React overlay component for game UI elements
 * 
 * Renders health bars, crosshair, score, and debug information
 * over the raycasted 3D view.
 */

import React from 'react';
import type { 
  ClientGameState, 
  ClientPlayerState
} from '../types/GameTypes.js';
import { getClassConfig } from '@dueled/shared';
import type { ConnectionInfo } from '../types/NetworkTypes.js';
import { Minimap } from './Minimap.js';

interface HUDProps {
  gameState: ClientGameState | null;
  connectionInfo: ConnectionInfo;
  showDebug?: boolean;
  inputStats?: {
    queue: any;
    sequence: number;
  };
  // Round system overlays
  countdownState?: {
    isActive: boolean;
    roundNumber: number;
    countdown: number;
  };
  roundEndState?: {
    isActive: boolean;
    winner: string;
    score: { player1: number; player2: number };
  };
  matchEndState?: {
    isActive: boolean;
    winner: string;
    finalScore: { player1: number; player2: number };
  };
  // Callbacks
  onReturnToLobby?: () => void;
}

export const HUD: React.FC<HUDProps> = ({ 
  gameState, 
  connectionInfo, 
  showDebug = false,
  inputStats,
  countdownState,
  roundEndState,
  matchEndState,
  onReturnToLobby
}) => {
  const localPlayer = gameState?.players.get(gameState.localPlayerId || '');
  
  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div className="w-4 h-4 flex items-center justify-center">
          <div className="w-1 h-1 bg-white rounded-full opacity-80"></div>
        </div>
      </div>
      
      {/* Health Bar */}
      {localPlayer && (
        <div className="absolute top-4 left-4">
          <HealthBar player={localPlayer} />
        </div>
      )}
      
      {/* Score Display */}
      {gameState && (
        <div className="absolute top-4 right-4">
          <ScoreDisplay gameState={gameState} />
        </div>
      )}
      
      {/* Round Timer */}
      {gameState && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2">
          <RoundTimer gameState={gameState} />
        </div>
      )}
      
      {/* Connection Status */}
      <div className="absolute bottom-4 left-4">
        <ConnectionStatus connectionInfo={connectionInfo} />
      </div>
      
      {/* Minimap */}
      {gameState && (
        <div className="absolute bottom-4 right-4">
          <Minimap 
            gameState={gameState}
            size={120}
            className="rounded-lg overflow-hidden"
          />
        </div>
      )}
      
      {/* Debug Info (positioned to avoid minimap overlap) */}
      {showDebug && (
        <div className="absolute bottom-32 right-4">
          <DebugPanel 
            gameState={gameState}
            connectionInfo={connectionInfo}
            inputStats={inputStats}
          />
        </div>
      )}
      
      {/* Countdown Overlay (3-2-1 GO!) */}
      {countdownState?.isActive && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <CountdownOverlay 
            roundNumber={countdownState.roundNumber}
            countdown={countdownState.countdown}
          />
        </div>
      )}
      
      {/* Round End Overlay */}
      {roundEndState?.isActive && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <SimpleRoundEndOverlay 
            winner={roundEndState.winner}
            score={roundEndState.score}
          />
        </div>
      )}
      
      {/* Match End Overlay */}
      {matchEndState?.isActive && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <MatchEndOverlay 
            winner={matchEndState.winner}
            finalScore={matchEndState.finalScore}
            onReturnToLobby={onReturnToLobby}
          />
        </div>
      )}
      
      {/* Legacy Game Over Overlay (kept for compatibility) */}
      {gameState && gameState.roundTimeLeft <= 0 && !roundEndState?.isActive && !matchEndState?.isActive && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <RoundEndOverlay gameState={gameState} />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HEALTH BAR COMPONENT
// ============================================================================

interface HealthBarProps {
  player: ClientPlayerState;
}

const HealthBar: React.FC<HealthBarProps> = ({ player }) => {
  const classConfig = getClassConfig(player.classType);
  const healthPercent = (player.health / classConfig.stats.health) * 100;
  const armorPercent = (player.armor / classConfig.stats.defense) * 100;
  
  // Calculate weapon cooldown percentage
  const currentTime = Date.now();
  const cooldownRemaining = Math.max(0, player.weaponCooldown - currentTime);
  // Convert attackSpeed (attacks per second) to cooldown milliseconds
  const weaponCooldownMs = (1 / classConfig.weapon.attackSpeed) * 1000;
  const cooldownPercent = Math.min((cooldownRemaining / weaponCooldownMs) * 100, 100);
  const isOnCooldown = cooldownRemaining > 0;
  
  return (
    <div className="bg-black bg-opacity-60 rounded-lg p-3 min-w-[220px]">
      <div className="text-white text-sm font-bold mb-2 flex justify-between">
        <span>{player.username}</span>
        <span className="text-xs text-gray-300 capitalize">{classConfig.name}</span>
      </div>
      
      {/* Health Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-white mb-1">
          <span>Health</span>
          <span>{player.health}/{classConfig.stats.health}</span>
        </div>
        <div className="w-full bg-red-900 rounded-full h-2">
          <div 
            className="bg-red-500 h-2 rounded-full transition-all duration-200"
            style={{ width: `${healthPercent}%` }}
          ></div>
        </div>
      </div>
      
      {/* Armor Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-white mb-1">
          <span>Defense</span>
          <span>{player.armor}/{classConfig.stats.defense}</span>
        </div>
        <div className="w-full bg-blue-900 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-200"
            style={{ width: `${armorPercent}%` }}
          ></div>
        </div>
      </div>
      
      {/* Weapon Cooldown Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-white mb-1">
          <span>{classConfig.weapon.name}</span>
          <span>{isOnCooldown ? `${(cooldownRemaining / 1000).toFixed(1)}s` : 'Ready'}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-100 ${
              isOnCooldown ? 'bg-orange-500' : 'bg-green-500'
            }`}
            style={{ width: isOnCooldown ? `${100 - cooldownPercent}%` : '100%' }}
          ></div>
        </div>
      </div>
      
      {/* Status Indicators */}
      <div className="flex gap-2 mt-2 text-xs">
        {player.isDashing && (
          <span className="bg-yellow-600 text-white px-2 py-1 rounded">
            DASH
          </span>
        )}
        {isOnCooldown && (
          <span className="bg-orange-600 text-white px-2 py-1 rounded">
            RELOADING
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SCORE DISPLAY COMPONENT
// ============================================================================

interface ScoreDisplayProps {
  gameState: ClientGameState;
}

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ gameState }) => {
  // Get player usernames by properly matching player IDs to scores
  const player1 = gameState.players.get(gameState.player1Id);
  const player2 = gameState.players.get(gameState.player2Id);
  
  // Use usernames from the matched players
  const player1Name = player1?.username || 'Player 1';
  const player2Name = player2?.username || 'Player 2';
  
  return (
    <div className="bg-black bg-opacity-60 rounded-lg p-3 text-center">
      <div className="text-white text-sm font-bold mb-2">
        Round {gameState.currentRound}
      </div>
      
      <div className="flex gap-4 text-lg font-bold text-white">
        <div className="text-center">
          <div className="text-xs text-gray-300 mb-1 truncate max-w-20">
            {player1Name}
          </div>
          <div className="text-blue-400">{gameState.score.player1}</div>
        </div>
        
        <div className="text-gray-500 self-end">-</div>
        
        <div className="text-center">
          <div className="text-xs text-gray-300 mb-1 truncate max-w-20">
            {player2Name}
          </div>
          <div className="text-red-400">{gameState.score.player2}</div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ROUND TIMER COMPONENT
// ============================================================================

interface RoundTimerProps {
  gameState: ClientGameState;
}

const RoundTimer: React.FC<RoundTimerProps> = ({ gameState }) => {
  const timeLeft = Math.max(0, Math.ceil(gameState.roundTimeLeft));
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  
  const isLowTime = timeLeft <= 10;
  
  return (
    <div className={`
      bg-black bg-opacity-60 rounded-lg px-4 py-2 
      ${isLowTime ? 'bg-red-900 bg-opacity-80' : ''}
    `}>
      <div className={`
        text-2xl font-bold text-center
        ${isLowTime ? 'text-red-400' : 'text-white'}
      `}>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </div>
    </div>
  );
};

// ============================================================================
// CONNECTION STATUS COMPONENT
// ============================================================================

interface ConnectionStatusProps {
  connectionInfo: ConnectionInfo;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ connectionInfo }) => {
  const getStatusColor = () => {
    switch (connectionInfo.state) {
      case 'connected':
      case 'authenticated':
      case 'in_match':
        return 'text-green-400';
      case 'connecting':
        return 'text-yellow-400';
      case 'disconnected':
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };
  
  const getStatusText = () => {
    switch (connectionInfo.state) {
      case 'connected':
        return 'Connected';
      case 'authenticated':
        return 'Authenticated';
      case 'in_match':
        return 'In Match';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };
  
  return (
    <div className="bg-black bg-opacity-60 rounded-lg p-2 text-xs">
      <div className={`font-bold ${getStatusColor()}`}>
        {getStatusText()}
      </div>
      
      {connectionInfo.ping !== undefined && (
        <div className="text-gray-300">
          Ping: {connectionInfo.ping}ms
        </div>
      )}
    </div>
  );
};

// ============================================================================
// DEBUG PANEL COMPONENT
// ============================================================================

interface DebugPanelProps {
  gameState: ClientGameState | null;
  connectionInfo: ConnectionInfo;
  inputStats?: {
    queue: any;
    sequence: number;
  };
}

const DebugPanel: React.FC<DebugPanelProps> = ({ 
  gameState, 
  connectionInfo, 
  inputStats 
}) => {
  const localPlayer = gameState?.players.get(gameState.localPlayerId || '');
  
  return (
    <div className="bg-black bg-opacity-80 rounded-lg p-3 text-xs font-mono text-white max-w-sm">
      <div className="font-bold text-green-400 mb-2">DEBUG INFO</div>
      
      {/* Connection Info */}
      <div className="mb-2">
        <div className="text-yellow-400">Connection:</div>
        <div>State: {connectionInfo.state}</div>
        <div>Player ID: {connectionInfo.playerId || 'None'}</div>
        <div>Match ID: {connectionInfo.matchId || 'None'}</div>
        {connectionInfo.ping && <div>Ping: {connectionInfo.ping}ms</div>}
      </div>
      
      {/* Player Info */}
      {localPlayer && (
        <div className="mb-2">
          <div className="text-yellow-400">Local Player:</div>
          <div>Pos: ({localPlayer.position.x.toFixed(1)}, {localPlayer.position.y.toFixed(1)})</div>
          <div>Angle: {(localPlayer.angle * 180 / Math.PI).toFixed(1)}°</div>
          <div>Health: {localPlayer.health}/{localPlayer.maxHealth}</div>
          <div>Moving: {localPlayer.isMoving ? 'Yes' : 'No'}</div>
        </div>
      )}
      
      {/* Input Stats */}
      {inputStats && (
        <div className="mb-2">
          <div className="text-yellow-400">Input:</div>
          <div>Sequence: {inputStats.sequence}</div>
          <div>Queue Length: {inputStats.queue?.queueLength || 0}</div>
          <div>Total Commands: {inputStats.queue?.totalCommands || 0}</div>
          <div>Avg Batch Size: {inputStats.queue?.avgBatchSize || 0}</div>
        </div>
      )}
      
      {/* Game State */}
      {gameState && (
        <div className="mb-2">
          <div className="text-yellow-400">Game State:</div>
          <div>Players: {gameState.players.size}</div>
          <div>Projectiles: {gameState.projectiles.size}</div>
          <div>Round: {gameState.currentRound}</div>
          <div>Time Left: {gameState.roundTimeLeft.toFixed(1)}s</div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ROUND END OVERLAY COMPONENT
// ============================================================================

interface RoundEndOverlayProps {
  gameState: ClientGameState;
}

const RoundEndOverlay: React.FC<RoundEndOverlayProps> = ({ gameState }) => {
  // Determine round winner based on who's alive
  const alivePlayers = Array.from(gameState.players.values()).filter(p => p.isAlive);
  const roundWinner = alivePlayers.length === 1 ? alivePlayers[0] : null;
  
  return (
    <div className="text-center text-white">
      <div className="text-4xl font-bold mb-4">
        {roundWinner ? 'Round Over!' : 'Time Up!'}
      </div>
      
      {roundWinner && (
        <div className="text-2xl mb-4">
          <span className="text-yellow-400">{roundWinner.username}</span> wins!
        </div>
      )}
      
      <div className="text-lg mb-2">
        Score: {gameState.score.player1} - {gameState.score.player2}
      </div>
      
      <div className="text-sm text-gray-300">
        Next round starting soon...
      </div>
    </div>
  );
};

// ============================================================================
// NEW ROUND SYSTEM OVERLAYS
// ============================================================================

/**
 * Countdown Overlay - Shows 3-2-1 countdown before round starts
 */
interface CountdownOverlayProps {
  roundNumber: number;
  countdown: number;
}

const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ roundNumber, countdown }) => {
  const displayText = countdown > 0 ? countdown.toString() : 'GO!';
  const isGo = countdown === 0;
  
  return (
    <div className="text-center text-white">
      <div className="text-3xl font-bold mb-4">
        Round {roundNumber}
      </div>
      
      <div className={`text-8xl font-bold ${isGo ? 'text-green-400' : 'text-yellow-400'} animate-pulse`}>
        {displayText}
      </div>
    </div>
  );
};

/**
 * Simple Round End Overlay - Shows round winner and current score
 */
interface SimpleRoundEndOverlayProps {
  winner: string;
  score: { player1: number; player2: number };
}

const SimpleRoundEndOverlay: React.FC<SimpleRoundEndOverlayProps> = ({ winner, score }) => {
  return (
    <div className="text-center text-white">
      <div className="text-4xl font-bold mb-4">
        Round Over!
      </div>
      
      <div className="text-2xl mb-4">
        <span className="text-yellow-400">{winner}</span> wins!
      </div>
      
      <div className="text-xl mb-2">
        Score: {score.player1} - {score.player2}
      </div>
      
      <div className="text-sm text-gray-300">
        Next round starting soon...
      </div>
    </div>
  );
};

/**
 * Match End Overlay - Shows match winner and final score
 */
interface MatchEndOverlayProps {
  winner: string;
  finalScore: { player1: number; player2: number };
  onReturnToLobby?: () => void;
}

const MatchEndOverlay: React.FC<MatchEndOverlayProps> = ({ winner, finalScore, onReturnToLobby }) => {
  return (
    <div className="text-center text-white">
      <div className="text-5xl font-bold mb-6 text-yellow-400">
        Match Complete!
      </div>
      
      <div className="text-3xl mb-6">
        <span className="text-green-400">{winner}</span> wins the match!
      </div>
      
      <div className="text-2xl mb-6">
        Final Score: {finalScore.player1} - {finalScore.player2}
      </div>
      
      <div className="text-lg text-gray-300 mb-6">
        Returning to lobby automatically...
      </div>
      
      {onReturnToLobby && (
        <button
          onClick={onReturnToLobby}
          className="pointer-events-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          Return to Lobby Now
        </button>
      )}
    </div>
  );
};