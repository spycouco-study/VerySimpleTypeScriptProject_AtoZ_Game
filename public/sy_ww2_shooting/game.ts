export {}; // Make this file a module to allow global augmentation

interface ImageAsset {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    scrollSpeed: number;
    playerInitialHealth: number;
    explosionDuration: number;
    titleScreenText: string;
    instructionsText: string[];
    gameOverText: string;
    loadingText: string;
}

interface PlayerConfig {
    image: string;
    width: number;
    height: number;
    speed: number;
    fireRate: number; // bullets per second
    bulletType: string;
    hitSound: string;
}

interface EnemyConfig {
    name: string;
    image: string;
    width: number;
    height: number;
    health: number;
    speed: number;
    scoreValue: number;
    fireRate: number;
    bulletType: string;
    movementPattern: "straight" | "sine" | "diagonal";
    shootSound: string;
}

interface BulletConfig {
    name: string;
    image: string;
    width: number;
    height: number;
    speed: number;
    damage: number;
    sound: string;
}

interface LevelSpawnEvent {
    time: number; // relative to level start, in seconds
    enemyName: string;
    startX: "rightEdge" | number; // x position, or keyword
    startY: "random" | "top" | "bottom" | number; // y position, or keyword
    count?: number; // for waves
    interval?: number; // for waves (seconds)
    _spawned?: boolean; // Internal flag to track if this event has been triggered
}

interface LevelConfig {
    duration: number; // seconds
    spawnEvents: LevelSpawnEvent[];
}

interface GameData {
    gameSettings: GameSettings;
    player: PlayerConfig;
    enemyTypes: EnemyConfig[];
    bulletTypes: BulletConfig[];
    levels: LevelConfig[];
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

enum GameState {
    LOADING = "LOADING",
    TITLE = "TITLE",
    INSTRUCTIONS = "INSTRUCTIONS",
    PLAYING = "PLAYING",
    GAME_OVER = "GAME_OVER",
}

class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    imageName: string;
    markedForDeletion: boolean = false;
    image: HTMLImageElement | null = null; // Stored reference to the loaded image

    constructor(x: number, y: number, width: number, height: number, imageName: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageName = imageName;
    }

    draw(ctx: CanvasRenderingContext2D, game: Game): void {
        if (!this.image) {
            this.image = game.images.get(this.imageName) || null;
        }
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'red'; // Fallback
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
    update(deltaTime: number, game: Game): void {}
}

class Player extends GameObject {
    health: number;
    maxHealth: number;
    speed: number;
    fireRate: number; // bullets per second
    bulletType: BulletConfig;
    lastShotTime: number = 0;
    invincibleTimer: number = 0; // for brief invincibility after hit

    constructor(x: number, y: number, game: Game) {
        const playerConfig = game.data!.player;
        super(x, y, playerConfig.width, playerConfig.height, playerConfig.image);
        this.health = game.data!.gameSettings.playerInitialHealth;
        this.maxHealth = this.health;
        this.speed = playerConfig.speed;
        this.fireRate = playerConfig.fireRate;
        this.bulletType = game.data!.bulletTypes.find(b => b.name === playerConfig.bulletType)!;
    }

    update(deltaTime: number, game: Game): void {
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= deltaTime;
        }

        // Movement based on input
        if (game.input.get('ArrowUp') || game.input.get('KeyW')) this.y -= this.speed * deltaTime;
        if (game.input.get('ArrowDown') || game.input.get('KeyS')) this.y += this.speed * deltaTime;
        if (game.input.get('ArrowLeft') || game.input.get('KeyA')) this.x -= this.speed * deltaTime;
        if (game.input.get('ArrowRight') || game.input.get('KeyD')) this.x += this.speed * deltaTime;

        // Keep player within canvas bounds
        this.x = Math.max(0, Math.min(this.x, game.canvas.width - this.width));
        this.y = Math.max(0, Math.min(this.y, game.canvas.height - this.height));

        // Shooting
        if ((game.input.get('Space') || game.input.get('KeyJ')) && (game.currentTime - this.lastShotTime) > (1000 / this.fireRate)) {
            game.playerBullets.push(new Bullet(
                this.x + this.width, // Spawn bullet from player's right edge
                this.y + this.height / 2 - this.bulletType.height / 2, // Centered vertically
                this.bulletType.width,
                this.bulletType.height,
                this.bulletType.image,
                this.bulletType.speed,
                this.bulletType.damage,
                "player"
            ));
            game.playSound(this.bulletType.sound);
            this.lastShotTime = game.currentTime;
        }
    }

