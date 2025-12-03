interface GameData {
    canvasWidth: number;
    canvasHeight: number;
    gameTitle: string;
    titleScreenInstruction: string;
    gameOverMessage: string;
    restartInstruction: string;
    player: {
        speed: number;
        width: number;
        height: number;
        imageName: string;
    };
    enemy: {
        spawnInterval: number;
        speedMin: number;
        speedMax: number;
        width: number;
        height: number;
        imageName: string;
        initialCount: number;
    };
    scoreIncrementPerSecond: number;
    backgroundColor: string;
    fontFamily: string;
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private loadedCount = 0;
    private totalAssets = 0;

    async loadAssets(data: GameData): Promise<void> {
        this.totalAssets = data.assets.images.length + data.assets.sounds.length;
        const imagePromises = data.assets.images.map(img => this.loadImage(img.name, img.path));
        const soundPromises = data.assets.sounds.map(snd => this.loadSound(snd.name, snd.path));

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private loadImage(name: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = path;
            img.onload = () => {
                this.images.set(name, img);
                this.loadedCount++;
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${path}`);
                reject(new Error(`Failed to load image: ${path}`));
            };
        });
    }

    private loadSound(name: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(path);
            audio.preload = 'auto'; // Ensure audio is preloaded
            audio.oncanplaythrough = () => {
                this.sounds.set(name, audio);
                this.loadedCount++;
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${path}`);
                reject(new Error(`Failed to load sound: ${path}`));
            };
        });
    }

    getImage(name: string): HTMLImageElement {
        const img = this.images.get(name);
        if (!img) {
            console.warn(`Image "${name}" not found.`);
            // Return a dummy image or throw an error to prevent crashes
            const dummy = new Image();
            dummy.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent pixel
            return dummy;
        }
        return img;
    }

    playSound(name: string, loop: boolean = false, volume: number = 1.0): void {
        const audio = this.sounds.get(name);
        if (audio) {
            // Create a new instance for simultaneous playback if needed, or just play the loaded one
            // For simple background music, the loaded one is fine. For effects, clone it.
            if (!loop) {
                const effect = audio.cloneNode() as HTMLAudioElement;
                effect.volume = volume;
                effect.play().catch(e => console.error("Sound play failed:", e));
            } else {
                audio.loop = loop;
                audio.volume = volume;
                audio.play().catch(e => console.error("BGM play failed:", e));
            }
        } else {
            console.warn(`Sound "${name}" not found.`);
        }
    }

    getLoadingProgress(): number {
        return this.totalAssets === 0 ? 0 : this.loadedCount / this.totalAssets;
    }
}

enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER
}

class InputManager {
    private keys: Set<string> = new Set();
    private mouseClicked: boolean = false;

    constructor() {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
    }

    private onKeyDown = (event: KeyboardEvent) => {
        this.keys.add(event.code);
    };

    private onKeyUp = (event: KeyboardEvent) => {
        this.keys.delete(event.code);
    };

    private onMouseDown = (event: MouseEvent) => {
        if (event.button === 0) { // Left click
            this.mouseClicked = true;
        }
    };

    private onMouseUp = (event: MouseEvent) => {
        if (event.button === 0) {
            this.mouseClicked = false;
        }
    };

    isKeyDown(code: string): boolean {
        return this.keys.has(code);
    }

    isMouseClicked(): boolean {
        const clicked = this.mouseClicked;
        // Reset for the next frame to detect single click
        if (clicked) this.mouseClicked = false;
        return clicked;
    }

    reset(): void {
        this.keys.clear();
        this.mouseClicked = false;
    }

    destroy(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
    }
}

class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    imageName: string;

    constructor(x: number, y: number, width: number, height: number, imageName: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageName = imageName;
    }

    draw(ctx: CanvasRenderingContext2D, assets: AssetManager): void {
        const image = assets.getImage(this.imageName);
        ctx.drawImage(image, this.x, this.y, this.width, this.height);
    }

    isCollidingWith(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

class Player extends GameObject {
    speed: number;
    canvasWidth: number;

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, canvasWidth: number) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.canvasWidth = canvasWidth;
    }

    update(deltaTime: number, input: InputManager): void {
        if (input.isKeyDown('ArrowLeft') || input.isKeyDown('KeyA')) {
            this.x -= this.speed * deltaTime;
        }
        if (input.isKeyDown('ArrowRight') || input.isKeyDown('KeyD')) {
            this.x += this.speed * deltaTime;
        }

        // Clamp player position to canvas bounds
        this.x = Math.max(0, Math.min(this.canvasWidth - this.width, this.x));
    }
}

class Enemy extends GameObject {
    velocityY: number;
    canvasHeight: number;

    constructor(x: number, y: number, width: number, height: number, imageName: string, velocityY: number, canvasHeight: number) {
        super(x, y, width, height, imageName);
        this.velocityY = velocityY;
        this.canvasHeight = canvasHeight;
    }

    update(deltaTime: number): void {
        this.y += this.velocityY * deltaTime;
    }

