/**
 * UIManager - Simple HUD and health bars for 1v1 arena combat
 * 
 * Replaces monolithic MainGameScene UI handling with specialized system
 * Designed for Archer vs Berserker combat with clean, responsive UI
 */

export interface PlayerStats {
  playerId: string;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  username?: string;
  classType: 'archer' | 'berserker';
}

export interface MatchInfo {
  roundNumber: number;
  roundTimeLeft: number;
  status: 'waiting' | 'in_progress' | 'ended';
  score?: { player1: number; player2: number };
}

export interface UIElement {
  id: string;
  type: 'health_bar' | 'armor_bar' | 'timer' | 'score' | 'crosshair' | 'minimap' | 'notification';
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  style?: Partial<CSSStyleDeclaration>;
}

export interface NotificationOptions {
  type: 'info' | 'warning' | 'error' | 'success';
  duration: number;
  position: 'top' | 'center' | 'bottom';
}

/**
 * UIManager - Simplified HUD management for arena combat
 */
export class UIManager {
  private container: HTMLElement;
  private elements: Map<string, HTMLElement> = new Map();
  
  private healthBar: HTMLElement | null = null;
  private armorBar: HTMLElement | null = null;
  private crosshair: HTMLElement | null = null;
  private timer: HTMLElement | null = null;
  private score: HTMLElement | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private notifications: HTMLElement | null = null;
  
  private currentPlayerStats: PlayerStats | null = null;
  private currentMatchInfo: MatchInfo | null = null;
  
