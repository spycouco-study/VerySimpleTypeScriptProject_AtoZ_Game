interface GameConfig {
    canvas: {
        width: number;
        height: number;
    };
    game: {
        gravity: number;
        player_flap_strength: number;
        player_max_fall_speed: number;
        player_bounce_strength: number;
        obstacle_speed: number;
        obstacle_interval_min: number;
        obstacle_interval_max: number;
        obstacle_gap_height: number;
        obstacle_width: number;
        background_scroll_speed: number;
        initial_player_y_velocity: number;
        game_over_delay_ms: number;
    };
    player: {
        start_x: number;
        start_y: number;
        width: number;
        height: number;
        image: string;
    };
    obstacles: Array<{
        name: string;
        image_top: string;
        image_bottom: string;
    }>;
    text: {
        title_main: string;
        title_sub: string;
        instructions_title: string;
        instructions_line1: string;
        instructions_line2: string;
        instructions_line3: string;
        instructions_continue: string;
        game_over_main: string;
        game_over_score: string;
        game_over_restart: string;
    };
    assets: {
        images: Array<{ name: string; path: string; width: number; height: number }>;
        sounds: Array<{ name: string; path: string; duration_seconds: number; volume: number }>;
    };
}

interface LoadedImageAsset {
    img: HTMLImageElement;
    width: number; // Original width from config
    height: number; // Original height from config
}

interface LoadedSoundAsset {
    audio: HTMLAudioElement;
    duration_seconds: number;
    volume: number;
}

enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER
}

class Player {
    x: number;
    y: number;
    width: number;
    height: number;
    velocityY: number;
    imageName: string;
    isAlive: boolean;

    constructor(x: number, y: number, width: number, height: number, imageName: string, initialVelocityY: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageName = imageName;
        this.velocityY = initialVelocityY;
        this.isAlive = true;
    }

    flap(strength: number): void {
        this.velocityY = strength;
    }

    update(gravity: number, maxFallSpeed: number, canvasHeight: number, bounceStrength: number): void {
        this.velocityY += gravity;
        if (this.velocityY > maxFallSpeed) {
            this.velocityY = maxFallSpeed;
        }
        this.y += this.velocityY;

        // Keep player within canvas bounds (floor and ceiling)
        if (this.y < 0) {
            this.y = 0;
            this.velocityY = 0; // Stop movement upwards
        }
        if (this.y + this.height > canvasHeight) {
            this.y = canvasHeight - this.height;
            this.velocityY = bounceStrength; // Bounce off the bottom
        }
    }
}

class Obstacle {
    x: number;
    gapY: number; // Top of the gap
    width: number;
    gapHeight: number;
    imageTopName: string;
    imageBottomName: string;
    scored: boolean;

    constructor(x: number, gapY: number, width: number, gapHeight: number, imageTopName: string, imageBottomName: string) {
        this.x = x;
        this.gapY = gapY;
        this.width = width;
        this.gapHeight = gapHeight;
        this.imageTopName = imageTopName;
        this.imageBottomName = imageBottomName;
        this.scored = false;
    }

    update(speed: number): void {
        this.x -= speed;
    }

    // AABB collision detection
    collidesWith(player: Player): boolean {
        // Check for horizontal overlap
        const horizontalOverlap = player.x < this.x + this.width && player.x + player.width > this.x;

        if (!horizontalOverlap) return false;

        // Collision with top part of the obstacle (above the gap)
        const topObstacleBottomY = this.gapY;
        if (player.y < topObstacleBottomY) {
            return true;
        }

        // Collision with bottom part of the obstacle (below the gap)
        const bottomObstacleTopY = this.gapY + this.gapHeight;
        if (player.y + player.height > bottomObstacleTopY) {
            return true;
        }

        return false;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig | null = null;
    private images: Map<string, LoadedImageAsset> = new Map();
    private sounds: Map<string, LoadedSoundAsset> = new Map();
    private gameState: GameState = GameState.TITLE;
    private player: Player | null = null;
    private obstacles: Obstacle[] = [];
    private score: number = 0;
    private lastObstacleTime: number = 0;
    private lastFrameTime: number = 0;
    private backgroundX: number = 0;
    private bgMusic: HTMLAudioElement | null = null;
    private gameOverTimer: number | null = null; // Timer to delay game over screen

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        if (!this.canvas) {
            console.error(`Canvas with ID '${canvasId}' not found.`);
            return;
        }

        this.ctx.imageSmoothingEnabled = false; // For pixel art feel
    }

    async init(): Promise<void> {
        await this.loadConfig();
        if (!this.config) {
            console.error("Failed to load game configuration.");
            return;
        }

        this.canvas.width = this.config.canvas.width;
        this.canvas.height = this.config.canvas.height;

        await this.loadAssets();
        this.setupInput();
        this.bgMusic = this.sounds.get("bg_music")?.audio || null;
        if (this.bgMusic) {
            this.bgMusic.loop = true;
            this.bgMusic.volume = this.config.assets.sounds.find(s => s.name === "bg_music")?.volume || 0.3;
        }
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private async loadConfig(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
        } catch (error) {
            console.error("Error loading config:", error);
            this.config = null;
        }
    }

