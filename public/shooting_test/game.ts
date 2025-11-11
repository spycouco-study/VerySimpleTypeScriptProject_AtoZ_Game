interface GameData {
    canvas: { width: number; height: number; };
    player: {
        assetId: string;
        speed: number;
        health: number;
        fireRate: number; // bullets per second
        bulletDamage: number;
        width: number; // object rendering size
        height: number;
    };
    playerBullet: {
        assetId: string;
        speed: number;
        damage: number;
        width: number;
        height: number;
    };
    enemies: {
        type: string;
        assetId: string;
        health: number;
        speed: number;
        fireRate: number;
        bulletDamage: number;
        scoreValue: number;
        spawnIntervalMs: number;
        width: number;
        height: number;
    }[];
    enemyBullet: {
        assetId: string;
        speed: number;
        damage: number;
        width: number;
        height: number;
    };
    background: {
        assetId: string;
        scrollSpeed: number; // pixels per second
    };
    explosion: {
        assetId: string;
        lifetime: number; // seconds
        width: number;
        height: number;
    };
    game: {
        initialLives: number;
        enemySpawnStartDelayMs: number;
        maxEnemiesOnScreen: number;
    };
    assets: {
        images: { path: string; id: string; width: number; height: number; }[];
        sounds: { path: string; id: string; duration_seconds: number; volume: number; }[];
    };
}

class AssetManager {
    private loadedImages: Map<string, HTMLImageElement> = new Map();
    private loadedSounds: Map<string, HTMLAudioElement> = new Map();

    async loadImage(assetConfig: { path: string; id: string; }): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = assetConfig.path;
            img.onload = () => {
                this.loadedImages.set(assetConfig.id, img);
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${assetConfig.path}`);
                reject();
            };
        });
    }

    async loadSound(assetConfig: { path: string; id: string; duration_seconds: number; volume: number; }): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(assetConfig.path);
            audio.preload = 'auto';
            audio.volume = assetConfig.volume;
            // Safari/iOS require user interaction to play audio, so oncanplaythrough might not be enough.
            // But for desktop browser, this is generally fine for preloading.
            audio.oncanplaythrough = () => {
                this.loadedSounds.set(assetConfig.id, audio);
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${assetConfig.path}`);
                reject();
            };
        });
    }

    getImage(id: string): HTMLImageElement | undefined {
        return this.loadedImages.get(id);
    }

    playSound(id: string, loop: boolean = false): void {
        const sound = this.loadedSounds.get(id);
        if (sound) {
            const clone = sound.cloneNode() as HTMLAudioElement;
            clone.volume = sound.volume;
            clone.loop = loop;
            clone.play().catch(e => console.warn(`Sound playback failed for ${id}:`, e));
        }
    }

    public pauseAllSounds(): void {
        this.loadedSounds.forEach(sound => {
            if (!sound.paused) {
                sound.pause();
                sound.currentTime = 0; // Reset playback position
            }
        });
    }
}

interface GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement | undefined;
    draw(ctx: CanvasRenderingContext2D): void;
    update(deltaTime: number): void;
    checkCollision(other: GameObject): boolean;
    isOffscreen(canvasWidth: number, canvasHeight: number): boolean;
}

abstract class BaseObject implements GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement | undefined;

    constructor(x: number, y: number, width: number, height: number, image?: HTMLImageElement) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.image = image;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'white'; // Placeholder if image not loaded
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    abstract update(deltaTime: number): void;

    checkCollision(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }

    isOffscreen(canvasWidth: number, canvasHeight: number): boolean {
        return this.y + this.height < 0 || this.y > canvasHeight ||
               this.x + this.width < 0 || this.x > canvasWidth;
    }
}

class Player extends BaseObject {
    speed: number;
    health: number;
    maxHealth: number;
    fireRate: number;
    bulletDamage: number;
    fireCooldown: number; // Time until next shot is possible
    assetManager: AssetManager;
    private data: GameData; // Added to store game data

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement | undefined, data: GameData, assetManager: AssetManager) {
        super(x, y, width, height, image);
        this.speed = data.player.speed;
        this.health = data.player.health;
        this.maxHealth = data.player.health;
        this.fireRate = data.player.fireRate;
        this.bulletDamage = data.player.bulletDamage;
        this.fireCooldown = 0;
        this.assetManager = assetManager;
        this.data = data; // Assigned data
    }

    update(deltaTime: number): void {
        if (this.fireCooldown > 0) {
            this.fireCooldown -= deltaTime;
        }
    }

    fire(): Bullet | null {
        if (this.fireCooldown <= 0) {
            this.fireCooldown = 1 / this.fireRate;
            this.assetManager.playSound('player_shoot');
            return new Bullet(
                this.x + this.width / 2 - this.width / 10, // Centered from player
                this.y,
                this.width / 5, // Smaller bullet width
                this.height / 2, // Smaller bullet height
                this.assetManager.getImage('player_bullet'),
                'player',
                this.bulletDamage,
                -this.data.playerBullet.speed // Corrected access to playerBullet speed
            );
        }
        return null;
    }

    takeDamage(damage: number): void {
        this.health -= damage;
        this.assetManager.playSound('hit_sound');
    }
}

