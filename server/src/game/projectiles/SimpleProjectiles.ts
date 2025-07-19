/**
 * SimpleProjectiles - Basic projectile system for 1v1 arena combat
 * 
 * Replaces complex projectile physics with simple point-to-point movement
 * Designed for responsive Archer vs Berserker combat
 */

export interface ProjectileData {
  id: string;
  ownerId: string;
  type: string;
  x: number;
  y: number;
  rotation: number;       // Added for delta compression compatibility
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  speed: number;
  damage: number;
  piercing: boolean;
  lifespan: number;
  createdAt: number;
  isActive: boolean;
}

export interface ProjectileConfig {
  type: string;
  speed: number;
  damage: number;
  range: number;
  lifespan: number;
}

/**
 * SimpleProjectiles - Lightweight projectile management
 */
export class SimpleProjectiles {
  private projectiles: Map<string, ProjectileData> = new Map();
  private nextId = 0;
  
  private readonly PROJECTILE_CONFIGS: Record<string, ProjectileConfig> = {
    arrow: {
      type: 'arrow',
      speed: 800,  // pixels per second
      damage: 25,
      range: 1000,
      lifespan: 2000  // 2 seconds max
    },
    berserker_projectile: {
      type: 'berserker_projectile', 
      speed: 600,
      damage: 35,
      range: 600,
      lifespan: 1500
    }
  };
  
  /**
   * Create a new projectile from parameters
   */
  createProjectile(
    ownerId: string,
    type: string,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number
  ): string | null;
  
  /**
   * Create a new projectile from ProjectileData object
   */
  createProjectile(projectileData: Partial<ProjectileData>): string | null;
  
  createProjectile(
    ownerIdOrData: string | Partial<ProjectileData>,
    type?: string,
    startX?: number,
    startY?: number,
    targetX?: number,
    targetY?: number
  ): string | null {
    // Handle both function signatures
    let ownerId: string, projType: string, startPosX: number, startPosY: number, targetPosX: number, targetPosY: number;
    
    if (typeof ownerIdOrData === 'object') {
      // ProjectileData object signature
      const data = ownerIdOrData;
      ownerId = data.ownerId!;
      projType = data.type!;
      startPosX = data.x!;
      startPosY = data.y!;
      targetPosX = data.targetX!;
      targetPosY = data.targetY!;
    } else {
      // Individual parameters signature
      ownerId = ownerIdOrData;
      projType = type!;
      startPosX = startX!;
      startPosY = startY!;
      targetPosX = targetX!;
      targetPosY = targetY!;
    }
    
    const config = this.PROJECTILE_CONFIGS[projType];
    if (!config) {
      return null;
    }
    
    // Calculate velocity
    const dx = targetPosX - startPosX;
    const dy = targetPosY - startPosY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocityX = distance > 0 ? (dx / distance) * config.speed : 0;
    const velocityY = distance > 0 ? (dy / distance) * config.speed : 0;
    
    const id = `proj_${this.nextId++}`;
    const projectile: ProjectileData = {
      id,
      ownerId,
      type: projType,
      x: startPosX,
      y: startPosY,
      rotation: distance > 0 ? Math.atan2(dy, dx) : 0, // Calculate rotation from velocity direction
      targetX: targetPosX,
      targetY: targetPosY,
      velocityX,
      velocityY,
      speed: config.speed,
      damage: config.damage,
      piercing: projType === 'arrow', // Arrows pierce by default
      lifespan: config.lifespan,
      createdAt: Date.now(),
      isActive: true
    };
    
    this.projectiles.set(id, projectile);
    return id;
  }
  
  /**
   * Update all projectiles
   */
  update(deltaTime: number): void {
    const now = Date.now();
    
    for (const [id, projectile] of this.projectiles) {
      if (!projectile.isActive) continue;
      
      // Check lifespan
      const config = this.PROJECTILE_CONFIGS[projectile.type];
      if (config && (now - projectile.createdAt) > config.lifespan) {
        projectile.isActive = false;
        this.projectiles.delete(id);
        continue;
      }
      
      // Move projectile towards target
      const dx = projectile.targetX - projectile.x;
      const dy = projectile.targetY - projectile.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= 5) {
        // Reached target
        projectile.isActive = false;
        this.projectiles.delete(id);
        continue;
      }
      
      // Move towards target
      const moveDistance = projectile.speed * deltaTime;
      const moveX = (dx / distance) * moveDistance;
      const moveY = (dy / distance) * moveDistance;
      
      projectile.x += moveX;
      projectile.y += moveY;
    }
  }
  
  /**
   * Get all active projectiles
   */
  getActiveProjectiles(): ProjectileData[] {
    return Array.from(this.projectiles.values()).filter(p => p.isActive);
  }
  
  /**
   * Get projectile by ID
   */
  getProjectile(id: string): ProjectileData | undefined {
    return this.projectiles.get(id);
  }
  
  /**
   * Remove projectile
   */
  removeProjectile(id: string): boolean {
    return this.projectiles.delete(id);
  }
  
  /**
   * Remove all projectiles for a player
   */
  removePlayerProjectiles(playerId: string): void {
    for (const [id, projectile] of this.projectiles) {
      if (projectile.ownerId === playerId) {
        this.projectiles.delete(id);
      }
    }
  }
  
  /**
   * Clear all projectiles
   */
  clear(): void {
    this.projectiles.clear();
  }
  
  /**
   * Get projectile count
   */
  getProjectileCount(): number {
    return this.projectiles.size;
  }
  
  /**
   * Get all projectiles (for compatibility)
   */
  getAllProjectiles(): Map<string, ProjectileData> {
    return this.projectiles;
  }
}