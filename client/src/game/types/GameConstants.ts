/**
 * Game Constants - Client-side constants that MUST match server values
 * 
 * These constants should be kept in sync with the server's GAME_CONSTANTS
 * to ensure client prediction matches server behavior exactly.
 */

// ============================================================================
// PHYSICS CONSTANTS
// ============================================================================

export const GAME_CONSTANTS = {
  // Physics (must match server)
  PLAYER_SPEED: 5.0,          // Units per second
  SPRINT_MULTIPLIER: 1.5,     // Sprint speed multiplier
  DASH_SPEED: 12.0,           // Dash speed
  DASH_DURATION: 200,         // Dash duration in ms
  DASH_COOLDOWN: 3000,        // Dash cooldown in ms
  
  // Health & Combat (must match server)
  BASE_HEALTH: 100,           // Starting health
  BASE_ARMOR: 50,             // Starting armor
  
  // Timing (must match server)
  ROUND_DURATION: 60,         // Round duration in seconds
  INTERMISSION_TIME: 10,      // Time between rounds in seconds
  MAX_ROUNDS: 5,              // Best of 5
  ROUNDS_TO_WIN: 3,           // First to 3 wins
  
  // Input validation (must match server)
  MAX_INPUT_AGE: 5000,        // Max age for input commands (ms)
  MAX_ANGLE_DELTA: Math.PI / 4, // Max angle change per frame
  
  // Map bounds (must match server)
  MAP_BOUNDS: {
    minX: -50,
    maxX: 50,
    minY: -50,
    maxY: 50
  }
} as const;

// ============================================================================
// RENDERING CONSTANTS (Client-specific)
// ============================================================================

export const RENDER_CONSTANTS = {
  // Raycasting
  FOV: Math.PI / 4,           // 45 degrees field of view (narrower for room feel)
  RENDER_DISTANCE: 15,        // Reduced render distance for tighter spaces
  RAY_COUNT: 160,             // Number of rays to cast (reduced for pixel art performance)
  
  // Scale factors for room-like feel
  WALL_HEIGHT_SCALE: 1.5,     // Makes walls appear taller relative to distance
  PERSPECTIVE_SCALE: 0.8,     // Adjusts overall world scale feeling
  
  // Performance
  TARGET_FPS: 60,             // Target client FPS
  INTERPOLATION_BUFFER: 100,  // Interpolation buffer in ms
  
  // UI
  CROSSHAIR_SIZE: 4,          // Crosshair size in pixels
  HEALTH_BAR_WIDTH: 100,      // Health bar width
  MINIMAP_SIZE: 150,          // Minimap size in pixels
} as const;

// ============================================================================
// WEAPON CONSTANTS (Must match server)
// ============================================================================

export const WEAPON_CONSTANTS = {
  gunslinger: {
    damage: 45,
    range: 15,
    cooldown: 800,              // 0.8 seconds
    projectileSpeed: 0,         // Hitscan
    piercing: true,
  },
  demolitionist: {
    damage: 70,
    range: 8,
    cooldown: 2000,             // 2 seconds
    projectileSpeed: 8,
    explosionRadius: 3,
  },
  buckshot: {
    damage: 25,                 // Per pellet
    range: 6,
    cooldown: 1200,             // 1.2 seconds
    projectileSpeed: 12,
    pelletCount: 4,
  }
} as const;

// ============================================================================
// NETWORK CONSTANTS (Client-specific)
// ============================================================================

export const CLIENT_NETWORK_CONSTANTS = {
  // Input capture
  INPUT_CAPTURE_RATE: 60,     // 60 FPS input capture
  INPUT_SEND_RATE: 30,        // 30 Hz server transmission
  
  // Prediction
  PREDICTION_BUFFER_SIZE: 60, // 1 second of inputs at 60 FPS
  RECONCILIATION_WINDOW: 100, // Max reconciliation window in ms
  
  // Connection
  HEARTBEAT_INTERVAL: 1000,   // 1 second heartbeat
  RECONNECT_ATTEMPTS: 3,      // Max reconnection attempts
  CONNECTION_TIMEOUT: 10000,  // 10 second timeout
} as const;

// ============================================================================
// CLIENT PREDICTION CONSTANTS
// ============================================================================

export const PREDICTION_CONSTANTS = {
  // Movement thresholds
  MOVEMENT_INPUT_THRESHOLD: 0.01,     // Minimum input to register movement
  
  // Reconciliation thresholds - Extremely lenient for smooth movement
  STATIC_RECONCILIATION_THRESHOLD: 1.0,   // Allow 1 unit drift when not moving
  MOVING_RECONCILIATION_THRESHOLD: 5.0,   // Allow 5 units drift when moving actively
  
  // Correction factors - Ultra-gentle corrections
  GENTLE_CORRECTION_FACTOR: 0.01,     // Barely noticeable corrections for small errors
  MEDIUM_CORRECTION_FACTOR: 0.05,     // Still very gentle for medium errors
  SNAP_CORRECTION_THRESHOLD: 8.0,     // Only snap for teleport-level errors
  
  // Error magnitude thresholds
  SMALL_ERROR_THRESHOLD: 3.0,         // Much larger boundary for small vs medium errors
} as const;