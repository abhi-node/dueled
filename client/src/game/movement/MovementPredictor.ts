/**
 * MovementPredictor - Client-side prediction and reconciliation
 * 
 * Handles input history, position snapshots, and smooth server reconciliation
 * for responsive multiplayer movement.
 */

import { MovementCalculator, type MovementInput, type MovementConfig } from '@dueled/shared';

interface InputHistoryEntry {
  sequenceId: number;
  timestamp: number;
  input: MovementInput;
  predictedPosition: { x: number; y: number };
}

interface ServerUpdate {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  sequenceId: number;
  timestamp: number;
}

interface PredictionConfig {
  historySize: number;           // Number of inputs to keep in history
  reconciliationThreshold: number; // Minimum distance to trigger correction
  smoothingFactor: number;       // How aggressively to smooth corrections (0-1)
  maxCorrectionSpeed: number;    // Maximum correction speed (units/second)
}

export class MovementPredictor {
  private movementCalculator: MovementCalculator;
  private config: PredictionConfig;
  
  // Input history (circular buffer)
  private inputHistory: InputHistoryEntry[] = [];
  private historyIndex: number = 0;
  
  // Current state
  private currentPosition: { x: number; y: number } = { x: 0, y: 0 };
  private currentVelocity: { x: number; y: number } = { x: 0, y: 0 };
  private currentAngle: number = 0;
  
  // Server reconciliation
  private lastServerUpdate: ServerUpdate | null = null;
  private correctionOffset: { x: number; y: number } = { x: 0, y: 0 };
  private isCorrectingPosition: boolean = false;
  
  constructor(movementConfig: MovementConfig, predictionConfig?: Partial<PredictionConfig>) {
    this.movementCalculator = new MovementCalculator(movementConfig);
    
    this.config = {
      historySize: 60,              // 1 second at 60 FPS
      reconciliationThreshold: 0.1, // 0.1 units difference
      smoothingFactor: 0.15,        // Smooth correction over ~6-7 frames
      maxCorrectionSpeed: 20.0,     // Max 20 units/second correction
      ...predictionConfig
    };
    
    // Initialize circular buffer
    this.inputHistory = new Array(this.config.historySize);
    for (let i = 0; i < this.config.historySize; i++) {
      this.inputHistory[i] = {
        sequenceId: 0,
        timestamp: 0,
        input: { forward: 0, strafe: 0, sprint: false, angle: 0 },
        predictedPosition: { x: 0, y: 0 }
      };
    }
  }
  
  /**
   * Initialize player position and angle
   */
  initialize(position: { x: number; y: number }, angle: number): void {
    this.currentPosition = { ...position };
    this.currentAngle = angle;
    this.currentVelocity = { x: 0, y: 0 };
    this.correctionOffset = { x: 0, y: 0 };
    this.isCorrectingPosition = false;
    
    console.log('MovementPredictor initialized', { position, angle });
  }
  
  /**
   * Predict movement for current frame and store in history
   */
  predictMovement(
    sequenceId: number,
    input: Omit<MovementInput, 'angle'>,
    deltaTime: number
  ): { position: { x: number; y: number }; velocity: { x: number; y: number } } {
    console.log('🔮 [PREDICTOR] Predicting movement', {
      sequenceId,
      input,
      deltaTime,
      currentPos: this.currentPosition,
      currentAngle: this.currentAngle
    });
    // Create full movement input with current angle
    const fullInput: MovementInput = {
      ...input,
      angle: this.currentAngle
    };
    
    // Calculate movement using shared calculator
    const result = this.movementCalculator.calculateMovement(
      this.currentPosition,
      fullInput,
      deltaTime
    );
    
    // Store in input history
    this.storeInputHistory(sequenceId, fullInput, result.position);
    
    // Update current state
    this.currentPosition = { ...result.position };
    this.currentVelocity = { ...result.velocity };
    
    // Apply any ongoing position correction
    this.applyCorrectionSmoothing(deltaTime);
    
    return {
      position: { ...this.currentPosition },
      velocity: { ...this.currentVelocity }
    };
  }
  
  /**
   * Update player angle (client authoritative)
   */
  updateAngle(angle: number): void {
    this.currentAngle = angle;
  }
  
