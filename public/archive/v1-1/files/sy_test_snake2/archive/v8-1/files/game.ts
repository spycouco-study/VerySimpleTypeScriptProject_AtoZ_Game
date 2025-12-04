interface GridPosition {
    x: number;
    y: number;
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
    loop?: boolean;
}

interface GameData {
    game: {
        canvasWidth: number;
        canvasHeight: number;
        tileSize: number;
        snakeSpeedMs: number;
        initialSnakeLength: number;
        scorePerFood: number;
    };
    colors: {
        background: string;
        text: string;
        scoreText: string;
    };
    text: {
        title: string;
        pressStart: string;
        gameOver: string;
        pressRestart: string;
    };
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

enum GameState {
    Title,
    Playing,
    GameOver,
}

class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private audioBGM: Map<string, HTMLAudioElement> = new Map(); // For BGM (looping sounds)
    private audioEffects: Map<string, HTMLAudioElement[]> = new Map(); // For effects (non-looping, with pooling)

    private assetConfig: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };

    constructor(assetConfig: { images: ImageAsset[]; sounds: SoundAsset[] }) {
        this.assetConfig = assetConfig;
    }

    async loadAll(): Promise<void> {
        const imagePromises = this.assetConfig.images.map(this.loadImage.bind(this));
        const soundPromises = this.assetConfig.sounds.map(this.loadSound.bind(this));

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log('All assets loaded.');
    }

    private loadImage(asset: ImageAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                this.images.set(asset.name, img);
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${asset.path}`);
                reject(`Failed to load image: ${asset.path}`);
            };
        });
    }

    private loadSound(asset: SoundAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            if (asset.loop) { // BGM
                const audio = new Audio(asset.path);
                audio.volume = asset.volume;
                audio.loop = true;
                audio.oncanplaythrough = () => {
                    this.audioBGM.set(asset.name, audio);
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load BGM: ${asset.path}`);
                    reject(`Failed to load BGM: ${asset.path}`);
                };
                audio.load();
            } else { // Sound Effect - create a pool
                const effectPool: HTMLAudioElement[] = [];
                let loadedCount = 0;
                const poolSize = 3; // Number of instances for overlapping effects

                for (let i = 0; i < poolSize; i++) {
                    const effect = new Audio(asset.path);
                    effect.volume = asset.volume;
                    effect.oncanplaythrough = () => {
                        loadedCount++;
                        if (loadedCount === poolSize) {
                            this.audioEffects.set(asset.name, effectPool);
                            resolve();
                        }
                    };
                    effect.onerror = () => {
                        console.error(`Failed to load sound effect instance ${i} for: ${asset.path}`);
                        // Don't reject the whole promise if one instance fails, try to load others
                        // Or handle this more robustly based on requirements
                    };
                    effectPool.push(effect);
                    effect.load();
                }
            }
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    playBGM(name: string): void {
        const bgm = this.audioBGM.get(name);
        if (bgm && bgm.paused) {
            bgm.play().catch(e => console.warn(`Error playing BGM '${name}':`, e));
        }
    }

    stopBGM(name: string): void {
        const bgm = this.audioBGM.get(name);
        if (bgm && !bgm.paused) {
            bgm.pause();
            bgm.currentTime = 0; // Reset to start
        }
    }

    playEffect(name: string): void {
        const effectPool = this.audioEffects.get(name);
        if (effectPool) {
            // Find an available (paused or finished) audio element to play
            const availableEffect = effectPool.find(effect => effect.paused || effect.ended);
            if (availableEffect) {
                availableEffect.currentTime = 0; // Rewind to start
                availableEffect.play().catch(e => console.warn(`Error playing effect '${name}':`, e));
            } else {
                console.warn(`No available audio element for effect '${name}'. Consider increasing pool size.`);
            }
        }
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gameData!: GameData;
    private assetLoader!: AssetLoader;

    private currentGameState: GameState = GameState.Title;
    private gameLoopInterval: number | null = null;

    private snake: GridPosition[] = [];
    private food: GridPosition | null = null;
    private direction: GridPosition = { x: 0, y: 0 }; // Current movement direction
    private newDirection: GridPosition = { x: 0, y: 0 }; // Next movement direction (buffered)
    private score: number = 0;
    private gamePaused: boolean = false; // To prevent immediate restart after Game Over

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.addEventListeners();
    }

    async init(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.gameData = await response.json();

            this.canvas.width = this.gameData.game.canvasWidth;
            this.canvas.height = this.gameData.game.canvasHeight;

            this.assetLoader = new AssetLoader(this.gameData.assets);
            await this.assetLoader.loadAll();

            this.resetGame();
            this.draw(); // Draw initial title screen
            console.log('Game initialized successfully.');
        } catch (error) {
            console.error('Failed to initialize game:', error);
        }
    }

    private addEventListeners(): void {
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        const { keyCode } = event;
        const { Playing, Title, GameOver } = GameState;

        if (this.gamePaused && keyCode !== 32) return; // Ignore input if paused, unless it's space

        switch (this.currentGameState) {
            case Title:
                if (keyCode === 32) { // Space
                    this.startGame();
                }
                break;
            case Playing:
                let newDir: GridPosition = { x: 0, y: 0 };
                // Prevent reversing directly into the snake's body
                if (keyCode === 37 && this.direction.x === 0) newDir = { x: -1, y: 0 }; // Left
                else if (keyCode === 38 && this.direction.y === 0) newDir = { x: 0, y: -1 }; // Up
                else if (keyCode === 39 && this.direction.x === 0) newDir = { x: 1, y: 0 }; // Right
                else if (keyCode === 40 && this.direction.y === 0) newDir = { x: 0, y: 1 }; // Down

                if (newDir.x !== 0 || newDir.y !== 0) {
                    this.newDirection = newDir;
                }
                break;
            case GameOver:
                if (keyCode === 32) { // Space
                    this.gamePaused = true; // Briefly pause input after game over
                    setTimeout(() => {
                        this.gamePaused = false;
                        this.resetGame();
                        this.startGame();
                    }, 500); // 500ms delay to prevent immediate restart
                }
                break;
        }
    }

    private startGame(): void {
        this.currentGameState = GameState.Playing;
        this.assetLoader.playBGM('bgm');
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
        }
        this.gameLoopInterval = window.setInterval(() => this.gameTick(), this.gameData.game.snakeSpeedMs);
        this.draw();
    }

    private endGame(): void {
        this.currentGameState = GameState.GameOver;
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
        this.assetLoader.stopBGM('bgm');
        this.assetLoader.playEffect('gameOver');
        this.draw(); // Draw game over screen
    }

    private resetGame(): void {
        const { game } = this.gameData;
        this.snake = [];
        // Center the snake initially
        const startX = Math.floor(game.canvasWidth / (2 * game.tileSize));
        const startY = Math.floor(game.canvasHeight / (2 * game.tileSize));
        for (let i = 0; i < game.initialSnakeLength; i++) {
            this.snake.push({ x: startX - i, y: startY });
        }
        this.direction = { x: 1, y: 0 }; // Start moving right
        this.newDirection = { x: 1, y: 0 };
        this.food = null;
        this.score = 0;
        this.generateFood(); // Generate first food item
        this.currentGameState = GameState.Title; // Reset to title screen
    }

    private gameTick(): void {
        if (this.currentGameState !== GameState.Playing) return;

        // Apply buffered direction
        this.direction = this.newDirection;

        const head = { ...this.snake[0] };
        head.x += this.direction.x;
        head.y += this.direction.y;

        // Check for collisions
        const { game } = this.gameData;
        const gridCols = game.canvasWidth / game.tileSize;
        const gridRows = game.canvasHeight / game.tileSize;

        // Wall collision
        if (head.x < 0 || head.x >= gridCols || head.y < 0 || head.y >= gridRows) {
            this.endGame();
            return;
        }

        // Self-collision (start checking from 1st segment to avoid immediate head-neck collision for the next segment)
        for (let i = 1; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
                this.endGame();
                return;
            }
        }

        this.snake.unshift(head); // Add new head

        // Food collision
        if (this.food && head.x === this.food.x && head.y === this.food.y) {
            this.score += game.scorePerFood;
            this.assetLoader.playEffect('eat');
            this.generateFood(); // Generate new food
        } else {
            this.snake.pop(); // Remove tail if no food eaten
        }

        this.draw();
    }

    private generateFood(): void {
        const { game } = this.gameData;
        const gridCols = game.canvasWidth / game.tileSize;
        const gridRows = game.canvasHeight / game.tileSize;

        let newFood: GridPosition;
        let collision: boolean;
        do {
            newFood = {
                x: Math.floor(Math.random() * gridCols),
                y: Math.floor(Math.random() * gridRows),
            };
            collision = this.snake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
        } while (collision);

        this.food = newFood;
    }

    private draw(): void {
        const { ctx, gameData } = this;
        const { game, colors, text } = gameData;

        // Clear canvas with background color
        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, game.canvasWidth, game.canvasHeight);

        switch (this.currentGameState) {
            case GameState.Title:
                // Draw title screen background image
                const titleBgImage = this.assetLoader.getImage('title_bg');
                if (titleBgImage) {
                    ctx.drawImage(
                        titleBgImage,
                        0,
                        0,
                        game.canvasWidth,
                        game.canvasHeight
                    );
                } else {
                    // Fallback to drawing a solid background if image not loaded
                    ctx.fillStyle = colors.background;
                    ctx.fillRect(0, 0, game.canvasWidth, game.canvasHeight);
                }

                this.drawText(text.title, game.canvasWidth / 2, game.canvasHeight / 3, 60, colors.text);
                this.drawText(text.pressStart, game.canvasWidth / 2, game.canvasHeight / 2 + 50, 30, colors.text);
                break;
            case GameState.Playing:
                // Draw food
                if (this.food) {
                    const foodImage = this.assetLoader.getImage('food');
                    if (foodImage) {
                        ctx.drawImage(
                            foodImage,
                            this.food.x * game.tileSize,
                            this.food.y * game.tileSize,
                            game.tileSize,
                            game.tileSize
                        );
                    } else {
                        // Fallback to drawing a square if image not loaded
                        ctx.fillStyle = 'red';
                        ctx.fillRect(this.food.x * game.tileSize, this.food.y * game.tileSize, game.tileSize, game.tileSize);
                    }
                }

                // Draw snake
                this.snake.forEach((segment, index) => {
                    let segmentImage: HTMLImageElement | undefined;
                    if (index === 0) { // Head
                        segmentImage = this.assetLoader.getImage('snake_head');
                    } else { // Body
                        segmentImage = this.assetLoader.getImage('snake_body');
                    }

                    if (segmentImage) {
                        ctx.drawImage(
                            segmentImage,
                            segment.x * game.tileSize,
                            segment.y * game.tileSize,
                            game.tileSize,
                            game.tileSize
                        );
                    } else {
                        // Fallback to drawing squares
                        ctx.fillStyle = index === 0 ? 'darkgreen' : 'green';
                        ctx.fillRect(segment.x * game.tileSize, segment.y * game.tileSize, game.tileSize, game.tileSize);
                    }
                });

                // Draw score
                this.drawText(`Score: ${this.score}`, 10, 30, 24, colors.scoreText, 'left');
                break;
            case GameState.GameOver:
                this.drawText(text.gameOver, game.canvasWidth / 2, game.canvasHeight / 3, 60, colors.text);
                this.drawText(`Final Score: ${this.score}`, game.canvasWidth / 2, game.canvasHeight / 2, 40, colors.scoreText);
                this.drawText(text.pressRestart, game.canvasWidth / 2, game.canvasHeight / 2 + 70, 30, colors.text);
                break;
        }
    }

    private drawText(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
        this.ctx.fillStyle = color;
        this.ctx.font = `${size}px Arial`;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new Game('gameCanvas');
    game.init();
});