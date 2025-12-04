interface Point {
    x: number;
    y: number;
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    gridSize: number;
    initialSnakeLength: number;
    snakeSpeedInitialMs: number;
    snakeSpeedDecreaseMs: number;
    minSnakeSpeedMs: number;
    titleScreenText: string;
    gameOverText: string;
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

interface LoadedAssets {
    images: Map<string, HTMLImageElement>;
    sounds: Map<string, HTMLAudioElement>;
}

enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
    PAUSED
}

enum Direction {
    UP,
    DOWN,
    LEFT,
    RIGHT
}

class SnakeGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private settings!: GameSettings;
    private assets: LoadedAssets = { images: new Map(), sounds: new Map() };

    private currentState: GameState = GameState.LOADING;
    private lastFrameTime = 0;

    private snake: Point[] = [];
    private food: Point | null = null;
    private direction: Direction = Direction.RIGHT;
    private nextDirection: Direction = Direction.RIGHT;
    private score: number = 0;
    private currentSpeedMs: number = 0;
    private lastMoveTime: number = 0;
    private gameLoopId: number | null = null;

    private bgmAudio: HTMLAudioElement | null = null;
    private isBgmPlaying: boolean = false;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            console.error(`Canvas with ID '${canvasId}' not found.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d')!;
        if (!this.ctx) {
            console.error('Failed to get 2D rendering context for canvas.');
            return;
        }

        this.init();
    }

    private async init() {
        await this.loadGameData();
        await this.loadAssets();
        this.setupEventListeners();

        this.canvas.width = this.settings.canvasWidth;
        this.canvas.height = this.settings.canvasHeight;

        this.currentState = GameState.TITLE;
        this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.settings = await response.json();
        } catch (error) {
            console.error('Failed to load game data:', error);
            alert('Failed to load game data. Please check data.json.');
        }
    }

    private async loadAssets(): Promise<void> {
        const imagePromises = this.settings.assets.images.map(imgData => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = imgData.path;
                img.onload = () => {
                    this.assets.images.set(imgData.name, img);
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${imgData.path}`);
                    reject(`Failed to load image: ${imgData.path}`);
                };
            });
        });

        const soundPromises = this.settings.assets.sounds.map(soundData => {
            return new Promise<void>((resolve) => { // Don't reject for sounds, as they might load lazily
                const audio = new Audio(soundData.path);
                audio.preload = 'auto';
                audio.volume = soundData.volume;
                audio.oncanplaythrough = () => {
                    this.assets.sounds.set(soundData.name, audio);
                    resolve();
                };
                audio.onerror = () => {
                    console.warn(`Failed to load sound: ${soundData.path}. It might still play later.`);
                    this.assets.sounds.set(soundData.name, audio);
                    resolve();
                };
            });
        });

        try {
            await Promise.all([...imagePromises, ...soundPromises]);
            this.bgmAudio = this.assets.sounds.get('bgm') || null;
            if (this.bgmAudio) {
                this.bgmAudio.loop = true;
                this.bgmAudio.volume = this.settings.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.3;
            }
        } catch (error) {
            console.error('One or more assets failed to load:', error);
            alert('Failed to load some game assets. Check console for details.');
        }
    }

    private setupEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    private handleKeyDown(event: KeyboardEvent) {
        if (this.currentState === GameState.TITLE || this.currentState === GameState.GAME_OVER) {
            if (event.code === 'Space') {
                this.startGame();
                event.preventDefault();
            }
        } else if (this.currentState === GameState.PLAYING) {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    if (this.direction !== Direction.DOWN) this.nextDirection = Direction.UP;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    if (this.direction !== Direction.UP) this.nextDirection = Direction.DOWN;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    if (this.direction !== Direction.RIGHT) this.nextDirection = Direction.LEFT;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    if (this.direction !== Direction.LEFT) this.nextDirection = Direction.RIGHT;
                    break;
                case 'Escape':
                case 'KeyP':
                    this.pauseGame();
                    break;
            }
            event.preventDefault();
        } else if (this.currentState === GameState.PAUSED) {
            if (event.code === 'Escape' || event.code === 'KeyP') {
                this.resumeGame();
            }
        }
    }

    private startGame() {
        if (this.bgmAudio && !this.isBgmPlaying) {
            this.bgmAudio.play().then(() => {
                this.isBgmPlaying = true;
            }).catch(e => console.warn('BGM autoplay failed:', e));
        }

        this.snake = [];
        for (let i = 0; i < this.settings.initialSnakeLength; i++) {
            this.snake.push({
                x: Math.floor(this.settings.canvasWidth / this.settings.gridSize / 2) - i,
                y: Math.floor(this.settings.canvasHeight / this.settings.gridSize / 2)
            });
        }
        this.direction = Direction.RIGHT;
        this.nextDirection = Direction.RIGHT;
        this.score = 0;
        this.currentSpeedMs = this.settings.snakeSpeedInitialMs;
        this.food = null;
        this.spawnFood();
        this.lastMoveTime = performance.now();
        this.currentState = GameState.PLAYING;
    }

    private pauseGame() {
        if (this.currentState === GameState.PLAYING) {
            this.currentState = GameState.PAUSED;
            if (this.bgmAudio) this.bgmAudio.pause();
        }
    }

    private resumeGame() {
        if (this.currentState === GameState.PAUSED) {
            this.currentState = GameState.PLAYING;
            if (this.bgmAudio && this.isBgmPlaying) this.bgmAudio.play();
        }
    }

    private gameOver() {
        this.currentState = GameState.GAME_OVER;
        this.playSound('gameOver');
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.isBgmPlaying = false;
        }
    }

    private spawnFood() {
        const maxX = this.settings.canvasWidth / this.settings.gridSize - 1;
        const maxY = this.settings.canvasHeight / this.settings.gridSize - 1;

        let newFood: Point;
        do {
            newFood = {
                x: Math.floor(Math.random() * (maxX + 1)),
                y: Math.floor(Math.random() * (maxY + 1))
            };
        } while (this.snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));

        this.food = newFood;
    }

    private playSound(name: string) {
        const audio = this.assets.sounds.get(name);
        if (audio) {
            const clone = audio.cloneNode() as HTMLAudioElement;
            clone.volume = audio.volume;
            clone.play().catch(e => console.warn(`Failed to play sound '${name}':`, e));
        }
    }

    private gameLoop(timestamp: DOMHighResTimeStamp) {
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        this.update(deltaTime);
        this.render();

        this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number) {
        if (this.currentState === GameState.PLAYING) {
            this.direction = this.nextDirection;

            if (this.lastMoveTime + this.currentSpeedMs <= performance.now()) {
                this.lastMoveTime = performance.now();
                this.moveSnake();
            }
        }
    }

    private moveSnake() {
        const head = { ...this.snake[0] };

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

        const maxX = this.settings.canvasWidth / this.settings.gridSize;
        const maxY = this.settings.canvasHeight / this.settings.gridSize;

        if (head.x < 0 || head.x >= maxX || head.y < 0 || head.y >= maxY) {
            this.gameOver();
            return;
        }

        for (let i = 0; i < this.snake.length - (this.food ? 0 : 1); i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
                this.gameOver();
                return;
            }
        }

        this.snake.unshift(head);

        if (this.food && head.x === this.food.x && head.y === this.food.y) {
            this.score++;
            this.playSound('eatFood');
            this.spawnFood();

            this.currentSpeedMs = Math.max(
                this.settings.minSnakeSpeedMs,
                this.currentSpeedMs - this.settings.snakeSpeedDecreaseMs
            );
        } else {
            this.snake.pop();
        }
    }

    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.currentState === GameState.LOADING) {
            this.drawText('Loading...', this.canvas.width / 2, this.canvas.height / 2, 'white');
        } else if (this.currentState === GameState.TITLE) {
            this.drawText(this.settings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2, 'white');
            this.drawText('Use Arrow Keys / WASD to move', this.canvas.width / 2, this.canvas.height / 2 + 50, 'gray', 20);
            this.drawText('Eat food to grow!', this.canvas.width / 2, this.canvas.height / 2 + 80, 'gray', 20);
        } else if (this.currentState === GameState.PLAYING || this.currentState === GameState.PAUSED) {
            if (this.food) {
                this.drawImage('food', this.food.x * this.settings.gridSize, this.food.y * this.settings.gridSize, this.settings.gridSize, this.settings.gridSize);
            }

            this.snake.forEach((segment, index) => {
                const imgName = (index === 0) ? 'snakeHead' : 'snakeBody';
                this.drawImage(imgName, segment.x * this.settings.gridSize, segment.y * this.settings.gridSize, this.settings.gridSize, this.settings.gridSize);
            });

            this.drawText(`Score: ${this.score}`, 10, 30, 'white', 24, 'left');

            if (this.currentState === GameState.PAUSED) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.drawText('PAUSED', this.canvas.width / 2, this.canvas.height / 2, 'white', 48);
                this.drawText('Press ESC / P to Resume', this.canvas.width / 2, this.canvas.height / 2 + 50, 'gray', 20);
            }

        } else if (this.currentState === GameState.GAME_OVER) {
            this.drawText(this.settings.gameOverText + this.score, this.canvas.width / 2, this.canvas.height / 2, 'red');
            this.drawText('Press SPACE to Restart', this.canvas.width / 2, this.canvas.height / 2 + 50, 'white', 20);
        }
    }

    private drawImage(name: string, dx: number, dy: number, dWidth: number, dHeight: number) {
        const img = this.assets.images.get(name);
        if (img) {
            this.ctx.drawImage(img, dx, dy, dWidth, dHeight);
        } else {
            this.ctx.fillStyle = name === 'food' ? 'lime' : (name === 'snakeHead' ? 'blue' : 'green');
            this.ctx.fillRect(dx, dy, dWidth, dHeight);
        }
    }

    private drawText(text: string, x: number, y: number, color: string, fontSize: number = 36, textAlign: CanvasTextAlign = 'center') {
        this.ctx.fillStyle = color;
        this.ctx.font = `${fontSize}px Arial`;
        this.ctx.textAlign = textAlign;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('gameCanvas')) {
        new SnakeGame('gameCanvas');
    } else {
        const body = document.body;
        const canvas = document.createElement('canvas');
        canvas.id = 'gameCanvas';
        canvas.width = 800;
        canvas.height = 600;
        canvas.style.border = '1px solid white';
        canvas.style.display = 'block';
        canvas.style.margin = '50px auto';
        body.appendChild(canvas);
        console.warn("No canvas element with ID 'gameCanvas' found. A default one was created.");
        new SnakeGame('gameCanvas');
    }
});