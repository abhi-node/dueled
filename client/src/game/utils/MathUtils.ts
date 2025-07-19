/**
 * MathUtils - Vector math and angle calculations for game operations
 * 
 * Provides utility functions for 2D vector operations, angle calculations,
 * and common game mathematics.
 */

import type { Position, Velocity } from '../types/GameTypes.js';

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

export class Vector2 {
  constructor(public x: number, public y: number) {}
  
  /**
   * Add another vector to this vector
   */
  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }
  
  /**
   * Subtract another vector from this vector
   */
  subtract(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }
  
  /**
   * Multiply vector by scalar
   */
  multiply(scalar: number): Vector2 {
    return new Vector2(this.x * scalar, this.y * scalar);
  }
  
  /**
   * Divide vector by scalar
   */
  divide(scalar: number): Vector2 {
    if (scalar === 0) throw new Error('Division by zero');
    return new Vector2(this.x / scalar, this.y / scalar);
  }
  
  /**
   * Get magnitude (length) of vector
   */
  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  
  /**
   * Get squared magnitude (faster than magnitude for comparisons)
   */
  magnitudeSquared(): number {
    return this.x * this.x + this.y * this.y;
  }
  
  /**
   * Normalize vector to unit length
   */
  normalize(): Vector2 {
    const mag = this.magnitude();
    if (mag === 0) return new Vector2(0, 0);
    return this.divide(mag);
  }
  
  /**
   * Get distance to another vector
   */
  distanceTo(other: Vector2): number {
    return this.subtract(other).magnitude();
  }
  
  /**
   * Get squared distance to another vector (faster for comparisons)
   */
  distanceSquaredTo(other: Vector2): number {
    return this.subtract(other).magnitudeSquared();
  }
  
  /**
   * Get dot product with another vector
   */
  dot(other: Vector2): number {
    return this.x * other.x + this.y * other.y;
  }
  
  /**
   * Get cross product with another vector (2D cross product returns scalar)
   */
  cross(other: Vector2): number {
    return this.x * other.y - this.y * other.x;
  }
  
  /**
   * Rotate vector by angle (in radians)
   */
  rotate(angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }
  
  /**
   * Get angle of vector (in radians)
   */
  angle(): number {
    return Math.atan2(this.y, this.x);
  }
  
  /**
   * Clamp vector magnitude to maximum length
   */
  clampMagnitude(maxLength: number): Vector2 {
    const mag = this.magnitude();
    if (mag > maxLength) {
      return this.normalize().multiply(maxLength);
    }
    return new Vector2(this.x, this.y);
  }
  
  /**
   * Linear interpolation to another vector
   */
  lerp(other: Vector2, t: number): Vector2 {
    const clampedT = Math.max(0, Math.min(1, t));
    return new Vector2(
      this.x + (other.x - this.x) * clampedT,
      this.y + (other.y - this.y) * clampedT
    );
  }
  
  /**
   * Convert to plain Position object
   */
  toPosition(): Position {
    return { x: this.x, y: this.y };
  }
  
  /**
   * Create Vector2 from Position
   */
  static fromPosition(pos: Position): Vector2 {
    return new Vector2(pos.x, pos.y);
  }
  
  /**
   * Create zero vector
   */
  static zero(): Vector2 {
    return new Vector2(0, 0);
  }
  
  /**
   * Create unit vector pointing right
   */
  static right(): Vector2 {
    return new Vector2(1, 0);
  }
  
  /**
   * Create unit vector pointing up
   */
  static up(): Vector2 {
    return new Vector2(0, 1);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate distance between two points
 */
export function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate squared distance (faster for comparisons)
 */
export function distanceSquared(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  const clampedT = Math.max(0, Math.min(1, t));
  return a + (b - a) * clampedT;
}

/**
 * Linear interpolation between two positions
 */
export function lerpPosition(a: Position, b: Position, t: number): Position {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t)
  };
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize angle to 0-2π range
 */
export function normalizeAngle(angle: number): number {
  while (angle < 0) angle += Math.PI * 2;
  while (angle >= Math.PI * 2) angle -= Math.PI * 2;
  return angle;
}

/**
 * Get shortest angular distance between two angles
 */
export function angleDifference(a: number, b: number): number {
  const diff = normalizeAngle(b - a);
  return diff > Math.PI ? diff - Math.PI * 2 : diff;
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Calculate angle from one point to another
 */
export function angleFromTo(from: Position, to: Position): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Get position at distance and angle from origin
 */
export function positionAtAngle(origin: Position, angle: number, distance: number): Position {
  return {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance
  };
}

/**
 * Check if point is within bounds
 */
export function isInBounds(position: Position, bounds: { minX: number; maxX: number; minY: number; maxY: number }): boolean {
  return position.x >= bounds.minX && 
         position.x <= bounds.maxX && 
         position.y >= bounds.minY && 
         position.y <= bounds.maxY;
}

/**
 * Check if two circles overlap
 */
export function circlesOverlap(
  center1: Position, 
  radius1: number, 
  center2: Position, 
  radius2: number
): boolean {
  const dist = distance(center1, center2);
  return dist < (radius1 + radius2);
}

/**
 * Check if point is inside circle
 */
export function pointInCircle(point: Position, center: Position, radius: number): boolean {
  return distance(point, center) <= radius;
}

/**
 * Get random position within bounds
 */
export function randomPosition(bounds: { minX: number; maxX: number; minY: number; maxY: number }): Position {
  return {
    x: lerp(bounds.minX, bounds.maxX, Math.random()),
    y: lerp(bounds.minY, bounds.maxY, Math.random())
  };
}

/**
 * Get random angle (0 to 2π)
 */
export function randomAngle(): number {
  return Math.random() * Math.PI * 2;
}

/**
 * Get random value between min and max
 */
export function randomRange(min: number, max: number): number {
  return lerp(min, max, Math.random());
}

// ============================================================================
// MOVEMENT CALCULATIONS
// ============================================================================

/**
 * Calculate movement vector from input
 */
export function calculateMovementVector(
  forward: number, 
  strafe: number, 
  facingAngle: number
): Vector2 {
  // Calculate forward and strafe vectors in world space
  const forwardVector = new Vector2(Math.cos(facingAngle), Math.sin(facingAngle)).multiply(forward);
  const strafeVector = new Vector2(Math.cos(facingAngle + Math.PI/2), Math.sin(facingAngle + Math.PI/2)).multiply(strafe);
  
  return forwardVector.add(strafeVector);
}

/**
 * Apply movement with speed and delta time
 */
export function applyMovement(
  currentPosition: Position,
  movementVector: Vector2,
  speed: number,
  deltaTime: number
): Position {
  const movement = movementVector.multiply(speed * deltaTime);
  return {
    x: currentPosition.x + movement.x,
    y: currentPosition.y + movement.y
  };
}

/**
 * Calculate velocity from position change and time
 */
export function calculateVelocity(
  oldPosition: Position,
  newPosition: Position,
  deltaTime: number
): Velocity {
  if (deltaTime === 0) return { x: 0, y: 0 };
  
  return {
    x: (newPosition.x - oldPosition.x) / deltaTime,
    y: (newPosition.y - oldPosition.y) / deltaTime
  };
}

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Get high-precision timestamp
 */
export function getHighPrecisionTime(): number {
  return performance.now();
}

/**
 * Convert milliseconds to seconds
 */
export function msToSeconds(ms: number): number {
  return ms / 1000;
}

/**
 * Convert seconds to milliseconds
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}