/**
 * InputHandler - Clean, focused input processing for 1v1 arena combat
 * 
 * Replaces monolithic MainGameScene input handling with specialized system
 * Designed for Archer vs Berserker combat with responsive controls
 */

export interface InputState {
  movement: {
    forward: number;   // -1 to 1
    strafe: number;    // -1 to 1
    sprint: boolean;
    dash: boolean;
  };
  camera: {
    yaw: number;       // Mouse X movement
    pitch: number;     // Mouse Y movement or arrow keys
  };
  combat: {
    primaryAttack: boolean;
    specialAbility: boolean;
    reload: boolean;
  };
  ui: {
    showStats: boolean;
    escape: boolean;
    enter: boolean;
  };
}

export interface InputConfig {
  mouseSensitivity: number;
  pitchSensitivity: number;
  invertY: boolean;
  keyBindings: {
    moveForward: string[];
    moveBackward: string[];
    moveLeft: string[];
    moveRight: string[];
    sprint: string[];
    dash: string[];
    primaryAttack: string[];
    specialAbility: string[];
    reload: string[];
    pitchUp: string[];
    pitchDown: string[];
    showStats: string[];
    escape: string[];
    enter: string[];
  };
}

export interface InputCallbacks {
  onMovement?: (forward: number, strafe: number, sprint: boolean) => void;
  onRotation?: (yaw: number, pitch: number) => void;
  onPrimaryAttack?: () => void;
  onSpecialAbility?: () => void;
  onDash?: () => void;
  onReload?: () => void;
  onEscape?: () => void;
  onEnter?: () => void;
  onToggleStats?: () => void;
}

/**
 * InputHandler - Simplified input processing for arena combat
 */
export class InputHandler {
  private canvas: HTMLCanvasElement;
  private config: InputConfig;
  private callbacks: InputCallbacks;
  
  private currentInput: InputState;
  private keysPressed: Set<string> = new Set();
  private mouseMovement: { x: number; y: number } = { x: 0, y: 0 };
  
  private pointerLocked: boolean = false;
  private enabled: boolean = false;
  
  // Event listeners for cleanup
  private boundEventListeners: Map<string, EventListener> = new Map();
  
  constructor(canvas: HTMLCanvasElement, config?: Partial<InputConfig>) {
    this.canvas = canvas;
    
    // Default configuration
    this.config = {
      mouseSensitivity: 0.002,
      pitchSensitivity: 0.001,
      invertY: false,
      keyBindings: {
        moveForward: ['w', 'W', 'arrowup'],
        moveBackward: ['s', 'S', 'arrowdown'],
        moveLeft: ['a', 'A', 'arrowleft'],
        moveRight: ['d', 'D', 'arrowright'],
        sprint: ['shift', 'Shift'],
        dash: [' ', 'Space'],
        primaryAttack: ['mouse0'],
        specialAbility: ['mouse2', 'e', 'E'],
        reload: ['r', 'R'],
        pitchUp: ['pageup', 'PageUp'],
        pitchDown: ['pagedown', 'PageDown'],
        showStats: ['tab', 'Tab'],
        escape: ['escape', 'Escape'],
        enter: ['enter', 'Enter']
      },
      ...config
    };
    
    this.callbacks = {};
    
    // Initialize input state
    this.currentInput = {
      movement: {
        forward: 0,
        strafe: 0,
        sprint: false,
        dash: false
      },
      camera: {
        yaw: 0,
        pitch: 0
      },
      combat: {
        primaryAttack: false,
        specialAbility: false,
        reload: false
      },
      ui: {
        showStats: false,
        escape: false,
        enter: false
      }
    };
    
    this.setupEventListeners();
    console.log('InputHandler initialized');
  }
  
