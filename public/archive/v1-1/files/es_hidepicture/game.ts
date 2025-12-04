interface ImageDataConfig {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundDataConfig {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    playerSpeed: number;
    playerWidth: number;
    playerHeight: number;
    initialLives: number;
    collectibleSpeedMin: number;
    collectibleSpeedMax: number;
    collectibleWidth: number;
    collectibleHeight: number;
    collectibleSpawnIntervalMin: number;
    collectibleSpawnIntervalMax: number;
    scorePerCollectible: number;
    titleScreenText: string;
    gameOverScreenText: string;
    fontFamily: string;
    textColor: string;
}

interface GameData {
    assets: {
        images: ImageDataConfig[];
        sounds: SoundDataConfig[];
    };
    gameSettings: GameSettings;
}

enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
}

abstract class GameObject {
    constructor(public x: number, public y: number, public width: number, public height: number, public imageKey: string) {}

    abstract update(deltaTime: number): void;
    abstract draw(ctx: CanvasRenderingContext2D, imageCache: Map<string, HTMLImageElement>): void;

    collidesWith(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

class Player extends GameObject {
    speed: number;
    score: number;
    lives: number;
    movingLeft: boolean = false;
    movingRight: boolean = false;

    constructor(x: number, y: number, width: number, height: number, imageKey: string, speed: number, initialLives: number) {
        super(x, y, width, height, imageKey);
        this.speed = speed;
        this.score = 0;
        this.lives = initialLives;
    }

    update(deltaTime: number, canvasWidth: number): void {
        if (this.movingLeft) {
            this.x -= this.speed * (deltaTime / 1000);
        }
        if (this.movingRight) {
            this.x += this.speed * (deltaTime / 1000);
        }

        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvasWidth) this.x = canvasWidth - this.width;
    }

    draw(ctx: CanvasRenderingContext2D, imageCache: Map<string, HTMLImageElement>): void {
        const image = imageCache.get(this.imageKey);
        if (image) {
            ctx.drawImage(image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'blue';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Collectible extends GameObject {
    velocityY: number;
    constructor(x: number, y: number, width: number, height: number, imageKey: string, velocityY: number) {
        super(x, y, width, height, imageKey);
        this.velocityY = velocityY;
    }

    update(deltaTime: number): void {
        this.y += this.velocityY * (deltaTime / 1000);
    }

    draw(ctx: CanvasRenderingContext2D, imageCache: Map<string, HTMLImageElement>): void {
        const image = imageCache.get(this.imageKey);
        if (image) {
            ctx.drawImage(image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'green';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gameData!: GameData;
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private audioCache: Map<string, HTMLAudioElement> = new Map();
    private gameState: GameState = GameState.LOADING;

    private player!: Player;
    private collectibles: Collectible[] = [];
    private lastTime: DOMHighResTimeStamp = 0;
    private lastCollectibleSpawnTime: DOMHighResTimeStamp = 0;
    private nextCollectibleSpawnInterval: number = 0; // ms

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;

        this.setupEventListeners();
        this.loadGameDataAndAssets().then(() => {
            this.initGame();
            this.gameLoop(0); // Start the game loop after initialization
        }).catch(error => {
            console.error("Failed to load game data or assets:", error);
            // Ensure canvas has some dimensions for error message if not loaded from data.json
            if (this.canvas.width === 0 || this.canvas.height === 0) {
                this.canvas.width = 800; // Default width
                this.canvas.height = 600; // Default height
            }
            this.ctx.fillStyle = 'red';
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText("Error loading game. Check console.", this.canvas.width / 2, this.canvas.height / 2);
        });
    }

    private async loadGameDataAndAssets(): Promise<void> {
        const response = await fetch('data.json');
        this.gameData = await response.json();

        // Runtime validation for essential gameSettings and asset arrays
        if (!this.gameData ||
            !this.gameData.gameSettings ||
            typeof this.gameData.gameSettings.canvasWidth !== 'number' ||
            typeof this.gameData.gameSettings.canvasHeight !== 'number' ||
            !Array.isArray(this.gameData.assets?.images) || // Check if assets and images array exist
            !Array.isArray(this.gameData.assets?.sounds)    // Check if assets and sounds array exist
        ) {
            console.error("Malformed data.json:", this.gameData);
            throw new Error("Invalid or incomplete game data found in data.json.");
        }

        this.canvas.width = this.gameData.gameSettings.canvasWidth;
        this.canvas.height = this.gameData.gameSettings.canvasHeight;

        await Promise.all([
            this.loadImages(this.gameData.assets.images ?? []), // Use nullish coalescing to ensure an array
            this.loadSounds(this.gameData.assets.sounds ?? [])  // Use nullish coalescing to ensure an array
        ]);
    }

    private loadImages(imageConfigs: ImageDataConfig[]): Promise<void[]> {
        const imagePromises = imageConfigs.map(config => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = config.path;
                img.onload = () => {
                    this.imageCache.set(config.name, img);
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Failed to load image: ${config.path}`);
                    reject(new Error(`Failed to load image: ${config.path}`));
                };
            });
        });
        return Promise.all(imagePromises);
    }

    private loadSounds(soundConfigs: SoundDataConfig[]): Promise<void[]> {
        const soundPromises = soundConfigs.map(config => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = config.path;
                audio.volume = config.volume;
                audio.oncanplaythrough = () => {
                    this.audioCache.set(config.name, audio);
                    resolve();
                };
                audio.onerror = () => {
                    console.warn(`Failed to load sound: ${config.path}`);
                    reject(new Error(`Failed to load sound: ${config.path}`));
                };
            });
        });
        return Promise.all(soundPromises);
    }

    private playSound(name: string, loop: boolean = false): void {
        const audio = this.audioCache.get(name);
        if (audio) {
            audio.currentTime = 0;
            audio.loop = loop;
            audio.play().catch(e => console.warn(`Error playing sound ${name}:`, e));
        } else {
            console.warn(`Sound '${name}' not found in cache.`);
        }
    }

    private initGame(): void {
        this.gameState = GameState.TITLE;
        this.setupNewGame();
        // BGM is now started only after user input (SPACE) in startGame()
    }

    private setupNewGame(): void {
        const { gameSettings } = this.gameData;
        this.player = new Player(
            (this.canvas.width - gameSettings.playerWidth) / 2,
            this.canvas.height - gameSettings.playerHeight - 10,
            gameSettings.playerWidth,
            gameSettings.playerHeight,
            'player',
            gameSettings.playerSpeed,
            gameSettings.initialLives
        );
        this.collectibles = [];
        this.lastCollectibleSpawnTime = 0;
        this.setNextCollectibleSpawnInterval();
    }

    private setNextCollectibleSpawnInterval(): void {
        const { collectibleSpawnIntervalMin, collectibleSpawnIntervalMax } = this.gameData.gameSettings;
        this.nextCollectibleSpawnInterval = Math.random() * (collectibleSpawnIntervalMax - collectibleSpawnIntervalMin) + collectibleSpawnIntervalMin;
    }

    private setupEventListeners(): void {
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (this.gameState === GameState.TITLE || this.gameState === GameState.GAME_OVER) {
            if (event.code === 'Space') {
                this.startGame();
            }
        } else if (this.gameState === GameState.PLAYING) {
            if (event.key === 'ArrowLeft' || event.key === 'a') {
                this.player.movingLeft = true;
            } else if (event.key === 'ArrowRight' || event.key === 'd') {
                this.player.movingRight = true;
            }
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        if (this.gameState === GameState.PLAYING) {
            if (event.key === 'ArrowLeft' || event.key === 'a') {
                this.player.movingLeft = false;
            } else if (event.key === 'ArrowRight' || event.key === 'd') {
                this.player.movingRight = false;
            }
        }
    }

    private startGame(): void {
        if (this.gameState === GameState.TITLE || this.gameState === GameState.GAME_OVER) {
            this.setupNewGame();
            this.player.score = 0;
            this.player.lives = this.gameData.gameSettings.initialLives;
            this.gameState = GameState.PLAYING;
            this.lastTime = performance.now();
            this.playSound('bgm', true); // BGM starts here, after user input
        }
    }

    private gameOver(): void {
        this.gameState = GameState.GAME_OVER;
        this.player.movingLeft = false;
        this.player.movingRight = false;
    }

    private gameLoop(timestamp: DOMHighResTimeStamp): void {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number): void {
        if (this.gameState === GameState.PLAYING) {
            const { gameSettings } = this.gameData;

            this.player.update(deltaTime, this.canvas.width);

            this.lastCollectibleSpawnTime += deltaTime;
            if (this.lastCollectibleSpawnTime >= this.nextCollectibleSpawnInterval) {
                const randomX = Math.random() * (this.canvas.width - gameSettings.collectibleWidth);
                const randomVelocityY = Math.random() * (gameSettings.collectibleSpeedMax - gameSettings.collectibleSpeedMin) + gameSettings.collectibleSpeedMin;
                this.collectibles.push(new Collectible(
                    randomX,
                    -gameSettings.collectibleHeight,
                    gameSettings.collectibleWidth,
                    gameSettings.collectibleHeight,
                    'collectible',
                    randomVelocityY
                ));
                this.lastCollectibleSpawnTime = 0;
                this.setNextCollectibleSpawnInterval();
            }

            for (let i = this.collectibles.length - 1; i >= 0; i--) {
                const collectible = this.collectibles[i];
                collectible.update(deltaTime);

                if (this.player.collidesWith(collectible)) {
                    this.player.score += gameSettings.scorePerCollectible;
                    this.playSound('collect');
                    this.collectibles.splice(i, 1);
                }
                else if (collectible.y > this.canvas.height) {
                    this.player.lives--;
                    this.playSound('miss');
                    this.collectibles.splice(i, 1);
                    if (this.player.lives <= 0) {
                        this.gameOver();
                    }
                }
            }
        }
    }

    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { gameSettings } = this.gameData;
        this.ctx.font = `24px ${gameSettings.fontFamily}`;
        this.ctx.fillStyle = gameSettings.textColor;
        this.ctx.textAlign = 'center';

        if (this.gameState === GameState.LOADING) {
            this.ctx.fillText("Loading...", this.canvas.width / 2, this.canvas.height / 2);
        } else if (this.gameState === GameState.TITLE) {
            this.drawText(gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2);
        } else if (this.gameState === GameState.PLAYING) {
            this.player.draw(this.ctx, this.imageCache);
            this.collectibles.forEach(collectible => collectible.draw(this.ctx, this.imageCache));

            this.ctx.textAlign = 'left';
            this.ctx.fillText(`Score: ${this.player.score}`, 10, 30);
            this.ctx.textAlign = 'right';
            this.ctx.fillText(`Lives: ${this.player.lives}`, this.canvas.width - 10, 30);
        } else if (this.gameState === GameState.GAME_OVER) {
            const gameOverText = gameSettings.gameOverScreenText.replace('{score}', this.player.score.toString());
            this.drawText(gameOverText, this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    private drawText(text: string, x: number, y: number): void {
        const lines = text.split('\n');
        const lineHeight = 30; // Approx line height based on 24px font
        let currentY = y - (lines.length - 1) * lineHeight / 2;

        for (const line of lines) {
            this.ctx.fillText(line, x, currentY);
            currentY += lineHeight;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Game('gameCanvas');
});