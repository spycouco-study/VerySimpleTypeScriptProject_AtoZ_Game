interface ImageAsset {
    name: string;
    path: string;
    width: number; // Source width (not used for drawing, but good for data)
    height: number; // Source height (not used for drawing, but good for data)
}

interface SoundAsset {
    name: string;
    path: string;
    volume: number;
    duration_seconds?: number; // Added as optional property
}

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    gridSize: number; // Number of cells along one side (e.g., 20x20 grid)
    initialSnakeLength: number;
    initialSpeedMs: number; // Milliseconds per movement
    foodSpawnAttempts: number; // Max attempts to find a free spot for food
    initialFoodCount: number; // New: Number of food items to spawn initially and maintain
    wallCollision: 'gameOver' | 'wrap';
    selfCollision: boolean;

    colors: {
        background: string;
        snakeHead: string;
        snakeBody: string;
        food: string;
        text: string;
    };

    text: {
        title: string;
        pressSpaceToStart: string;
        gameOver: string;
        scorePrefix: string;
    };

    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

interface SnakeSegment {
    x: number;
    y: number;
}

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface GameState {
    snake: SnakeSegment[];
    food: SnakeSegment[]; // Changed to an array to hold multiple food items
    currentDirection: Direction;
    nextDirection: Direction; // To prevent immediate U-turns
    score: number;
    gameOver: boolean;
    gameStarted: boolean;
    lastMoveTime: number; // Timestamp of the last snake movement
}

