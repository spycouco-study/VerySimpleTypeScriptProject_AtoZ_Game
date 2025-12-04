interface GameConfig {
    gridSize: number;
    boardWidthCells: number;
    boardHeightCells: number;
    initialSnakeLength: number;
    gameSpeedMs: number;
    scorePerFood: number;
    backgroundColor: string;
    snakeHeadColor: string; // Not strictly used if images are used, but kept for consistency or fallback
    snakeBodyColor: string;
    foodColor: string; // Not strictly used if images are used, but kept for consistency or fallback
    fontColor: string;
    titleText: string;
    pressToStartText: string;
    instructionsTitle: string;
    instructionsText: string;
    gameOverText: string;
    scoreLabel: string;
    pressToRestartText: string;
    assets: {
        images: GameImageData[];
        sounds: SoundData[];
    };
}

interface GameImageData {
    name: string;
    path: string;
    width: number; // Original width of image
    height: number; // Original height of image
}

interface SoundData {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

enum GameState {
    LOADING,
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER,
}

enum Direction {
    UP = 'UP',
    DOWN = 'DOWN',
    LEFT = 'LEFT',
    RIGHT = 'RIGHT',
}

interface Point {
    x: number;
    y: number;
}

class AssetLoader {
    private loadedImages: Map<string, HTMLImageElement> = new Map();
    private loadedSounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets = 0;
    private loadedCount = 0;
    private onProgress: (progress: number) => void;
    private onComplete: () => void;

    constructor(onProgress: (progress: number) => void, onComplete: () => void) {
        this.onProgress = onProgress;
        this.onComplete = onComplete;
    }

    async loadAssets(config: GameConfig): Promise<void> {
        this.totalAssets = config.assets.images.length + config.assets.sounds.length;
        this.loadedCount = 0;

        const imagePromises = config.assets.images.map(imgData => this.loadImage(imgData));
        const soundPromises = config.assets.sounds.map(soundData => this.loadSound(soundData));

        await Promise.all([...imagePromises, ...soundPromises]);
        this.onComplete();
    }

    private loadImage(imgData: GameImageData): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imgData.path;
            img.onload = () => {
                this.loadedImages.set(imgData.name, img);
                this.loadedCount++;
                this.onProgress(this.loadedCount / this.totalAssets);
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imgData.path}`);
                reject(new Error(`Failed to load image: ${imgData.path}`));
            };
        });
    }

    private loadSound(soundData: SoundData): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = soundData.path;
            audio.volume = soundData.volume;
            audio.preload = 'auto';
            audio.oncanplaythrough = () => {
                this.loadedSounds.set(soundData.name, audio);
                this.loadedCount++;
                this.onProgress(this.loadedCount / this.totalAssets);
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${soundData.path}`);
                reject(new Error(`Failed to load sound: ${soundData.path}`));
            };
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.loadedImages.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.loadedSounds.get(name);
    }
}

class SnakeGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assetLoader!: AssetLoader;

    private gameState: GameState = GameState.LOADING;
    private lastUpdateTime = 0;
    private snake: Point[] = [];
    private food: Point | null = null;
    private direction: Direction = Direction.RIGHT;
    private nextDirection: Direction | null = null;
    private score = 0;
    private loopId: number = 0;
    private bgmAudio: HTMLAudioElement | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2D rendering context.');
        }
        this.ctx = ctx;

        this.assetLoader = new AssetLoader(
            this.handleAssetProgress.bind(this),
            this.handleAssetLoadComplete.bind(this)
        );

        this.setupEventListeners();
    }

    async init(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json() as GameConfig;

            this.canvas.width = this.config.boardWidthCells * this.config.gridSize;
            this.canvas.height = this.config.boardHeightCells * this.config.gridSize;

            this.startGameLoop(); // Start loop even for loading screen
            await this.assetLoader.loadAssets(this.config); // This will trigger handleAssetLoadComplete
        } catch (error) {
            console.error("Failed to load game configuration or assets:", error);
            // Potentially display an error message on canvas
        }
    }

    private handleAssetProgress(progress: number): void {
        this.drawLoadingScreen(progress);
    }

    private handleAssetLoadComplete(): void {
        this.gameState = GameState.TITLE;
        this.bgmAudio = this.assetLoader.getSound('backgroundMusic') || null;
        if (this.bgmAudio) {
            this.bgmAudio.loop = true;
            // Volume is set during loading. BGM will start on first user interaction for the title screen
        }
    }

    private setupEventListeners(): void {
        window.addEventListener('keydown', this.handleInput.bind(this));
    }

    private handleInput(event: KeyboardEvent): void {
        switch (this.gameState) {
            case GameState.TITLE:
                if (event.key === 'Enter') {
                    this.gameState = GameState.INSTRUCTIONS;
                    this.playBGM(); // Start BGM on first user interaction
                }
                break;
            case GameState.INSTRUCTIONS:
                if (event.key === 'Enter') {
                    this.startGame();
                }
                break;
            case GameState.PLAYING:
                this.changeDirection(event.key);
                break;
            case GameState.GAME_OVER:
                if (event.key === 'Enter') {
                    this.startGame();
                }
                break;
        }
    }

    private playBGM(): void {
        if (this.bgmAudio && this.bgmAudio.paused) {
            this.bgmAudio.play().catch(e => console.warn("BGM autoplay prevented:", e));
        }
    }

    private playSound(name: string): void {
        const audio = this.assetLoader.getSound(name);
        if (audio) {
            audio.currentTime = 0; // Reset to start
            audio.play().catch(e => console.warn(`Sound ${name} autoplay prevented:`, e));
        }
    }

    private changeDirection(key: string): void {
        const head = this.snake[0];
        // Calculate potential next head position based on current direction
        let potentialNextX = head.x;
        let potentialNextY = head.y;

        switch (this.direction) {
            case Direction.UP: potentialNextY--; break;
            case Direction.DOWN: potentialNextY++; break;
            case Direction.LEFT: potentialNextX--; break;
            case Direction.RIGHT: potentialNextX++; break;
        }

        switch (key) {
            case 'ArrowUp':
                // Only allow if not currently moving down AND not trying to move to the segment directly behind the head
                if (this.direction !== Direction.DOWN && !(this.snake.length > 1 && potentialNextY + 1 === this.snake[1].y && potentialNextX === this.snake[1].x)) {
                    this.nextDirection = Direction.UP;
                }
                break;
            case 'ArrowDown':
                // Only allow if not currently moving up AND not trying to move to the segment directly behind the head
                if (this.direction !== Direction.UP && !(this.snake.length > 1 && potentialNextY - 1 === this.snake[1].y && potentialNextX === this.snake[1].x)) {
                    this.nextDirection = Direction.DOWN;
                }
                break;
            case 'ArrowLeft':
                // Only allow if not currently moving right AND not trying to move to the segment directly behind the head
                if (this.direction !== Direction.RIGHT && !(this.snake.length > 1 && potentialNextX + 1 === this.snake[1].x && potentialNextY === this.snake[1].y)) {
                    this.nextDirection = Direction.LEFT;
                }
                break;
            case 'ArrowRight':
                // Only allow if not currently moving left AND not trying to move to the segment directly behind the head
                if (this.direction !== Direction.LEFT && !(this.snake.length > 1 && potentialNextX - 1 === this.snake[1].x && potentialNextY === this.snake[1].y)) {
                    this.nextDirection = Direction.RIGHT;
                }
                break;
        }
    }


    private startGame(): void {
        this.gameState = GameState.PLAYING;
        this.score = 0;
        this.direction = Direction.RIGHT; // Reset direction
        this.nextDirection = null;

        // Initialize snake
        this.snake = [];
        for (let i = 0; i < this.config.initialSnakeLength; i++) {
            this.snake.push({
                x: Math.floor(this.config.boardWidthCells / 2) - i,
                y: Math.floor(this.config.boardHeightCells / 2)
            });
        }
        this.spawnFood();
        this.lastUpdateTime = performance.now(); // Reset update timer
        this.playBGM(); // Ensure BGM continues if it was paused or reset
    }

    private spawnFood(): void {
        let newFood: Point;
        do {
            newFood = {
                x: Math.floor(Math.random() * this.config.boardWidthCells),
                y: Math.floor(Math.random() * this.config.boardHeightCells),
            };
        } while (this.isOccupiedBySnake(newFood));
        this.food = newFood;
    }

    private isOccupiedBySnake(point: Point): boolean {
        return this.snake.some(segment => segment.x === point.x && segment.y === point.y);
    }

    private startGameLoop(): void {
        const loop = (currentTime: DOMHighResTimeStamp) => {
            this.update(currentTime);
            this.draw();
            this.loopId = requestAnimationFrame(loop);
        };
        this.loopId = requestAnimationFrame(loop);
    }

    private update(currentTime: DOMHighResTimeStamp): void {
        if (this.gameState === GameState.PLAYING) {
            if (currentTime - this.lastUpdateTime > this.config.gameSpeedMs) {
                this.lastUpdateTime = currentTime;
                this.moveSnake();
                this.checkCollisions();
            }
        }
    }

    private moveSnake(): void {
        if (this.nextDirection) {
            this.direction = this.nextDirection;
            this.nextDirection = null;
        }

        const head = { ...this.snake[0] }; // Copy current head

        switch (this.direction) {
            case Direction.UP:
                head.y--;
                break;
            case Direction.DOWN:
                head.y++;
                break;
            case Direction.LEFT:
                head.x--;
                break;
            case Direction.RIGHT:
                head.x++;
                break;
        }

        this.snake.unshift(head); // Add new head

        if (this.food && head.x === this.food.x && head.y === this.food.y) {
            this.score += this.config.scorePerFood;
            this.playSound('eatSound');
            this.spawnFood();
        } else {
            this.snake.pop(); // Remove tail if no food eaten
        }
    }

    private checkCollisions(): void {
        const head = this.snake[0];

        // Wall collision
        if (head.x < 0 || head.x >= this.config.boardWidthCells ||
            head.y < 0 || head.y >= this.config.boardHeightCells) {
            this.endGame();
            return;
        }

        // Self-collision (start from 1 to skip head)
        for (let i = 1; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
                this.endGame();
                return;
            }
        }
    }

    private endGame(): void {
        this.gameState = GameState.GAME_OVER;
        this.playSound('gameOverSound');
        if (this.bgmAudio) {
            this.bgmAudio.pause(); // Pause BGM
            this.bgmAudio.currentTime = 0; // Reset BGM for next play
        }
    }

    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // Clear entire canvas

        // Draw background if available
        const background = this.assetLoader.getImage('background');
        if (background) {
            this.ctx.drawImage(background, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.config.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }


        switch (this.gameState) {
            case GameState.LOADING:
                // Draw loading screen is handled by handleAssetProgress
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawGameScreen();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawLoadingScreen(progress: number): void {
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('로딩 중...', this.canvas.width / 2, this.canvas.height / 2 - 20);

        const barWidth = this.canvas.width * 0.6;
        const barHeight = 20;
        const barX = (this.canvas.width - barWidth) / 2;
        const barY = this.canvas.height / 2 + 20;

        this.ctx.fillStyle = '#555555';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        this.ctx.fillStyle = '#78c2ad'; // A pleasant green-blue for the progress
        this.ctx.fillRect(barX, barY, barWidth * progress, barHeight);

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = this.config.fontColor;
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.config.titleText, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.pressToStartText, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawInstructionsScreen(): void {
        this.ctx.fillStyle = this.config.fontColor;
        this.ctx.font = 'bold 36px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.config.instructionsTitle, this.canvas.width / 2, this.canvas.height / 2 - 100);

        this.ctx.font = '20px Arial';
        const lines = this.config.instructionsText.split('\n');
        lines.forEach((line, index) => {
            this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 - 40 + (index * 30));
        });

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.pressToStartText, this.canvas.width / 2, this.canvas.height - 50);
    }

    private drawGameScreen(): void {
        // Draw food
        if (this.food) {
            this.drawAsset('food', this.food.x, this.food.y);
        }

        // Draw snake
        this.snake.forEach((segment, index) => {
            if (index === 0) {
                // Draw head
                this.drawAsset('snakeHead', segment.x, segment.y);
            } else {
                // Draw body
                this.drawAsset('snakeBody', segment.x, segment.y);
            }
        });

        // Draw score
        this.ctx.fillStyle = this.config.fontColor;
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${this.config.scoreLabel}: ${this.score}`, 10, 10);
    }

    private drawAsset(assetName: string, gridX: number, gridY: number): void {
        const image = this.assetLoader.getImage(assetName);
        if (image) {
            const x = gridX * this.config.gridSize;
            const y = gridY * this.config.gridSize;
            this.ctx.drawImage(image, x, y, this.config.gridSize, this.config.gridSize);
        } else {
            // Fallback for debugging if asset not loaded
            this.ctx.fillStyle = assetName === 'food' ? this.config.foodColor : (assetName === 'snakeHead' ? this.config.snakeHeadColor : this.config.snakeBodyColor);
            this.ctx.fillRect(gridX * this.config.gridSize, gridY * this.config.gridSize, this.config.gridSize, this.config.gridSize);
        }
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.config.fontColor;
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.config.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 80);

        this.ctx.font = '36px Arial';
        this.ctx.fillText(`${this.config.scoreLabel}: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 - 20);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.pressToRestartText, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }
}

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new SnakeGame('gameCanvas');
    game.init();
});
