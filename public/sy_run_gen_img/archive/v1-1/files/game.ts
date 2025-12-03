interface GameConfig {
    canvas: { width: number; height: number; };
    player: PlayerConfig;
    gameplay: GameplayConfig;
    parallax: ParallaxLayerConfig[];
    ground: GroundConfig;
    obstacles: ObstacleConfig[];
    collectibles: CollectibleConfig[];
    ui: UIConfig;
    assets: { images: ImageAsset[]; sounds: SoundAsset[]; };
}

interface ImageAsset {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface PlayerConfig {
    x: number;
    y: number; // Initial Y position (grounded)
    width: number;
    height: number;
    jumpHeight: number;
    slideHeight: number;
    gravity: number;
    jumpForce: number;
    slideDuration: number;
    animationSpeed: number; // Time per frame in seconds
    runningFrames: string[];
    jumpingFrame: string;
    slidingFrame: string;
    invincibilityDuration: number; // Duration of invincibility after hit
    blinkFrequency: number; // How often player blinks during invincibility
    lives: number;
}

interface GameplayConfig {
    initialGameSpeed: number;
    maxGameSpeed: number;
    speedIncreaseRate: number; // Speed increase per second
    obstacleSpawnIntervalMin: number; // Min time before next obstacle spawn
    obstacleSpawnIntervalMax: number; // Max time before next obstacle spawn
    collectibleSpawnChance: number; // Probability to spawn a collectible with an obstacle
    collectibleSpawnOffsetMin: number; // Y offset from ground for collectible
    collectibleSpawnOffsetMax: number; // Y offset from ground for collectible
    scorePerSecond: number;
    obstacleDamage: number; // How much damage an obstacle does
}

interface ParallaxLayerConfig {
    image: string;
    speedMultiplier: number;
    yOffset: number; // Y position relative to canvas top
    height: number; // Height to draw the image
}

interface GroundConfig {
    image: string;
    y: number; // Y position of the top of the ground
    height: number; // Height to draw the ground image
}

interface ObstacleConfig {
    name: string;
    image: string;
    width: number;
    height: number;
    yOffset: number; // Y offset from ground
}

interface CollectibleConfig {
    name: string;
    image: string;
    width: number;
    height: number;
    scoreValue: number;
}

interface UIConfig {
    font: string;
    textColor: string;
    titleMessage: string;
    controlsMessage: string;
    startMessage: string;
    gameOverMessage: string;
    restartMessage: string;
}

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Utility function for AABB collision detection
function checkCollision(rect1: Rect, rect2: Rect): boolean {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Asset Loader Class
class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private loadedCount: number = 0;
    private totalCount: number = 0;
    private onProgress?: (progress: number) => void;

    constructor(onProgress?: (progress: number) => void) {
        this.onProgress = onProgress;
    }

    async load(imageAssets: ImageAsset[], soundAssets: SoundAsset[]): Promise<void> {
        this.totalCount = imageAssets.length + soundAssets.length;
        if (this.totalCount === 0) {
            this.onProgress?.(1);
            return Promise.resolve();
        }

        const imagePromises = imageAssets.map(asset => this.loadImage(asset));
        const soundPromises = soundAssets.map(asset => this.loadSound(asset));

        await Promise.allSettled([...imagePromises, ...soundPromises]);
        this.onProgress?.(1); // Ensure progress is 1 at the end
    }

    private updateProgress() {
        this.loadedCount++;
        this.onProgress?.(this.progress);
    }

    private loadImage(asset: ImageAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(asset.name, img);
                this.updateProgress();
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${asset.path}`);
                this.updateProgress(); // Still count as loaded to avoid blocking
                resolve(); // Resolve anyway to allow other assets to load
            };
            img.src = asset.path;
        });
    }

    private loadSound(asset: SoundAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            // Using oncanplaythrough ensures the entire sound can play without interruption
            audio.oncanplaythrough = () => {
                audio.volume = asset.volume;
                this.sounds.set(asset.name, audio);
                this.updateProgress();
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${asset.path}`);
                this.updateProgress(); // Still count as loaded
                resolve(); // Resolve anyway
            };
            audio.src = asset.path;
            audio.load(); // Explicitly load for some browsers
        });
    }

    getImage(name: string): HTMLImageElement {
        const img = this.images.get(name);
        if (!img) {
            console.warn(`Image "${name}" not found in assets. Returning a dummy image.`);
            const dummy = new Image();
            dummy.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="; // Transparent 1x1 GIF
            return dummy;
        }
        return img;
    }

    getSound(name: string): HTMLAudioElement {
        const sound = this.sounds.get(name);
        if (!sound) {
            console.warn(`Sound "${name}" not found in assets. Returning a dummy Audio.`);
            return new Audio(); // Return a silent audio object
        }
        return sound;
    }

    get progress(): number {
        return this.totalCount > 0 ? this.loadedCount / this.totalCount : 1;
    }
}

