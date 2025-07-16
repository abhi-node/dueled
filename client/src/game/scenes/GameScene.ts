import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Arena } from '../entities/Arena';
import { NetworkManager } from '../network/NetworkManager';
import { InputManager } from '../input/InputManager';
import { GameState } from '../state/GameState';
import type { Vector2, ClassType } from '@dueled/shared';

export class GameScene extends Phaser.Scene {
  private arena!: Arena;
  private localPlayer!: Player;
  private remotePlayers: Map<string, Player> = new Map();
  private networkManager!: NetworkManager;
  private inputManager!: InputManager;
  private gameState!: GameState;
  private ui!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: any;
  private spawnPoints: Vector2[] = [];
  private gameStarted: boolean = false;
  private matchId: string = '';
  private playerHealthBars: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private playerNameTags: Map<string, Phaser.GameObjects.Text> = new Map();

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data?: any): void {
    console.log('Game scene initialized with data:', data);
    this.matchId = data?.matchId || '';
    this.gameStarted = false;
    this.remotePlayers.clear();
    this.playerHealthBars.clear();
    this.playerNameTags.clear();
  }

  create(): void {
    console.log('Game scene created');
    
    // Initialize game systems
    this.initializeGameSystems();
    
    // Create arena
    this.createArena();
    
    // Setup input
    this.setupInput();
    
    // Setup UI
    this.setupUI();
    
    // Setup network events
    this.setupNetworkEvents();
    
    // Setup physics
    this.setupPhysics();
    
    // Create spawn points
    this.createSpawnPoints();
    
    // Wait for match to start
    this.waitForMatch();
  }

  private initializeGameSystems(): void {
    this.gameState = new GameState(this);
    this.networkManager = new NetworkManager(this);
    this.inputManager = new InputManager(this);
    
    // Initialize networking
    this.networkManager.initialize();
  }

  private createArena(): void {
    this.arena = new Arena(this);
    this.arena.create();
  }

  private setupInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,S,A,D,SPACE,Q,E') as {
      W: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
      SPACE: Phaser.Input.Keyboard.Key;
      Q: Phaser.Input.Keyboard.Key;
      E: Phaser.Input.Keyboard.Key;
    };
    
    this.inputManager.setupInput(this.cursors, this.wasd);
  }

  private setupUI(): void {
    this.ui = this.add.container(0, 0);
    
    // Create UI elements
    this.createHUD();
    this.createMiniMap();
    this.createNotificationArea();
  }

  private createHUD(): void {
    const { width, height } = this.cameras.main;
    
    // Health bar background
    const healthBarBg = this.add.graphics();
    healthBarBg.fillStyle(0x2d3748);
    healthBarBg.fillRect(20, height - 60, 200, 20);
    
    // Health bar
    const healthBar = this.add.graphics();
    healthBar.fillStyle(0x48bb78);
    healthBar.fillRect(22, height - 58, 196, 16);
    
    // Health text
    const healthText = this.add.text(22, height - 58, '100/100', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    });
    
    // Class indicator
    const classText = this.add.text(20, height - 90, 'Berserker', {
      fontSize: '16px',
      color: '#ec4899',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    });
    
    this.ui.add([healthBarBg, healthBar, healthText, classText]);
  }

  private createMiniMap(): void {
    const { width } = this.cameras.main;
    
    // Mini map background
    const miniMapBg = this.add.graphics();
    miniMapBg.fillStyle(0x1a202c);
    miniMapBg.fillRect(width - 150, 20, 120, 120);
    miniMapBg.lineStyle(2, 0x4a5568);
    miniMapBg.strokeRect(width - 150, 20, 120, 120);
    
    // Mini map title
    const miniMapTitle = this.add.text(width - 90, 25, 'Arena', {
      fontSize: '12px',
      color: '#a0aec0',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5, 0);
    
    this.ui.add([miniMapBg, miniMapTitle]);
  }

  private createNotificationArea(): void {
    const { width } = this.cameras.main;
    
    // Notification container
    const notificationContainer = this.add.container(width / 2, 100);
    this.ui.add(notificationContainer);
  }

  private setupNetworkEvents(): void {
    this.networkManager.on('player-joined', (playerData: any) => {
      this.handlePlayerJoined(playerData);
    });
    
    this.networkManager.on('player-left', (playerData: any) => {
      this.handlePlayerLeft(playerData);
    });
    
    this.networkManager.on('player-moved', (moveData: any) => {
      this.handlePlayerMoved(moveData);
    });
    
    this.networkManager.on('game-start', (gameData: any) => {
      this.handleGameStart(gameData);
    });
    
    this.networkManager.on('match-found', (matchData: any) => {
      this.handleMatchFound(matchData);
    });
  }

  private setupPhysics(): void {
    // Setup physics world bounds
    this.physics.world.setBounds(0, 0, 800, 600);
    
    // Create collision groups
    const playerGroup = this.physics.world.createCollisionGroup();
    const wallGroup = this.physics.world.createCollisionGroup();
    const obstacleGroup = this.physics.world.createCollisionGroup();
    
    // Store collision groups for later use
    this.data.set('playerGroup', playerGroup);
    this.data.set('wallGroup', wallGroup);
    this.data.set('obstacleGroup', obstacleGroup);
  }

  private createSpawnPoints(): void {
    // Define spawn points around the arena
    this.spawnPoints = [
      { x: 150, y: 300 }, // Left side
      { x: 650, y: 300 }, // Right side
      { x: 400, y: 150 }, // Top
      { x: 400, y: 450 }, // Bottom
    ];
    
    // Visual indicators for spawn points (debug)
    if (import.meta.env.DEV) {
      this.spawnPoints.forEach((point, index) => {
        this.add.circle(point.x, point.y, 10, 0x00ff00, 0.3);
        this.add.text(point.x, point.y - 20, `Spawn ${index + 1}`, {
          fontSize: '10px',
          color: '#00ff00',
          fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5);
      });
    }
  }

  private waitForMatch(): void {
    // Show waiting message
    const waitingText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      'Waiting for opponent...',
      {
        fontSize: '24px',
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
      }
    ).setOrigin(0.5);
    
    // Pulse animation
    this.tweens.add({
      targets: waitingText,
      alpha: 0.5,
      duration: 1000,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });
    
    // Store reference to remove later
    this.data.set('waitingText', waitingText);
  }

  private handleMatchFound(matchData: any): void {
    console.log('Match found:', matchData);
    this.matchId = matchData.matchId;
    
    // Remove waiting text
    const waitingText = this.data.get('waitingText');
    if (waitingText) {
      waitingText.destroy();
    }
    
    // Join the match
    this.networkManager.joinMatch(this.matchId, 'berserker'); // Default class for now
  }

  private handlePlayerJoined(playerData: any): void {
    console.log('Player joined:', playerData);
    
    if (playerData.playerId === this.networkManager.getPlayerId()) {
      // This is the local player
      this.createLocalPlayer(playerData);
    } else {
      // This is a remote player
      this.createRemotePlayer(playerData);
    }
  }

  private handlePlayerLeft(playerData: any): void {
    console.log('Player left:', playerData);
    
    const player = this.remotePlayers.get(playerData.playerId);
    if (player) {
      player.destroy();
      this.remotePlayers.delete(playerData.playerId);
      
      // Remove UI elements
      const healthBar = this.playerHealthBars.get(playerData.playerId);
      if (healthBar) {
        healthBar.destroy();
        this.playerHealthBars.delete(playerData.playerId);
      }
      
      const nameTag = this.playerNameTags.get(playerData.playerId);
      if (nameTag) {
        nameTag.destroy();
        this.playerNameTags.delete(playerData.playerId);
      }
    }
  }

  private handlePlayerMoved(moveData: any): void {
    const player = this.remotePlayers.get(moveData.playerId);
    if (player) {
      player.updatePosition(moveData.position, moveData.velocity);
    }
  }

  private handleGameStart(gameData: any): void {
    console.log('Game started:', gameData);
    this.gameStarted = true;
    
    // Show game start notification
    this.showNotification('FIGHT!', 2000);
    
    // Enable input
    this.inputManager.setEnabled(true);
  }

  private createLocalPlayer(playerData: any): void {
    const spawnPoint = this.getRandomSpawnPoint();
    this.localPlayer = new Player(this, spawnPoint.x, spawnPoint.y, 'berserker', true);
    this.localPlayer.setPlayerId(playerData.playerId);
    this.localPlayer.setPlayerName(playerData.player?.username || 'Player');
    
    // Setup physics collisions
    this.setupPlayerCollisions(this.localPlayer);
    
    // Setup camera to follow local player
    this.cameras.main.startFollow(this.localPlayer.sprite);
    this.cameras.main.setZoom(1);
    
    // Create player UI
    this.createPlayerUI(playerData.playerId, this.localPlayer);
  }

  private createRemotePlayer(playerData: any): void {
    const spawnPoint = this.getRandomSpawnPoint();
    const remotePlayer = new Player(this, spawnPoint.x, spawnPoint.y, playerData.classType || 'berserker', false);
    remotePlayer.setPlayerId(playerData.playerId);
    remotePlayer.setPlayerName(playerData.player?.username || 'Opponent');
    
    // Setup physics collisions
    this.setupPlayerCollisions(remotePlayer);
    
    this.remotePlayers.set(playerData.playerId, remotePlayer);
    
    // Create player UI
    this.createPlayerUI(playerData.playerId, remotePlayer);
  }

  private setupPlayerCollisions(player: Player): void {
    // Get collision groups
    const playerGroup = this.data.get('playerGroup');
    const wallGroup = this.data.get('wallGroup');
    const obstacleGroup = this.data.get('obstacleGroup');
    
    // Add player to player group
    if (playerGroup) {
      playerGroup.add(player.sprite);
    }
    
    // Setup collisions with walls
    if (this.arena) {
      this.physics.add.collider(player.sprite, this.arena.getWallCollisionGroup(), (player, wall) => {
        this.handleWallCollision(player as Phaser.Physics.Arcade.Sprite, wall as Phaser.Physics.Arcade.Sprite);
      });
      
      // Setup collisions with obstacles
      this.physics.add.collider(player.sprite, this.arena.getObstacleCollisionGroup(), (player, obstacle) => {
        this.handleObstacleCollision(player as Phaser.Physics.Arcade.Sprite, obstacle as Phaser.Physics.Arcade.Sprite);
      });
    }
    
    // Setup player-to-player collisions
    this.remotePlayers.forEach((otherPlayer) => {
      if (otherPlayer !== player) {
        this.physics.add.collider(player.sprite, otherPlayer.sprite, (player1, player2) => {
          this.handlePlayerCollision(player1 as Phaser.Physics.Arcade.Sprite, player2 as Phaser.Physics.Arcade.Sprite);
        });
      }
    });
  }

  private handleWallCollision(player: Phaser.Physics.Arcade.Sprite, wall: Phaser.Physics.Arcade.Sprite): void {
    // Smooth wall sliding - player can slide along walls
    const body = player.body as Phaser.Physics.Arcade.Body;
    
    // Calculate wall normal
    const wallBounds = wall.getBounds();
    const playerBounds = player.getBounds();
    
    let slideDirection = { x: 0, y: 0 };
    
    // Determine slide direction based on collision
    if (playerBounds.right > wallBounds.left && playerBounds.left < wallBounds.right) {
      // Vertical wall collision - allow horizontal sliding
      slideDirection.x = body.velocity.x;
      slideDirection.y = 0;
    } else if (playerBounds.bottom > wallBounds.top && playerBounds.top < wallBounds.bottom) {
      // Horizontal wall collision - allow vertical sliding
      slideDirection.x = 0;
      slideDirection.y = body.velocity.y;
    }
    
    // Apply sliding motion
    body.setVelocity(slideDirection.x * 0.8, slideDirection.y * 0.8);
  }

  private handleObstacleCollision(player: Phaser.Physics.Arcade.Sprite, obstacle: Phaser.Physics.Arcade.Sprite): void {
    // Similar to wall collision but with potential for obstacle destruction
    const body = player.body as Phaser.Physics.Arcade.Body;
    
    // Reduce velocity on obstacle collision
    body.setVelocity(body.velocity.x * 0.3, body.velocity.y * 0.3);
    
    // Add small knockback effect
    const knockbackForce = 50;
    const angle = Phaser.Math.Angle.Between(obstacle.x, obstacle.y, player.x, player.y);
    const knockbackX = Math.cos(angle) * knockbackForce;
    const knockbackY = Math.sin(angle) * knockbackForce;
    
    body.setVelocity(body.velocity.x + knockbackX, body.velocity.y + knockbackY);
  }

  private handlePlayerCollision(player1: Phaser.Physics.Arcade.Sprite, player2: Phaser.Physics.Arcade.Sprite): void {
    // Players bounce off each other
    const body1 = player1.body as Phaser.Physics.Arcade.Body;
    const body2 = player2.body as Phaser.Physics.Arcade.Body;
    
    // Calculate collision angle
    const angle = Phaser.Math.Angle.Between(player1.x, player1.y, player2.x, player2.y);
    
    // Apply separation force
    const separationForce = 100;
    const separationX = Math.cos(angle) * separationForce;
    const separationY = Math.sin(angle) * separationForce;
    
    body1.setVelocity(body1.velocity.x - separationX, body1.velocity.y - separationY);
    body2.setVelocity(body2.velocity.x + separationX, body2.velocity.y + separationY);
  }

  private createPlayerUI(playerId: string, player: Player): void {
    // Create health bar
    const healthBar = this.add.graphics();
    this.playerHealthBars.set(playerId, healthBar);
    
    // Create name tag
    const nameTag = this.add.text(0, 0, player.getPlayerName(), {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#000000',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5);
    
    this.playerNameTags.set(playerId, nameTag);
  }

  private getRandomSpawnPoint(): Vector2 {
    const availableSpawns = this.spawnPoints.filter(point => {
      // Check if spawn point is safe (not occupied)
      return this.isSpawnPointSafe(point);
    });
    
    if (availableSpawns.length === 0) {
      // Fallback to center if no safe spawns
      return { x: 400, y: 300 };
    }
    
    const randomIndex = Math.floor(Math.random() * availableSpawns.length);
    return availableSpawns[randomIndex];
  }

  private isSpawnPointSafe(point: Vector2): boolean {
    // Check if any player is too close to this spawn point
    const minDistance = 100;
    
    if (this.localPlayer) {
      const distance = Phaser.Math.Distance.Between(
        point.x, point.y,
        this.localPlayer.sprite.x, this.localPlayer.sprite.y
      );
      if (distance < minDistance) return false;
    }
    
    for (const [_, player] of this.remotePlayers) {
      const distance = Phaser.Math.Distance.Between(
        point.x, point.y,
        player.sprite.x, player.sprite.y
      );
      if (distance < minDistance) return false;
    }
    
    return true;
  }

  private showNotification(message: string, duration: number = 3000): void {
    const { width, height } = this.cameras.main;
    
    const notification = this.add.text(width / 2, height / 2 - 100, message, {
      fontSize: '48px',
      color: '#ec4899',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    
    // Fade in animation
    notification.setAlpha(0);
    this.tweens.add({
      targets: notification,
      alpha: 1,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        // Fade out after duration
        this.time.delayedCall(duration, () => {
          this.tweens.add({
            targets: notification,
            alpha: 0,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
              notification.destroy();
            },
          });
        });
      },
    });
  }

  update(time: number, delta: number): void {
    if (!this.gameStarted) return;
    
    // Update local player
    if (this.localPlayer) {
      this.localPlayer.update(time, delta);
      
      // Handle input
      this.inputManager.update(this.localPlayer);
    }
    
    // Update remote players
    this.remotePlayers.forEach((player) => {
      player.update(time, delta);
    });
    
    // Update UI
    this.updateUI();
    
    // Update game state
    this.gameState.update(time, delta);
  }

  private updateUI(): void {
    // Update health bars and name tags
    this.playerHealthBars.forEach((healthBar, playerId) => {
      const player = playerId === this.localPlayer?.getPlayerId() ? this.localPlayer : this.remotePlayers.get(playerId);
      if (player) {
        this.updatePlayerHealthBar(healthBar, player);
      }
    });
    
    this.playerNameTags.forEach((nameTag, playerId) => {
      const player = playerId === this.localPlayer?.getPlayerId() ? this.localPlayer : this.remotePlayers.get(playerId);
      if (player) {
        this.updatePlayerNameTag(nameTag, player);
      }
    });
  }

  private updatePlayerHealthBar(healthBar: Phaser.GameObjects.Graphics, player: Player): void {
    const maxHealth = player.getMaxHealth();
    const currentHealth = player.getCurrentHealth();
    const healthPercentage = currentHealth / maxHealth;
    
    healthBar.clear();
    
    // Background
    healthBar.fillStyle(0x2d3748);
    healthBar.fillRect(player.sprite.x - 25, player.sprite.y - 40, 50, 6);
    
    // Health bar
    const healthColor = healthPercentage > 0.5 ? 0x48bb78 : healthPercentage > 0.25 ? 0xed8936 : 0xe53e3e;
    healthBar.fillStyle(healthColor);
    healthBar.fillRect(player.sprite.x - 24, player.sprite.y - 39, 48 * healthPercentage, 4);
  }

  private updatePlayerNameTag(nameTag: Phaser.GameObjects.Text, player: Player): void {
    nameTag.setPosition(player.sprite.x, player.sprite.y - 55);
  }

  // Public methods for external access
  public getLocalPlayer(): Player | null {
    return this.localPlayer || null;
  }

  public getRemotePlayer(playerId: string): Player | null {
    return this.remotePlayers.get(playerId) || null;
  }

  public getNetworkManager(): NetworkManager {
    return this.networkManager;
  }

  public getGameState(): GameState {
    return this.gameState;
  }

  public isGameStarted(): boolean {
    return this.gameStarted;
  }
}