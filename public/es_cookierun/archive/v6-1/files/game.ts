enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
}

interface AssetInfo {
    name: string;
    path: string;
}

interface ImageAssetInfo extends AssetInfo {
    width: number;
    height: number;
}

interface SoundAssetInfo extends AssetInfo {
    duration_seconds: number;
    volume: number;
}

interface AssetsData {
    images: ImageAssetInfo[];
    sounds: SoundAssetInfo[];
}

interface PlayerSettings {
    width: number;
    height: number;
    jumpForce: number;
    slideDuration: number;
    maxHealth: number;
    hitInvincibilityDuration: number;
    groundOffsetY: number;
    maxJumps: number;
    runAnimationSpeed: number;
    runAnimationFrames: string[];
}

interface ObstacleSettings {
    width: number;
    height: number;
    minSpawnInterval: number;
    maxSpawnInterval: number;
    speedMultiplier: number;
}

interface CollectibleSettings {
    width: number;
    height: number;
    minSpawnInterval: number;
    maxSpawnInterval: number;
    scoreValue: number;
    speedMultiplier: number;
}

interface BackgroundLayerSettings {
    name: string;
    speedMultiplier: number;
    yOffset: number;
    height: number;
}

interface GroundSettings {
    name: string;
    height: number;
    yOffset: number;
}

interface UISettings {
    scoreFontSize: number;
    healthBarWidth: number;
    healthBarHeight: number;
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    gameSpeed: number;
    gravity: number;
    player: PlayerSettings;
    obstacle: ObstacleSettings;
    collectible: CollectibleSettings;
    backgrounds: BackgroundLayerSettings[];
    ground: GroundSettings;
    ui: UISettings;
}

interface GameData {
    gameSettings: GameSettings;
    assets: AssetsData;
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private soundVolumes: Map<string, number> = new Map();
    private totalAssets: number = 0;
    private loadedAssets: number = 0;
    private readyCallbacks: (() => void)[] = [];

    async load(assets: AssetsData): Promise<void> {
        this.totalAssets = assets.images.length + assets.sounds.length;
        const promises: Promise<void>[] = [];

        assets.images.forEach(img => {
            promises.push(this.loadImage(img.name, img.path));
        });

        assets.sounds.forEach(sound => {
            promises.push(this.loadSound(sound.name, sound.path, sound.volume));
        });

        await Promise.all(promises);
        this.triggerReady();
    }

    private loadImage(name: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(name, img);
                this.loadedAssets++;
                resolve();
            };
            img.onerror = (e) => {
                console.error(`Failed to load image: ${path}`, e);
                this.loadedAssets++;
                resolve();
            };
            img.src = path;
        });
    }

    private loadSound(name: string, path: string, initialVolume: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(path);
            audio.oncanplaythrough = () => {
                this.sounds.set(name, audio);
                this.soundVolumes.set(name, initialVolume);
                this.loadedAssets++;
                resolve();
            };
            audio.onerror = (e) => {
                console.error(`Failed to load sound: ${path}`, e);
                this.loadedAssets++;
                resolve();
            };
            audio.load();
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    playSound(name: string, loop: boolean = false, volume?: number): HTMLAudioElement | undefined {
        const audio = this.sounds.get(name);
        if (audio) {
            const clonedAudio = audio.cloneNode() as HTMLAudioElement;
            clonedAudio.loop = loop;
            clonedAudio.volume = volume !== undefined ? volume : (this.soundVolumes.get(name) || 1.0);
            clonedAudio.play().catch(e => console.warn(`Audio playback blocked for ${name}:`, e));
            return clonedAudio;
        }
        return undefined;
    }

    getLoadProgress(): number {
        return this.totalAssets === 0 ? 0 : this.loadedAssets / this.totalAssets;
    }

    onReady(callback: () => void) {
        if (this.loadedAssets === this.totalAssets && this.totalAssets > 0) {
            callback();
        } else {
            this.readyCallbacks.push(callback);
        }
    }

    private triggerReady() {
        this.readyCallbacks.forEach(cb => cb());
        this.readyCallbacks = [];
    }
}