  /**
   * Set input callbacks
   */
  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = { ...callbacks };
  }
  
  /**
   * Enable input processing
   */
  enable(): void {
    this.enabled = true;
  }
  
  /**
   * Disable input processing
   */
  disable(): void {
    this.enabled = false;
    this.currentInput = {
      movement: { forward: 0, strafe: 0, sprint: false, dash: false },
      camera: { yaw: 0, pitch: 0 },
      combat: { primaryAttack: false, specialAbility: false, reload: false },
      ui: { showStats: false, escape: false, enter: false }
    };
  }
  
  /**
   * Setup all event listeners
   */
  private setupEventListeners(): void {
    // Keyboard events
    const keyDownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    const keyUpHandler = (e: KeyboardEvent) => this.handleKeyUp(e);
    
    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);
    
    this.boundEventListeners.set('keydown', keyDownHandler);
    this.boundEventListeners.set('keyup', keyUpHandler);
    
    // Mouse events
    const mouseDownHandler = (e: MouseEvent) => this.handleMouseDown(e);
    const mouseUpHandler = (e: MouseEvent) => this.handleMouseUp(e);
    const mouseMoveHandler = (e: MouseEvent) => this.handleMouseMove(e);
    const contextMenuHandler = (e: Event) => e.preventDefault();
    
    this.canvas.addEventListener('mousedown', mouseDownHandler);
    this.canvas.addEventListener('mouseup', mouseUpHandler);
    this.canvas.addEventListener('mousemove', mouseMoveHandler);
    this.canvas.addEventListener('contextmenu', contextMenuHandler);
    
    this.boundEventListeners.set('mousedown', mouseDownHandler);
    this.boundEventListeners.set('mouseup', mouseUpHandler);
    this.boundEventListeners.set('mousemove', mouseMoveHandler);
    this.boundEventListeners.set('contextmenu', contextMenuHandler);
    
    // Pointer lock events
    const pointerLockChangeHandler = () => this.handlePointerLockChange();
    const pointerLockErrorHandler = () => this.handlePointerLockError();
    
    document.addEventListener('pointerlockchange', pointerLockChangeHandler);
    document.addEventListener('pointerlockerror', pointerLockErrorHandler);
    
    this.boundEventListeners.set('pointerlockchange', pointerLockChangeHandler);
    this.boundEventListeners.set('pointerlockerror', pointerLockErrorHandler);
    
    // Canvas click for pointer lock
    const canvasClickHandler = () => this.requestPointerLock();
    this.canvas.addEventListener('click', canvasClickHandler);
    this.boundEventListeners.set('canvasclick', canvasClickHandler);
  }
  
  /**
   * Handle keyboard key down
   */
  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    
    const key = e.key.toLowerCase();
    this.keysPressed.add(key);
    
    // Update input state
    this.updateInputState();
    
    // Handle immediate actions
    this.handleImmediateActions(key);
    
    // Prevent default for game keys
    if (this.isGameKey(key)) {
      e.preventDefault();
    }
  }
  
  /**
   * Handle keyboard key up
   */
  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.enabled) return;
    
    const key = e.key.toLowerCase();
    this.keysPressed.delete(key);
    
    // Update input state
    this.updateInputState();
  }
  
  /**
   * Handle mouse button down
   */
  private handleMouseDown(e: MouseEvent): void {
    if (!this.enabled || !this.pointerLocked) return;
    
    const mouseKey = `mouse${e.button}`;
    this.keysPressed.add(mouseKey);
    
    this.updateInputState();
    this.handleImmediateActions(mouseKey);
    
    e.preventDefault();
  }
  
  /**
   * Handle mouse button up
   */
  private handleMouseUp(e: MouseEvent): void {
    if (!this.enabled) return;
    
    const mouseKey = `mouse${e.button}`;
    this.keysPressed.delete(mouseKey);
    
    this.updateInputState();
    e.preventDefault();
  }
  
  /**
   * Handle mouse movement
   */
  private handleMouseMove(e: MouseEvent): void {
    if (!this.enabled || !this.pointerLocked) return;
    
    // Update mouse movement
    this.mouseMovement.x += e.movementX * this.config.mouseSensitivity;
    this.mouseMovement.y += e.movementY * this.config.pitchSensitivity * (this.config.invertY ? -1 : 1);
    
    // Update camera input
    this.currentInput.camera.yaw = this.mouseMovement.x;
    this.currentInput.camera.pitch = this.mouseMovement.y;
    
    // Call rotation callback
    if (this.callbacks.onRotation) {
      this.callbacks.onRotation(this.mouseMovement.x, this.mouseMovement.y);
    }
    
    // Reset movement for next frame
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
  }
  
  /**
   * Update input state based on pressed keys
   */
  private updateInputState(): void {
    // Movement
    let forward = 0;
    let strafe = 0;
    
    if (this.isKeyPressed(this.config.keyBindings.moveForward)) forward += 1;
    if (this.isKeyPressed(this.config.keyBindings.moveBackward)) forward -= 1;
    if (this.isKeyPressed(this.config.keyBindings.moveLeft)) strafe -= 1;
    if (this.isKeyPressed(this.config.keyBindings.moveRight)) strafe += 1;
    
    // Normalize diagonal movement
    if (forward !== 0 && strafe !== 0) {
      const factor = 1 / Math.sqrt(2);
      forward *= factor;
      strafe *= factor;
    }
    
    this.currentInput.movement.forward = forward;
    this.currentInput.movement.strafe = strafe;
    this.currentInput.movement.sprint = this.isKeyPressed(this.config.keyBindings.sprint);
    this.currentInput.movement.dash = this.isKeyPressed(this.config.keyBindings.dash);
    
    // Camera pitch from keyboard
    let pitch = 0;
    if (this.isKeyPressed(this.config.keyBindings.pitchUp)) pitch -= 0.01;
    if (this.isKeyPressed(this.config.keyBindings.pitchDown)) pitch += 0.01;
    
    if (pitch !== 0) {
      this.currentInput.camera.pitch = pitch;
    }
    
    // Combat
    this.currentInput.combat.primaryAttack = this.isKeyPressed(this.config.keyBindings.primaryAttack);
    this.currentInput.combat.specialAbility = this.isKeyPressed(this.config.keyBindings.specialAbility);
    this.currentInput.combat.reload = this.isKeyPressed(this.config.keyBindings.reload);
    
    // UI
    this.currentInput.ui.showStats = this.isKeyPressed(this.config.keyBindings.showStats);
    this.currentInput.ui.escape = this.isKeyPressed(this.config.keyBindings.escape);
    this.currentInput.ui.enter = this.isKeyPressed(this.config.keyBindings.enter);
    
    // Call movement callback if movement changed
    if (this.callbacks.onMovement && (forward !== 0 || strafe !== 0 || this.currentInput.movement.sprint)) {
      this.callbacks.onMovement(forward, strafe, this.currentInput.movement.sprint);
    }
  }
  
  /**
   * Handle immediate action keys (single press actions)
   */
  private handleImmediateActions(key: string): void {
    // Primary attack
    if (this.config.keyBindings.primaryAttack.includes(key) && this.callbacks.onPrimaryAttack) {
      this.callbacks.onPrimaryAttack();
    }
    
    // Special ability
    if (this.config.keyBindings.specialAbility.includes(key) && this.callbacks.onSpecialAbility) {
      this.callbacks.onSpecialAbility();
    }
    
    // Dash
    if (this.config.keyBindings.dash.includes(key) && this.callbacks.onDash) {
      this.callbacks.onDash();
    }
    
    // Reload
    if (this.config.keyBindings.reload.includes(key) && this.callbacks.onReload) {
      this.callbacks.onReload();
    }
    
    // UI actions
    if (this.config.keyBindings.escape.includes(key) && this.callbacks.onEscape) {
      this.callbacks.onEscape();
    }
    
    if (this.config.keyBindings.enter.includes(key) && this.callbacks.onEnter) {
      this.callbacks.onEnter();
    }
    
    if (this.config.keyBindings.showStats.includes(key) && this.callbacks.onToggleStats) {
      this.callbacks.onToggleStats();
    }
  }
  
  /**
   * Check if any key in binding array is pressed
   */
  private isKeyPressed(keyBinding: string[]): boolean {
    return keyBinding.some(key => this.keysPressed.has(key.toLowerCase()));
  }
  
  /**
   * Check if key is a game control key
   */
  private isGameKey(key: string): boolean {
    const allKeys = [
      ...this.config.keyBindings.moveForward,
      ...this.config.keyBindings.moveBackward,
      ...this.config.keyBindings.moveLeft,
      ...this.config.keyBindings.moveRight,
      ...this.config.keyBindings.sprint,
      ...this.config.keyBindings.dash,
      ...this.config.keyBindings.specialAbility,
      ...this.config.keyBindings.reload,
      ...this.config.keyBindings.pitchUp,
      ...this.config.keyBindings.pitchDown,
      ...this.config.keyBindings.showStats
    ];
    
    return allKeys.some(gameKey => gameKey.toLowerCase() === key);
  }
  
  /**
   * Request pointer lock
   */
  requestPointerLock(): void {
    if (!this.pointerLocked) {
      this.canvas.requestPointerLock();
    }
  }
  
  /**
   * Handle pointer lock change
   */
  private handlePointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    
    if (this.pointerLocked) {
      console.log('Pointer locked');
      this.enable();
    } else {
      console.log('Pointer unlocked');
      this.disable();
    }
  }
  
  /**
   * Handle pointer lock error
   */
  private handlePointerLockError(): void {
    console.error('Pointer lock failed');
    this.pointerLocked = false;
  }
  
  /**
   * Get current input state
   */
  getInputState(): InputState {
    return { ...this.currentInput };
  }
  
  /**
   * Update input configuration
   */
  updateConfig(newConfig: Partial<InputConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Get input statistics
   */
  getStats(): {
    enabled: boolean;
    pointerLocked: boolean;
    keysPressed: number;
    activeBindings: string[];
  } {
    const activeBindings: string[] = [];
    
    Object.entries(this.config.keyBindings).forEach(([action, keys]) => {
      if (this.isKeyPressed(keys)) {
        activeBindings.push(action);
      }
    });
    
    return {
      enabled: this.enabled,
      pointerLocked: this.pointerLocked,
      keysPressed: this.keysPressed.size,
      activeBindings
    };
  }
  
  /**
   * Clean up event listeners
   */
  destroy(): void {
    // Remove all event listeners
    for (const [event, listener] of this.boundEventListeners) {
      if (event === 'canvasclick') {
        this.canvas.removeEventListener('click', listener);
      } else if (event.startsWith('mouse') || event === 'contextmenu') {
        this.canvas.removeEventListener(event.replace('mouse', ''), listener);
      } else {
        document.removeEventListener(event, listener);
      }
    }
    
    this.boundEventListeners.clear();
    this.keysPressed.clear();
    this.enabled = false;
    this.pointerLocked = false;
    
    console.log('InputHandler destroyed');
  }
}