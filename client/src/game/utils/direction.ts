/**
 * Direction utilities for sprite rendering
 */

import { WalkDirection } from '../renderer/SpriteSheet';

/**
 * Convert relative viewing angle to sprite direction
 * This determines which sprite row to use based on how the viewer sees the player
 * 
 * @param relativeAngleRad - The relative angle in radians between player facing and viewer angle
 * @returns The appropriate WalkDirection for sprite rendering
 */
export function angleToDirection(relativeAngleRad: number): WalkDirection {
  // Normalize angle to [0, 2π]
  let normalizedAngle = relativeAngleRad % (2 * Math.PI);
  if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
  
  // Convert to degrees for easier calculation
  const degrees = normalizedAngle * 180 / Math.PI;
  
  // Determine sprite direction based on viewing angle
  // This is from the perspective of the viewer looking at the sprite
  // Forward: Player facing towards viewer (135° to 225°)
  // Right: Player facing right relative to viewer (45° to 135°)  
  // Backward: Player facing away from viewer (315° to 45°)
  // Left: Player facing left relative to viewer (225° to 315°)
  
  if (degrees >= 315 || degrees < 45) {
    return WalkDirection.BACKWARD; // Player facing away from viewer
  } else if (degrees >= 45 && degrees < 135) {
    return WalkDirection.RIGHT; // Player facing right relative to viewer
  } else if (degrees >= 135 && degrees < 225) {
    return WalkDirection.FORWARD; // Player facing towards viewer
  } else {
    return WalkDirection.LEFT; // Player facing left relative to viewer
  }
}