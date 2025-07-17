/**
 * SpriteRenderer - Renders character sprites in the raycaster view
 * Handles sprite animations, positioning, and depth sorting
 */

import { SpriteSheet, WalkDirection } from './SpriteSheet';
import type { SpriteAnimation, SpriteFrame } from './SpriteSheet';
import type { ClassType } from '@dueled/shared';
import { angleToDirection } from '../utils/direction';

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
  foggedFrame?: HTMLCanvasElement | null;
  fogFactor?: number;
  lastFrameDirection?: WalkDirection;
  cachedFrame?: SpriteFrame | null;
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
          
          // Create a fallback sprite sheet with colored rectangles
          console.log(`🎨 Creating fallback sprite sheet for ${classType}`);
          this.createFallbackSpriteSheet(classType);
        })
      );
    }
    
    // Wait for all loading attempts to complete
    await Promise.allSettled(loadPromises);
    
    this.isInitialized = true;
    console.log(`🎯 SpriteRenderer: Initialization complete! Successfully loaded ${successCount}/${classTypes.length} sprite sheets`);
    console.log(`📊 Available sprite sheets:`, Array.from(this.spriteSheets.keys()));
    
    if (successCount === 0) {
      console.warn('⚠️ SpriteRenderer: No sprite sheets loaded successfully - using fallback colored sprites');
      console.warn('💡 This usually means the development server is not serving assets properly');
      console.warn('🔧 Try restarting the dev server or checking if files exist in client/public/assets/sprites/');
    } else if (failCount > 0) {
      console.warn(`⚠️ SpriteRenderer: ${failCount} sprite sheets failed to load - using fallback sprites for missing ones`);
    }
  }
  
  /**
   * Create a fallback sprite sheet with colored rectangles when image loading fails
   */
  private createFallbackSpriteSheet(classType: ClassType): void {
    const spriteSheet = new SpriteSheet();
    
    // Create a canvas with colored rectangles as a fallback
    const canvas = document.createElement('canvas');
    canvas.width = 768; // 4x4 grid of 192x192 sprites
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Failed to create fallback canvas context');
      return;
    }
    
    // Get class-specific color
    const classColors = {
      berserker: '#ff4444',  // Red
      mage: '#4444ff',       // Blue
      bomber: '#ff8800',     // Orange
      archer: '#44ff44'      // Green
    };
    
    const color = classColors[classType as keyof typeof classColors] || '#888888';
    
    // Fill the canvas with colored rectangles in a 4x4 grid
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 192;
        const y = row * 192;
        
        // Draw colored rectangle
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 192, 192);
        
        // Add a border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, 192, 192);
        
        // Add class identifier text
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(classType.toUpperCase(), x + 96, y + 96);
        ctx.fillText(`${row},${col}`, x + 96, y + 120);
      }
    }
    
    // Convert canvas to data URL and load into sprite sheet
    const dataUrl = canvas.toDataURL();
    spriteSheet.load(dataUrl).then(() => {
      console.log(`✅ Created fallback sprite sheet for ${classType}`);
      this.spriteSheets.set(classType, spriteSheet);
    }).catch(error => {
      console.error(`❌ Failed to create fallback sprite sheet for ${classType}:`, error);
    });
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
    viewerAngle?: number,
    fogFactor?: number,
    isMoving?: boolean
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
      
      // Check if player is moving - use explicit parameter if provided, otherwise fall back to distance
      if (isMoving !== undefined) {
        playerSprite.isMoving = isMoving;
        if (isMoving) {
          playerSprite.lastMoveTime = Date.now();
        }
      } else {
        const distanceMoved = Math.sqrt(
          Math.pow(position.x - previousPosition.x, 2) + 
          Math.pow(position.y - previousPosition.y, 2)
        );
        
        if (distanceMoved > 0.01) { // Threshold for movement
          playerSprite.isMoving = true;
          playerSprite.lastMoveTime = Date.now();
        }
      }
      
      // Calculate direction based on viewer's perspective - use immediate viewerAngle if provided
      if (viewerAngle !== undefined && viewerPosition) {
        // Calculate angle from viewer to sprite
        const dx = position.x - viewerPosition.x;
        const dy = position.y - viewerPosition.y;
        const angleFromViewerToSprite = Math.atan2(dy, dx);
        
        // The relative angle is the difference between where the sprite is facing
        // and where the viewer is relative to the sprite
        // We add PI because we want to know which side of the sprite we're looking at
        let relativeAngle = angle - angleFromViewerToSprite + Math.PI;
        
        // Normalize angle to [-PI, PI]
        while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
        
        const newDirection = angleToDirection(relativeAngle);
        
        // Only update if direction actually changed to prevent flickering
        if (playerSprite.currentDirection !== newDirection) {
          playerSprite.currentDirection = newDirection;
        }
      } else if (viewerPosition) {
        // Fallback to position-based calculation
        const dx = position.x - viewerPosition.x;
        const dy = position.y - viewerPosition.y;
        const angleFromViewer = Math.atan2(dy, dx);
        
        // Add PI to get the correct viewing angle
        let relativeAngle = angle - angleFromViewer + Math.PI;
        
        // Normalize angle to [-PI, PI]
        while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
        
        const newDirection = angleToDirection(relativeAngle);
        
        // Only update if direction actually changed
        if (playerSprite.currentDirection !== newDirection) {
          // Debug direction changes (throttled to avoid spam)
          const now = Date.now();
          if (!this.lastDirectionLogTime || now - this.lastDirectionLogTime > 500) {
            const directionNames = ['FORWARD', 'RIGHT', 'BACKWARD', 'LEFT'];
            console.log(`🧭 Player ${playerId} direction changed: ${directionNames[playerSprite.currentDirection]} → ${directionNames[newDirection]}`);
            console.log(`📐 Player facing: ${(angle * 180 / Math.PI).toFixed(1)}°, viewer→player: ${(angleFromViewer * 180 / Math.PI).toFixed(1)}°, relative: ${(relativeAngle * 180 / Math.PI).toFixed(1)}°`);
            this.lastDirectionLogTime = now;
          }
          
          playerSprite.currentDirection = newDirection;
        }
      } else {
        // Fallback: face forward if no viewer data
        playerSprite.currentDirection = WalkDirection.FORWARD;
      }
      
      // Update fog factor if provided
      if (fogFactor !== undefined) {
        playerSprite.fogFactor = fogFactor;
        playerSprite.foggedFrame = null; // Clear cached fogged frame
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
  public getPlayerSpriteFrame(playerId: string, fogged: boolean = false): SpriteFrame | null {
    const playerSprite = this.playerSprites.get(playerId);
    if (!playerSprite) return null;
    
    // Check if we can use cached frame
    if (playerSprite.cachedFrame && 
        playerSprite.lastFrameDirection === playerSprite.currentDirection &&
        !playerSprite.isMoving) {
      return playerSprite.cachedFrame;
    }
    
    const animation = playerSprite.animations.get(playerSprite.currentDirection);
    if (!animation) return null;
    
    let frame: SpriteFrame | null;
    if (playerSprite.isMoving) {
      // Return current animation frame
      frame = playerSprite.spriteSheet.getCurrentFrame(animation);
    } else {
      // Return first frame (idle pose)
      frame = animation.frames[0] || null;
    }
    
    // Cache the frame for non-moving sprites
    if (!playerSprite.isMoving && frame) {
      playerSprite.cachedFrame = frame;
      playerSprite.lastFrameDirection = playerSprite.currentDirection;
    }
    
    if (!frame || !fogged || !playerSprite.fogFactor) {
      return frame;
    }
    
    // Create fogged version using color darkening
    if (!playerSprite.foggedFrame) {
      playerSprite.foggedFrame = this.createFoggedFrame(frame, playerSprite.fogFactor);
    }
    
    // Return fogged frame maintaining SpriteFrame interface
    return {
      imageData: frame.imageData, // Keep original image data
      canvas: playerSprite.foggedFrame,
      ctx: frame.ctx // Keep original context reference
    };
  }
  
  /**
   * Create a darkened (fogged) version of a sprite frame
   */
  private createFoggedFrame(frame: SpriteFrame, fogFactor: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = frame.canvas.width;
    canvas.height = frame.canvas.height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return frame.canvas; // Fallback to original
    }
    
    // Draw original frame
    ctx.drawImage(frame.canvas, 0, 0);
    
    // Apply darkening using multiply blend mode
    const darkenAmount = 1 - Math.max(0, Math.min(1, fogFactor));
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${Math.floor(darkenAmount * 255)}, ${Math.floor(darkenAmount * 255)}, ${Math.floor(darkenAmount * 255)})`;
    ctx.fillRect(0, 0, frame.canvas.width, frame.canvas.height);
    
    return canvas;
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
   * Check if a player has a sprite registered
   */
  public hasPlayerSprite(playerId: string): boolean {
    return this.playerSprites.has(playerId);
  }
  
  /**
   * Get debug info about registered sprites
   */
  public getDebugInfo(): { playerCount: number; playerIds: string[] } {
    return {
      playerCount: this.playerSprites.size,
      playerIds: Array.from(this.playerSprites.keys())
    };
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