    isOffScreen(): boolean {
        return this.y > this.canvasHeight;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private data!: GameData;
    private assets: AssetManager = new AssetManager();
    private input: InputManager = new InputManager();

    private state: GameState = GameState.LOADING;
    private lastTime: DOMHighResTimeStamp = 0;
    private animationFrameId: number = 0;

    private player!: Player;
    private enemies: Enemy[] = [];
    private score: number = 0;
    private enemySpawnTimer: number = 0;

    constructor(canvasId: string) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            throw new Error(`Canvas element with ID "${canvasId}" not found.`);
        }
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D rendering context for canvas.');
        }
        this.ctx = ctx;
    }

    async start(): Promise<void> {
        await this.loadGameData();
        this.resizeCanvas(); // Set canvas size based on loaded data
        await this.assets.loadAssets(this.data);
        this.state = GameState.TITLE;
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
        this.assets.playSound('bgm', true, this.data.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.5);
    }

    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.data = await response.json() as GameData;
        } catch (error) {
            console.error('Failed to load game data:', error);
            alert('Failed to load game data. Please check data.json.');
            this.state = GameState.LOADING; // Stay in loading or error state
        }
    }

    private resizeCanvas(): void {
        this.canvas.width = this.data.canvasWidth;
        this.canvas.height = this.data.canvasHeight;
    }

    private initializeGame(): void {
        this.score = 0;
        this.enemies = [];
        this.enemySpawnTimer = 0;

        const playerData = this.data.player;
        this.player = new Player(
            (this.canvas.width - playerData.width) / 2,
            this.canvas.height - playerData.height - 20,
            playerData.width,
            playerData.height,
            playerData.imageName,
            playerData.speed,
            this.canvas.width
        );

        // Spawn initial enemies
        for (let i = 0; i < this.data.enemy.initialCount; i++) {
            this.spawnEnemy(true);
        }

        this.assets.playSound('game_start', false, this.data.assets.sounds.find(s => s.name === 'game_start')?.volume || 1.0);
    }

    private spawnEnemy(initialSpawn: boolean = false): void {
        const enemyData = this.data.enemy;
        const x = Math.random() * (this.canvas.width - enemyData.width);
        const y = initialSpawn ? Math.random() * -this.canvas.height : -enemyData.height; // Spawn off-screen top
        const velocityY = enemyData.speedMin + Math.random() * (enemyData.speedMax - enemyData.speedMin);
        this.enemies.push(new Enemy(x, y, enemyData.width, enemyData.height, enemyData.imageName, velocityY, this.canvas.height));
    }

    private gameLoop = (currentTime: DOMHighResTimeStamp) => {
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.draw();

        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    };

    private update(deltaTime: number): void {
        switch (this.state) {
            case GameState.LOADING:
                // Nothing to update, just display loading progress
                break;
            case GameState.TITLE:
                if (this.input.isMouseClicked() || this.input.isKeyDown('Space')) {
                    this.initializeGame();
                    this.state = GameState.PLAYING;
                }
                break;
            case GameState.PLAYING:
                this.player.update(deltaTime, this.input);

                // Update and remove off-screen enemies
                this.enemies = this.enemies.filter(enemy => {
                    enemy.update(deltaTime);
                    return !enemy.isOffScreen();
                });

                // Spawn new enemies
                this.enemySpawnTimer += deltaTime;
                if (this.enemySpawnTimer >= this.data.enemy.spawnInterval) {
                    this.spawnEnemy();
                    this.enemySpawnTimer = 0;
                }

                // Collision detection
                for (const enemy of this.enemies) {
                    if (this.player.isCollidingWith(enemy)) {
                        this.assets.playSound('hit_sound', false, this.data.assets.sounds.find(s => s.name === 'hit_sound')?.volume || 1.0);
                        this.state = GameState.GAME_OVER;
                        break;
                    }
                }

                this.score += this.data.scoreIncrementPerSecond * deltaTime;
                break;
            case GameState.GAME_OVER:
                if (this.input.isMouseClicked() || this.input.isKeyDown('Space')) {
                    this.initializeGame();
                    this.state = GameState.PLAYING;
                }
                break;
        }
    }

    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.data?.backgroundColor || '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.state) {
            case GameState.LOADING:
                this.drawLoadingScreen();
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                this.player.draw(this.ctx, this.assets);
                this.enemies.forEach(enemy => enemy.draw(this.ctx, this.assets));
                this.drawScore();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                this.drawScore(); // Show final score
                break;
        }
    }

    private drawLoadingScreen(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.font = `24px ${this.data?.fontFamily || 'Arial'}`;
        this.ctx.textAlign = 'center';
        const progress = (this.assets.getLoadingProgress() * 100).toFixed(0);
        this.ctx.fillText(`Loading... ${progress}%`, this.canvas.width / 2, this.canvas.height / 2);
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.font = `48px ${this.data.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.data.gameTitle, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = `24px ${this.data.fontFamily}`;
        this.ctx.fillText(this.data.titleScreenInstruction, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = 'red';
        this.ctx.font = `48px ${this.data.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.data.gameOverMessage, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.fillStyle = 'white';
        this.ctx.font = `24px ${this.data.fontFamily}`;
        this.ctx.fillText(this.data.restartInstruction, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    private drawScore(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.font = `20px ${this.data.fontFamily}`;
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 10, 30);
    }

    destroy(): void {
        cancelAnimationFrame(this.animationFrameId);
        this.input.destroy();
    }
}

// Ensure the HTML canvas element exists and then start the game
document.addEventListener('DOMContentLoaded', () => {
    const gameCanvas = document.createElement('canvas');
    gameCanvas.id = 'gameCanvas';
    document.body.appendChild(gameCanvas); // Add canvas to body if not already there (for testing flexibility)

    try {
        const game = new Game('gameCanvas');
        game.start();
    } catch (error) {
        console.error("Failed to initialize game:", error);
        alert("Game initialization failed. See console for details.");
    }
});