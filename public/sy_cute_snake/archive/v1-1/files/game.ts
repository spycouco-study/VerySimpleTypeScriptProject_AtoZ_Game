interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    gridSize: number;
    initialSnakeLength: number;
    snakeSpeedMs: number;
    foodCount: number;
    backgroundColor: string;
    scorePerFood: number;
    wallColor: string;
}

interface GameText {
    title: string;
    pressSpace: string;
    instructionsTitle: string;
    instructions1: string;
    instructions2: string;
    instructions3: string;
    instructionsContinue: string;
    gameOver: string;
    yourScore: string;
    pressSpaceRestart: string;
}

interface GameAssetImageData { // Renamed from ImageData to avoid conflict with DOM's ImageData
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundData {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameData {
    gameSettings: GameSettings;
    text: GameText;
    assets: {
        images: GameAssetImageData[]; // Updated type here
        sounds: SoundData[];
    };
}

interface LoadedAssets {
    images: { [key: string]: HTMLImageElement };
    sounds: { [key: string]: HTMLAudioElement };
}

enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER,
}

enum Direction {
    UP,
    DOWN,
    LEFT,
    RIGHT,
    NONE, // For initial state or no movement
}

interface SnakeSegment {
    x: number;
    y: number;
}

interface Food {
    x: number;
    y: number;
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private data: GameData | null = null;
    private settings: GameSettings | null = null;
    private text: GameText | null = null;
    private assets: LoadedAssets = { images: {}, sounds: {} };

    private gameState: GameState = GameState.TITLE;
    private snake: SnakeSegment[] = [];
    private food: Food[] = [];
    private currentDirection: Direction = Direction.NONE;
    private pendingDirection: Direction = Direction.NONE;
    private score: number = 0;
    private lastUpdateTime: number = 0;
    private gameLoopIntervalId: number | null = null;
    private gameAnimationFrameId: number | null = null;
    private assetLoadPromises: Promise<void>[] = [];

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        if (!this.canvas || !this.ctx) {
            console.error("Canvas element not found or context not supported.");
            return;
        }

        this.init();
    }

