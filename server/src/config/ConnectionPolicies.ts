/**
 * Connection Policies Configuration
 * 
 * Defines state-specific connection monitoring behavior to prevent false disconnections
 * during legitimate game state transitions.
 */

import type { ConnectionPolicy } from '../websocket/GameStateAwareConnectionManager.js';
import type { RoundState } from '../game/match/RoundSystem.js';

/**
 * Configuration options for connection policy behavior
 */
export interface ConnectionPolicyConfig {
  /** Base heartbeat monitoring interval in milliseconds */
  baseHeartbeatInterval: number;
  /** Base connection timeout in milliseconds */
  baseConnectionTimeout: number;
  /** Base grace period in milliseconds */
  baseGracePeriod: number;
  
  /** Multipliers for different round states */
  stateMultipliers: {
    /** Timeout multiplier during countdown */
    countdownTimeoutMultiplier: number;
    /** Grace period multiplier during countdown */
    countdownGraceMultiplier: number;
    
    /** Timeout multiplier during active gameplay */
    activeGraceMultiplier: number;
    
    /** Timeout multiplier during round end processing */
    endedTimeoutMultiplier: number;
    /** Grace period multiplier during round end processing */
    endedGraceMultiplier: number;
    
    /** Timeout multiplier during intermission */
    intermissionTimeoutMultiplier: number;
    /** Grace period multiplier during intermission */
    intermissionGraceMultiplier: number;
  };
  
  /** Whether to completely disable heartbeat monitoring for critical states */
  disableHeartbeatDuringCriticalStates: boolean;
}

/**
 * Default connection policy configuration
 */
export const DEFAULT_CONNECTION_POLICY_CONFIG: ConnectionPolicyConfig = {
  baseHeartbeatInterval: 30000,  // 30 seconds
  baseConnectionTimeout: 60000,  // 60 seconds
  baseGracePeriod: 2000,        // 2 seconds
  
  stateMultipliers: {
    countdownTimeoutMultiplier: 1.5,  // 90 seconds during countdown
    countdownGraceMultiplier: 2,      // 4 seconds grace during countdown
    
    activeGraceMultiplier: 1.5,       // 3 seconds grace during active play
    
    endedTimeoutMultiplier: 3,        // 3 minutes during round end
    endedGraceMultiplier: 5,          // 10 seconds grace during round end
    
    intermissionTimeoutMultiplier: 2, // 2 minutes during intermission
    intermissionGraceMultiplier: 3,   // 6 seconds grace during intermission
  },
  
  disableHeartbeatDuringCriticalStates: true
};

/**
 * Aggressive connection policy configuration (shorter timeouts)
 */
export const AGGRESSIVE_CONNECTION_POLICY_CONFIG: ConnectionPolicyConfig = {
  baseHeartbeatInterval: 15000,  // 15 seconds
  baseConnectionTimeout: 30000,  // 30 seconds
  baseGracePeriod: 1000,        // 1 second
  
  stateMultipliers: {
    countdownTimeoutMultiplier: 2,    // 60 seconds during countdown
    countdownGraceMultiplier: 3,      // 3 seconds grace during countdown
    
    activeGraceMultiplier: 2,         // 2 seconds grace during active play
    
    endedTimeoutMultiplier: 4,        // 2 minutes during round end
    endedGraceMultiplier: 8,          // 8 seconds grace during round end
    
    intermissionTimeoutMultiplier: 3, // 90 seconds during intermission
    intermissionGraceMultiplier: 5,   // 5 seconds grace during intermission
  },
  
  disableHeartbeatDuringCriticalStates: true
};

/**
 * Lenient connection policy configuration (longer timeouts)
 */
export const LENIENT_CONNECTION_POLICY_CONFIG: ConnectionPolicyConfig = {
  baseHeartbeatInterval: 45000,  // 45 seconds
  baseConnectionTimeout: 90000,  // 90 seconds
  baseGracePeriod: 5000,        // 5 seconds
  
  stateMultipliers: {
    countdownTimeoutMultiplier: 1.3,  // 2 minutes during countdown
    countdownGraceMultiplier: 1.5,    // 7.5 seconds grace during countdown
    
    activeGraceMultiplier: 1.2,       // 6 seconds grace during active play
    
    endedTimeoutMultiplier: 2.5,      // 3.75 minutes during round end
    endedGraceMultiplier: 3,          // 15 seconds grace during round end
    
    intermissionTimeoutMultiplier: 1.5, // 2.25 minutes during intermission
    intermissionGraceMultiplier: 2,   // 10 seconds grace during intermission
  },
  
  disableHeartbeatDuringCriticalStates: false // Keep monitoring active
};

/**
 * Create connection policies from configuration
 */
