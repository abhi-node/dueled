import { Vector2 } from '@dueled/shared';
import { SimpleArena, SimplePlayer, Wall } from './SimpleGameLoop.js';
import { logger } from '../../utils/logger.js';

/**
 * SimplePhysics - Scalable collision detection and movement
 * 
 * Designed for optimal performance in 1v1 arena combat
 * Extensible architecture for future features (destructible walls, etc.)
 */

export interface CollisionResult {
  collided: boolean;
  correctedPosition: Vector2;
  collisionNormal?: Vector2;
  collisionType?: 'wall' | 'boundary' | 'player';
}

export interface MovementConstraints {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  allowWallClipping: boolean;
}

/**
 * SimplePhysics class - handles all collision detection and movement validation
 * 
 * Features:
 * - AABB (Axis-Aligned Bounding Box) collision detection
 * - Arena boundary enforcement
 * - Wall collision with sliding
 * - Player-to-player collision (optional)
 * - Projectile collision detection
 * - Scalable to more complex physics when needed
 */
export class SimplePhysics {
  private readonly PLAYER_RADIUS = 0.4; // Player collision radius in tiles
  private readonly PROJECTILE_RADIUS = 0.1; // Projectile collision radius
  private readonly WALL_THICKNESS = 0.1; // Wall collision thickness
  
  /**
   * Validate and correct player movement
   */
  validatePlayerMovement(
    player: SimplePlayer,
    newPosition: Vector2,
    arena: SimpleArena,
    otherPlayers: SimplePlayer[] = []
  ): CollisionResult {
    let correctedPosition = { ...newPosition };
    let collided = false;
    let collisionType: CollisionResult['collisionType'] = undefined;
    let collisionNormal: Vector2 | undefined = undefined;

    // Check arena boundaries
    const boundaryResult = this.checkArenaBoundaries(correctedPosition, arena);
    if (boundaryResult.collided) {
      correctedPosition = boundaryResult.correctedPosition;
      collided = true;
      collisionType = 'boundary';
      collisionNormal = boundaryResult.collisionNormal;
    }

    // Check wall collisions
    const wallResult = this.checkWallCollisions(correctedPosition, arena.walls);
    if (wallResult.collided) {
      correctedPosition = wallResult.correctedPosition;
      collided = true;
      collisionType = 'wall';
      collisionNormal = wallResult.collisionNormal;
    }

    // Check player-to-player collisions (optional for arena combat)
    for (const otherPlayer of otherPlayers) {
      if (otherPlayer.id === player.id || !otherPlayer.isAlive) continue;
      
      const playerResult = this.checkPlayerCollision(correctedPosition, otherPlayer.position);
      if (playerResult.collided) {
        correctedPosition = playerResult.correctedPosition;
        collided = true;
        collisionType = 'player';
        collisionNormal = playerResult.collisionNormal;
        break; // Only handle one player collision at a time
      }
    }

    return {
      collided,
      correctedPosition,
      collisionNormal,
      collisionType
    };
  }

  /**
   * Check projectile collisions with walls and boundaries
   */
  validateProjectileMovement(
    position: Vector2,
    arena: SimpleArena
  ): CollisionResult {
    // Check arena boundaries
    const boundaryResult = this.checkArenaBoundaries(position, arena, this.PROJECTILE_RADIUS);
    if (boundaryResult.collided) {
      return {
        collided: true,
        correctedPosition: position,
        collisionType: 'boundary'
      };
    }

    // Check wall collisions
    const wallResult = this.checkWallCollisions(position, arena.walls, this.PROJECTILE_RADIUS);
    if (wallResult.collided) {
      return {
        collided: true,
        correctedPosition: position,
        collisionType: 'wall'
      };
    }

    return {
      collided: false,
      correctedPosition: position
    };
  }

  /**
   * Check collision between projectile and player
   */
  checkProjectilePlayerCollision(
    projectilePosition: Vector2,
    playerPosition: Vector2
  ): boolean {
    const distance = this.calculateDistance(projectilePosition, playerPosition);
    return distance <= (this.PROJECTILE_RADIUS + this.PLAYER_RADIUS);
  }

  /**
   * Check arena boundary collisions
   */
  private checkArenaBoundaries(
    position: Vector2,
    arena: SimpleArena,
    radius: number = this.PLAYER_RADIUS
  ): CollisionResult {
    let correctedPosition = { ...position };
    let collided = false;
    let collisionNormal: Vector2 | undefined = undefined;

    // Left boundary
    if (position.x - radius < 0) {
      correctedPosition.x = radius;
      collided = true;
      collisionNormal = { x: 1, y: 0 };
    }
    // Right boundary
    else if (position.x + radius > arena.size.x) {
      correctedPosition.x = arena.size.x - radius;
      collided = true;
      collisionNormal = { x: -1, y: 0 };
    }

    // Top boundary
    if (position.y - radius < 0) {
      correctedPosition.y = radius;
      collided = true;
      collisionNormal = { x: 0, y: 1 };
    }
    // Bottom boundary
    else if (position.y + radius > arena.size.y) {
      correctedPosition.y = arena.size.y - radius;
      collided = true;
      collisionNormal = { x: 0, y: -1 };
    }

    return {
      collided,
      correctedPosition,
      collisionNormal
    };
  }