    takeDamage(damage: number, game: Game): void {
        if (this.invincibleTimer <= 0) {
            this.health -= damage;
            game.playSound(game.data!.player.hitSound);
            this.invincibleTimer = 1; // 1 second invincibility
            if (this.health <= 0) {
                this.markedForDeletion = true;
                game.explosions.push(new Explosion(this.x, this.y, this.width, this.height, game.data!.gameSettings.explosionDuration));
                game.playSound("explosion");
                game.playSound("game_over"); // Play game over sound
                game.setState(GameState.GAME_OVER);
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, game: Game): void {
        if (this.invincibleTimer > 0) {
            // Flash effect during invincibility
            if (Math.floor(this.invincibleTimer * 10) % 2 === 0) {
                super.draw(ctx, game);
            }
        } else {
            super.draw(ctx, game);
        }
    }
}

class Bullet extends GameObject {
    speed: number;
    damage: number;
    type: "player" | "enemy";
    vx: number; // Velocity X component
    vy: number; // Velocity Y component

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, damage: number, type: "player" | "enemy", initialVx: number | null = null, initialVy: number | null = null) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.damage = damage;
        this.type = type;

        if (type === "player") {
            this.vx = speed; // Player bullets always move right at 'speed'
            this.vy = 0;
        } else { // enemy bullet
            // Use provided initialVx/Vy, or default to straight left if not provided
            this.vx = initialVx !== null ? initialVx : -speed;
            this.vy = initialVy !== null ? initialVy : 0;
        }
    }

    update(deltaTime: number, game: Game): void {
        // Both player and enemy bullets now use vx and vy for movement
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Mark for deletion if off screen (checks all 4 sides)
        if (this.x > game.canvas.width || this.x + this.width < 0 || this.y > game.canvas.height || this.y + this.height < 0) {
            this.markedForDeletion = true;
        }
    }
}

class Enemy extends GameObject {
    health: number;
    scoreValue: number;
    speed: number;
    fireRate: number;
    bulletType: BulletConfig;
    movementPattern: "straight" | "sine" | "diagonal";
    lastShotTime: number = 0;
    initialY: number; // For sine wave or diagonal patterns
    sineWaveOffset: number; // For sine wave to make each enemy's pattern unique
    verticalDirection: 1 | -1 = 1; // For diagonal movement: 1 for down, -1 for up

    constructor(x: number, y: number, config: EnemyConfig, game: Game) {
        super(x, y, config.width, config.height, config.image);
        this.health = config.health;
        this.scoreValue = config.scoreValue;
        this.speed = config.speed;
        this.fireRate = config.fireRate;
        this.bulletType = game.data!.bulletTypes.find(b => b.name === config.bulletType)!;
        this.movementPattern = config.movementPattern;
        this.initialY = y;
        this.sineWaveOffset = Math.random() * Math.PI * 2; // Random phase for sine wave
        this.verticalDirection = (Math.random() < 0.5) ? 1 : -1; // Random initial direction for diagonal
    }

