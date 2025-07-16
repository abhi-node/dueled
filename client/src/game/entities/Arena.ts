import Phaser from 'phaser';
import type { Vector2, Obstacle, ObstacleType } from '@dueled/shared';

export class Arena {
  private scene: Phaser.Scene;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private floor!: Phaser.GameObjects.Graphics;
  private boundaries!: Phaser.GameObjects.Graphics;
  private arenaWidth: number = 800;
  private arenaHeight: number = 600;
  private wallThickness: number = 20;
  private obstacleData: Obstacle[] = [];
  private spawnPoints: Vector2[] = [];
  private safeZones: Phaser.GameObjects.Zone[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public create(): void {
    this.createFloor();
    this.createBoundaries();
    this.createWalls();
    this.createObstacles();
    this.createSpawnPoints();
    this.createSafeZones();
    this.setupPhysics();
  }

  private createFloor(): void {
    this.floor = this.scene.add.graphics();
    
    // Create a textured floor pattern
    this.floor.fillStyle(0x2d3748);
    this.floor.fillRect(0, 0, this.arenaWidth, this.arenaHeight);
    
    // Add grid pattern
    this.floor.lineStyle(1, 0x4a5568, 0.3);
    
    // Vertical lines
    for (let x = 0; x <= this.arenaWidth; x += 50) {
      this.floor.moveTo(x, 0);
      this.floor.lineTo(x, this.arenaHeight);
    }
    
    // Horizontal lines
    for (let y = 0; y <= this.arenaHeight; y += 50) {
      this.floor.moveTo(0, y);
      this.floor.lineTo(this.arenaWidth, y);
    }
    
    this.floor.strokePath();
    this.floor.setDepth(-1);
  }

  private createBoundaries(): void {
    this.boundaries = this.scene.add.graphics();
    
    // Arena boundary
    this.boundaries.lineStyle(4, 0x475569);
    this.boundaries.strokeRect(this.wallThickness, this.wallThickness, 
      this.arenaWidth - this.wallThickness * 2, this.arenaHeight - this.wallThickness * 2);
    
    // Corner decorations
    this.boundaries.fillStyle(0x64748b);
    this.boundaries.fillRect(0, 0, this.wallThickness, this.wallThickness);
    this.boundaries.fillRect(this.arenaWidth - this.wallThickness, 0, this.wallThickness, this.wallThickness);
    this.boundaries.fillRect(0, this.arenaHeight - this.wallThickness, this.wallThickness, this.wallThickness);
    this.boundaries.fillRect(this.arenaWidth - this.wallThickness, this.arenaHeight - this.wallThickness, 
      this.wallThickness, this.wallThickness);
    
    this.boundaries.setDepth(0);
  }

  private createWalls(): void {
    this.walls = this.scene.physics.add.staticGroup();
    
    // Top wall
    const topWall = this.scene.physics.add.sprite(this.arenaWidth / 2, this.wallThickness / 2, 'wall');
    topWall.setDisplaySize(this.arenaWidth - this.wallThickness, this.wallThickness);
    topWall.setTint(0x475569);
    topWall.body!.setSize(this.arenaWidth - this.wallThickness, this.wallThickness);
    this.walls.add(topWall);
    
    // Bottom wall
    const bottomWall = this.scene.physics.add.sprite(this.arenaWidth / 2, this.arenaHeight - this.wallThickness / 2, 'wall');
    bottomWall.setDisplaySize(this.arenaWidth - this.wallThickness, this.wallThickness);
    bottomWall.setTint(0x475569);
    bottomWall.body!.setSize(this.arenaWidth - this.wallThickness, this.wallThickness);
    this.walls.add(bottomWall);
    
    // Left wall
    const leftWall = this.scene.physics.add.sprite(this.wallThickness / 2, this.arenaHeight / 2, 'wall');
    leftWall.setDisplaySize(this.wallThickness, this.arenaHeight);
    leftWall.setTint(0x475569);
    leftWall.body!.setSize(this.wallThickness, this.arenaHeight);
    this.walls.add(leftWall);
    
    // Right wall
    const rightWall = this.scene.physics.add.sprite(this.arenaWidth - this.wallThickness / 2, this.arenaHeight / 2, 'wall');
    rightWall.setDisplaySize(this.wallThickness, this.arenaHeight);
    rightWall.setTint(0x475569);
    rightWall.body!.setSize(this.wallThickness, this.arenaHeight);
    this.walls.add(rightWall);
  }

  private createObstacles(): void {
    this.obstacles = this.scene.physics.add.staticGroup();
    
    // Define obstacle layout
    const obstacleLayout = [
      { x: 200, y: 200, width: 60, height: 60, type: 'pillar' as ObstacleType },
      { x: 600, y: 200, width: 60, height: 60, type: 'pillar' as ObstacleType },
      { x: 200, y: 400, width: 60, height: 60, type: 'pillar' as ObstacleType },
      { x: 600, y: 400, width: 60, height: 60, type: 'pillar' as ObstacleType },
      { x: 400, y: 300, width: 80, height: 40, type: 'wall' as ObstacleType },
      { x: 150, y: 300, width: 40, height: 100, type: 'wall' as ObstacleType },
      { x: 650, y: 300, width: 40, height: 100, type: 'wall' as ObstacleType },
    ];
    
    obstacleLayout.forEach((obstacleData, index) => {
      const obstacle = this.createObstacle(index.toString(), obstacleData);
      this.obstacles.add(obstacle);
      
      // Store obstacle data
      this.obstacleData.push({
        id: index.toString(),
        position: { x: obstacleData.x, y: obstacleData.y },
        size: { x: obstacleData.width, y: obstacleData.height },
        type: obstacleData.type,
      });
    });
  }

  private createObstacle(_id: string, data: { x: number; y: number; width: number; height: number; type: ObstacleType }): Phaser.Physics.Arcade.Sprite {
    const obstacle = this.scene.physics.add.sprite(data.x, data.y, 'obstacle');
    obstacle.setDisplaySize(data.width, data.height);
    obstacle.body!.setSize(data.width, data.height);
    
    // Set color based on obstacle type
    const obstacleColors = {
      wall: 0x64748b,
      pillar: 0x4a5568,
      destructible: 0x92400e,
    };
    
    obstacle.setTint(obstacleColors[data.type]);
    obstacle.setDepth(1);
    
    // Add visual effects based on type
    if (data.type === 'destructible') {
      // Add crack texture or different visual for destructible obstacles
      obstacle.setAlpha(0.8);
    }
    
    return obstacle;
  }

  private createSpawnPoints(): void {
    // Define spawn points that are safe from obstacles
    const potentialSpawns: Vector2[] = [
      { x: 100, y: 100 },   // Top-left
      { x: 700, y: 100 },   // Top-right
      { x: 100, y: 500 },   // Bottom-left
      { x: 700, y: 500 },   // Bottom-right
      { x: 400, y: 100 },   // Top-center
      { x: 400, y: 500 },   // Bottom-center
      { x: 100, y: 300 },   // Left-center
      { x: 700, y: 300 },   // Right-center
    ];
    
    // Filter out spawn points that are too close to obstacles
    this.spawnPoints = potentialSpawns.filter(spawn => {
      return this.isSpawnPointSafe(spawn);
    });
    
    // Ensure we have at least 2 spawn points
    if (this.spawnPoints.length < 2) {
      this.spawnPoints = [
        { x: 100, y: 100 },
        { x: 700, y: 500 },
      ];
    }
    
    // Debug visualization
    if (import.meta.env.DEV) {
      this.spawnPoints.forEach((spawn, index) => {
        const spawnMarker = this.scene.add.circle(spawn.x, spawn.y, 15, 0x00ff00, 0.5);
        spawnMarker.setDepth(10);
        spawnMarker.setStrokeStyle(2, 0x00ff00);
        
        const spawnText = this.scene.add.text(spawn.x, spawn.y - 25, `S${index + 1}`, {
          fontSize: '12px',
          color: '#00ff00',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        }).setOrigin(0.5);
        spawnText.setDepth(11);
      });
    }
  }

  private isSpawnPointSafe(spawn: Vector2): boolean {
    const minDistance = 80;
    
    // Check distance from obstacles
    for (const obstacle of this.obstacleData) {
      const distance = Phaser.Math.Distance.Between(
        spawn.x, spawn.y,
        obstacle.position.x, obstacle.position.y
      );
      
      if (distance < minDistance) {
        return false;
      }
    }
    
    // Check distance from walls
    if (spawn.x < this.wallThickness + minDistance || 
        spawn.x > this.arenaWidth - this.wallThickness - minDistance ||
        spawn.y < this.wallThickness + minDistance || 
        spawn.y > this.arenaHeight - this.wallThickness - minDistance) {
      return false;
    }
    
    return true;
  }

  private createSafeZones(): void {
    // Create safe zones around spawn points
    this.spawnPoints.forEach((spawn, index) => {
      const safeZone = this.scene.add.zone(spawn.x, spawn.y, 60, 60);
      safeZone.setName(`safe-zone-${index}`);
      this.safeZones.push(safeZone);
      
      // Debug visualization
      if (import.meta.env.DEV) {
        const zoneGraphics = this.scene.add.graphics();
        zoneGraphics.lineStyle(2, 0x00ff00, 0.3);
        zoneGraphics.strokeRect(spawn.x - 30, spawn.y - 30, 60, 60);
        zoneGraphics.setDepth(5);
      }
    });
  }

  private setupPhysics(): void {
    // Set up collision detection for walls and obstacles
    // This will be used by the GameScene to set up collisions with players
  }

  // Utility methods
  public getRandomSpawnPoint(): Vector2 {
    const randomIndex = Math.floor(Math.random() * this.spawnPoints.length);
    return { ...this.spawnPoints[randomIndex] };
  }

  public getSafeSpawnPoint(occupiedPositions: Vector2[] = []): Vector2 {
    const availableSpawns = this.spawnPoints.filter(spawn => {
      return !occupiedPositions.some(pos => {
        const distance = Phaser.Math.Distance.Between(spawn.x, spawn.y, pos.x, pos.y);
        return distance < 100; // Minimum distance between players
      });
    });
    
    if (availableSpawns.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableSpawns.length);
      return { ...availableSpawns[randomIndex] };
    }
    
    // Fallback to random spawn if no safe ones available
    return this.getRandomSpawnPoint();
  }

