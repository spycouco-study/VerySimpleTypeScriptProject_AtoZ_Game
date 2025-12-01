interface GameData {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        gameSpeed: number;
        gravity: number;
        player: {
            width: number;
            height: number;
            jumpForce: number;
            slideDuration: number;
            maxHealth: number;
            hitInvincibilityDuration: number;
            groundOffsetY: number; // Y offset from ground line
        };
        obstacle: {
            width: number;
            height: number;
            minSpawnInterval: number;
            maxSpawnInterval: number;
            speedMultiplier: number; // Multiplies gameSpeed
        };
        collectible: {
            width: number;
            height: number;
            minSpawnInterval: number;
            maxSpawnInterval: number;
            scoreValue: number;
            speedMultiplier: number; // Multiplies gameSpeed
        };
        backgrounds: Array<{
            name: string;
            speedMultiplier: number;
            yOffset: number; // % of canvas height
            height: number; // % of canvas height
        }>;
        ground: {
            name: string;
            height: number; // % of canvas height
            yOffset: number; // % of canvas height from bottom
        };
        ui: {
            scoreFontSize: number;
            healthBarWidth: number;
            healthBarHeight: number;
        };
    };
    assets: {
        images: Array<{
            name: string;
            path: string;
            width: number; // Original width
            height: number; // Original height
        }>;
        sounds: Array<{
            name: string;
            path: string;
            duration_seconds: number;
            volume: number;
        }>;
    };
}

enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets: number = 0;
    private loadedAssets: number = 0;
    private onReadyCallbacks: (() => void)[] = [];

    async load(data: GameData['assets']): Promise<void> {
        this.totalAssets = data.images.length + data.sounds.length;
        if (this.totalAssets === 0) {
            this.notifyReady();
            return;
        }

        const imagePromises = data.images.map(img => this.loadImage(img.name, img.path));
        const soundPromises = data.sounds.map(snd => this.loadSound(snd.name, snd.path));

        await Promise.all([...imagePromises, ...soundPromises]);
        this.notifyReady();
    }

    private loadImage(name: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = path;
            img.onload = () => {
                this.images.set(name, img);
                this.loadedAssets++;
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${path}`);
                this.loadedAssets++; // Still count to avoid blocking
                resolve(); // Resolve anyway to continue loading other assets
            };
        });
    }

    private loadSound(name: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = path;
            audio.preload = 'auto'; // Preload the audio
            audio.oncanplaythrough = () => {
                this.sounds.set(name, audio);
                this.loadedAssets++;
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${path}`);
                this.loadedAssets++; // Still count to avoid blocking
                resolve(); // Resolve anyway to continue loading other assets
            };
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    playSound(name: string, loop: boolean = false, volume?: number): HTMLAudioElement | undefined {
        const sound = this.sounds.get(name);
        if (sound) {
            const clone = sound.cloneNode(true) as HTMLAudioElement;
            clone.loop = loop;
            clone.volume = volume !== undefined ? volume : sound.volume;
            clone.play().catch(e => console.warn(`Failed to play sound ${name}:`, e));
            return clone;
        }
        return undefined;
    }

    stopSound(audioElement: HTMLAudioElement) {
        if (audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
        }
    }

    getLoadProgress(): number {
        return this.totalAssets === 0 ? 1 : this.loadedAssets / this.totalAssets;
    }

    onReady(callback: () => void): void {
        if (this.isReady()) {
            callback();
        } else {
            this.onReadyCallbacks.push(callback);
        }
    }

    isReady(): boolean {
        return this.loadedAssets === this.totalAssets;
    }

    private notifyReady(): void {
        this.onReadyCallbacks.forEach(callback => callback());
        this.onReadyCallbacks = [];
    }
}

class InputHandler {
    private keys: Set<string> = new Set();
    private pressCallbacks: Map<string, () => void> = new Map();

