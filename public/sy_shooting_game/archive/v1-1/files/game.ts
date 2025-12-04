interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    playerConfig: {
        spriteName: string;
        width: number;
        height: number;
        speed: number;
        fireRate: number; // bullets per second
        bulletSpriteName: string;
        bulletWidth: number;
        bulletHeight: number;
        bulletSpeed: number;
        bulletDamage: number;
        initialHealth: number;
    };
    enemyConfigs: {
        [key: string]: {
            spriteName: string;
            width: number;
            height: number;
            speed: number;
            fireRate: number;
            bulletSpriteName: string;
            bulletWidth: number;
            bulletHeight: number;
            bulletSpeed: number;
            bulletDamage: number;
            initialHealth: number;
            scoreValue: number;
        };
    };
    waveConfig: {
        waveDelay: number; // time before wave starts queuing after previous one completes
        enemies: {
            enemyType: string; // key from enemyConfigs
            count: number;
            spawnInterval: number; // delay between spawning each enemy in this group
            spawnXOffset?: number; // percentage of canvas width from left (0.0 to 1.0)
        }[];
    }[];
    backgroundConfig: {
        spriteName: string;
        scrollSpeed: number;
    };
    uiText: {
        title: string;
        instructions: string;
        gameOver: string;
        pressAnyKey: string;
        scoreLabel: string;
        healthLabel: string;
        startText: string;
        continueText: string;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
    soundConfig: {
        bgm: string;
        playerShoot: string;
        enemyShoot: string;
        explosion: string;
    };
}

enum GameState {
    LOADING,
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets: number = 0;
    private loadedAssets: number = 0;
    private onProgressCallback: ((progress: number) => void) | null = null;

    public setOnProgress(callback: (progress: number) => void) {
        this.onProgressCallback = callback;
    }

    private updateProgress() {
        this.loadedAssets++;
        if (this.onProgressCallback) {
            this.onProgressCallback(this.loadedAssets / this.totalAssets);
        }
    }

    public async load(assetsConfig: GameConfig['assets']): Promise<void> {
        this.totalAssets = assetsConfig.images.length + assetsConfig.sounds.length;
        this.loadedAssets = 0;

        const imagePromises = assetsConfig.images.map(img => {
            return new Promise<void>(resolve => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => {
                    this.images.set(img.name, image);
                    this.updateProgress();
                    resolve();
                };
                image.onerror = () => {
                    console.error(`Failed to load image: ${img.path}`);
                    this.updateProgress();
                    resolve();
                };
            });
        });

