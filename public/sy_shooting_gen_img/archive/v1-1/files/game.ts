interface ImageAsset {
    name: string;
    path: string;
    width: number; // Intended render width for non-spritesheet, or single frame width for spritesheet
    height: number; // Intended render height for non-spritesheet, or single frame height for spritesheet
    frames?: number; // Total frames for a spritesheet (horizontal strip assumed)
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameAssets {
    images: { [key: string]: HTMLImageElement };
    sounds: { [key: string]: HTMLAudioElement };
}

interface EnemyConfig {
    name: string;
    asset: string;
    speed: number;
    health: number;
    fireRate: number; // milliseconds between shots (0 for no shooting)
    score: number;
    width: number;
    height: number;
    bulletSpeed: number;
    bulletDamage: number;
    dropsPowerup: boolean; // Not implemented, but good for future extension
}

interface GameData {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        gameSpeedMultiplier: number;
        titleScreenText: string;
        titleScreenPrompt: string;
        controlsScreenText: string;
        gameOverText: string;
        gameOverPrompt: string;
    };
    player: {
        speed: number;
        fireRate: number; // milliseconds between shots
        health: number;
        bulletSpeed: number;
        bulletDamage: number;
        width: number;
        height: number;
    };
    enemies: EnemyConfig[];
    bullets: {
        player: { asset: string; width: number; height: number; };
        enemy: { asset: string; width: number; height: number; };
    };
    background: {
        asset: string;
        scrollSpeed: number;
        width: number; // Original asset width
        height: number; // Original asset height
    };
    spawner: {
        enemySpawnIntervalMs: number;
        maxEnemiesOnScreen: number;
    };
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

enum GameState {
    TITLE,
    CONTROLS,
    PLAYING,
    GAME_OVER
}

class AssetLoader {
    private gameData: GameData;
    private loadedImages: { [key: string]: HTMLImageElement } = {};
    private loadedSounds: { [key: string]: HTMLAudioElement } = {};

    constructor(gameData: GameData) {
        this.gameData = gameData;
    }

    async load(): Promise<GameAssets> {
        const imagePromises = this.gameData.assets.images.map(img => this.loadImage(img));
        const soundPromises = this.gameData.assets.sounds.map(snd => this.loadSound(snd));

        await Promise.all(imagePromises);
        await Promise.all(soundPromises);

        console.log("All assets loaded.");
        return {
            images: this.loadedImages,
            sounds: this.loadedSounds
        };
    }

    private loadImage(imageAsset: ImageAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imageAsset.path;
            img.onload = () => {
                this.loadedImages[imageAsset.name] = img;
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imageAsset.path}`);
                reject(new Error(`Failed to load image: ${imageAsset.path}`));
            };
        });
    }

    private loadSound(soundAsset: SoundAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = soundAsset.path;
            audio.preload = 'auto';
            audio.volume = soundAsset.volume;

            // Wait for enough data to play, or full load
            audio.oncanplaythrough = () => {
                this.loadedSounds[soundAsset.name] = audio;
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${soundAsset.path}`);
                reject(new Error(`Failed to load sound: ${soundAsset.path}`));
            };
        });
    }
}