class InputHandler {
    private keysDown: Set<string> = new Set();
    private keysPressedThisFrame: Set<string> = new Set();
    private mouseClickedThisFrame: boolean = false;
    private touchStartedThisFrame: boolean = false;

    private oneTimeKeyPressCallbacks: Map<string, () => void> = new Map();
    private oneTimeClickCallback: (() => void) | null = null;

    constructor() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('touchstart', this.handleTouchStart);
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!this.keysDown.has(e.code)) {
            this.keysPressedThisFrame.add(e.code);
            if (this.oneTimeKeyPressCallbacks.has(e.code)) {
                this.oneTimeKeyPressCallbacks.get(e.code)!();
                this.oneTimeKeyPressCallbacks.delete(e.code);
            }
        }
        this.keysDown.add(e.code);
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.keysDown.delete(e.code);
    }

    private handleMouseDown = (e: MouseEvent) => {
        if (e.button === 0) { // Left click
            if (!this.mouseClickedThisFrame) {
                this.mouseClickedThisFrame = true;
                if (this.oneTimeClickCallback) {
                    this.oneTimeClickCallback();
                    this.oneTimeClickCallback = null;
                }
            }
        }
    }

    private handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length > 0) {
            if (!this.touchStartedThisFrame) {
                this.touchStartedThisFrame = true;
                if (this.oneTimeClickCallback) {
                    this.oneTimeClickCallback();
                    this.oneTimeClickCallback = null;
                }
            }
        }
    }

    clearFrameInput() {
        this.keysPressedThisFrame.clear();
        this.mouseClickedThisFrame = false;
        this.touchStartedThisFrame = false;
    }

    isKeyDown(keyCode: string): boolean {
        return this.keysDown.has(keyCode);
    }

    wasKeyPressedThisFrame(keyCode: string): boolean {
        return this.keysPressedThisFrame.has(keyCode);
    }

    wasClickedThisFrame(): boolean {
        return this.mouseClickedThisFrame || this.touchStartedThisFrame;
    }

    onKeyPress(keyCode: string, callback: () => void) {
        if (keyCode === 'click') {
            this.oneTimeClickCallback = callback;
        } else {
            this.oneTimeKeyPressCallbacks.set(keyCode, callback);
        }
    }

    clearKeyPressCallbacks() {
        this.oneTimeKeyPressCallbacks.clear();
        this.oneTimeClickCallback = null;
    }
}

class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.image = image;
    }

    update(deltaTime: number, gameSpeed: number) {
        this.x -= gameSpeed * deltaTime;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }

    isColliding(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    isOffscreen(canvasWidth: number): boolean {
        return this.x + this.width < 0;
    }
}

class ParallaxBackground {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
    speedMultiplier: number;
    canvasWidth: number;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement, speedMultiplier: number, canvasWidth: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.image = image;
        this.speedMultiplier = speedMultiplier;
        this.canvasWidth = canvasWidth;
    }

    update(deltaTime: number, gameSpeed: number) {
        const scrollAmount = (gameSpeed * this.speedMultiplier) * deltaTime;
        this.x -= scrollAmount;

        if (this.x <= -this.width) {
            this.x += this.width;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
    }
}

enum PlayerState {
    RUNNING,
    JUMPING,
    SLIDING,
}

class Player extends GameObject {
    private gameSettings: GameSettings;
    private inputHandler: InputHandler;
    private assetManager: AssetManager;

    private velocityY: number = 0;
    private isOnGround: boolean = true;
    private jumpsRemaining: number;
    private playerState: PlayerState = PlayerState.RUNNING;

    private runAnimationFrames: HTMLImageElement[] = [];
    private currentRunFrameIndex: number = 0;
    private animationTimer: number = 0;
    private currentImage: HTMLImageElement;

    private jumpImage: HTMLImageElement;
    private slideImage: HTMLImageElement;

    private isSliding: boolean = false;
    private slideTimer: number = 0;
    private originalHeight: number;
    private originalY: number;

    health: number;
    score: number = 0;
    private invincibilityTimer: number = 0;