  public isPositionInBounds(position: Vector2): boolean {
    return position.x >= this.wallThickness && 
           position.x <= this.arenaWidth - this.wallThickness &&
           position.y >= this.wallThickness && 
           position.y <= this.arenaHeight - this.wallThickness;
  }

  public isPositionObstructed(position: Vector2, radius: number = 15): boolean {
    for (const obstacle of this.obstacleData) {
      const distance = Phaser.Math.Distance.Between(
        position.x, position.y,
        obstacle.position.x, obstacle.position.y
      );
      
      const minDistance = radius + Math.max(obstacle.size.x, obstacle.size.y) / 2;
      if (distance < minDistance) {
        return true;
      }
    }
    
    return false;
  }

  public getWallCollisionGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.walls;
  }

  public getObstacleCollisionGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.obstacles;
  }

  public getArenaSize(): { width: number; height: number } {
    return { width: this.arenaWidth, height: this.arenaHeight };
  }

  public getSpawnPoints(): Vector2[] {
    return [...this.spawnPoints];
  }

  public getObstacles(): Obstacle[] {
    return [...this.obstacleData];
  }

  public getSafeZones(): Phaser.GameObjects.Zone[] {
    return [...this.safeZones];
  }

  // Methods for dynamic obstacle management
  public destroyObstacle(obstacleId: string): void {
    const obstacleIndex = this.obstacleData.findIndex(obs => obs.id === obstacleId);
    if (obstacleIndex !== -1) {
      // Remove from data array
      this.obstacleData.splice(obstacleIndex, 1);
      
      // Find and destroy the physical obstacle
      this.obstacles.children.entries.forEach(child => {
        const sprite = child as Phaser.Physics.Arcade.Sprite;
        if (sprite.name === obstacleId) {
          // Play destruction effect
          this.playDestructionEffect(sprite.x, sprite.y);
          
          // Remove from physics group
          this.obstacles.remove(sprite);
          sprite.destroy();
        }
      });
    }
  }

  private playDestructionEffect(x: number, y: number): void {
    // Create explosion effect
    const explosion = this.scene.add.circle(x, y, 30, 0xff8800, 0.8);
    explosion.setDepth(20);
    
    // Animate explosion
    this.scene.tweens.add({
      targets: explosion,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        explosion.destroy();
      },
    });
    
    // Add particle effect
    const particles = this.scene.add.particles(x, y, 'obstacle', {
      speed: { min: 50, max: 150 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 1000,
      quantity: 10,
      tint: 0x92400e,
    });
    
    particles.setDepth(21);
    
    // Clean up particles
    this.scene.time.delayedCall(1000, () => {
      particles.destroy();
    });
    
    // Screen shake
    this.scene.cameras.main.shake(200, 0.01);
  }

  public addTemporaryObstacle(position: Vector2, size: Vector2, duration: number = 5000): void {
    const tempObstacle = this.scene.physics.add.sprite(position.x, position.y, 'obstacle');
    tempObstacle.setDisplaySize(size.x, size.y);
    tempObstacle.body!.setSize(size.x, size.y);
    tempObstacle.setTint(0x4c51bf);
    tempObstacle.setAlpha(0.7);
    tempObstacle.setDepth(1);
    
    // Add to obstacles group
    this.obstacles.add(tempObstacle);
    
    // Add to data
    const tempObstacleData: Obstacle = {
      id: `temp-${Date.now()}`,
      position,
      size,
      type: 'wall' as ObstacleType,
    };
    this.obstacleData.push(tempObstacleData);
    
    // Remove after duration
    this.scene.time.delayedCall(duration, () => {
      this.obstacles.remove(tempObstacle);
      tempObstacle.destroy();
      
      // Remove from data
      const index = this.obstacleData.findIndex(obs => obs.id === tempObstacleData.id);
      if (index !== -1) {
        this.obstacleData.splice(index, 1);
      }
    });
  }
}