class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    assetName: string;
    isAlive: boolean = true;

    constructor(x: number, y: number, width: number, height: number, assetName: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.assetName = assetName;
    }

    render(ctx: CanvasRenderingContext2D, assets: GameAssets): void {
        const img = assets.images[this.assetName];
        if (img) {
            ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
            console.warn(`Asset not found: ${this.assetName}`);
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Player extends GameObject {
    health: number;
    speed: number;
    fireRate: number; // milliseconds between shots
    bulletSpeed: number;
    bulletDamage: number;
    fireCooldown: number; // current cooldown in milliseconds

    constructor(x: number, y: number, config: GameData) {
        super(x, y, config.player.width, config.player.height, "player_plane");
        this.health = config.player.health;
        this.speed = config.player.speed;
        this.fireRate = config.player.fireRate;
        this.bulletSpeed = config.player.bulletSpeed;
        this.bulletDamage = config.player.bulletDamage;
        this.fireCooldown = 0;
    }

    update(keys: Set<string>, deltaTime: number, config: GameData): void {
        const gameSpeed = config.gameSettings.gameSpeedMultiplier;

        if (keys.has('ArrowUp') || keys.has('KeyW')) {
            this.y -= this.speed * gameSpeed * deltaTime;
        }
        if (keys.has('ArrowDown') || keys.has('KeyS')) {
            this.y += this.speed * gameSpeed * deltaTime;
        }
        if (keys.has('ArrowLeft') || keys.has('KeyA')) {
            this.x -= this.speed * gameSpeed * deltaTime;
        }
        if (keys.has('ArrowRight') || keys.has('KeyD')) {
            this.x += this.speed * gameSpeed * deltaTime;
        }

        // Clamp player position to canvas boundaries
        this.x = Math.max(0, Math.min(this.x, config.gameSettings.canvasWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, config.gameSettings.canvasHeight - this.height));

        if (this.fireCooldown > 0) {
            this.fireCooldown -= (deltaTime * 1000); // Decrement in milliseconds
        }
    }

    shoot(assets: GameAssets, game: Game): Bullet | null {
        if (this.fireCooldown <= 0) {
            this.fireCooldown = this.fireRate;
            game.playSFX("player_shoot");
            const bulletConfig = game.data!.bullets.player;
            return new Bullet(
                this.x + this.width / 2 - bulletConfig.width / 2,
                this.y,
                bulletConfig.width,
                bulletConfig.height,
                bulletConfig.asset,
                this.bulletSpeed * -1, // Player bullets go up
                this.bulletDamage,
                true // isPlayerBullet
            );
        }
        return null;
    }

    takeDamage(damage: number): void {
        this.health -= damage;
        if (this.health <= 0) {
            this.isAlive = false;
        }
    }
}

class Bullet extends GameObject {
    speed: number;
    damage: number;
    isPlayerBullet: boolean;

    constructor(x: number, y: number, width: number, height: number, assetName: string, speed: number, damage: number, isPlayerBullet: boolean) {
        super(x, y, width, height, assetName);
        this.speed = speed;
        this.damage = damage;
        this.isPlayerBullet = isPlayerBullet;
    }

    update(deltaTime: number, config: GameData): void {
        this.y += this.speed * config.gameSettings.gameSpeedMultiplier * deltaTime;

        // Mark as dead if off-screen
        if (this.y + this.height < 0 || this.y > config.gameSettings.canvasHeight) {
            this.isAlive = false;
        }
    }
}

class Enemy extends GameObject {
    health: number;
    speed: number;
    scoreValue: number;
    fireRate: number; // milliseconds between shots
    bulletSpeed: number;
    bulletDamage: number;
    fireCooldown: number; // current cooldown in milliseconds
    enemyConfig: EnemyConfig; // Store original config for bullet properties

    constructor(x: number, y: number, config: EnemyConfig, gameData: GameData) {
        super(x, y, config.width, config.height, config.asset);
        this.enemyConfig = config; // Keep a reference
        this.health = config.health;
        this.speed = config.speed;
        this.scoreValue = config.score;
        this.fireRate = config.fireRate;
        this.bulletSpeed = config.bulletSpeed;
        this.bulletDamage = config.bulletDamage;
        this.fireCooldown = Math.floor(Math.random() * this.fireRate); // Random initial cooldown
    }

    update(deltaTime: number, config: GameData): void {
        this.y += this.speed * config.gameSettings.gameSpeedMultiplier * deltaTime;

        if (this.fireCooldown > 0) {
            this.fireCooldown -= (deltaTime * 1000); // Decrement in milliseconds
        }

        // Mark as dead if off-screen
        if (this.y > config.gameSettings.canvasHeight) {
            this.isAlive = false;
        }
    }

    shoot(assets: GameAssets, game: Game): Bullet | null {
        if (this.fireRate > 0 && this.fireCooldown <= 0) {
            this.fireCooldown = this.fireRate;
            game.playSFX("enemy_shoot");
            const bulletConfig = game.data!.bullets.enemy;
            return new Bullet(
                this.x + this.width / 2 - bulletConfig.width / 2,
                this.y + this.height,
                bulletConfig.width,
                bulletConfig.height,
                bulletConfig.asset,
                this.bulletSpeed, // Enemy bullets go down
                this.bulletDamage,
                false // isPlayerBullet
            );
        }
        return null;
    }

    takeDamage(damage: number): void {
        this.health -= damage;
        if (this.health <= 0) {
            this.isAlive = false;
        }
    }
}

class Explosion extends GameObject {
    currentFrame: number;
    maxFrames: number;
    frameWidth: number; // Width of a single frame in the spritesheet asset
    frameHeight: number; // Height of a single frame in the spritesheet asset
    frameDuration: number; // milliseconds per frame
    elapsedTime: number;

    constructor(x: number, y: number, width: number, height: number, assetName: string, totalFrames: number, frameDurationMs: number) {
        super(x, y, width, height, assetName);
        this.currentFrame = 0;
        this.maxFrames = totalFrames;
        this.frameDuration = frameDurationMs;
        this.elapsedTime = 0;
        this.isAlive = true;

        // Get actual dimensions of a single frame from asset data
        const assetImageInfo = game.data!.assets.images.find(img => img.name === assetName);
        if (assetImageInfo) {
            this.frameWidth = assetImageInfo.width; // Asset width in data.json is already frame width
            this.frameHeight = assetImageInfo.height; // Asset height in data.json is already frame height
        } else {
            // Fallback if asset info is missing
            this.frameWidth = width;
            this.frameHeight = height;
        }
    }

    update(deltaTime: number): void {
        this.elapsedTime += (deltaTime * 1000); // Accumulate time in milliseconds
        if (this.elapsedTime >= this.frameDuration) {
            this.currentFrame++;
            this.elapsedTime = 0; // Reset for the next frame
        }

        if (this.currentFrame >= this.maxFrames) {
            this.isAlive = false;
        }
    }

    render(ctx: CanvasRenderingContext2D, assets: GameAssets): void {
        if (!this.isAlive) return;

        const img = assets.images[this.assetName];
        if (img) {
            // Calculate source x, y, width, height from spritesheet
            const sx = this.currentFrame * this.frameWidth;
            const sy = 0; // Assuming horizontal sprite sheet

            ctx.drawImage(img, sx, sy, this.frameWidth, this.frameHeight, this.x, this.y, this.width, this.height);
        } else {
            super.render(ctx, assets); // Fallback to basic object rendering
        }
    }
}

class Background {
    assetName: string;
    scrollSpeed: number;
    assetWidth: number; // Original asset width
    assetHeight: number; // Original asset height
    yOffset: number;
    canvasWidth: number;
    canvasHeight: number;

    constructor(config: GameData) {
        const bgConfig = config.background;
        this.assetName = bgConfig.asset;
        this.scrollSpeed = bgConfig.scrollSpeed;
        this.assetWidth = bgConfig.width;
        this.assetHeight = bgConfig.height;
        this.yOffset = 0;
        this.canvasWidth = config.gameSettings.canvasWidth;
        this.canvasHeight = config.gameSettings.canvasHeight;
    }

    update(deltaTime: number, gameSpeedMultiplier: number): void {
        // Scroll speed in pixels per second, converted to pixels per frame
        this.yOffset = (this.yOffset + this.scrollSpeed * gameSpeedMultiplier * deltaTime) % this.assetHeight;
    }

    render(ctx: CanvasRenderingContext2D, assets: GameAssets): void {
        const img = assets.images[this.assetName];
        if (img) {
            // Draw first instance
            ctx.drawImage(img, 0, this.yOffset, this.canvasWidth, this.assetHeight, 0, this.yOffset, this.canvasWidth, this.assetHeight);
            // Draw second instance above the first to create continuous scroll
            ctx.drawImage(img, 0, this.yOffset - this.assetHeight, this.canvasWidth, this.assetHeight, 0, this.yOffset - this.assetHeight, this.canvasWidth, this.assetHeight);
        } else {
            console.warn(`Background asset not found: ${this.assetName}`);
            ctx.fillStyle = 'blue'; // Fallback color
            ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        }
    }
}

class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    data: GameData | null = null;
    assets: GameAssets | null = null;
    state: GameState = GameState.TITLE;
    lastFrameTime: DOMHighResTimeStamp = 0;
    keysPressed: Set<string> = new Set();
    animationFrameId: number = 0;

    player: Player | null = null;
    playerBullets: Bullet[] = [];
    enemies: Enemy[] = [];
    enemyBullets: Bullet[] = [];
    explosions: Explosion[] = [];
    background: Background | null = null;

    score: number = 0;
    lastEnemySpawnTime: number = 0;
    bgmPlaying: boolean = false;
    audioContext: AudioContext;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID "${canvasId}" not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        this.addEventListeners();
    }

    private addEventListeners(): void {
        window.addEventListener('keydown', (e) => {
            this.keysPressed.add(e.code);
            // Prevent default scroll behavior for arrow keys and space
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) {
                e.preventDefault();
            }
            this.handleInput(e); // For state transitions and shooting
        });
        window.addEventListener('keyup', (e) => {
            this.keysPressed.delete(e.code);
        });

        // Handle touch/click to start audio context on mobile
        document.addEventListener('click', () => {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }, { once: true });
    }

    private handleInput(event: KeyboardEvent): void {
        if (event.code === 'Enter') {
            if (this.state === GameState.TITLE) {
                this.state = GameState.CONTROLS;
            } else if (this.state === GameState.CONTROLS) {
                this.startGame();
            } else if (this.state === GameState.GAME_OVER) {
                this.resetGame();
                this.startGame();
            }
        }
        // Player shooting on SPACEBAR press (not hold, due to how fireCooldown works)
        if (event.code === 'Space' && this.state === GameState.PLAYING && this.player?.isAlive) {
            const newBullet = this.player.shoot(this.assets!, this);
            if (newBullet) {
                this.playerBullets.push(newBullet);
            }
        }
    }

    async init(): Promise<void> {
        console.log("Initializing game...");
        try {
            this.data = await this.loadData();
            this.canvas.width = this.data.gameSettings.canvasWidth;
            this.canvas.height = this.data.gameSettings.canvasHeight;
            this.ctx.imageSmoothingEnabled = false; // For pixel art feel

            const assetLoader = new AssetLoader(this.data);
            this.assets = await assetLoader.load();
            console.log("Assets loaded:", this.assets);

            this.background = new Background(this.data);
            this.resetGame(); // Initialize game objects

            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
            console.log("Game initialized. Current state: TITLE");
        } catch (error) {
            console.error("Game initialization failed:", error);
            // Display error on canvas if possible
            this.ctx.fillStyle = 'red';
            this.ctx.font = '20px Arial';
            this.ctx.fillText("Failed to load game. Check console.", 10, 50);
        }
    }

    private async loadData(): Promise<GameData> {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch data.json: ${response.statusText}`);
        }
        return response.json();
    }

    startGame(): void {
        if (!this.data || !this.assets) {
            console.error("Game data or assets not loaded.");
            return;
        }
        this.state = GameState.PLAYING;
        this.playBGM();
        this.lastEnemySpawnTime = performance.now(); // Reset spawn timer for new game
        console.log("Game started.");
    }

    resetGame(): void {
        if (!this.data) return;

        this.player = new Player(
            this.data.gameSettings.canvasWidth / 2 - this.data.player.width / 2,
            this.data.gameSettings.canvasHeight - this.data.player.height - 20,
            this.data
        );
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.explosions = [];
        this.score = 0;
        this.lastEnemySpawnTime = performance.now();
        this.background = new Background(this.data); // Reset background scroll
        
        // Fix for TS2779: Ensure the audio element exists before trying to assign to currentTime
        const bgm = this.assets?.sounds["bgm_ww2"];
        if (bgm) {
            bgm.pause();
            bgm.currentTime = 0;
        }
        this.bgmPlaying = false; // Ensure BGM restarts cleanly
    }

    gameLoop(currentTime: DOMHighResTimeStamp): void {
        if (!this.data || !this.assets) {
            console.error("Game loop called before data/assets loaded.");
            return;
        }

        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Delta time in seconds
        this.lastFrameTime = currentTime;

        this.update(deltaTime);
        this.render();

        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    update(deltaTime: number): void {
        if (!this.data) return;
        const gameSpeed = this.data.gameSettings.gameSpeedMultiplier;

        this.background?.update(deltaTime, gameSpeed);

        if (this.state === GameState.PLAYING) {
            if (this.player && this.player.isAlive) {
                this.player.update(this.keysPressed, deltaTime, this.data);
            } else if (this.player && !this.player.isAlive && this.player.health <= 0) {
                this.state = GameState.GAME_OVER;
                this.playSFX("game_over_sfx");
                this.assets!.sounds["bgm_ww2"].pause();
                this.bgmPlaying = false;
                return;
            }

            // Update player bullets
            this.playerBullets.forEach(bullet => bullet.update(deltaTime, this.data!));
            this.playerBullets = this.playerBullets.filter(bullet => bullet.isAlive);

            // Spawn enemies
            const now = performance.now(); // Current time in ms
            if (this.enemies.length < this.data.spawner.maxEnemiesOnScreen &&
                now - this.lastEnemySpawnTime > this.data.spawner.enemySpawnIntervalMs) {
                const enemyConfig = this.data.enemies[Math.floor(Math.random() * this.data.enemies.length)];
                const x = Math.random() * (this.data.gameSettings.canvasWidth - enemyConfig.width);
                const y = -enemyConfig.height; // Spawn slightly above screen
                this.enemies.push(new Enemy(x, y, enemyConfig, this.data));
                this.lastEnemySpawnTime = now;
            }

            // Update enemies and handle enemy shooting
            this.enemies.forEach(enemy => {
                enemy.update(deltaTime, this.data!);
                if (enemy.isAlive && enemy.fireRate > 0) { // Only attempt to shoot if enemy is alive and can shoot
                    const newBullet = enemy.shoot(this.assets!, this);
                    if (newBullet) {
                        this.enemyBullets.push(newBullet);
                    }
                }
            });
            this.enemies = this.enemies.filter(enemy => enemy.isAlive);

            // Update enemy bullets
            this.enemyBullets.forEach(bullet => bullet.update(deltaTime, this.data!));
            this.enemyBullets = this.enemyBullets.filter(bullet => bullet.isAlive);

            // Update explosions
            this.explosions.forEach(exp => exp.update(deltaTime));
            this.explosions = this.explosions.filter(exp => exp.isAlive);

            // --- Collision Detection ---
            // Player bullets vs. Enemies
            this.playerBullets.forEach(pBullet => {
                if (!pBullet.isAlive) return;

                this.enemies.forEach(enemy => {
                    if (enemy.isAlive && checkCollision(pBullet, enemy)) {
                        enemy.takeDamage(pBullet.damage);
                        pBullet.isAlive = false; // Bullet is destroyed on impact
                        if (!enemy.isAlive) {
                            this.score += enemy.scoreValue;
                            this.playSFX("explosion_sfx");
                            // Add explosion
                            const explosionConfig = this.data!.assets.images.find(img => img.name === "explosion");
                            if (explosionConfig) {
                                this.explosions.push(new Explosion(
                                    enemy.x + enemy.width / 2 - explosionConfig.width, // Center explosion
                                    enemy.y + enemy.height / 2 - explosionConfig.height,
                                    explosionConfig.width * 2, // Make explosion larger than frame size
                                    explosionConfig.height * 2,
                                    "explosion",
                                    explosionConfig.frames!,
                                    50 // 50ms per frame
                                ));
                            }
                        }
                    }
                });
            });

            // Enemy bullets vs. Player
            this.enemyBullets.forEach(eBullet => {
                if (!eBullet.isAlive || !this.player?.isAlive) return;

                if (checkCollision(eBullet, this.player)) {
                    this.player.takeDamage(eBullet.damage);
                    eBullet.isAlive = false; // Bullet is destroyed on impact
                    if (!this.player.isAlive) {
                        // Game over will be triggered in the next update cycle due to player.isAlive check
                        this.playSFX("explosion_sfx");
                        const explosionConfig = this.data!.assets.images.find(img => img.name === "explosion");
                        if (explosionConfig) {
                            this.explosions.push(new Explosion(
                                this.player.x + this.player.width / 2 - explosionConfig.width,
                                this.player.y + this.player.height / 2 - explosionConfig.height,
                                explosionConfig.width * 2,
                                explosionConfig.height * 2,
                                "explosion",
                                explosionConfig.frames!,
                                50
                            ));
                        }
                    }
                }
            });

            // Player vs. Enemies (collision damage)
            this.enemies.forEach(enemy => {
                if (this.player?.isAlive && enemy.isAlive && checkCollision(this.player, enemy)) {
                    this.player.takeDamage(20); // Direct collision damage
                    enemy.takeDamage(enemy.health); // Enemy is instantly destroyed
                    enemy.isAlive = false;
                    this.playSFX("explosion_sfx");
                    // Add explosion for enemy
                    const explosionConfig = this.data!.assets.images.find(img => img.name === "explosion");
                    if (explosionConfig) {
                        this.explosions.push(new Explosion(
                            enemy.x + enemy.width / 2 - explosionConfig.width,
                            enemy.y + enemy.height / 2 - explosionConfig.height,
                            explosionConfig.width * 2,
                            explosionConfig.height * 2,
                            "explosion",
                            explosionConfig.frames!,
                            50
                        ));
                    }
                    if (!this.player.isAlive) {
                        // Player explosion will be handled by the player.isAlive check at the beginning of update()
                    }
                }
            });
        }
    }

    render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.data || !this.assets) return;

        // Render background first
        this.background?.render(this.ctx, this.assets);

        if (this.state === GameState.TITLE) {
            this.drawText(this.data.gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50, 'white', 48, 'center');
            this.drawText(this.data.gameSettings.titleScreenPrompt, this.canvas.width / 2, this.canvas.height / 2 + 20, 'white', 24, 'center');
        } else if (this.state === GameState.CONTROLS) {
            const lines = this.data.gameSettings.controlsScreenText.split('\n');
            let yPos = this.canvas.height / 2 - (lines.length / 2) * 30; // Adjust starting Y for multiline
            lines.forEach(line => {
                this.drawText(line, this.canvas.width / 2, yPos, 'white', 24, 'center');
                yPos += 30;
            });
            this.drawText("ENTER 키를 눌러 게임 시작", this.canvas.width / 2, yPos + 50, 'white', 24, 'center');
        } else if (this.state === GameState.PLAYING) {
            this.playerBullets.forEach(bullet => bullet.render(this.ctx, this.assets!));
            this.enemyBullets.forEach(bullet => bullet.render(this.ctx, this.assets!));
            this.enemies.forEach(enemy => enemy.render(this.ctx, this.assets!));
            if (this.player && this.player.isAlive) {
                this.player.render(this.ctx, this.assets!);
            }
            this.explosions.forEach(exp => exp.render(this.ctx, this.assets!));

            // Draw UI
            this.drawText(`Score: ${this.score}`, 10, 30, 'white', 20, 'left');
            if (this.player) {
                this.drawText(`Health: ${Math.max(0, this.player.health)}`, this.canvas.width - 10, 30, 'white', 20, 'right');
            }
        } else if (this.state === GameState.GAME_OVER) {
            this.drawText(this.data.gameSettings.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 50, 'red', 48, 'center');
            const prompt = this.data.gameSettings.gameOverPrompt.replace('{score}', this.score.toString());
            this.drawText(prompt, this.canvas.width / 2, this.canvas.height / 2 + 20, 'white', 24, 'center');

            // Render any remaining entities (explosions will fade out)
            this.explosions.forEach(exp => exp.render(this.ctx, this.assets!));

             // Draw final score
            this.drawText(`Score: ${this.score}`, 10, 30, 'white', 20, 'left');
        }
    }

    drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign): void {
        this.ctx.fillStyle = color;
        this.ctx.font = `${size}px 'Press Start 2P', Arial, sans-serif`; // Added a pixel-art font suggestion
        this.ctx.textAlign = align;
        this.ctx.fillText(text, x, y);
    }

    playBGM(): void {
        if (this.assets && !this.bgmPlaying) {
            const bgm = this.assets.sounds["bgm_ww2"];
            if (bgm) {
                bgm.loop = true;
                bgm.play().catch(e => console.log("BGM playback blocked or failed:", e));
                this.bgmPlaying = true;
            }
        }
    }

    playSFX(assetName: string): void {
        if (this.assets) {
            const sfx = this.assets.sounds[assetName];
            if (sfx) {
                // To allow multiple sounds to play concurrently, clone the audio element
                const clonedSfx = sfx.cloneNode() as HTMLAudioElement;
                clonedSfx.volume = sfx.volume; // Keep original volume
                clonedSfx.play().catch(e => console.log(`SFX ${assetName} playback blocked or failed:`, e));
            }
        }
    }
}

// Helper function for AABB collision detection
function checkCollision(obj1: GameObject, obj2: GameObject): boolean {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

// Global game instance
let game: Game;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        game = new Game('gameCanvas');
        game.init();
    } else {
        console.error("No canvas element with id 'gameCanvas' found.");
        document.body.innerHTML = "<p>Error: Game canvas not found. Please ensure an element like &lt;canvas id=\"gameCanvas\"&gt;&lt;/canvas&gt; exists in your HTML.</p>";
    }
});