  /**
   * Check wall collisions using line-circle intersection
   */
  private checkWallCollisions(
    position: Vector2,
    walls: Wall[],
    radius: number = this.PLAYER_RADIUS
  ): CollisionResult {
    for (const wall of walls) {
      const collision = this.checkLineCircleCollision(
        wall.start,
        wall.end,
        position,
        radius
      );

      if (collision.collided) {
        return collision;
      }
    }

    return {
      collided: false,
      correctedPosition: position
    };
  }

  /**
   * Check player-to-player collision
   */
  private checkPlayerCollision(
    position: Vector2,
    otherPlayerPosition: Vector2
  ): CollisionResult {
    const distance = this.calculateDistance(position, otherPlayerPosition);
    const minDistance = this.PLAYER_RADIUS * 2;

    if (distance < minDistance && distance > 0) {
      // Push players apart
      const pushDirection = this.normalizeVector({
        x: position.x - otherPlayerPosition.x,
        y: position.y - otherPlayerPosition.y
      });

      const overlap = minDistance - distance;
      const pushDistance = overlap * 0.5; // Each player gets pushed half the overlap

      const correctedPosition = {
        x: position.x + pushDirection.x * pushDistance,
        y: position.y + pushDirection.y * pushDistance
      };

      return {
        collided: true,
        correctedPosition,
        collisionNormal: pushDirection
      };
    }

    return {
      collided: false,
      correctedPosition: position
    };
  }

  /**
   * Line-circle collision detection for wall collisions
   */
  private checkLineCircleCollision(
    lineStart: Vector2,
    lineEnd: Vector2,
    circleCenter: Vector2,
    circleRadius: number
  ): CollisionResult {
    // Vector from line start to circle center
    const startToCenter = {
      x: circleCenter.x - lineStart.x,
      y: circleCenter.y - lineStart.y
    };

    // Line direction vector
    const lineDirection = {
      x: lineEnd.x - lineStart.x,
      y: lineEnd.y - lineStart.y
    };

    const lineLength = this.calculateDistance(lineStart, lineEnd);
    if (lineLength === 0) return { collided: false, correctedPosition: circleCenter };

    // Normalize line direction
    const normalizedLine = {
      x: lineDirection.x / lineLength,
      y: lineDirection.y / lineLength
    };

    // Project circle center onto line
    const projection = this.dotProduct(startToCenter, normalizedLine);
    const clampedProjection = Math.max(0, Math.min(lineLength, projection));

    // Closest point on line to circle center
    const closestPoint = {
      x: lineStart.x + normalizedLine.x * clampedProjection,
      y: lineStart.y + normalizedLine.y * clampedProjection
    };

    // Distance from circle center to closest point
    const distanceToLine = this.calculateDistance(circleCenter, closestPoint);

    if (distanceToLine <= circleRadius) {
      // Calculate collision normal (from line to circle center)
      const collisionNormal = this.normalizeVector({
        x: circleCenter.x - closestPoint.x,
        y: circleCenter.y - closestPoint.y
      });

      // Push circle away from line
      const pushDistance = circleRadius - distanceToLine + this.WALL_THICKNESS;
      const correctedPosition = {
        x: circleCenter.x + collisionNormal.x * pushDistance,
        y: circleCenter.y + collisionNormal.y * pushDistance
      };

      return {
        collided: true,
        correctedPosition,
        collisionNormal
      };
    }

    return {
      collided: false,
      correctedPosition: circleCenter
    };
  }

  /**
   * Apply movement constraints for smooth gameplay
   */
  applyMovementConstraints(
    currentVelocity: Vector2,
    targetVelocity: Vector2,
    constraints: MovementConstraints,
    deltaTime: number
  ): Vector2 {
    const dt = deltaTime / 1000; // Convert to seconds

    // Calculate target speed
    const targetSpeed = this.calculateVectorLength(targetVelocity);
    const clampedSpeed = Math.min(targetSpeed, constraints.maxSpeed);

    // If no input, apply deceleration
    if (targetSpeed === 0) {
      const currentSpeed = this.calculateVectorLength(currentVelocity);
      if (currentSpeed > 0) {
        const decelerationAmount = constraints.deceleration * dt;
        const newSpeed = Math.max(0, currentSpeed - decelerationAmount);
        const normalizedCurrent = this.normalizeVector(currentVelocity);
        
        return {
          x: normalizedCurrent.x * newSpeed,
          y: normalizedCurrent.y * newSpeed
        };
      }
      return { x: 0, y: 0 };
    }

    // Apply acceleration towards target velocity
    const targetDirection = this.normalizeVector(targetVelocity);
    const targetVel = {
      x: targetDirection.x * clampedSpeed,
      y: targetDirection.y * clampedSpeed
    };

    // Lerp towards target velocity with acceleration
    const accelerationFactor = Math.min(1, constraints.acceleration * dt);
    
    return {
      x: this.lerp(currentVelocity.x, targetVel.x, accelerationFactor),
      y: this.lerp(currentVelocity.y, targetVel.y, accelerationFactor)
    };
  }