    constructor() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('click', this.handleClick);
        window.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!this.keys.has(e.code)) { // Only trigger on first press
            this.keys.add(e.code);
            this.pressCallbacks.get(e.code)?.();
        }
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
    }

    private handleClick = (e: MouseEvent) => {
        this.pressCallbacks.get('click')?.();
    }

    private handleTouchStart = (e: TouchEvent) => {
        e.preventDefault(); // Prevent default touch behavior like scrolling
        this.pressCallbacks.get('click')?.(); // Treat touch as a click
    }

    isKeyDown(key: string): boolean {
        return this.keys.has(key);
    }

    onKeyPress(key: string, callback: () => void) {
        this.pressCallbacks.set(key, callback);
    }

    clearKeyPressCallbacks() {
        this.pressCallbacks.clear();
    }
}

class GameObject {
    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number,
        public image: HTMLImageElement,
        public speed: number = 0
    ) {}

    update(deltaTime: number, gameSpeed: number) {
        this.x -= (this.speed || gameSpeed) * deltaTime;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }

    isColliding(other: GameObject): boolean {
        return (
            this.x < other.x + other.width &&
            this.x + this.width > other.x &&
            this.y < other.y + other.height &&
            this.y + this.height > other.y
        );
    }

    isOffscreen(canvasWidth: number): boolean {
        return this.x + this.width < 0;
    }
}

class Player extends GameObject {
    private velocityY: number = 0;
    private isJumping: boolean = false;
    private isSliding: boolean = false;
    private slideTimer: number = 0;
    private hitInvincibilityTimer: number = 0;
    private currentRunFrame: number = 0;
    private runFrameSpeed: number = 0.1; // Animation speed for running cookie

    public health: number;
    public score: number = 0;
    public originalY: number;

    private gameSettings: GameData['gameSettings'];
    private input: InputHandler;
    private assetManager: AssetManager;

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        imageRun: HTMLImageElement,
        private imageJump: HTMLImageElement,
        private imageSlide: HTMLImageElement,
        maxHealth: number,
        private hitInvincibilityDuration: number,
        gameSettings: GameData['gameSettings'],
        input: InputHandler,
        assetManager: AssetManager
    ) {
        super(x, y, width, height, imageRun);
        this.originalY = y;
        this.health = maxHealth;
        this.gameSettings = gameSettings;
        this.input = input;
        this.assetManager = assetManager;
    }

    update(deltaTime: number, gameSpeed: number) {
        // Handle input for jump/slide
        if (this.input.isKeyDown('Space') || this.input.isKeyDown('click')) {
            if (!this.isJumping && !this.isSliding) {
                this.jump(this.gameSettings.player.jumpForce);
                this.assetManager.playSound('sfx_jump', false, 0.5);
            }
        } else if (this.input.isKeyDown('ArrowDown')) {
            if (!this.isJumping && !this.isSliding) {
                this.slide(this.gameSettings.player.slideDuration, this.gameSettings.player.height);
                this.assetManager.playSound('sfx_slide', false, 0.5);
            }
        }

        // Apply gravity
        this.velocityY += this.gameSettings.gravity * deltaTime;
        this.y += this.velocityY * deltaTime;

        // Ground collision
        if (this.y >= this.originalY) {
            this.y = this.originalY;
            this.velocityY = 0;
            this.isJumping = false;
        }

        // Slide timer
        if (this.isSliding) {
            this.slideTimer -= deltaTime;
            if (this.slideTimer <= 0) {
                this.isSliding = false;
                this.height = this.gameSettings.player.height; // Restore original height
            }
        }

        // Invincibility timer
        if (this.hitInvincibilityTimer > 0) {
            this.hitInvincibilityTimer -= deltaTime;
        }

        // Update animation frame for running
        if (!this.isJumping && !this.isSliding) {
            this.currentRunFrame = (this.currentRunFrame + this.runFrameSpeed * deltaTime * 60) % 2; // Simple 2-frame animation
            if (this.image.src !== this.assetManager.getImage('cookie_run')?.src) {
                 this.image = this.assetManager.getImage('cookie_run')!;
            }
        } else if (this.isJumping) {
            this.image = this.imageJump;
        } else if (this.isSliding) {
            this.image = this.imageSlide;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.hitInvincibilityTimer > 0 && Math.floor(this.hitInvincibilityTimer * 10) % 2) {
            // Blink effect during invincibility
            return;
        }
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }

    jump(force: number) {
        if (!this.isJumping && !this.isSliding) {
            this.isJumping = true;
            this.velocityY = -force;
        }
    }

    slide(duration: number, originalHeight: number) {
        if (!this.isJumping && !this.isSliding) {
            this.isSliding = true;
            this.slideTimer = duration;
            this.height = originalHeight * 0.5; // Half height while sliding
        }
    }

    takeDamage(amount: number) {
        if (this.hitInvincibilityTimer <= 0) {
            this.health -= amount;
            this.hitInvincibilityTimer = this.hitInvincibilityDuration;
        }
    }

    addScore(amount: number) {
        this.score += amount;
    }

    isInvincible(): boolean {
        return this.hitInvincibilityTimer > 0;
    }
}