    update(deltaTime: number, game: Game): void {
        // Horizontal movement
        this.x -= this.speed * deltaTime;

        // Vertical movement based on pattern
        if (this.movementPattern === "sine") {
            const amplitude = 50; // How far up/down it moves
            const frequency = 2; // How fast it wiggles
            this.y = this.initialY + Math.sin(game.currentTime * 0.001 * frequency + this.sineWaveOffset) * amplitude;
        } else if (this.movementPattern === "diagonal") {
            const diagonalSpeed = this.speed * 0.7; // Slower vertical movement
            this.y += this.verticalDirection * diagonalSpeed * deltaTime;

            // Reverse direction if hitting top or bottom edges
            if (this.y <= 0) {
                this.y = 0;
                this.verticalDirection = 1; // Move down
            } else if (this.y >= game.canvas.height - this.height) {
                this.y = game.canvas.height - this.height;
                this.verticalDirection = -1; // Move up
            }
        }
        // Clamp Y to stay on screen (only needed if movement pattern doesn't handle it, e.g., 'straight')
        // For 'sine' and 'diagonal', their logic usually implicitly keeps it within bounds or
        // the bounce logic adjusts it. Keeping it as a general fallback, though less critical for updated diagonal.
        this.y = Math.max(0, Math.min(this.y, game.canvas.height - this.height));


        // Shooting
        if (this.fireRate > 0 && (game.currentTime - this.lastShotTime) > (1000 / this.fireRate)) {
            let bulletVx: number = 0;
            let bulletVy: number = 0;

            if (game.player && !game.player.markedForDeletion) {
                const enemyCenterX = this.x + this.width / 2;
                const enemyCenterY = this.y + this.height / 2;
                const playerCenterX = game.player.x + game.player.width / 2;
                const playerCenterY = game.player.y + game.player.height / 2;

                const dx = playerCenterX - enemyCenterX;
                const dy = playerCenterY - enemyCenterY;

                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 0) { // Avoid division by zero
                    // Normalize the direction vector and scale by bullet speed
                    bulletVx = (dx / distance) * this.bulletType.speed;
                    bulletVy = (dy / distance) * this.bulletType.speed;
                } else {
                    // Player is at the same spot as enemy, shoot straight left as fallback
                    bulletVx = -this.bulletType.speed;
                    bulletVy = 0;
                }
            } else {
                // No player or player deleted, shoot straight left as fallback
                bulletVx = -this.bulletType.speed;
                bulletVy = 0;
            }

            game.enemyBullets.push(new Bullet(
                this.x - this.bulletType.width, // Spawn bullet from enemy's left edge
                this.y + this.height / 2 - this.bulletType.height / 2, // Centered vertically
                this.bulletType.width,
                this.bulletType.height,
                this.bulletType.image,
                this.bulletType.speed,
                this.bulletType.damage,
                "enemy",
                bulletVx, // Pass calculated vx
                bulletVy  // Pass calculated vy
            ));
            game.playSound(this.bulletType.sound);
            this.lastShotTime = game.currentTime;
        }

        // Mark for deletion if off screen
        if (this.x + this.width < 0) {
            this.markedForDeletion = true;
        }
    }

    takeDamage(damage: number, game: Game): void {
        this.health -= damage;
        if (this.health <= 0) {
            this.markedForDeletion = true;
            game.score += this.scoreValue;
            game.explosions.push(new Explosion(this.x, this.y, this.width, this.height, game.data!.gameSettings.explosionDuration));
            game.playSound("explosion");
        }
    }
}

class Explosion extends GameObject {
    timer: number;
    duration: number; // in seconds

    constructor(x: number, y: number, width: number, height: number, duration: number) {
        super(x, y, width, height, "explosion"); // Assuming "explosion" is the image name
        this.duration = duration;
        this.timer = duration;
    }

    update(deltaTime: number, game: Game): void {
        this.timer -= deltaTime;
        if (this.timer <= 0) {
            this.markedForDeletion = true;
        }
    }
}

class Background {
    image: HTMLImageElement | null = null;
    scrollSpeed: number;
    x: number = 0; // Use a single x for continuous tiling
    gameWidth: number;
    gameHeight: number;
    scaledWidth: number = 0; // Stored scaled width based on canvas height and aspect ratio

    constructor(imageName: string, scrollSpeed: number, gameWidth: number, gameHeight: number, game: Game) {
        this.image = game.images.get(imageName) || null;
        this.scrollSpeed = scrollSpeed;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        if (this.image) {
            // Calculate scaled width to cover gameHeight while maintaining aspect ratio
            this.scaledWidth = (this.image.width / this.image.height) * this.gameHeight;

            // Handle potential edge cases where scaledWidth might be invalid or zero
            if (isNaN(this.scaledWidth) || !isFinite(this.scaledWidth) || this.scaledWidth <= 0) {
                this.scaledWidth = Math.max(1, this.image.width); // Fallback: use original width, ensuring it's at least 1
                console.warn(`Background image '${imageName}' scaledWidth calculation resulted in invalid value. Using fallback width.`);
            }
            this.x = 0;
        }
    }

