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

interface HUDProps {
  gameState: ClientGameState | null;
  connectionInfo: ConnectionInfo;
  showDebug?: boolean;
  inputStats?: {
    queue: any;
    sequence: number;
  };
}

export const HUD: React.FC<HUDProps> = ({ 
  gameState, 
  connectionInfo, 
  showDebug = false,
  inputStats 
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
      
      {/* Debug Info */}
      {showDebug && (
        <div className="absolute bottom-4 right-4">
          <DebugPanel 
            gameState={gameState}
            connectionInfo={connectionInfo}
            inputStats={inputStats}
          />
        </div>
      )}
      
      {/* Game Over / Round End Overlay */}
      {gameState && gameState.roundTimeLeft <= 0 && (
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
  return (
    <div className="bg-black bg-opacity-60 rounded-lg p-3 text-center">
      <div className="text-white text-sm font-bold mb-2">
        Round {gameState.currentRound}
      </div>
      
      <div className="flex gap-4 text-lg font-bold text-white">
        <div className="text-center">
          <div className="text-blue-400">{gameState.score.player1}</div>
          <div className="text-xs text-gray-300">P1</div>
        </div>
        
        <div className="text-gray-500">-</div>
        
        <div className="text-center">
          <div className="text-red-400">{gameState.score.player2}</div>
          <div className="text-xs text-gray-300">P2</div>
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