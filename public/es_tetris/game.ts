const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
}

// --------------------------------------------------------------------------
// 1. Interfaces & Types
// --------------------------------------------------------------------------

interface ImageAssetConfig { name: string; path: string; width: number; height: number; }
interface SoundAssetConfig { name: string; path: string; duration_seconds: number; volume: number; }

interface GameConfig {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        playerBulletCooldown: number; // ms
        enemySpawnRate: number;     // ms
        enemyMoveSpeedMin: number;  // px/sec
        enemyMoveSpeedMax: number;  // px/sec
        enemyHealth: number;
        playerSpeed: number;        // px/sec
        playerHealth: number;
        playerBulletSpeed: number;  // px/sec
        playerBulletDamage: number;
        gameOverDelay: number;      // ms
    };
    player: { width: number; height: number; imageKey: string; };
    enemy: { width: number; height: number; imageKey: string; scoreValue: number; };
    playerBullet: { width: number; height: number; imageKey: string; };
    uiText: {
        title: string;
        pressToStart: string;
        gameOver: string;
        pressToRetry: string;
        scorePrefix: string;
        healthPrefix: string;
    };
    assets: {
        images: ImageAssetConfig[];
        sounds: SoundAssetConfig[];
    };
}

type LoadedImage = HTMLImageElement;
type LoadedSound = HTMLAudioElement; // For reference, actual sounds are managed by SoundPlayer
type Assets = {
    images: Map<string, LoadedImage>;
    // sounds: Map<string, LoadedSound>; // SoundPlayer manages sounds internally
};

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

// --------------------------------------------------------------------------
// 2. Input Manager (Singleton)
// --------------------------------------------------------------------------

class InputManager {
    private static instance: InputManager;
    private keysPressed: Set<string> = new Set();

    private constructor() {
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
    }

    public static getInstance(): InputManager {
        if (!InputManager.instance) {
            InputManager.instance = new InputManager();
        }
        return InputManager.instance;
    }

    private onKeyDown(event: KeyboardEvent): void {
        this.keysPressed.add(event.code);
    }

    private onKeyUp(event: KeyboardEvent): void {
        this.keysPressed.delete(event.code);
    }

    public isKeyPressed(keyCode: string): boolean {
        return this.keysPressed.has(keyCode);
    }
}
const inputManager = InputManager.getInstance(); // Global input manager

// --------------------------------------------------------------------------
// 3. Sound Player
// --------------------------------------------------------------------------

class SoundPlayer {
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private bgmAudio: HTMLAudioElement | null = null;

    public async loadSounds(soundConfigs: SoundAssetConfig[]): Promise<void> {
        const promises = soundConfigs.map(config => {
            return new Promise<void>(resolve => {
                const audio = new Audio(config.path);
                audio.volume = config.volume;
                // Preload metadata to ensure volume is set before first play
                audio.load();
                this.sounds.set(config.name, audio);
                resolve();
            });
        });
        await Promise.all(promises);
    }

    public playSound(name: string, loop: boolean = false): void {
        const audioTemplate = this.sounds.get(name);
        if (audioTemplate) {
            // Clone the audio element for effects to allow overlapping playback
            const audio = audioTemplate.cloneNode() as HTMLAudioElement;
            audio.volume = audioTemplate.volume; // Ensure volume from config is applied
            audio.loop = loop;
            audio.currentTime = 0; // Reset to start
            audio.play().catch(e => console.warn(`Failed to play sound '${name}':`, e));

            if (loop) {
                if (this.bgmAudio) {
                    this.bgmAudio.pause(); // Stop previous BGM if any
                    this.bgmAudio.currentTime = 0;
                }
                this.bgmAudio = audio;
            }
        } else {
            console.warn(`Sound '${name}' not found.`);
        }
    }

    public stopBGM(): void {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio = null;
        }
    }

    // This method is primarily for the Game class to know which sounds are available,
    // though SoundPlayer manages playing directly.
    public getLoadedSounds(): Map<string, HTMLAudioElement> {
        return this.sounds;
    }
}

// --------------------------------------------------------------------------
// 4. Game Objects
// --------------------------------------------------------------------------

