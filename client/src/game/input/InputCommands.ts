/**
 * InputCommands - Generate InputCommand objects from input state
 * 
 * Converts keyboard/mouse state into server-compatible InputCommand objects.
 * Handles normalization, validation, and sequence numbering.
 */

import type { 
  InputCommand, 
  InputCommandData, 
  KeyState, 
  MouseState,
  InputValidationResult
} from '../types/InputTypes.js';
import { INPUT_CONSTANTS } from '../types/InputTypes.js';

export class InputCommandGenerator {
  private sequenceCounter = 0;
  private lastMovementCommand: InputCommandData | null = null;
  // private lastLookCommand: InputCommandData | null = null; // For future use
  
  constructor() {
    this.sequenceCounter = 0;
  }
  
  // ============================================================================
  // COMMAND GENERATION
  // ============================================================================
  
  /**
   * Generate input commands from current input state
   */
  generateCommands(keyState: KeyState, mouseState: MouseState): InputCommand[] {
    const commands: InputCommand[] = [];
    const timestamp = Date.now();
    
    // Generate movement command if there's movement input
    const movementCommand = this.generateMovementCommand(keyState, timestamp);
    if (movementCommand) {
      commands.push(movementCommand);
    }
    
    // Generate look command if there's mouse movement
    const lookCommand = this.generateLookCommand(mouseState, timestamp);
    if (lookCommand) {
      commands.push(lookCommand);
    }
    
    // Generate attack commands
    const attackCommands = this.generateAttackCommands(mouseState, timestamp);
    commands.push(...attackCommands);
    
    // Generate ability commands
    const abilityCommands = this.generateAbilityCommands(keyState, timestamp);
    commands.push(...abilityCommands);
    
    return commands;
  }
  
  // ============================================================================
  // MOVEMENT COMMANDS
  // ============================================================================
  
  private generateMovementCommand(keyState: KeyState, timestamp: number): InputCommand | null {
    // Calculate movement vector
    let forward = 0;
    let strafe = 0;
    
    if (keyState.forward) forward += 1;
    if (keyState.backward) forward -= 1;
    if (keyState.right) strafe -= 1;  // D key = negative strafe (move right)
    if (keyState.left) strafe += 1;   // A key = positive strafe (move left)
    
    // Check if there's any movement or sprint state change
    const hasMovement = Math.abs(forward) > 0 || Math.abs(strafe) > 0;
    const sprint = keyState.sprint;
    
    // Only send command if there's movement or state change
    if (!hasMovement && !sprint) {
      // Send stop command if we were previously moving
      if (this.lastMovementCommand && 
          (this.lastMovementCommand.forward || this.lastMovementCommand.strafe)) {
        this.lastMovementCommand = null;
        return this.createCommand('movement', timestamp, {
          forward: 0,
          strafe: 0,
          sprint: false
        });
      }
      return null;
    }
    
    // Normalize diagonal movement
    if (hasMovement && Math.abs(forward) > 0 && Math.abs(strafe) > 0) {
      const magnitude = Math.sqrt(forward * forward + strafe * strafe);
      forward /= magnitude;
      strafe /= magnitude;
    }
    
    // Clamp values
    forward = Math.max(-1, Math.min(1, forward));
    strafe = Math.max(-1, Math.min(1, strafe));
    
    const commandData: InputCommandData = {
      forward,
      strafe,
      sprint
    };
    
    // Always send movement commands while keys are held for smooth continuous movement
    // Only skip if no movement at all
    if (hasMovement || sprint) {
      this.lastMovementCommand = commandData;
      return this.createCommand('movement', timestamp, commandData);
    }
    
    return null;
  }
  
  // ============================================================================
  // LOOK COMMANDS
  // ============================================================================
  
  private generateLookCommand(mouseState: MouseState, timestamp: number): InputCommand | null {
    const { deltaX } = mouseState;
    
    // Only send if there's meaningful mouse movement
    if (Math.abs(deltaX) < 0.001) {
      return null;
    }
    
    // Convert pixel delta to radians
    // Typical sensitivity: 1 pixel = ~0.002 radians (adjustable)
    const angleDelta = deltaX * 0.002;
    
    // Clamp to prevent impossible rotation speeds
    const clampedDelta = Math.max(
      -INPUT_CONSTANTS.MAX_ANGLE_DELTA,
      Math.min(INPUT_CONSTANTS.MAX_ANGLE_DELTA, angleDelta)
    );
    
    
    const commandData: InputCommandData = {
      angleDelta: clampedDelta
    };
    
    // this.lastLookCommand = commandData; // For future use
    return this.createCommand('look', timestamp, commandData);
  }
  
