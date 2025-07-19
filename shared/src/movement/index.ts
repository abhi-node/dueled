/**
 * Shared movement types and utilities
 * 
 * Exports all movement-related types and classes for easy importing
 * across client and server codebases.
 */

export { 
  MovementCalculator,
  type MovementInput,
  type MovementResult,
  type MovementConfig
} from './MovementCalculator.js';

// Re-export for convenience  
import { MovementCalculator } from './MovementCalculator.js';
export const createDefaultMovementConfig = MovementCalculator.createDefaultConfig;
export const calculateDistance = MovementCalculator.getDistance;