abstract class GameObject {
    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number,
        public imageKey: string,
        public health: number = 1,
        public active: boolean = true
    ) {}

    abstract update(deltaTime: number): void;

    draw(ctx: CanvasRenderingContext2D, assets: Assets): void {
        if (!this.active) return;
        const image = assets.images.get(this.imageKey);
        if (image) {
            // Draw image scaled to object's width/height
            ctx.drawImage(image, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        } else {
            // Fallback: draw a colored rectangle if image not found
            ctx.fillStyle = 'fuchsia';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
            ctx.strokeStyle = 'white';
            ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
    }

    isCollidingWith(other: GameObject): boolean {
        if (!this.active || !other.active) return false;
        return (
            this.x - this.width / 2 < other.x + other.width / 2 &&
            this.x + this.width / 2 > other.x - other.width / 2 &&
            this.y - this.height / 2 < other.y + other.height / 2 &&
            this.y + this.height / 2 > other.y - other.height / 2
        );
    }
}

class Player extends GameObject {
    speed: number;
    maxHealth: number;
    lastShotTime: number = 0;

    constructor(x: number, y: number, width: number, height: number, imageKey: string, speed: number, health: number) {
        super(x, y, width, height, imageKey, health);
        this.speed = speed;
        this.maxHealth = health;
    }

    update(deltaTime: number): void {
        if (inputManager.isKeyPressed('ArrowLeft') || inputManager.isKeyPressed('KeyA')) {
            this.x -= this.speed * deltaTime;
        }
        if (inputManager.isKeyPressed('ArrowRight') || inputManager.isKeyPressed('KeyD')) {
            this.x += this.speed * deltaTime;
        }

        // Keep player within canvas bounds
        this.x = Math.max(this.width / 2, Math.min(ctx.canvas.width - this.width / 2, this.x));
        this.y = Math.max(this.height / 2, Math.min(ctx.canvas.height - this.height / 2, this.y));
    }
}

class Bullet extends GameObject {
    speed: number;
    damage: number;
    directionY: number; // 1 for down, -1 for up

    constructor(x: number, y: number, width: number, height: number, imageKey: string, speed: number, damage: number, directionY: number) {
        super(x, y, width, height, imageKey, 1); // Bullets have 1 health, destroyed on hit
        this.speed = speed;
        this.damage = damage;
        this.directionY = directionY;
    }

    update(deltaTime: number): void {
        this.y += this.speed * this.directionY * deltaTime;

        // Deactivate if off-screen
        if (this.y < -this.height / 2 || this.y > ctx.canvas.height + this.height / 2) {
            this.active = false;
        }
    }
}

class Enemy extends GameObject {
    speed: number;
    scoreValue: number;

    constructor(x: number, y: number, width: number, height: number, imageKey: string, speed: number, health: number, scoreValue: number) {
        super(x, y, width, height, imageKey, health);
        this.speed = speed;
        this.scoreValue = scoreValue;
    }

    update(deltaTime: number): void {
        this.y += this.speed * deltaTime;

        // Deactivate if off-screen
        if (this.y > ctx.canvas.height + this.height / 2) {
            this.active = false;
        }
    }
}

// --------------------------------------------------------------------------
// 5. Game Core
// --------------------------------------------------------------------------

class Game {
    private config!: GameConfig;
    private assets!: Assets;
    private ctx: CanvasRenderingContext2D;
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    private soundPlayer: SoundPlayer; // Instance of SoundPlayer

    private gameState: GameState = GameState.TITLE;
    private lastFrameTime: number = 0;
    private score: number = 0;
    private player!: Player;
    private enemies: Enemy[] = [];
    private playerBullets: Bullet[] = [];
    private lastEnemySpawnTime: number = 0;
    private lastGameOverTime: number = 0;

    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;
        this.soundPlayer = new SoundPlayer();
    }

    private async loadConfig(): Promise<GameConfig> {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        return response.json();
    }

    private async loadAssets(config: GameConfig): Promise<Assets> {
        const imagePromises = config.assets.images.map(img => {
            return new Promise<[string, LoadedImage]>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => resolve([img.name, image]);
                image.onerror = () => reject(`Failed to load image: ${img.path}`);
            });
        });

        const loadedImages = await Promise.all(imagePromises);
        const imagesMap = new Map<string, LoadedImage>(loadedImages);

        await this.soundPlayer.loadSounds(config.assets.sounds);

        return {
            images: imagesMap,
        };
    }

    public async init(): Promise<void> {
        try {
            this.config = await this.loadConfig();
            this.canvasWidth = this.config.gameSettings.canvasWidth;
            this.canvasHeight = this.config.gameSettings.canvasHeight;
            this.ctx.canvas.width = this.canvasWidth;
            this.ctx.canvas.height = this.canvasHeight;

            this.assets = await this.loadAssets(this.config);
            console.log('Game initialized with config and assets:', this.config, this.assets);

            this.soundPlayer.playSound('title_bgm', true); // Start title screen BGM

            // Start game loop
            requestAnimationFrame(this.loop.bind(this));
        } catch (error) {
            console.error("Game initialization failed:", error);
            // Display an error message on canvas
            this.ctx.fillStyle = 'white';
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`Error: ${error}`, this.canvasWidth / 2, this.canvasHeight / 2);
        }
    }

    private startGame(): void {
        this.score = 0;
        this.enemies = [];
        this.playerBullets = [];
        this.player = new Player(
            this.canvasWidth / 2,
            this.canvasHeight - this.config.player.height / 2 - 10, // Position player slightly above bottom edge
            this.config.player.width,
            this.config.player.height,
            this.config.player.imageKey,
            this.config.gameSettings.playerSpeed,
            this.config.gameSettings.playerHealth
        );
        this.lastEnemySpawnTime = performance.now();
        this.player.lastShotTime = performance.now();
        this.gameState = GameState.PLAYING;
        this.soundPlayer.stopBGM(); // Stop title BGM
        this.soundPlayer.playSound('bgm', true); // Start game BGM
    }

    private resetGame(): void {
        this.gameState = GameState.TITLE;
        this.soundPlayer.stopBGM();
        this.soundPlayer.playSound('title_bgm', true); // Play title BGM
    }

    private update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.TITLE:
                if (inputManager.isKeyPressed('Enter')) {
                    this.startGame();
                }
                break;
            case GameState.PLAYING:
                this.player.update(deltaTime);

                // Handle player shooting
                if (inputManager.isKeyPressed('Space') && (performance.now() - this.player.lastShotTime > this.config.gameSettings.playerBulletCooldown)) {
                    this.playerBullets.push(new Bullet(
                        this.player.x,
                        this.player.y - this.player.height / 2, // From top of player
                        this.config.playerBullet.width,
                        this.config.playerBullet.height,
                        this.config.playerBullet.imageKey,
                        this.config.gameSettings.playerBulletSpeed,
                        this.config.gameSettings.playerBulletDamage,
                        -1 // Upwards
                    ));
                    this.soundPlayer.playSound('player_shoot_effect');
                    this.player.lastShotTime = performance.now();
                }

                // Update and filter bullets
                this.playerBullets.forEach(bullet => bullet.update(deltaTime));
                this.playerBullets = this.playerBullets.filter(bullet => bullet.active);

                // Update and filter enemies
                this.enemies.forEach(enemy => enemy.update(deltaTime));
                this.enemies = this.enemies.filter(enemy => enemy.active);

                // Enemy Spawning
                if (performance.now() - this.lastEnemySpawnTime > this.config.gameSettings.enemySpawnRate) {
                    const enemyX = Math.random() * (this.canvasWidth - this.config.enemy.width) + this.config.enemy.width / 2;
                    const enemySpeed = Math.random() * (this.config.gameSettings.enemyMoveSpeedMax - this.config.gameSettings.enemyMoveSpeedMin) + this.config.gameSettings.enemyMoveSpeedMin;
                    this.enemies.push(new Enemy(
                        enemyX,
                        -this.config.enemy.height / 2, // Start off-screen top
                        this.config.enemy.width,
                        this.config.enemy.height,
                        this.config.enemy.imageKey,
                        enemySpeed,
                        this.config.gameSettings.enemyHealth,
                        this.config.enemy.scoreValue
                    ));
                    this.lastEnemySpawnTime = performance.now();
                }

                // Collision Detection: Player Bullets vs Enemies
                this.playerBullets.forEach(bullet => {
                    this.enemies.forEach(enemy => {
                        if (bullet.active && enemy.active && bullet.isCollidingWith(enemy)) {
                            bullet.active = false;
                            enemy.health -= bullet.damage;
                            this.soundPlayer.playSound('enemy_hit_effect');
                            if (enemy.health <= 0) {
                                enemy.active = false;
                                this.score += enemy.scoreValue;
                                this.soundPlayer.playSound('enemy_destroy_effect');
                            }
                        }
                    });
                });

                // Collision Detection: Player vs Enemies
                this.enemies.forEach(enemy => {
                    if (enemy.active && this.player.active && this.player.isCollidingWith(enemy)) {
                        enemy.active = false; // Enemy is destroyed on collision with player
                        this.player.health--;
                        this.soundPlayer.playSound('player_hit_effect');
                        if (this.player.health <= 0) {
                            this.player.active = false;
                            this.gameState = GameState.GAME_OVER;
                            this.lastGameOverTime = performance.now();
                            this.soundPlayer.stopBGM();
                            this.soundPlayer.playSound('game_over_bgm');
                        }
                    }
                });

                break;
            case GameState.GAME_OVER:
                if (performance.now() - this.lastGameOverTime > this.config.gameSettings.gameOverDelay && inputManager.isKeyPressed('Enter')) {
                    this.resetGame();
                }
                break;
        }
    }

    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.fillStyle = 'black'; // Background color
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                this.drawPlayingScreen();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.uiText.title, this.canvasWidth / 2, this.canvasHeight / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.uiText.pressToStart, this.canvasWidth / 2, this.canvasHeight / 2 + 20);
    }

    private drawPlayingScreen(): void {
        // Draw Player
        if (this.player.active) {
            this.player.draw(this.ctx, this.assets);
        }

        // Draw Player Bullets
        this.playerBullets.forEach(bullet => bullet.draw(this.ctx, this.assets));

        // Draw Enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx, this.assets));

        // Draw UI: Score and Health
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${this.config.uiText.scorePrefix}${this.score}`, 10, 30);
        this.ctx.fillText(`${this.config.uiText.healthPrefix}${this.player.health}`, 10, 60);
    }

    private drawGameOverScreen(): void {
        this.drawPlayingScreen(); // Draw the last frame of gameplay behind the overlay

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent overlay
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.uiText.gameOver, this.canvasWidth / 2, this.canvasHeight / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(`${this.config.uiText.scorePrefix}${this.score}`, this.canvasWidth / 2, this.canvasHeight / 2);
        this.ctx.fillText(this.config.uiText.pressToRetry, this.canvasWidth / 2, this.canvasHeight / 2 + 50);
    }

    public loop(currentTime: number): void {
        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
        this.lastFrameTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.loop.bind(this));
    }
}

// Initialize and start the game
const game = new Game(ctx);
game.init();