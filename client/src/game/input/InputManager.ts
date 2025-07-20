/**
 * InputManager - WASD/Mouse event handling and state tracking
 * 
 * Captures all input events at 60 FPS and manages input state.
 * Does NOT generate commands - that's handled by InputCommands.ts
 */

import type { 
  KeyState, 
  MouseState, 
  InputConfig,
  KeyBindings
} from '../types/InputTypes.js';

export class InputManager {
  private keyState: KeyState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    dash: false
  };
  
  private mouseState: MouseState = {
    deltaX: 0,
    deltaY: 0,
    leftButton: false,
    rightButton: false,
    middleButton: false
  };
  
  private config: InputConfig;
  private keyBindings: KeyBindings;
  private isActive = false;
  private canvas: HTMLCanvasElement | null = null;
  private hasWindowFocus = true;
  
  // Mouse capture state
  private isPointerLocked = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  
  constructor(config: InputConfig) {
    this.config = config;
    this.keyBindings = config.keyBindings;
  }
  
  // ============================================================================
  // LIFECYCLE
  // ============================================================================
  
  /**
   * Start capturing input events
   */
  start(canvas: HTMLCanvasElement): void {
    if (this.isActive) {
      console.warn('InputManager already active');
      return;
    }
    
    this.canvas = canvas;
    this.isActive = true;
    
    // Attach event listeners
    this.attachEventListeners();
    
    // Request pointer lock on canvas click
    canvas.addEventListener('click', this.requestPointerLock);
    
    console.log('InputManager started');
  }
  
  /**
   * Stop capturing input events
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }
    
    this.isActive = false;
    
    // Remove event listeners
    this.removeEventListeners();
    
    // Exit pointer lock
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
    
    // Reset state
    this.resetInputState();
    
    console.log('InputManager stopped');
  }
  
  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================
  
  private attachEventListeners(): void {
    // Keyboard events
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    
    // Mouse events
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    
    // Pointer lock events
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    
    // Focus events (pause input when window loses focus)
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('focus', this.onWindowFocus);
  }
  
  private removeEventListeners(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('focus', this.onWindowFocus);
    
    if (this.canvas) {
      this.canvas.removeEventListener('click', this.requestPointerLock);
    }
  }
  
  // ============================================================================
  // KEYBOARD HANDLERS
  // ============================================================================
  
  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isActive || !this.hasWindowFocus) {
      // Key input ignored (not active or no window focus)
      return;
    }
    
    // Prevent default for game keys
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }
    
    // Update key state
    switch (event.code) {
      case this.keyBindings.forward:
        this.keyState.forward = true;
        console.log('⬆️ [INPUT] W pressed');
        break;
      case this.keyBindings.backward:
        this.keyState.backward = true;
        console.log('⬇️ [INPUT] S pressed');
        break;
      case this.keyBindings.left:
        this.keyState.left = true;
        console.log('⬅️ [INPUT] A pressed');
        break;
      case this.keyBindings.right:
        this.keyState.right = true;
        console.log('➡️ [INPUT] D pressed');
        break;
      case this.keyBindings.sprint:
        this.keyState.sprint = true;
        console.log('🏃 [INPUT] Sprint pressed');
        break;
      case this.keyBindings.dash:
        if (!event.repeat) { // Only trigger on first press
          this.keyState.dash = true;
          console.log('💨 [INPUT] Dash pressed');
        }
        break;
    }
  };
  
  private onKeyUp = (event: KeyboardEvent): void => {
    if (!this.isActive || !this.hasWindowFocus) return;
    
    // Update key state
    switch (event.code) {
      case this.keyBindings.forward:
        this.keyState.forward = false;
        break;
      case this.keyBindings.backward:
        this.keyState.backward = false;
        break;
      case this.keyBindings.left:
        this.keyState.left = false;
        break;
      case this.keyBindings.right:
        this.keyState.right = false;
        break;
      case this.keyBindings.sprint:
        this.keyState.sprint = false;
        break;
      case this.keyBindings.dash:
        this.keyState.dash = false;
        break;
    }
  };
  
  // ============================================================================
  // MOUSE HANDLERS
  // ============================================================================
  
  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isActive || !this.isPointerLocked) {
      // Mouse movement ignored (not active or pointer not locked)
      return;
    }
    
    // ACCUMULATE mouse deltas instead of overwriting them
    // This prevents loss when multiple mouse events occur between game frames
    this.mouseState.deltaX += event.movementX * this.config.mouseSensitivity;
    this.mouseState.deltaY += event.movementY * this.config.mouseSensitivity;
    
    if (Math.abs(event.movementX) > 0.1) {
      console.log('🖱️ [MOUSE] Movement accumulated', {
        eventDelta: event.movementX,
        totalDeltaX: this.mouseState.deltaX,
        totalDeltaY: this.mouseState.deltaY
      });
    }
  };
  
  private onMouseDown = (event: MouseEvent): void => {
    if (!this.isActive || !this.hasWindowFocus || !this.isPointerLocked) return;
    
    event.preventDefault();
    
    switch (event.button) {
      case 0: // Left mouse button
        this.mouseState.leftButton = true;
        break;
      case 1: // Middle mouse button
        this.mouseState.middleButton = true;
        break;
      case 2: // Right mouse button
        this.mouseState.rightButton = true;
        break;
    }
  };
  
  private onMouseUp = (event: MouseEvent): void => {
    if (!this.isActive || !this.hasWindowFocus || !this.isPointerLocked) return;
    
    switch (event.button) {
      case 0: // Left mouse button
        this.mouseState.leftButton = false;
        break;
      case 1: // Middle mouse button
        this.mouseState.middleButton = false;
        break;
      case 2: // Right mouse button
        this.mouseState.rightButton = false;
        break;
    }
  };
  
  // ============================================================================
  // POINTER LOCK HANDLERS
  // ============================================================================
  
  private requestPointerLock = (): void => {
    if (this.canvas && !this.isPointerLocked) {
      this.canvas.requestPointerLock();
    }
  };
  
  private onPointerLockChange = (): void => {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
    console.log('Pointer lock:', this.isPointerLocked ? 'acquired' : 'released');
  };
  
  private onPointerLockError = (): void => {
    console.error('Pointer lock failed');
    this.isPointerLocked = false;
  };
  
  // ============================================================================
  // FOCUS HANDLERS
  // ============================================================================
  
  private onWindowBlur = (): void => {
    // Reset input state when window loses focus
    this.hasWindowFocus = false;
    this.resetInputState();
    
    // Exit pointer lock when window loses focus
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  };
  
  private onWindowFocus = (): void => {
    // Clear any stale mouse delta
    this.hasWindowFocus = true;
    this.mouseState.deltaX = 0;
    this.mouseState.deltaY = 0;
  };
  
  // ============================================================================
  // STATE ACCESS
  // ============================================================================
  
  /**
   * Get current keyboard state (read-only)
   */
  getKeyState(): Readonly<KeyState> {
    return { ...this.keyState };
  }
  
  /**
   * Get current mouse state without clearing deltas
   */
  getMouseState(): Readonly<MouseState> {
    return { ...this.mouseState };
  }
  
  /**
   * Clear mouse deltas after processing them
   */
  clearMouseDeltas(): void {
    this.mouseState.deltaX = 0;
    this.mouseState.deltaY = 0;
  }
  
  /**
   * Check if pointer is locked (required for mouse look)
   */
  isPointerLockActive(): boolean {
    return this.isPointerLocked;
  }
  
  /**
   * Check if window has focus and game is ready for input
   */
  hasGameFocus(): boolean {
    return this.hasWindowFocus && this.isPointerLocked;
  }
  
  /**
   * Check if input system is active and focused
   * Input only works when:
   * 1. InputManager is active
   * 2. Window has focus 
   * 3. Pointer is locked (clicked into game)
   */
  isInputActive(): boolean {
    return this.isActive && this.hasWindowFocus && this.isPointerLocked;
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  private isGameKey(code: string): boolean {
    const gameKeys = Object.values(this.keyBindings);
    return gameKeys.includes(code);
  }
  
  private resetInputState(): void {
    this.keyState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      dash: false
    };
    
    this.mouseState = {
      deltaX: 0,
      deltaY: 0,
      leftButton: false,
      rightButton: false,
      middleButton: false
    };
  }
  
  /**
   * Update input configuration
   */
  updateConfig(config: Partial<InputConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.keyBindings) {
      this.keyBindings = config.keyBindings;
    }
  }
}