    private async init(): Promise<void> {
        await this.loadGameData();
        if (this.data) {
            this.settings = this.data.gameSettings;
            this.text = this.data.text;
            this.canvas.width = this.settings.canvasWidth;
            this.canvas.height = this.settings.canvasHeight;
            await this.loadAssets();
        } else {
            console.error("Failed to load game data.");
            return;
        }

        this.addEventListeners();
        this.startRenderingLoop(); // Start the animation loop immediately for title screen
    }

    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.data = await response.json();
            console.log("Game data loaded:", this.data);
        } catch (error) {
            console.error("Error loading game data:", error);
            this.data = null;
        }
    }

    private async loadAssets(): Promise<void> {
        if (!this.data) return;

        this.data.assets.images.forEach(imgData => {
            const img = new Image();
            img.src = imgData.path;
            const promise = new Promise<void>((resolve, reject) => {
                img.onload = () => {
                    this.assets.images[imgData.name] = img;
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${imgData.path}`);
                    reject();
                };
            });
            this.assetLoadPromises.push(promise);
        });

        this.data.assets.sounds.forEach(soundData => {
            const audio = new Audio(soundData.path);
            audio.volume = soundData.volume;
            // Preload to ensure playback reliability
            const promise = new Promise<void>((resolve, reject) => {
                audio.oncanplaythrough = () => {
                    this.assets.sounds[soundData.name] = audio;
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load sound: ${soundData.path}`);
                    reject();
                };
            });
            this.assetLoadPromises.push(promise);
        });

        try {
            await Promise.all(this.assetLoadPromises);
            console.log("All assets loaded.");
        } catch (error) {
            console.error("Error loading some assets:", error);
        }
    }

    private addEventListeners(): void {
        document.addEventListener('keydown', this.handleInput.bind(this));
        // Add a click listener to the canvas to enable audio context in some browsers
        this.canvas.addEventListener('click', () => {
            if (this.gameState === GameState.TITLE && this.assets.sounds['bgm']) {
                this.loopSound('bgm'); // Try to play BGM on first interaction
                this.assets.sounds['bgm'].pause(); // Pause it for now, will play later
            }
        }, { once: true });
    }

    private handleInput(event: KeyboardEvent): void {
        switch (this.gameState) {
            case GameState.TITLE:
                if (event.code === 'Space') {
                    this.gameState = GameState.INSTRUCTIONS;
                    this.draw(); // Redraw immediately
                }
                break;
            case GameState.INSTRUCTIONS:
                if (event.code === 'Space') {
                    this.startGame();
                    this.gameState = GameState.PLAYING;
                }
                break;
            case GameState.PLAYING:
                this.handlePlayingInput(event.code);
                break;
            case GameState.GAME_OVER:
                if (event.code === 'Space') {
                    this.stopSound('game_over');
                    this.startGame();
                    this.gameState = GameState.PLAYING;
                }
                break;
        }
    }

    private handlePlayingInput(keyCode: string): void {
        const currentHead = this.snake[0];
        const nextSegment = this.snake[1] || { x: currentHead.x, y: currentHead.y }; // If snake has only head

        let newDirection: Direction = this.currentDirection;

        switch (keyCode) {
            case 'ArrowUp':
                if (this.currentDirection !== Direction.DOWN && !(currentHead.x === nextSegment.x && currentHead.y - 1 === nextSegment.y)) {
                    newDirection = Direction.UP;
                }
                break;
            case 'ArrowDown':
                if (this.currentDirection !== Direction.UP && !(currentHead.x === nextSegment.x && currentHead.y + 1 === nextSegment.y)) {
                    newDirection = Direction.DOWN;
                }
                break;
            case 'ArrowLeft':
                if (this.currentDirection !== Direction.RIGHT && !(currentHead.x - 1 === nextSegment.x && currentHead.y === nextSegment.y)) {
                    newDirection = Direction.LEFT;
                }
                break;
            case 'ArrowRight':
                if (this.currentDirection !== Direction.LEFT && !(currentHead.x + 1 === nextSegment.x && currentHead.y === nextSegment.y)) {
                    newDirection = Direction.RIGHT;
                }
                break;
        }

        // Only update pending direction if it's a valid change
        if (newDirection !== this.currentDirection) {
            this.pendingDirection = newDirection;
        }
    }


    private startGame(): void {
        if (!this.settings || !this.text) return;

        console.log("Starting new game...");
        this.stopSound('bgm'); // Ensure any previous BGM is stopped
        this.loopSound('bgm');
        this.score = 0;
        this.snake = [];
        this.food = [];
        this.currentDirection = Direction.RIGHT; // Start moving right
        this.pendingDirection = Direction.RIGHT;

        // Initialize snake in the middle-left
        const startX = Math.floor(this.settings.canvasWidth / this.settings.gridSize / 4);
        const startY = Math.floor(this.settings.canvasHeight / this.settings.gridSize / 2);
        for (let i = 0; i < this.settings.initialSnakeLength; i++) {
            this.snake.push({ x: startX - i, y: startY });
        }

        this.generateFood(this.settings.foodCount);

        // Clear previous interval if any and start new game loop
        if (this.gameLoopIntervalId !== null) {
            clearInterval(this.gameLoopIntervalId);
        }
        this.gameLoopIntervalId = setInterval(this.update.bind(this), this.settings.snakeSpeedMs) as unknown as number;

        this.lastUpdateTime = performance.now();
    }

    private startRenderingLoop(): void {
        const render = () => {
            this.draw();
            this.gameAnimationFrameId = requestAnimationFrame(render);
        };
        this.gameAnimationFrameId = requestAnimationFrame(render);
    }

    private update(): void {
        if (this.gameState === GameState.PLAYING) {
            this.updatePlaying();
        }
    }

    private updatePlaying(): void {
        if (!this.settings) return;

        // Update current direction from pending direction
        if (this.pendingDirection !== Direction.NONE) {
            this.currentDirection = this.pendingDirection;
            this.pendingDirection = Direction.NONE; // Reset pending after applying
        }


        const head = { ...this.snake[0] }; // Copy current head

        // Calculate new head position
        switch (this.currentDirection) {
            case Direction.UP: head.y--; break;
            case Direction.DOWN: head.y++; break;
            case Direction.LEFT: head.x--; break;
            case Direction.RIGHT: head.x++; break;
        }

        // Check for collisions
        if (this.checkCollision(head)) {
            this.endGame();
            return;
        }

        // Add new head
        this.snake.unshift(head);

        // Check for food consumption
        const foodEatenIndex = this.food.findIndex(f => f.x === head.x && f.y === head.y);
        if (foodEatenIndex !== -1) {
            this.score += this.settings.scorePerFood;
            this.food.splice(foodEatenIndex, 1); // Remove eaten food
            this.generateFood(1); // Generate new food
            this.playSound('eat');
        } else {
            this.snake.pop(); // Remove tail if no food eaten (normal movement)
        }
    }

    private checkCollision(head: SnakeSegment): boolean {
        if (!this.settings) return true; // Should not happen

        const gridWidth = this.settings.canvasWidth / this.settings.gridSize;
        const gridHeight = this.settings.canvasHeight / this.settings.gridSize;

        // Wall collision
        if (head.x < 0 || head.x >= gridWidth || head.y < 0 || head.y >= gridHeight) {
            return true;
        }

        // Self-collision (check against body segments, not the new head itself)
        for (let i = 1; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
                return true;
            }
        }

        return false;
    }

    private endGame(): void {
        console.log("Game Over!");
        this.gameState = GameState.GAME_OVER;
        if (this.gameLoopIntervalId !== null) {
            clearInterval(this.gameLoopIntervalId);
            this.gameLoopIntervalId = null;
        }
        this.stopSound('bgm');
        this.playSound('game_over');
    }

    private generateFood(count: number): void {
        if (!this.settings) return;

        const gridWidth = this.settings.canvasWidth / this.settings.gridSize;
        const gridHeight = this.settings.canvasHeight / this.settings.gridSize;

        for (let i = 0; i < count; i++) {
            let newFood: Food;
            let collision: boolean;
            do {
                newFood = {
                    x: Math.floor(Math.random() * gridWidth),
                    y: Math.floor(Math.random() * gridHeight),
                };
                collision = false;
                // Check if new food collides with snake
                for (const segment of this.snake) {
                    if (segment.x === newFood.x && segment.y === newFood.y) {
                        collision = true;
                        break;
                    }
                }
                // Check if new food collides with existing food
                if (!collision) {
                    for (const existingFood of this.food) {
                        if (existingFood.x === newFood.x && existingFood.y === newFood.y) {
                            collision = true;
                            break;
                        }
                    }
                }
            } while (collision);
            this.food.push(newFood);
        }
    }

    private draw(): void {
        if (!this.ctx || !this.settings || !this.text) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawPlaying();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawBackground(): void {
        if (!this.ctx || !this.settings) return;

        this.ctx.fillStyle = this.settings.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const backgroundTile = this.assets.images['background_tile'];
        if (backgroundTile) {
            const gridSize = this.settings.gridSize;
            for (let x = 0; x < this.canvas.width; x += gridSize) {
                for (let y = 0; y < this.canvas.height; y += gridSize) {
                    this.ctx.drawImage(backgroundTile, x, y, gridSize, gridSize);
                }
            }
        }
    }

    private drawTitleScreen(): void {
        if (!this.ctx || !this.text) return;

        this.ctx.font = '48px sans-serif';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.text.title, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.text.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawInstructionsScreen(): void {
        if (!this.ctx || !this.text) return;

        this.ctx.font = '36px sans-serif';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.text.instructionsTitle, this.canvas.width / 2, this.canvas.height / 2 - 120);

        this.ctx.font = '20px sans-serif';
        this.ctx.fillText(this.text.instructions1, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.fillText(this.text.instructions2, this.canvas.width / 2, this.canvas.height / 2 - 20);
        this.ctx.fillText(this.text.instructions3, this.canvas.width / 2, this.canvas.height / 2 + 10);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.text.instructionsContinue, this.canvas.width / 2, this.canvas.height / 2 + 80);
    }

    private drawPlaying(): void {
        if (!this.ctx || !this.settings) return;

        const gridSize = this.settings.gridSize;
        const snakeHeadImage = this.assets.images['snake_head'];
        const snakeBodyImage = this.assets.images['snake_body'];
        const foodBerryImage = this.assets.images['food_berry'];

        // Draw food
        this.food.forEach(f => {
            if (foodBerryImage) {
                this.ctx.drawImage(foodBerryImage, f.x * gridSize, f.y * gridSize, gridSize, gridSize);
            } else {
                this.ctx.fillStyle = 'red';
                this.ctx.fillRect(f.x * gridSize, f.y * gridSize, gridSize, gridSize);
            }
        });

        // Draw snake
        this.snake.forEach((segment, index) => {
            const x = segment.x * gridSize;
            const y = segment.y * gridSize;

            if (index === 0 && snakeHeadImage) { // Head
                this.ctx.save();
                this.ctx.translate(x + gridSize / 2, y + gridSize / 2); // Translate to center of cell
                let rotationAngle = 0;
                switch (this.currentDirection) {
                    case Direction.UP: rotationAngle = -Math.PI / 2; break; // -90 degrees
                    case Direction.DOWN: rotationAngle = Math.PI / 2; break; // 90 degrees
                    case Direction.LEFT: rotationAngle = Math.PI; break; // 180 degrees
                    case Direction.RIGHT: rotationAngle = 0; break; // 0 degrees
                }
                this.ctx.rotate(rotationAngle);
                this.ctx.drawImage(snakeHeadImage, -gridSize / 2, -gridSize / 2, gridSize, gridSize);
                this.ctx.restore();
            } else if (snakeBodyImage) { // Body
                this.ctx.drawImage(snakeBodyImage, x, y, gridSize, gridSize);
            } else { // Fallback to color
                this.ctx.fillStyle = index === 0 ? 'darkgreen' : 'green';
                this.ctx.fillRect(x, y, gridSize, gridSize);
            }
        });

        // Draw score
        this.ctx.font = '24px sans-serif';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`Score: ${this.score}`, 10, 10);
    }

    private drawGameOverScreen(): void {
        if (!this.ctx || !this.text) return;

        this.ctx.font = '48px sans-serif';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.text.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 80);

        this.ctx.font = '36px sans-serif';
        this.ctx.fillText(`${this.text.yourScore}${this.score}`, this.canvas.width / 2, this.canvas.height / 2);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.text.pressSpaceRestart, this.canvas.width / 2, this.canvas.height / 2 + 80);
    }

    private playSound(name: string): void {
        const audio = this.assets.sounds[name];
        if (audio) {
            audio.currentTime = 0; // Rewind to start
            audio.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e));
        }
    }

    private stopSound(name: string): void {
        const audio = this.assets.sounds[name];
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    private loopSound(name: string): void {
        const audio = this.assets.sounds[name];
        if (audio) {
            audio.loop = true;
            audio.play().catch(e => console.warn(`Audio loop playback failed for ${name}:`, e));
        }
    }
}

// Ensure the DOM is fully loaded before initializing the game
document.addEventListener('DOMContentLoaded', () => {
    // Check if the canvas element exists before creating the Game instance
    const gameCanvas = document.getElementById('gameCanvas');
    if (gameCanvas instanceof HTMLCanvasElement) {
        new Game('gameCanvas');
    } else {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        // Optionally, create a canvas programmatically if it's missing for testing/robustness
        const newCanvas = document.createElement('canvas');
        newCanvas.id = 'gameCanvas';
        document.body.appendChild(newCanvas);
        console.log("Created missing canvas element.");
        new Game('gameCanvas');
    }
});