    constructor(x: number, y: number, width: number, height: number,
                runImageNames: string[],
                jumpImageName: string,
                slideImageName: string,
                maxHealth: number,
                hitInvincibilityDuration: number,
                gameSettings: GameSettings,
                inputHandler: InputHandler,
                assetManager: AssetManager) {
        const initialImage = assetManager.getImage(runImageNames[0])!;
        super(x, y, width, height, initialImage);

        this.originalHeight = height;
        this.originalY = y;

        this.gameSettings = gameSettings;
        this.inputHandler = inputHandler;
        this.assetManager = assetManager;

        this.health = maxHealth;
        this.jumpsRemaining = gameSettings.player.maxJumps;

        this.runAnimationFrames = runImageNames.map(name => assetManager.getImage(name)!);
        this.jumpImage = assetManager.getImage(jumpImageName)!;
        this.slideImage = assetManager.getImage(slideImageName)!;
        this.currentImage = this.runAnimationFrames[0];
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.invincibilityTimer > 0 && Math.floor(this.invincibilityTimer * 10) % 2 === 0) {
            return;
        }
        ctx.drawImage(this.currentImage, this.x, this.y, this.width, this.height);
    }

    update(deltaTime: number, gameSpeed: number) {
        const wantsToJump = this.inputHandler.wasKeyPressedThisFrame('Space') ||
                            this.inputHandler.wasKeyPressedThisFrame('KeyW') ||
                            this.inputHandler.wasKeyPressedThisFrame('ArrowUp') ||
                            this.inputHandler.wasClickedThisFrame(); // Click/Tap also triggers jump
        if (wantsToJump) {
            this.jump();
        }

        const wantsToSlide = this.inputHandler.wasKeyPressedThisFrame('KeyS') ||
                             this.inputHandler.wasKeyPressedThisFrame('ArrowDown');
        if (wantsToSlide) {
            this.startSlide();
        }

        this.velocityY += this.gameSettings.gravity * deltaTime;
        this.y += this.velocityY * deltaTime;

        const playerGroundY = this.gameSettings.canvasHeight * (1 - this.gameSettings.ground.yOffset) - this.originalHeight + this.gameSettings.player.groundOffsetY;
        if (this.y >= playerGroundY) {
            this.y = playerGroundY;
            if (!this.isOnGround) {
                this.isOnGround = true;
                this.velocityY = 0;
                this.jumpsRemaining = this.gameSettings.player.maxJumps;
                this.playerState = PlayerState.RUNNING;
                if (this.isSliding) this.stopSlide(); // Stop sliding if landed while sliding
            }
        } else {
            this.isOnGround = false;
        }

        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= deltaTime;
        }

        this.updateAnimation(deltaTime);

        if (this.isSliding) {
            this.slideTimer -= deltaTime;
            if (this.slideTimer <= 0) {
                this.stopSlide();
            }
        }
    }

    private jump() {
        if (this.jumpsRemaining > 0 && !this.isSliding) {
            this.velocityY = -this.gameSettings.player.jumpForce;
            this.isOnGround = false;
            this.jumpsRemaining--;
            this.playerState = PlayerState.JUMPING;
            this.assetManager.playSound('sfx_jump', false);
        }
    }

    private startSlide() {
        if (this.isOnGround && !this.isSliding) {
            this.isSliding = true;
            this.slideTimer = this.gameSettings.player.slideDuration;
            this.playerState = PlayerState.SLIDING;

            this.y = this.originalY + (this.originalHeight * 0.5);
            this.height = this.originalHeight * 0.5;
            this.assetManager.playSound('sfx_slide', false);
        }
    }

    private stopSlide() {
        if (this.isSliding) {
            this.isSliding = false;
            this.y = this.originalY;
            this.height = this.originalHeight;
            if (this.isOnGround) {
                this.playerState = PlayerState.RUNNING;
            } else {
                this.playerState = PlayerState.JUMPING;
            }
        }
    }

    private updateAnimation(deltaTime: number) {
        if (this.playerState === PlayerState.JUMPING) {
            this.currentImage = this.jumpImage;
        } else if (this.playerState === PlayerState.SLIDING) {
            this.currentImage = this.slideImage;
        } else if (this.playerState === PlayerState.RUNNING) {
            this.animationTimer += deltaTime;
            if (this.animationTimer >= this.gameSettings.player.runAnimationSpeed) {
                this.animationTimer = 0;
                this.currentRunFrameIndex = (this.currentRunFrameIndex + 1) % this.runAnimationFrames.length;
                this.currentImage = this.runAnimationFrames[this.currentRunFrameIndex];
            }
        }
    }

    takeDamage(amount: number) {
        if (this.invincibilityTimer <= 0) {
            this.health -= amount;
            this.invincibilityTimer = this.gameSettings.player.hitInvincibilityDuration;
        }
    }

    isInvincible(): boolean {
        return this.invincibilityTimer > 0;
    }

    addScore(amount: number) {
        this.score += amount;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private data!: GameData;
    private assetManager: AssetManager = new AssetManager();
    private inputHandler: InputHandler = new InputHandler();

    private gameState: GameState = GameState.LOADING;
    private lastTime: number = 0;

    private player!: Player;
    private backgrounds: ParallaxBackground[] = [];
    private ground!: ParallaxBackground; 
    private obstacles: GameObject[] = [];
    private collectibles: GameObject[] = [];

    private obstacleSpawnTimer: number = 0;
    private collectibleSpawnTimer: number = 0;

    private currentBGM: HTMLAudioElement | undefined;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        if (!this.ctx) {
            console.error("Canvas context not found!");
            return;
        }
    }

    async init() {
        await this.loadGameData();
        this.canvas.width = this.data.gameSettings.canvasWidth;
        this.canvas.height = this.data.gameSettings.canvasHeight;
        this.ctx.imageSmoothingEnabled = true;

        await this.assetManager.load(this.data.assets);
        this.assetManager.onReady(() => {
            console.log("Assets loaded. Transitioning to TITLE state.");
            this.gameState = GameState.TITLE;
            this.setupTitleScreen();
            this.currentBGM = this.assetManager.playSound('bgm_title', true);
        });

        requestAnimationFrame(this.gameLoop);
    }

    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.data = await response.json();
        } catch (error) {
            console.error('Failed to load game data:', error);
        }
    }

    private setupTitleScreen() {
        this.inputHandler.clearKeyPressCallbacks();
        this.inputHandler.onKeyPress('Space', this.startGame);
        this.inputHandler.onKeyPress('click', this.startGame);
    }

    private startGame = () => {
        this.gameState = GameState.PLAYING;
        this.inputHandler.clearKeyPressCallbacks();
        this.resetGame();
        this.currentBGM?.pause();
        this.currentBGM = this.assetManager.playSound('bgm_game', true);
    }

    private gameOver = () => {
        this.gameState = GameState.GAME_OVER;
        this.currentBGM?.pause();
        this.assetManager.playSound('sfx_game_over', false);

        this.inputHandler.clearKeyPressCallbacks();
        this.inputHandler.onKeyPress('Space', this.returnToTitle);
        this.inputHandler.onKeyPress('click', this.returnToTitle);
    }

    private returnToTitle = () => {
        this.gameState = GameState.TITLE;
        this.setupTitleScreen();
        this.currentBGM?.pause();
        this.currentBGM = this.assetManager.playSound('bgm_title', true);
    }

    private resetGame() {
        const gs = this.data.gameSettings;
        
        const playerGroundY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.player.height + gs.player.groundOffsetY;

        this.player = new Player(
            gs.canvasWidth * 0.1,
            playerGroundY,
            gs.player.width,
            gs.player.height,
            gs.player.runAnimationFrames,
            'cookie_jump',
            'cookie_slide',
            gs.player.maxHealth,
            gs.player.hitInvincibilityDuration,
            gs,
            this.inputHandler,
            this.assetManager
        );

        this.backgrounds = gs.backgrounds.map(bg => {
            const img = this.assetManager.getImage(bg.name)!;
            const bgHeight = gs.canvasHeight * bg.height;
            const aspectRatio = img.width / img.height;
            const bgWidth = bgHeight * aspectRatio;
            return new ParallaxBackground(0, gs.canvasHeight * bg.yOffset, bgWidth, bgHeight, img, bg.speedMultiplier, this.canvas.width);
        });

        const groundImage = this.assetManager.getImage(gs.ground.name)!;
        const groundHeight = gs.canvasHeight * gs.ground.height;
        const groundY = gs.canvasHeight - groundHeight;
        const groundAspectRatio = groundImage.width / groundImage.height;
        const groundWidth = groundHeight * groundAspectRatio;
        this.ground = new ParallaxBackground(0, groundY, groundWidth, groundHeight, groundImage, 1.0, this.canvas.width);
        

        this.obstacles = [];
        this.collectibles = [];
        this.obstacleSpawnTimer = gs.obstacle.minSpawnInterval;
        this.collectibleSpawnTimer = gs.collectible.minSpawnInterval;
    }

    private gameLoop = (currentTime: number) => {
        if (!this.lastTime) this.lastTime = currentTime;
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.inputHandler.clearFrameInput();

        if (this.gameState === GameState.LOADING) {
            this.renderLoadingScreen();
        } else {
            this.update(deltaTime);
            this.render();
        }

        requestAnimationFrame(this.gameLoop);
    }

    private update(deltaTime: number) {
        if (this.gameState === GameState.PLAYING) {
            const gs = this.data.gameSettings;

            this.player.update(deltaTime, gs.gameSpeed);
            if (this.player.health <= 0) {
                this.gameOver();
                return;
            }

            this.backgrounds.forEach(bg => bg.update(deltaTime, gs.gameSpeed));
            this.ground.update(deltaTime, gs.gameSpeed);

            this.obstacleSpawnTimer -= deltaTime;
            if (this.obstacleSpawnTimer <= 0) {
                this.spawnObstacle();
                this.obstacleSpawnTimer = Math.random() * (gs.obstacle.maxSpawnInterval - gs.obstacle.minSpawnInterval) + gs.obstacle.minSpawnInterval;
            }

            this.collectibleSpawnTimer -= deltaTime;
            if (this.collectibleSpawnTimer <= 0) {
                this.spawnCollectible();
                this.collectibleSpawnTimer = Math.random() * (gs.collectible.maxSpawnInterval - gs.collectible.minSpawnInterval) + gs.collectible.minSpawnInterval;
            }

            this.obstacles.forEach(obstacle => obstacle.update(deltaTime, gs.gameSpeed * gs.obstacle.speedMultiplier));
            this.obstacles = this.obstacles.filter(obstacle => !obstacle.isOffscreen(this.canvas.width));

            this.collectibles.forEach(collectible => collectible.update(deltaTime, gs.gameSpeed * gs.collectible.speedMultiplier));
            this.collectibles = this.collectibles.filter(collectible => !collectible.isOffscreen(this.canvas.width));

            this.checkCollisions();
            this.player.addScore(deltaTime * 10);
        }
    }

    private renderLoadingScreen() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Loading Assets...', this.canvas.width / 2, this.canvas.height / 2);
        const progress = this.assetManager.getLoadProgress();
        this.ctx.fillText(`${(progress * 100).toFixed(0)}%`, this.canvas.width / 2, this.canvas.height / 2 + 40);
    }

    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.gameState) {
            case GameState.TITLE:
                const titleBg = this.assetManager.getImage('title_background');
                if (titleBg) {
                    this.ctx.drawImage(titleBg, 0, 0, this.canvas.width, this.canvas.height);
                } else {
                    this.ctx.fillStyle = 'lightblue';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
                this.ctx.textAlign = 'center';
                this.ctx.fillStyle = 'white';
                this.ctx.font = `bold ${this.data.gameSettings.ui.scoreFontSize * 1.5}px Arial`;
                this.ctx.fillText('Cookie Runner', this.canvas.width / 2, this.canvas.height / 3);
                this.ctx.font = `${this.data.gameSettings.ui.scoreFontSize}px Arial`;
                this.ctx.fillText('Press SPACE or TAP to Start', this.canvas.width / 2, this.canvas.height / 2);
                break;

            case GameState.PLAYING:
                this.backgrounds.forEach(bg => bg.draw(this.ctx));
                this.ground.draw(this.ctx);

                this.obstacles.forEach(obstacle => obstacle.draw(this.ctx));
                this.collectibles.forEach(collectible => collectible.draw(this.ctx));

                this.player.draw(this.ctx);

                this.drawUI();
                break;

            case GameState.GAME_OVER:
                const gameOverBg = this.assetManager.getImage('game_over_background');
                if (gameOverBg) {
                    this.ctx.drawImage(gameOverBg, 0, 0, this.canvas.width, this.canvas.height);
                } else {
                    this.ctx.fillStyle = 'darkred';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
                this.ctx.textAlign = 'center';
                this.ctx.fillStyle = 'white';
                this.ctx.font = `bold ${this.data.gameSettings.ui.scoreFontSize * 1.5}px Arial`;
                this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 3);
                this.ctx.font = `${this.data.gameSettings.ui.scoreFontSize}px Arial`;
                this.ctx.fillText(`SCORE: ${Math.floor(this.player.score)}`, this.canvas.width / 2, this.canvas.height / 2.2);
                this.ctx.fillText('Press SPACE or TAP to return to Title', this.canvas.width / 2, this.canvas.height / 1.8);
                break;
        }
    }

    private drawUI() {
        const gs = this.data.gameSettings;
        this.ctx.fillStyle = 'black';
        this.ctx.font = `${gs.ui.scoreFontSize}px Arial`;
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`SCORE: ${Math.floor(this.player.score)}`, 10, 30);

        const healthBarX = this.canvas.width - gs.ui.healthBarWidth - 10;
        const healthBarY = 10;
        const currentHealthWidth = (this.player.health / gs.player.maxHealth) * gs.ui.healthBarWidth;

        this.ctx.fillStyle = 'gray';
        this.ctx.fillRect(healthBarX, healthBarY, gs.ui.healthBarWidth, gs.ui.healthBarHeight);
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(healthBarX, healthBarY, currentHealthWidth, gs.ui.healthBarHeight);
        this.ctx.strokeStyle = 'white';
        this.ctx.strokeRect(healthBarX, healthBarY, gs.ui.healthBarWidth, gs.ui.healthBarHeight);
    }

    private spawnObstacle() {
        const gs = this.data.gameSettings;
        const obstacleImage = this.assetManager.getImage('obstacle_spike');
        if (!obstacleImage) {
            console.warn("Obstacle image not found!");
            return;
        }

        const obstacleY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.obstacle.height;
        this.obstacles.push(new GameObject(this.canvas.width, obstacleY, gs.obstacle.width, gs.obstacle.height, obstacleImage));
    }

    private spawnCollectible() {
        const gs = this.data.gameSettings;
        const jellyImage = this.assetManager.getImage('jelly_basic');
        if (!jellyImage) {
            console.warn("Collectible image not found!");
            return;
        }

        const minJellyY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.collectible.height * 2;
        const maxJellyY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.collectible.height * 4;
        const jellyY = Math.random() * (minJellyY - maxJellyY) + maxJellyY;

        this.collectibles.push(new GameObject(this.canvas.width, jellyY, gs.collectible.width, gs.collectible.height, jellyImage));
    }

    private checkCollisions() {
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            if (this.player.isColliding(obstacle)) {
                if (!this.player.isInvincible()) {
                    this.player.takeDamage(1);
                    this.assetManager.playSound('sfx_hit', false);
                    if (this.player.health <= 0) {
                        this.gameOver();
                        return;
                    }
                }
            }
        }

        for (let i = this.collectibles.length - 1; i >= 0; i--) {
            const collectible = this.collectibles[i];
            if (this.player.isColliding(collectible)) {
                this.player.addScore(this.data.gameSettings.collectible.scoreValue);
                this.collectibles.splice(i, 1);
                this.assetManager.playSound('sfx_collect', false);
            }
        }
    }
}

const game = new Game('gameCanvas');
game.init();