// Game State Enum
enum GameState {
    LOADING,
    TITLE,
    CONTROLS,
    PLAYING,
    GAME_OVER
}

// Player States
enum PlayerAnimationState {
    RUNNING,
    JUMPING,
    SLIDING
}

// Player Class
class Player {
    x: number;
    y: number;
    width: number;
    height: number;
    baseY: number; // Y position when on ground with initial height
    initialHeight: number; // Player's height when running
    velocityY: number = 0;
    onGround: boolean = true;
    animationState: PlayerAnimationState = PlayerAnimationState.RUNNING;
    currentAnimationFrame: number = 0;
    animationTimer: number = 0;
    slideTimer: number = 0;
    isInvincible: boolean = false;
    invincibleTimer: number = 0;
    blinkTimer: number = 0;
    lives: number;

    constructor(private config: PlayerConfig, private assetLoader: AssetLoader, groundY: number) {
        this.x = config.x;
        this.y = config.y;
        this.width = config.width;
        this.height = config.height;
        this.initialHeight = config.height;
        this.baseY = groundY - config.height; // Calculate base Y based on ground
        this.y = this.baseY; // Start on the ground
        this.lives = config.lives;
    }

    jump(): boolean {
        if (this.onGround && this.animationState !== PlayerAnimationState.SLIDING) {
            this.velocityY = -this.config.jumpForce;
            this.onGround = false;
            this.animationState = PlayerAnimationState.JUMPING;
            this.animationTimer = 0; // Reset animation for jump frame
            return true;
        }
        return false;
    }

    slide(): boolean {
        if (this.onGround && this.animationState !== PlayerAnimationState.JUMPING && this.animationState !== PlayerAnimationState.SLIDING) {
            this.animationState = PlayerAnimationState.SLIDING;
            this.height = this.config.slideHeight;
            // Adjust Y to keep bottom of player at ground level
            this.y = this.baseY + (this.initialHeight - this.config.slideHeight);
            this.slideTimer = this.config.slideDuration;
            this.animationTimer = 0; // Reset animation for slide frame
            return true;
        }
        return false;
    }

