import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  private playButton!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private instructionsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MenuScene' });
  }

  init(): void {
    console.log('Menu scene initialized');
  }

  create(): void {
    const { width, height } = this.cameras.main;
    
    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1e293b);
    
    // Title
    this.titleText = this.add.text(width / 2, height / 2 - 150, 'DUELED', {
      fontSize: '64px',
      color: '#ec4899',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    
    // Subtitle
    this.subtitleText = this.add.text(width / 2, height / 2 - 100, 'Arena Ready', {
      fontSize: '24px',
      color: '#94a3b8',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    
    // Play button
    this.playButton = this.add.text(width / 2, height / 2, 'Enter Arena', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#ec4899',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5);
    
    // Instructions
    this.instructionsText = this.add.text(width / 2, height / 2 + 100, 'Click to start your duel!', {
      fontSize: '18px',
      color: '#64748b',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    
    // Make play button interactive
    this.playButton.setInteractive({ useHandCursor: true });
    this.playButton.on('pointerdown', () => {
      this.startGame();
    });
    
    // Hover effects
    this.playButton.on('pointerover', () => {
      this.playButton.setStyle({ backgroundColor: '#f472b6' });
    });
    
    this.playButton.on('pointerout', () => {
      this.playButton.setStyle({ backgroundColor: '#ec4899' });
    });
    
    // Add some visual flair
    this.createParticles();
    this.createAnimations();
  }
  
  private createParticles(): void {
    // Add some subtle particle effects
    const particles = this.add.particles(0, 0, 'wall', {
      x: { min: 0, max: this.cameras.main.width },
      y: { min: 0, max: this.cameras.main.height },
      scale: { min: 0.1, max: 0.3 },
      speed: { min: 10, max: 30 },
      alpha: { min: 0.1, max: 0.3 },
      lifespan: 5000,
      frequency: 1000,
      tint: 0x64748b,
    });
  }
  
  private createAnimations(): void {
    // Pulse animation for the title
    this.tweens.add({
      targets: this.titleText,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 2000,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });
    
    // Fade in animation for instructions
    this.tweens.add({
      targets: this.instructionsText,
      alpha: 0.3,
      duration: 1500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });
  }
  
  private startGame(): void {
    // Add click effect
    this.tweens.add({
      targets: this.playButton,
      scaleX: 0.9,
      scaleY: 0.9,
      duration: 100,
      ease: 'Power2',
      yoyo: true,
      onComplete: () => {
        // Transition to game scene
        this.scene.start('GameScene');
      },
    });
  }
  
  update(): void {
    // Any continuous updates for the menu
  }
}