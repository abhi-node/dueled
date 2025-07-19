/**
 * MovementCalculator - Shared movement logic for client and server
 *
 * Provides standardized movement calculations with intuitive WASD controls.
 * Used by both client prediction and server authority systems.
 */
export interface MovementInput {
    forward: number;
    strafe: number;
    sprint: boolean;
    angle: number;
}
export interface MovementResult {
    position: {
        x: number;
        y: number;
    };
    velocity: {
        x: number;
        y: number;
    };
    speed: number;
}
export interface MovementConfig {
    baseSpeed: number;
    sprintMultiplier: number;
    movementThreshold: number;
}
export declare class MovementCalculator {
    private config;
    constructor(config: MovementConfig);
    /**
     * Calculate movement for a single frame/tick
     *
     * @param currentPosition Current player position
     * @param input Movement input (WASD + sprint + angle)
     * @param deltaTime Time elapsed in seconds
     * @returns New position, velocity, and speed
     */
    calculateMovement(currentPosition: {
        x: number;
        y: number;
    }, input: MovementInput, deltaTime: number): MovementResult;
    /**
     * Normalize input values and handle edge cases
     */
    private normalizeInput;
    /**
     * Check if movement input exceeds threshold
     */
    private hasSignificantMovement;
    /**
     * Calculate movement vectors in world space with intuitive WASD controls
     */
    private calculateMoveVectors;
    /**
     * Calculate final movement speed with modifiers
     */
    private calculateFinalSpeed;
    /**
     * Validate movement result (for bounds checking)
     */
    validateMovement(oldPosition: {
        x: number;
        y: number;
    }, newPosition: {
        x: number;
        y: number;
    }, bounds?: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    }): {
        x: number;
        y: number;
    };
    /**
     * Calculate the distance between two positions
     */
    static getDistance(pos1: {
        x: number;
        y: number;
    }, pos2: {
        x: number;
        y: number;
    }): number;
    /**
     * Create default movement configuration
     */
    static createDefaultConfig(): MovementConfig;
}
//# sourceMappingURL=MovementCalculator.d.ts.map