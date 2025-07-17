/**
 * GameObject - Unified interface for all renderable game objects
 * Provides common structure for players, projectiles, and other entities
 */

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameObjectBase {
  id: string;
  position: Vector2;
  rotation: number;
  type: string;
  createdAt: number;
  lastUpdate: number;
}

export interface RenderableGameObject extends GameObjectBase {
  // Rendering properties
  size: number;
  color?: string;
  visible: boolean;
  
  // Rendering methods
  getScreenPosition(viewerPosition: Vector2, viewerAngle: number): Vector2 | null;
  getDistanceFrom(position: Vector2): number;
  isInViewFrustum(viewerPosition: Vector2, viewerAngle: number, fov: number): boolean;
}

export interface MovableGameObject extends GameObjectBase {
  velocity: Vector2;
  maxSpeed: number;
  
  // Movement methods
  updatePosition(deltaTime: number): void;
  setVelocity(velocity: Vector2): void;
}

export interface PlayerGameObject extends RenderableGameObject, MovableGameObject {
  playerId: string;
  classType: string;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  isAlive: boolean;
  
  // Player-specific properties
  angle: number; // Facing direction
  isMoving: boolean;
  lastMoveTime: number;
}

export interface ProjectileGameObject extends RenderableGameObject, MovableGameObject {
  ownerId: string;
  targetId?: string;
  damage: number;
  range: number;
  distanceTraveled: number;
  isActive: boolean;
  
  // Projectile-specific properties
  piercing: boolean;
  homing: boolean;
  effects: string[];
}

export interface GameObjectManager<T extends GameObjectBase> {
  // Core management methods
  add(object: T): void;
  remove(id: string): void;
  get(id: string): T | undefined;
  getAll(): T[];
  clear(): void;
  
  // Update methods
  update(deltaTime: number): void;
  updateFromServer(serverData: any[]): void;
  
  // Query methods
  getInRadius(center: Vector2, radius: number): T[];
  getVisible(viewerPosition: Vector2, viewerAngle: number, fov: number): T[];
  count(): number;
}

export abstract class BaseGameObject implements GameObjectBase {
  public id: string;
  public position: Vector2;
  public rotation: number;
  public type: string;
  public createdAt: number;
  public lastUpdate: number;
  
  constructor(id: string, type: string, position: Vector2, rotation: number = 0) {
    this.id = id;
    this.type = type;
    this.position = { ...position };
    this.rotation = rotation;
    this.createdAt = Date.now();
    this.lastUpdate = Date.now();
  }
  
  public getDistanceFrom(position: Vector2): number {
    const dx = this.position.x - position.x;
    const dy = this.position.y - position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  public isInViewFrustum(viewerPosition: Vector2, viewerAngle: number, fov: number): boolean {
    const dx = this.position.x - viewerPosition.x;
    const dy = this.position.y - viewerPosition.y;
    const angleToObject = Math.atan2(dy, dx);
    
    let relativeAngle = angleToObject - viewerAngle;
    
    // Normalize angle to [-PI, PI]
    while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
    while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
    
    const halfFov = (fov / 2) * Math.PI / 180;
    return Math.abs(relativeAngle) <= halfFov;
  }
  
  public getScreenPosition(viewerPosition: Vector2, viewerAngle: number): Vector2 | null {
    const dx = this.position.x - viewerPosition.x;
    const dy = this.position.y - viewerPosition.y;
    const angleToObject = Math.atan2(dy, dx);
    
    let relativeAngle = angleToObject - viewerAngle;
    
    // Normalize angle to [-PI, PI]
    while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
    while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
    
    // This is a simplified calculation - actual screen position would depend on canvas dimensions
    return {
      x: relativeAngle, // Relative screen X position
      y: 0 // Would need distance for proper Y calculation
    };
  }
}