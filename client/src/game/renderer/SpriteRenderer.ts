/**
 * SpriteRenderer - Renders character sprites in the raycaster view
 * Handles sprite animations, positioning, and depth sorting
 */

import { SpriteSheet, WalkDirection } from './SpriteSheet';
import type { SpriteAnimation, SpriteFrame } from './SpriteSheet';
import type { ClassType } from '@dueled/shared';

export interface PlayerSprite {
  playerId: string;
  classType: ClassType;
  spriteSheet: SpriteSheet;
  animations: Map<WalkDirection, SpriteAnimation>;
  currentDirection: WalkDirection;
  position: { x: number; y: number };
  angle: number;
  isMoving: boolean;
  lastMoveTime: number;
}

export class SpriteRenderer {
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private spriteSheets: Map<ClassType, SpriteSheet> = new Map();
  private isInitialized: boolean = false;
  private lastDirectionLogTime: number = 0; // For throttling debug logs
  
  // Animation settings
  private static readonly WALK_FRAME_TIME = 150; // ms per frame
  private static readonly IDLE_TIMEOUT = 500; // ms before switching to idle
  
  /**
   * Initialize sprite renderer with class sprite sheets
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('🚀 SpriteRenderer: Starting initialization...');
    
    const classTypes: ClassType[] = ['berserker' as ClassType, 'mage' as ClassType, 'bomber' as ClassType, 'archer' as ClassType];
    const loadPromises: Promise<void>[] = [];
    let successCount = 0;
    let failCount = 0;
    
    for (const classType of classTypes) {
      const spriteSheet = new SpriteSheet();
      this.spriteSheets.set(classType, spriteSheet);
      
      // Load sprite sheet for this class
      const spriteUrl = `/assets/sprites/players/${classType}/${classType}_walk.png`;
      console.log(`📁 SpriteRenderer: Loading sprite sheet for ${classType} from: ${spriteUrl}`);
      
      loadPromises.push(
        spriteSheet.load(spriteUrl).then(() => {
          successCount++;
          console.log(`✅ SpriteRenderer: Successfully loaded sprite sheet for ${classType} (${successCount}/${classTypes.length})`);
        }).catch(error => {
          failCount++;
          console.warn(`❌ SpriteRenderer: Failed to load sprite sheet for ${classType} (${failCount} failures):`, error);
          console.warn(`🔗 Expected path: ${spriteUrl}`);
          // Remove failed sprite sheet from the map
          this.spriteSheets.delete(classType);
        })
      );
    }
    
    // Wait for all loading attempts to complete
    await Promise.allSettled(loadPromises);
    
    this.isInitialized = true;
    console.log(`🎯 SpriteRenderer: Initialization complete! Successfully loaded ${successCount}/${classTypes.length} sprite sheets`);
    console.log(`📊 Available sprite sheets:`, Array.from(this.spriteSheets.keys()));
    
    if (successCount === 0) {
      console.warn('⚠️ SpriteRenderer: No sprite sheets loaded successfully - will fall back to colored circles');
    }
  }
  
  /**
   * Add or update a player sprite
   */
  public updatePlayerSprite(
    playerId: string, 
    classType: ClassType, 
    position: { x: number; y: number }, 
    angle: number,
    viewerPosition?: { x: number; y: number },
    viewerAngle?: number
  ): void {
    let playerSprite = this.playerSprites.get(playerId);
    
    if (!playerSprite) {
      // Create new player sprite
      const spriteSheet = this.spriteSheets.get(classType);
      if (!spriteSheet || !spriteSheet.isReady()) {
        console.warn(`🚨 SpriteRenderer: Sprite sheet for class '${classType}' not available for player ${playerId}`);
        console.warn(`📊 Available sprite sheets: ${Array.from(this.spriteSheets.keys()).join(', ')}`);
        return;
      }
      
      // Create animations for all directions
      const animations = new Map<WalkDirection, SpriteAnimation>();
      animations.set(WalkDirection.FORWARD, spriteSheet.createAnimation(WalkDirection.FORWARD, SpriteRenderer.WALK_FRAME_TIME));
      animations.set(WalkDirection.RIGHT, spriteSheet.createAnimation(WalkDirection.RIGHT, SpriteRenderer.WALK_FRAME_TIME));
      animations.set(WalkDirection.BACKWARD, spriteSheet.createAnimation(WalkDirection.BACKWARD, SpriteRenderer.WALK_FRAME_TIME));
      animations.set(WalkDirection.LEFT, spriteSheet.createAnimation(WalkDirection.LEFT, SpriteRenderer.WALK_FRAME_TIME));
      
      playerSprite = {
        playerId,
        classType,
        spriteSheet,
        animations,
        currentDirection: WalkDirection.FORWARD,
        position: { ...position },
        angle,
        isMoving: false,
        lastMoveTime: 0
      };
      
      this.playerSprites.set(playerId, playerSprite);
    } else {
      // Update existing sprite
      // -----------------------------------------------------------------------------------
      // 🔄  Ensure sprite reflects the correct class type
      // If we previously created this sprite with a different class (e.g. defaulted to
      // berserker before receiving the real class from the server) we need to swap the
      // sprite sheet and regenerate animations so the correct graphics are shown.
      // -----------------------------------------------------------------------------------
      if (playerSprite.classType !== classType) {
        const newSpriteSheet = this.spriteSheets.get(classType);
        if (!newSpriteSheet || !newSpriteSheet.isReady()) {
          console.warn(
            `🚨 SpriteRenderer: Requested to switch ${playerId} sprite to class '${classType}' but the sprite sheet is not ready.`
          );
        } else {
          console.log(
            `🔄 SpriteRenderer: Updating sprite for ${playerId} from '${playerSprite.classType}' → '${classType}'`
          );
          // Swap sprite sheet
          playerSprite.spriteSheet = newSpriteSheet;
          playerSprite.classType = classType;

          // Re-create animations for the new sprite sheet
          const newAnimations = new Map<WalkDirection, SpriteAnimation>();
          newAnimations.set(
            WalkDirection.FORWARD,
            newSpriteSheet.createAnimation(WalkDirection.FORWARD, SpriteRenderer.WALK_FRAME_TIME)
          );
          newAnimations.set(
            WalkDirection.RIGHT,
            newSpriteSheet.createAnimation(WalkDirection.RIGHT, SpriteRenderer.WALK_FRAME_TIME)
          );
          newAnimations.set(
            WalkDirection.BACKWARD,
            newSpriteSheet.createAnimation(WalkDirection.BACKWARD, SpriteRenderer.WALK_FRAME_TIME)
          );
          newAnimations.set(
            WalkDirection.LEFT,
            newSpriteSheet.createAnimation(WalkDirection.LEFT, SpriteRenderer.WALK_FRAME_TIME)
          );
          playerSprite.animations = newAnimations;
        }
      }
      
      const wasMoving = playerSprite.isMoving;
      const previousPosition = { ...playerSprite.position };
      
      playerSprite.position = { ...position };
      playerSprite.angle = angle;
      
      // Check if player is moving
      const distanceMoved = Math.sqrt(
        Math.pow(position.x - previousPosition.x, 2) + 
        Math.pow(position.y - previousPosition.y, 2)
      );
      
      if (distanceMoved > 0.01) { // Threshold for movement
        playerSprite.isMoving = true;
        playerSprite.lastMoveTime = Date.now();
      }
      
      // Calculate direction based on viewer's perspective using player's FACING direction
      if (viewerPosition) {
        // Calculate angle from viewer to this player's position
        const dx = position.x - viewerPosition.x;
        const dy = position.y - viewerPosition.y;
        const angleFromViewer = Math.atan2(dy, dx);
        
        // Calculate relative facing direction (difference between where player is facing vs where viewer sees them)
        // `angle` is the player's facing direction (camera direction)
        // We want to show the sprite direction based on how the player is facing relative to the viewer
        let relativeAngle = angle - angleFromViewer;
        
        // Normalize angle to [-PI, PI]
        while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
        
        const newDirection = this.angleToDirection(relativeAngle);
        
        // Debug direction changes (throttled to avoid spam)
        if (playerSprite.currentDirection !== newDirection) {
          const now = Date.now();
          if (!this.lastDirectionLogTime || now - this.lastDirectionLogTime > 500) { // Log max once per 500ms
            const directionNames = ['FORWARD', 'RIGHT', 'BACKWARD', 'LEFT'];
            console.log(`🧭 Player ${playerId} direction changed: ${directionNames[playerSprite.currentDirection]} → ${directionNames[newDirection]}`);
            console.log(`📐 Player facing: ${(angle * 180 / Math.PI).toFixed(1)}°, viewer→player: ${(angleFromViewer * 180 / Math.PI).toFixed(1)}°, relative: ${(relativeAngle * 180 / Math.PI).toFixed(1)}°`);
            this.lastDirectionLogTime = now;
          }
        }
        
        playerSprite.currentDirection = newDirection;
      } else {
        // Fallback: face forward if no viewer position
        playerSprite.currentDirection = WalkDirection.FORWARD;
      }
    }
  }
  
