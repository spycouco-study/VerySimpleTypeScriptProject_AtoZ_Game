// TypeScript file for the Crazy Arcade-inspired game.
// All game logic, physics, and input handling are contained within this file.

// Global asset cache to store loaded images and sounds.
const assetCache: { images: Map<string, HTMLImageElement>, sounds: Map<string, HTMLAudioElement> } = {
    images: new Map(),
    sounds: new Map()
};

// Utility function to draw a sprite from the asset cache.
// Handles cases where an asset might be missing.
function drawSprite(ctx: CanvasRenderingContext2D, assetName: string, x: number, y: number, width: number, height: number): void {
    const img = assetCache.images.get(assetName);
    if (img) {
        ctx.drawImage(img, x, y, width, height);
    } else {
        // Fallback for missing images: draw a magenta rectangle with the asset name.
        ctx.fillStyle = 'magenta';
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = 'black';
        ctx.font = '10px Arial';
        ctx.fillText(assetName, x + width / 4, y + height / 2);
    }
}

// Utility function to play a sound from the asset cache.
// Creates a clone of the audio element to allow multiple simultaneous plays.
function playSound(assetName: string, loop: boolean = false): void {
    const audio = assetCache.sounds.get(assetName);
    if (audio) {
        const clonedAudio = audio.cloneNode() as HTMLAudioElement;
        clonedAudio.volume = audio.volume;
        clonedAudio.loop = loop;
        clonedAudio.play().catch(e => console.warn(`Sound playback failed for ${assetName}:`, e));
    } else {
        console.warn(`Sound asset not found: ${assetName}`);
    }
}

// Utility function to stop a playing sound and reset its playback position.
// Note: This stops only the original audio element, not any clones.
function stopSound(assetName: string): void {
    const audio = assetCache.sounds.get(assetName);
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

// Axis-Aligned Bounding Box (AABB) collision detection.
function checkCollision(obj1: { x: number, y: number, width: number, height: number }, obj2: { x: number, y: number, width: number, height: number }): boolean {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

// --- Game Interfaces and Enums ---

// Defines the overall structure of the game's data.
interface GameData {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        tileSize: number;
        playerSpeed: number; // in tiles per second
        bombDelay: number; // in seconds
        explosionDuration: number; // in seconds (for animation and hitbox)
        explosionRange: number; // in tiles from the center
        initialPlayerLives: number;
        powerUpDropChance: number; // probability from 0.0 to 1.0
        enemySpeed: number; // in tiles per second
        enemyMovementInterval: number; // in seconds, how often enemy considers changing direction
    };
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
    levels: LevelData[];
}

// Structure for an image asset definition.
interface ImageAsset {
    name: string;
    path: string;
    width: number; // Original pixel width of the image
    height: number; // Original pixel height of the image
}

// Structure for a sound asset definition.
interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

// Structure for a single level's data.
interface LevelData {
    mapTiles: number[][]; // 0: empty, 1: indestructible block, 2: destructible block
    playerSpawn: { x: number; y: number; }; // Player's starting grid coordinates
    enemySpawns: { x: number; y: number; }[]; // Array of enemy starting grid coordinates
}

// Enum for the different states of the game.
enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
    LEVEL_COMPLETE
}

// Enum for different tile types on the map.
enum TileType {
    EMPTY = 0,
    INDESTRUCTIBLE = 1,
    DESTRUCTIBLE = 2
}

// Enum for different types of power-ups.
enum PowerUpType {
    BOMB_COUNT,
    EXPLOSION_RANGE,
    SPEED
}

// Base interface for all game entities.
interface GameEntity {
    x: number;
    y: number;
    width: number;
    height: number;
    render(ctx: CanvasRenderingContext2D, game: Game): void; // Changed: Pass game instance
    update(deltaTime: number, game: Game): void;
}

