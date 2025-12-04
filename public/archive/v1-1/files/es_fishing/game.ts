interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    titleScreen: {
        text: string;
        font: string;
        color: string;
        pressKeyText: string;
    };
    gameOverScreen: {
        text: string;
        font: string;
        color: string;
        pressKeyText: string;
        scoreText: string;
    };
    player: {
        imageName: string;
        width: number;
        height: number;
        speed: number;
    };
    fallingObjects: {
        spawnInterval: number; // milliseconds
        minSpeed: number;
        maxSpeed: number;
        types: {
            imageName: string;
            width: number;
            height: number;
        }[];
    };
    gameplay: {
        scoreIncrementPerSecond: number;
        bgmName: string;
        hitSoundName: string;
        gameOverSoundName: string;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

class AssetLoader {
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private audioCache: Map<string, HTMLAudioElement> = new Map();
    private config: GameConfig | null = null;

    async loadConfig(path: string): Promise<GameConfig> {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.statusText}`);
        }
        this.config = await response.json();
        return this.config;
    }

    async loadAssets(): Promise<void> {
        if (!this.config) {
            throw new Error("Config not loaded. Call loadConfig first.");
        }

        const imagePromises = this.config.assets.images.map(imgData => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = imgData.path;
                img.onload = () => {
                    this.imageCache.set(imgData.name, img);
                    resolve();
                };
                img.onerror = () => reject(`Failed to load image: ${imgData.path}`);
            });
        });

        const audioPromises = this.config.assets.sounds.map(soundData => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio(soundData.path);
                audio.oncanplay = () => {
                    audio.volume = soundData.volume;
                    this.audioCache.set(soundData.name, audio);
                    resolve();
                };
                audio.onerror = () => reject(`Failed to load audio: ${soundData.path}`);
            });
        });

        await Promise.all([...imagePromises, ...audioPromises]);
        console.log("All assets loaded.");
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.imageCache.get(name);
    }

    getAudio(name: string): HTMLAudioElement | undefined {
        return this.audioCache.get(name);
    }

    playAudio(name: string, loop: boolean = false): HTMLAudioElement | undefined {
        const audio = this.audioCache.get(name);
        if (audio) {
            if (!loop) {
                // Clone audio for simultaneous playback of sound effects
                const clone = audio.cloneNode() as HTMLAudioElement;
                clone.volume = audio.volume; 
                clone.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e));
                return clone;
            } else {
                audio.loop = true;
                audio.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e));
                return audio;
            }
        }
        return undefined;
    }

    stopAudio(name: string) {
        const audio = this.audioCache.get(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
}

class Player {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    image: HTMLImageElement;
    canvasWidth: number;

    constructor(config: GameConfig, image: HTMLImageElement, canvasWidth: number) {
        this.width = config.player.width;
        this.height = config.player.height;
        this.x = (canvasWidth - this.width) / 2;
        this.y = config.canvasHeight - this.height - 10;
        this.speed = config.player.speed;
        this.image = image;
        this.canvasWidth = canvasWidth;
    }

    update(deltaTime: number, input: InputHandler) {
        if (input.isKeyPressed("ArrowLeft") || input.isKeyPressed("a")) {
            this.x -= this.speed * deltaTime;
        }
        if (input.isKeyPressed("ArrowRight") || input.isKeyPressed("d")) {
            this.x += this.speed * deltaTime;
        }

        if (this.x < 0) this.x = 0;
        if (this.x > this.canvasWidth - this.width) this.x = this.canvasWidth - this.width;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

class FallingObject {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    image: HTMLImageElement;

    constructor(x: number, y: number, width: number, height: number, speed: number, image: HTMLImageElement) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.image = image;
    }

    update(deltaTime: number) {
        this.y += this.speed * deltaTime;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

class InputHandler {
    private pressedKeys: Set<string> = new Set();

    constructor() {
        window.addEventListener("keydown", (e) => this.pressedKeys.add(e.key));
        window.addEventListener("keyup", (e) => this.pressedKeys.delete(e.key));
    }

    isKeyPressed(key: string): boolean {
        return this.pressedKeys.has(key);
    }

    consumeKey(key: string): boolean {
        if (this.pressedKeys.has(key)) {
            this.pressedKeys.delete(key);
            return true;
        }
        return false;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig | null = null;
    private assetLoader: AssetLoader;
    private inputHandler: InputHandler;

    private gameState: GameState = GameState.TITLE;
    private lastTime: number = 0;
    private animationFrameId: number | null = null;

    private player: Player | null = null;
    private fallingObjects: FallingObject[] = [];
    private score: number = 0;
    private lastSpawnTime: number = 0;
    private bgmAudio: HTMLAudioElement | undefined;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext("2d")!;
        this.assetLoader = new AssetLoader();
        this.inputHandler = new InputHandler();
    }

    async init() {
        try {
            this.config = await this.assetLoader.loadConfig("data.json");
            this.canvas.width = this.config.canvasWidth;
            this.canvas.height = this.config.canvasHeight;
            await this.assetLoader.loadAssets();
            this.setupInitialState();
            this.startLoop(); 
        } catch (error) {
            console.error("Game initialization failed:", error);
            this.ctx.font = "24px Arial";
            this.ctx.fillStyle = "red";
            this.ctx.fillText("Failed to load game. Check console for errors.", 10, 50);
        }
    }

    private setupInitialState() {
        if (!this.config) return;
        const playerImage = this.assetLoader.getImage(this.config.player.imageName);
        if (!playerImage) throw new Error(`Player image '${this.config.player.imageName}' not found.`);
        this.player = new Player(this.config, playerImage, this.canvas.width);
        this.fallingObjects = [];
        this.score = 0;
        this.lastSpawnTime = 0;
        // Stop any currently playing BGM
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio.loop = false;
        }
        this.bgmAudio = undefined;
    }

    private startLoop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.lastTime = performance.now();
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    private stopLoop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private gameLoop(currentTime: number) {
        const deltaTime = (currentTime - this.lastTime) / 1000; // in seconds
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number) {
        if (!this.config) return;

        switch (this.gameState) {
            case GameState.TITLE:
                if (this.inputHandler.consumeKey("Enter")) {
                    this.startGame();
                }
                break;
            case GameState.PLAYING:
                if (!this.player) return;

                this.player.update(deltaTime, this.inputHandler);

                for (let i = this.fallingObjects.length - 1; i >= 0; i--) {
                    const obj = this.fallingObjects[i];
                    obj.update(deltaTime);

                    if (this.checkCollision(this.player, obj)) {
                        this.assetLoader.playAudio(this.config.gameplay.hitSoundName);
                        this.gameOver();
                        return;
                    }

                    if (obj.y > this.canvas.height) {
                        this.fallingObjects.splice(i, 1);
                    }
                }
                
                this.lastSpawnTime += deltaTime * 1000; 
                if (this.lastSpawnTime >= this.config.fallingObjects.spawnInterval) {
                    this.spawnFallingObject();
                    this.lastSpawnTime = 0;
                }

                this.score += this.config.gameplay.scoreIncrementPerSecond * deltaTime;
                break;
            case GameState.GAME_OVER:
                if (this.inputHandler.consumeKey("Enter")) {
                    this.startGame(); 
                }
                break;
        }
    }

    private render() {
        if (!this.config) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                if (this.player) {
                    this.player.draw(this.ctx);
                }
                this.fallingObjects.forEach(obj => obj.draw(this.ctx));
                this.drawScore();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawTitleScreen() {
        if (!this.config) return;
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = this.config.titleScreen.color;
        this.ctx.font = `bold 48px ${this.config.titleScreen.font}`;
        this.ctx.fillText(this.config.titleScreen.text, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = `24px ${this.config.titleScreen.font}`;
        this.ctx.fillText(this.config.titleScreen.pressKeyText, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    private drawGameOverScreen() {
        if (!this.config) return;
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = this.config.gameOverScreen.color;
        this.ctx.font = `bold 48px ${this.config.gameOverScreen.font}`;
        this.ctx.fillText(this.config.gameOverScreen.text, this.canvas.width / 2, this.canvas.height / 2 - 80);

        this.ctx.font = `bold 36px ${this.config.gameOverScreen.font}`;
        this.ctx.fillText(`${this.config.gameOverScreen.scoreText} ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2 - 20);

        this.ctx.font = `24px ${this.config.gameOverScreen.font}`;
        this.ctx.fillText(this.config.gameOverScreen.pressKeyText, this.canvas.width / 2, this.canvas.height / 2 + 40);
    }

    private drawScore() {
        if (!this.config) return;
        this.ctx.textAlign = "left";
        this.ctx.fillStyle = "white";
        this.ctx.font = "20px Arial";
        this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 10, 30);
    }

    private spawnFallingObject() {
        if (!this.config) return;
        const objectTypes = this.config.fallingObjects.types;
        const randomType = objectTypes[Math.floor(Math.random() * objectTypes.length)];
        const objectImage = this.assetLoader.getImage(randomType.imageName);
        if (!objectImage) {
            console.warn(`Falling object image '${randomType.imageName}' not found.`);
            return;
        }

        const x = Math.random() * (this.canvas.width - randomType.width);
        const speed = Math.random() * (this.config.fallingObjects.maxSpeed - this.config.fallingObjects.minSpeed) + this.config.fallingObjects.minSpeed;

        this.fallingObjects.push(new FallingObject(x, -randomType.height, randomType.width, randomType.height, speed, objectImage));
    }

    private checkCollision(rect1: { x: number; y: number; width: number; height: number; }, rect2: { x: number; y: number; width: number; height: number; }): boolean {
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    }

    private startGame() {
        if (!this.config) return;
        console.log("Starting game...");
        this.setupInitialState(); // Reset game state including BGM
        this.gameState = GameState.PLAYING;
        this.bgmAudio = this.assetLoader.playAudio(this.config.gameplay.bgmName, true); 
    }

    private gameOver() {
        if (!this.config) return;
        console.log("Game Over!");
        this.gameState = GameState.GAME_OVER;
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio.loop = false; 
        }
        this.assetLoader.playAudio(this.config.gameplay.gameOverSoundName);
    }
}

window.onload = () => {
    const game = new Game("gameCanvas");
    game.init();
};