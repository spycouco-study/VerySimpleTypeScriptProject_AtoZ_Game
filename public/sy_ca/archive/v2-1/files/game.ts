// game.ts
// This file contains the complete TypeScript code for the Crazy Bomber game.
// It is designed to run in a web browser, interacting with an HTML canvas element.

// --- Helper Interfaces and Enums ---

/**
 * Defines the structure of the game's configuration loaded from data.json.
 */
interface GameConfig {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        tileSize: number;
        playerSpeed: number; // pixels per second
        bombFuseTime: number; // seconds until bomb explodes
        explosionDuration: number; // seconds explosions remain active
        initialBombRange: number; // tiles
        initialMaxBombs: number;
        initialLives: number;
        aiCount: number;
        breakableBlockDensity: number; // 0 to 1, density of breakable blocks on map
        powerUpDropChance: number; // 0 to 1, chance for power-up to drop from broken block
    };
    mapSettings: {
        mapWidth: number; // in tiles
        mapHeight: number; // in tiles
    };
    assets: {
        images: AssetImage[];
        sounds: AssetSound[];
    };
    text: {
        titleScreen: string[];
        instructionsScreen: string[];
        gameOverWin: string[];
        gameOverLose: string[];
        soundOn: string;
        soundOff: string;
    };
}

/**
 * Defines the structure for image assets.
 */
interface AssetImage {
    name: string;
    path: string;
    width: number;
    height: number;
    img?: HTMLImageElement; // Added during loading
}

/**
 * Defines the structure for sound assets.
 */
interface AssetSound {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
    audio?: HTMLAudioElement; // Added during loading
}

/**
 * Represents 2D coordinates.
 */
interface Coords {
    x: number;
    y: number;
}

/**
 * Represents tile grid position (row, column).
 */
interface TilePosition {
    row: number;
    col: number;
}

/**
 * Enum for managing different game states.
 */
enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER_WIN,
    GAME_OVER_LOSE
}

/**
 * Enum for different types of map tiles.
 */
enum TileType {
    EMPTY,
    SOLID,
    BREAKABLE
}

/**
 * Enum for different types of power-ups.
 */
enum PowerUpType {
    BOMB_UP,
    RANGE_UP,
    SPEED_UP
}

// --- Asset Loader Class ---

/**
 * Handles loading of all image and sound assets defined in the game config.
 */