    update(deltaTime: number): void {
        if (!this.image || this.scaledWidth <= 0) return;

        this.x -= this.scrollSpeed * deltaTime;

        // Reset x when it moves completely off-screen to the left to create a seamless loop
        // Ensure this.x is always in the range [-scaledWidth, 0)
        while (this.x <= -this.scaledWidth) {
            this.x += this.scaledWidth;
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (!this.image || this.scaledWidth <= 0) return;

        // Start drawing from the current x position
        let currentDrawX = this.x;

        // Draw tiles until the entire canvas width is covered
        // We need to draw tiles that start from 'currentDrawX' and go past 'gameWidth'
        while (currentDrawX < this.gameWidth) {
            ctx.drawImage(this.image, currentDrawX, 0, this.scaledWidth, this.gameHeight);
            currentDrawX += this.scaledWidth;
        }
    }
}


class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    data: GameData | null = null;
    images: Map<string, HTMLImageElement> = new Map();
    sounds: Map<string, HTMLAudioElement> = new Map();
    gameState: GameState = GameState.LOADING;
    lastFrameTime: number = 0;
    currentTime: number = 0; // Total elapsed time in milliseconds

    player: Player | null = null;
    enemies: Enemy[] = [];
    playerBullets: Bullet[] = [];
    enemyBullets: Bullet[] = [];
    explosions: Explosion[] = [];
    background: Background | null = null;

    score: number = 0;
    currentLevelIndex: number = 0;
    levelTimer: number = 0; // Time elapsed in current level (seconds)
    activeSpawnIntervals: Set<number> = new Set(); // To clear intervals when changing levels

