// game.ts

// --- 1. Interfaces for GameConfig (data.json structure) ---
interface AssetConfig {
    name: string;
    path: string;
}

interface CanvasConfig {
    width: number;
    height: number;
}

interface GameSettingsConfig {
    scrollSpeed: number; // pixels per second
    enemySpawnInterval: number; // milliseconds
    initialPlayerHealth: number;
}

interface BulletTypeConfig {
    imageName: string;
    width: number;
    height: number;
    speed: number; // pixels per second
    damage: number;
}

interface PlayerConfig {
    imageName: string;
    speed: number; // pixels per second
    fireRate: number; // milliseconds
    bulletType: string; // Key into GameConfig.bullets
}

interface EnemyConfig {
    name: string;
    imageName: string;
    health: number;
    speed: number; // pixels per second
    collisionDamage: number;
    scoreValue: number;
    fireRate: number; // milliseconds, 0 if not shooting
    bulletType: string; // Key into GameConfig.bullets, or empty string if not shooting
    spawnChance: number; // 0-1 probability
}

interface GameConfig {
    canvas: CanvasConfig;
    game: GameSettingsConfig;
    assets: {
        images: AssetConfig[];
    };
    player: PlayerConfig;
    bullets: { [key: string]: BulletTypeConfig };
    enemies: EnemyConfig[];
}

// --- 2. Base GameObject Class ---
class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.image = image;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }

    // AABB (Axis-Aligned Bounding Box) collision detection
    checkCollision(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

// --- 3. Bullet Class ---
class Bullet extends GameObject {
    speed: number;
    damage: number;
    owner: 'player' | 'enemy'; // To differentiate friendly fire

    constructor(x: number, y: number, config: BulletTypeConfig, image: HTMLImageElement, owner: 'player' | 'enemy') {
        super(x, y, config.width, config.height, image);
        this.speed = config.speed;
        this.damage = config.damage;
        this.owner = owner;
    }

    update(deltaTime: number): void {
        const moveAmount = this.speed * (deltaTime / 1000); // Convert speed to pixels per frame
        if (this.owner === 'player') {
            this.y -= moveAmount;
        } else {
            this.y += moveAmount;
        }
    }
}

// --- 4. Player Class ---
class Player extends GameObject {
    health: number;
    maxHealth: number;
    speed: number; // pixels per second
    fireRate: number; // milliseconds
    lastFireTime: number;
    bulletConfig: BulletTypeConfig;
    bulletImage: HTMLImageElement;
    canvasWidth: number;
    canvasHeight: number;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement,
                playerConfig: PlayerConfig, initialHealth: number,
                bulletConfig: BulletTypeConfig, bulletImage: HTMLImageElement,
                canvasWidth: number, canvasHeight: number) {
        super(x, y, width, height, image);
        this.health = initialHealth;
        this.maxHealth = initialHealth;
        this.speed = playerConfig.speed;
        this.fireRate = playerConfig.fireRate;
        this.lastFireTime = 0;
        this.bulletConfig = bulletConfig;
        this.bulletImage = bulletImage;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
    }

    move(keys: Set<string>, deltaTime: number): void {
        const moveSpeed = this.speed * (deltaTime / 1000); // Convert speed to pixels per frame
        if (keys.has('arrowleft') || keys.has('a')) {
            this.x = Math.max(0, this.x - moveSpeed);
        }
        if (keys.has('arrowright') || keys.has('d')) {
            this.x = Math.min(this.canvasWidth - this.width, this.x + moveSpeed);
        }
        if (keys.has('arrowup') || keys.has('w')) {
            this.y = Math.max(0, this.y - moveSpeed);
        }
        if (keys.has('arrowdown') || keys.has('s')) {
            this.y = Math.min(this.canvasHeight - this.height, this.y + moveSpeed);
        }
    }

    shoot(currentTime: number): Bullet | null {
        if (currentTime - this.lastFireTime > this.fireRate) {
            this.lastFireTime = currentTime;
            return new Bullet(
                this.x + this.width / 2 - this.bulletConfig.width / 2, // Center bullet horizontally
                this.y, // Spawn at top of player
                this.bulletConfig,
                this.bulletImage,
                'player'
            );
        }
        return null;
    }

    takeDamage(amount: number): void {
        this.health -= amount;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);
        // Draw health bar below the player
        const healthBarWidth = 50;
        const healthBarHeight = 5;
        const healthRatio = Math.max(0, this.health / this.maxHealth); // Ensure ratio is not negative
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x + (this.width - healthBarWidth) / 2, this.y + this.height + 5, healthBarWidth, healthBarHeight);
        ctx.fillStyle = 'lime';
        ctx.fillRect(this.x + (this.width - healthBarWidth) / 2, this.y + this.height + 5, healthBarWidth * healthRatio, healthBarHeight);
        ctx.strokeStyle = 'white';
        ctx.strokeRect(this.x + (this.width - healthBarWidth) / 2, this.y + this.height + 5, healthBarWidth, healthBarHeight);
    }
}

