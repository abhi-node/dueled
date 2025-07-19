/**
 * CollisionSystem - AABB collision detection and ray-wall intersections
 * 
 * Integrates seamlessly with GameState and MatchManager for server-authoritative physics
 */

import { logger } from '../../utils/logger.js';
import type { 
  Position, 
  Velocity, 
  WallDefinition, 
  PlayerState, 
  ProjectileState
} from '../types.js';
import { GAME_CONSTANTS } from '../types.js';

export interface CollisionResult {
  collided: boolean;
  correctedPosition?: Position;
  correctedVelocity?: Velocity;
  normal?: Position; // Wall normal for bounce calculations
  wallId?: string;
}

export interface RaycastHit {
  hit: boolean;
  position?: Position;
  distance?: number;
  wallId?: string;
  normal?: Position;
}

/**
 * Efficient collision detection system optimized for 2D arena combat
 */
export class CollisionSystem {
  private walls: WallDefinition[] = [];
  private mapBounds = GAME_CONSTANTS.MAP_BOUNDS;
  
  // Player collision radius (for circle-wall collision)
  private readonly PLAYER_RADIUS = 0.4;
  private readonly PROJECTILE_RADIUS = 0.1;
  
  constructor(walls: WallDefinition[]) {
    this.walls = [...walls];
    logger.info(`CollisionSystem initialized with ${walls.length} walls`);
  }
  
  // ============================================================================
  // PLAYER MOVEMENT COLLISION
  // ============================================================================
  
  /**
   * Validate player movement against walls and bounds
   */
  validatePlayerMovement(
    currentPos: Position, 
    targetPos: Position, 
    velocity: Velocity
  ): CollisionResult {
    // Check map bounds first (fastest check)
    const boundsResult = this.checkMapBounds(targetPos, this.PLAYER_RADIUS);
    if (boundsResult.collided) {
      return boundsResult;
    }
    
    // Check wall collisions using circle-line intersection
    for (const wall of this.walls) {
      if (!wall.solid) continue;
      
      const wallCollision = this.checkCircleLineCollision(
        currentPos,
        targetPos,
        this.PLAYER_RADIUS,
        wall
      );
      
      if (wallCollision.collided) {
        return {
          ...wallCollision,
          correctedVelocity: { x: 0, y: 0 } // Stop on wall hit
        };
      }
    }
    
    // No collision
    return { collided: false };
  }
  
  /**
   * Check if position is within map bounds
   */
  private checkMapBounds(position: Position, radius: number): CollisionResult {
    const { minX, maxX, minY, maxY } = this.mapBounds;
    
    let correctedX = position.x;
    let correctedY = position.y;
    let collided = false;
    
    // Check X bounds
    if (position.x - radius < minX) {
      correctedX = minX + radius;
      collided = true;
    } else if (position.x + radius > maxX) {
      correctedX = maxX - radius;
      collided = true;
    }
    
    // Check Y bounds
    if (position.y - radius < minY) {
      correctedY = minY + radius;
      collided = true;
    } else if (position.y + radius > maxY) {
      correctedY = maxY - radius;
      collided = true;
    }
    
    return {
      collided,
      correctedPosition: collided ? { x: correctedX, y: correctedY } : undefined
    };
  }
  
  /**
   * Circle-line collision detection for player-wall intersection
   */
  private checkCircleLineCollision(
    currentPos: Position,
    targetPos: Position,
    radius: number,
    wall: WallDefinition
  ): CollisionResult {
    // Get closest point on line segment to circle center
    const closestPoint = this.getClosestPointOnLineSegment(targetPos, wall);
    
    // Calculate distance from circle center to closest point
    const distance = this.getDistance(targetPos, closestPoint);
    
    if (distance <= radius) {
      // Collision detected - calculate corrected position
      const direction = this.normalize({
        x: targetPos.x - closestPoint.x,
        y: targetPos.y - closestPoint.y
      });
      
      const correctedPosition = {
        x: closestPoint.x + direction.x * radius,
        y: closestPoint.y + direction.y * radius
      };
      
      // Calculate wall normal for reflection
      const wallVector = {
        x: wall.end.x - wall.start.x,
        y: wall.end.y - wall.start.y
      };
      const normal = this.normalize({
        x: -wallVector.y, // Perpendicular to wall
        y: wallVector.x
      });
      
      return {
        collided: true,
        correctedPosition,
        normal,
        wallId: wall.id
      };
    }
    
    return { collided: false };
  }
  
  // ============================================================================
  // PROJECTILE COLLISION
  // ============================================================================
  
  /**
   * Check projectile collision with walls using raycast
   */
  checkProjectileWallCollision(
    currentPos: Position,
    targetPos: Position,
    projectileRadius: number = this.PROJECTILE_RADIUS
  ): RaycastHit {
    // Simple raycast from current to target position
    const raycast = this.raycastToPosition(currentPos, targetPos);
    
    if (raycast.hit && raycast.distance !== undefined) {
      // Check if collision point is before target
      const targetDistance = this.getDistance(currentPos, targetPos);
      
      if (raycast.distance < targetDistance) {
        return raycast;
      }
    }
    
    return { hit: false };
  }
  
