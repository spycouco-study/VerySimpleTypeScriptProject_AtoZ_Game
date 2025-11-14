interface GameSettings {
    gridSize: number;
    cellSize: number;
    backgroundColor: string;
    snakeHeadColor: string;
    snakeBodyColor: string;
    foodColor: string;
    initialSnakeLength: number;
    movementIntervalMs: number;
    scorePerFood: number;
    startMessage: string;
    gameOverMessage: string;
    pauseMessage: string;
    fontColor: string;
    fontSize: string;
}

interface ImageAssetData {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundAssetData {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameConfig {
    gameSettings: GameSettings;
    assets: {
        images: ImageAssetData[];
        sounds: SoundAssetData[];
    };
}

enum GameState {
    START_SCREEN,
    PLAYING,
    PAUSED,
    GAME_OVER
}

enum Direction {
    UP,
    DOWN,
    LEFT,
    RIGHT
}

interface Point {
    x: number;
    y: number;
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();

    async loadAssets(config: GameConfig): Promise<void> {
        const imagePromises = config.assets.images.map(asset => this.loadImage(asset));
        const soundPromises = config.assets.sounds.map(asset => this.loadSound(asset));

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private loadImage(asset: ImageAssetData): Promise<void> {
        return new Promise(resolve => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                this.images.set(asset.name, img);
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${asset.path}. Falling back to drawing color.`);
                // Store a dummy image or just resolve, drawing code will handle fallback
                this.images.set(asset.name, img); // Store the image object anyway, its `complete` property will be false
                resolve();
            };
        });
    }

    private loadSound(asset: SoundAssetData): Promise<void> {
        return new Promise(resolve => {
            const audio = new Audio();
            audio.src = asset.path;
            audio.volume = asset.volume;
            audio.oncanplaythrough = () => {
                this.sounds.set(asset.name, audio);
                resolve();
            };
            audio.onerror = () => {
                console.warn(`Failed to load sound: ${asset.path}`);
                this.sounds.set(asset.name, audio); // Store the audio object anyway
                resolve();
            };
            audio.load();
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    playSound(name: string, loop: boolean = false): void {
        const sound = this.getSound(name);
        if (sound) {
            if (loop) {
                sound.loop = true;
                sound.play().catch(e => console.log(`Sound play failed for ${name} (user gesture required?):`, e));
            } else {
                const clonedSound = sound.cloneNode() as HTMLAudioElement;
                clonedSound.volume = sound.volume;
                clonedSound.play().catch(e => console.log(`Sound play failed for ${name} (user gesture required?):`, e));
            }
        }
    }

    stopSound(name: string): void {
        const sound = this.getSound(name);
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assetManager: AssetManager = new AssetManager();

    private snake: Point[] = [];
    private food: Point = { x: 0, y: 0 };
    private score: number = 0;
    private currentDirection: Direction = Direction.RIGHT;
    private nextDirection: Direction = Direction.RIGHT;

    private gameState: GameState = GameState.START_SCREEN;
    private gameLoopIntervalId: number | null = null;
    private animationFrameId: number | null = null;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error("Canvas element with ID 'gameCanvas' not found.");
        }
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error("Failed to get 2D rendering context.");
        }
        this.ctx = context;
    }

    async init(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
            console.log("Game configuration loaded:", this.config);

            await this.assetManager.loadAssets(this.config);

            this.canvas.width = this.config.gameSettings.gridSize * this.config.gameSettings.cellSize;
            this.canvas.height = this.config.gameSettings.gridSize * this.config.gameSettings.cellSize;

            this.setupEventListeners();
            this.draw();
        } catch (error) {
            console.error("Failed to initialize game:", error);
        }
    }

    private setupEventListeners(): void {
        document.addEventListener('keydown', this.handleInput.bind(this));
    }

    private handleInput(event: KeyboardEvent): void {
        let newDirection: Direction | null = null;

        if (this.gameState === GameState.START_SCREEN) {
            if (event.key === 'Enter') {
                this.startGame();
                this.assetManager.playSound('backgroundMusic', true);
            }
            return;
        }

        if (event.key === 'p' || event.key === 'P') {
            this.togglePause();
            return;
        }

        if (this.gameState === GameState.GAME_OVER) {
            if (event.key === 'r' || event.key === 'R') {
                this.resetGame();
                this.startGame();
                this.assetManager.stopSound('gameOver');
                this.assetManager.playSound('backgroundMusic', true);
            }
            return;
        }

        if (this.gameState === GameState.PLAYING) {
            switch (event.key) {
                case 'ArrowUp': newDirection = Direction.UP; break;
                case 'ArrowDown': newDirection = Direction.DOWN; break;
                case 'ArrowLeft': newDirection = Direction.LEFT; break;
                case 'ArrowRight': newDirection = Direction.RIGHT; break;
            }

            if (newDirection !== null) {
                const isOpposite = (
                    (newDirection === Direction.UP && this.currentDirection === Direction.DOWN) ||
                    (newDirection === Direction.DOWN && this.currentDirection === Direction.UP) ||
                    (newDirection === Direction.LEFT && this.currentDirection === Direction.RIGHT) ||
                    (newDirection === Direction.RIGHT && this.currentDirection === Direction.LEFT)
                );
                if (!isOpposite) {
                    this.nextDirection = newDirection;
                }
            }
        }
    }

    private resetGame(): void {
        const settings = this.config.gameSettings;
        this.snake = [];
        for (let i = 0; i < settings.initialSnakeLength; i++) {
            this.snake.push({ x: settings.initialSnakeLength - 1 - i, y: 0 });
        }
        this.currentDirection = Direction.RIGHT;
        this.nextDirection = Direction.RIGHT;
        this.score = 0;
        this.generateFood();
    }

    private startGame(): void {
        this.gameState = GameState.PLAYING;
        this.resetGame();
        if (this.gameLoopIntervalId) {
            clearInterval(this.gameLoopIntervalId);
        }
        this.gameLoopIntervalId = setInterval(() => this.update(), this.config.gameSettings.movementIntervalMs);

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.animationFrameId = requestAnimationFrame(this.renderLoop.bind(this));
    }

    private togglePause(): void {
        if (this.gameState === GameState.PLAYING) {
            this.gameState = GameState.PAUSED;
            if (this.gameLoopIntervalId) {
                clearInterval(this.gameLoopIntervalId);
                this.gameLoopIntervalId = null;
            }
            this.assetManager.stopSound('backgroundMusic');
        } else if (this.gameState === GameState.PAUSED) {
            this.gameState = GameState.PLAYING;
            this.gameLoopIntervalId = setInterval(() => this.update(), this.config.gameSettings.movementIntervalMs);
            this.assetManager.playSound('backgroundMusic', true);
        }
        this.draw();
    }

    private endGame(): void {
        this.gameState = GameState.GAME_OVER;
        if (this.gameLoopIntervalId) {
            clearInterval(this.gameLoopIntervalId);
            this.gameLoopIntervalId = null;
        }
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.assetManager.stopSound('backgroundMusic');
        this.assetManager.playSound('gameOver');
        this.draw();
    }

    private update(): void {
        if (this.gameState !== GameState.PLAYING) {
            return;
        }

        const settings = this.config.gameSettings;
        this.currentDirection = this.nextDirection;

        let headX = this.snake[0].x;
        let headY = this.snake[0].y;

        switch (this.currentDirection) {
            case Direction.UP: headY--; break;
            case Direction.DOWN: headY++; break;
            case Direction.LEFT: headX--; break;
            case Direction.RIGHT: headX++; break;
        }

        const newHead: Point = { x: headX, y: headY };

        if (newHead.x < 0 || newHead.x >= settings.gridSize ||
            newHead.y < 0 || newHead.y >= settings.gridSize) {
            this.endGame();
            return;
        }

        for (let i = 0; i < this.snake.length; i++) {
            if (newHead.x === this.snake[i].x && newHead.y === this.snake[i].y) {
                this.endGame();
                return;
            }
        }

        this.snake.unshift(newHead);

        if (newHead.x === this.food.x && newHead.y === this.food.y) {
            this.score += settings.scorePerFood;
            this.assetManager.playSound('eatFood');
            this.generateFood();
        } else {
            this.snake.pop();
        }
    }

    private renderLoop(): void {
        this.draw();
        if (this.gameState === GameState.PLAYING || this.gameState === GameState.PAUSED) {
            this.animationFrameId = requestAnimationFrame(this.renderLoop.bind(this));
        }
    }

    private generateFood(): void {
        const settings = this.config.gameSettings;
        let newFood: Point;
        let isValidPosition: boolean;

        do {
            newFood = {
                x: Math.floor(Math.random() * settings.gridSize),
                y: Math.floor(Math.random() * settings.gridSize)
            };
            isValidPosition = true;
            for (const segment of this.snake) {
                if (segment.x === newFood.x && segment.y === newFood.y) {
                    isValidPosition = false;
                    break;
                }
            }
        } while (!isValidPosition);

        this.food = newFood;
    }

    private draw(): void {
        const settings = this.config.gameSettings;
        const cellSize = settings.cellSize;

        this.ctx.fillStyle = settings.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.gameState === GameState.PLAYING || this.gameState === GameState.PAUSED || this.gameState === GameState.GAME_OVER) {
            for (let i = 0; i < this.snake.length; i++) {
                const segment = this.snake[i];
                const image = i === 0 ? this.assetManager.getImage('snakeHead') : this.assetManager.getImage('snakeBody');
                const color = i === 0 ? settings.snakeHeadColor : settings.snakeBodyColor;

                if (image && image.complete) {
                    this.ctx.drawImage(image, segment.x * cellSize, segment.y * cellSize, cellSize, cellSize);
                } else {
                    this.ctx.fillStyle = color;
                    this.ctx.fillRect(segment.x * cellSize, segment.y * cellSize, cellSize, cellSize);
                    this.ctx.strokeStyle = settings.backgroundColor;
                    this.ctx.strokeRect(segment.x * cellSize, segment.y * cellSize, cellSize, cellSize);
                }
            }

            const foodImage = this.assetManager.getImage('food');
            if (foodImage && foodImage.complete) {
                this.ctx.drawImage(foodImage, this.food.x * cellSize, this.food.y * cellSize, cellSize, cellSize);
            } else {
                this.ctx.fillStyle = settings.foodColor;
                this.ctx.fillRect(this.food.x * cellSize, this.food.y * cellSize, cellSize, cellSize);
                this.ctx.strokeStyle = settings.backgroundColor;
                this.ctx.strokeRect(this.food.x * cellSize, this.food.y * cellSize, cellSize, cellSize);
            }

            this.ctx.fillStyle = settings.fontColor;
            this.ctx.font = settings.fontSize;
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        }

        this.ctx.fillStyle = settings.fontColor;
        this.ctx.font = settings.fontSize;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        switch (this.gameState) {
            case GameState.START_SCREEN:
                this.ctx.fillText(settings.startMessage, centerX, centerY);
                break;
            case GameState.PAUSED:
                this.ctx.fillText(settings.pauseMessage, centerX, centerY);
                break;
            case GameState.GAME_OVER:
                this.ctx.fillText(settings.gameOverMessage, centerX, centerY);
                this.ctx.fillText(`Final Score: ${this.score}`, centerX, centerY + 40);
                this.ctx.fillText(`Press 'R' to restart`, centerX, centerY + 80);
                break;
        }
    }
}

const game = new Game();
game.init();