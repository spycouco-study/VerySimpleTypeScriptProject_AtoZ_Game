interface ImageDataConfig {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundDataConfig {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface AssetConfig {
    images: ImageDataConfig[];
    sounds: SoundDataConfig[];
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
    titleText: string;
    startPromptText: string;
    gameOverText: string;
    restartPromptText: string;
    player: {
        width: number;
        height: number;
        speed: number; // pixels per second
        fireRateMs: number;
        health: number;
    };
    bullet: {
        width: number;
        height: number;
        speed: number; // pixels per second
        damage: number;
    };
    enemy: {
        width: number;
        height: number;
        speed: number; // pixels per second
        spawnIntervalMs: number;
        health: number;
        scoreValue: number;
    };
    gameFont: string;
}

interface GameData {
    gameSettings: GameSettings;
    assets: AssetConfig;
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER
}

class AssetLoader {
    images: Map<string, HTMLImageElement> = new Map();
    sounds: Map<string, HTMLAudioElement> = new Map();
    soundConfigs: Map<string, SoundDataConfig> = new Map();

    async load(assetConfig: AssetConfig): Promise<void> {
        const imagePromises = assetConfig.images.map(imgData => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = imgData.path;
                img.onload = () => {
                    this.images.set(imgData.name, img);
                    resolve();
                };
                img.onerror = () => reject(`Failed to load image: ${imgData.path}`);
            });
        });

        const soundPromises = assetConfig.sounds.map(soundData => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = soundData.path;
                audio.preload = 'auto';
                audio.oncanplaythrough = () => {
                    this.sounds.set(soundData.name, audio);
                    this.soundConfigs.set(soundData.name, soundData);
                    resolve();
                };
                audio.onerror = () => reject(`Failed to load sound: ${soundData.path}`);
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    playSound(name: string, loop: boolean = false): HTMLAudioElement | undefined {
        const audio = this.sounds.get(name);
        const config = this.soundConfigs.get(name);
        if (audio && config) {
            const clonedAudio = audio.cloneNode() as HTMLAudioElement;
            clonedAudio.volume = config.volume;
            clonedAudio.loop = loop;
            clonedAudio.play().catch(e => console.warn(`Sound playback failed for ${name}:`, e));
            return clonedAudio;
        }
        return undefined;
    }

    playBGM(name: string): HTMLAudioElement | undefined {
        const audio = this.sounds.get(name);
        const config = this.soundConfigs.get(name);
        if (audio && config) {
            audio.volume = config.volume;
            audio.loop = true;
            audio.play().catch(e => console.warn(`BGM playback failed for ${name}:`, e));
            return audio;
        }
        return undefined;
    }

    stopSound(audioInstance: HTMLAudioElement) {
        if (audioInstance) {
            audioInstance.pause();
            audioInstance.currentTime = 0;
        }
    }
}

class InputHandler {
    keys: Map<string, boolean> = new Map();
    clickRegistered: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', (e) => {
            this.keys.set(e.code, true);
            if (e.code === 'Space' || e.code === 'KeyR') {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys.set(e.code, false);
        });
        canvas.addEventListener('click', () => {
            this.clickRegistered = true;
        });
    }

    isKeyDown(code: string): boolean {
        return this.keys.get(code) || false;
    }

    resetClick(): void {
        this.clickRegistered = false;
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

    draw(ctx: CanvasRenderingContext2D, assetLoader: AssetLoader): void {
        const img = assetLoader.getImage(this.imageName);
        if (img) {
            ctx.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
    }

    collidesWith(other: GameObject): boolean {
        return this.x - this.width / 2 < other.x + other.width / 2 &&
               this.x + this.width / 2 > other.x - other.width / 2 &&
               this.y - this.height / 2 < other.y + other.height / 2 &&
               this.y + this.height / 2 > other.y - other.height / 2;
    }
}

class Player extends GameObject {
    health: number;
    lastShotTime: number = 0;
    fireRateMs: number;
    speed: number;

    constructor(x: number, y: number, width: number, height: number, imageName: string, settings: GameSettings['player']) {
        super(x, y, width, height, imageName);
        this.health = settings.health;
        this.fireRateMs = settings.fireRateMs;
        this.speed = settings.speed;
    }

    update(deltaTime: number, canvasWidth: number, canvasHeight: number, input: InputHandler): void {
        if (input.isKeyDown('ArrowLeft') || input.isKeyDown('KeyA')) {
            this.x -= this.speed * deltaTime;
        }
        if (input.isKeyDown('ArrowRight') || input.isKeyDown('KeyD')) {
            this.x += this.speed * deltaTime;
        }
        if (input.isKeyDown('ArrowUp') || input.isKeyDown('KeyW')) {
            this.y -= this.speed * deltaTime;
        }
        if (input.isKeyDown('ArrowDown') || input.isKeyDown('KeyS')) {
            this.y += this.speed * deltaTime;
        }

        this.x = Math.max(this.width / 2, Math.min(canvasWidth - this.width / 2, this.x));
        this.y = Math.max(this.height / 2, Math.min(canvasHeight - this.height / 2, this.y));
    }

    canShoot(currentTime: number): boolean {
        return currentTime - this.lastShotTime > this.fireRateMs;
    }

    shoot(currentTime: number, bulletSettings: GameSettings['bullet']): Bullet {
        this.lastShotTime = currentTime;
        return new Bullet(
            this.x,
            this.y - this.height / 2 - bulletSettings.height / 2,
            bulletSettings.width,
            bulletSettings.height,
            'bullet',
            bulletSettings.speed,
            bulletSettings.damage
        );
    }
}

class Bullet extends GameObject {
    speed: number;
    damage: number;
    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, damage: number) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.damage = damage;
    }

    update(deltaTime: number): void {
        this.y -= this.speed * deltaTime;
    }

    isOffscreen(canvasHeight: number): boolean {
        return this.y + this.height / 2 < 0;
    }
}