  /**
   * Process server position update and reconcile if needed
   */
  reconcileWithServer(serverUpdate: ServerUpdate): boolean {
    this.lastServerUpdate = serverUpdate;
    
    // Find the corresponding input in our history
    const historyEntry = this.findInputBySequence(serverUpdate.sequenceId);
    if (!historyEntry) {
      console.warn('No input history found for sequence', serverUpdate.sequenceId);
      return false;
    }
    
    // Calculate prediction error
    const predictionError = MovementCalculator.getDistance(
      historyEntry.predictedPosition,
      serverUpdate.position
    );
    
    // Only reconcile if error exceeds threshold
    if (predictionError > this.config.reconciliationThreshold) {
      console.log('Reconciling position', {
        sequenceId: serverUpdate.sequenceId,
        error: predictionError,
        predicted: historyEntry.predictedPosition,
        server: serverUpdate.position
      });
      
      // Calculate correction needed
      this.correctionOffset = {
        x: serverUpdate.position.x - historyEntry.predictedPosition.x,
        y: serverUpdate.position.y - historyEntry.predictedPosition.y
      };
      
      this.isCorrectingPosition = true;
      
      // Replay inputs after the corrected sequence
      this.replayInputsAfterSequence(serverUpdate.sequenceId, serverUpdate.position);
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Get current predicted position (with any corrections applied)
   */
  getCurrentPosition(): { x: number; y: number } {
    return { ...this.currentPosition };
  }
  
  /**
   * Get current velocity
   */
  getCurrentVelocity(): { x: number; y: number } {
    return { ...this.currentVelocity };
  }
  
  /**
   * Get current angle
   */
  getCurrentAngle(): number {
    return this.currentAngle;
  }
  
  /**
   * Check if currently correcting position
   */
  isCorrectingMovement(): boolean {
    return this.isCorrectingPosition;
  }
  
  /**
   * Store input and prediction in circular buffer
   */
  private storeInputHistory(
    sequenceId: number,
    input: MovementInput,
    predictedPosition: { x: number; y: number }
  ): void {
    this.inputHistory[this.historyIndex] = {
      sequenceId,
      timestamp: Date.now(),
      input: { ...input },
      predictedPosition: { ...predictedPosition }
    };
    
    this.historyIndex = (this.historyIndex + 1) % this.config.historySize;
  }
  
  /**
   * Find input history entry by sequence ID
   */
  private findInputBySequence(sequenceId: number): InputHistoryEntry | null {
    for (const entry of this.inputHistory) {
      if (entry.sequenceId === sequenceId) {
        return entry;
      }
    }
    return null;
  }
  
  /**
   * Replay inputs that happened after a corrected sequence
   */
  private replayInputsAfterSequence(correctedSequence: number, serverPosition: { x: number; y: number }): void {
    // Find all inputs after the corrected sequence
    const inputsToReplay = this.inputHistory
      .filter(entry => entry.sequenceId > correctedSequence)
      .sort((a, b) => a.sequenceId - b.sequenceId);
    
    if (inputsToReplay.length === 0) {
      return;
    }
    
    // Start replay from server position
    let replayPosition = { ...serverPosition };
    
    // Replay each input
    for (const entry of inputsToReplay) {
      const deltaTime = 1/60; // Assume 60 FPS for replay
      
      const result = this.movementCalculator.calculateMovement(
        replayPosition,
        entry.input,
        deltaTime
      );
      
      replayPosition = result.position;
      
      // Update the predicted position in history
      entry.predictedPosition = { ...replayPosition };
    }
    
    // Update current position to final replay result
    this.currentPosition = { ...replayPosition };
  }
  
  /**
   * Apply smooth correction to reduce jitter
   */
  private applyCorrectionSmoothing(deltaTime: number): void {
    if (!this.isCorrectingPosition) {
      return;
    }
    
    // Calculate how much to correct this frame
    const correctionSpeed = Math.min(
      this.config.maxCorrectionSpeed * deltaTime,
      this.config.smoothingFactor
    );
    
    // Apply correction
    const correctionX = this.correctionOffset.x * correctionSpeed;
    const correctionY = this.correctionOffset.y * correctionSpeed;
    
    this.currentPosition.x += correctionX;
    this.currentPosition.y += correctionY;
    
    // Reduce remaining correction
    this.correctionOffset.x -= correctionX;
    this.correctionOffset.y -= correctionY;
    
    // Check if correction is complete
    const remainingCorrection = Math.sqrt(
      this.correctionOffset.x * this.correctionOffset.x +
      this.correctionOffset.y * this.correctionOffset.y
    );
    
    if (remainingCorrection < 0.01) {
      this.correctionOffset = { x: 0, y: 0 };
      this.isCorrectingPosition = false;
    }
  }
  
  /**
   * Get debug information
   */
  getDebugInfo(): {
    inputHistorySize: number;
    isCorrectingPosition: boolean;
    correctionOffset: { x: number; y: number };
    lastServerUpdate: ServerUpdate | null;
  } {
    return {
      inputHistorySize: this.inputHistory.filter(entry => entry.sequenceId > 0).length,
      isCorrectingPosition: this.isCorrectingPosition,
      correctionOffset: { ...this.correctionOffset },
      lastServerUpdate: this.lastServerUpdate
    };
  }
  
  /**
   * Clear all state (for match end/disconnect)
   */
  reset(): void {
    this.currentPosition = { x: 0, y: 0 };
    this.currentVelocity = { x: 0, y: 0 };
    this.currentAngle = 0;
    this.correctionOffset = { x: 0, y: 0 };
    this.isCorrectingPosition = false;
    this.lastServerUpdate = null;
    this.historyIndex = 0;
    
    // Clear history
    for (let i = 0; i < this.config.historySize; i++) {
      this.inputHistory[i].sequenceId = 0;
    }
  }
}