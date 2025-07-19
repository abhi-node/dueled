/**
 * Input Types - Client-side input interfaces compatible with server
 * 
 * These types MUST match the server-side InputCommand interfaces exactly
 * for proper client-server communication.
 */

import type { Position } from './GameTypes.js';

// ============================================================================
// INPUT COMMANDS (Client → Server)
// ============================================================================

export type InputCommandType = 'movement' | 'look' | 'attack' | 'ability';

export interface InputCommand {
  type: InputCommandType;
  timestamp: number;      // Client timestamp for lag compensation
  sequenceId: number;     // Incremental ID for acknowledgment/rollback
  data: InputCommandData;
}

export interface InputCommandData {
  // Movement commands (WASD)
  forward?: number;       // -1 to 1 (W/S keys)
  strafe?: number;        // -1 to 1 (A/D keys)
  sprint?: boolean;       // Shift key held
  
  // Look commands (Mouse)
  angleDelta?: number;    // Radians per frame from mouse movement
  
  // Action commands (Clicks/Keys)
  action?: 'primary_attack' | 'secondary_attack' | 'dash';
  targetPosition?: Position; // For aimed attacks (future)
}

// ============================================================================
// INPUT BATCHING
// ============================================================================

export interface InputBatch {
  commands: InputCommand[];
  clientTime: number;     // Client timestamp when batch was created
}

// ============================================================================
// INPUT STATE TRACKING
// ============================================================================

export interface KeyState {
  forward: boolean;       // W key
  backward: boolean;      // S key
  left: boolean;          // A key
  right: boolean;         // D key
  sprint: boolean;        // Shift key
  dash: boolean;          // Space key
}

export interface MouseState {
  deltaX: number;         // Horizontal mouse movement
  deltaY: number;         // Vertical mouse movement (unused for now)
  leftButton: boolean;    // Primary attack
  rightButton: boolean;   // Secondary attack
  middleButton: boolean;  // Ability/dash
}

// ============================================================================
// INPUT CONFIGURATION
// ============================================================================

export interface InputConfig {
  mouseSensitivity: number;     // Mouse sensitivity multiplier
  invertY: boolean;             // Invert Y axis (unused for now)
  keyBindings: KeyBindings;     // Customizable key bindings
}

export interface KeyBindings {
  forward: string;              // Default: 'KeyW'
  backward: string;             // Default: 'KeyS'
  left: string;                 // Default: 'KeyA'
  right: string;                // Default: 'KeyD'
  sprint: string;               // Default: 'ShiftLeft'
  dash: string;                 // Default: 'Space'
  primaryAttack: string;        // Default: 'Mouse0'
  secondaryAttack: string;      // Default: 'Mouse2'
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

export interface InputValidationResult {
  valid: boolean;
  reason?: string;
}

// Default configuration
export const DEFAULT_INPUT_CONFIG: InputConfig = {
  mouseSensitivity: 1.0,
  invertY: false,
  keyBindings: {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    sprint: 'ShiftLeft',
    dash: 'Space',
    primaryAttack: 'Mouse0',
    secondaryAttack: 'Mouse2'
  }
};

// Input constants
export const INPUT_CONSTANTS = {
  // Timing
  CAPTURE_RATE: 60,                    // 60 FPS input capture
  BATCH_RATE: 30,                      // 30 Hz server transmission
  BATCH_INTERVAL: 1000 / 30,           // ~33ms batching interval
  
  // Validation
  MAX_MOVEMENT_VALUE: 1.0,             // Movement input clamping
  MAX_ANGLE_DELTA: Math.PI / 4,        // Max angle change per frame
  MAX_COMMANDS_PER_BATCH: 10,          // Prevent spam
  
  // Anti-cheat
  MAX_SEQUENCE_GAP: 100,               // Max missing sequence numbers
  INPUT_TIMEOUT: 5000,                 // 5s timeout for stale inputs
} as const;