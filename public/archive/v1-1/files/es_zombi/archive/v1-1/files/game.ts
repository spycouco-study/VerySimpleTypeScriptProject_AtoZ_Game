interface GameData {
    canvas: {
        width: number;
        height: number;
    };
    gameplay: {
        player: {
            speed: number;
            fireRate: number; // seconds between shots
            health: number;
            width: number; // Display width
            height: number; // Display height
        };
        enemy: {
            speed: number;
            fireRate: number; // seconds between shots
            health: number;
            spawnInterval: number; // seconds between enemy spawns
            width: number; // Display width
            height: number; // Display height
        };
        playerBullet: {
            speed: number;
            damage: number;
            width: number;
            height: number;
        };
        enemyBullet: {
            speed: number;
            damage: number;
            width: number;
            height: number;
        };
    };
    text: {
        titleScreen: string;
        gameOver: string;
        loading: string;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

interface LoadedImages {
    [key: string]: HTMLImageElement;
}

interface LoadedSounds {
    [key: string]: HTMLAudioElement;
}

enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER
}

class Vector2 {
    constructor(public x: number, public y: number) {}
}

class GameObject {
    position: Vector2;
    width: number; // Display width
    height: number; // Display height
    imageName: string;
    isAlive: boolean = true;

    constructor(x: number, y: number, width: number, height: number, imageName: string) {
        this.position = new Vector2(x, y);
        this.width = width;
        this.height = height;
        this.imageName = imageName;
    }

    draw(ctx: CanvasRenderingContext2D, loadedImages: LoadedImages) {
        const image = loadedImages[this.imageName];
        if (image && this.isAlive) {
            // Draw image scaled to object's width and height, centered on position
            ctx.drawImage(image, this.position.x - this.width / 2, this.position.y - this.height / 2, this.width, this.height);
        }
    }

    // AABB collision detection, assumes position is center
    collidesWith(other: GameObject): boolean {
        if (!this.isAlive || !other.isAlive) return false;

        const thisLeft = this.position.x - this.width / 2;
        const thisRight = this.position.x + this.width / 2;
        const thisTop = this.position.y - this.height / 2;
        const thisBottom = this.position.y + this.height / 2;

        const otherLeft = other.position.x - other.width / 2;
        const otherRight = other.position.x + other.width / 2;
        const otherTop = other.position.y - other.height / 2;
        const otherBottom = other.position.y + other.height / 2;

        return thisLeft < otherRight &&
               thisRight > otherLeft &&
               thisTop < otherBottom &&
               thisBottom > otherTop;
    }

    // Check if any part of the object is outside the canvas
    isOffscreen(canvasWidth: number, canvasHeight: number): boolean {
        return this.position.x + this.width / 2 < 0 || this.position.x - this.width / 2 > canvasWidth ||
               this.position.y + this.height / 2 < 0 || this.position.y - this.height / 2 > canvasHeight;
    }
}

class Player extends GameObject {
    speed: number;
    health: number;
    fireRate: number;
    lastShotTime: number = 0;
    movingLeft: boolean = false;
    movingRight: boolean = false;

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, health: number, fireRate: number) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.health = health;
        this.fireRate = fireRate;
    }

    update(deltaTime: number, canvasWidth: number) {
        if (this.movingLeft) {
            this.position.x -= this.speed * deltaTime;
        }
        if (this.movingRight) {
            this.position.x += this.speed * deltaTime;
        }

        // Clamp player position within canvas bounds
        this.position.x = Math.max(this.width / 2, Math.min(canvasWidth - this.width / 2, this.position.x));
    }

    takeDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0) {
            this.isAlive = false;
        }
    }

    canShoot(currentTime: number): boolean {
        return currentTime - this.lastShotTime >= this.fireRate;
    }
}

class Bullet extends GameObject {
    speed: number;
    damage: number;
    direction: Vector2; // Normalized direction vector

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, damage: number, direction: Vector2) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.damage = damage;
        this.direction = direction;
    }

    update(deltaTime: number) {
        this.position.x += this.direction.x * this.speed * deltaTime;
        this.position.y += this.direction.y * this.speed * deltaTime;
    }
}