    private async loadAssets(): Promise<void> {
        if (!this.config) return;

        const imagePromises = this.config.assets.images.map(asset => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = asset.path;
                img.onload = () => {
                    this.images.set(asset.name, { img, width: asset.width, height: asset.height });
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${asset.path}`);
                    reject();
                };
            });
        });

        const soundPromises = this.config.assets.sounds.map(asset => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = asset.path;
                audio.volume = asset.volume;
                audio.oncanplaythrough = () => {
                    this.sounds.set(asset.name, { audio, duration_seconds: asset.duration_seconds, volume: asset.volume });
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load sound: ${asset.path}`);
                    reject();
                };
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private setupInput(): void {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.config) return;

        if (event.code === 'Space') {
            event.preventDefault(); // Prevent page scrolling
            switch (this.gameState) {
                case GameState.TITLE:
                    this.gameState = GameState.INSTRUCTIONS;
                    break;
                case GameState.INSTRUCTIONS:
                    this.resetGame();
                    this.gameState = GameState.PLAYING;
                    this.bgMusic?.play().catch(e => console.error("BGM play failed:", e)); // Start BGM
                    break;
                case GameState.PLAYING:
                    if (this.player && this.player.isAlive) {
                        this.player.flap(this.config.game.player_flap_strength);
                        this.playSound("flap_sound");
                    }
                    break;
                case GameState.GAME_OVER:
                    // Only allow restart after the game over delay has passed
                    if (this.gameOverTimer === null) { // This condition is true when game over screen is fully shown
                         this.resetGame();
                         this.gameState = GameState.PLAYING;
                         this.bgMusic?.play().catch(e => console.error("BGM play failed:", e));
                    }
                    break;
            }
        }
    }

    private resetGame(): void {
        if (!this.config) return;
        this.player = new Player(
            this.config.player.start_x,
            this.config.player.start_y,
            this.config.player.width,
            this.config.player.height,
            this.config.player.image,
            this.config.game.initial_player_y_velocity
        );
        this.obstacles = [];
        this.score = 0;
        this.lastObstacleTime = performance.now();
        this.gameOverTimer = null; // Clear the timer on reset
    }

    private gameLoop(currentTime: DOMHighResTimeStamp): void {
        // Prevent large delta time on tab switch etc.
        if (this.lastFrameTime === 0) {
            this.lastFrameTime = currentTime;
        }
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;

        if (this.config) {
            this.update(deltaTime);
            this.render();
        }
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number): void {
        if (!this.config) return;

        switch (this.gameState) {
            case GameState.PLAYING:
                if (!this.player || !this.player.isAlive) {
                    // Player is not alive, transition to GAME_OVER after a delay
                    if (this.gameOverTimer === null) {
                        this.gameOverTimer = performance.now() + this.config.game.game_over_delay_ms;
                    } else if (performance.now() >= this.gameOverTimer) {
                        this.gameState = GameState.GAME_OVER;
                        this.gameOverTimer = null; // Reset timer
                        if (this.bgMusic) { // Safely access bgMusic
                            this.bgMusic.pause();
                            this.bgMusic.currentTime = 0; // Reset BGM
                        }
                    }
                    return; // Stop updating game elements if player is not alive
                }

                // If we reach here, this.player is guaranteed to be a Player object and isAlive is true.
                const currentPlayer = this.player;

                // Update player
                currentPlayer.update(this.config.game.gravity, this.config.game.player_max_fall_speed, this.canvas.height, this.config.game.player_bounce_strength);

                // Update obstacles
                for (let i = 0; i < this.obstacles.length; i++) {
                    const obstacle = this.obstacles[i];
                    obstacle.update(this.config.game.obstacle_speed);

                    // Check for collision
                    if (obstacle.collidesWith(currentPlayer)) { // Fix: collidesWith is on Obstacle, not Player
                        currentPlayer.isAlive = false; // Fix: player is guaranteed non-null here
                        this.playSound("hit_sound");
                        break; // Stop checking collisions if player hit
                    }

                    // Check for scoring
                    if (!obstacle.scored && obstacle.x + obstacle.width < currentPlayer.x) {
                        this.score++;
                        obstacle.scored = true;
                    }
                }

                // Remove off-screen obstacles
                this.obstacles = this.obstacles.filter(obstacle => obstacle.x + obstacle.width > 0);

                // Generate new obstacles
                const now = performance.now();
                if (now - this.lastObstacleTime > this.getRandomObstacleInterval()) {
                    this.addObstacle();
                    this.lastObstacleTime = now;
                }
                
                // Update background scroll
                this.backgroundX = (this.backgroundX - this.config.game.background_scroll_speed) % this.config.canvas.width;
                if (this.backgroundX < -this.config.canvas.width) {
                    this.backgroundX += this.config.canvas.width;
                }
                break;
            case GameState.TITLE:
            case GameState.INSTRUCTIONS:
            case GameState.GAME_OVER:
                // No update logic for these states, just waiting for input
                break;
        }
    }

