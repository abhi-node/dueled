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
  PLAYER_SPEED: 10.0,         // Units per second (2x speed: 5.0 → 10.0)
  SPRINT_MULTIPLIER: 1.5,     // Sprint speed multiplier
  DASH_SPEED: 24.0,           // Dash speed (2x speed: 12.0 → 24.0)
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
  
  // Map bounds (must match server - scaled 60x60 arena)
  MAP_BOUNDS: {
    minX: 0,
    maxX: 60,
    minY: 0,
    maxY: 60
  }
} as const;

// ============================================================================
// RENDERING CONSTANTS (Client-specific)
// ============================================================================

export const RENDER_CONSTANTS = {
  // Raycasting
  FOV: Math.PI / 2,           // 90 degrees field of view (wide peripheral vision)
  RENDER_DISTANCE: 85,        // Increased for 60x60 arena diagonal visibility (60√2 ≈ 84.85)
  RAY_COUNT: 160,             // Number of rays to cast (reduced for pixel art performance)
  
  // Scale factors for room-like feel
  WALL_HEIGHT_SCALE: 4.6875,  // Makes walls appear much taller relative to distance (50% increase from 3.125)
  PERSPECTIVE_SCALE: 1.2,     // Makes world feel larger and more spacious
  
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
  
  // Reconciliation thresholds - Adjusted for 2x speed
  STATIC_RECONCILIATION_THRESHOLD: 2.0,   // Allow 2 unit drift when not moving (2x for speed)
  MOVING_RECONCILIATION_THRESHOLD: 10.0,  // Allow 10 units drift when moving actively (2x for speed)
  
  // Correction factors - Ultra-gentle corrections
  GENTLE_CORRECTION_FACTOR: 0.01,     // Barely noticeable corrections for small errors
  MEDIUM_CORRECTION_FACTOR: 0.05,     // Still very gentle for medium errors
  SNAP_CORRECTION_THRESHOLD: 16.0,    // Only snap for teleport-level errors (2x for speed)
  
  // Error magnitude thresholds
  SMALL_ERROR_THRESHOLD: 6.0,         // Much larger boundary for small vs medium errors (2x for speed)
} as const;