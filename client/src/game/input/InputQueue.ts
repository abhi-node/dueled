/**
 * InputQueue - 30Hz batching and transmission of input commands
 * 
 * Collects input commands generated at 60 FPS and batches them
 * for transmission to the server at 30 Hz to reduce bandwidth.
 */

import type { 
  InputCommand, 
  InputBatch
} from '../types/InputTypes.js';
import { INPUT_CONSTANTS } from '../types/InputTypes.js';

export class InputQueue {
  private commandQueue: InputCommand[] = [];
  private batchTimer: number | null = null;
  private isActive = false;
  
  // Callbacks
  private onBatchReady?: (batch: InputBatch) => void;
  private onError?: (error: string) => void;
  
  // Stats for debugging
  private stats = {
    totalCommands: 0,
    totalBatches: 0,
    droppedCommands: 0,
    avgBatchSize: 0
  };
  
  constructor(
    onBatchReady?: (batch: InputBatch) => void,
    onError?: (error: string) => void
  ) {
    this.onBatchReady = onBatchReady;
    this.onError = onError;
  }
  
  // ============================================================================
  // LIFECYCLE
  // ============================================================================
  
  /**
   * Start the batching system
   */
  start(): void {
    if (this.isActive) {
      console.warn('InputQueue already active');
      return;
    }
    
    this.isActive = true;
    this.startBatchTimer();
    
    console.log('InputQueue started at', 1000 / INPUT_CONSTANTS.BATCH_INTERVAL, 'Hz');
  }
  
  /**
   * Stop the batching system
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }
    
    this.isActive = false;
    this.stopBatchTimer();
    
    // Send any remaining commands
    this.flushQueue();
    
    console.log('InputQueue stopped');
  }
  
  // ============================================================================
  // COMMAND QUEUING
  // ============================================================================
  
  /**
   * Add input command to the queue
   */
  enqueueCommand(command: InputCommand): void {
    if (!this.isActive) {
      return;
    }
    
    // Check queue size limit
    if (this.commandQueue.length >= 60) { // 1 second at 60 FPS
      this.handleQueueOverflow(command);
      return;
    }
    
    // Add command to queue
    this.commandQueue.push(command);
    this.stats.totalCommands++;
  }
  
  /**
   * Add multiple commands to the queue
   */
  enqueueCommands(commands: InputCommand[]): void {
    for (const command of commands) {
      this.enqueueCommand(command);
    }
  }
  
  // ============================================================================
  // BATCHING
  // ============================================================================
  
  private startBatchTimer(): void {
    this.batchTimer = window.setInterval(() => {
      this.processBatch();
    }, INPUT_CONSTANTS.BATCH_INTERVAL);
  }
  
  private stopBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }
  
  private processBatch(): void {
    if (!this.isActive || this.commandQueue.length === 0) {
      return;
    }
    
    // Create batch from current queue
    const batch = this.createBatch();
    
    // Clear the queue
    this.commandQueue = [];
    
    // Update stats
    this.updateStats(batch);
    
    // Send batch
    if (this.onBatchReady) {
      try {
        this.onBatchReady(batch);
      } catch (error) {
        this.handleError(`Failed to send batch: ${error}`);
      }
    }
  }
  
  private createBatch(): InputBatch {
    // Sort commands by sequence ID to handle any out-of-order issues
    const sortedCommands = [...this.commandQueue].sort((a, b) => a.sequenceId - b.sequenceId);
    
    // Limit batch size
    const commands = sortedCommands.slice(0, INPUT_CONSTANTS.MAX_COMMANDS_PER_BATCH);
    
    // Track dropped commands
    if (sortedCommands.length > INPUT_CONSTANTS.MAX_COMMANDS_PER_BATCH) {
      const dropped = sortedCommands.length - INPUT_CONSTANTS.MAX_COMMANDS_PER_BATCH;
      this.stats.droppedCommands += dropped;
      console.warn(`Dropped ${dropped} commands due to batch size limit`);
    }
    
    return {
      commands,
      clientTime: Date.now()
    };
  }
  
  /**
   * Force send current queue immediately
   */
  flushQueue(): void {
    if (this.commandQueue.length > 0) {
      this.processBatch();
    }
  }
  
  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  
  private handleQueueOverflow(droppedCommand: InputCommand): void {
    this.stats.droppedCommands++;
    
    // Try to make room by removing oldest commands
    if (this.commandQueue.length > 0) {
      this.commandQueue.shift(); // Remove oldest
      this.commandQueue.push(droppedCommand); // Add new one
      
      console.warn('Input queue overflow, dropped oldest command');
    } else {
      console.error('Failed to add command to empty queue - this should not happen');
    }
  }
  
  private handleError(message: string): void {
    console.error('InputQueue error:', message);
    
    if (this.onError) {
      this.onError(message);
    }
  }
  
  // ============================================================================
  // STATS AND DEBUGGING
  // ============================================================================
  
  private updateStats(batch: InputBatch): void {
    this.stats.totalBatches++;
    
    // Calculate rolling average batch size
    const prevAvg = this.stats.avgBatchSize;
    const newAvg = (prevAvg * (this.stats.totalBatches - 1) + batch.commands.length) / this.stats.totalBatches;
    this.stats.avgBatchSize = Math.round(newAvg * 100) / 100; // Round to 2 decimals
  }
  
  /**
   * Get queue statistics
   */
  getStats(): Readonly<typeof this.stats> {
    return { ...this.stats };
  }
  
  /**
   * Get current queue state
   */
  getQueueInfo(): {
    queueLength: number;
    isActive: boolean;
    nextBatchIn: number; // ms until next batch
  } {
    return {
      queueLength: this.commandQueue.length,
      isActive: this.isActive,
      nextBatchIn: this.batchTimer ? INPUT_CONSTANTS.BATCH_INTERVAL : 0
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalCommands: 0,
      totalBatches: 0,
      droppedCommands: 0,
      avgBatchSize: 0
    };
  }
  
  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  /**
   * Update callbacks
   */
  setCallbacks(
    onBatchReady?: (batch: InputBatch) => void,
    onError?: (error: string) => void
  ): void {
    this.onBatchReady = onBatchReady;
    this.onError = onError;
  }
  
  /**
   * Check if queue is active
   */
  isQueueActive(): boolean {
    return this.isActive;
  }
  
  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.commandQueue.length;
  }
}