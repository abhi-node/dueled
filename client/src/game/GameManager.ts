import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { LoadingScene } from './scenes/LoadingScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

export interface GameManagerEvents {
  onSceneChange: (scene: string) => void;
  onGameReady: () => void;
  onGameError: (error: Error) => void;
  onPlayerJoined: (player: any) => void;
  onPlayerLeft: (player: any) => void;
}

export class GameManager {
  private game: Phaser.Game | null = null;
  private currentScene: string = 'loading';
  private gameContainer: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  initialize(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container with id '${containerId}' not found`);
      return;
    }

    this.gameContainer = container;
    
    // Get initial container size
    const rect = container.getBoundingClientRect();
    const width = Math.max(800, rect.width);
    const height = Math.max(600, rect.height);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: containerId,
      backgroundColor: '#1e293b',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: import.meta.env.DEV,
          fixedStep: true,
          fps: 60,
        },
      },
      scene: [LoadingScene, MenuScene, GameScene, MainScene],
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: true,
      },
      input: {
        gamepad: true,
        keyboard: true,
        mouse: true,
        touch: true,
      },
      audio: {
        disableWebAudio: false,
      },
    };

    this.game = new Phaser.Game(config);
    this.setupResizeHandler();
    this.setupGameEvents();
    
    // Start with loading scene
    this.currentScene = 'loading';
  }

  private setupResizeHandler(): void {
    if (!this.gameContainer || !this.game) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.game) {
          this.game.scale.resize(width, height);
        }
      }
    });

    this.resizeObserver.observe(this.gameContainer);
  }

  private setupGameEvents(): void {
    if (!this.game) return;

    // Handle scene transitions
    this.game.events.on('scene-transition', (data: { from: string; to: string }) => {
      this.currentScene = data.to;
      console.log(`Scene transition: ${data.from} -> ${data.to}`);
    });

    // Handle game errors
    this.game.events.on('error', (error: Error) => {
      console.error('Phaser game error:', error);
    });
  }

  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }

    this.gameContainer = null;
    this.currentScene = '';
  }

  getGame(): Phaser.Game | null {
    return this.game;
  }

  getCurrentScene(): string {
    return this.currentScene;
  }

  switchScene(sceneKey: string, data?: any): void {
    if (!this.game) return;

    const scene = this.game.scene.getScene(sceneKey);
    if (scene) {
      this.game.scene.start(sceneKey, data);
    } else {
      console.error(`Scene '${sceneKey}' not found`);
    }
  }

  pauseGame(): void {
    if (this.game) {
      this.game.scene.pause(this.currentScene);
    }
  }

  resumeGame(): void {
    if (this.game) {
      this.game.scene.resume(this.currentScene);
    }
  }

  getSceneData(sceneKey: string): any {
    if (!this.game) return null;

    const scene = this.game.scene.getScene(sceneKey);
    return scene ? scene.data : null;
  }

  setSceneData(sceneKey: string, data: any): void {
    if (!this.game) return;

    const scene = this.game.scene.getScene(sceneKey);
    if (scene) {
      scene.data = { ...scene.data, ...data };
    }
  }
}