    input: Map<string, boolean> = new Map();
    music: HTMLAudioElement | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.initEventListeners();
    }

    async start(): Promise<void> {
        this.drawLoadingScreen("Loading Game Data...");
        try {
            const response = await fetch('data.json');
            this.data = await response.json();

            if (!this.data) throw new Error("Failed to load game data.");

            this.canvas.width = this.data.gameSettings.canvasWidth;
            this.canvas.height = this.data.gameSettings.canvasHeight;

            this.drawLoadingScreen("Loading Assets...");
            await this.loadAssets();

            // Set up background after loading assets
            this.background = new Background(
                "background",
                this.data.gameSettings.scrollSpeed,
                this.canvas.width,
                this.canvas.height,
                this
            );
            this.setState(GameState.TITLE);
            this.lastFrameTime = performance.now();
            requestAnimationFrame(this.gameLoop.bind(this));
        } catch (error) {
            console.error("Failed to start game:", error);
            this.drawLoadingScreen(`Error: ${error}`);
        }
    }

    private drawLoadingScreen(message: string): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial, sans-serif'; // Changed to basic font
        this.ctx.textAlign = 'center';
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    }

    private async loadAssets(): Promise<void> {
        if (!this.data) return;

        const imagePromises = this.data.assets.images.map(async (asset) => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = asset.path;
                img.onload = () => {
                    this.images.set(asset.name, img);
                    resolve();
                };
                img.onerror = () => reject(`Failed to load image: ${asset.path}`);
            });
        });

        const soundPromises = this.data.assets.sounds.map(async (asset) => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = asset.path;
                audio.volume = asset.volume;
                // Preload to ensure it's ready
                audio.oncanplaythrough = () => {
                    this.sounds.set(asset.name, audio);
                    resolve();
                };
                audio.onerror = () => reject(`Failed to load sound: ${asset.path}`);
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private initEventListeners(): void {
        window.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'Enter'].includes(e.code)) {
                e.preventDefault(); // Prevent scrolling for arrow keys/space
                this.input.set(e.code, true);
                if (e.code === 'Enter') {
                    this.handleEnterKey();
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'Enter'].includes(e.code)) {
                this.input.set(e.code, false);
            }
        });
    }

    private handleEnterKey(): void {
        switch (this.gameState) {
            case GameState.TITLE:
                this.setState(GameState.INSTRUCTIONS);
                break;
            case GameState.INSTRUCTIONS:
                this.initGame();
                this.setState(GameState.PLAYING);
                break;
            case GameState.GAME_OVER:
                this.setState(GameState.TITLE);
                break;
            default:
                break;
        }
    }

    setState(newState: GameState): void {
        this.gameState = newState;
        if (newState === GameState.PLAYING) {
            this.startMusic("bgm", true);
        } else {
            this.stopMusic();
            if (newState === GameState.TITLE) {
                // Optionally play title screen specific music here
            } else if (newState === GameState.GAME_OVER) {
                // Game over sound is played in Player.takeDamage
            }
        }
        // Clear any active spawn intervals when state changes from PLAYING
        if (newState !== GameState.PLAYING) {
            this.activeSpawnIntervals.forEach(id => clearInterval(id));
            this.activeSpawnIntervals.clear();
        }
    }

    initGame(): void {
        if (!this.data) return;
        this.player = new Player(
            this.canvas.width * 0.1,
            this.canvas.height / 2 - this.data.player.height / 2,
            this
        );
        this.enemies = [];
        this.playerBullets = [];
        this.enemyBullets = [];
        this.explosions = [];
        this.score = 0;
        this.currentLevelIndex = 0;
        this.levelTimer = 0;
        // Reset _spawned flag for all events in all levels
        this.data.levels.forEach(level => {
            level.spawnEvents.forEach(event => event._spawned = false);
        });
    }

    gameLoop(timestamp: number): void {
        if (!this.data) {
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }

        const deltaTime = (timestamp - this.lastFrameTime) / 1000; // Delta time in seconds
        this.lastFrameTime = timestamp;
        this.currentTime = timestamp; // Total elapsed time in milliseconds

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.updatePlaying(deltaTime);
                break;
            default:
                break;
        }
    }

    updatePlaying(deltaTime: number): void {
        if (!this.player || !this.data || !this.background) return;

        this.background.update(deltaTime);
        this.player.update(deltaTime, this);

        // Level progression and enemy spawning
        this.levelTimer += deltaTime;
        const currentLevelConfig = this.data.levels[this.currentLevelIndex];

        if (currentLevelConfig) {
            currentLevelConfig.spawnEvents.forEach(event => {
                if (event.time <= this.levelTimer && !event._spawned) {
                    if (event.count && event.interval) {
                        event._spawned = true; // Mark as spawned to prevent re-triggering wave
                        let spawnedCount = 0;
                        const intervalId = setInterval(() => {
                            if (spawnedCount < event.count!) {
                                this.spawnEnemy(event.enemyName, event.startX, event.startY);
                                spawnedCount++;
                            } else {
                                clearInterval(intervalId);
                                this.activeSpawnIntervals.delete(intervalId as number);
                            }
                        }, event.interval * 1000); // interval in milliseconds
                        this.activeSpawnIntervals.add(intervalId as number); // Store ID to clear later
                    } else {
                        // Single enemy spawn
                        this.spawnEnemy(event.enemyName, event.startX, event.startY);
                        event._spawned = true; // Mark as spawned
                    }
                }
            });

            // If level duration is over, advance to next level or end game
            if (this.levelTimer >= currentLevelConfig.duration) {
                this.currentLevelIndex++;
                this.levelTimer = 0; // Reset timer for the new level

                // Clear any remaining intervals for the just-ended level
                this.activeSpawnIntervals.forEach(id => clearInterval(id));
                this.activeSpawnIntervals.clear();

                if (!this.data.levels[this.currentLevelIndex]) {
                    // All levels completed
                    this.setState(GameState.GAME_OVER); // Could be 'VICTORY' state
                }
            }
        } else {
            // No more levels, perhaps keep previous level's spawns or just wait for player to finish
            // For now, let's just transition to game over.
            this.setState(GameState.GAME_OVER);
        }

        // Update and filter game objects
        this.enemies.forEach(e => e.update(deltaTime, this));
        this.playerBullets.forEach(b => b.update(deltaTime, this));
        this.enemyBullets.forEach(b => b.update(deltaTime, this));
        this.explosions.forEach(e => e.update(deltaTime, this));

        // Collision detection
        this.checkCollisions();

        // Remove marked for deletion
        this.enemies = this.enemies.filter(e => !e.markedForDeletion);
        this.playerBullets = this.playerBullets.filter(b => !b.markedForDeletion);
        this.enemyBullets = this.enemyBullets.filter(b => !b.markedForDeletion);
        this.explosions = this.explosions.filter(e => !e.markedForDeletion);

        // Check game over condition (player.health <= 0 is handled in Player.takeDamage)
    }

    spawnEnemy(enemyName: string, startX: "rightEdge" | number, startY: "random" | "top" | "bottom" | number): void {
        if (!this.data) return;
        const enemyConfig = this.data.enemyTypes.find(e => e.name === enemyName);
        if (!enemyConfig) {
            console.warn(`Enemy type '${enemyName}' not found.`);
            return;
        }

        let actualX = startX === "rightEdge" ? this.canvas.width : startX;
        let actualY: number;

        if (startY === "random") {
            actualY = Math.random() * (this.canvas.height - enemyConfig.height);
        } else if (startY === "top") {
            actualY = 0;
        } else if (startY === "bottom") {
            actualY = this.canvas.height - enemyConfig.height;
        } else {
            actualY = startY;
        }

        this.enemies.push(new Enemy(actualX, actualY, enemyConfig, this));
    }

    checkCollisions(): void {
        if (!this.player) return;

        // Player bullets vs. Enemies
        this.playerBullets.forEach(bullet => {
            this.enemies.forEach(enemy => {
                if (!bullet.markedForDeletion && !enemy.markedForDeletion && this.isColliding(bullet, enemy)) {
                    enemy.takeDamage(bullet.damage, this);
                    bullet.markedForDeletion = true;
                }
            });
        });

        // Enemy bullets vs. Player
        this.enemyBullets.forEach(bullet => {
            if (!bullet.markedForDeletion && !this.player!.markedForDeletion && this.isColliding(bullet, this.player!)) {
                this.player!.takeDamage(bullet.damage, this);
                bullet.markedForDeletion = true;
            }
        });

        // Player vs. Enemies (contact damage/collision)
        this.enemies.forEach(enemy => {
            if (!enemy.markedForDeletion && !this.player!.markedForDeletion && this.isColliding(this.player!, enemy)) {
                // Player takes damage and enemy is destroyed
                this.player!.takeDamage(enemy.health, this);
                enemy.markedForDeletion = true;
                this.explosions.push(new Explosion(enemy.x, enemy.y, enemy.width, enemy.height, this.data!.gameSettings.explosionDuration));
                this.playSound("explosion");
            }
        });
    }

    isColliding(obj1: GameObject, obj2: GameObject): boolean {
        return obj1.x < obj2.x + obj2.width &&
            obj1.x + obj1.width > obj2.x &&
            obj1.y < obj2.y + obj2.height &&
            obj1.y + obj1.height > obj2.y;
    }

    render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // Clear entire canvas

        if (!this.data) {
            this.drawLoadingScreen("Loading...");
            return;
        }

        // Always draw background if loaded
        this.background?.draw(this.ctx);

        switch (this.gameState) {
            case GameState.TITLE:
                this.renderTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.renderInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.renderPlaying();
                break;
            case GameState.GAME_OVER:
                this.renderGameOverScreen();
                break;
            case GameState.LOADING:
                // Loading screen already handled by drawLoadingScreen
                break;
        }
    }

    renderPlaying(): void {
        this.enemies.forEach(e => e.draw(this.ctx, this));
        this.playerBullets.forEach(b => b.draw(this.ctx, this));
        this.enemyBullets.forEach(b => b.draw(this.ctx, this));
        this.player?.draw(this.ctx, this);
        this.explosions.forEach(e => e.draw(this.ctx, this));

        // Draw UI
        this.drawText(`Score: ${this.score}`, 10, 30, 'white', 'left', '24px Arial, sans-serif'); // Changed to basic font
        this.drawText(`Health: ${this.player?.health || 0}`, 10, 60, 'white', 'left', '24px Arial, sans-serif'); // Changed to basic font
    }

    // Helper to draw an image using 'object-fit: contain' logic, centered (prevents cropping, may leave blank space)
    private drawImageContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, canvasWidth: number, canvasHeight: number): void {
        const imageRatio = image.width / image.height;
        const canvasRatio = canvasWidth / canvasHeight;

        let drawWidth: number;
        let drawHeight: number;

        if (imageRatio > canvasRatio) {
            // Image is wider than canvas (relative to height), scale to fit canvas width
            drawWidth = canvasWidth;
            drawHeight = canvasWidth / imageRatio;
        } else {
            // Image is taller than canvas (relative to width), scale to fit canvas height
            drawHeight = canvasHeight;
            drawWidth = canvasHeight * imageRatio;
        }

        const drawX = (canvasWidth - drawWidth) / 2;
        const drawY = (canvasHeight - drawHeight) / 2;

        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    }

    // Helper to draw an image using 'object-fit: cover' logic (fills the canvas, may crop image edges)
    private drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, canvasWidth: number, canvasHeight: number): void {
        const imageRatio = image.width / image.height;
        const canvasRatio = canvasWidth / canvasHeight;

        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = image.width;
        let sourceHeight = image.height;

        let destX = 0;
        let destY = 0;
        let destWidth = canvasWidth;
        let destHeight = canvasHeight;

        if (imageRatio > canvasRatio) {
            // Image is wider than canvas ratio, so scale by height and crop width
            sourceWidth = image.height * canvasRatio;
            sourceX = (image.width - sourceWidth) / 2;
        } else {
            // Image is taller than canvas ratio, so scale by width and crop height
            sourceHeight = image.width / canvasRatio;
            sourceY = (image.height - sourceHeight) / 2;
        }

        ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
    }

    renderTitleScreen(): void {
        if (!this.data) return;
        const titleImage = this.images.get("title_background");
        if (titleImage) {
            // Use drawImageCover for the title background to fill the entire canvas, potentially cropping edges
            this.drawImageCover(this.ctx, titleImage, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = 'darkblue';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.drawText(this.data.gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50, 'white', 'center', '48px Arial, sans-serif'); // Changed to basic font
        this.drawText("Press ENTER to Start", this.canvas.width / 2, this.canvas.height / 2 + 50, 'white', 'center', '24px Arial, sans-serif'); // Changed to basic font
    }

    renderInstructionsScreen(): void {
        if (!this.data) return;
        const titleImage = this.images.get("title_background");
        if (titleImage) {
            // Use drawImageCover for the instructions background to fill the entire canvas, potentially cropping edges
            this.drawImageCover(this.ctx, titleImage, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = 'darkblue';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.drawText("조작법", this.canvas.width / 2, 100, 'white', 'center', '40px Arial, sans-serif'); // Changed to basic font
        this.data.gameSettings.instructionsText.forEach((line, index) => {
            this.drawText(line, this.canvas.width / 2, 180 + index * 40, 'white', 'center', '20px Arial, sans-serif'); // Changed to basic font
        });
        this.drawText("Press ENTER to Play", this.canvas.width / 2, this.canvas.height - 100, 'white', 'center', '24px Arial, sans-serif'); // Changed to basic font
    }

    renderGameOverScreen(): void {
        if (!this.data) return;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawText(this.data.gameSettings.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 80, 'red', 'center', '60px Arial, sans-serif'); // Changed to basic font
        this.drawText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2, 'white', 'center', '36px Arial, sans-serif'); // Changed to basic font
        this.drawText("Press ENTER to return to Title", this.canvas.width / 2, this.canvas.height / 2 + 80, 'white', 'center', '24px Arial, sans-serif'); // Changed to basic font
    }

    drawText(text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', font: string): void {
        this.ctx.fillStyle = color;
        this.ctx.font = font;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
    }

    playSound(soundName: string, loop: boolean = false): void {
        const audio = this.sounds.get(soundName);
        if (audio) {
            const clone = audio.cloneNode(true) as HTMLAudioElement; // Clone for concurrent playback
            clone.volume = audio.volume;
            clone.loop = loop;
            clone.play().catch(e => console.warn(`Sound playback failed: ${soundName}`, e));
        } else {
            console.warn(`Sound '${soundName}' not found.`);
        }
    }

    startMusic(soundName: string, loop: boolean = true): void {
        this.stopMusic(); // Stop any existing music
        const audio = this.sounds.get(soundName);
        if (audio) {
            this.music = audio; // Use the original Audio element for background music
            this.music.loop = loop;
            this.music.play().catch(e => console.warn(`Music playback failed: ${soundName}`, e));
        } else {
            console.warn(`Music '${soundName}' not found.`);
        }
    }

    stopMusic(): void {
        if (this.music) {
            this.music.pause();
            this.music.currentTime = 0;
            this.music = null;
        }
    }
}

// Global scope to ensure it's accessible by HTML
declare global {
    interface Window {
        game: Game;
    }
}

window.onload = () => {
    // Removed custom font loading to comply with the "basic font" requirement.
    // Using a default web-safe font like Arial, sans-serif.
    window.game = new Game('gameCanvas');
    window.game.start();
};