  /**
   * Get movement constraints for different classes (scalable)
   */
  getClassMovementConstraints(classType: string): MovementConstraints {
    const constraints = {
      'BERSERKER': {
        maxSpeed: 5.0,
        acceleration: 15.0,
        deceleration: 10.0,
        allowWallClipping: false
      },
      'MAGE': {
        maxSpeed: 4.5,
        acceleration: 12.0,
        deceleration: 8.0,
        allowWallClipping: false
      },
      'ARCHER': {
        maxSpeed: 5.5,
        acceleration: 18.0,
        deceleration: 12.0,
        allowWallClipping: false
      },
      'BOMBER': {
        maxSpeed: 4.0,
        acceleration: 10.0,
        deceleration: 6.0,
        allowWallClipping: false
      }
    };

    return constraints[classType] || constraints['BERSERKER'];
  }

  /**
   * Check if position is valid (not inside walls or outside boundaries)
   */
  isValidPosition(position: Vector2, arena: SimpleArena, radius: number = this.PLAYER_RADIUS): boolean {
    // Check boundaries
    if (position.x - radius < 0 || position.x + radius > arena.size.x ||
        position.y - radius < 0 || position.y + radius > arena.size.y) {
      return false;
    }

    // Check walls
    for (const wall of arena.walls) {
      const distance = this.distanceToLineSegment(position, wall.start, wall.end);
      if (distance <= radius) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find nearest valid position (for spawn points, teleportation, etc.)
   */
  findNearestValidPosition(
    targetPosition: Vector2,
    arena: SimpleArena,
    radius: number = this.PLAYER_RADIUS,
    maxSearchRadius: number = 5.0
  ): Vector2 | null {
    // Check if target position is already valid
    if (this.isValidPosition(targetPosition, arena, radius)) {
      return targetPosition;
    }

    // Search in expanding circles
    const searchSteps = 20;
    const stepSize = maxSearchRadius / searchSteps;

    for (let r = stepSize; r <= maxSearchRadius; r += stepSize) {
      const angleSteps = Math.max(8, Math.floor(r * 4)); // More angles for larger radii
      
      for (let i = 0; i < angleSteps; i++) {
        const angle = (2 * Math.PI * i) / angleSteps;
        const testPosition = {
          x: targetPosition.x + Math.cos(angle) * r,
          y: targetPosition.y + Math.sin(angle) * r
        };

        if (this.isValidPosition(testPosition, arena, radius)) {
          return testPosition;
        }
      }
    }

    logger.warn(`Could not find valid position near (${targetPosition.x}, ${targetPosition.y})`);
    return null;
  }

  /**
   * Utility functions
   */
  private calculateDistance(pos1: Vector2, pos2: Vector2): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateVectorLength(vector: Vector2): number {
    return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  }

  private normalizeVector(vector: Vector2): Vector2 {
    const length = this.calculateVectorLength(vector);
    if (length === 0) return { x: 0, y: 0 };
    return { x: vector.x / length, y: vector.y / length };
  }

  private dotProduct(v1: Vector2, v2: Vector2): number {
    return v1.x * v2.x + v1.y * v2.y;
  }

  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
  }

  private distanceToLineSegment(point: Vector2, lineStart: Vector2, lineEnd: Vector2): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      return this.calculateDistance(point, lineStart);
    }

    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));

    const closestPoint = {
      x: lineStart.x + param * C,
      y: lineStart.y + param * D
    };

    return this.calculateDistance(point, closestPoint);
  }

  /**
   * Debug utilities for development
   */
  debugCollision(result: CollisionResult): void {
    if (result.collided) {
      logger.debug(`Collision detected: type=${result.collisionType}, ` +
                  `corrected=(${result.correctedPosition.x.toFixed(2)}, ${result.correctedPosition.y.toFixed(2)}), ` +
                  `normal=(${result.collisionNormal?.x.toFixed(2)}, ${result.collisionNormal?.y.toFixed(2)})`);
    }
  }

  /**
   * Performance optimization: pre-compute collision maps for static geometry
   * This can be extended for larger arenas or destructible environments
   */
  precomputeCollisionMap(arena: SimpleArena, resolution: number = 0.5): boolean[][] {
    const width = Math.ceil(arena.size.x / resolution);
    const height = Math.ceil(arena.size.y / resolution);
    const collisionMap: boolean[][] = [];

    for (let y = 0; y < height; y++) {
      collisionMap[y] = [];
      for (let x = 0; x < width; x++) {
        const worldPos = {
          x: x * resolution + resolution * 0.5,
          y: y * resolution + resolution * 0.5
        };
        
        collisionMap[y][x] = !this.isValidPosition(worldPos, arena, resolution * 0.4);
      }
    }

    return collisionMap;
  }
}