  /**
   * Remove a player sprite
   */
  public removePlayerSprite(playerId: string): void {
    this.playerSprites.delete(playerId);
  }
  
  /**
   * Update animations for all player sprites
   */
  public update(currentTime: number): void {
    const playerSprites = Array.from(this.playerSprites.values());
    for (const playerSprite of playerSprites) {
      // Check if player should stop moving animation
      if (playerSprite.isMoving && 
          currentTime - playerSprite.lastMoveTime > SpriteRenderer.IDLE_TIMEOUT) {
        playerSprite.isMoving = false;
      }
      
      // Update animation if moving
      if (playerSprite.isMoving) {
        const animation = playerSprite.animations.get(playerSprite.currentDirection);
        if (animation) {
          playerSprite.spriteSheet.updateAnimation(animation, currentTime);
        }
      }
    }
  }
  
  /**
   * Get sprite frame for rendering a player
   */
  public getPlayerSpriteFrame(playerId: string): SpriteFrame | null {
    const playerSprite = this.playerSprites.get(playerId);
    if (!playerSprite) return null;
    
    const animation = playerSprite.animations.get(playerSprite.currentDirection);
    if (!animation) return null;
    
    if (playerSprite.isMoving) {
      // Return current animation frame
      return playerSprite.spriteSheet.getCurrentFrame(animation);
    } else {
      // Return first frame (idle pose)
      return animation.frames[0] || null;
    }
  }
  
