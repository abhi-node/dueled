/**
 * MovementCalculator - Shared movement logic for client and server
 * 
 * Provides standardized movement calculations with intuitive WASD controls.
 * Used by both client prediction and server authority systems.
 */

export interface MovementInput {
  forward: number;   // -1 to 1 (W/S keys)
  strafe: number;    // -1 to 1 (A/D keys) 
  sprint: boolean;   // Sprint modifier
  angle: number;     // Player facing direction in radians
}

export interface MovementResult {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  speed: number;
}

export interface MovementConfig {
  baseSpeed: number;
  sprintMultiplier: number;
  movementThreshold: number; // Minimum input to register movement
}

export class MovementCalculator {
  private config: MovementConfig;
  
  constructor(config: MovementConfig) {
    this.config = config;
  }
  
  /**
   * Calculate movement for a single frame/tick
   * 
   * @param currentPosition Current player position
   * @param input Movement input (WASD + sprint + angle)
   * @param deltaTime Time elapsed in seconds
   * @returns New position, velocity, and speed
   */
  calculateMovement(
    currentPosition: { x: number; y: number },
    input: MovementInput,
    deltaTime: number
  ): MovementResult {
    // Normalize and validate inputs
    const normalizedInput = this.normalizeInput(input);
    
    // Check if there's significant movement input
    if (!this.hasSignificantMovement(normalizedInput)) {
      return {
        position: { ...currentPosition },
        velocity: { x: 0, y: 0 },
        speed: 0
      };
    }
    
    // Calculate movement vectors in world space
    const moveVectors = this.calculateMoveVectors(normalizedInput);
    
    // Apply speed and sprint modifier
    const finalSpeed = this.calculateFinalSpeed(normalizedInput);
    
    // Calculate velocity (units per second)
    const velocity = {
      x: moveVectors.x * finalSpeed,
      y: moveVectors.y * finalSpeed
    };
    
    // Calculate new position
    const newPosition = {
      x: currentPosition.x + velocity.x * deltaTime,
      y: currentPosition.y + velocity.y * deltaTime
    };
    
    return {
      position: newPosition,
      velocity,
      speed: finalSpeed
    };
  }
  
  /**
   * Normalize input values and handle edge cases
   */
  private normalizeInput(input: MovementInput): MovementInput {
    // Clamp movement inputs to valid range
    const forward = Math.max(-1, Math.min(1, input.forward || 0));
    const strafe = Math.max(-1, Math.min(1, input.strafe || 0));
    
    // Normalize diagonal movement to prevent speed boost
    let normalizedForward = forward;
    let normalizedStrafe = strafe;
    
    const magnitude = Math.sqrt(forward * forward + strafe * strafe);
    if (magnitude > 1) {
      normalizedForward = forward / magnitude;
      normalizedStrafe = strafe / magnitude;
    }
    
    // Normalize angle to 0-2π range
    let normalizedAngle = input.angle || 0;
    while (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
    while (normalizedAngle >= Math.PI * 2) normalizedAngle -= Math.PI * 2;
    
    return {
      forward: normalizedForward,
      strafe: normalizedStrafe,
      sprint: input.sprint || false,
      angle: normalizedAngle
    };
  }
  
  /**
   * Check if movement input exceeds threshold
   */
  private hasSignificantMovement(input: MovementInput): boolean {
    const totalInput = Math.abs(input.forward) + Math.abs(input.strafe);
    return totalInput > this.config.movementThreshold;
  }
  
  /**
   * Calculate movement vectors in world space with intuitive WASD controls
   */
  private calculateMoveVectors(input: MovementInput): { x: number; y: number } {
    const { forward, strafe, angle } = input;
    
    // FIXED: Intuitive WASD movement
    // W = move forward in facing direction
    // S = move backward from facing direction  
    // A = strafe left (perpendicular to facing direction)
    // D = strafe right (perpendicular to facing direction)
    
    // Forward/backward vector (in facing direction)
    const forwardX = Math.cos(angle) * forward;
    const forwardY = Math.sin(angle) * forward;
    
    // Strafe vector (perpendicular to facing direction)
    // Note: Using angle - PI/2 for left strafe (counter-clockwise from facing)
    const strafeX = Math.cos(angle - Math.PI/2) * strafe;
    const strafeY = Math.sin(angle - Math.PI/2) * strafe;
    
    // Combine vectors
    return {
      x: forwardX + strafeX,
      y: forwardY + strafeY
    };
  }
  
  /**
   * Calculate final movement speed with modifiers
   */
  private calculateFinalSpeed(input: MovementInput): number {
    let speed = this.config.baseSpeed;
    
    // Apply sprint modifier
    if (input.sprint) {
      speed *= this.config.sprintMultiplier;
    }
    
    return speed;
  }
  
  /**
   * Validate movement result (for bounds checking)
   */
  validateMovement(
    _oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number },
    bounds?: { minX: number; maxX: number; minY: number; maxY: number }
  ): { x: number; y: number } {
    if (!bounds) {
      return newPosition;
    }
    
    // Clamp to bounds
    const clampedPosition = {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, newPosition.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, newPosition.y))
    };
    
    return clampedPosition;
  }
  
  /**
   * Calculate the distance between two positions
   */
  static getDistance(pos1: { x: number; y: number }, pos2: { x: number; y: number }): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Create default movement configuration
   */
  static createDefaultConfig(): MovementConfig {
    return {
      baseSpeed: 5.0,           // Units per second
      sprintMultiplier: 1.5,    // 50% speed boost when sprinting
      movementThreshold: 0.01   // Minimum input to register movement
    };
  }
}