// --- Game Class ---
class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gameData!: GameData; // Holds game settings, assets, and level data
    private lastUpdateTime: DOMHighResTimeStamp = 0; // For calculating deltaTime
    private animationFrameId: number = 0; // ID for requestAnimationFrame

    // Game state variables
    private currentGameState: GameState = GameState.TITLE;
    private currentLevelIndex: number = 0;

    // Game objects managed by the game instance
    private player!: Player;
    private bombs: Bomb[] = [];
    private explosions: Explosion[] = [];
    private enemies: Enemy[] = [];
    private powerUps: PowerUp[] = [];
    private tileMap: TileType[][] = []; // The current level's map

    // Input handling
    public keyboardState: Map<string, boolean> = new Map();
    private canPlaceBomb: boolean = true; // Prevents bomb spamming

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        if (!this.ctx) {
            throw new Error('Failed to get 2D rendering context for canvas.');
        }

        // Event listeners are now added after game data and assets are fully loaded in init().
        // this.addEventListeners();
    }

    // Sets up keyboard and mouse event listeners.
    private addEventListeners(): void {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        this.canvas.addEventListener('click', this.handleCanvasClick);
    }

    // Handles keydown events for player input and game state transitions.
    private handleKeyDown = (e: KeyboardEvent): void => {
        this.keyboardState.set(e.code, true);
        if (this.currentGameState === GameState.TITLE && e.code === 'Space') {
            e.preventDefault(); // Prevent default browser scrolling
            this.startGame();
        } else if (this.currentGameState === GameState.GAME_OVER && e.code === 'Space') {
            e.preventDefault();
            this.resetGame();
        } else if (this.currentGameState === GameState.LEVEL_COMPLETE && e.code === 'Space') {
            e.preventDefault();
            this.advanceLevel();
        }
    }

    // Handles keyup events.
    private handleKeyUp = (e: KeyboardEvent): void => {
        this.keyboardState.set(e.code, false);
        if (e.code === 'Space') {
            this.canPlaceBomb = true; // Allow placing another bomb after key is released
        }
    }

    // Handles canvas click events for title screen interaction.
    private handleCanvasClick = (e: MouseEvent): void => {
        if (this.currentGameState === GameState.TITLE) {
            this.startGame();
        }
    }

    // Initializes the game by fetching data, loading assets, and starting the game loop.
    public async init(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.gameData = await response.json() as GameData;

            this.canvas.width = this.gameData.gameSettings.canvasWidth;
            this.canvas.height = this.gameData.gameSettings.canvasHeight;

            await this.loadAssets();
            console.log("Assets loaded successfully!");

            // Add event listeners ONLY after gameData and assets are loaded to prevent
            // attempting to access gameData before it's fetched and parsed.
            this.addEventListeners();

            this.animationFrameId = requestAnimationFrame(this.gameLoop);

        } catch (error) {
            console.error("Failed to initialize game:", error);
        }
    }

    // Loads all images and sounds defined in data.json into the asset cache.
    private async loadAssets(): Promise<void> {
        const imagePromises = this.gameData.assets.images.map(asset => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = asset.path;
                img.onload = () => {
                    assetCache.images.set(asset.name, img);
                    resolve();
                };
                img.onerror = () => reject(`Failed to load image: ${asset.path}`);
            });
        });

        const soundPromises = this.gameData.assets.sounds.map(asset => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio(asset.path);
                audio.preload = 'auto'; // Preload the audio
                audio.volume = asset.volume;
                audio.oncanplaythrough = () => { // Ensure audio is ready to play
                    assetCache.sounds.set(asset.name, audio);
                    resolve();
                };
                audio.onerror = () => reject(`Failed to load sound: ${asset.path}`);
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    // The main game loop, called by requestAnimationFrame.
    private gameLoop = (currentTime: DOMHighResTimeStamp): void => {
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;

        this.update(deltaTime);
        this.render();

        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    // Updates the game state based on the current game state enum.
    private update(deltaTime: number): void {
        switch (this.currentGameState) {
            case GameState.PLAYING:
                this.updatePlayingState(deltaTime);
                break;
            // No updates needed for TITLE, GAME_OVER, LEVEL_COMPLETE states.
        }
    }

    // Handles all updates when the game is in the PLAYING state.
    private updatePlayingState(deltaTime: number): void {
        const settings = this.gameData.gameSettings;

        // 1. Player Update
        this.player.update(deltaTime, this);
        if (this.keyboardState.get('Space') && this.canPlaceBomb) {
            this.player.placeBomb(this);
            this.canPlaceBomb = false;
        }

        // 2. Bombs Update
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            bomb.update(deltaTime, this);
            if (bomb.exploded) {
                this.triggerExplosion(bomb.x, bomb.y, bomb.explosionRange);
                this.bombs.splice(i, 1);
            }
        }

        // 3. Explosions Update
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            explosion.update(deltaTime, this);
            if (explosion.isFinished) {
                this.explosions.splice(i, 1);
            }
        }

        // 4. Enemies Update
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(deltaTime, this);
            // Check collision with player
            if (this.player.isAlive && checkCollision(this.player, enemy)) {
                this.player.takeDamage(1);
                playSound('sfx_player_hit'); // Changed from this.playSound
            }
        }

        // 5. Power-ups Update
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            if (checkCollision(this.player, powerUp)) {
                this.player.applyPowerUp(powerUp.type);
                playSound('sfx_powerup'); // Changed from this.playSound
                this.powerUps.splice(i, 1);
            }
        }

        // Check win/lose conditions
        if (this.player.lives <= 0) {
            this.gameOver();
        } else if (this.enemies.length === 0) {
            // All enemies defeated
            if (this.currentLevelIndex + 1 >= this.gameData.levels.length) {
                this.gameWin(); // All levels completed
            } else {
                this.levelComplete(); // Current level completed, proceed to next
            }
        }
    }

    // Renders the game based on the current game state.
    private render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.currentGameState) {
            case GameState.TITLE:
                this.renderTitleScreen();
                break;
            case GameState.PLAYING:
                this.renderPlayingState();
                break;
            case GameState.GAME_OVER:
                this.renderGameOverScreen();
                break;
            case GameState.LEVEL_COMPLETE:
                this.renderLevelCompleteScreen();
                break;
        }
    }

    // Renders the title screen.
    private renderTitleScreen(): void {
        const img = assetCache.images.get('title_screen');
        if (img) {
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = 'darkblue';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Crazy Bomber Clone', this.canvas.width / 2, this.canvas.height / 2 - 50);
        }

        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Press SPACE or Click to Start', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    // Renders all game elements during the PLAYING state.
    private renderPlayingState(): void {
        const tileSize = this.gameData.gameSettings.tileSize;

        // Draw background
        this.ctx.fillStyle = 'rgb(50, 50, 50)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw map tiles
        for (let y = 0; y < this.tileMap.length; y++) {
            for (let x = 0; x < this.tileMap[y].length; x++) {
                const tileType = this.tileMap[y][x];
                let assetName: string | undefined;
                switch (tileType) {
                    case TileType.INDESTRUCTIBLE:
                        assetName = 'block_indestructible';
                        break;
                    case TileType.DESTRUCTIBLE:
                        assetName = 'block_destructible';
                        break;
                }
                if (assetName) {
                    drawSprite(this.ctx, assetName, x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }

        // Draw game objects in Z-order
        this.powerUps.forEach(p => p.render(this.ctx, this)); // Changed
        this.bombs.forEach(b => b.render(this.ctx, this));     // Changed
        this.player.render(this.ctx, this);                    // Changed
        this.enemies.forEach(e => e.render(this.ctx, this));   // Changed
        this.explosions.forEach(e => e.render(this.ctx, this)); // Changed

        // Draw UI
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Lives: ${this.player.lives}`, 10, 20);
        this.ctx.fillText(`Bombs: ${this.player.bombCount}/${this.player.maxBombCount}`, 10, 40);
        this.ctx.fillText(`Range: ${this.player.explosionRange}`, 10, 60);
        this.ctx.fillText(`Level: ${this.currentLevelIndex + 1}`, this.canvas.width - 80, 20);
    }

    // Renders the game over screen.
    private renderGameOverScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'red';
        this.ctx.font = '60px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 30);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press SPACE to Restart', this.canvas.width / 2, this.canvas.height / 2 + 30);
    }

    // Renders the level complete screen.
    private renderLevelCompleteScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'green';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';

        if (this.currentLevelIndex + 1 >= this.gameData.levels.length) {
            this.ctx.fillText('YOU WON!', this.canvas.width / 2, this.canvas.height / 2 - 30);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press SPACE to Play Again', this.canvas.width / 2, this.canvas.height / 2 + 30);
        } else {
            this.ctx.fillText(`LEVEL ${this.currentLevelIndex + 1} COMPLETE!`, this.canvas.width / 2, this.canvas.height / 2 - 30);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press SPACE for Next Level', this.canvas.width / 2, this.canvas.height / 2 + 30);
        }
    }

    // Initiates the game, typically from the title screen.
    private startGame(): void {
        this.currentLevelIndex = 0; // Always start from the first level
        this.resetGame();
    }

    // Resets the entire game state for a new playthrough.
    private resetGame(): void {
        this.currentLevelIndex = 0;
        const settings = this.gameData.gameSettings;
        // Initialize player with default stats (level loading will set position)
        this.player = new Player(0, 0, settings.tileSize, settings.initialPlayerLives,
                                settings.playerSpeed, 1, settings.explosionRange, 'player');
        this.loadLevel(this.currentLevelIndex);
        playSound('bgm', true); // Start looping background music
        this.currentGameState = GameState.PLAYING;
    }

    // Loads the specified level from gameData.
    private loadLevel(levelIndex: number): void {
        if (levelIndex >= this.gameData.levels.length) {
            this.gameWin(); // If trying to load a non-existent level after the last, means game is won.
            return;
        }

        const level = this.gameData.levels[levelIndex];
        const settings = this.gameData.gameSettings;
        const tileSize = settings.tileSize;

        // Clear all dynamic game objects
        this.bombs = [];
        this.explosions = [];
        this.enemies = [];
        this.powerUps = [];

        // Deep copy the map to allow modification (e.g., breaking blocks)
        this.tileMap = JSON.parse(JSON.stringify(level.mapTiles));

        // Position player and reset their stats for the new level
        this.player.x = level.playerSpawn.x * tileSize + (tileSize - this.player.width) / 2;
        this.player.y = level.playerSpawn.y * tileSize + (tileSize - this.player.height) / 2;
        this.player.resetForLevel(settings.initialPlayerLives, 1, settings.explosionRange, settings.playerSpeed);

        // Spawn enemies for the level
        level.enemySpawns.forEach(spawn => {
            this.enemies.push(new Enemy(
                spawn.x * tileSize + (tileSize - this.player.width) / 2,
                spawn.y * tileSize + (tileSize - this.player.height) / 2,
                tileSize,
                settings.enemySpeed,
                settings.enemyMovementInterval,
                'enemy'
            ));
        });
    }

    // Transitions the game to the GAME_OVER state.
    private gameOver(): void {
        this.currentGameState = GameState.GAME_OVER;
        stopSound('bgm');
        playSound('sfx_game_over');
    }

    // Transitions the game to the LEVEL_COMPLETE state (could be for winning all levels too).
    private gameWin(): void {
        this.currentGameState = GameState.LEVEL_COMPLETE;
        stopSound('bgm');
        playSound('sfx_level_complete');
    }

    // Signals that the current level is complete.
    private levelComplete(): void {
        this.currentGameState = GameState.LEVEL_COMPLETE;
        stopSound('bgm');
        playSound('sfx_level_complete');
    }

    // Advances to the next level or signals game win if all levels are complete.
    private advanceLevel(): void {
        this.currentLevelIndex++;
        if (this.currentLevelIndex < this.gameData.levels.length) {
            this.loadLevel(this.currentLevelIndex);
            this.currentGameState = GameState.PLAYING;
            playSound('bgm', true);
        } else {
            this.gameWin(); // All levels completed
        }
    }

    // Retrieves the tile type at a specific pixel coordinate.
    public getTileAtPixel(px: number, py: number): { x: number, y: number, type: TileType } | null {
        const tileSize = this.gameData.gameSettings.tileSize;
        const gridX = Math.floor(px / tileSize);
        const gridY = Math.floor(py / tileSize);
        return this.getTileType(gridX, gridY) !== undefined ? { x: gridX, y: gridY, type: this.getTileType(gridX, gridY)! } : null;
    }

    // Retrieves the tile type at a specific grid coordinate.
    public getTileType(gridX: number, gridY: number): TileType | undefined {
        if (gridY >= 0 && gridY < this.tileMap.length && gridX >= 0 && gridX < this.tileMap[0].length) {
            return this.tileMap[gridY][gridX];
        }
        return undefined;
    }

    // Sets the tile type at a specific grid coordinate.
    public setTileType(gridX: number, gridY: number, type: TileType): void {
        if (gridY >= 0 && gridY < this.tileMap.length && gridX >= 0 && gridX < this.tileMap[0].length) {
            this.tileMap[gridY][gridX] = type;
        }
    }

    // Adds a bomb to the game.
    public addBomb(bomb: Bomb): void {
        this.bombs.push(bomb);
    }

    // Adds an explosion visual effect to the game.
    public addExplosion(explosion: Explosion): void {
        this.explosions.push(explosion);
    }

    // Adds a power-up to the game world.
    public addPowerUp(powerUp: PowerUp): void {
        this.powerUps.push(powerUp);
    }

    // Initiates an explosion from a given center point and range.
    public triggerExplosion(centerX: number, centerY: number, range: number): void {
        const settings = this.gameData.gameSettings;
        const tileSize = settings.tileSize;
        // Convert center pixel coordinates to grid coordinates
        const gridX = Math.floor((centerX + tileSize / 2) / tileSize);
        const gridY = Math.floor((centerY + tileSize / 2) / tileSize);

        playSound('sfx_explosion');

        const checkedTiles = new Set<string>(); // Keep track of tiles already processed by this explosion

        // Helper function to process a single tile during explosion propagation.
        const processTile = (tx: number, ty: number, direction: 'up'|'down'|'left'|'right'|'center', endOfLine: boolean) => {
            const tileKey = `${tx},${ty}`;
            if (checkedTiles.has(tileKey)) return false; // Already processed
            checkedTiles.add(tileKey);

            const tileType = this.getTileType(tx, ty);
            const pixelX = tx * tileSize;
            const pixelY = ty * tileSize;

            // Add visual explosion effect for this tile.
            this.addExplosion(new Explosion(pixelX, pixelY, tileSize, settings.explosionDuration, direction, endOfLine));

            // Handle destructible blocks.
            if (tileType === TileType.DESTRUCTIBLE) {
                this.setTileType(tx, ty, TileType.EMPTY);
                // Chance to drop a power-up.
                if (Math.random() < settings.powerUpDropChance) {
                    const powerUpType = Math.floor(Math.random() * 3); // 0: bomb, 1: range, 2: speed
                    this.addPowerUp(new PowerUp(pixelX, pixelY, tileSize, tileSize, powerUpType));
                }
                return true; // Stop explosion propagation at destructible blocks.
            }

            // Check for player hit.
            if (this.player.isAlive && checkCollision(this.player, { x: pixelX, y: pixelY, width: tileSize, height: tileSize })) {
                this.player.takeDamage(1);
                playSound('sfx_player_hit');
            }

            // Check for enemies hit.
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const enemy = this.enemies[i];
                if (checkCollision(enemy, { x: pixelX, y: pixelY, width: tileSize, height: tileSize })) {
                    this.enemies.splice(i, 1); // Remove enemy
                }
            }

            // Check for other bombs hit (chain reaction).
            for (const bomb of this.bombs) {
                if (!bomb.exploded && checkCollision(bomb, { x: pixelX, y: pixelY, width: tileSize, height: tileSize })) {
                    bomb.explodeNow();
                }
            }

            if (tileType === TileType.INDESTRUCTIBLE) {
                return true; // Stop explosion propagation at indestructible blocks.
            }

            return false; // Continue propagation.
        };

        // Process the center of the explosion.
        processTile(gridX, gridY, 'center', false);

        // Define directions for explosion spread.
        const directions = [
            { dx: 0, dy: -1, dir: 'up' },
            { dx: 0, dy: 1, dir: 'down' },
            { dx: -1, dy: 0, dir: 'left' },
            { dx: 1, dy: 0, dir: 'right' },
        ];

        // Propagate explosion in each direction.
        for (const { dx, dy, dir } of directions) {
            for (let i = 1; i <= range; i++) {
                const currentTx = gridX + dx * i;
                const currentTy = gridY + dy * i;

                // Check if the next tile in this direction is a blocking tile (for `endOfLine` calculation)
                const nextTileType = this.getTileType(currentTx + dx, currentTy + dy);
                const endOfLine = (i === range) || (nextTileType === TileType.INDESTRUCTIBLE || nextTileType === TileType.DESTRUCTIBLE);

                const stopPropagation = processTile(currentTx, currentTy, dir as any, endOfLine);
                if (stopPropagation) {
                    break;
                }
            }
        }
    }

    // Getter for game settings.
    public getGameSettings() {
        return this.gameData.gameSettings;
    }

    // Getter for the player object.
    public getPlayer() {
        return this.player;
    }

    // Getter for the list of enemies.
    public getEnemies() {
        return this.enemies;
    }

    // Getter for the list of bombs.
    public getBombs(): Bomb[] { // Added public getter
        return this.bombs;
    }
}

// --- Player Class ---
class Player implements GameEntity {
    x: number;
    y: number;
    width: number;
    height: number;
    assetName: string;

    speed: number; // in tiles per second
    lives: number;
    bombCount: number; // current number of bombs placed
    maxBombCount: number; // maximum bombs allowed to be placed at once
    explosionRange: number;

    isAlive: boolean = true;
    invincibleTimer: number = 0; // Timer for invincibility frames after taking damage
    invincibleDuration: number = 2; // Duration of invincibility in seconds

    private tileSize: number;
    private alignmentTolerance: number = 1; // Tolerance in pixels for snapping to grid center

    constructor(x: number, y: number, tileSize: number, initialLives: number, speed: number, maxBombCount: number, explosionRange: number, assetName: string) {
        this.tileSize = tileSize;
        this.x = x;
        this.y = y;
        this.width = tileSize * 0.8; // Player sprite is slightly smaller than a tile
        this.height = tileSize * 0.8;
        this.assetName = assetName;

        this.lives = initialLives;
        this.speed = speed;
        this.maxBombCount = maxBombCount;
        this.bombCount = 0;
        this.explosionRange = explosionRange;
    }

    // Resets player stats and state for a new level.
    resetForLevel(initialLives: number, maxBombCount: number, explosionRange: number, speed: number): void {
        this.lives = initialLives;
        this.bombCount = 0;
        this.maxBombCount = maxBombCount;
        this.explosionRange = explosionRange;
        this.speed = speed;
        this.isAlive = true;
        this.invincibleTimer = 0;
    }

    // Updates player's position, invincibility, and handles input for a more natural Bomberman-like movement.
    update(deltaTime: number, game: Game): void {
        if (!this.isAlive) return;

        // Update invincibility timer
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= deltaTime;
            if (this.invincibleTimer <= 0) {
                this.invincibleTimer = 0;
            }
        }

        const settings = game.getGameSettings();
        const tileSize = settings.tileSize;
        const pixelSpeed = this.speed * settings.tileSize * deltaTime; // Speed in pixels per frame

        let inputDx = 0;
        let inputDy = 0;

        // Determine raw input
        if (game.keyboardState.get('ArrowUp') || game.keyboardState.get('KeyW')) { inputDy = -1; }
        if (game.keyboardState.get('ArrowDown') || game.keyboardState.get('KeyS')) { inputDy = 1; }
        if (game.keyboardState.get('ArrowLeft') || game.keyboardState.get('KeyA')) { inputDx = -1; }
        if (game.keyboardState.get('ArrowRight') || game.keyboardState.get('KeyD')) { inputDx = 1; }

        const playerCenterX = this.x + this.width / 2;
        const playerCenterY = this.y + this.height / 2;

        const currentGridX = Math.floor(playerCenterX / tileSize);
        const currentGridY = Math.floor(playerCenterY / tileSize);

        const targetGridXCenter = currentGridX * tileSize + tileSize / 2;
        const targetGridYCenter = currentGridY * tileSize + tileSize / 2;
        
        // Final movement deltas for this frame
        let finalMoveX = 0;
        let finalMoveY = 0;

        // Check if player is aligned on the X axis (horizontally centered within their tile column)
        const isAlignedX = Math.abs(playerCenterX - targetGridXCenter) <= this.alignmentTolerance;
        // Check if player is aligned on the Y axis (vertically centered within their tile row)
        const isAlignedY = Math.abs(playerCenterY - targetGridYCenter) <= this.alignmentTolerance;

        // Movement Logic for Bomberman-like feel:
        // 1. Prioritize aligning to the perpendicular axis if an input for the other axis is active AND player is off-center.
        //    Example: If pressing 'Right' (inputDx) but player is off-center vertically (!isAlignedY),
        //             then first move vertically to align.
        if (inputDx !== 0 && !isAlignedY) {
            finalMoveY = Math.sign(targetGridYCenter - playerCenterY) * pixelSpeed;
            // Clamp to prevent overshooting the center point
            const remainingToCenter = targetGridYCenter - playerCenterY;
            if (Math.sign(finalMoveY) === Math.sign(remainingToCenter)) {
                 finalMoveY = Math.min(Math.abs(finalMoveY), Math.abs(remainingToCenter)) * Math.sign(finalMoveY);
            }
            inputDx = 0; // Temporarily disable horizontal input to prioritize vertical alignment
        }
        // Similar for vertical input and horizontal misalignment
        else if (inputDy !== 0 && !isAlignedX) {
            finalMoveX = Math.sign(targetGridXCenter - playerCenterX) * pixelSpeed;
            // Clamp to prevent overshooting the center point
            const remainingToCenter = targetGridXCenter - playerCenterX;
            if (Math.sign(finalMoveX) === Math.sign(remainingToCenter)) {
                 finalMoveX = Math.min(Math.abs(finalMoveX), Math.abs(remainingToCenter)) * Math.sign(finalMoveX);
            }
            inputDy = 0; // Temporarily disable vertical input to prioritize horizontal alignment
        }

        // 2. If primary input is still active (not disabled by phase 1), or if alignment is not needed/complete,
        //    then apply primary movement in the input direction.
        if (inputDx !== 0) {
            finalMoveX = inputDx * pixelSpeed;
            // If moving towards grid center (e.g., inputDx is positive and playerCenterX < targetGridXCenter)
            // and `finalMoveX` would overshoot, clamp it to snap precisely to center.
            const remainingToCenter = targetGridXCenter - playerCenterX;
            if (Math.sign(inputDx) === Math.sign(remainingToCenter) && Math.abs(finalMoveX) > Math.abs(remainingToCenter)) {
                finalMoveX = remainingToCenter; 
            }
        }
        if (inputDy !== 0) {
            finalMoveY = inputDy * pixelSpeed;
            const remainingToCenter = targetGridYCenter - playerCenterY;
            if (Math.sign(inputDy) === Math.sign(remainingToCenter) && Math.abs(finalMoveY) > Math.abs(remainingToCenter)) {
                finalMoveY = remainingToCenter;
            }
        }

        // 3. If no keys are pressed (or inputs were consumed by phase 1/2 alignment), auto-align to both axes.
        if (inputDx === 0 && inputDy === 0 && finalMoveX === 0 && finalMoveY === 0) {
            if (!isAlignedX) {
                finalMoveX = Math.sign(targetGridXCenter - playerCenterX) * pixelSpeed;
                const remainingToCenter = targetGridXCenter - playerCenterX;
                if (Math.sign(finalMoveX) === Math.sign(remainingToCenter)) {
                    finalMoveX = Math.min(Math.abs(finalMoveX), Math.abs(remainingToCenter)) * Math.sign(finalMoveX);
                }
            }
            if (!isAlignedY) {
                finalMoveY = Math.sign(targetGridYCenter - playerCenterY) * pixelSpeed;
                const remainingToCenter = targetGridYCenter - playerCenterY;
                if (Math.sign(finalMoveY) === Math.sign(remainingToCenter)) {
                    finalMoveY = Math.min(Math.abs(finalMoveY), Math.abs(remainingToCenter)) * Math.sign(finalMoveY);
                }
            }
        }
        
        // Apply movement with collision checks.
        // It's crucial to process X and Y movements independently to allow for "sliding" along walls.
        if (finalMoveX !== 0) {
            const actualMoveX = this.getMaxAllowedMove(this.x, this.x + finalMoveX, this.y, this.width, this.height, true, game);
            this.x += actualMoveX;
        }

        if (finalMoveY !== 0) {
            const actualMoveY = this.getMaxAllowedMove(this.y, this.y + finalMoveY, this.x, this.width, this.height, false, game);
            this.y += actualMoveY;
        }
    }

    // Helper method: Determines the maximum distance the player can move in a given direction
    // without colliding with any solid wall. It checks pixel by pixel for precision.
    private getMaxAllowedMove(currentPos: number, targetPos: number,
                              otherAxisPos: number, entityWidth: number, entityHeight: number,
                              isXAxis: boolean, game: Game): number {
        const moveAmount = targetPos - currentPos;
        if (moveAmount === 0) return 0; // No movement requested

        const sign = Math.sign(moveAmount); // +1 for positive movement, -1 for negative
        let maxAllowedDistance = 0; // The actual distance we can safely move

        // Iterate pixel by pixel (or in small steps) along the intended path.
        // `pixelSpeed` is typically small (e.g., 2-3 pixels), so this loop is efficient enough.
        for (let dist = 1; dist <= Math.abs(moveAmount); dist++) {
            const testMovePos = currentPos + dist * sign;
            
            let testRect: { x: number, y: number, width: number, height: number };
            if (isXAxis) {
                testRect = { x: testMovePos, y: otherAxisPos, width: entityWidth, height: entityHeight };
            } else {
                testRect = { x: otherAxisPos, y: testMovePos, width: entityWidth, height: entityHeight };
            }

            // Check if this potential new position causes a collision
            if (this.collidesWithWalls(testRect, game)) {
                // Collision detected at `dist`. Max allowed movement is `dist-1` pixels.
                maxAllowedDistance = (dist - 1) * sign;
                break; // Stop checking further
            } else {
                // No collision, this distance is safe so far.
                maxAllowedDistance = dist * sign;
            }
        }
        return maxAllowedDistance;
    }

    // Checks if the player's bounding box collides with any solid walls (indestructible/destructible blocks).
    private collidesWithWalls(rect: { x: number, y: number, width: number, height: number }, game: Game): boolean {
        const tileSize = game.getGameSettings().tileSize;

        // Determine the range of tiles the player's rectangle currently overlaps.
        const leftTile = Math.floor(rect.x / tileSize);
        const rightTile = Math.floor((rect.x + rect.width - 0.01) / tileSize); // -0.01 to avoid issues at tile boundaries
        const topTile = Math.floor(rect.y / tileSize);
        const bottomTile = Math.floor((rect.y + rect.height - 0.01) / tileSize);

        for (let y = topTile; y <= bottomTile; y++) {
            for (let x = leftTile; x <= rightTile; x++) {
                const tileType = game.getTileType(x, y);
                // If the tile is a solid block, check for AABB collision.
                if (tileType === TileType.INDESTRUCTIBLE || tileType === TileType.DESTRUCTIBLE) {
                    const tileRect = {
                        x: x * tileSize,
                        y: y * tileSize,
                        width: tileSize,
                        height: tileSize
                    };
                    if (checkCollision(rect, tileRect)) {
                        return true; // Collision detected
                    }
                }
            }
        }
        return false; // No collision
    }

    // Renders the player sprite. Flashes if invincible.
    // Changed signature to receive game instance instead of tileSize directly
    render(ctx: CanvasRenderingContext2D, game: Game): void {
        if (!this.isAlive) return;

        // Simple flashing effect during invincibility.
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 10) % 2 === 0) {
            return; // Skip drawing to create a flash effect
        }

        // Draw player centered within its logical tile space.
        drawSprite(ctx, this.assetName, this.x, this.y, this.width, this.height);
    }

    // Places a bomb at the player's current grid position if possible.
    placeBomb(game: Game): void {
        if (this.bombCount < this.maxBombCount) {
            const settings = game.getGameSettings();
            const tileSize = settings.tileSize;

            // Determine the grid cell where the player's center lies.
            const playerGridX = Math.floor((this.x + this.width / 2) / tileSize);
            const playerGridY = Math.floor((this.y + this.height / 2) / tileSize);

            // Ensure no bomb already exists at this exact grid position.
            // Changed to use game.getBombs() instead of direct private access
            const existingBomb = game.getBombs().find(b =>
                Math.floor((b.x + b.width / 2) / tileSize) === playerGridX &&
                Math.floor((b.y + b.height / 2) / tileSize) === playerGridY
            );

            if (!existingBomb) {
                // Place the new bomb exactly on the grid cell.
                const bombPixelX = playerGridX * tileSize;
                const bombPixelY = playerGridY * tileSize;
                game.addBomb(new Bomb(bombPixelX, bombPixelY, tileSize, tileSize, settings.bombDelay, this.explosionRange, 'bomb', this));
                this.bombCount++;
                playSound('sfx_bomb_place');
            }
        }
    }

    // Called when a bomb placed by this player explodes, decrementing bomb count.
    bombExploded(): void {
        this.bombCount = Math.max(0, this.bombCount - 1);
    }

    // Player takes damage. Applies invincibility if not already active.
    takeDamage(amount: number): void {
        if (this.invincibleTimer > 0) return; // Cannot take damage if invincible

        this.lives -= amount;
        if (this.lives <= 0) {
            this.isAlive = false;
        } else {
            this.invincibleTimer = this.invincibleDuration; // Start invincibility frames
        }
    }

    // Applies the effect of a picked-up power-up.
    applyPowerUp(type: PowerUpType): void {
        switch (type) {
            case PowerUpType.BOMB_COUNT:
                this.maxBombCount++;
                break;
            case PowerUpType.EXPLOSION_RANGE:
                this.explosionRange++;
                break;
            case PowerUpType.SPEED:
                this.speed += 0.5; // Incremental speed boost
                break;
        }
    }
}

// --- Bomb Class ---
class Bomb implements GameEntity {
    x: number;
    y: number;
    width: number;
    height: number;
    assetName: string;

    timer: number; // Time remaining until explosion
    explosionRange: number;
    exploded: boolean = false;
    private owner: Player; // Reference to the player who placed this bomb

    constructor(x: number, y: number, width: number, height: number, delay: number, range: number, assetName: string, owner: Player) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.assetName = assetName;
        this.timer = delay;
        this.explosionRange = range;
        this.owner = owner;
    }

    // Updates the bomb's timer and triggers explosion if time runs out.
    update(deltaTime: number, game: Game): void {
        this.timer -= deltaTime;
        if (this.timer <= 0 && !this.exploded) {
            this.explodeNow();
        }
    }

    // Forces the bomb to explode immediately.
    explodeNow(): void {
        if (!this.exploded) {
            this.exploded = true;
            this.owner.bombExploded(); // Inform owner that one of their bombs has exploded
        }
    }

    // Renders the bomb sprite with a subtle animation.
    // Changed signature to receive game instance instead of tileSize directly
    render(ctx: CanvasRenderingContext2D, game: Game): void {
        // Simple scaling animation based on timer for a "heartbeat" effect.
        const scaleEffect = 0.05 * Math.sin(this.timer * 8) + 1; // Wiggle effect
        const renderWidth = this.width * scaleEffect;
        const renderHeight = this.height * scaleEffect;
        const offsetX = (this.width - renderWidth) / 2; // Offset to keep it centered during scaling
        const offsetY = (this.height - renderHeight) / 2;

        drawSprite(ctx, this.assetName, this.x + offsetX, this.y + offsetY, renderWidth, renderHeight);
    }
}

// --- Explosion Class ---
class Explosion implements GameEntity {
    x: number;
    y: number;
    width: number;
    height: number;
    assetName: string; // The specific sprite for this explosion segment (center, horizontal, end, etc.)

    timer: number; // Time remaining for the explosion visual/hitbox
    isFinished: boolean = false; // True when the explosion animation is complete

    constructor(x: number, y: number, width: number, duration: number, direction: 'up'|'down'|'left'|'right'|'center', endOfLine: boolean) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = width; // Explosions are generally square tiles
        this.timer = duration;

        // Determine the correct asset name based on direction and if it's an end-piece.
        this.assetName = this.getAssetNameForDirection(direction, endOfLine);
    }

    // Maps explosion parameters to the correct sprite asset name.
    private getAssetNameForDirection(direction: 'up'|'down'|'left'|'right'|'center', endOfLine: boolean): string {
        switch (direction) {
            case 'center': return 'explosion_center';
            case 'up': return endOfLine ? 'explosion_end_up' : 'explosion_vertical';
            case 'down': return endOfLine ? 'explosion_end_down' : 'explosion_vertical';
            case 'left': return endOfLine ? 'explosion_end_left' : 'explosion_horizontal';
            case 'right': return endOfLine ? 'explosion_end_right' : 'explosion_horizontal';
            default: return 'explosion_center'; // Fallback
        }
    }

    // Updates the explosion timer.
    update(deltaTime: number, game: Game): void {
        this.timer -= deltaTime;
        if (this.timer <= 0) {
            this.isFinished = true;
        }
    }

    // Renders the explosion sprite, with a fading effect.
    // Changed signature to receive game instance instead of tileSize directly
    render(ctx: CanvasRenderingContext2D, game: Game): void {
        // Calculate opacity based on remaining timer for a fade-out effect.
        // Access game settings through the provided `game` instance
        const settings = game.getGameSettings();
        const opacity = this.timer / settings.explosionDuration;
        ctx.globalAlpha = opacity; // Apply transparency

        drawSprite(ctx, this.assetName, this.x, this.y, this.width, this.height);
        ctx.globalAlpha = 1.0; // Reset global alpha to not affect other drawings
    }
}

// --- Enemy Class ---
class Enemy implements GameEntity {
    x: number;
    y: number;
    width: number;
    height: number;
    assetName: string;

    speed: number; // in tiles per second
    private currentDirection: { dx: number, dy: number } = { dx: 0, dy: 0 };
    private directionChangeTimer: number; // Timer until next direction change attempt
    private readonly directionChangeInterval: number; // How often the enemy tries to change direction

    constructor(x: number, y: number, tileSize: number, speed: number, directionChangeInterval: number, assetName: string) {
        this.x = x;
        this.y = y;
        this.width = tileSize * 0.8; // Enemy sprite size
        this.height = tileSize * 0.8;
        this.assetName = assetName;
        this.speed = speed;
        this.directionChangeInterval = directionChangeInterval;
        this.directionChangeTimer = directionChangeInterval; // Initial change soon

        this.chooseRandomDirection(); // Set initial random movement direction
    }

    // Selects a new random cardinal direction for the enemy to move in.
    private chooseRandomDirection(): void {
        const directions = [
            { dx: 0, dy: -1 }, // Up
            { dx: 0, dy: 1 },  // Down
            { dx: -1, dy: 0 }, // Left
            { dx: 1, dy: 0 }   // Right
        ];
        this.currentDirection = directions[Math.floor(Math.random() * directions.length)];
    }

    // Updates enemy movement and direction.
    update(deltaTime: number, game: Game): void {
        const settings = game.getGameSettings();
        const movementSpeed = this.speed * settings.tileSize * deltaTime; // Pixels per frame

        // Update direction change timer.
        this.directionChangeTimer -= deltaTime;
        if (this.directionChangeTimer <= 0) {
            this.chooseRandomDirection();
            this.directionChangeTimer = this.directionChangeInterval;
        }

        const nextX = this.x + this.currentDirection.dx * movementSpeed;
        const nextY = this.y + this.currentDirection.dy * movementSpeed;

        const testRect = { x: nextX, y: nextY, width: this.width, height: this.height };

        // If the planned move doesn't cause collision with walls or other enemies, apply it.
        // Simplified collision for enemies: if next position collides, stop movement for this frame.
        if (!this.collidesWithWalls(testRect, game) && !this.collidesWithOtherEnemies(testRect, game)) {
            this.x = nextX;
            this.y = nextY;
        } else {
            // If a collision occurs, change direction immediately to try and move away.
            this.chooseRandomDirection();
            this.directionChangeTimer = this.directionChangeInterval; // Reset timer
        }
    }

    // Checks collision with solid map tiles.
    private collidesWithWalls(rect: { x: number, y: number, width: number, height: number }, game: Game): boolean {
        const tileSize = game.getGameSettings().tileSize;

        const leftTile = Math.floor(rect.x / tileSize);
        const rightTile = Math.floor((rect.x + rect.width - 0.01) / tileSize);
        const topTile = Math.floor(rect.y / tileSize);
        const bottomTile = Math.floor((rect.y + rect.height - 0.01) / tileSize);

        for (let y = topTile; y <= bottomTile; y++) {
            for (let x = leftTile; x <= rightTile; x++) {
                const tileType = game.getTileType(x, y);
                if (tileType === TileType.INDESTRUCTIBLE || tileType === TileType.DESTRUCTIBLE) {
                    const tileRect = {
                        x: x * tileSize,
                        y: y * tileSize,
                        width: tileSize,
                        height: tileSize
                    };
                    if (checkCollision(rect, tileRect)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Checks collision with other enemy entities.
    private collidesWithOtherEnemies(rect: { x: number, y: number, width: number, height: number }, game: Game): boolean {
        for (const otherEnemy of game.getEnemies()) {
            if (otherEnemy !== this && checkCollision(rect, otherEnemy)) { // Don't check collision with self
                return true;
            }
        }
        return false;
    }

    // Renders the enemy sprite.
    // Changed signature to receive game instance instead of tileSize directly
    render(ctx: CanvasRenderingContext2D, game: Game): void {
        drawSprite(ctx, this.assetName, this.x, this.y, this.width, this.height);
    }
}

// --- PowerUp Class ---
class PowerUp implements GameEntity {
    x: number;
    y: number;
    width: number;
    height: number;
    type: PowerUpType;
    assetName: string;

    constructor(x: number, y: number, width: number, height: number, type: PowerUpType) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;

        // Assign the correct asset name based on power-up type.
        this.assetName = this.getAssetNameForPowerUpType(type);
    }

    // Maps power-up type to its corresponding sprite asset name.
    private getAssetNameForPowerUpType(type: PowerUpType): string {
        switch (type) {
            case PowerUpType.BOMB_COUNT: return 'powerup_bomb';
            case PowerUpType.EXPLOSION_RANGE: return 'powerup_range';
            case PowerUpType.SPEED: return 'powerup_speed';
            default: return 'powerup_bomb'; // Fallback
        }
    }

    // Power-ups don't have autonomous update logic; they react to player collision.
    update(deltaTime: number, game: Game): void {
        // No autonomous update needed for power-ups.
    }

    // Renders the power-up sprite.
    // Changed signature to receive game instance instead of tileSize directly
    render(ctx: CanvasRenderingContext2D, game: Game): void {
        drawSprite(ctx, this.assetName, this.x, this.y, this.width, this.height);
    }
}

// Global game instance.
let gameInstance: Game;

// Entry point: Initializes the game once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
    gameInstance = new Game('gameCanvas');
    gameInstance.init();
});