  /**
   * Convert relative viewing angle to sprite direction
   * This determines which sprite row to use based on how the viewer sees the player
   */
  private angleToDirection(relativeAngle: number): WalkDirection {
    // Normalize angle to [0, 2π]
    let normalizedAngle = relativeAngle % (2 * Math.PI);
    if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
    
    // Convert to degrees for easier calculation
    const degrees = normalizedAngle * 180 / Math.PI;
    
    // Determine sprite direction based on viewing angle
    // This is from the perspective of the viewer looking at the sprite
    // Forward: Player facing towards viewer (135° to 225°) - FIXED: was inverted
    // Right: Player facing right relative to viewer (45° to 135°)  
    // Backward: Player facing away from viewer (315° to 45°) - FIXED: was inverted
    // Left: Player facing left relative to viewer (225° to 315°)
    
    if (degrees >= 315 || degrees < 45) {
      return WalkDirection.BACKWARD; // Player facing away from viewer (FIXED)
    } else if (degrees >= 45 && degrees < 135) {
      return WalkDirection.RIGHT; // Player facing right relative to viewer
    } else if (degrees >= 135 && degrees < 225) {
      return WalkDirection.FORWARD; // Player facing towards viewer (FIXED)
    } else {
      return WalkDirection.LEFT; // Player facing left relative to viewer
    }
  }
  
  /**
   * Get all player sprites for rendering
   */
  public getAllPlayerSprites(): PlayerSprite[] {
    return Array.from(this.playerSprites.values());
  }
  
  /**
   * Check if renderer is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
  
  /**
   * Get sprite sheet for a class type
   */
  public getSpriteSheet(classType: ClassType): SpriteSheet | undefined {
    return this.spriteSheets.get(classType);
  }
  
  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.playerSprites.clear();
    
    const spriteSheets = Array.from(this.spriteSheets.values());
    for (const spriteSheet of spriteSheets) {
      spriteSheet.dispose();
    }
    this.spriteSheets.clear();
    
    this.isInitialized = false;
  }
}