class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets = 0;
    private loadedAssets = 0;
    private config: GameConfig;
    private onProgress: ((progress: number) => void) | null = null;

    constructor(config: GameConfig) {
        this.config = config;
        this.totalAssets = config.assets.images.length + config.assets.sounds.length;
    }

    /**
     * Loads all assets.
     * @param onProgress Callback function to report loading progress (0 to 1).
     * @returns A promise that resolves with maps of loaded images and sounds.
     */
    public async load(onProgress?: (progress: number) => void): Promise<{ images: Map<string, HTMLImageElement>, sounds: Map<string, HTMLAudioElement> }> {
        this.onProgress = onProgress || null;
        this.loadedAssets = 0;

        const imagePromises = this.config.assets.images.map(imgData => this.loadImage(imgData));
        const soundPromises = this.config.assets.sounds.map(soundData => this.loadSound(soundData));

        await Promise.all([...imagePromises, ...soundPromises]);

        return {
            images: this.images,
            sounds: this.sounds
        };
    }

    private loadImage(imgData: AssetImage): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(imgData.name, img);
                this.loadedAssets++;
                this.reportProgress();
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imgData.path}`);
                this.loadedAssets++; // Still increment to not block loading
                this.reportProgress();
                // We resolve even on error to allow the game to start with missing assets,
                // using fallback drawing.
                resolve();
            };
            img.src = imgData.path;
        });
    }

    private loadSound(soundData: AssetSound): Promise<void> {
        return new Promise((resolve) => {
            const audio = new Audio(soundData.path);
            audio.volume = soundData.volume;
            audio.load(); // Preload audio metadata
            this.sounds.set(soundData.name, audio);
            this.loadedAssets++;
            this.reportProgress();
            resolve(); // Resolve immediately as full buffering might be slow or blocked
        });
    }

    private reportProgress() {
        if (this.onProgress) {
            this.onProgress(this.loadedAssets / this.totalAssets);
        }
    }
}

// --- Sound Manager Class ---

/**
 * Manages playback of sound effects and background music, including a global toggle.
 */
class SoundManager {
    private sounds: Map<string, HTMLAudioElement>;
    private backgroundMusic: HTMLAudioElement | null = null;
    public soundOn: boolean = true; // Global sound state

    constructor(sounds: Map<string, HTMLAudioElement>) {
        this.sounds = sounds;
    }

    /**
     * Sets the background music to play.
     * @param name The name of the sound asset for BGM.
     */
    public setBackgroundMusic(name: string) {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
        }
        const bgm = this.sounds.get(name);
        if (bgm) {
            this.backgroundMusic = bgm;
            this.backgroundMusic.loop = true;
            this.backgroundMusic.volume = bgm.volume; // Use the initial volume from config
            if (this.soundOn) {
                 this.playBGM(); // Try to play, might need user interaction
            }
        }
    }

    /**
     * Plays a sound effect.
     * @param name The name of the sound asset to play.
     * @param loop Whether the sound should loop.
     * @param volume Optional volume override.
     * @returns The cloned Audio element if played, null otherwise.
     */
    public playSound(name: string, loop: boolean = false, volume?: number): HTMLAudioElement | null {
        if (!this.soundOn) return null;
        const audio = this.sounds.get(name);
        if (audio) {
            const clone = audio.cloneNode() as HTMLAudioElement; // Clone to allow simultaneous playback
            clone.volume = volume !== undefined ? volume : audio.volume;
            clone.loop = loop;
            clone.play().catch(e => {
                // console.warn(`Sound playback blocked for ${name}: ${e.message}`);
                // Often happens if not triggered by direct user interaction
            });
            return clone;
        }
        return null;
    }

    /**
     * Plays the currently set background music.
     */
    public playBGM() {
        if (!this.soundOn || !this.backgroundMusic) return;
        this.backgroundMusic.play().catch(e => {
            // console.warn(`BGM playback blocked: ${e.message}. Will try again on user interaction.`);
        });
    }

    /**
     * Stops the background music.
     */
    public stopBGM() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
        }
    }

    /**
     * Toggles the global sound state (on/off).
     */
    public toggleSound() {
        this.soundOn = !this.soundOn;
        if (this.soundOn) {
            this.playBGM();
        } else {
            this.stopBGM();
        }
    }
}

// --- Game Object Base Classes ---

/**
 * Abstract base class for all objects rendered and updated in the game.
 */
abstract class GameObject {
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

    abstract update(deltaTime: number, game: Game): void;

    /**
     * Draws the game object on the canvas.
     * @param ctx The 2D rendering context.
     * @param images Map of loaded images.
     * @param tileSize Size of a single tile for consistent scaling.
     */
    draw(ctx: CanvasRenderingContext2D, images: Map<string, HTMLImageElement>, tileSize: number): void {
        const img = images.get(this.imageName);
        if (img) {
            ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
            // Fallback: draw a colored rectangle if image is missing
            ctx.fillStyle = 'fuchsia'; // Bright color for visibility
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    /**
     * Gets the tile position of the center of the game object.
     * @param tileSize The size of a single tile.
     * @returns The tile position.
     */
    getTilePos(tileSize: number): TilePosition {
        return {
            row: Math.floor((this.y + this.height / 2) / tileSize),
            col: Math.floor((this.x + this.width / 2) / tileSize)
        };
    }

    /**
     * Checks for collision with another GameObject using AABB (Axis-Aligned Bounding Box).
     * @param other The other GameObject to check against.
     * @returns True if colliding, false otherwise.
     */
    collidesWith(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

/**
 * Base class for movable entities like players and AI.
 */
class Entity extends GameObject {
    dx: number = 0; // Direction x (-1, 0, 1)
    dy: number = 0; // Direction y (-1, 0, 1)
    speed: number; // Movement speed in pixels per second
    isMoving: boolean = false; // True if currently animating movement to a new tile
    currentTile: TilePosition; // The tile the entity is currently centered on
    targetTile: TilePosition; // The tile the entity is moving towards

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, tileSize: number) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.currentTile = this.getTilePos(tileSize);
        this.targetTile = { ...this.currentTile }; // Initially, target is current
    }

    update(deltaTime: number, game: Game): void {
        const tileSize = game.config.gameSettings.tileSize;

        if (this.isMoving) {
            const targetX = this.targetTile.col * tileSize;
            const targetY = this.targetTile.row * tileSize;

            let reachedX = false;
            let reachedY = false;

            // Move horizontally
            if (this.dx !== 0) {
                const moveAmount = this.dx * this.speed * deltaTime;
                this.x += moveAmount;
                if ((this.dx > 0 && this.x >= targetX) || (this.dx < 0 && this.x <= targetX)) {
                    this.x = targetX; // Snap to target
                    reachedX = true;
                }
            } else {
                reachedX = true;
            }

            // Move vertically
            if (this.dy !== 0) {
                const moveAmount = this.dy * this.speed * deltaTime;
                this.y += moveAmount;
                if ((this.dy > 0 && this.y >= targetY) || (this.dy < 0 && this.y <= targetY)) {
                    this.y = targetY; // Snap to target
                    reachedY = true;
                }
            } else {
                reachedY = true;
            }

            // If target reached (or no movement in that axis was intended)
            if (reachedX && reachedY) {
                this.isMoving = false;
                this.dx = 0;
                this.dy = 0;
                this.currentTile = { ...this.targetTile }; // Update current tile to target
            }
        }
    }

    /**
     * Attempts to move the entity by a given delta in tile coordinates.
     * @param deltaCol Change in column.
     * @param deltaRow Change in row.
     * @param map The game map.
     * @param tileSize The size of a single tile.
     * @returns True if movement was initiated, false otherwise (e.g., blocked).
     */
    attemptMove(deltaCol: number, deltaRow: number, map: Tile[][], tileSize: number): boolean {
        if (this.isMoving) return false; // Cannot move if already moving

        const nextCol = this.currentTile.col + deltaCol;
        const nextRow = this.currentTile.row + deltaRow;

        // Check map boundaries
        if (nextCol < 0 || nextCol >= map[0].length || nextRow < 0 || nextRow >= map.length) {
            return false;
        }

        const nextTile = map[nextRow][nextCol];
        if (nextTile.type === TileType.SOLID || nextTile.type === TileType.BREAKABLE) {
            return false; // Cannot move into solid or breakable blocks
        }

        this.targetTile = { col: nextCol, row: nextRow };
        this.dx = deltaCol;
        this.dy = deltaRow;
        this.isMoving = true;
        return true;
    }
}

/**
 * Represents a player character, either human-controlled or AI-controlled.
 */
class Player extends Entity {
    id: number;
    maxBombs: number;
    currentBombs: number; // Bombs currently active/on map
    bombRange: number;
    lives: number;
    isAI: boolean;
    immuneTimer: number = 0; // Invincibility frames after being hit
    isDead: boolean = false;

    // AI specific properties
    private aiPath: TilePosition[] = []; // Current path for AI navigation
    private aiState: 'IDLE' | 'CHASE' | 'EVADE' | 'BOMB_PLACEMENT' = 'IDLE';
    private aiBombTimer: number = 0; // Cooldown for AI bomb placement
    private targetPlayer: Player | null = null; // AI's current target (human player)

    constructor(id: number, x: number, y: number, width: number, height: number, imageName: string, speed: number, tileSize: number, config: GameConfig, isAI: boolean = false) {
        super(x, y, width, height, imageName, speed, tileSize);
        this.id = id;
        this.maxBombs = config.gameSettings.initialMaxBombs;
        this.currentBombs = 0;
        this.bombRange = config.gameSettings.initialBombRange;
        this.lives = config.gameSettings.initialLives;
        this.isAI = isAI;
    }

    update(deltaTime: number, game: Game): void {
        super.update(deltaTime, game);

        if (this.immuneTimer > 0) {
            this.immuneTimer -= deltaTime;
        }

        if (this.isAI && !this.isDead) {
            this.updateAI(deltaTime, game);
        }
    }

    draw(ctx: CanvasRenderingContext2D, images: Map<string, HTMLImageElement>, tileSize: number): void {
        if (this.isDead) return;

        // Flash player when immune
        if (this.immuneTimer > 0 && Math.floor(this.immuneTimer * 10) % 2 === 0) {
            return; // Skip drawing to create a flashing effect
        }
        super.draw(ctx, images, tileSize);
    }

    /**
     * Attempts to place a bomb at the player's current tile.
     * @param game The main game instance.
     * @returns The new Bomb object if placed, null otherwise.
     */
    placeBomb(game: Game): Bomb | null {
        // Modified: Removed the `!this.isMoving` condition to allow placing bombs while moving.
        if (this.currentBombs < this.maxBombs) {
            const tileX = this.currentTile.col * game.config.gameSettings.tileSize;
            const tileY = this.currentTile.row * game.config.gameSettings.tileSize;

            // Check if there's already a bomb at this exact spot
            const existingBomb = game.bombs.find(b => b.getTilePos(game.config.gameSettings.tileSize).col === this.currentTile.col &&
                                                     b.getTilePos(game.config.gameSettings.tileSize).row === this.currentTile.row);
            if (existingBomb) {
                return null;
            }

            this.currentBombs++;
            game.soundManager.playSound('bomb_place');
            return new Bomb(
                tileX,
                tileY,
                game.config.gameSettings.tileSize,
                game.config.gameSettings.tileSize,
                'bomb',
                game.config.gameSettings.bombFuseTime,
                this.bombRange,
                this.id
            );
        }
        return null;
    }

    /**
     * Player takes damage, reducing lives and granting temporary invincibility.
     * @param game The main game instance.
     */
    takeDamage(game: Game) {
        if (this.immuneTimer <= 0) {
            this.lives--;
            game.soundManager.playSound('player_hit');
            if (this.lives <= 0) {
                this.isDead = true;
                game.soundManager.playSound('player_die');
            } else {
                this.immuneTimer = 2; // 2 seconds of invincibility
            }
        }
    }

    /**
     * Applies a collected power-up effect to the player.
     * @param type The type of power-up collected.
     * @param game The main game instance.
     */
    applyPowerUp(type: PowerUpType, game: Game) {
        game.soundManager.playSound('powerup_collect');
        switch (type) {
            case PowerUpType.BOMB_UP:
                this.maxBombs++;
                break;
            case PowerUpType.RANGE_UP:
                this.bombRange++;
                break;
            case PowerUpType.SPEED_UP:
                this.speed += 50; // Increase speed by 50 pixels/sec
                break;
        }
    }

    // --- AI Logic ---

    /**
     * Updates the AI's behavior based on game state.
     * @param deltaTime Time elapsed since last frame.
     * @param game The main game instance.
     */
    private updateAI(deltaTime: number, game: Game) {
        const { tileSize } = game.config.gameSettings;
        const map = game.map;

        // Ensure AI has a target human player
        if (!this.targetPlayer || this.targetPlayer.isDead) {
            const livePlayers = game.players.filter(p => !p.isAI && !p.isDead);
            if (livePlayers.length > 0) {
                this.targetPlayer = livePlayers[0]; // Target the first human player
            } else {
                // No human players left, AI might wander or stop.
                // For simplicity, it will just not have a target.
                return;
            }
        }

        const myTile = this.currentTile;
        const playerTile = this.targetPlayer.currentTile;

        // Update AI bomb cooldown
        if (this.aiBombTimer > 0) {
            this.aiBombTimer -= deltaTime;
        }

        // Determine AI state
        const dangerZone = this.isTileInExplosionDanger(myTile, game.bombs, game.config.gameSettings.bombFuseTime, tileSize);
        const playerClose = Math.abs(myTile.col - playerTile.col) <= 3 && Math.abs(myTile.row - playerTile.row) <= 3;
        const canPlaceBomb = this.currentBombs < this.maxBombs && this.aiBombTimer <= 0;

        if (dangerZone) {
            this.aiState = 'EVADE';
        } else if (playerClose && canPlaceBomb && this.canBombPlayer(myTile, playerTile, map, game.bombs)) {
            this.aiState = 'BOMB_PLACEMENT';
        } else {
            // Default state: chase player or break blocks
            this.aiState = 'CHASE';
        }

        // Execute behavior based on current state
        switch (this.aiState) {
            case 'EVADE':
                this.evadeBombs(game);
                break;
            case 'BOMB_PLACEMENT':
                this.performBombPlacement(game);
                break;
            case 'CHASE':
                this.chasePlayer(game, playerTile);
                break;
            case 'IDLE': // Fallback/default if other states are not met
                this.findAndBreakBlock(game);
                break;
        }
    }

    /**
     * Checks if a given tile is within the explosion radius of any active bomb.
     * @param tile The tile to check.
     * @param bombs All active bombs in the game.
     * @param fuseTime The total fuse time of a bomb.
     * @param tileSize The size of a single tile.
     * @returns True if the tile is in danger, false otherwise.
     */
    private isTileInExplosionDanger(tile: TilePosition, bombs: Bomb[], fuseTime: number, tileSize: number): boolean {
        for (const bomb of bombs) {
            // Consider danger if bomb is active and is about to explode
            if (bomb.timer > 0 && bomb.timer <= fuseTime * 0.9) { // Proactive danger zone
                const bombTile = bomb.getTilePos(tileSize);
                if (bombTile.row === tile.row && Math.abs(bombTile.col - tile.col) <= bomb.range) return true; // Horizontal
                if (bombTile.col === tile.col && Math.abs(bombTile.row - tile.row) <= bomb.range) return true; // Vertical
            }
        }
        return false;
    }

    /**
     * Finds a safe path from a start tile to a target tile, avoiding dangerous explosion zones.
     * Uses a simple Breadth-First Search (BFS).
     * @param start The starting tile.
     * @param target The target tile.
     * @param game The main game instance.
     * @returns An array of TilePositions representing the path, or empty array if no safe path.
     */
    private getSafePath(start: TilePosition, target: TilePosition, game: Game): TilePosition[] {
        const queue: { tile: TilePosition; path: TilePosition[] }[] = [];
        const visited: Set<string> = new Set();
        const map = game.map;
        const { tileSize, bombFuseTime } = game.config.gameSettings;

        queue.push({ tile: start, path: [start] });
        visited.add(`${start.row},${start.col}`);

        const directions = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
        ];

        while (queue.length > 0) {
            const { tile, path } = queue.shift()!;

            if (tile.row === target.row && tile.col === target.col) {
                return path; // Target reached
            }

            for (const dir of directions) {
                const neighbor: TilePosition = { row: tile.row + dir.dr, col: tile.col + dir.dc };

                if (neighbor.row < 0 || neighbor.row >= map.length ||
                    neighbor.col < 0 || neighbor.col >= map[0].length) continue; // Out of bounds

                const neighborKey = `${neighbor.row},${neighbor.col}`;
                if (visited.has(neighborKey)) continue;

                const tileType = map[neighbor.row][neighbor.col].type;
                // Cannot move into solid or breakable blocks
                if (tileType === TileType.SOLID || tileType === TileType.BREAKABLE) continue;

                // Avoid tiles in imminent danger
                if (this.isTileInExplosionDanger(neighbor, game.bombs, bombFuseTime, tileSize)) continue;

                visited.add(neighborKey);
                queue.push({ tile: neighbor, path: [...path, neighbor] });
            }
        }
        return []; // No safe path found
    }

    /**
     * AI attempts to move to a safe tile if currently in danger.
     * @param game The main game instance.
     */
    private evadeBombs(game: Game) {
        if (this.isMoving) return;

        const myTile = this.currentTile;
        const map = game.map;
        const { bombFuseTime, tileSize } = game.config.gameSettings;

        const directions = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
        ];

        // Prioritize moving to an adjacent safe, empty tile
        for (const dir of directions) {
            const nextTile: TilePosition = { row: myTile.row + dir.dr, col: myTile.col + dir.dc };
            if (nextTile.row < 0 || nextTile.row >= map.length ||
                nextTile.col < 0 || nextTile.col >= map[0].length) continue;

            const mapTile = map[nextTile.row][nextTile.col];
            if (mapTile.type === TileType.EMPTY && !this.isTileInExplosionDanger(nextTile, game.bombs, bombFuseTime, tileSize)) {
                this.attemptMove(dir.dc, dir.dr, map, tileSize);
                this.aiPath = []; // Clear current path, as we are evading
                return;
            }
        }
        // If no immediate safe adjacent tile, AI might get stuck or try to pathfind further.
        // For simplicity, if immediate evade fails, AI might move towards a non-dangerous cell
        // in its current path or re-evaluate.
    }

    /**
     * AI attempts to chase the target human player.
     * @param game The main game instance.
     * @param playerTile The target player's current tile.
     */
    private chasePlayer(game: Game, playerTile: TilePosition) {
        if (this.isMoving) return;

        // Recalculate path if no path or target player moved significantly
        if (this.aiPath.length === 0 ||
            (this.aiPath.length > 0 && (this.aiPath[this.aiPath.length - 1].row !== playerTile.row || this.aiPath[this.aiPath.length - 1].col !== playerTile.col))) {
            this.aiPath = this.getSafePath(this.currentTile, playerTile, game);
        }

        if (this.aiPath.length > 1) { // If path exists and has more than just the current tile
            const nextStep = this.aiPath[1]; // The next tile in the path
            const dr = nextStep.row - this.currentTile.row;
            const dc = nextStep.col - this.currentTile.col;
            this.attemptMove(dc, dr, game.map, game.config.gameSettings.tileSize);
        } else {
            // Player is unreachable or already on the same tile, try to break blocks or just idle
            this.findAndBreakBlock(game);
        }
    }

    /**
     * AI attempts to place a bomb and then evade.
     * @param game The main game instance.
     */
    private performBombPlacement(game: Game) {
        // AI can place bombs while moving if it needs to, but for strategic reasons,
        // it might be better to ensure it's on a tile to properly assess the danger zone
        // after placement. For now, matching the player behavior change.
        if (this.aiBombTimer > 0) return; // Respect bomb cooldown

        const bomb = this.placeBomb(game);
        if (bomb) {
            this.aiBombTimer = 1.5; // Set cooldown after placing a bomb
            this.evadeBombs(game); // After placing, immediately try to move away from the bomb
        }
    }

    /**
     * Checks if the AI can effectively bomb the target player (line of sight and range).
     * @param myTile AI's current tile.
     * @param playerTile Target player's current tile.
     * @param map The game map.
     * @param bombs All active bombs.
     * @returns True if the AI can bomb the player.
     */
    private canBombPlayer(myTile: TilePosition, playerTile: TilePosition, map: Tile[][], bombs: Bomb[]): boolean {
        // Prevent placing bomb if one already exists on AI's tile
        const existingBombAtMyTile = bombs.some(b => b.getTilePos(game.config.gameSettings.tileSize).col === myTile.col && b.getTilePos(game.config.gameSettings.tileSize).row === myTile.row);
        if (existingBombAtMyTile) return false;

        const range = this.bombRange;
        // Check horizontal line of sight
        if (myTile.row === playerTile.row) {
            if (Math.abs(myTile.col - playerTile.col) <= range) {
                const startCol = Math.min(myTile.col, playerTile.col);
                const endCol = Math.max(myTile.col, playerTile.col);
                let blocked = false;
                for (let c = startCol + 1; c < endCol; c++) {
                    if (map[myTile.row][c].type === TileType.SOLID) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) return true;
            }
        }
        // Check vertical line of sight
        if (myTile.col === playerTile.col) {
            if (Math.abs(myTile.row - playerTile.row) <= range) {
                const startRow = Math.min(myTile.row, playerTile.row);
                const endRow = Math.max(myTile.row, playerTile.row);
                let blocked = false;
                for (let r = startRow + 1; r < endRow; r++) {
                    if (map[r][myTile.col].type === TileType.SOLID) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) return true;
            }
        }
        return false;
    }

    /**
     * AI attempts to find and break a breakable block.
     * @param game The main game instance.
     */
    private findAndBreakBlock(game: Game) {
        if (this.isMoving) return;

        const myTile = this.currentTile;
        const map = game.map;
        const { tileSize } = game.config.gameSettings;

        const directions = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
        ];

        // Check for adjacent breakable blocks
        for (const dir of directions) {
            const nextTile: TilePosition = { row: myTile.row + dir.dr, col: myTile.col + dir.dc };
            if (nextTile.row < 0 || nextTile.row >= map.length ||
                nextTile.col < 0 || nextTile.col >= map[0].length) continue;

            const mapTile = map[nextTile.row][nextTile.col];
            if (mapTile.type === TileType.BREAKABLE) {
                if (this.currentBombs < this.maxBombs && this.aiBombTimer <= 0) {
                    this.performBombPlacement(game); // Place bomb
                    this.evadeBombs(game); // Then move away
                    return;
                }
            }
        }

        // If no adjacent breakable block or cannot place bomb, pathfind to a random breakable block
        if (this.aiPath.length === 0) {
            const breakableTiles: TilePosition[] = [];
            for (let r = 0; r < map.length; r++) {
                for (let c = 0; c < map[0].length; c++) {
                    if (map[r][c].type === TileType.BREAKABLE) {
                        breakableTiles.push({ row: r, col: c });
                    }
                }
            }

            if (breakableTiles.length > 0) {
                const target = breakableTiles[Math.floor(Math.random() * breakableTiles.length)];
                this.aiPath = this.getSafePath(myTile, target, game);
            }
        }

        if (this.aiPath.length > 1) {
            const nextStep = this.aiPath[1];
            const dr = nextStep.row - this.currentTile.row;
            const dc = nextStep.col - this.currentTile.col;
            this.attemptMove(dc, dr, map, tileSize);
        } else {
            // If pathfinding to a breakable block failed, just wander randomly to explore
            const randomDir = directions[Math.floor(Math.random() * directions.length)];
            this.attemptMove(randomDir.dc, randomDir.dr, map, tileSize);
        }
    }
}

/**
 * Represents a bomb placed by a player.
 */
class Bomb extends GameObject {
    timer: number;
    range: number; // Explosion range in tiles
    ownerId: number; // ID of the player who placed this bomb

    constructor(x: number, y: number, width: number, height: number, imageName: string, fuseTime: number, range: number, ownerId: number) {
        super(x, y, width, height, imageName);
        this.timer = fuseTime;
        this.range = range;
        this.ownerId = ownerId;
    }

    update(deltaTime: number, game: Game): void {
        this.timer -= deltaTime;
        if (this.timer <= 0) {
            game.triggerExplosion(this); // Trigger explosion when timer runs out
        }
    }

    draw(ctx: CanvasRenderingContext2D, images: Map<string, HTMLImageElement>, tileSize: number): void {
        const img = images.get(this.imageName);
        if (img) {
             // Make bomb flash faster as it gets closer to exploding
            const flashRate = this.timer < 0.5 ? 0.05 : 0.2;
            if (Math.floor(this.timer / flashRate) % 2 === 0) {
                ctx.drawImage(img, this.x, this.y, this.width, this.height);
            }
        } else {
            ctx.fillStyle = 'orange'; // Fallback
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

/**
 * Represents an explosion segment on the map.
 */
class Explosion extends GameObject {
    timer: number; // How long the explosion lasts
    isCenter: boolean;
    isVertical: boolean;
    isEnd: boolean;

    constructor(x: number, y: number, width: number, height: number, imageName: string, duration: number, isCenter: boolean = false, isVertical: boolean = false, isEnd: boolean = false) {
        super(x, y, width, height, imageName);
        this.timer = duration;
        this.isCenter = isCenter;
        this.isVertical = isVertical;
        this.isEnd = isEnd;
    }

    update(deltaTime: number, game: Game): void {
        this.timer -= deltaTime;
        // Game loop will remove explosions when timer <= 0
    }
}

/**
 * Represents a single tile on the game map.
 */
class Tile {
    type: TileType;
    imageName: string;
    hasPowerUp: PowerUpType | null; // Null if no power-up

    constructor(type: TileType, imageName: string, hasPowerUp: PowerUpType | null = null) {
        this.type = type;
        this.imageName = imageName;
        this.hasPowerUp = hasPowerUp;
    }
}

// --- Main Game Class ---

/**
 * Orchestrates the entire game, including state, loop, rendering, and logic.
 */
class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    public config!: GameConfig; // Loaded from data.json
    private images!: Map<string, HTMLImageElement>; // Loaded image assets
    public soundManager!: SoundManager; // Manages game audio

    private lastTime: number = 0; // Timestamp of previous frame
    private animationFrameId: number | null = null; // ID for requestAnimationFrame

    public gameState: GameState = GameState.TITLE; // Current game state
    private input: { [key: string]: boolean } = {}; // Tracks currently pressed keys
    private pressedKeys: { [key: string]: boolean } = {}; // Tracks keys pressed once per frame

    public players: Player[] = [];
    public bombs: Bomb[] = [];
    public explosions: Explosion[] = [];
    public map!: Tile[][]; // The game map grid

    private player1: Player | null = null; // Reference to the human player
    private humanPlayersCount: number = 0; // Number of human players (currently only 1)
    private aiPlayersCount: number = 0; // Number of AI players

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        // Event listeners for input
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        this.canvas.addEventListener('click', this.handleCanvasClick); // For UI clicks
        window.addEventListener('mousedown', this.handleMouseDown); // For initial user interaction for audio
    }

    /**
     * Handles keydown events, updating input state and triggering state transitions.
     */
    private handleKeyDown = (e: KeyboardEvent) => {
        this.input[e.key] = true;
        this.pressedKeys[e.key] = true; // Mark as newly pressed
        if (this.gameState === GameState.TITLE || this.gameState === GameState.INSTRUCTIONS) {
            // Advance state on any key press from title/instructions
            if (this.gameState === GameState.TITLE) {
                this.soundManager.playBGM(); // Try playing BGM on first user interaction
                this.changeState(GameState.INSTRUCTIONS);
            } else if (this.gameState === GameState.INSTRUCTIONS) {
                this.changeState(GameState.PLAYING);
            }
        }
    };

    /**
     * Handles keyup events, updating input state.
     */
    private handleKeyUp = (e: KeyboardEvent) => {
        this.input[e.key] = false;
        // Do NOT reset pressedKeys here; it's reset after `update`
    };

    /**
     * Handles clicks on the canvas, primarily for UI elements like the sound button.
     */
    private handleCanvasClick = (e: MouseEvent) => {
        if (this.gameState === GameState.PLAYING) {
            const buttonSize = 30;
            const padding = 10;
            const btnX = this.canvas.width - buttonSize - padding;
            const btnY = padding;

            // Check if click is within the sound button area
            if (e.offsetX >= btnX && e.offsetX <= btnX + buttonSize &&
                e.offsetY >= btnY && e.offsetY <= btnY + buttonSize) {
                this.soundManager.toggleSound();
            }
        }
    };

    /**
     * Handles initial mouse down event to attempt playing BGM, circumventing browser autoplay policies.
     */
    private handleMouseDown = () => {
        if (this.gameState === GameState.TITLE && this.soundManager) {
            this.soundManager.playBGM();
        }
        window.removeEventListener('mousedown', this.handleMouseDown); // Only need to do this once
    }

    /**
     * Initializes the game by loading configuration and assets, then starts the game loop.
     * @param configPath Path to the data.json configuration file.
     */
    public async init(configPath: string) {
        try {
            const response = await fetch(configPath);
            this.config = await response.json();

            this.canvas.width = this.config.gameSettings.canvasWidth;
            this.canvas.height = this.config.gameSettings.canvasHeight;

            // Load assets with a loading screen
            const assetLoader = new AssetLoader(this.config);
            const assets = await assetLoader.load((progress) => {
                this.drawLoadingScreen(progress);
            });
            this.images = assets.images;
            this.soundManager = new SoundManager(assets.sounds);
            this.soundManager.setBackgroundMusic('bgm');

            // Start the game loop
            this.lastTime = performance.now();
            this.loop(this.lastTime);

        } catch (error) {
            console.error('Failed to load game configuration or assets:', error);
            // Display an error message on canvas if critical failure
            this.ctx.fillStyle = 'red';
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('ERROR: Failed to load game.', this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    /**
     * Draws a loading progress screen while assets are being loaded.
     * @param progress Current loading progress (0 to 1).
     */
    private drawLoadingScreen(progress: number) {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Loading Assets...', this.canvas.width / 2, this.canvas.height / 2 - 20);
        this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200, 10);
        this.ctx.fillStyle = 'green';
        this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200 * progress, 10);
        this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 40);
    }

    /**
     * Sets up the initial game state, map, and players for a new round.
     */
    private setupGame() {
        this.map = this.generateMap();
        this.spawnPlayers();
        this.bombs = [];
        this.explosions = [];
        // Ensure BGM is playing when game starts
        this.soundManager.playBGM();
    }

    /**
     * Changes the current game state and performs any necessary actions for the new state.
     * @param newState The GameState to transition to.
     */
    private changeState(newState: GameState) {
        this.gameState = newState;
        if (newState === GameState.PLAYING) {
            this.setupGame(); // Re-initialize map and players for a new game
        } else if (newState === GameState.GAME_OVER_WIN || newState === GameState.GAME_OVER_LOSE) {
            this.soundManager.stopBGM(); // Stop BGM on game over
        } else if (newState === GameState.TITLE) {
            // On returning to title, re-enable BGM playback attempts
            this.soundManager.playBGM();
        }
    }

    /**
     * The main game loop, called repeatedly via requestAnimationFrame.
     * @param currentTime Current timestamp from performance.now().
     */
    private loop = (currentTime: number) => {
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        // Clear pressed keys for the next frame
        for (const key in this.pressedKeys) {
            this.pressedKeys[key] = false;
        }

        this.animationFrameId = requestAnimationFrame(this.loop);
    };

    /**
     * Updates the game logic based on the current state.
     * @param deltaTime Time elapsed since the last update.
     */
    private update(deltaTime: number) {
        switch (this.gameState) {
            case GameState.TITLE:
            case GameState.INSTRUCTIONS:
                // Nothing to update, waiting for user input
                break;
            case GameState.PLAYING:
                this.updateGamePlaying(deltaTime);
                break;
            case GameState.GAME_OVER_WIN:
            case GameState.GAME_OVER_LOSE:
                // Wait for 'Enter' key to restart
                if (this.pressedKeys['Enter']) {
                    this.changeState(GameState.TITLE);
                }
                break;
        }
    }

    /**
     * Updates game logic specifically for the PLAYING state.
     * @param deltaTime Time elapsed.
     */
    private updateGamePlaying(deltaTime: number) {
        // Update players
        this.players.forEach(player => {
            player.update(deltaTime, this);
            if (!player.isAI && !player.isDead) { // Human player input
                this.handlePlayerInput(player);
            }
        });

        // Update bombs (reverse loop for safe removal)
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            this.bombs[i].update(deltaTime, this);
        }

        // Update explosions (reverse loop for safe removal)
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].update(deltaTime, this);
            if (this.explosions[i].timer <= 0) {
                this.explosions.splice(i, 1);
            }
        }

        this.checkCollisions();
        this.checkGameEndCondition();
    }

    /**
     * Handles keyboard input for the human player.
     * @param player The human player object.
     */
    private handlePlayerInput(player: Player) {
        // Player movement is now separate from bomb placement logic,
        // so `if (player.isMoving) return;` is only for movement.
        let moved = false;
        if (this.input['ArrowUp'] || this.input['w']) {
            moved = player.attemptMove(0, -1, this.map, this.config.gameSettings.tileSize);
        } else if (this.input['ArrowDown'] || this.input['s']) {
            moved = player.attemptMove(0, 1, this.map, this.config.gameSettings.tileSize);
        } else if (this.input['ArrowLeft'] || this.input['a']) {
            moved = player.attemptMove(-1, 0, this.map, this.config.gameSettings.tileSize);
        } else if (this.input['ArrowRight'] || this.input['d']) {
            moved = player.attemptMove(1, 0, this.map, this.config.gameSettings.tileSize);
        }

        if (moved) {
            this.soundManager.playSound('player_move', false, 0.3);
        }

        if (this.pressedKeys[' ']) { // Spacebar for bomb
            const newBomb = player.placeBomb(this);
            if (newBomb) {
                this.bombs.push(newBomb);
            }
        }
    }

    /**
     * Checks for collisions between various game objects.
     */
    private checkCollisions() {
        const tileSize = this.config.gameSettings.tileSize;

        // Player-Explosion collision
        this.players.forEach(player => {
            if (player.isDead || player.immuneTimer > 0) return; // Skip dead or immune players
            this.explosions.forEach(explosion => {
                if (player.collidesWith(explosion)) {
                    player.takeDamage(this);
                }
            });
        });

        // Player-PowerUp collision
        this.players.forEach(player => {
            if (player.isDead) return;
            const playerTile = player.getTilePos(tileSize);
            const mapTile = this.map[playerTile.row][playerTile.col];
            if (mapTile.type === TileType.EMPTY && mapTile.hasPowerUp !== null) {
                player.applyPowerUp(mapTile.hasPowerUp, this);
                mapTile.hasPowerUp = null; // Power-up collected
                mapTile.imageName = 'empty_tile'; // Update tile image after collection
            }
        });
    }

    /**
     * Triggers an explosion originating from a given bomb.
     * Handles explosion propagation, block destruction, and chain reactions.
     * @param bomb The bomb that is exploding.
     */
    public triggerExplosion(bomb: Bomb) {
        this.soundManager.playSound('explosion');

        const tileSize = this.config.gameSettings.tileSize;
        const bombTile = bomb.getTilePos(tileSize);
        const mapWidth = this.config.mapSettings.mapWidth;
        const mapHeight = this.config.mapSettings.mapHeight;

        // Release bomb count for the owner of the bomb
        const owner = this.players.find(p => p.id === bomb.ownerId);
        if (owner) {
            owner.currentBombs--;
            if (owner.currentBombs < 0) owner.currentBombs = 0; // Sanity check
        }

        // Remove the exploding bomb from the active bombs list
        this.bombs = this.bombs.filter(b => b !== bomb);

        // Create the center explosion sprite
        this.explosions.push(new Explosion(
            bombTile.col * tileSize, bombTile.row * tileSize,
            tileSize, tileSize, 'explosion_center', this.config.gameSettings.explosionDuration, true
        ));

        // Spread explosion in 4 cardinal directions
        const directions = [
            { dr: 0, dc: 1, isVertical: false }, // Right
            { dr: 0, dc: -1, isVertical: false }, // Left
            { dr: 1, dc: 0, isVertical: true },  // Down
            { dr: -1, dc: 0, isVertical: true }   // Up
        ];

        directions.forEach(dir => {
            for (let i = 1; i <= bomb.range; i++) {
                const targetRow = bombTile.row + dir.dr * i;
                const targetCol = bombTile.col + dir.dc * i;

                // Check map boundaries
                if (targetRow < 0 || targetRow >= mapHeight || targetCol < 0 || targetCol >= mapWidth) break;

                const targetTile = this.map[targetRow][targetCol];

                // Solid blocks stop explosions
                if (targetTile.type === TileType.SOLID) break;

                let explosionImageName = dir.isVertical ? 'explosion_vertical' : 'explosion_horizontal';
                // Use end cap image for the last segment or if it hits a breakable block
                if (i === bomb.range || targetTile.type === TileType.BREAKABLE) {
                    explosionImageName = dir.isVertical ? 'explosion_end_vertical' : 'explosion_end_horizontal';
                }

                // Add explosion segment
                this.explosions.push(new Explosion(
                    targetCol * tileSize, targetRow * tileSize,
                    tileSize, tileSize, explosionImageName, this.config.gameSettings.explosionDuration, false, dir.isVertical, i === bomb.range
                ));

                // If it hits a breakable block, destroy it and stop spreading in this direction
                if (targetTile.type === TileType.BREAKABLE) {
                    this.destroyBlock(targetRow, targetCol);
                    break;
                }

                // If it hits another bomb, trigger that bomb immediately
                const hitBomb = this.bombs.find(b =>
                    b.getTilePos(tileSize).row === targetRow && b.getTilePos(tileSize).col === targetCol
                );
                if (hitBomb) {
                    hitBomb.timer = 0; // Set timer to 0 to trigger its explosion in the next update cycle
                }
            }
        });
    }

    /**
     * Destroys a breakable block at the given map coordinates.
     * May drop a power-up.
     * @param row Row of the block.
     * @param col Column of the block.
     */
    private destroyBlock(row: number, col: number) {
        this.map[row][col].type = TileType.EMPTY;
        this.map[row][col].imageName = 'empty_tile';
        this.soundManager.playSound('block_break');

        // Chance to drop power-up
        if (Math.random() < this.config.gameSettings.powerUpDropChance) {
            const powerUpTypes = [PowerUpType.BOMB_UP, PowerUpType.RANGE_UP, PowerUpType.SPEED_UP];
            const randomPowerUp = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
            this.map[row][col].hasPowerUp = randomPowerUp;
            this.map[row][col].imageName = this.getPowerUpImageName(randomPowerUp);
        }
    }

    /**
     * Returns the appropriate image name for a given PowerUpType.
     * @param type The type of power-up.
     * @returns The image name string.
     */
    private getPowerUpImageName(type: PowerUpType): string {
        switch (type) {
            case PowerUpType.BOMB_UP: return 'powerup_bomb';
            case PowerUpType.RANGE_UP: return 'powerup_range';
            case PowerUpType.SPEED_UP: return 'powerup_speed';
            default: return 'empty_tile'; // Fallback
        }
    }

    /**
     * Checks if the game win or lose conditions have been met.
     */
    private checkGameEndCondition() {
        const liveHumanPlayers = this.players.filter(p => !p.isAI && !p.isDead);
        const liveAIPlayers = this.players.filter(p => p.isAI && !p.isDead);

        if (liveHumanPlayers.length === 0) {
            this.changeState(GameState.GAME_OVER_LOSE);
        } else if (liveAIPlayers.length === 0 && this.humanPlayersCount > 0) {
            this.changeState(GameState.GAME_OVER_WIN);
        }
    }

    /**
     * Renders all game elements based on the current game state.
     */
    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawGamePlaying();
                break;
            case GameState.GAME_OVER_WIN:
                this.drawGameOverScreen(true);
                break;
            case GameState.GAME_OVER_LOSE:
                this.drawGameOverScreen(false);
                break;
        }
    }

    /**
     * Draws the title screen.
     */
    private drawTitleScreen() {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.font = '48px Arial'; // Using Arial as a common font. Could be 'Press Start 2P' for pixel art style if loaded.
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.text.titleScreen[0], this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press any key to start', this.canvas.width / 2, this.canvas.height / 2 + 50);

        this.ctx.font = '16px Arial';
        this.ctx.fillText('A Crazy Bomber Fan Game', this.canvas.width / 2, this.canvas.height - 30);
    }

    /**
     * Draws the game instructions screen.
     */
    private drawInstructionsScreen() {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.font = '36px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('How to Play', this.canvas.width / 2, 80);

        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        let yOffset = 150;
        this.config.text.instructionsScreen.forEach(line => {
            this.ctx.fillText(line, this.canvas.width / 4, yOffset);
            yOffset += 30;
        });

        this.ctx.textAlign = 'center';
        this.ctx.fillText('Press any key to continue...', this.canvas.width / 2, this.canvas.height - 80);
    }

    /**
     * Draws the main game playing screen, including map, players, bombs, explosions, and UI.
     */
    private drawGamePlaying() {
        const tileSize = this.config.gameSettings.tileSize;

        // Draw map tiles
        for (let r = 0; r < this.map.length; r++) {
            for (let c = 0; c < this.map[r].length; c++) {
                const tile = this.map[r][c];
                const img = this.images.get(tile.imageName);
                if (img) {
                    this.ctx.drawImage(img, c * tileSize, r * tileSize, tileSize, tileSize);
                } else {
                    // Fallback colors for debugging if images are missing
                    switch (tile.type) {
                        case TileType.EMPTY: this.ctx.fillStyle = '#006400'; break; // Dark Green
                        case TileType.SOLID: this.ctx.fillStyle = '#696969'; break; // Dim Gray
                        case TileType.BREAKABLE: this.ctx.fillStyle = '#8B4513'; break; // Saddle Brown
                    }
                    this.ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
                }
            }
        }

        // Draw bombs
        this.bombs.forEach(bomb => bomb.draw(this.ctx, this.images, tileSize));

        // Draw players
        this.players.forEach(player => player.draw(this.ctx, this.images, tileSize));

        // Draw explosions (on top of everything else for visual priority)
        this.explosions.forEach(explosion => explosion.draw(this.ctx, this.images, tileSize));

        // Draw UI - Player lives, bomb counts, range
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        let uiY = this.canvas.height - 20;
        let uiX = 10;
        this.players.filter(p => !p.isAI).forEach(player => { // Only show UI for human players
            this.ctx.fillText(`P${player.id} Lives: ${player.lives} Bombs: ${player.currentBombs}/${player.maxBombs} Range: ${player.bombRange}`, uiX, uiY);
            uiX += 250; // Offset for next player's UI if multiple human players
        });

        // Draw sound toggle button
        const buttonSize = 30;
        const padding = 10;
        const btnX = this.canvas.width - buttonSize - padding;
        const btnY = padding;
        const soundImgName = this.soundManager.soundOn ? 'icon_sound_on' : 'icon_sound_off';
        const soundImg = this.images.get(soundImgName);
        if (soundImg) {
            this.ctx.drawImage(soundImg, btnX, btnY, buttonSize, buttonSize);
        } else {
            // Fallback for sound button if images are missing
            this.ctx.fillStyle = this.soundManager.soundOn ? 'green' : 'red';
            this.ctx.fillRect(btnX, btnY, buttonSize, buttonSize);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.soundManager.soundOn ? 'ON' : 'OFF', btnX + buttonSize / 2, btnY + buttonSize / 2 + 4);
        }
    }

    /**
     * Draws the game over screen (win or lose).
     * @param win True if the player won, false if lost.
     */
    private drawGameOverScreen(win: boolean) {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.font = '48px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        const message = win ? this.config.text.gameOverWin[0] : this.config.text.gameOverLose[0];
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press Enter to restart', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    // --- Map Generation & Player Spawning ---

    /**
     * Generates a new game map based on configuration.
     * @returns The generated 2D Tile array.
     */
    private generateMap(): Tile[][] {
        const { mapWidth, mapHeight } = this.config.mapSettings;
        const { breakableBlockDensity } = this.config.gameSettings;
        const map: Tile[][] = [];

        for (let r = 0; r < mapHeight; r++) {
            map[r] = [];
            for (let c = 0; c < mapWidth; c++) {
                if (r === 0 || r === mapHeight - 1 || c === 0 || c === mapWidth - 1) {
                    // Outer perimeter is solid blocks
                    map[r][c] = new Tile(TileType.SOLID, 'solid_block');
                } else if (r % 2 === 0 && c % 2 === 0) {
                    // Fixed grid of solid blocks
                    map[r][c] = new Tile(TileType.SOLID, 'solid_block');
                } else {
                    // Randomly place breakable blocks
                    if (Math.random() < breakableBlockDensity) {
                        map[r][c] = new Tile(TileType.BREAKABLE, 'breakable_block');
                    } else {
                        map[r][c] = new Tile(TileType.EMPTY, 'empty_tile');
                    }
                }
            }
        }
        return map;
    }

    /**
     * Spawns players (human and AI) at designated starting points and clears surrounding tiles.
     */
    private spawnPlayers() {
        this.players = [];
        this.humanPlayersCount = 0;
        this.aiPlayersCount = 0;
        const { tileSize, playerSpeed, aiCount } = this.config.gameSettings;
        const mapHeight = this.map.length;
        const mapWidth = this.map[0].length;

        // Define potential spawn points (corners)
        const spawnPoints: TilePosition[] = [
            { row: 1, col: 1 },
            { row: mapHeight - 2, col: mapWidth - 2 },
            { row: 1, col: mapWidth - 2 },
            { row: mapHeight - 2, col: 1 }
        ];

        // Ensure spawn points and their immediate neighbors are clear for movement and bomb placement
        spawnPoints.forEach(pos => {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const r = pos.row + dr;
                    const c = pos.col + dc;
                    if (r >= 0 && r < mapHeight && c >= 0 && c < mapWidth) {
                        this.map[r][c] = new Tile(TileType.EMPTY, 'empty_tile');
                    }
                }
            }
        });

        // Spawn Player 1 (human)
        const player1Spawn = spawnPoints.shift()!; // Get first spawn point
        this.player1 = new Player(
            1,
            player1Spawn.col * tileSize,
            player1Spawn.row * tileSize,
            tileSize, tileSize,
            'player1', playerSpeed, tileSize, this.config, false
        );
        this.players.push(this.player1);
        this.humanPlayersCount++;

        // Spawn AI players
        for (let i = 0; i < aiCount; i++) {
            if (spawnPoints.length === 0) {
                console.warn('Not enough spawn points for all AI players.');
                break;
            }
            const aiSpawn = spawnPoints.shift()!; // Get next available spawn point
            this.players.push(new Player(
                i + 2, // Unique ID for AI players
                aiSpawn.col * tileSize,
                aiSpawn.row * tileSize,
                tileSize, tileSize,
                `player${i + 2}`, // e.g., 'player2', 'player3' for AI images
                playerSpeed, tileSize, this.config, true
            ));
            this.aiPlayersCount++;
        }
    }
}

// Global instance and initialization
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game('gameCanvas');
    game.init('data.json'); // Start the game with configuration from data.json
});