    update(deltaTime: number, groundY: number) {
        // Handle gravity
        if (!this.onGround) {
            this.velocityY += this.config.gravity * deltaTime;
        }
        this.y += this.velocityY * deltaTime;

        // Check for landing on ground
        if (this.y + this.height >= groundY) {
            this.y = groundY - this.height;
            if (!this.onGround) {
                this.onGround = true;
                this.velocityY = 0;
                if (this.animationState === PlayerAnimationState.JUMPING) {
                    this.animationState = PlayerAnimationState.RUNNING; // Landed, go back to running
                    this.height = this.initialHeight; // Reset height
                    this.y = this.baseY; // Re-align player to ground after jump
                }
            }
        }

        // Handle sliding duration
        if (this.animationState === PlayerAnimationState.SLIDING) {
            this.slideTimer -= deltaTime;
            if (this.slideTimer <= 0) {
                this.animationState = PlayerAnimationState.RUNNING;
                this.height = this.initialHeight; // Reset height after sliding
                this.y = this.baseY; // Reset Y position
            }
        }

        // Handle running animation frame update
        this.animationTimer += deltaTime;
        if (this.animationState === PlayerAnimationState.RUNNING && this.animationTimer >= this.config.animationSpeed) {
            this.currentAnimationFrame = (this.currentAnimationFrame + 1) % this.config.runningFrames.length;
            this.animationTimer = 0;
        }

        // Handle invincibility
        if (this.isInvincible) {
            this.invincibleTimer -= deltaTime;
            this.blinkTimer += deltaTime;
            if (this.invincibleTimer <= 0) {
                this.isInvincible = false;
                this.invincibleTimer = 0;
                this.blinkTimer = 0;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.isInvincible && Math.floor(this.blinkTimer * this.config.blinkFrequency) % 2 === 0) {
            return; // Blink effect: skip drawing
        }

        let image;
        switch (this.animationState) {
            case PlayerAnimationState.JUMPING:
                image = this.assetLoader.getImage(this.config.jumpingFrame);
                break;
            case PlayerAnimationState.SLIDING:
                image = this.assetLoader.getImage(this.config.slidingFrame);
                break;
            case PlayerAnimationState.RUNNING:
            default:
                image = this.assetLoader.getImage(this.config.runningFrames[this.currentAnimationFrame]);
                break;
        }
        ctx.drawImage(image, this.x, this.y, this.width, this.height);
    }

    getCollisionRect(): Rect {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    hit(damage: number): boolean {
        if (!this.isInvincible) {
            this.lives -= damage;
            this.isInvincible = true;
            this.invincibleTimer = this.config.invincibilityDuration;
            this.blinkTimer = 0;
            return true; // Player was hit and took damage
        }
        return false; // Player was invincible
    }

    reset() {
        this.x = this.config.x;
        this.y = this.baseY;
        this.width = this.config.width;
        this.height = this.initialHeight;
        this.velocityY = 0;
        this.onGround = true;
        this.animationState = PlayerAnimationState.RUNNING;
        this.currentAnimationFrame = 0;
        this.animationTimer = 0;
        this.slideTimer = 0;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.blinkTimer = 0;
        this.lives = this.config.lives;
    }
}

// Parallax Layer Class
class ParallaxLayer {
    x: number = 0;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
    speed: number; // Calculated based on game speed and multiplier

    constructor(private config: ParallaxLayerConfig, private assetLoader: AssetLoader, canvasWidth: number) {
        this.image = this.assetLoader.getImage(config.image);
        this.y = config.yOffset;
        this.height = config.height;
        // Image width should ideally be canvasWidth or a multiple for seamless tiling
        // For simplicity, we assume image.width will be used and drawn twice.
        this.width = this.image.width; // Use actual image width for calculation
        if (this.width === 0) { // Fallback for unloaded image
            this.width = canvasWidth;
        }
        this.speed = 0; // Will be updated by game logic
    }

    update(deltaTime: number, gameSpeed: number) {
        this.speed = gameSpeed * this.config.speedMultiplier;
        this.x -= this.speed * deltaTime;
        if (this.x <= -this.width) {
            this.x += this.width;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        // Draw the image twice to create a seamless loop
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
        // If image is smaller than canvas, draw again to fill potentially empty space
        if (this.width < ctx.canvas.width) {
            ctx.drawImage(this.image, this.x + this.width * 2, this.y, this.width, this.height);
        }
    }
}

// Ground Class
class Ground {
    x: number = 0;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
    speed: number; // Same as game speed

    constructor(private config: GroundConfig, private assetLoader: AssetLoader, canvasWidth: number) {
        this.image = this.assetLoader.getImage(config.image);
        this.y = config.y;
        this.height = config.height;
        this.width = this.image.width;
        if (this.width === 0) { // Fallback for unloaded image
            this.width = canvasWidth;
        }
        this.speed = 0;
    }

    update(deltaTime: number, gameSpeed: number) {
        this.speed = gameSpeed;
        this.x -= this.speed * deltaTime;
        if (this.x <= -this.width) {
            this.x += this.width;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
    }

    getCollisionRect(): Rect {
        return { x: this.x, y: this.y, width: this.width * 2, height: this.height }; // Ground is effectively endless
    }
}

// Obstacle Class
class Obstacle {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
    active: boolean = false;
    collided: boolean = false; // To prevent multiple collision checks

    constructor(private config: ObstacleConfig, private assetLoader: AssetLoader, groundY: number, initialX: number) {
        this.image = this.assetLoader.getImage(config.image);
        this.width = config.width;
        this.height = config.height;
        this.x = initialX;
        this.y = groundY - config.yOffset - this.height;
    }

    update(deltaTime: number, gameSpeed: number) {
        this.x -= gameSpeed * deltaTime;
        if (this.x + this.width < 0) {
            this.active = false;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.active) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        }
    }

    getCollisionRect(): Rect {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    reset(newX: number) {
        this.x = newX;
        this.active = true;
        this.collided = false;
    }
}

// Collectible Class
class Collectible {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
    active: boolean = false;
    collected: boolean = false;
    scoreValue: number;

    constructor(private config: CollectibleConfig, private assetLoader: AssetLoader, initialX: number, initialY: number) {
        this.image = this.assetLoader.getImage(config.image);
        this.width = config.width;
        this.height = config.height;
        this.x = initialX;
        this.y = initialY;
        this.scoreValue = config.scoreValue;
    }

    update(deltaTime: number, gameSpeed: number) {
        this.x -= gameSpeed * deltaTime;
        if (this.x + this.width < 0) {
            this.active = false;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.active && !this.collected) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        }
    }

    getCollisionRect(): Rect {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    reset(newX: number, newY: number) {
        this.x = newX;
        this.y = newY;
        this.active = true;
        this.collected = false;
    }
}


// Main Game Class
class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assetLoader: AssetLoader;
    private state: GameState = GameState.LOADING;
    private lastFrameTime: number = 0;
    private gameSpeed: number = 0;
    private currentSpeed: number = 0; // Current actual speed for scrolling
    private gamePaused: boolean = false; // To pause game logic on title/controls/game over

    private player!: Player;
    private parallaxLayers: ParallaxLayer[] = [];
    private ground!: Ground;
    private obstacles: Obstacle[] = [];
    private collectibles: Collectible[] = [];

    private obstacleSpawnTimer: number = 0;
    private nextObstacleSpawnTime: number = 0;

    private score: number = 0;
    private highScores: { score: number, date: string }[] = [];
    private scoreDisplay: number = 0; // For smooth score update animation

    private audioContext: AudioContext;
    private bgmSource: AudioBufferSourceNode | null = null;
    private bgmBuffer: AudioBuffer | null = null;
    private bgmGainNode: GainNode;

    private keyPressed: { [key: string]: boolean } = {};
    private isWaitingForInput: boolean = true; // For title and controls screen


    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID "${canvasId}" not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        if (!this.ctx) {
            throw new Error("Failed to get 2D rendering context.");
        }

        this.assetLoader = new AssetLoader(this.drawLoadingScreen.bind(this));
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.bgmGainNode = this.audioContext.createGain();
        this.bgmGainNode.connect(this.audioContext.destination);

        this.loadGameData();
        this.addEventListeners();
    }

    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();

            this.canvas.width = this.config.canvas.width;
            this.canvas.height = this.config.canvas.height;

            // Load assets (images and sound effects as HTMLAudioElements)
            await this.assetLoader.load(this.config.assets.images, this.config.assets.sounds);
            
            // Decode BGM for Web Audio API using its path directly
            const bgmAssetConfig = this.config.assets.sounds.find(s => s.name === 'bgm');
            if (bgmAssetConfig) {
                try {
                    const bgmResponse = await fetch(bgmAssetConfig.path);
                    const arrayBuffer = await bgmResponse.arrayBuffer();
                    this.bgmBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                } catch (e) {
                    console.error(`Failed to decode BGM from ${bgmAssetConfig.path}:`, e);
                }
            }

            this.initGame();
            this.loadHighScores();
            this.state = GameState.TITLE;
            this.gameLoop(0); // Start the game loop
        } catch (error) {
            console.error("Failed to load game data or assets:", error);
            this.state = GameState.GAME_OVER; // Or an error state
            this.drawErrorScreen("게임 로드 실패! 콘솔을 확인해주세요.");
        }
    }