class Enemy extends GameObject {
    speed: number;
    health: number;
    fireRate: number;
    lastShotTime: number = 0;

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, health: number, fireRate: number) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.health = health;
        this.fireRate = fireRate;
    }

    update(deltaTime: number) {
        this.position.y += this.speed * deltaTime;
    }

    takeDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0) {
            this.isAlive = false;
        }
    }

    canShoot(currentTime: number): boolean {
        return currentTime - this.lastShotTime >= this.fireRate;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gameData!: GameData;
    private loadedImages: LoadedImages = {};
    private loadedSounds: LoadedSounds = {};
    private gameState: GameState = GameState.LOADING;
    private lastFrameTime: number = 0;

    private player!: Player;
    private playerBullets: Bullet[] = [];
    private enemies: Enemy[] = [];
    private enemyBullets: Bullet[] = [];

    private score: number = 0;
    private enemySpawnTimer: number = 0;
    private backgroundMusic: HTMLAudioElement | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;

        // Bind event handlers to 'this'
        this.handleInput = this.handleInput.bind(this);
        document.addEventListener('keydown', this.handleInput);
        document.addEventListener('keyup', this.handleInput);
        document.addEventListener('click', this.handleInput);
    }

    async init() {
        this.drawLoadingScreen(); // Draw initial loading screen
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.gameData = await response.json();

            // Set canvas dimensions from loaded data
            this.canvas.width = this.gameData.canvas.width;
            this.canvas.height = this.gameData.canvas.height;

            await this.loadAssets();
            this.gameState = GameState.TITLE;
            this.lastFrameTime = performance.now();
            requestAnimationFrame(this.gameLoop.bind(this)); // Start game loop

            if (this.loadedSounds['bgm']) {
                this.backgroundMusic = this.loadedSounds['bgm'];
                this.backgroundMusic.loop = true;
                this.backgroundMusic.volume = this.gameData.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.5;
            }

        } catch (error) {
            console.error("Failed to load game data or assets:", error);
            this.drawErrorScreen("Error loading game. Check console for details.");
        }
    }

    private async loadAssets() {
        const imagePromises = this.gameData.assets.images.map(img => {
            return new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => {
                    this.loadedImages[img.name] = image;
                    resolve();
                };
                image.onerror = () => reject(new Error(`Failed to load image: ${img.path}`));
            });
        });

        const soundPromises = this.gameData.assets.sounds.map(snd => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = snd.path;
                audio.volume = snd.volume;
                audio.oncanplaythrough = () => {
                    this.loadedSounds[snd.name] = audio;
                    resolve();
                };
                audio.onerror = () => reject(new Error(`Failed to load sound: ${snd.path}`));
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private drawLoadingScreen() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.gameData?.text.loading || "Loading Game...", this.canvas.width / 2, this.canvas.height / 2);
    }

    private drawErrorScreen(message: string) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    }

    private gameLoop(currentTime: number) {
        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
        this.lastFrameTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number) {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.updatePlaying(deltaTime);
                break;
            // No updates for LOADING, TITLE, GAME_OVER states, just drawing static screens
        }
    }

    private updatePlaying(deltaTime: number) {
        // Player update
        this.player.update(deltaTime, this.canvas.width);

        // Update player bullets
        this.playerBullets = this.playerBullets.filter(bullet => {
            bullet.update(deltaTime);
            return bullet.isAlive && !bullet.isOffscreen(this.canvas.width, this.canvas.height);
        });

        // Update enemies and enemy shooting
        this.enemySpawnTimer -= deltaTime;
        if (this.enemySpawnTimer <= 0) {
            this.spawnEnemy();
            this.enemySpawnTimer = this.gameData.gameplay.enemy.spawnInterval;
        }

        const currentTime = performance.now() / 1000;
        this.enemies = this.enemies.filter(enemy => {
            enemy.update(deltaTime);
            if (enemy.isAlive) {
                // Enemy shooting
                if (enemy.canShoot(currentTime) && Math.random() < 0.2) { // 20% chance per interval
                    enemy.lastShotTime = currentTime;
                    const bulletData = this.gameData.gameplay.enemyBullet;
                    this.enemyBullets.push(new Bullet(
                        enemy.position.x,
                        enemy.position.y + enemy.height / 2,
                        bulletData.width, bulletData.height,
                        'enemyBullet', bulletData.speed, bulletData.damage,
                        new Vector2(0, 1) // Downwards
                    ));
                }
            }
            // Remove if offscreen or not alive
            return enemy.isAlive && !enemy.isOffscreen(this.canvas.width, this.canvas.height);
        });

        // Update enemy bullets
        this.enemyBullets = this.enemyBullets.filter(bullet => {
            bullet.update(deltaTime);
            return bullet.isAlive && !bullet.isOffscreen(this.canvas.width, this.canvas.height);
        });

        // Collision detection
        this.checkCollisions();

        if (!this.player.isAlive) {
            this.gameState = GameState.GAME_OVER;
            this.backgroundMusic?.pause();
        }
    }

    private checkCollisions() {
        // Player bullets vs Enemies
        this.playerBullets.forEach(pBullet => {
            if (!pBullet.isAlive) return;
            this.enemies.forEach(enemy => {
                if (!enemy.isAlive) return;
                if (pBullet.collidesWith(enemy)) {
                    enemy.takeDamage(pBullet.damage);
                    pBullet.isAlive = false; // Bullet disappears on hit
                    if (!enemy.isAlive) {
                        this.score += 10; // Score for destroying enemy
                        this.playSound('enemyHit');
                    }
                }
            });
        });

        // Enemy bullets vs Player
        this.enemyBullets.forEach(eBullet => {
            if (!eBullet.isAlive || !this.player.isAlive) return;
            if (eBullet.collidesWith(this.player)) {
                this.player.takeDamage(eBullet.damage);
                eBullet.isAlive = false; // Bullet disappears on hit
                this.playSound('playerHit');
            }
        });

        // Player vs Enemies (direct collision)
        this.enemies.forEach(enemy => {
            if (!enemy.isAlive || !this.player.isAlive) return;
            if (this.player.collidesWith(enemy)) {
                this.player.takeDamage(1); // Lose 1 health on collision
                enemy.isAlive = false; // Enemy is destroyed
                this.score += 5; // Smaller score for collision kill
                this.playSound('enemyHit');
                this.playSound('playerHit');
            }
        });
    }

    private spawnEnemy() {
        const enemyData = this.gameData.gameplay.enemy;
        const xPos = Math.random() * (this.canvas.width - enemyData.width) + enemyData.width / 2;
        const yPos = -enemyData.height / 2; // Start just above screen
        this.enemies.push(new Enemy(
            xPos, yPos,
            enemyData.width, enemyData.height,
            'enemy', enemyData.speed, enemyData.health, enemyData.fireRate
        ));
    }


    private draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // Game background

        switch (this.gameState) {
            case GameState.LOADING:
                this.drawLoadingScreen();
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                this.drawPlaying();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawTitleScreen() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '40px Arial';
        this.ctx.textAlign = 'center';
        const lines = this.gameData.text.titleScreen.split('\n');
        lines.forEach((line, index) => {
            this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 + (index * 50) - (lines.length -1)*25);
        });
    }

    private drawPlaying() {
        // Draw player
        this.player.draw(this.ctx, this.loadedImages);

        // Draw player bullets
        this.playerBullets.forEach(bullet => bullet.draw(this.ctx, this.loadedImages));

        // Draw enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx, this.loadedImages));

        // Draw enemy bullets
        this.enemyBullets.forEach(bullet => bullet.draw(this.ctx, this.loadedImages));

        // Draw UI
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        this.ctx.fillText(`Health: ${this.player.health}`, 10, 60);
    }

    private drawGameOverScreen() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '40px Arial';
        this.ctx.textAlign = 'center';
        const gameOverText = this.gameData.text.gameOver + this.score + '\nPress any key to restart';
        const lines = gameOverText.split('\n');
        lines.forEach((line, index) => {
            this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 + (index * 50) - (lines.length -1)*25);
        });
    }

    private handleInput(event: KeyboardEvent | MouseEvent) {
        if (this.gameState === GameState.TITLE || this.gameState === GameState.GAME_OVER) {
            if (event.type === 'keydown' || event.type === 'click') {
                this.startGame();
            }
        } else if (this.gameState === GameState.PLAYING) {
            const keyboardEvent = event as KeyboardEvent;
            if (keyboardEvent.type === 'keydown') {
                if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'a') {
                    this.player.movingLeft = true;
                } else if (keyboardEvent.key === 'ArrowRight' || keyboardEvent.key === 'd') {
                    this.player.movingRight = true;
                } else if (keyboardEvent.key === ' ' && this.player.isAlive) { // Spacebar to shoot
                    const currentTime = performance.now() / 1000;
                    if (this.player.canShoot(currentTime)) {
                        this.player.lastShotTime = currentTime;
                        const bulletData = this.gameData.gameplay.playerBullet;
                        this.playerBullets.push(new Bullet(
                            this.player.position.x,
                            this.player.position.y - this.player.height / 2,
                            bulletData.width, bulletData.height,
                            'playerBullet', bulletData.speed, bulletData.damage,
                            new Vector2(0, -1) // Upwards
                        ));
                        this.playSound('playerShoot');
                    }
                }
            } else if (keyboardEvent.type === 'keyup') {
                if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'a') {
                    this.player.movingLeft = false;
                } else if (keyboardEvent.key === 'ArrowRight' || keyboardEvent.key === 'd') {
                    this.player.movingRight = false;
                }
            }
        }
    }

    private startGame() {
        // Reset game state
        this.score = 0;
        this.playerBullets = [];
        this.enemies = [];
        this.enemyBullets = [];
        this.enemySpawnTimer = this.gameData.gameplay.enemy.spawnInterval;

        const playerGameplayData = this.gameData.gameplay.player;
        this.player = new Player(
            this.canvas.width / 2,
            this.canvas.height - playerGameplayData.height / 2 - 20, // offset from bottom
            playerGameplayData.width, playerGameplayData.height,
            'player', playerGameplayData.speed, playerGameplayData.health, playerGameplayData.fireRate
        );

        this.gameState = GameState.PLAYING;
        // Attempt to play background music. It might fail if no user gesture has occurred yet.
        this.backgroundMusic?.play().catch(e => console.warn("Background music play failed (user gesture required?):", e));
    }

    private playSound(name: string) {
        const audio = this.loadedSounds[name];
        if (audio) {
            // Clone audio to allow multiple concurrent plays without interrupting previous ones
            const clone = audio.cloneNode() as HTMLAudioElement;
            clone.volume = audio.volume; // Retain original volume
            clone.play().catch(e => console.warn(`Failed to play sound '${name}':`, e));
        }
    }
}

// Initialize the game when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game('gameCanvas');
    game.init();
});