class Bullet extends BaseObject {
    owner: 'player' | 'enemy';
    damage: number;
    speed: number;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement | undefined, owner: 'player' | 'enemy', damage: number, speed: number) {
        super(x, y, width, height, image);
        this.owner = owner;
        this.damage = damage;
        this.speed = speed; // positive for downwards, negative for upwards
    }

    update(deltaTime: number): void {
        this.y += this.speed * deltaTime;
    }
}

class Enemy extends BaseObject {
    health: number;
    speed: number;
    fireRate: number;
    bulletDamage: number;
    scoreValue: number;
    fireCooldown: number;
    assetManager: AssetManager;
    data: GameData;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement | undefined, config: any, assetManager: AssetManager, data: GameData) {
        super(x, y, width, height, image);
        this.health = config.health;
        this.speed = config.speed;
        this.fireRate = config.fireRate;
        this.bulletDamage = config.bulletDamage;
        this.scoreValue = config.scoreValue;
        this.fireCooldown = Math.random() * (1 / this.fireRate); // Random initial cooldown
        this.assetManager = assetManager;
        this.data = data;
    }

    update(deltaTime: number): void {
        this.y += this.speed * deltaTime;
        if (this.fireCooldown > 0) {
            this.fireCooldown -= deltaTime;
        }
    }

    fire(): Bullet | null {
        if (this.fireCooldown <= 0) {
            this.fireCooldown = 1 / this.fireRate + Math.random() * 0.5; // Add some randomness
            this.assetManager.playSound('enemy_shoot');
            return new Bullet(
                this.x + this.width / 2 - this.data.enemyBullet.width / 2,
                this.y + this.height,
                this.data.enemyBullet.width,
                this.data.enemyBullet.height,
                this.assetManager.getImage('enemy_bullet'),
                'enemy',
                this.bulletDamage,
                this.data.enemyBullet.speed // Downwards
            );
        }
        return null;
    }

    takeDamage(damage: number): void {
        this.health -= damage;
        this.assetManager.playSound('hit_sound');
    }
}

class Background {
    image: HTMLImageElement | undefined;
    scrollSpeed: number;
    canvasHeight: number;
    y1: number;
    y2: number;

    constructor(image: HTMLImageElement | undefined, scrollSpeed: number, canvasHeight: number) {
        this.image = image;
        this.scrollSpeed = scrollSpeed;
        this.canvasHeight = canvasHeight;
        this.y1 = 0;
        this.y2 = - (image?.height || canvasHeight); // Start with second image above first
    }

    update(deltaTime: number): void {
        this.y1 += this.scrollSpeed * deltaTime;
        this.y2 += this.scrollSpeed * deltaTime;

        // Reset positions if they go off screen
        if (this.image) {
             if (this.y1 >= this.canvasHeight) { // First image completely scrolled past view
                this.y1 = this.y2 - this.image.height;
            }
            if (this.y2 >= this.canvasHeight) { // Second image completely scrolled past view
                this.y2 = this.y1 - this.image.height;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.image) {
            ctx.drawImage(this.image, 0, this.y1, ctx.canvas.width, this.image.height);
            ctx.drawImage(this.image, 0, this.y2, ctx.canvas.width, this.image.height);
        }
    }
}

class Explosion extends BaseObject {
    lifetime: number; // in seconds
    elapsedTime: number;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement | undefined, lifetime: number) {
        super(x - width / 2, y - height / 2, width, height, image); // Center explosion
        this.lifetime = lifetime;
        this.elapsedTime = 0;
    }