class Enemy extends GameObject {
    health: number;
    speed: number;
    scoreValue: number;

    constructor(x: number, y: number, width: number, height: number, imageName: string, settings: GameSettings['enemy']) {
        super(x, y, width, height, imageName);
        this.health = settings.health;
        this.speed = settings.speed;
        this.scoreValue = settings.scoreValue;
    }

    update(deltaTime: number): void {
        this.y += this.speed * deltaTime;
    }

    isOffscreen(canvasHeight: number): boolean {
        return this.y - this.height / 2 > canvasHeight;
    }
}

class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    assetLoader: AssetLoader;
    inputHandler: InputHandler;
    settings!: GameSettings;

    gameState: GameState = GameState.TITLE;
    lastFrameTime: DOMHighResTimeStamp = 0;
    player!: Player;
    bullets: Bullet[] = [];
    enemies: Enemy[] = [];
    score: number = 0;
    bgmInstance: HTMLAudioElement | undefined;

    lastEnemySpawnTime: number = 0;

    constructor(canvasId: string) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2D rendering context from canvas.');
        }
        this.ctx = ctx;

        this.assetLoader = new AssetLoader();
        this.inputHandler = new InputHandler(this.canvas);

        this.gameLoop = this.gameLoop.bind(this);
    }

    async start(): Promise<void> {
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const gameData: GameData = await response.json();
            this.settings = gameData.gameSettings;

            this.canvas.width = this.settings.canvasWidth;
            this.canvas.height = this.settings.canvasHeight;

            await this.assetLoader.load(gameData.assets);
            console.log('Assets loaded successfully!');

            this.lastFrameTime = performance.now();
            requestAnimationFrame(this.gameLoop);
        } catch (error) {
            console.error('Failed to load game data or assets:', error);
        }
    }

    initGame(): void {
        this.player = new Player(
            this.canvas.width / 2,
            this.canvas.height - this.settings.player.height,
            this.settings.player.width,
            this.settings.player.height,
            'player',
            this.settings.player
        );
        this.bullets = [];
        this.enemies = [];
        this.score = 0;
        this.lastEnemySpawnTime = performance.now();

        if (this.bgmInstance) {
            this.assetLoader.stopSound(this.bgmInstance);
        }
        this.bgmInstance = this.assetLoader.playBGM('bgm');
    }

    gameLoop(currentTime: DOMHighResTimeStamp): void {
        const deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;

        this.update(deltaTime, currentTime);
        this.draw();

        requestAnimationFrame(this.gameLoop);
    }

    update(deltaTime: number, currentTime: number): void {
        switch (this.gameState) {
            case GameState.TITLE:
                if (this.inputHandler.isKeyDown('Space') || this.inputHandler.clickRegistered) {
                    this.initGame();
                    this.gameState = GameState.PLAYING;
                    this.inputHandler.resetClick();
                }
                break;

            case GameState.PLAYING:
                this.player.update(deltaTime, this.canvas.width, this.canvas.height, this.inputHandler);

                if (this.inputHandler.isKeyDown('Space') && this.player.canShoot(currentTime)) {
                    const newBullet = this.player.shoot(currentTime, this.settings.bullet);
                    this.bullets.push(newBullet);
                    this.assetLoader.playSound('shoot');
                }

                this.bullets = this.bullets.filter(bullet => {
                    bullet.update(deltaTime);
                    return !bullet.isOffscreen(this.canvas.height);
                });

                if (currentTime - this.lastEnemySpawnTime > this.settings.enemy.spawnIntervalMs) {
                    const enemyX = Math.random() * (this.canvas.width - this.settings.enemy.width) + this.settings.enemy.width / 2;
                    const newEnemy = new Enemy(
                        enemyX,
                        -this.settings.enemy.height / 2,
                        this.settings.enemy.width,
                        this.settings.enemy.height,
                        'enemy',
                        this.settings.enemy
                    );
                    this.enemies.push(newEnemy);
                    this.lastEnemySpawnTime = currentTime;
                }

                this.enemies = this.enemies.filter(enemy => {
                    enemy.update(deltaTime);
                    if (enemy.isOffscreen(this.canvas.height)) {
                        this.player.health--;
                        this.assetLoader.playSound('hit');
                        return false;
                    }
                    return true;
                });

                this.bullets.forEach(bullet => {
                    this.enemies.forEach(enemy => {
                        if (bullet.collidesWith(enemy)) {
                            enemy.health -= bullet.damage;
                            bullet.x = -1000;
                            this.assetLoader.playSound('hit');
                            if (enemy.health <= 0) {
                                this.score += enemy.scoreValue;
                                enemy.x = -1000;
                            }
                        }
                    });
                });
                this.bullets = this.bullets.filter(bullet => bullet.x !== -1000);
                this.enemies = this.enemies.filter(enemy => enemy.x !== -1000);

                this.enemies.forEach(enemy => {
                    if (this.player.collidesWith(enemy)) {
                        this.player.health--;
                        enemy.x = -1000;
                        this.assetLoader.playSound('hit');
                    }
                });
                this.enemies = this.enemies.filter(enemy => enemy.x !== -1000);

                if (this.player.health <= 0) {
                    this.gameState = GameState.GAME_OVER;
                    if (this.bgmInstance) {
                        this.assetLoader.stopSound(this.bgmInstance);
                    }
                }
                break;

            case GameState.GAME_OVER:
                if (this.inputHandler.isKeyDown('KeyR')) {
                    this.gameState = GameState.TITLE;
                    this.inputHandler.keys.set('KeyR', false);
                }
                break;
        }
    }

    draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.settings.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const bgImg = this.assetLoader.getImage('background');
        if (bgImg) {
            this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawText(this.settings.titleText, this.canvas.width / 2, this.canvas.height / 2 - 50, 'white', '48px Arial');
                this.drawText(this.settings.startPromptText, this.canvas.width / 2, this.canvas.height / 2 + 20, 'white', this.settings.gameFont);
                break;

            case GameState.PLAYING:
                this.player.draw(this.ctx, this.assetLoader);
                this.bullets.forEach(bullet => bullet.draw(this.ctx, this.assetLoader));
                this.enemies.forEach(enemy => enemy.draw(this.ctx, this.assetLoader));

                this.drawText(`Score: ${this.score}`, 10, 30, 'white', this.settings.gameFont, 'left');
                this.drawText(`Health: ${this.player.health}`, this.canvas.width - 10, 30, 'white', this.settings.gameFont, 'right');
                break;

            case GameState.GAME_OVER:
                this.drawText(this.settings.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 50, 'white', '48px Arial');
                this.drawText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20, 'white', this.settings.gameFont);
                this.drawText(this.settings.restartPromptText, this.canvas.width / 2, this.canvas.height / 2 + 60, 'white', this.settings.gameFont);
                break;
        }
    }

    drawText(text: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'center'): void {
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
    }
}

window.addEventListener('load', () => {
    const game = new Game('gameCanvas');
    game.start();
});