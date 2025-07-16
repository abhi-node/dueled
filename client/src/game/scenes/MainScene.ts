import Phaser from 'phaser';

export class MainScene extends Phaser.Scene {
  private player1!: Phaser.GameObjects.Rectangle;
  private player2!: Phaser.GameObjects.Rectangle;
  private arena!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    this.createArena();
    this.createPlayers();
    this.setupInput();
    
    // Add welcome text
    this.add.text(400, 50, 'DUELED ARENA', {
      fontSize: '32px',
      color: '#ec4899',
      fontFamily: 'Orbitron',
    }).setOrigin(0.5);

    this.add.text(400, 550, 'Use WASD to move • Space to attack', {
      fontSize: '16px',
      color: '#94a3b8',
      fontFamily: 'Orbitron',
    }).setOrigin(0.5);
  }

  private createArena(): void {
    this.arena = this.add.graphics();
    this.arena.lineStyle(3, 0x475569);
    this.arena.strokeRect(50, 100, 700, 400);
    
    // Add some obstacles
    this.arena.fillStyle(0x64748b);
    this.arena.fillRect(200, 200, 50, 50);
    this.arena.fillRect(550, 350, 50, 50);
    this.arena.fillRect(375, 275, 50, 50);
  }

  private createPlayers(): void {
    // Player 1 (Blue)
    this.player1 = this.add.rectangle(150, 300, 30, 30, 0x3b82f6);
    this.player1.setStrokeStyle(2, 0x1d4ed8);
    
    // Player 2 (Red) 
    this.player2 = this.add.rectangle(650, 300, 30, 30, 0xef4444);
    this.player2.setStrokeStyle(2, 0xdc2626);

    // Add player labels
    this.add.text(150, 320, 'P1', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Orbitron',
    }).setOrigin(0.5);

    this.add.text(650, 320, 'P2', {
      fontSize: '12px',
      color: '#ffffff', 
      fontFamily: 'Orbitron',
    }).setOrigin(0.5);
  }

  private setupInput(): void {
    const cursors = this.input.keyboard?.createCursorKeys();
    const wasd = this.input.keyboard?.addKeys('W,S,A,D,SPACE') as {
      W: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
      SPACE: Phaser.Input.Keyboard.Key;
    };

    // Basic movement for demo
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const speed = 5;
      const bounds = { left: 65, right: 735, top: 115, bottom: 485 };

      switch (event.code) {
        case 'KeyW':
          if (this.player1.y > bounds.top) this.player1.y -= speed;
          break;
        case 'KeyS':
          if (this.player1.y < bounds.bottom) this.player1.y += speed;
          break;
        case 'KeyA':
          if (this.player1.x > bounds.left) this.player1.x -= speed;
          break;
        case 'KeyD':
          if (this.player1.x < bounds.right) this.player1.x += speed;
          break;
        case 'Space':
          this.handleAttack();
          break;
      }
    });
  }

  private handleAttack(): void {
    // Simple attack animation
    this.tweens.add({
      targets: this.player1,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
      onComplete: () => {
        this.player1.setScale(1);
      },
    });

    // Create attack effect
    const attackEffect = this.add.circle(this.player1.x, this.player1.y, 20, 0xfbbf24, 0.5);
    this.tweens.add({
      targets: attackEffect,
      alpha: 0,
      scale: 2,
      duration: 300,
      onComplete: () => attackEffect.destroy(),
    });
  }

  update(): void {
    // Game loop logic will go here
  }
}