    update(deltaTime: number): void {
        this.elapsedTime += deltaTime;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.image && this.elapsedTime < this.lifetime) {
            const alpha = 1 - (this.elapsedTime / this.lifetime);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
            ctx.restore();
        }
    }

    isOffscreen(canvasWidth: number, canvasHeight: number): boolean {
        return this.elapsedTime >= this.lifetime;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private data: GameData;
    private assetManager: AssetManager;

    private player: Player | null = null;
    private playerBullets: Bullet[] = [];
    private enemies: Enemy[] = [];
    private enemyBullets: Bullet[] = [];
    private explosions: Explosion[] = [];
    private background: Background | null = null;

    private lastFrameTime: number = 0;
    private isRunning: boolean = false;
    private score: number = 0;
    private lives: number = 0;
    private gameOver: boolean = false;

    private keys: Set<string> = new Set();
    private enemySpawnTimer: number = 0;

    constructor(canvasId: string, gameData: GameData) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.data = gameData;
        this.assetManager = new AssetManager();

        this.canvas.width = this.data.canvas.width;
        this.canvas.height = this.data.canvas.height;
    }

    async init(): Promise<void> {
        await this.loadAssets();
        this.setupInput();
        this.startGame();
    }

    private async loadAssets(): Promise<void> {
        const imagePromises = this.data.assets.images.map(img => this.assetManager.loadImage(img));
        const soundPromises = this.data.assets.sounds.map(snd => this.assetManager.loadSound(snd));
        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private setupInput(): void {
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            if (e.code === 'Space' && !this.gameOver) {
                e.preventDefault(); // Prevent scrolling
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
        });
    }

    startGame(): void {
        this.score = 0;
        this.lives = this.data.game.initialLives;
        this.gameOver = false;
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.explosions = [];
        this.enemySpawnTimer = this.data.game.enemySpawnStartDelayMs / 1000;

        const playerImage = this.assetManager.getImage(this.data.player.assetId);
        this.player = new Player(
            (this.canvas.width - this.data.player.width) / 2,
            this.canvas.height - this.data.player.height - 20,
            this.data.player.width,
            this.data.player.height,
            playerImage,
            this.data,
            this.assetManager
        );

        const backgroundImage = this.assetManager.getImage(this.data.background.assetId);
        this.background = new Background(backgroundImage, this.data.background.scrollSpeed, this.canvas.height);

        this.assetManager.playSound('background_music', true); // Loop BGM
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    gameLoop(timestamp: number): void {
        if (!this.isRunning) return;

        const deltaTime = (timestamp - this.lastFrameTime) / 1000; // Convert ms to seconds
        this.lastFrameTime = timestamp;

        if (!this.gameOver) {
            this.update(deltaTime);
        }
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    update(deltaTime: number): void {
        if (!this.player) return;

        // Update Background
        this.background?.update(deltaTime);

        // Update Player
        this.player.update(deltaTime);
        this.handlePlayerMovement(deltaTime);
        if (this.keys.has('Space')) {
            const bullet = this.player.fire();
            if (bullet) {
                this.playerBullets.push(bullet);
            }
        }

        // Update Player Bullets
        this.playerBullets = this.playerBullets.filter(bullet => {
            bullet.update(deltaTime);
            return !bullet.isOffscreen(this.canvas.width, this.canvas.height);
        });

        // Spawn Enemies
        this.enemySpawnTimer -= deltaTime;
        if (this.enemySpawnTimer <= 0 && this.enemies.length < this.data.game.maxEnemiesOnScreen) {
            const enemyConfig = this.data.enemies[0]; // Only one enemy type for now
            const enemyImage = this.assetManager.getImage(enemyConfig.assetId);
            const spawnX = Math.random() * (this.canvas.width - enemyConfig.width);
            const spawnY = -enemyConfig.height - Math.random() * 50; // Spawn slightly above canvas
            this.enemies.push(new Enemy(spawnX, spawnY, enemyConfig.width, enemyConfig.height, enemyImage, enemyConfig, this.assetManager, this.data));
            this.enemySpawnTimer = enemyConfig.spawnIntervalMs / 1000;
        }

        // Update Enemies and Enemy Bullets
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime);
            if (enemy.y > 0 && Math.random() < enemy.fireRate * deltaTime) { // Enemy shoots when visible
                const bullet = enemy.fire();
                if (bullet) {
                    this.enemyBullets.push(bullet);
                }
            }
        });
        this.enemies = this.enemies.filter(enemy => {
            // Remove enemies that went off-screen without being destroyed
            return !enemy.isOffscreen(this.canvas.width, this.canvas.height) && enemy.health > 0;
        });

        this.enemyBullets = this.enemyBullets.filter(bullet => {
            bullet.update(deltaTime);
            return !bullet.isOffscreen(this.canvas.width, this.canvas.height);
        });

        // Update Explosions
        this.explosions = this.explosions.filter(explosion => {
            explosion.update(deltaTime);
            return !explosion.isOffscreen(this.canvas.width, this.canvas.height);
        });

        // Collision Detection
        this.handleCollisions();

        // Check Game Over
        if (this.player.health <= 0) {
            this.lives--;
            if (this.lives > 0) {
                this.player.health = this.player.maxHealth; // Respawn with full health
                this.player.x = (this.canvas.width - this.player.width) / 2;
                this.player.y = this.canvas.height - this.player.height - 20;
                this.playerBullets = []; // Clear bullets on respawn
                this.enemyBullets = [];
            } else {
                this.gameOver = true;
                this.assetManager.playSound('game_over_sound');
            }
        }
    }

    private handlePlayerMovement(deltaTime: number): void {
        if (!this.player) return;

        let dx = 0;
        let dy = 0;

        if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) { dx -= 1; }
        if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) { dx += 1; }
        if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) { dy -= 1; }
        if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) { dy += 1; }

        if (dx !== 0 || dy !== 0) {
            // Normalize diagonal movement speed
            const magnitude = Math.sqrt(dx * dx + dy * dy);
            if (magnitude > 0) {
                this.player.x += (dx / magnitude) * this.player.speed * deltaTime;
                this.player.y += (dy / magnitude) * this.player.speed * deltaTime;
            }
        }

        // Keep player within canvas bounds
        this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
        this.player.y = Math.max(0, Math.min(this.canvas.height - this.player.height, this.player.y));
    }

    private handleCollisions(): void {
        if (!this.player) return;

        // Player Bullets vs. Enemies
        this.playerBullets.forEach((bullet, bIdx) => {
            this.enemies.forEach((enemy, eIdx) => {
                if (bullet.checkCollision(enemy)) {
                    enemy.takeDamage(bullet.damage);
                    this.playerBullets.splice(bIdx, 1); // Remove bullet
                    if (enemy.health <= 0) {
                        this.score += enemy.scoreValue;
                        this.enemies.splice(eIdx, 1); // Remove enemy
                        this.spawnExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                        this.assetManager.playSound('explosion_sound');
                    }
                }
            });
        });

        // Enemy Bullets vs. Player
        this.enemyBullets.forEach((bullet, bIdx) => {
            if (bullet.checkCollision(this.player!)) {
                this.player!.takeDamage(bullet.damage);
                this.enemyBullets.splice(bIdx, 1); // Remove bullet
            }
        });

        // Enemies vs. Player
        this.enemies.forEach((enemy, eIdx) => {
            if (enemy.checkCollision(this.player!)) {
                this.player!.takeDamage(enemy.health); // Player takes damage equal to enemy's remaining health
                enemy.health = 0; // Enemy is destroyed
                this.enemies.splice(eIdx, 1); // Remove enemy
                this.spawnExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                this.assetManager.playSound('explosion_sound');
            }
        });
    }

    private spawnExplosion(x: number, y: number): void {
        const explosionImage = this.assetManager.getImage(this.data.explosion.assetId);
        this.explosions.push(new Explosion(x, y, this.data.explosion.width, this.data.explosion.height, explosionImage, this.data.explosion.lifetime));
    }

    render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Background
        this.background?.draw(this.ctx);

        // Draw Player
        this.player?.draw(this.ctx);

        // Draw Player Bullets
        this.playerBullets.forEach(bullet => bullet.draw(this.ctx));

        // Draw Enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx));

        // Draw Enemy Bullets
        this.enemyBullets.forEach(bullet => bullet.draw(this.ctx));

        // Draw Explosions
        this.explosions.forEach(explosion => explosion.draw(this.ctx));

        // Draw UI
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        this.ctx.fillText(`Health: ${this.player?.health || 0}`, 10, 60);
        this.ctx.fillText(`Lives: ${this.lives}`, 10, 90);

        if (this.gameOver) {
            this.ctx.font = '48px Arial';
            this.ctx.fillStyle = 'red';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.font = '24px Arial';
            this.ctx.fillStyle = 'white';
            this.ctx.fillText('Refresh to Restart', this.canvas.width / 2, this.canvas.height / 2 + 50);
            this.assetManager.pauseAllSounds(); // Corrected to use a public method
            this.isRunning = false;
        }
    }
}

// Global initialization
window.onload = async () => {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const gameData: GameData = await response.json();

        const game = new Game('gameCanvas', gameData);
        await game.init();
    } catch (error) {
        console.error('Failed to load game or data:', error);
        document.body.innerHTML = '<h1>Error loading game. Check console for details.</h1>';
    }
};