  private notificationQueue: Array<{ message: string; options: NotificationOptions }> = [];
  private activeNotifications: Set<HTMLElement> = new Set();
  
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`UI container '${containerId}' not found`);
    }
    
    this.container = container;
    this.initializeUI();
    
    console.log('UIManager initialized');
  }
  
  /**
   * Initialize basic UI elements
   */
  private initializeUI(): void {
    // Create a dedicated overlay root so we never touch children that
    // don't belong to the UI manager (e.g. the canvas)
    let overlay = this.container.querySelector<HTMLDivElement>('#ui-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ui-overlay';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '20'; // Above canvas
      this.container.appendChild(overlay);
    }

    this.container = overlay; // Everything below uses the overlay
    
    // Set container styles
    this.container.style.position = 'absolute';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '14px';
    this.container.style.color = 'white';
    
    // Create health bar
    this.createHealthBar();
    
    // Create armor bar
    this.createArmorBar();
    
    // Create crosshair
    this.createCrosshair();
    
    // Create timer
    this.createTimer();
    
    // Create score display
    this.createScore();
    
    // Create minimap
    this.createMinimap();
    
    // Create notification area
    this.createNotificationArea();
  }
  
  /**
   * Create health bar UI
   */
  private createHealthBar(): void {
    const healthContainer = document.createElement('div');
    healthContainer.style.position = 'absolute';
    healthContainer.style.bottom = '20px';
    healthContainer.style.left = '20px';
    healthContainer.style.width = '200px';
    healthContainer.style.height = '20px';
    
    // Health bar background
    const healthBg = document.createElement('div');
    healthBg.style.width = '100%';
    healthBg.style.height = '100%';
    healthBg.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    healthBg.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    healthBg.style.borderRadius = '2px';
    
    // Health bar fill
    const healthFill = document.createElement('div');
    healthFill.style.width = '100%';
    healthFill.style.height = '100%';
    healthFill.style.background = 'linear-gradient(to right, #4CAF50, #FFC107, #F44336)';
    healthFill.style.borderRadius = '1px';
    healthFill.style.transition = 'width 0.3s ease';
    
    // Health text
    const healthText = document.createElement('div');
    healthText.style.position = 'absolute';
    healthText.style.top = '50%';
    healthText.style.left = '50%';
    healthText.style.transform = 'translate(-50%, -50%)';
    healthText.style.fontSize = '12px';
    healthText.style.fontWeight = 'bold';
    healthText.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
    healthText.textContent = 'Health: 100/100';
    
    healthBg.appendChild(healthFill);
    healthContainer.appendChild(healthBg);
    healthContainer.appendChild(healthText);
    
    this.container.appendChild(healthContainer);
    this.healthBar = healthContainer;
    this.elements.set('health_bar', healthContainer);
  }
  
  /**
   * Create armor bar UI
   */
  private createArmorBar(): void {
    const armorContainer = document.createElement('div');
    armorContainer.style.position = 'absolute';
    armorContainer.style.bottom = '50px';
    armorContainer.style.left = '20px';
    armorContainer.style.width = '200px';
    armorContainer.style.height = '15px';
    
    // Armor bar background
    const armorBg = document.createElement('div');
    armorBg.style.width = '100%';
    armorBg.style.height = '100%';
    armorBg.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    armorBg.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    armorBg.style.borderRadius = '2px';
    
    // Armor bar fill
    const armorFill = document.createElement('div');
    armorFill.style.width = '100%';
    armorFill.style.height = '100%';
    armorFill.style.backgroundColor = '#2196F3';
    armorFill.style.borderRadius = '1px';
    armorFill.style.transition = 'width 0.3s ease';
    
    // Armor text
    const armorText = document.createElement('div');
    armorText.style.position = 'absolute';
    armorText.style.top = '50%';
    armorText.style.left = '50%';
    armorText.style.transform = 'translate(-50%, -50%)';
    armorText.style.fontSize = '10px';
    armorText.style.fontWeight = 'bold';
    armorText.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
    armorText.textContent = 'Armor: 50/50';
    
    armorBg.appendChild(armorFill);
    armorContainer.appendChild(armorBg);
    armorContainer.appendChild(armorText);
    
    this.container.appendChild(armorContainer);
    this.armorBar = armorContainer;
    this.elements.set('armor_bar', armorContainer);
  }
  
  /**
   * Create crosshair UI
   */
  private createCrosshair(): void {
    const crosshair = document.createElement('div');
    crosshair.style.position = 'absolute';
    crosshair.style.top = '50%';
    crosshair.style.left = '50%';
    crosshair.style.transform = 'translate(-50%, -50%)';
    crosshair.style.width = '20px';
    crosshair.style.height = '20px';
    crosshair.style.pointerEvents = 'none';
    
    // Crosshair lines
    const horizontal = document.createElement('div');
    horizontal.style.position = 'absolute';
    horizontal.style.top = '50%';
    horizontal.style.left = '0';
    horizontal.style.width = '100%';
    horizontal.style.height = '1px';
    horizontal.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    horizontal.style.transform = 'translateY(-50%)';
    
    const vertical = document.createElement('div');
    vertical.style.position = 'absolute';
    vertical.style.left = '50%';
    vertical.style.top = '0';
    vertical.style.width = '1px';
    vertical.style.height = '100%';
    vertical.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    vertical.style.transform = 'translateX(-50%)';
    
    crosshair.appendChild(horizontal);
    crosshair.appendChild(vertical);
    
    this.container.appendChild(crosshair);
    this.crosshair = crosshair;
    this.elements.set('crosshair', crosshair);
  }
  
  /**
   * Create timer UI
   */
  private createTimer(): void {
    const timer = document.createElement('div');
    timer.style.position = 'absolute';
    timer.style.top = '20px';
    timer.style.left = '50%';
    timer.style.transform = 'translateX(-50%)';
    timer.style.fontSize = '24px';
    timer.style.fontWeight = 'bold';
    timer.style.color = 'white';
    timer.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
    timer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    timer.style.padding = '10px 20px';
    timer.style.borderRadius = '5px';
    timer.textContent = '03:00';
    
    this.container.appendChild(timer);
    this.timer = timer;
    this.elements.set('timer', timer);
  }
  
  /**
   * Create score display
   */
  private createScore(): void {
    const score = document.createElement('div');
    score.style.position = 'absolute';
    score.style.top = '20px';
    score.style.right = '20px';
    score.style.fontSize = '18px';
    score.style.fontWeight = 'bold';
    score.style.color = 'white';
    score.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
    score.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    score.style.padding = '10px 15px';
    score.style.borderRadius = '5px';
    score.textContent = 'Round 1 - 0:0';
    
    this.container.appendChild(score);
    this.score = score;
    this.elements.set('score', score);
  }
  
  /**
   * Create minimap
   */
  private createMinimap(): void {
    const minimap = document.createElement('canvas');
    minimap.width = 120;
    minimap.height = 120;
    minimap.style.position = 'absolute';
    minimap.style.top = '20px';
    minimap.style.left = '20px';
    minimap.style.border = '2px solid rgba(255, 255, 255, 0.5)';
    minimap.style.borderRadius = '5px';
    minimap.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    
    this.container.appendChild(minimap);
    this.minimap = minimap;
    this.elements.set('minimap', minimap);
  }
  
  /**
   * Create notification area
   */
  private createNotificationArea(): void {
    const notifications = document.createElement('div');
    notifications.style.position = 'absolute';
    notifications.style.top = '50%';
    notifications.style.left = '50%';
    notifications.style.transform = 'translate(-50%, -50%)';
    notifications.style.width = '400px';
    notifications.style.maxHeight = '200px';
    notifications.style.pointerEvents = 'none';
    notifications.style.zIndex = '1000';
    
    this.container.appendChild(notifications);
    this.notifications = notifications;
    this.elements.set('notifications', notifications);
  }
  
  /**
   * Update player stats display
   */
  updatePlayerStats(stats: PlayerStats): void {
    this.currentPlayerStats = stats;
    
    if (this.healthBar) {
      const healthPercent = Math.max(0, stats.health / stats.maxHealth);
      const healthFill = this.healthBar.querySelector('div > div') as HTMLElement;
      const healthText = this.healthBar.querySelector('div:last-child') as HTMLElement;
      
      if (healthFill) {
        healthFill.style.width = `${healthPercent * 100}%`;
      }
      
      if (healthText) {
        healthText.textContent = `Health: ${Math.round(stats.health)}/${stats.maxHealth}`;
      }
    }
    
    if (this.armorBar) {
      const armorPercent = Math.max(0, stats.armor / stats.maxArmor);
      const armorFill = this.armorBar.querySelector('div > div') as HTMLElement;
      const armorText = this.armorBar.querySelector('div:last-child') as HTMLElement;
      
      if (armorFill) {
        armorFill.style.width = `${armorPercent * 100}%`;
      }
      
      if (armorText) {
        armorText.textContent = `Armor: ${Math.round(stats.armor)}/${stats.maxArmor}`;
      }
    }
  }
  
  /**
   * Update match information
   */
  updateMatchInfo(info: MatchInfo): void {
    this.currentMatchInfo = info;
    
    // Update timer
    if (this.timer) {
      const minutes = Math.floor(info.roundTimeLeft / 60);
      const seconds = info.roundTimeLeft % 60;
      this.timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      // Change color based on time remaining
      if (info.roundTimeLeft <= 30) {
        this.timer.style.color = '#F44336'; // Red
      } else if (info.roundTimeLeft <= 60) {
        this.timer.style.color = '#FFC107'; // Yellow
      } else {
        this.timer.style.color = 'white';
      }
    }
    
    // Update score
    if (this.score && info.score) {
      this.score.textContent = `Round ${info.roundNumber} - ${info.score.player1}:${info.score.player2}`;
    }
  }
  
  /**
   * Show notification
   */
  showNotification(message: string, options: Partial<NotificationOptions> = {}): void {
    const defaultOptions: NotificationOptions = {
      type: 'info',
      duration: 3000,
      position: 'center'
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    this.notificationQueue.push({ message, options: finalOptions });
    this.processNotificationQueue();
  }
  
  /**
   * Process notification queue
   */
  private processNotificationQueue(): void {
    if (this.notificationQueue.length === 0 || !this.notifications) return;
    
    const { message, options } = this.notificationQueue.shift()!;
    
    const notification = document.createElement('div');
    notification.style.margin = '10px 0';
    notification.style.padding = '15px 20px';
    notification.style.borderRadius = '5px';
    notification.style.fontSize = '16px';
    notification.style.fontWeight = 'bold';
    notification.style.textAlign = 'center';
    notification.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
    notification.style.transform = 'translateY(-20px)';
    notification.style.opacity = '0';
    notification.style.transition = 'all 0.3s ease';
    notification.textContent = message;
    
    // Style based on type
    switch (options.type) {
      case 'success':
        notification.style.backgroundColor = 'rgba(76, 175, 80, 0.9)';
        notification.style.border = '2px solid #4CAF50';
        break;
      case 'warning':
        notification.style.backgroundColor = 'rgba(255, 193, 7, 0.9)';
        notification.style.border = '2px solid #FFC107';
        notification.style.color = 'black';
        break;
      case 'error':
        notification.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
        notification.style.border = '2px solid #F44336';
        break;
      default:
        notification.style.backgroundColor = 'rgba(33, 150, 243, 0.9)';
        notification.style.border = '2px solid #2196F3';
    }
    
    this.notifications.appendChild(notification);
    this.activeNotifications.add(notification);
    
    // Animate in
    requestAnimationFrame(() => {
      notification.style.transform = 'translateY(0)';
      notification.style.opacity = '1';
    });
    
    // Remove after duration
    setTimeout(() => {
      notification.style.transform = 'translateY(-20px)';
      notification.style.opacity = '0';
      
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
        this.activeNotifications.delete(notification);
        
        // Process next notification
        if (this.notificationQueue.length > 0) {
          setTimeout(() => this.processNotificationQueue(), 200);
        }
      }, 300);
    }, options.duration);
  }
  
  /**
   * Update minimap (placeholder for now)
   */
  updateMinimap(playerPosition: { x: number; y: number }, enemyPosition?: { x: number; y: number }): void {
    if (!this.minimap) return;
    
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, this.minimap.width, this.minimap.height);
    
    // Draw arena bounds
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 100, 100);
    
    // Draw player position (blue dot)
    const playerX = 10 + (playerPosition.x + 15) / 30 * 100; // Normalize to arena bounds
    const playerY = 10 + (playerPosition.y + 15) / 30 * 100;
    
    ctx.fillStyle = '#2196F3';
    ctx.beginPath();
    ctx.arc(playerX, playerY, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw enemy position (red dot)
    if (enemyPosition) {
      const enemyX = 10 + (enemyPosition.x + 15) / 30 * 100;
      const enemyY = 10 + (enemyPosition.y + 15) / 30 * 100;
      
      ctx.fillStyle = '#F44336';
      ctx.beginPath();
      ctx.arc(enemyX, enemyY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  /**
   * Show/hide UI element
   */
  setElementVisible(elementId: string, visible: boolean): void {
    const element = this.elements.get(elementId);
    if (element) {
      element.style.display = visible ? 'block' : 'none';
    }
  }
  
  /**
   * Clear all notifications
   */
  clearNotifications(): void {
    if (this.notifications) {
      this.notifications.innerHTML = '';
    }
    this.notificationQueue = [];
    this.activeNotifications.clear();
  }
  
  /**
   * Show match result
   */
  showMatchResult(winner: string, reason: string): void {
    const isVictory = winner === this.currentPlayerStats?.playerId;
    
    this.showNotification(
      isVictory ? 'VICTORY!' : 'DEFEAT!',
      {
        type: isVictory ? 'success' : 'error',
        duration: 5000,
        position: 'center'
      }
    );
    
    setTimeout(() => {
      this.showNotification(
        `Reason: ${reason}`,
        {
          type: 'info',
          duration: 3000,
          position: 'center'
        }
      );
    }, 1000);
  }
  
  /**
   * Get UI stats for debugging
   */
  getStats(): {
    elements: number;
    activeNotifications: number;
    queuedNotifications: number;
  } {
    return {
      elements: this.elements.size,
      activeNotifications: this.activeNotifications.size,
      queuedNotifications: this.notificationQueue.length
    };
  }
  
  /**
   * Show match end screen
   */
  showMatchEndScreen(data: any): void {
    try {
      // Create match end overlay
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50';
      
      const modal = document.createElement('div');
      modal.className = 'bg-gray-900 p-8 rounded-lg text-center max-w-md mx-4';
      
      const title = document.createElement('h2');
      title.className = 'text-3xl font-bold mb-4';
      title.textContent = data.winner ? `${data.winner} Wins!` : 'Match Ended';
      title.style.color = data.winner ? '#10b981' : '#ef4444';
      
      const details = document.createElement('div');
      details.className = 'text-gray-300 mb-6';
      details.innerHTML = `
        <p>Final Score: ${data.score?.player1 || 0} - ${data.score?.player2 || 0}</p>
        <p>Duration: ${data.duration || 'Unknown'}</p>
      `;
      
      const button = document.createElement('button');
      button.className = 'bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded text-white font-semibold';
      button.textContent = 'Back to Lobby';
      button.onclick = () => {
        overlay.remove();
        // Navigate back to lobby - this would typically use React router
        window.location.href = '/';
      };
      
      modal.appendChild(title);
      modal.appendChild(details);
      modal.appendChild(button);
      overlay.appendChild(modal);
      
      this.container.appendChild(overlay);
      
      console.log('Match end screen shown:', data);
    } catch (error) {
      console.error('Error showing match end screen:', error);
    }
  }

  /**
   * Clean up UI elements
   */
  destroy(): void {
    this.clearNotifications();
    this.container.innerHTML = '';
    this.elements.clear();
    
    this.healthBar = null;
    this.armorBar = null;
    this.crosshair = null;
    this.timer = null;
    this.score = null;
    this.minimap = null;
    this.notifications = null;
    
    console.log('UIManager destroyed');
  }
}