    private getRandomObstacleInterval(): number {
        if (!this.config) return 0;
        return Math.random() * (this.config.game.obstacle_interval_max - this.config.game.obstacle_interval_min) + this.config.game.obstacle_interval_min;
    }

    private addObstacle(): void {
        if (!this.config) return;

        const minGapY = 50; // Minimum distance from top of canvas
        const maxGapY = this.canvas.height - this.config.game.obstacle_gap_height - 50; // Maximum distance from bottom of canvas
        const gapY = Math.random() * (maxGapY - minGapY) + minGapY;

        const randomObstacleType = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];

        this.obstacles.push(new Obstacle(
            this.canvas.width,
            gapY, // gapY is the Y coordinate of the top edge of the gap
            this.config.game.obstacle_width,
            this.config.game.obstacle_gap_height,
            randomObstacleType.image_top,
            randomObstacleType.image_bottom
        ));
    }

    private render(): void {
        if (!this.config) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw scrolling background
        this.drawObject("background_ocean", this.backgroundX, 0, this.canvas.width, this.canvas.height);
        this.drawObject("background_ocean", this.backgroundX + this.canvas.width, 0, this.canvas.width, this.canvas.height);


        switch (this.gameState) {
            case GameState.TITLE:
                this.drawText(this.config.text.title_main, this.canvas.width / 2, this.canvas.height / 2 - 50, '50px serif', 'white');
                this.drawText(this.config.text.title_sub, this.canvas.width / 2, this.canvas.height / 2 + 20, '20px serif', 'white');
                break;
            case GameState.INSTRUCTIONS:
                this.drawText(this.config.text.instructions_title, this.canvas.width / 2, this.canvas.height / 2 - 100, '40px serif', 'white');
                this.drawText(this.config.text.instructions_line1, this.canvas.width / 2, this.canvas.height / 2 - 40, '25px serif', 'white');
                this.drawText(this.config.text.instructions_line2, this.canvas.width / 2, this.canvas.height / 2, '25px serif', 'white');
                this.drawText(this.config.text.instructions_line3, this.canvas.width / 2, this.canvas.height / 2 + 40, '25px serif', 'white');
                this.drawText(this.config.text.instructions_continue, this.canvas.width / 2, this.canvas.height / 2 + 100, '20px serif', 'white');
                break;
            case GameState.PLAYING:
            case GameState.GAME_OVER: // Render game elements even if game over
                // Draw player
                if (this.player && this.player.isAlive) {
                    this.drawObject(this.player.imageName, this.player.x, this.player.y, this.player.width, this.player.height);
                } else if (this.player && !this.player.isAlive && this.gameOverTimer !== null && performance.now() < this.gameOverTimer) {
                    // If player just died, draw them slightly rotated as if falling
                    this.ctx.save();
                    this.ctx.translate(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
                    this.ctx.rotate(Math.PI / 4); // Rotate 45 degrees
                    this.drawObject(this.player.imageName, -this.player.width / 2, -this.player.height / 2, this.player.width, this.player.height);
                    this.ctx.restore();
                }

                // Draw obstacles
                for (const obstacle of this.obstacles) {
                    // Top part of obstacle: drawn from top of canvas to gapY
                    this.drawObject(obstacle.imageTopName, obstacle.x, 0, obstacle.width, obstacle.gapY);
                    // Bottom part of obstacle: drawn from gapY + gapHeight to bottom of canvas
                    this.drawObject(obstacle.imageBottomName, obstacle.x, obstacle.gapY + obstacle.gapHeight, obstacle.width, this.canvas.height - (obstacle.gapY + obstacle.gapHeight));
                }

                // Draw score
                this.drawText(`Score: ${this.score}`, this.canvas.width / 2, 50, '30px serif', 'white');

                if (this.gameState === GameState.GAME_OVER) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                    this.drawText(this.config.text.game_over_main, this.canvas.width / 2, this.canvas.height / 2 - 50, '50px serif', 'red');
                    this.drawText(`${this.config.text.game_over_score}${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20, '30px serif', 'white');
                    this.drawText(this.config.text.game_over_restart, this.canvas.width / 2, this.canvas.height / 2 + 70, '20px serif', 'white');
                }
                break;
        }
    }

    private drawObject(imageName: string, x: number, y: number, width: number, height: number): void {
        const asset = this.images.get(imageName);
        if (asset) {
            this.ctx.drawImage(asset.img, x, y, width, height);
        } else {
            // Fallback for missing images (draw a colored rectangle)
            console.warn(`Image asset '${imageName}' not found. Drawing placeholder.`);
            this.ctx.fillStyle = 'magenta';
            this.ctx.fillRect(x, y, width, height);
        }
    }

    private drawText(text: string, x: number, y: number, font: string, color: string): void {
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
    }

    private playSound(soundName: string): void {
        const soundAsset = this.sounds.get(soundName);
        if (soundAsset) {
            // Create a new Audio object to allow multiple simultaneous plays for sound effects
            const audio = new Audio(soundAsset.audio.src);
            audio.volume = soundAsset.volume;
            audio.play().catch(e => console.error(`Sound play failed for ${soundName}:`, e));
        }
    }
}

// Global instance to start the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game('gameCanvas');
    game.init();
});