    private initGame(): void {
        this.gameSpeed = this.config.gameplay.initialGameSpeed;
        this.currentSpeed = this.gameSpeed; // Initialize currentSpeed
        this.player = new Player(this.config.player, this.assetLoader, this.config.ground.y);

        this.parallaxLayers = this.config.parallax.map(layerConfig =>
            new ParallaxLayer(layerConfig, this.assetLoader, this.canvas.width)
        );

        this.ground = new Ground(this.config.ground, this.assetLoader, this.canvas.width);

        // Initialize object pools for obstacles and collectibles
        for (let i = 0; i < 5; i++) { // Pre-allocate some objects
            const obsConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
            this.obstacles.push(new Obstacle(obsConfig, this.assetLoader, this.config.ground.y, this.canvas.width));

            const collConfig = this.config.collectibles[Math.floor(Math.random() * this.config.collectibles.length)];
            this.collectibles.push(new Collectible(collConfig, this.assetLoader, this.canvas.width, 0)); // Y will be set on reset
        }
        this.resetSpawnTimers();
    }

    private resetSpawnTimers() {
        this.obstacleSpawnTimer = 0;
        this.nextObstacleSpawnTime = this.getRandomSpawnTime(this.config.gameplay.obstacleSpawnIntervalMin, this.config.gameplay.obstacleSpawnIntervalMax);
    }