  // ============================================================================
  // ATTACK COMMANDS
  // ============================================================================
  
  private generateAttackCommands(mouseState: MouseState, timestamp: number): InputCommand[] {
    const commands: InputCommand[] = [];
    
    // Primary attack (left mouse button)
    if (mouseState.leftButton) {
      commands.push(this.createCommand('attack', timestamp, {
        action: 'primary_attack'
      }));
    }
    
    // Secondary attack (right mouse button)
    if (mouseState.rightButton) {
      commands.push(this.createCommand('attack', timestamp, {
        action: 'secondary_attack'
      }));
    }
    
    return commands;
  }
  
  // ============================================================================
  // ABILITY COMMANDS
  // ============================================================================
  
  private generateAbilityCommands(keyState: KeyState, timestamp: number): InputCommand[] {
    const commands: InputCommand[] = [];
    
    // Dash ability (space key)
    if (keyState.dash) {
      commands.push(this.createCommand('ability', timestamp, {
        action: 'dash'
      }));
    }
    
    return commands;
  }
  
  // ============================================================================
  // COMMAND CREATION
  // ============================================================================
  
  private createCommand(
    type: InputCommand['type'],
    timestamp: number,
    data: InputCommandData
  ): InputCommand {
    return {
      type,
      timestamp,
      sequenceId: ++this.sequenceCounter,
      data
    };
  }
  
  // ============================================================================
  // VALIDATION
  // ============================================================================
  
  /**
   * Validate input command before sending
   */
  validateCommand(command: InputCommand): InputValidationResult {
    // Check sequence ID
    if (command.sequenceId <= 0) {
      return { valid: false, reason: 'Invalid sequence ID' };
    }
    
    // Check timestamp age
    const age = Date.now() - command.timestamp;
    if (age > INPUT_CONSTANTS.INPUT_TIMEOUT) {
      return { valid: false, reason: 'Command too old' };
    }
    
    // Validate command data based on type
    switch (command.type) {
      case 'movement':
        return this.validateMovementCommand(command.data);
      
      case 'look':
        return this.validateLookCommand(command.data);
      
      case 'attack':
        return this.validateAttackCommand(command.data);
      
      case 'ability':
        return this.validateAbilityCommand(command.data);
      
      default:
        return { valid: false, reason: 'Unknown command type' };
    }
  }
  
  private validateMovementCommand(data: InputCommandData): InputValidationResult {
    if (data.forward !== undefined) {
      if (Math.abs(data.forward) > INPUT_CONSTANTS.MAX_MOVEMENT_VALUE) {
        return { valid: false, reason: 'Invalid forward value' };
      }
    }
    
    if (data.strafe !== undefined) {
      if (Math.abs(data.strafe) > INPUT_CONSTANTS.MAX_MOVEMENT_VALUE) {
        return { valid: false, reason: 'Invalid strafe value' };
      }
    }
    
    return { valid: true };
  }
  
  private validateLookCommand(data: InputCommandData): InputValidationResult {
    if (data.angleDelta !== undefined) {
      if (Math.abs(data.angleDelta) > INPUT_CONSTANTS.MAX_ANGLE_DELTA) {
        return { valid: false, reason: 'Invalid angle delta' };
      }
    }
    
    return { valid: true };
  }
  
  private validateAttackCommand(data: InputCommandData): InputValidationResult {
    if (data.action && !['primary_attack', 'secondary_attack'].includes(data.action)) {
      return { valid: false, reason: 'Invalid attack action' };
    }
    
    return { valid: true };
  }
  
  private validateAbilityCommand(data: InputCommandData): InputValidationResult {
    if (data.action && data.action !== 'dash') {
      return { valid: false, reason: 'Invalid ability action' };
    }
    
    return { valid: true };
  }
  
  // ============================================================================
  // UTILITY
  // ============================================================================
  
  /**
   * Get current sequence number
   */
  getCurrentSequence(): number {
    return this.sequenceCounter;
  }
  
  /**
   * Reset sequence counter (for new matches)
   */
  resetSequence(): void {
    this.sequenceCounter = 0;
    this.lastMovementCommand = null;
    // this.lastLookCommand = null; // For future use
  }
}