// --- 5. Enemy Class ---
class Enemy extends GameObject {
    health: number;
    maxHealth: number;
    speed: number; // pixels per second
    collisionDamage: number;
    scoreValue: number;
    fireRate: number; // milliseconds
    lastFireTime: number;
    bulletConfig: BulletTypeConfig | null;
    bulletImage: HTMLImageElement | null;
    canvasWidth: number;
    canvasHeight: number;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement,
                enemyConfig: EnemyConfig, bulletConfig: BulletTypeConfig | null, bulletImage: HTMLImageElement | null,
                canvasWidth: number, canvasHeight: number) {
        super(x, y, width, height, image);
        this.health = enemyConfig.health;
        this.maxHealth = enemyConfig.health;
        this.speed = enemyConfig.speed;
        this.collisionDamage = enemyConfig.collisionDamage;
        this.scoreValue = enemyConfig.scoreValue;
        this.fireRate = enemyConfig.fireRate;
        this.lastFireTime = 0;
        this.bulletConfig = bulletConfig;
        this.bulletImage = bulletImage;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
    }

    update(deltaTime: number): void {
        const moveAmount = this.speed * (deltaTime / 1000); // Convert speed to pixels per frame
        this.y += moveAmount;
    }

    shoot(currentTime: number): Bullet | null {
        if (this.bulletConfig && this.bulletImage && this.fireRate > 0 && currentTime - this.lastFireTime > this.fireRate) {
            this.lastFireTime = currentTime;
            return new Bullet(
                this.x + this.width / 2 - this.bulletConfig.width / 2, // Center bullet horizontally
                this.y + this.height, // Spawn at bottom of enemy
                this.bulletConfig,
                this.bulletImage,
                'enemy'
            );
        }
        return null;
    }

    takeDamage(amount: number): void {
        this.health -= amount;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        super.draw(ctx);
        // Draw health bar above the enemy if damaged
        if (this.health < this.maxHealth) {
            const healthBarWidth = 40;
            const healthBarHeight = 4;
            const healthRatio = Math.max(0, this.health / this.maxHealth); // Ensure ratio is not negative
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x + (this.width - healthBarWidth) / 2, this.y - 10, healthBarWidth, healthBarHeight);
            ctx.fillStyle = 'lime';
            ctx.fillRect(this.x + (this.width - healthBarWidth) / 2, this.y - 10, healthBarWidth * healthRatio, healthBarHeight);
            ctx.strokeStyle = 'white';
            ctx.strokeRect(this.x + (this.width - healthBarWidth) / 2, this.y - 10, healthBarWidth, healthBarHeight);
        }
    }
}

// --- 6. Background Class ---
class Background {
    image: HTMLImageElement;
    scrollSpeed: number; // pixels per second
    canvasHeight: number;
    y1: number;
    y2: number;

    constructor(image: HTMLImageElement, scrollSpeed: number, canvasHeight: number) {
        this.image = image;
        this.scrollSpeed = scrollSpeed;
        this.canvasHeight = canvasHeight;
        this.y1 = 0; // Top image starts at 0
        this.y2 = -this.canvasHeight; // Second image starts directly above the canvas
    }