    private getRandomSpawnTime(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    private addEventListeners(): void {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (this.state === GameState.LOADING) return;

        if (!this.keyPressed[event.code]) { // Only trigger on first press
            this.keyPressed[event.code] = true;

            if (this.state === GameState.TITLE || this.state === GameState.CONTROLS || this.state === GameState.GAME_OVER) {
                if (this.isWaitingForInput) { // Ensure only one input to transition
                    if (this.state === GameState.TITLE) {
                        this.state = GameState.CONTROLS;
                        this.isWaitingForInput = false;
                    } else if (this.state === GameState.CONTROLS) {
                        this.state = GameState.PLAYING;
                        this.isWaitingForInput = false;
                        this.resetGame(); // Start the game
                        this.playBGM();
                    } else if (this.state === GameState.GAME_OVER) {
                        this.state = GameState.TITLE;
                        this.isWaitingForInput = false; // Reset to allow input for title
                        this.stopBGM();
                    }
                }
                return; // Consume input, don't pass to player actions
            }
        }

        if (this.state === GameState.PLAYING && !this.gamePaused) {
            if (event.code === 'Space') {
                if (this.player.jump()) {
                    this.playSound('sfx_jump');
                }
            } else if (event.code === 'ArrowDown') {
                if (this.player.slide()) {
                    this.playSound('sfx_slide');
                }
            }
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        this.keyPressed[event.code] = false;
        if (this.state === GameState.TITLE || this.state === GameState.CONTROLS || this.state === GameState.GAME_OVER) {
            this.isWaitingForInput = true; // Allow new input for next transition
        }
    }

    private handleClick(event: MouseEvent): void {
        // Similar to keydown but only for general "start"
        if (this.state === GameState.TITLE && this.isWaitingForInput) {
            this.state = GameState.CONTROLS;
            this.isWaitingForInput = false;
        } else if (this.state === GameState.CONTROLS && this.isWaitingForInput) {
            this.state = GameState.PLAYING;
            this.isWaitingForInput = false;
            this.resetGame();
            this.playBGM();
        } else if (this.state === GameState.GAME_OVER && this.isWaitingForInput) {
            this.state = GameState.TITLE;
            this.isWaitingForInput = false;
            this.stopBGM();
        }
    }

    private gameLoop(currentTime: number): void {
        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
        this.lastFrameTime = currentTime;

        if (this.state === GameState.LOADING) {
            this.drawLoadingScreen(this.assetLoader.progress);
        } else {
            if (!this.gamePaused) {
                this.update(deltaTime);
            }
            this.draw();
        }

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number): void {
        switch (this.state) {
            case GameState.PLAYING:
                // Increase game speed over time
                this.gameSpeed = Math.min(this.config.gameplay.maxGameSpeed, this.gameSpeed + this.config.gameplay.speedIncreaseRate * deltaTime);
                this.currentSpeed = this.gameSpeed;

                // Update player
                this.player.update(deltaTime, this.config.ground.y);

                // Update parallax layers
                this.parallaxLayers.forEach(layer => layer.update(deltaTime, this.currentSpeed));

                // Update ground
                this.ground.update(deltaTime, this.currentSpeed);

                // Spawn obstacles
                this.obstacleSpawnTimer += deltaTime;
                if (this.obstacleSpawnTimer >= this.nextObstacleSpawnTime) {
                    this.spawnObstacle();
                    this.obstacleSpawnTimer = 0;
                    this.nextObstacleSpawnTime = this.getRandomSpawnTime(this.config.gameplay.obstacleSpawnIntervalMin, this.config.gameplay.obstacleSpawnIntervalMax);
                }

                // Update and check collisions for obstacles
                const playerRect = this.player.getCollisionRect();
                this.obstacles.forEach(obstacle => {
                    if (obstacle.active) {
                        obstacle.update(deltaTime, this.currentSpeed);
                        if (!obstacle.collided && checkCollision(playerRect, obstacle.getCollisionRect())) {
                            if (this.player.hit(this.config.gameplay.obstacleDamage)) {
                                this.playSound('sfx_hit');
                                obstacle.collided = true; // Mark as collided
                                if (this.player.lives <= 0) {
                                    this.gameOver();
                                }
                            }
                        }
                    }
                });

                // Update and check collisions for collectibles
                this.collectibles.forEach(collectible => {
                    if (collectible.active) {
                        collectible.update(deltaTime, this.currentSpeed);
                        if (!collectible.collected && checkCollision(playerRect, collectible.getCollisionRect())) {
                            this.score += collectible.scoreValue;
                            collectible.collected = true;
                            this.playSound('sfx_collect');
                        }
                    }
                });

                // Update score based on distance
                this.score += this.config.gameplay.scorePerSecond * deltaTime;
                this.scoreDisplay = Math.min(this.score, this.scoreDisplay + (this.score - this.scoreDisplay) * deltaTime * 5); // Smooth update

                break;
        }
    }

    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw parallax layers
        this.parallaxLayers.forEach(layer => layer.draw(this.ctx));

        // Draw ground
        this.ground.draw(this.ctx);

        // Draw obstacles
        this.obstacles.forEach(obstacle => obstacle.draw(this.ctx));

        // Draw collectibles
        this.collectibles.forEach(collectible => collectible.draw(this.ctx));

        // Draw player
        this.player.draw(this.ctx);

        // Draw UI
        this.ctx.fillStyle = this.config.ui.textColor;
        this.ctx.font = this.config.ui.font;
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`점수: ${Math.floor(this.scoreDisplay)}`, 20, 40);
        this.ctx.fillText(`체력: ${this.player.lives}`, 20, 80);

        switch (this.state) {
            case GameState.LOADING:
                this.drawLoadingScreen(this.assetLoader.progress);
                break;
            case GameState.TITLE:
                this.drawCenteredText(this.config.ui.titleMessage, this.canvas.height / 2 - 50);
                this.drawCenteredText(this.config.ui.startMessage, this.canvas.height / 2 + 20, 24);
                break;
            case GameState.CONTROLS:
                this.drawCenteredText(this.config.ui.controlsMessage, this.canvas.height / 2 - 50);
                this.drawCenteredText(this.config.ui.startMessage, this.canvas.height / 2 + 20, 24);
                break;
            case GameState.GAME_OVER:
                this.drawCenteredText(this.config.ui.gameOverMessage, this.canvas.height / 2 - 80);
                this.drawCenteredText(`최종 점수: ${Math.floor(this.score)}`, this.canvas.height / 2 - 20);
                this.drawHighScores();
                this.drawCenteredText(this.config.ui.restartMessage, this.canvas.height / 2 + 100, 24);
                break;
        }
    }