  /**
   * Check projectile collision with players
   */
  checkProjectilePlayerCollision(
    projectilePos: Position,
    projectileRadius: number,
    players: PlayerState[]
  ): { hit: boolean; playerId?: string; hitPosition?: Position } {
    for (const player of players) {
      if (!player.isAlive) continue;
      
      const distance = this.getDistance(projectilePos, player.position);
      const collisionRadius = projectileRadius + this.PLAYER_RADIUS;
      
      if (distance <= collisionRadius) {
        return {
          hit: true,
          playerId: player.id,
          hitPosition: { ...projectilePos }
        };
      }
    }
    
    return { hit: false };
  }
  
  // ============================================================================
  // RAYCASTING
  // ============================================================================
  
  /**
   * Cast a ray from start to end position and find first wall intersection
   */
  raycastToPosition(start: Position, end: Position): RaycastHit {
    let closestHit: RaycastHit = { hit: false };
    let minDistance = Infinity;
    
    for (const wall of this.walls) {
      if (!wall.solid) continue;
      
      const intersection = this.getLineIntersection(start, end, wall.start, wall.end);
      
      if (intersection) {
        const distance = this.getDistance(start, intersection);
        
        if (distance < minDistance) {
          minDistance = distance;
          
          // Calculate wall normal
          const wallVector = {
            x: wall.end.x - wall.start.x,
            y: wall.end.y - wall.start.y
          };
          const normal = this.normalize({
            x: -wallVector.y,
            y: wallVector.x
          });
          
          closestHit = {
            hit: true,
            position: intersection,
            distance,
            wallId: wall.id,
            normal
          };
        }
      }
    }
    
    return closestHit;
  }
  
  /**
   * Cast ray in specific direction for maximum distance
   */
  raycastInDirection(
    start: Position, 
    angle: number, 
    maxDistance: number
  ): RaycastHit {
    const end = {
      x: start.x + Math.cos(angle) * maxDistance,
      y: start.y + Math.sin(angle) * maxDistance
    };
    
    return this.raycastToPosition(start, end);
  }
  
  // ============================================================================
  // LINE-OF-SIGHT
  // ============================================================================
  
  /**
   * Check if there's a clear line of sight between two points
   */
  hasLineOfSight(start: Position, end: Position): boolean {
    const raycast = this.raycastToPosition(start, end);
    
    if (!raycast.hit) {
      return true; // No walls in the way
    }
    
    // Check if hit point is beyond target (allowing small tolerance)
    const targetDistance = this.getDistance(start, end);
    const hitDistance = raycast.distance || 0;
    
    return hitDistance >= targetDistance - 0.1; // 0.1 unit tolerance
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  /**
   * Get closest point on line segment to given point
   */
  private getClosestPointOnLineSegment(point: Position, wall: WallDefinition): Position {
    const { start, end } = wall;
    
    // Vector from start to end
    const lineVec = { x: end.x - start.x, y: end.y - start.y };
    
    // Vector from start to point
    const pointVec = { x: point.x - start.x, y: point.y - start.y };
    
    // Project point onto line
    const lineLength = Math.sqrt(lineVec.x * lineVec.x + lineVec.y * lineVec.y);
    
    if (lineLength === 0) {
      return { ...start }; // Degenerate line
    }
    
    const normalizedLine = { x: lineVec.x / lineLength, y: lineVec.y / lineLength };
    const projection = pointVec.x * normalizedLine.x + pointVec.y * normalizedLine.y;
    
    // Clamp to line segment
    const clampedProjection = Math.max(0, Math.min(lineLength, projection));
    
    return {
      x: start.x + normalizedLine.x * clampedProjection,
      y: start.y + normalizedLine.y * clampedProjection
    };
  }
  
  /**
   * Get intersection point between two line segments
   */
  private getLineIntersection(
    p1: Position, p2: Position,
    p3: Position, p4: Position
  ): Position | null {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    
    if (Math.abs(denom) < 1e-10) {
      return null; // Lines are parallel
    }
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    // Check if intersection is within both line segments
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      };
    }
    
    return null;
  }
  
  /**
   * Calculate distance between two points
   */
  private getDistance(a: Position, b: Position): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Normalize a vector
   */
  private normalize(vector: Position): Position {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    
    if (length === 0) {
      return { x: 0, y: 0 };
    }
    
    return {
      x: vector.x / length,
      y: vector.y / length
    };
  }
  
  /**
   * Update wall definitions (for dynamic maps)
   */
  updateWalls(walls: WallDefinition[]): void {
    this.walls = [...walls];
    logger.info(`CollisionSystem updated with ${walls.length} walls`);
  }
  
  /**
   * Get all walls (read-only)
   */
  getWalls(): readonly WallDefinition[] {
    return this.walls;
  }
}