    update(deltaTime: number): void {
        const moveAmount = this.scrollSpeed * (deltaTime / 1000); // Convert speed to pixels per frame
        this.y1 += moveAmount;
        this.y2 += moveAmount;

        // If an image scrolls completely off screen, reset its position to loop
        if (this.y1 >= this.canvasHeight) {
            this.y1 = this.y2 - this.canvasHeight;
        }
        if (this.y2 >= this.canvasHeight) {
            this.y2 = this.y1 - this.canvasHeight;
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        // Draw the background image twice to create a seamless scrolling effect
        ctx.drawImage(this.image, 0, this.y1, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(this.image, 0, this.y2, ctx.canvas.width, ctx.canvas.height);
    }
}

// --- 7. Main Game Class ---
class Game {
    private config: GameConfig;
    private images: Map<string, HTMLImageElement>;
    private ctx: CanvasRenderingContext2D;
    private canvasWidth: number;
    private canvasHeight: number;

    private player: Player | null = null;
    private bullets: Bullet[] = [];
    private enemies: Enemy[] = [];
    private background: Background | null = null;

    private score: number = 0;
    private gameOver: boolean = false;
    private pressedKeys: Set<string> = new Set();
    private lastFrameTime: number = 0;
    private lastEnemySpawnTime: number = 0;

    constructor(config: GameConfig, images: Map<string, HTMLImageElement>, ctx: CanvasRenderingContext2D) {
        this.config = config;
        this.images = images;
        this.ctx = ctx;
        this.canvasWidth = config.canvas.width;
        this.canvasHeight = config.canvas.height;

        // Set canvas dimensions
        this.ctx.canvas.width = this.canvasWidth;
        this.ctx.canvas.height = this.canvasHeight;
    }

    init(): void {
        // Player Initialization
        const playerImage = this.images.get(this.config.player.imageName);
        if (!playerImage) throw new Error(`Player image '${this.config.player.imageName}' not found.`);
        const playerBulletConfig = this.config.bullets[this.config.player.bulletType];
        if (!playerBulletConfig) throw new Error(`Player bullet type '${this.config.player.bulletType}' not found.`);
        const playerBulletImage = this.images.get(playerBulletConfig.imageName);
        if (!playerBulletImage) throw new Error(`Player bullet image '${playerBulletConfig.imageName}' not found.`);

        this.player = new Player(
            this.canvasWidth / 2 - playerImage.width / 2, // Center player horizontally
            this.canvasHeight - playerImage.height - 20, // Position near bottom
            playerImage.width,
            playerImage.height,
            playerImage,
            this.config.player,
            this.config.game.initialPlayerHealth,
            playerBulletConfig,
            playerBulletImage,
            this.canvasWidth,
            this.canvasHeight
        );

        // Background Initialization
        const backgroundImage = this.images.get('background');
        if (!backgroundImage) throw new Error("Background image 'background' not found.");
        this.background = new Background(backgroundImage, this.config.game.scrollSpeed, this.canvasHeight);

        // Event Listeners for Keyboard Input
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        this.pressedKeys.add(e.key.toLowerCase());
        // Prevent default browser behavior for spacebar (e.g., scrolling)
        if (e.key === ' ' && !this.gameOver) {
            e.preventDefault();
        }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        this.pressedKeys.delete(e.key.toLowerCase());
    };

    private update(deltaTime: number, currentTime: number): void {
        if (this.gameOver || !this.player || !this.background) return;

        // Update Background
        this.background.update(deltaTime);

        // Update Player Movement and Shooting
        this.player.move(this.pressedKeys, deltaTime);
        if (this.pressedKeys.has(' ')) {
            const newBullet = this.player.shoot(currentTime);
            if (newBullet) {
                this.bullets.push(newBullet);
            }
        }

        // Spawn Enemies
        if (currentTime - this.lastEnemySpawnTime > this.config.game.enemySpawnInterval) {
            this.lastEnemySpawnTime = currentTime;
            this.spawnEnemy();
        }

        // Update Bullets
        this.bullets.forEach(bullet => bullet.update(deltaTime));
        // Remove bullets that go off-screen
        this.bullets = this.bullets.filter(bullet =>
            bullet.y + bullet.height > 0 && bullet.y < this.canvasHeight
        );

        // Update Enemies and Enemy Shooting
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime);
            const enemyBullet = enemy.shoot(currentTime);
            if (enemyBullet) {
                this.bullets.push(enemyBullet);
            }
        });
        // Remove enemies that go off-screen
        this.enemies = this.enemies.filter(enemy =>
            enemy.y < this.canvasHeight + enemy.height // Keep enemies until they are fully off screen
        );