export function createConnectionPolicies(config: ConnectionPolicyConfig = DEFAULT_CONNECTION_POLICY_CONFIG): Record<RoundState, ConnectionPolicy> {
  const {
    baseConnectionTimeout,
    baseGracePeriod,
    stateMultipliers,
    disableHeartbeatDuringCriticalStates
  } = config;
  
  return {
    waiting: {
      heartbeatEnabled: true,
      connectionTimeout: baseConnectionTimeout,
      gracePeriod: baseGracePeriod,
      description: 'Standard monitoring while waiting for match'
    },
    
    countdown: {
      heartbeatEnabled: true,
      connectionTimeout: Math.round(baseConnectionTimeout * stateMultipliers.countdownTimeoutMultiplier),
      gracePeriod: Math.round(baseGracePeriod * stateMultipliers.countdownGraceMultiplier),
      description: 'Relaxed monitoring during round countdown - players focused on UI'
    },
    
    active: {
      heartbeatEnabled: true,
      connectionTimeout: baseConnectionTimeout,
      gracePeriod: Math.round(baseGracePeriod * stateMultipliers.activeGraceMultiplier),
      description: 'Standard monitoring with extended grace during active gameplay'
    },
    
    ended: {
      heartbeatEnabled: !disableHeartbeatDuringCriticalStates,
      connectionTimeout: Math.round(baseConnectionTimeout * stateMultipliers.endedTimeoutMultiplier),
      gracePeriod: Math.round(baseGracePeriod * stateMultipliers.endedGraceMultiplier),
      description: disableHeartbeatDuringCriticalStates 
        ? 'Monitoring suspended during round end processing'
        : 'Extremely lenient monitoring during round end processing'
    },
    
    intermission: {
      heartbeatEnabled: true,
      connectionTimeout: Math.round(baseConnectionTimeout * stateMultipliers.intermissionTimeoutMultiplier),
      gracePeriod: Math.round(baseGracePeriod * stateMultipliers.intermissionGraceMultiplier),
      description: 'Relaxed monitoring during intermission between rounds'
    }
  };
}

/**
 * Get configuration by environment or preset name
 */
export function getConnectionPolicyConfig(preset?: 'default' | 'aggressive' | 'lenient' | 'custom'): ConnectionPolicyConfig {
  switch (preset) {
    case 'aggressive':
      return AGGRESSIVE_CONNECTION_POLICY_CONFIG;
    case 'lenient':
      return LENIENT_CONNECTION_POLICY_CONFIG;
    case 'custom':
      // Load from environment variables or external config
      return loadCustomConnectionPolicyConfig();
    default:
      return DEFAULT_CONNECTION_POLICY_CONFIG;
  }
}

/**
 * Load custom configuration from environment variables
 */
function loadCustomConnectionPolicyConfig(): ConnectionPolicyConfig {
  return {
    baseHeartbeatInterval: parseInt(process.env.CONNECTION_HEARTBEAT_INTERVAL || '30000'),
    baseConnectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '60000'),
    baseGracePeriod: parseInt(process.env.CONNECTION_GRACE_PERIOD || '2000'),
    
    stateMultipliers: {
      countdownTimeoutMultiplier: parseFloat(process.env.COUNTDOWN_TIMEOUT_MULTIPLIER || '1.5'),
      countdownGraceMultiplier: parseFloat(process.env.COUNTDOWN_GRACE_MULTIPLIER || '2'),
      
      activeGraceMultiplier: parseFloat(process.env.ACTIVE_GRACE_MULTIPLIER || '1.5'),
      
      endedTimeoutMultiplier: parseFloat(process.env.ENDED_TIMEOUT_MULTIPLIER || '3'),
      endedGraceMultiplier: parseFloat(process.env.ENDED_GRACE_MULTIPLIER || '5'),
      
      intermissionTimeoutMultiplier: parseFloat(process.env.INTERMISSION_TIMEOUT_MULTIPLIER || '2'),
      intermissionGraceMultiplier: parseFloat(process.env.INTERMISSION_GRACE_MULTIPLIER || '3'),
    },
    
    disableHeartbeatDuringCriticalStates: process.env.DISABLE_HEARTBEAT_CRITICAL_STATES === 'true'
  };
}

/**
 * Validate connection policy configuration
 */
export function validateConnectionPolicyConfig(config: ConnectionPolicyConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.baseHeartbeatInterval < 5000) {
    errors.push('Base heartbeat interval must be at least 5000ms (5 seconds)');
  }
  
  if (config.baseConnectionTimeout < config.baseHeartbeatInterval * 2) {
    errors.push('Base connection timeout must be at least 2x the heartbeat interval');
  }
  
  if (config.baseGracePeriod < 500) {
    errors.push('Base grace period must be at least 500ms');
  }
  
  if (config.stateMultipliers.endedTimeoutMultiplier < 2) {
    errors.push('Ended state timeout multiplier should be at least 2x for safe round processing');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}