class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private config: GameConfig | null = null;

    async loadConfig(configPath: string): Promise<GameConfig> {
        const response = await fetch(configPath);
        if (!response.ok) {
            throw new Error(`Failed to fetch config: ${response.statusText}`);
        }
        const loadedConfig: GameConfig = await response.json(); // Assign to a typed local variable
        this.config = loadedConfig; // Then assign to the class property
        return loadedConfig; // Return the typed local variable to match Promise<GameConfig>
    }

    async loadAssets(): Promise<void> {
        if (!this.config) {
            throw new Error('Config not loaded. Call loadConfig first.');
        }

        const imagePromises = this.config.assets.images.map(asset => this.loadImage(asset));
        const soundPromises = this.config.assets.sounds.map(asset => this.loadSound(asset));

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log('All assets loaded.');
    }

    private loadImage(asset: ImageAsset): Promise<void> {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                this.images.set(asset.name, img);
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${asset.path}. Falling back to color rendering if applicable.`);
                resolve(); // Resolve to allow other assets to load even if one fails
            };
        });
    }

    private loadSound(asset: SoundAsset): Promise<void> {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.src = asset.path;
            audio.volume = asset.volume;
            audio.preload = 'auto'; // Preload to ensure it's ready
            audio.load();

            audio.oncanplaythrough = () => {
                this.sounds.set(asset.name, audio);
                resolve();
            };
            audio.onerror = () => {
                console.warn(`Failed to load sound: ${asset.path}. Sound will not play.`);
                resolve(); // Resolve to allow other assets to load
            };
            // Handle cases where oncanplaythrough might not fire (e.g., if already loaded)
            if (audio.readyState >= 3) { // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
                this.sounds.set(asset.name, audio);
                resolve();
            }
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }
}

class SnakeGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig;
    private assetLoader: AssetLoader;

    private state: GameState;
    private animationFrameId: number | null = null;
    private lastFrameTime: number = 0;
    private cellSize: number;

    private bgmAudio: HTMLAudioElement | null = null;

    constructor(canvasId: string, config: GameConfig, assetLoader: AssetLoader) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID "${canvasId}" not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        if (!this.ctx) {
            throw new Error('Failed to get 2D rendering context.');
        }

        this.config = config;
        this.assetLoader = assetLoader;

        this.canvas.width = config.canvasWidth;
        this.canvas.height = config.canvasHeight;
        this.cellSize = this.canvas.width / config.gridSize;

        this.state = this.initialGameState();

        this.setupEventListeners();
    }

    private initialGameState(): GameState {
        const startX = Math.floor(this.config.gridSize / 2);
        const startY = Math.floor(this.config.gridSize / 2);
        const initialSnake: SnakeSegment[] = [];
        for (let i = 0; i < this.config.initialSnakeLength; i++) {
            initialSnake.push({ x: startX - i, y: startY }); // Snake starts horizontally, facing right
        }

        return {
            snake: initialSnake,
            food: [], // Initialize food as an empty array
            currentDirection: 'RIGHT',
            nextDirection: 'RIGHT',
            score: 0,
            gameOver: false,
            gameStarted: false,
            lastMoveTime: 0,
        };
    }

    private setupEventListeners(): void {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.state.gameStarted) {
            if (event.code === 'Space') {
                this.startGame();
            }
            return;
        }

        if (this.state.gameOver) {
            if (event.code === 'Space') {
                this.resetGame();
                this.startGame();
            }
            return;
        }

        // Prevent immediate reverse turns
        const currentDir = this.state.currentDirection;
        let newDirection: Direction | null = null;

        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                if (currentDir !== 'DOWN') newDirection = 'UP';
                break;
            case 'ArrowDown':
            case 'KeyS':
                if (currentDir !== 'UP') newDirection = 'DOWN';
                break;
            case 'ArrowLeft':
            case 'KeyA':
                if (currentDir !== 'RIGHT') newDirection = 'LEFT';
                break;
            case 'ArrowRight':
            case 'KeyD':
                if (currentDir !== 'LEFT') newDirection = 'RIGHT';
                break;
        }

        if (newDirection !== null) {
            this.state.nextDirection = newDirection;
        }
    }

    private startGame(): void {
        this.state.gameStarted = true;
        this.state.gameOver = false;
        this.state.lastMoveTime = performance.now();
        this.spawnFoodUntilTarget(); // Call new method to spawn initial food
        this.playBGM();
        this.loop(performance.now());
    }

    private resetGame(): void {
        this.state = this.initialGameState();
        if (this.bgmAudio) { // Safely check before accessing properties to fix TS2779
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
        }
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private playBGM(): void {
        const bgm = this.assetLoader.getSound('bgm');
        if (bgm) {
            this.bgmAudio = bgm;
            this.bgmAudio.loop = true;
            this.bgmAudio.play().catch(e => console.warn("BGM autoplay prevented:", e));
        }
    }

    private playSound(name: string): void {
        const sound = this.assetLoader.getSound(name);
        if (sound) {
            const clonedSound = sound.cloneNode() as HTMLAudioElement;
            clonedSound.volume = sound.volume;
            clonedSound.play().catch(e => console.warn(`Sound "${name}" autoplay prevented:`, e));
        }
    }

    // Ensures that the target number of food items are present on the grid.
    private spawnFoodUntilTarget(): void {
        while (this.state.food.length < this.config.initialFoodCount) {
            this.spawnSingleFood();
        }
    }

    // Spawns a single food item at a random, unoccupied location.
    private spawnSingleFood(): void {
        let attempts = 0;
        while (attempts < this.config.foodSpawnAttempts) {
            const x = Math.floor(Math.random() * this.config.gridSize);
            const y = Math.floor(Math.random() * this.config.gridSize);

            // Check if proposed food location is occupied by snake or existing food
            const isOccupiedBySnake = this.state.snake.some(segment => segment.x === x && segment.y === y);
            const isOccupiedByFood = this.state.food.some(item => item.x === x && item.y === y);

            if (!isOccupiedBySnake && !isOccupiedByFood) {
                this.state.food.push({ x, y }); // Add to the food array
                return;
            }
            attempts++;
        }
        console.warn('Could not spawn a single food after multiple attempts. Food count might be less than target.');
    }

    private loop(currentTime: number): void {
        if (this.state.gameOver && this.state.gameStarted) {
            this.drawGameOverScreen();
            return;
        }

        this.lastFrameTime = currentTime;

        if (this.state.gameStarted && !this.state.gameOver && currentTime - this.state.lastMoveTime > this.config.initialSpeedMs) {
            this.update();
            this.state.lastMoveTime = currentTime;
        }

        this.draw();

        this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
    }

    private update(): void {
        this.state.currentDirection = this.state.nextDirection;

        const head = { ...this.state.snake[0] };

        switch (this.state.currentDirection) {
            case 'UP': head.y--; break;
            case 'DOWN': head.y++; break;
            case 'LEFT': head.x--; break;
            case 'RIGHT': head.x++; break;
        }

        // --- Collision Detection ---

        let isGameOver = false;

        // 1. Wall collision
        if (head.x < 0 || head.x >= this.config.gridSize || head.y < 0 || head.y >= this.config.gridSize) {
            if (this.config.wallCollision === 'gameOver') {
                isGameOver = true;
            } else { // 'wrap'
                if (head.x < 0) head.x = this.config.gridSize - 1;
                else if (head.x >= this.config.gridSize) head.x = 0;
                if (head.y < 0) head.y = this.config.gridSize - 1;
                else if (head.y >= this.config.gridSize) head.y = 0;
            }
        }

        // 2. Self collision (only if selfCollision is true and after potential wrap)
        if (this.config.selfCollision) {
            // Check against all segments *except* the tail, which will be removed or moved
            for (let i = 0; i < this.state.snake.length - (this.state.snake.length > this.config.initialSnakeLength ? 0 : 1); i++) {
                if (head.x === this.state.snake[i].x && head.y === this.state.snake[i].y) {
                    isGameOver = true;
                    break;
                }
            }
        }

        if (isGameOver) {
            this.state.gameOver = true;
            this.playSound('gameOver');
            if (this.bgmAudio) { // Safely pause BGM
                this.bgmAudio.pause();
            }
            return;
        }

        // Add new head
        this.state.snake.unshift(head);

        // 3. Food collision
        let foodEatenIndex = -1;
        for (let i = 0; i < this.state.food.length; i++) {
            if (head.x === this.state.food[i].x && head.y === this.state.food[i].y) {
                foodEatenIndex = i;
                break;
            }
        }

        if (foodEatenIndex !== -1) {
            this.state.score += 1;
            this.playSound('eat');
            this.state.food.splice(foodEatenIndex, 1); // Remove the eaten food
            this.spawnSingleFood(); // Spawn a new food to replace the eaten one
        } else {
            this.state.snake.pop(); // Remove tail if no food eaten
        }
    }

    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.state.gameStarted) {
            this.drawTitleScreen();
            return;
        }

        // Draw Food(s)
        const foodImage = this.assetLoader.getImage('food');
        this.state.food.forEach(f => {
            if (f.x !== -1 && f.y !== -1) { // Only draw if food is spawned
                if (foodImage) {
                    this.ctx.drawImage(
                        foodImage,
                        f.x * this.cellSize,
                        f.y * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                } else {
                    this.ctx.fillStyle = this.config.colors.food;
                    this.ctx.fillRect(
                        f.x * this.cellSize,
                        f.y * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                }
            }
        });

        // Draw Snake
        const snakeHeadImage = this.assetLoader.getImage('snakeHead');
        const snakeBodyImage = this.assetLoader.getImage('snakeBody');

        this.state.snake.forEach((segment, index) => {
            const x = segment.x * this.cellSize;
            const y = segment.y * this.cellSize;

            if (index === 0 && snakeHeadImage) { // Head
                this.ctx.drawImage(snakeHeadImage, x, y, this.cellSize, this.cellSize);
            } else if (snakeBodyImage) { // Body
                this.ctx.drawImage(snakeBodyImage, x, y, this.cellSize, this.cellSize);
            } else { // Fallback to color
                this.ctx.fillStyle = index === 0 ? this.config.colors.snakeHead : this.config.colors.snakeBody;
                this.ctx.fillRect(x, y, this.cellSize, this.cellSize);
            }
        });

        // Draw Score
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = `${this.cellSize * 0.8}px Arial`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${this.config.text.scorePrefix}${this.state.score}`, 10, 10);

        if (this.state.gameOver) {
            this.drawGameOverScreen();
        }
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = 'rgba(200, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        this.ctx.font = `${this.canvas.width * 0.1}px Arial`;
        this.ctx.fillText(this.config.text.title, this.canvas.width / 2, this.canvas.height / 2 - this.cellSize * 2);

        this.ctx.font = `${this.canvas.width * 0.05}px Arial`;
        this.ctx.fillText(this.config.text.pressSpaceToStart, this.canvas.width / 2, this.canvas.height / 2 + this.cellSize);
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        this.ctx.font = `${this.canvas.width * 0.1}px Arial`;
        this.ctx.fillText(this.config.text.gameOver, this.canvas.width / 2, this.canvas.height / 2 - this.cellSize * 2);

        this.ctx.font = `${this.canvas.width * 0.05}px Arial`;
        this.ctx.fillText(`${this.config.text.scorePrefix}${this.state.score}`, this.canvas.width / 2, this.canvas.height / 2 - this.cellSize);

        this.ctx.font = `${this.canvas.width * 0.04}px Arial`;
        this.ctx.fillText(this.config.text.pressSpaceToStart, this.canvas.width / 2, this.canvas.height / 2 + this.cellSize);
    }

    public async init(): Promise<void> {
        this.lastFrameTime = performance.now();
        this.loop(this.lastFrameTime); // Start the loop to draw the title screen initially
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', async () => {
    const assetLoader = new AssetLoader();
    let config: GameConfig;
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const ctx = canvas ? canvas.getContext('2d') : null;

    try {
        if (!canvas || !ctx) {
            throw new Error('Canvas element or 2D rendering context not found.');
        }

        config = await assetLoader.loadConfig('data.json');
        await assetLoader.loadAssets();
        console.log("Game assets and config loaded.");

        const game = new SnakeGame('gameCanvas', config, assetLoader);
        await game.init();

    } catch (error) {
        console.error('Failed to initialize game:', error);
        if (canvas && ctx) {
            canvas.width = 600; // Default size for error display
            canvas.height = 600;
            ctx.fillStyle = 'red';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Error loading game. Check console for details.', canvas.width / 2, canvas.height / 2);
        } else {
            document.body.innerHTML = '<p style="color:red;">Error: Canvas element not found or context unavailable. See console.</p>';
        }
    }
});