        // Collision Detection
        this.checkCollisions();

        // Game Over condition
        if (this.player.health <= 0) {
            this.gameOver = true;
            this.displayGameOver();
        }
    }

    private checkCollisions(): void {
        if (!this.player) return;

        // Player Bullets vs. Enemies
        this.bullets.forEach(bullet => {
            if (bullet.owner === 'player') {
                this.enemies.forEach(enemy => {
                    if (bullet.checkCollision(enemy)) {
                        enemy.takeDamage(bullet.damage);
                        bullet.y = -100; // Mark bullet for removal (off-screen)
                        if (enemy.health <= 0) {
                            enemy.x = -1000; // Mark enemy for removal (off-screen)
                            this.score += enemy.scoreValue;
                        }
                    }
                });
            }
        });
        // Filter out destroyed bullets and enemies
        this.bullets = this.bullets.filter(b => b.y !== -100);
        this.enemies = this.enemies.filter(e => e.x !== -1000);

        // Enemy Bullets vs. Player
        this.bullets.forEach(bullet => {
            if (bullet.owner === 'enemy' && this.player && bullet.checkCollision(this.player)) {
                this.player.takeDamage(bullet.damage);
                bullet.y = -100; // Mark bullet for removal
            }
        });
        this.bullets = this.bullets.filter(b => b.y !== -100);

        // Enemies vs. Player (Collision Damage)
        this.enemies.forEach(enemy => {
            if (this.player && enemy.checkCollision(this.player)) {
                this.player.takeDamage(enemy.collisionDamage);
                enemy.health = 0; // Enemy is destroyed on collision
                enemy.x = -1000; // Mark enemy for removal
                this.score += enemy.scoreValue; // Player still gets score for destroying it
            }
        });
        this.enemies = this.enemies.filter(e => e.x !== -1000);
    }

    private spawnEnemy(): void {
        const availableEnemies = this.config.enemies;
        if (availableEnemies.length === 0) return;

        let totalChance = 0;
        for (const enemyConfig of availableEnemies) {
            totalChance += enemyConfig.spawnChance;
        }

        let rand = Math.random() * totalChance;
        let selectedEnemyConfig: EnemyConfig | null = null;

        // Select an enemy based on spawn chances
        for (const enemyConfig of availableEnemies) {
            if (rand < enemyConfig.spawnChance) {
                selectedEnemyConfig = enemyConfig;
                break;
            }
            rand -= enemyConfig.spawnChance;
        }
        if (!selectedEnemyConfig) { // Fallback if no enemy was selected due to floating point inaccuracies or sum < 1
            selectedEnemyConfig = availableEnemies[Math.floor(Math.random() * availableEnemies.length)];
        }
        if (!selectedEnemyConfig) return; // Should not happen with the fallback, but for type safety

        const enemyImage = this.images.get(selectedEnemyConfig.imageName);
        if (!enemyImage) {
            console.warn(`Enemy image '${selectedEnemyConfig.imageName}' not found for enemy '${selectedEnemyConfig.name}'.`);
            return;
        }

        let enemyBulletConfig: BulletTypeConfig | null = null;
        let enemyBulletImage: HTMLImageElement | null = null;

        // Check if enemy has a bullet type defined
        if (selectedEnemyConfig.bulletType) {
            const potentialBulletConfig = this.config.bullets[selectedEnemyConfig.bulletType];
            if (potentialBulletConfig) {
                // Check if the bullet image exists in the loaded assets
                const potentialBulletImage = this.images.get(potentialBulletConfig.imageName);
                if (potentialBulletImage !== undefined) { // Explicitly check for undefined
                    enemyBulletConfig = potentialBulletConfig;
                    enemyBulletImage = potentialBulletImage;
                } else {
                    console.warn(`Bullet image '${potentialBulletConfig.imageName}' not found for enemy '${selectedEnemyConfig.name}'. Enemy will not shoot.`);
                    // If bullet image is missing, enemyBulletConfig remains null, preventing shooting.
                }
            } else {
                console.warn(`Bullet type '${selectedEnemyConfig.bulletType}' not found in config for enemy '${selectedEnemyConfig.name}'. Enemy will not shoot.`);
            }
        }

        const x = Math.random() * (this.canvasWidth - enemyImage.width);
        const y = -enemyImage.height; // Spawn off-screen at the top

        this.enemies.push(new Enemy(
            x, y, enemyImage.width, enemyImage.height, enemyImage,
            selectedEnemyConfig, enemyBulletConfig, enemyBulletImage,
            this.canvasWidth, this.canvasHeight
        ));
    }

    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight); // Clear canvas

        // Draw Background
        this.background?.draw(this.ctx);

        // Draw Player
        this.player?.draw(this.ctx);

        // Draw Bullets
        this.bullets.forEach(bullet => bullet.draw(this.ctx));

        // Draw Enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx));

        // Draw UI (Score, Health, Game Over message)
        this.drawUI();
    }

    private drawUI(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        this.ctx.fillText(`Health: ${this.player?.health || 0}`, 10, 60);

        if (this.gameOver) {
            this.ctx.font = '40px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = 'red';
            this.ctx.fillText('GAME OVER', this.canvasWidth / 2, this.canvasHeight / 2 - 20);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '25px Arial';
            this.ctx.fillText(`Final Score: ${this.score}`, this.canvasWidth / 2, this.canvasHeight / 2 + 30);
        }
    }

    private displayGameOver(): void {
        // Remove event listeners to stop player input on game over
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        // Optionally, add a restart button or other game over UI
    }

    // Main game loop using requestAnimationFrame
    gameLoop = (currentTime: number = 0): void => {
        // Calculate deltaTime for frame-rate independent movement
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;

        this.update(deltaTime, currentTime);
        this.draw();

        if (!this.gameOver) {
            requestAnimationFrame(this.gameLoop);
        }
    };
}

