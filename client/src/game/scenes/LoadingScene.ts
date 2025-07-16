import Phaser from 'phaser';

export class LoadingScene extends Phaser.Scene {
  private loadingBar!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'LoadingScene' });
  }

  init(): void {
    console.log('Loading scene initialized');
  }

  preload(): void {
    this.createLoadingUI();
    this.setupLoadingEvents();
    this.loadAssets();
  }

  private createLoadingUI(): void {
    const { width, height } = this.cameras.main;
    
    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1e293b);
    
    // Title
    this.add.text(width / 2, height / 2 - 150, 'DUELED', {
      fontSize: '48px',
      color: '#ec4899',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    
    // Subtitle
    this.add.text(width / 2, height / 2 - 100, 'Loading Arena...', {
      fontSize: '24px',
      color: '#94a3b8',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    
    // Progress bar background
    this.progressBox = this.add.graphics();
    this.progressBox.fillStyle(0x475569);
    this.progressBox.fillRect(width / 2 - 160, height / 2 - 10, 320, 20);
    
    // Progress bar
    this.progressBar = this.add.graphics();
    
    // Loading text
    this.loadingText = this.add.text(width / 2, height / 2 + 50, 'Loading...', {
      fontSize: '16px',
      color: '#64748b',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
  }

  private setupLoadingEvents(): void {
    // Update progress bar
    this.load.on('progress', (value: number) => {
      this.updateProgressBar(value);
    });

    // Update loading text
    this.load.on('fileprogress', (file: Phaser.Loader.File) => {
      this.loadingText.setText(`Loading ${file.key}...`);
    });

    // Complete loading
    this.load.on('complete', () => {
      this.loadingText.setText('Loading Complete!');
      this.time.delayedCall(500, () => {
        this.scene.start('MenuScene');
      });
    });
  }

  private updateProgressBar(progress: number): void {
    const { width } = this.cameras.main;
    
    this.progressBar.clear();
    this.progressBar.fillStyle(0xec4899);
    this.progressBar.fillRect(width / 2 - 158, height / 2 - 8, 316 * progress, 16);
    
    // Add percentage text
    const percentText = Math.round(progress * 100) + '%';
    this.loadingText.setText(`Loading... ${percentText}`);
  }

  private loadAssets(): void {
    // Load game assets
    this.loadImages();
    this.loadSprites();
    this.loadAudio();
    this.loadMaps();
    
    // Start loading
    this.load.start();
  }

  private loadImages(): void {
    // Create simple colored rectangles as placeholders for now
    this.load.image('wall', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77kQAAAABJRU5ErkJggg==');
    this.load.image('floor', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77kQAAAABJRU5ErkJggg==');
    this.load.image('obstacle', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77kQAAAABJRU5ErkJggg==');
  }

  private loadSprites(): void {
    // Create simple colored rectangles for player sprites
    this.load.image('player-berserker', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77kQAAAABJRU5ErkJggg==');
    this.load.image('player-mage', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77kQAAAABJRU5ErkJggg==');
    this.load.image('player-bomber', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77kQAAAABJRU5ErkJggg==');
    this.load.image('player-archer', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77kQAAAABJRU5ErkJggg==');
  }

  private loadAudio(): void {
    // Load audio files (placeholder - would load actual audio files)
    // this.load.audio('bgm', ['assets/audio/bgm.ogg', 'assets/audio/bgm.mp3']);
    // this.load.audio('sfx-attack', ['assets/audio/attack.ogg', 'assets/audio/attack.mp3']);
    // this.load.audio('sfx-move', ['assets/audio/move.ogg', 'assets/audio/move.mp3']);
  }

  private loadMaps(): void {
    // Load map data (placeholder - would load actual map files)
    // this.load.json('arena-basic', 'assets/maps/arena-basic.json');
    // this.load.json('arena-obstacles', 'assets/maps/arena-obstacles.json');
  }

  create(): void {
    console.log('Loading scene created');
    
    // Emit scene transition event
    this.game.events.emit('scene-transition', {
      from: 'loading',
      to: 'menu'
    });
  }
}