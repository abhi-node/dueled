/**
 * Shared movement types and utilities
 *
 * Exports all movement-related types and classes for easy importing
 * across client and server codebases.
 */
export { MovementCalculator } from './MovementCalculator.js';
// Re-export for convenience
export const createDefaultMovementConfig = MovementCalculator.createDefaultConfig;
export const calculateDistance = MovementCalculator.getDistance;
//# sourceMappingURL=index.js.map