class ParallaxBackground extends GameObject {
    private canvasWidth: number;

    constructor(
        x: number, y: number, width: number, height: number,
        image: HTMLImageElement, speed: number, canvasWidth: number
    ) {
        super(x, y, width, height, image, speed);
        this.canvasWidth = canvasWidth;
    }

    update(deltaTime: number, gameSpeed: number) {
        this.x -= this.speed * gameSpeed * deltaTime;
        // Check if the first image has scrolled off-screen
        if (this.x + this.width <= 0) {
            this.x += this.width; // Move it to the right of the second image to create a loop
            // To ensure seamlessness if gameSpeed is high and frame rate low,
            // we might need to adjust by another width if it jumps too far
            if (this.x + this.width <= 0) {
                this.x += this.width;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        // Draw the image multiple times to cover the canvas for seamless scrolling
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
        // If the scaled image width is less than canvas width, draw a third for full coverage
        if (this.width < this.canvasWidth && this.x + 2 * this.width <= this.canvasWidth + (this.speed * 10)) { // Small buffer for smooth loop
             ctx.drawImage(this.image, this.x + 2 * this.width, this.y, this.width, this.height);
        }
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
        this.ctx.imageSmoothingEnabled = true; // For better scaling

        // Load assets
        await this.assetManager.load(this.data.assets);
        this.assetManager.onReady(() => {
            console.log("Assets loaded. Transitioning to TITLE state.");
            this.gameState = GameState.TITLE;
            this.setupTitleScreen();
            this.currentBGM = this.assetManager.playSound('bgm_title', true, 0.5);
        });

        requestAnimationFrame(this.gameLoop);
    }

    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.data = await response.json();
        } catch (error) {
            console.error('Failed to load game data:', error);
            // Fallback to default or error state
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
        this.currentBGM = this.assetManager.playSound('bgm_game', true, 0.5);
    }

    private gameOver = () => {
        this.gameState = GameState.GAME_OVER;
        this.currentBGM?.pause();
        this.assetManager.playSound('sfx_game_over', false, 0.7);

        this.inputHandler.clearKeyPressCallbacks();
        this.inputHandler.onKeyPress('Space', this.returnToTitle);
        this.inputHandler.onKeyPress('click', this.returnToTitle);
    }

    private returnToTitle = () => {
        this.gameState = GameState.TITLE;
        this.setupTitleScreen();
        this.currentBGM?.pause();
        this.currentBGM = this.assetManager.playSound('bgm_title', true, 0.5);
    }

    private resetGame() {
        const gs = this.data.gameSettings;
        const playerImageRun = this.assetManager.getImage('cookie_run')!;
        const playerImageJump = this.assetManager.getImage('cookie_jump')!;
        const playerImageSlide = this.assetManager.getImage('cookie_slide')!;

        const playerGroundY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.player.height + gs.player.groundOffsetY;

        this.player = new Player(
            gs.canvasWidth * 0.1, // Player starting X
            playerGroundY,
            gs.player.width,
            gs.player.height,
            playerImageRun,
            playerImageJump,
            playerImageSlide,
            gs.player.maxHealth,
            gs.player.hitInvincibilityDuration,
            gs, // Pass gameSettings
            this.inputHandler, // Pass inputHandler
            this.assetManager // Pass assetManager
        );

        this.backgrounds = gs.backgrounds.map(bg => {
            const img = this.assetManager.getImage(bg.name)!;
            const bgHeight = gs.canvasHeight * bg.height;
            const aspectRatio = img.width / img.height;
            const bgWidth = bgHeight * aspectRatio; // Scale width to maintain aspect ratio with scaled height
            return new ParallaxBackground(0, gs.canvasHeight * bg.yOffset, bgWidth, bgHeight, img, bg.speedMultiplier, this.canvas.width);
        });

        const groundImage = this.assetManager.getImage(gs.ground.name)!;
        const groundHeight = gs.canvasHeight * gs.ground.height;
        const groundY = gs.canvasHeight - groundHeight;
        const groundWidth = this.canvas.width * (groundImage.width / groundImage.height) / (this.canvas.height / groundHeight); // Maintain aspect ratio but make sure it scales correctly
        this.ground = new ParallaxBackground(0, groundY, this.canvas.width, groundHeight, groundImage, 1.0, this.canvas.width); // Ground width equal to canvas width to start, it will tile
        

        this.obstacles = [];
        this.collectibles = [];
        this.obstacleSpawnTimer = gs.obstacle.minSpawnInterval;
        this.collectibleSpawnTimer = gs.collectible.minSpawnInterval;
    }

    private gameLoop = (currentTime: number) => {
        if (!this.lastTime) this.lastTime = currentTime;
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

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

            // Update player
            this.player.update(deltaTime, gs.gameSpeed);
            if (this.player.health <= 0) {
                this.gameOver();
                return;
            }

            // Update backgrounds and ground
            this.backgrounds.forEach(bg => bg.update(deltaTime, gs.gameSpeed));
            this.ground.update(deltaTime, gs.gameSpeed);

            // Spawn obstacles
            this.obstacleSpawnTimer -= deltaTime;
            if (this.obstacleSpawnTimer <= 0) {
                this.spawnObstacle();
                this.obstacleSpawnTimer = Math.random() * (gs.obstacle.maxSpawnInterval - gs.obstacle.minSpawnInterval) + gs.obstacle.minSpawnInterval;
            }

            // Spawn collectibles
            this.collectibleSpawnTimer -= deltaTime;
            if (this.collectibleSpawnTimer <= 0) {
                this.spawnCollectible();
                this.collectibleSpawnTimer = Math.random() * (gs.collectible.maxSpawnInterval - gs.collectible.minSpawnInterval) + gs.collectible.minSpawnInterval;
            }

            // Update obstacles
            this.obstacles.forEach(obstacle => obstacle.update(deltaTime, gs.gameSpeed * gs.obstacle.speedMultiplier));
            this.obstacles = this.obstacles.filter(obstacle => !obstacle.isOffscreen(this.canvas.width));

            // Update collectibles
            this.collectibles.forEach(collectible => collectible.update(deltaTime, gs.gameSpeed * gs.collectible.speedMultiplier));
            this.collectibles = this.collectibles.filter(collectible => !collectible.isOffscreen(this.canvas.width));

            this.checkCollisions();
            this.player.addScore(deltaTime * 10); // Continuous score
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
                // Draw backgrounds
                this.backgrounds.forEach(bg => bg.draw(this.ctx));
                this.ground.draw(this.ctx);

                // Draw obstacles and collectibles
                this.obstacles.forEach(obstacle => obstacle.draw(this.ctx));
                this.collectibles.forEach(collectible => collectible.draw(this.ctx));

                // Draw player
                this.player.draw(this.ctx);

                // Draw UI
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
        // Score
        this.ctx.fillStyle = 'black';
        this.ctx.font = `${gs.ui.scoreFontSize}px Arial`;
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`SCORE: ${Math.floor(this.player.score)}`, 10, 30);

        // Health Bar
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
        // Player vs Obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            if (this.player.isColliding(obstacle)) {
                if (!this.player.isInvincible()) {
                    this.player.takeDamage(1); // One damage per hit
                    this.assetManager.playSound('sfx_hit', false, 0.7);
                    if (this.player.health <= 0) {
                        this.gameOver();
                        return;
                    }
                }
            }
        }

        // Player vs Collectibles
        for (let i = this.collectibles.length - 1; i >= 0; i--) {
            const collectible = this.collectibles[i];
            if (this.player.isColliding(collectible)) {
                this.player.addScore(this.data.gameSettings.collectible.scoreValue);
                this.collectibles.splice(i, 1); // Remove collected item
                this.assetManager.playSound('sfx_collect', false, 0.5);
            }
        }
    }
}

// Initialize the game
const game = new Game('gameCanvas');
game.init();