    private drawLoadingScreen(progress: number): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('로딩 중...', this.canvas.width / 2, this.canvas.height / 2 - 30);
        this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200 * progress, 20);
        this.ctx.strokeStyle = 'white';
        this.ctx.strokeRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200, 20);
    }

    private drawCenteredText(text: string, y: number, fontSize: number = 36): void {
        this.ctx.fillStyle = this.config.ui.textColor;
        this.ctx.font = `${fontSize}px ${this.config.ui.font.split(' ')[1] || 'Arial'}`; // Extract font family
        this.ctx.textAlign = 'center';
        this.ctx.fillText(text, this.canvas.width / 2, y);
    }

    private spawnObstacle(): void {
        // Find an inactive obstacle in the pool
        let obstacle = this.obstacles.find(o => !o.active);
        if (!obstacle) {
            // If no inactive obstacle, create a new one (expand pool)
            const obsConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
            obstacle = new Obstacle(obsConfig, this.assetLoader, this.config.ground.y, this.canvas.width + Math.random() * 50);
            this.obstacles.push(obstacle);
        }

        const randomConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
        obstacle.reset(this.canvas.width + Math.random() * 100); // Spawn slightly off-screen to the right
        obstacle.width = randomConfig.width;
        obstacle.height = randomConfig.height;
        obstacle.image = this.assetLoader.getImage(randomConfig.image);
        obstacle.y = this.config.ground.y - randomConfig.yOffset - obstacle.height;
        obstacle.active = true;
        obstacle.collided = false;

        // Potentially spawn a collectible with the obstacle
        if (Math.random() < this.config.gameplay.collectibleSpawnChance) {
            this.spawnCollectible(obstacle);
        }
    }

    private spawnCollectible(associatedObstacle: Obstacle): void {
        let collectible = this.collectibles.find(c => !c.active);
        if (!collectible) {
            const collConfig = this.config.collectibles[Math.floor(Math.random() * this.config.collectibles.length)];
            collectible = new Collectible(collConfig, this.assetLoader, 0, 0); // Positions will be set on reset
            this.collectibles.push(collectible);
        }

        const randomConfig = this.config.collectibles[Math.floor(Math.random() * this.config.collectibles.length)];
        collectible.image = this.assetLoader.getImage(randomConfig.image);
        collectible.scoreValue = randomConfig.scoreValue;
        collectible.width = randomConfig.width;
        collectible.height = randomConfig.height;

        // Position collectible above the obstacle or randomly in the air
        const collectibleY = this.config.ground.y -
                            (this.config.gameplay.collectibleSpawnOffsetMin + Math.random() * (this.config.gameplay.collectibleSpawnOffsetMax - this.config.gameplay.collectibleSpawnOffsetMin));
        const collectibleX = associatedObstacle.x + associatedObstacle.width / 2 - collectible.width / 2; // Center above obstacle

        collectible.reset(collectibleX, collectibleY);
    }

    private gameOver(): void {
        this.state = GameState.GAME_OVER;
        this.stopBGM();
        this.playSound('sfx_game_over');
        this.saveHighScore(Math.floor(this.score));
        this.gamePaused = true;
        this.isWaitingForInput = true; // Allow input to restart/go to title
    }

    private resetGame(): void {
        this.player.reset();
        this.gameSpeed = this.config.gameplay.initialGameSpeed;
        this.currentSpeed = this.gameSpeed;
        this.score = 0;
        this.scoreDisplay = 0;

        // Deactivate all obstacles and collectibles
        this.obstacles.forEach(o => o.active = false);
        this.collectibles.forEach(c => c.active = false);

        this.resetSpawnTimers();
        this.gamePaused = false;
        this.isWaitingForInput = false;
        this.playBGM();
    }

    private playSound(name: string, loop: boolean = false): void {
        const audio = this.assetLoader.getSound(name);
        if (audio) {
            const soundInstance = audio.cloneNode(true) as HTMLAudioElement;
            soundInstance.loop = loop;
            soundInstance.volume = audio.volume;
            soundInstance.play().catch(e => console.warn(`Audio playback failed for ${name}: ${e}`));
        }
    }

    private playBGM(): void {
        if (this.bgmBuffer && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => this._startBGM());
        } else if (this.bgmBuffer) {
            this._startBGM();
        }
    }

    private _startBGM(): void {
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource.disconnect();
            this.bgmSource = null;
        }

        this.bgmSource = this.audioContext.createBufferSource();
        this.bgmSource.buffer = this.bgmBuffer;
        this.bgmSource.loop = true;
        this.bgmSource.connect(this.bgmGainNode);
        this.bgmSource.start(0);
        this.bgmGainNode.gain.value = this.config.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.5;
    }

    private stopBGM(): void {
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource.disconnect();
            this.bgmSource = null;
        }
    }

    private loadHighScores(): void {
        try {
            const storedScores = localStorage.getItem('cookieRunnerHighScores');
            this.highScores = storedScores ? JSON.parse(storedScores) : [];
            this.highScores.sort((a, b) => b.score - a.score); // Sort descending
        } catch (e) {
            console.error("Failed to load high scores:", e);
            this.highScores = [];
        }
    }

    private saveHighScore(newScore: number): void {
        const now = new Date();
        const scoreEntry = {
            score: newScore,
            date: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
        };

        this.highScores.push(scoreEntry);
        this.highScores.sort((a, b) => b.score - a.score);
        this.highScores = this.highScores.slice(0, 5); // Keep top 5 scores

        try {
            localStorage.setItem('cookieRunnerHighScores', JSON.stringify(this.highScores));
        } catch (e) {
            console.error("Failed to save high scores:", e);
        }
    }

    private drawHighScores(): void {
        this.ctx.fillStyle = this.config.ui.textColor;
        this.ctx.font = `24px ${this.config.ui.font.split(' ')[1] || 'Arial'}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('최고 점수', this.canvas.width / 2, this.canvas.height / 2 + 30);

        this.highScores.forEach((entry, index) => {
            this.ctx.fillText(`${index + 1}. ${entry.score} (${entry.date})`, this.canvas.width / 2, this.canvas.height / 2 + 60 + index * 30);
        });
    }

    private drawErrorScreen(message: string): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('오류 발생!', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    }
}

// Ensure the game starts when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        new Game('gameCanvas');
    } catch (e) {
        console.error("Failed to initialize game:", e);
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.marginTop = '50px';
        errorDiv.innerText = `게임 초기화 중 오류 발생: ${e.message}. 콘솔을 확인해주세요.`;
        document.body.appendChild(errorDiv);
    }
});