// --- Global Initialization Function ---
async function initGame(): Promise<void> {
    console.log("Initializing game...");
    try {
        // 1. Fetch data.json configuration
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        const config: GameConfig = await response.json();
        console.log("Game configuration loaded.");

        // 2. Load all image assets
        const images: Map<string, HTMLImageElement> = new Map();
        const imagePromises = config.assets.images.map(asset => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = asset.path;
                img.onload = () => {
                    images.set(asset.name, img);
                    resolve();
                };
                img.onerror = () => reject(new Error(`Failed to load image: ${asset.path}`));
            });
        });
        await Promise.all(imagePromises);
        console.log("All assets loaded.");

        // 3. Get canvas and its 2D rendering context
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!canvas) {
            throw new Error("Canvas element with ID 'gameCanvas' not found. Please ensure an HTML element with id='gameCanvas' exists.");
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error("Failed to get 2D rendering context from canvas.");
        }

        // 4. Create and start the game
        const game = new Game(config, images, ctx);
        game.init();
        game.gameLoop();
        console.log("Game started.");

    } catch (error) {
        console.error("Game initialization failed:", error);
        // Display error message on canvas for the user
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Ensure canvas is correctly sized for error message
                if (!ctx.canvas.width || !ctx.canvas.height) {
                    ctx.canvas.width = 640; // Default size if not set by config
                    ctx.canvas.height = 960;
                }
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.fillStyle = 'red';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Error initializing game.', ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
                ctx.fillText('Please check the browser console for details.', ctx.canvas.width / 2, ctx.canvas.height / 2 + 10);
            }
        }
    }
}

// Ensure the DOM is fully loaded before attempting to initialize the game
window.addEventListener('load', initGame);