        const soundPromises = assetsConfig.sounds.map(snd => {
            return new Promise<void>(resolve => {
                const audio = new Audio(snd.path);
                audio.volume = snd.volume;
                audio.oncanplaythrough = () => {
                    this.sounds.set(snd.name, audio);
                    this.updateProgress();
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load sound: ${snd.path}`);
                    this.updateProgress();
                    resolve();
                };
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    public getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    public getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    public playSound(name: string, loop: boolean = false, volume?: number): void {
        const sound = this.getSound(name);
        if (sound) {
            const clone = sound.cloneNode() as HTMLAudioElement;
            if (volume !== undefined) {
                clone.volume = volume;
            } else {
                clone.volume = sound.volume;
            }
            clone.loop = loop;
            clone.play().catch(e => console.warn(`Audio playback failed for ${name}: ${e}`));
            if (!loop) {
                clone.onended = () => clone.remove();
            }
        }
    }
}

class GameObject {
    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number,
        public spriteName: string,
        public health: number = 1
    ) {}

    public draw(ctx: CanvasRenderingContext2D, assetManager: AssetManager): void {
        const image = assetManager.getImage(this.spriteName);
        if (image) {
            ctx.drawImage(image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'purple'; // Fallback for missing image
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    public isOffscreen(canvasWidth: number, canvasHeight: number): boolean {
        return this.y + this.height < 0 || this.y > canvasHeight || this.x + this.width < 0 || this.x > canvasWidth;
    }
}

class Player extends GameObject {
    private lastShotTime: number = 0;
    private fireInterval: number; // milliseconds between shots
    public score: number = 0;
    public maxHealth: number;

    constructor(
        x: number, y: number, width: number, height: number, spriteName: string,
        health: number, fireRate: number // fireRate is bullets per second
    ) {
        super(x, y, width, height, spriteName, health);
        this.fireInterval = 1000 / fireRate;
        this.maxHealth = health;
    }

    public canShoot(currentTime: number): boolean {
        return currentTime - this.lastShotTime > this.fireInterval;
    }

    public shoot(currentTime: number): void {
        this.lastShotTime = currentTime;
    }

    public takeDamage(amount: number): void {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
    }
}

class Bullet extends GameObject {
    constructor(
        x: number, y: number, width: number, height: number, spriteName: string,
        public speed: number,
        public damage: number,
        public isPlayerBullet: boolean
    ) {
        super(x, y, width, height, spriteName);
    }

    public update(deltaTime: number): void {
        this.y += this.speed * deltaTime;
    }
}

class Enemy extends GameObject {
    private lastShotTime: number = 0;
    private fireInterval: number; // milliseconds
    public scoreValue: number;
    public bulletSpriteName: string;
    public bulletWidth: number;
    public bulletHeight: number;
    public bulletSpeed: number;
    public bulletDamage: number;
    public speed: number;

    constructor(
        x: number, y: number, width: number, height: number, spriteName: string,
        health: number, speed: number, fireRate: number, scoreValue: number,
        bulletSpriteName: string, bulletWidth: number, bulletHeight: number,
        bulletSpeed: number, bulletDamage: number
    ) {
        super(x, y, width, height, spriteName, health);
        this.speed = speed;
        this.fireInterval = fireRate > 0 ? (1000 / fireRate) : 0;
        this.scoreValue = scoreValue;
        this.bulletSpriteName = bulletSpriteName;
        this.bulletWidth = bulletWidth;
        this.bulletHeight = bulletHeight;
        this.bulletSpeed = bulletSpeed;
        this.bulletDamage = bulletDamage;
    }

    public update(deltaTime: number): void {
        this.y += this.speed * deltaTime;
    }

    public canShoot(currentTime: number): boolean {
        return this.fireInterval > 0 && (currentTime - this.lastShotTime > this.fireInterval);
    }

    public shoot(currentTime: number): void {
        this.lastShotTime = currentTime;
    }

    public takeDamage(amount: number): void {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assetManager: AssetManager = new AssetManager();
    private gameState: GameState = GameState.LOADING;
    private lastTime: number = 0;
    private player!: Player;
    private bullets: Bullet[] = [];
    private enemies: Enemy[] = [];
    private keys: { [key: string]: boolean } = {};
    private backgroundY: number = 0;
    private currentWaveIndex: number = 0;
    private waveSpawnDelayTimer: number = 0; // Delay before next wave starts queuing
    private enemySpawnQueue: { enemyType: string, spawnTime: number, xOffset: number }[] = [];
    private waveActive: boolean = false; // True if enemies from current wave are being queued/spawned

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        this.init();
    }

    private async init(): Promise<void> {
        this.drawLoadingScreen(0);
        await this.loadConfig();
        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;
        this.ctx.imageSmoothingEnabled = false;

        this.assetManager.setOnProgress((progress) => this.drawLoadingScreen(progress));
        await this.assetManager.load(this.config.assets);
        
        this.assetManager.playSound(this.config.soundConfig.bgm, true);

        this.setupEventListeners();
        this.resetGame();
        this.gameState = GameState.TITLE;
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private async loadConfig(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
        } catch (error) {
            console.error('Failed to load game configuration:', error);
            alert('게임 설정을 불러오는데 실패했습니다. 게임을 시작할 수 없습니다.');
            this.gameState = GameState.GAME_OVER;
        }
    }

    private setupEventListeners(): void {
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
        window.addEventListener('click', this.handleClick.bind(this));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        this.keys[event.code] = true;
        if (event.code === 'Space' && (this.gameState === GameState.TITLE || this.gameState === GameState.INSTRUCTIONS || this.gameState === GameState.GAME_OVER)) {
            this.progressGameState();
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        this.keys[event.code] = false;
    }

    private handleClick(event: MouseEvent): void {
        if (this.gameState === GameState.TITLE || this.gameState === GameState.INSTRUCTIONS || this.gameState === GameState.GAME_OVER) {
            this.progressGameState();
        }
    }

    private progressGameState(): void {
        if (this.gameState === GameState.TITLE) {
            this.gameState = GameState.INSTRUCTIONS;
        } else if (this.gameState === GameState.INSTRUCTIONS) {
            this.startGame();
        } else if (this.gameState === GameState.GAME_OVER) {
            this.resetGame();
            this.gameState = GameState.TITLE;
        }
    }

    private resetGame(): void {
        const pConf = this.config.playerConfig;
        this.player = new Player(
            (this.canvas.width - pConf.width) / 2,
            this.canvas.height - pConf.height - 30,
            pConf.width, pConf.height, pConf.spriteName,
            pConf.initialHealth, pConf.fireRate
        );
        this.bullets = [];
        this.enemies = [];
        this.player.score = 0;
        this.currentWaveIndex = 0;
        this.waveSpawnDelayTimer = 0;
        this.enemySpawnQueue = [];
        this.waveActive = false;
        this.backgroundY = 0;
    }

    private startGame(): void {
        this.resetGame();
        this.gameState = GameState.PLAYING;
    }

    private gameLoop(currentTime: number): void {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime, currentTime);
        this.draw();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number, currentTime: number): void {
        if (this.gameState === GameState.PLAYING) {
            this.updatePlayer(deltaTime, currentTime);
            this.updateBullets(deltaTime);
            this.updateEnemies(deltaTime, currentTime);
            this.handleCollisions();
            this.removeOffscreenObjects();
            this.scrollBackground(deltaTime);
            this.updateWaves(deltaTime, currentTime);

            if (this.player.health <= 0) {
                this.gameState = GameState.GAME_OVER;
                this.assetManager.playSound(this.config.soundConfig.explosion);
            }
        }
    }

    private updatePlayer(deltaTime: number, currentTime: number): void {
        const pConf = this.config.playerConfig;
        const playerSpeed = pConf.speed;

        if (this.keys['ArrowLeft'] || this.keys['KeyA']) {
            this.player.x -= playerSpeed * deltaTime;
        }
        if (this.keys['ArrowRight'] || this.keys['KeyD']) {
            this.player.x += playerSpeed * deltaTime;
        }
        if (this.keys['ArrowUp'] || this.keys['KeyW']) {
            this.player.y -= playerSpeed * deltaTime;
        }
        if (this.keys['ArrowDown'] || this.keys['KeyS']) {
            this.player.y += playerSpeed * deltaTime;
        }

        this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
        this.player.y = Math.max(0, Math.min(this.canvas.height - this.player.height, this.player.y));

        if ((this.keys['Space'] || this.keys['KeyJ']) && this.player.canShoot(currentTime)) {
            this.player.shoot(currentTime);
            this.bullets.push(new Bullet(
                this.player.x + (this.player.width - pConf.bulletWidth) / 2,
                this.player.y,
                pConf.bulletWidth, pConf.bulletHeight, pConf.bulletSpriteName,
                -pConf.bulletSpeed, pConf.bulletDamage, true
            ));
            this.assetManager.playSound(this.config.soundConfig.playerShoot);
        }
    }

    private updateBullets(deltaTime: number): void {
        this.bullets.forEach(bullet => bullet.update(deltaTime));
    }

    private updateEnemies(deltaTime: number, currentTime: number): void {
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime);

            if (enemy.canShoot(currentTime)) {
                enemy.shoot(currentTime);
                this.bullets.push(new Bullet(
                    enemy.x + (enemy.width - enemy.bulletWidth) / 2,
                    enemy.y + enemy.height,
                    enemy.bulletWidth, enemy.bulletHeight, enemy.bulletSpriteName,
                    enemy.bulletSpeed, enemy.bulletDamage, false
                ));
                this.assetManager.playSound(this.config.soundConfig.enemyShoot, false, 0.3);
            }
        });
    }

    private handleCollisions(): void {
        this.bullets = this.bullets.filter(bullet => {
            if (!bullet.isPlayerBullet) return true;

            let hitEnemy = false;
            this.enemies = this.enemies.filter(enemy => {
                if (checkCollision(bullet, enemy)) {
                    enemy.takeDamage(bullet.damage);
                    if (enemy.health <= 0) {
                        this.player.score += enemy.scoreValue;
                        this.assetManager.playSound(this.config.soundConfig.explosion);
                        return false;
                    }
                    hitEnemy = true;
                    return true;
                }
                return true;
            });
            return !hitEnemy;
        });

        this.bullets = this.bullets.filter(bullet => {
            if (bullet.isPlayerBullet) return true;

            if (checkCollision(bullet, this.player)) {
                this.player.takeDamage(bullet.damage);
                this.assetManager.playSound(this.config.soundConfig.explosion, false, 0.5);
                return false;
            }
            return true;
        });
    }

    private removeOffscreenObjects(): void {
        this.bullets = this.bullets.filter(b => !b.isOffscreen(this.canvas.width, this.canvas.height));
        this.enemies = this.enemies.filter(e => !e.isOffscreen(this.canvas.width, this.canvas.height));
    }

    private scrollBackground(deltaTime: number): void {
        const bgImage = this.assetManager.getImage(this.config.backgroundConfig.spriteName);
        if (bgImage) {
            const tileWidth = this.canvas.width;
            const tileHeight = bgImage.height * (this.canvas.width / bgImage.width);

            this.backgroundY += this.config.backgroundConfig.scrollSpeed * deltaTime;
            if (this.backgroundY >= tileHeight) {
                this.backgroundY -= tileHeight;
            }
        }
    }

    private updateWaves(deltaTime: number, currentTime: number): void {
        // If all enemies from the previous wave are cleared and no more enemies are in queue,
        // and we haven't processed all waves, then start the delay for the next wave.
        if (this.currentWaveIndex < this.config.waveConfig.length && !this.waveActive && this.enemies.length === 0 && this.enemySpawnQueue.length === 0) {
            this.waveSpawnDelayTimer -= deltaTime;
            if (this.waveSpawnDelayTimer <= 0) {
                const wave = this.config.waveConfig[this.currentWaveIndex];
                let relativeSpawnTime = 0;

                wave.enemies.forEach(group => {
                    for (let i = 0; i < group.count; i++) {
                        const randomXOffset = (Math.random() * 0.2 - 0.1) + (group.spawnXOffset !== undefined ? group.spawnXOffset : 0.5);
                        this.enemySpawnQueue.push({
                            enemyType: group.enemyType,
                            spawnTime: currentTime + relativeSpawnTime,
                            xOffset: randomXOffset
                        });
                        relativeSpawnTime += group.spawnInterval;
                    }
                });
                this.enemySpawnQueue.sort((a, b) => a.spawnTime - b.spawnTime);
                this.waveActive = true;
                this.currentWaveIndex++;
                if (this.currentWaveIndex < this.config.waveConfig.length) {
                    this.waveSpawnDelayTimer = this.config.waveConfig[this.currentWaveIndex].waveDelay;
                } else {
                    this.waveSpawnDelayTimer = Infinity; // All waves processed
                }
            }
        }

        // Spawn enemies from queue if their absolute spawn time is reached
        while (this.enemySpawnQueue.length > 0 && this.enemySpawnQueue[0].spawnTime <= currentTime) {
            const nextSpawn = this.enemySpawnQueue.shift();
            if (nextSpawn) {
                const enemyConf = this.config.enemyConfigs[nextSpawn.enemyType];
                if (enemyConf) {
                    const spawnX = this.canvas.width * nextSpawn.xOffset;
                    this.enemies.push(new Enemy(
                        spawnX - enemyConf.width / 2,
                        -enemyConf.height,
                        enemyConf.width, enemyConf.height, enemyConf.spriteName,
                        enemyConf.initialHealth, enemyConf.speed, enemyConf.fireRate,
                        enemyConf.scoreValue, enemyConf.bulletSpriteName,
                        enemyConf.bulletWidth, enemyConf.bulletHeight,
                        enemyConf.bulletSpeed, enemyConf.bulletDamage
                    ));
                }
            }
            if (this.enemySpawnQueue.length === 0) {
                this.waveActive = false; // All enemies from the current wave have been queued
            }
        }
    }


    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawBackground();

        switch (this.gameState) {
            case GameState.LOADING:
                // Handled by drawLoadingScreen
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawGamePlaying();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawBackground(): void {
        const bgImage = this.assetManager.getImage(this.config.backgroundConfig.spriteName);
        if (bgImage) {
            const tileWidth = this.canvas.width;
            const tileHeight = bgImage.height * (this.canvas.width / bgImage.width);

            let currentY = this.backgroundY % tileHeight;
            if (currentY > 0) currentY -= tileHeight;

            for (let y = currentY; y < this.canvas.height; y += tileHeight) {
                this.ctx.drawImage(bgImage, 0, y, tileWidth, tileHeight);
            }
        }
    }
    
    private drawLoadingScreen(progress: number): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Loading Game...', this.canvas.width / 2, this.canvas.height / 2 - 20);

        this.ctx.strokeStyle = 'white';
        this.ctx.strokeRect(this.canvas.width / 2 - 100, this.canvas.height / 2 + 10, 200, 20);
        this.ctx.fillStyle = 'green';
        this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2 + 10, 200 * progress, 20);
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.uiText.title, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.uiText.startText, this.canvas.width / 2, this.canvas.height / 2 + 50);
        this.ctx.fillText(this.config.uiText.pressAnyKey, this.canvas.width / 2, this.canvas.height / 2 + 80);
    }

    private drawInstructionsScreen(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '28px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('조작법', this.canvas.width / 2, 100);

        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        const instructionLines = this.config.uiText.instructions.split('\n');
        instructionLines.forEach((line, index) => {
            this.ctx.fillText(line, this.canvas.width / 2 - 150, 150 + index * 30);
        });

        this.ctx.textAlign = 'center';
        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.uiText.continueText, this.canvas.width / 2, this.canvas.height - 100);
        this.ctx.fillText(this.config.uiText.pressAnyKey, this.canvas.width / 2, this.canvas.height - 70);
    }

    private drawGamePlaying(): void {
        this.player.draw(this.ctx, this.assetManager);
        this.bullets.forEach(bullet => bullet.draw(this.ctx, this.assetManager));
        this.enemies.forEach(enemy => enemy.draw(this.ctx, this.assetManager));

        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${this.config.uiText.scoreLabel} ${this.player.score}`, 10, 30);
        this.ctx.fillText(`${this.config.uiText.healthLabel} ${this.player.health}/${this.player.maxHealth}`, 10, 60);
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = 'red';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.uiText.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`${this.config.uiText.scoreLabel} ${this.player.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20);
        this.ctx.fillText(this.config.uiText.pressAnyKey, this.canvas.width / 2, this.canvas.height / 2 + 70);
    }
}

function checkCollision(obj1: GameObject, obj2: GameObject): boolean {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

document.addEventListener('DOMContentLoaded', () => {
    new Game('gameCanvas');
});
