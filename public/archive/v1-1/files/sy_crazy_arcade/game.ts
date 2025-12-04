// game.ts

// Global utility functions
function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Interfaces for data.json configuration
interface GameConfig {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        gridSize: number; // e.g., 15x15
        tileSize: number;
        playerSpeed: number; // pixels per second
        bombFuseTime: number; // ms
        explosionDuration: number; // ms
        initialBombRange: number;
        initialMaxBombs: number;
        breakableBlockDensity: number;
        powerUpDropChance: number;
        invulnerabilityTime: number; // ms after being hit
    };
    playerSettings: {
        startX: number;
        startY: number;
    };
    enemySettings: {
        startX: number;
        startY: number;
        speed: number;
    }[];
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

// Asset Manager class
class AssetLoader {
    images: Map<string, HTMLImageElement> = new Map();
    sounds: Map<string, HTMLAudioElement> = new Map();
    loadedCount: number = 0;
    totalCount: number = 0;

    async load(assetsConfig: GameConfig['assets']): Promise<void> {
        const imagePromises = assetsConfig.images.map(img => {
            this.totalCount++;
            return new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => {
                    this.images.set(img.name, image);
                    this.loadedCount++;
                    resolve();
                };
                image.onerror = () => reject(`Failed to load image: ${img.path}`);
            });
        });

        const soundPromises = assetsConfig.sounds.map(snd => {
            this.totalCount++;
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio(snd.path);
                audio.oncanplaythrough = () => {
                    audio.volume = snd.volume;
                    this.sounds.set(snd.name, audio);
                    this.loadedCount++;
                    resolve();
                };
                audio.onerror = () => reject(`Failed to load sound: ${snd.path}`);
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log(`Loaded ${this.loadedCount} assets.`);
    }

    getImage(name: string): HTMLImageElement {
        const img = this.images.get(name);
        if (!img) throw new Error(`Image '${name}' not found.`);
        return img;
    }

    getSound(name: string): HTMLAudioElement {
        const snd = this.sounds.get(name);
        if (!snd) throw new Error(`Sound '${name}' not found.`);
        return snd.cloneNode() as HTMLAudioElement; // Clone to allow multiple simultaneous plays
    }
}

// Game states
enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
    GAME_WIN
}

// Tile types on the game grid
enum TileType {
    EMPTY,
    WALL_SOLID,
    WALL_BREAKABLE
    // Bombs and Power-Ups are separate entities, not part of TileType,
    // but the grid knows their presence to block movement.
}

// Power-up types
enum PowerUpType {
    BOMB_RANGE,
    BOMB_COUNT
}

// Simple 2D Vector for grid coordinates
class Vector2 {
    constructor(public x: number, public y: number) {}
}

// Base class for Player and Enemies
class Character {
    gridX: number; // Current tile X
    gridY: number; // Current tile Y
    pixelX: number; // Exact pixel X (center of character)
    pixelY: number; // Exact pixel Y (center of character)
    speed: number;
    imageName: string;
    isAlive: boolean = true;
    currentMaxBombs: number = 1;
    currentBombRange: number = 1;
    bombsPlaced: number = 0; // Number of bombs currently placed by this character
    lastHitTime: number = 0; // for invulnerability

    private targetPixelX: number; // The pixel target for current movement
    private targetPixelY: number; // The pixel target for current movement
    private moving: boolean = false; // Is the character currently in motion between tiles

    constructor(startX: number, startY: number, speed: number, imageName: string, tileSize: number) {
        this.gridX = startX;
        this.gridY = startY;
        this.pixelX = startX * tileSize + (tileSize / 2); // Center of tile
        this.pixelY = startY * tileSize + (tileSize / 2); // Center of tile
        this.targetPixelX = this.pixelX;
        this.targetPixelY = this.pixelY;
        this.speed = speed;
        this.imageName = imageName;
    }

    // Attempts to initiate or change movement based on input dx, dy
    // dx, dy are -1, 0, or 1 for cardinal directions.
    attemptMove(dx: number, dy: number, game: CrazyArcadeGame) {
        if (!this.isAlive) return;

        const tileSize = game.config.gameSettings.tileSize;
        const currentTileCenterX = this.gridX * tileSize + (tileSize / 2);
        const currentTileCenterY = this.gridY * tileSize + (tileSize / 2);

        // Check if character is "centered" on current tile, allowing direction change
        const isCenteredOnCurrentTile = Math.abs(this.pixelX - currentTileCenterX) < 1 &&
                                        Math.abs(this.pixelY - currentTileCenterY) < 1;

        if (dx === 0 && dy === 0) { // Stop movement
            this.moving = false;
            // Snap to center of current tile
            this.pixelX = currentTileCenterX;
            this.pixelY = currentTileCenterY;
            this.targetPixelX = this.pixelX;
            this.targetPixelY = this.pixelY;
            return;
        }

        // Only allow a new move or direction change if not currently moving, or if at a tile center.
        if (!this.moving || isCenteredOnCurrentTile) {
            let nextGridX = this.gridX + dx;
            let nextGridY = this.gridY + dy;

            // Prioritize movement: if both X and Y are requested, try vertical first.
            if (dx !== 0 && dy !== 0) {
                if (game.isWalkable(this.gridX, this.gridY + dy)) {
                    nextGridX = this.gridX; // Only move vertically
                } else if (game.isWalkable(this.gridX + dx, this.gridY)) {
                    nextGridY = this.gridY; // Only move horizontally
                } else { // Cannot move in either desired direction
                    this.moving = false;
                    this.targetPixelX = currentTileCenterX;
                    this.targetPixelY = currentTileCenterY;
                    return;
                }
            }

            if (game.isWalkable(nextGridX, nextGridY)) {
                // Set the current gridX/gridY to the target tile, and pixel target to its center
                this.gridX = nextGridX;
                this.gridY = nextGridY;
                this.targetPixelX = nextGridX * tileSize + (tileSize / 2);
                this.targetPixelY = nextGridY * tileSize + (tileSize / 2);
                this.moving = true;
            } else {
                // If blocked, snap to center of current tile and stop moving
                this.moving = false;
                this.pixelX = currentTileCenterX;
                this.pixelY = currentTileCenterY;
                this.targetPixelX = this.pixelX;
                this.targetPixelY = this.pixelY;
            }
        }
        // If already moving and not at a tile center, ignore new movement input until the current tile traversal is complete.
    }

    update(deltaTime: number, game: CrazyArcadeGame) {
        if (!this.isAlive) return;

        const tileSize = game.config.gameSettings.tileSize;

        if (!this.moving) {
            // Ensure pixel position is snapped to current grid position if not moving
            this.pixelX = this.gridX * tileSize + (tileSize / 2);
            this.pixelY = this.gridY * tileSize + (tileSize / 2);
            this.targetPixelX = this.pixelX;
            this.targetPixelY = this.pixelY;
            return;
        }

        const moveDistance = this.speed * deltaTime / 1000; // Pixels per frame
        const dx = this.targetPixelX - this.pixelX;
        const dy = this.targetPixelY - this.pixelY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        if (currentDistance <= moveDistance) {
            // Reached or overshot the target pixel, snap to target
            this.pixelX = this.targetPixelX;
            this.pixelY = this.targetPixelY;
            this.moving = false; // Stop moving
        } else {
            // Move towards the target
            this.pixelX += (dx / currentDistance) * moveDistance;
            this.pixelY += (dy / currentDistance) * moveDistance;
        }
    }

    draw(ctx: CanvasRenderingContext2D, assetLoader: AssetLoader, tileSize: number) {
        if (!this.isAlive) return;
        const image = assetLoader.getImage(this.imageName);
        const charSize = tileSize * 0.8; // Character is slightly smaller than tile
        ctx.drawImage(image, this.pixelX - charSize / 2, this.pixelY - charSize / 2, charSize, charSize);
    }

    takeHit(game: CrazyArcadeGame) {
        const now = performance.now();
        if (now - this.lastHitTime < game.config.gameSettings.invulnerabilityTime) {
            return; // Still invulnerable
        }
        this.isAlive = false;
        game.assetLoader.getSound("player_hit").play(); // Use a generic hit sound for both player/enemy
    }
}

class Player extends Character {
    constructor(startX: number, startY: number, speed: number, tileSize: number) {
        super(startX, startY, speed, "player", tileSize);
    }
}

class Enemy extends Character {
    private aiTimer: number = 0;
    private aiActionInterval: number = 500; // ms between AI decisions

    constructor(startX: number, startY: number, speed: number, tileSize: number) {
        super(startX, startY, speed, "enemy", tileSize);
    }

    update(deltaTime: number, game: CrazyArcadeGame) {
        if (!this.isAlive) return;
        super.update(deltaTime, game); // Update pixel position based on current movement state

        this.aiTimer += deltaTime;
        if (this.aiTimer >= this.aiActionInterval) {
            this.aiTimer = 0;
            this.makeDecision(game);
        }
    }

    makeDecision(game: CrazyArcadeGame) {
        const { gridX, gridY } = this;
        
        // 1. Check for immediate danger (bombs about to explode)
        const dangerCells: Vector2[] = [];
        for (const bomb of game.bombs) {
            if (bomb.fuseTime < 1000) { // If bomb is about to explode (1 sec buffer)
                const explosionCells = game.getExplosionTiles(bomb.gridX, bomb.gridY, bomb.range);
                for (const cell of explosionCells) {
                    dangerCells.push(cell);
                }
            }
        }

        if (dangerCells.some(cell => cell.x === gridX && cell.y === gridY)) {
            // Currently in a dangerous spot, try to move to a safe spot
            const safeMoves = this.getSafeMoves(gridX, gridY, game, dangerCells);
            if (safeMoves.length > 0) {
                const move = safeMoves[randomInt(0, safeMoves.length - 1)];
                this.attemptMove(move.x - gridX, move.y - gridY, game);
                return;
            }
        }

        // 2. If not in immediate danger, decide action: move or place bomb
        const action = randomInt(0, 100);

        if (action < 30) { // 30% chance to try to place a bomb
            this.tryPlaceBomb(game);
        } else { // 70% chance to move
            this.setRandomMovement(game);
        }
    }

    getSafeMoves(currentX: number, currentY: number, game: CrazyArcadeGame, dangerCells: Vector2[]): Vector2[] {
        const possibleDirections = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // Up, Down, Left, Right
        const safeMoves: Vector2[] = [];

        for (const [dx, dy] of possibleDirections) {
            const targetX = currentX + dx;
            const targetY = currentY + dy;

            if (game.isWalkable(targetX, targetY)) { // Check if map allows movement
                // Check if the target cell is not in danger
                if (!dangerCells.some(danger => danger.x === targetX && danger.y === targetY)) {
                    safeMoves.push(new Vector2(targetX, targetY));
                }
            }
        }
        return safeMoves;
    }

    setRandomMovement(game: CrazyArcadeGame) {
        const possibleDirections = [[0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]; // Include stop
        const chosenDirection = possibleDirections[randomInt(0, possibleDirections.length - 1)];
        this.attemptMove(chosenDirection[0], chosenDirection[1], game);
    }

    tryPlaceBomb(game: CrazyArcadeGame) {
        if (this.bombsPlaced < this.currentMaxBombs) {
            // Check if there's already a bomb at this spot
            const existingBomb = game.bombs.find(b => b.gridX === this.gridX && b.gridY === this.gridY);
            if (!existingBomb) {
                game.placeBomb(this.gridX, this.gridY, this, this.currentBombRange);
                this.bombsPlaced++;
            }
        }
    }
}


class Bomb {
    gridX: number;
    gridY: number;
    fuseTime: number; // current fuse time remaining in ms
    range: number;
    placedBy: Character;

    constructor(x: number, y: number, fuseTime: number, range: number, placedBy: Character) {
        this.gridX = x;
        this.gridY = y;
        this.fuseTime = fuseTime;
        this.range = range;
        this.placedBy = placedBy;
    }

    update(deltaTime: number) {
        this.fuseTime -= deltaTime;
    }

    draw(ctx: CanvasRenderingContext2D, assetLoader: AssetLoader, tileSize: number) {
        const image = assetLoader.getImage("bomb");
        ctx.drawImage(image, this.gridX * tileSize, this.gridY * tileSize, tileSize, tileSize);
    }
}

class Explosion {
    gridX: number;
    gridY: number;
    type: string; // e.g., "explosion_center", "explosion_horizontal"
    duration: number; // current duration remaining in ms

    constructor(x: number, y: number, type: string, duration: number) {
        this.gridX = x;
        this.gridY = y;
        this.type = type;
        this.duration = duration;
    }

    update(deltaTime: number) {
        this.duration -= deltaTime;
    }

    draw(ctx: CanvasRenderingContext2D, assetLoader: AssetLoader, tileSize: number) {
        const image = assetLoader.getImage(this.type);
        ctx.drawImage(image, this.gridX * tileSize, this.gridY * tileSize, tileSize, tileSize);
    }
}

class PowerUp {
    gridX: number;
    gridY: number;
    type: PowerUpType;
    imageName: string;

    constructor(x: number, y: number, type: PowerUpType) {
        this.gridX = x;
        this.gridY = y;
        this.type = type;
        this.imageName = type === PowerUpType.BOMB_RANGE ? "powerup_bomb_range" : "powerup_bomb_count";
    }

    draw(ctx: CanvasRenderingContext2D, assetLoader: AssetLoader, tileSize: number) {
        const image = assetLoader.getImage(this.imageName);
        ctx.drawImage(image, this.gridX * tileSize, this.gridY * tileSize, tileSize, tileSize);
    }
}


class CrazyArcadeGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assetLoader: AssetLoader = new AssetLoader();
    private gameState: GameState = GameState.LOADING;

    private lastUpdateTime: number = 0;
    private accumulatedTime: number = 0;
    private fixedDeltaTime: number = 1000 / 60; // 60 FPS update

    private player!: Player;
    private enemies: Enemy[] = [];
    private bombs: Bomb[] = [];
    private explosions: Explosion[] = [];
    private powerUps: PowerUp[] = [];
    private grid: TileType[][] = [];

    private activeKeys: Set<string> = new Set();
    private inputBlockedForBomb: boolean = false; // To prevent rapid bomb placement

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error("Canvas element with ID 'gameCanvas' not found.");
        }
        this.ctx = this.canvas.getContext('2d')!;
        if (!this.ctx) {
            throw new Error("Failed to get 2D context from canvas.");
        }
    }

    async init() {
        await this.loadConfig();
        this.canvas.width = this.config.gameSettings.canvasWidth;
        this.canvas.height = this.config.gameSettings.canvasHeight;

        await this.assetLoader.load(this.config.assets);

        this.setupEventListeners();
        this.startTitleScreen();
    }

    private async loadConfig(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
            console.log("Game configuration loaded:", this.config);
        } catch (error) {
            console.error("Failed to load game configuration:", error);
            throw error;
        }
    }

    private setupEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    private handleKeyDown = (event: KeyboardEvent) => {
        if (this.gameState === GameState.TITLE && event.key === 'Enter') {
            this.startGame();
            this.assetLoader.getSound("bgm").loop = true;
            this.assetLoader.getSound("bgm").play();
        } else if (this.gameState === GameState.GAME_OVER || this.gameState === GameState.GAME_WIN) {
             if (event.key === 'Enter') {
                this.startTitleScreen();
                this.assetLoader.getSound("game_over_sound").pause();
                this.assetLoader.getSound("game_over_sound").currentTime = 0;
                this.assetLoader.getSound("game_win_sound").pause();
                this.assetLoader.getSound("game_win_sound").currentTime = 0;
            }
        } else if (this.gameState === GameState.PLAYING) {
            this.activeKeys.add(event.key);
            if (event.key === ' ' && !this.inputBlockedForBomb) {
                this.placeBomb(this.player.gridX, this.player.gridY, this.player, this.player.currentBombRange);
                this.player.bombsPlaced++;
                this.inputBlockedForBomb = true; // Block rapid bomb placement
            }
        }
    }

    private handleKeyUp = (event: KeyboardEvent) => {
        if (this.gameState === GameState.PLAYING) {
            this.activeKeys.delete(event.key);
            if (event.key === ' ') {
                this.inputBlockedForBomb = false; // Allow bomb placement again
            }
        }
    }

    startTitleScreen() {
        this.gameState = GameState.TITLE;
        this.renderTitleScreen();
        this.assetLoader.getSound("bgm").pause();
        this.assetLoader.getSound("bgm").currentTime = 0;
    }

    startGame() {
        this.gameState = GameState.PLAYING;
        this.resetGame();
        this.lastUpdateTime = performance.now();
        requestAnimationFrame(this.gameLoop);
    }

    resetGame() {
        const { gameSettings, playerSettings, enemySettings } = this.config;
        const { gridSize, tileSize } = gameSettings;

        this.player = new Player(playerSettings.startX, playerSettings.startY, gameSettings.playerSpeed, tileSize);
        this.player.currentMaxBombs = gameSettings.initialMaxBombs;
        this.player.currentBombRange = gameSettings.initialBombRange;

        this.enemies = enemySettings.map(es => {
            const enemy = new Enemy(es.startX, es.startY, es.speed, tileSize);
            enemy.currentMaxBombs = gameSettings.initialMaxBombs;
            enemy.currentBombRange = gameSettings.initialBombRange;
            return enemy;
        });

        this.bombs = [];
        this.explosions = [];
        this.powerUps = [];
        this.grid = Array(gridSize).fill(0).map(() => Array(gridSize).fill(TileType.EMPTY));

        this.generateMap();
        console.log("Game reset and started.");
    }

    generateMap() {
        const { gridSize, breakableBlockDensity } = this.config.gameSettings;

        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                if (x === 0 || y === 0 || x === gridSize - 1 || y === gridSize - 1) {
                    this.grid[y][x] = TileType.WALL_SOLID; // Outer walls
                } else if (x % 2 === 0 && y % 2 === 0) {
                    this.grid[y][x] = TileType.WALL_SOLID; // Indestructible inner walls
                } else if (this.isStartArea(x, y, this.player) || this.enemies.some(e => this.isStartArea(x, y, e))) {
                    this.grid[y][x] = TileType.EMPTY; // Keep player/enemy start areas clear
                } else if (Math.random() < breakableBlockDensity) {
                    this.grid[y][x] = TileType.WALL_BREAKABLE; // Breakable blocks
                } else {
                    this.grid[y][x] = TileType.EMPTY;
                }
            }
        }
    }

    // Helper to check if a tile is within a character's initial 3x3 clear zone
    private isStartArea(x: number, y: number, char: Character): boolean {
        return (x === char.gridX && y === char.gridY) ||
               (x === char.gridX + 1 && y === char.gridY) ||
               (x === char.gridX && y === char.gridY + 1) ||
               (x === char.gridX - 1 && y === char.gridY) || // Also clear adjacent to allow initial movement
               (x === char.gridX && y === char.gridY - 1);
    }

    gameLoop = (timestamp: number) => {
        if (this.gameState !== GameState.PLAYING) return;

        const deltaTime = timestamp - this.lastUpdateTime;
        this.lastUpdateTime = timestamp;
        this.accumulatedTime += deltaTime;

        while (this.accumulatedTime >= this.fixedDeltaTime) {
            this.update(this.fixedDeltaTime);
            this.accumulatedTime -= this.fixedDeltaTime;
        }

        this.render();
        requestAnimationFrame(this.gameLoop);
    }

    update(deltaTime: number) {
        // Player movement
        this.updatePlayerMovement();
        this.player.update(deltaTime, this);

        // Enemies AI & Movement
        this.enemies.forEach(enemy => enemy.update(deltaTime, this));

        // Bombs
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            bomb.update(deltaTime);
            if (bomb.fuseTime <= 0) {
                this.handleBombExplosion(bomb);
                this.bombs.splice(i, 1);
                bomb.placedBy.bombsPlaced--;
            }
        }

        // Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            explosion.update(deltaTime);
            if (explosion.duration <= 0) {
                this.explosions.splice(i, 1);
            }
        }

        // Power-ups
        this.checkPowerUpCollisions();

        // Check for player and enemy hits by explosions
        this.checkCharacterExplosionHits(this.player);
        this.enemies.forEach(enemy => this.checkCharacterExplosionHits(enemy));

        // Remove dead characters
        this.enemies = this.enemies.filter(e => e.isAlive);
        if (!this.player.isAlive) {
            this.gameOver();
        } else if (this.enemies.length === 0) {
            this.gameWin();
        }
    }

    private updatePlayerMovement() {
        let dx = 0;
        let dy = 0;

        if (this.activeKeys.has('ArrowUp') || this.activeKeys.has('w')) dy = -1;
        if (this.activeKeys.has('ArrowDown') || this.activeKeys.has('s')) dy = 1;
        if (this.activeKeys.has('ArrowLeft') || this.activeKeys.has('a')) dx = -1;
        if (this.activeKeys.has('ArrowRight') || this.activeKeys.has('d')) dx = 1;

        this.player.attemptMove(dx, dy, this);
    }

    // Checks if a grid tile is walkable (not solid wall, breakable wall, or occupied by a bomb)
    isWalkable(gridX: number, gridY: number): boolean {
        const { gridSize } = this.config.gameSettings;
        if (gridX < 0 || gridX >= gridSize || gridY < 0 || gridY >= gridSize) {
            return false; // Out of bounds
        }
        const tile = this.grid[gridY][gridX];
        if (tile === TileType.WALL_SOLID || tile === TileType.WALL_BREAKABLE) {
            return false; // Walls are not walkable
        }
        // Bombs temporarily block movement on their tile
        if (this.bombs.some(b => b.gridX === gridX && b.gridY === gridY)) {
            return false;
        }
        return true;
    }

    placeBomb(gridX: number, gridY: number, placer: Character, range: number) {
        if (placer.bombsPlaced >= placer.currentMaxBombs) {
            // console.log("Max bombs reached for player.");
            return;
        }
        // Prevent placing a bomb on top of another bomb
        if (this.bombs.some(b => b.gridX === gridX && b.gridY === gridY)) {
            // console.log("Bomb already exists at this location.");
            return;
        }

        const bomb = new Bomb(gridX, gridY, this.config.gameSettings.bombFuseTime, range, placer);
        this.bombs.push(bomb);
        this.assetLoader.getSound("bomb_place").play();
    }

    handleBombExplosion(bomb: Bomb) {
        this.assetLoader.getSound("explosion").play();
        const { explosionDuration, powerUpDropChance, gridSize } = this.config.gameSettings;
        const affectedTiles: Vector2[] = [];
        const { gridX, gridY, range } = bomb;

        // Center explosion
        this.explosions.push(new Explosion(gridX, gridY, "explosion_center", explosionDuration));
        affectedTiles.push(new Vector2(gridX, gridY));

        const directions = [
            { dx: 0, dy: -1, type: "vertical", endType: "explosion_end_up" },
            { dx: 0, dy: 1, type: "vertical", endType: "explosion_end_down" },
            { dx: -1, dy: 0, type: "horizontal", endType: "explosion_end_left" },
            { dx: 1, dy: 0, type: "horizontal", endType: "explosion_end_right" }
        ];

        for (const dir of directions) {
            for (let i = 1; i <= range; i++) {
                const currentX = gridX + dir.dx * i;
                const currentY = gridY + dir.dy * i;

                if (currentX < 0 || currentX >= gridSize || currentY < 0 || currentY >= gridSize) {
                    break; // Out of bounds
                }

                const tile = this.grid[currentY][currentX];
                if (tile === TileType.WALL_SOLID) {
                    break; // Solid walls block explosion
                }

                affectedTiles.push(new Vector2(currentX, currentY));

                // Determine explosion sprite based on position
                let explosionImageName: string;
                if (i === range || tile === TileType.WALL_BREAKABLE) {
                    explosionImageName = dir.endType;
                } else {
                    explosionImageName = `explosion_${dir.type}`;
                }
                this.explosions.push(new Explosion(currentX, currentY, explosionImageName, explosionDuration));

                if (tile === TileType.WALL_BREAKABLE) {
                    this.grid[currentY][currentX] = TileType.EMPTY; // Destroy breakable wall
                    if (Math.random() < powerUpDropChance) {
                        this.dropPowerUp(currentX, currentY);
                    }
                    break; // Breakable walls stop explosion propagation
                }

                // Trigger other bombs in explosion path
                const hitBomb = this.bombs.find(b => b.gridX === currentX && b.gridY === currentY && b !== bomb);
                if (hitBomb && hitBomb.fuseTime > explosionDuration) {
                    hitBomb.fuseTime = explosionDuration; // Make it explode immediately
                }
            }
        }

        // Apply damage to characters caught in explosion
        [this.player, ...this.enemies].forEach(char => {
            if (char.isAlive && affectedTiles.some(t => t.x === char.gridX && t.y === char.gridY)) {
                char.takeHit(this);
            }
        });
    }

    // Returns a list of grid tiles that would be affected by a bomb explosion
    getExplosionTiles(bombX: number, bombY: number, range: number): Vector2[] {
        const tiles: Vector2[] = [];
        tiles.push(new Vector2(bombX, bombY)); // Center tile

        const { gridSize } = this.config.gameSettings;
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // Up, Down, Left, Right

        for (const [dx, dy] of directions) {
            for (let i = 1; i <= range; i++) {
                const currentX = bombX + dx * i;
                const currentY = bombY + dy * i;

                if (currentX < 0 || currentX >= gridSize || currentY < 0 || currentY >= gridSize) {
                    break; // Out of bounds
                }

                const tile = this.grid[currentY][currentX];
                if (tile === TileType.WALL_SOLID) {
                    break; // Solid walls block explosion
                }
                tiles.push(new Vector2(currentX, currentY)); // Add to affected tiles
                if (tile === TileType.WALL_BREAKABLE) {
                    break; // Breakable walls stop explosion propagation
                }
            }
        }
        return tiles;
    }

    dropPowerUp(gridX: number, gridY: number) {
        const rand = Math.random();
        let type: PowerUpType;
        if (rand < 0.5) {
            type = PowerUpType.BOMB_RANGE;
        } else {
            type = PowerUpType.BOMB_COUNT;
        }
        this.powerUps.push(new PowerUp(gridX, gridY, type));
    }

    checkPowerUpCollisions() {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const pu = this.powerUps[i];
            
            // Check collision with player
            if (pu.gridX === this.player.gridX && pu.gridY === this.player.gridY) {
                 this.applyPowerUp(this.player, pu.type);
                 this.powerUps.splice(i, 1);
                 this.assetLoader.getSound("powerup_pickup").play();
                 continue;
            }

            // Check collision with enemies
            for (const enemy of this.enemies) {
                if (enemy.isAlive && pu.gridX === enemy.gridX && pu.gridY === enemy.gridY) {
                    this.applyPowerUp(enemy, pu.type);
                    this.powerUps.splice(i, 1);
                    this.assetLoader.getSound("powerup_pickup").play();
                    break; // Only one character can pick up a power-up
                }
            }
        }
    }

    applyPowerUp(character: Character, type: PowerUpType) {
        if (type === PowerUpType.BOMB_RANGE) {
            character.currentBombRange++;
            // console.log(`${character.imageName} got Bomb Range Up! New range: ${character.currentBombRange}`);
        } else if (type === PowerUpType.BOMB_COUNT) {
            character.currentMaxBombs++;
            // console.log(`${character.imageName} got Bomb Count Up! New max bombs: ${character.currentMaxBombs}`);
        }
    }

    checkCharacterExplosionHits(character: Character) {
        if (!character.isAlive) return;
        const now = performance.now();
        if (now - character.lastHitTime < this.config.gameSettings.invulnerabilityTime) {
            return; // Still invulnerable
        }

        // Check if character's current grid position is covered by any active explosion
        const isHit = this.explosions.some(exp => exp.gridX === character.gridX && exp.gridY === character.gridY);
        if (isHit) {
            character.takeHit(this); // Take hit will set isAlive to false and play sound
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { gridSize, tileSize } = this.config.gameSettings;

        // Draw background floor tiles
        const floorImage = this.assetLoader.getImage("floor_tile");
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                this.ctx.drawImage(floorImage, x * tileSize, y * tileSize, tileSize, tileSize);
            }
        }

        // Draw grid elements (walls)
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const tileType = this.grid[y][x];
                let image: HTMLImageElement | undefined;
                if (tileType === TileType.WALL_SOLID) {
                    image = this.assetLoader.getImage("wall_solid");
                } else if (tileType === TileType.WALL_BREAKABLE) {
                    image = this.assetLoader.getImage("wall_breakable");
                }
                if (image) {
                    this.ctx.drawImage(image, x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }

        // Draw power-ups
        this.powerUps.forEach(pu => pu.draw(this.ctx, this.assetLoader, tileSize));

        // Draw bombs
        this.bombs.forEach(bomb => bomb.draw(this.ctx, this.assetLoader, tileSize));

        // Draw explosions
        this.explosions.forEach(exp => exp.draw(this.ctx, this.assetLoader, tileSize));

        // Draw player
        this.player.draw(this.ctx, this.assetLoader, tileSize);

        // Draw enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx, this.assetLoader, tileSize));

        // Render UI
        this.renderStatusText();
    }

    renderStatusText() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`Bombs: ${this.player.bombsPlaced}/${this.player.currentMaxBombs}`, 10, 10);
        this.ctx.fillText(`Range: ${this.player.currentBombRange}`, 10, 35);
        this.ctx.fillText(`Enemies left: ${this.enemies.length}`, 10, 60);
    }

    renderTitleScreen() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const titleImage = this.assetLoader.getImage("title_screen");
        this.ctx.drawImage(titleImage, 0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText("CRAZY BOMBER", this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText("Press ENTER to Start", this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    gameOver() {
        if (this.gameState !== GameState.PLAYING) return; // Prevent multiple calls
        this.gameState = GameState.GAME_OVER;
        console.log("Game Over!");
        this.renderGameOverScreen();
        this.assetLoader.getSound("bgm").pause();
        this.assetLoader.getSound("bgm").currentTime = 0;
        this.assetLoader.getSound("game_over_sound").play();
    }

    gameWin() {
        if (this.gameState !== GameState.PLAYING) return; // Prevent multiple calls
        this.gameState = GameState.GAME_WIN;
        console.log("You Win!");
        this.renderGameWinScreen();
        this.assetLoader.getSound("bgm").pause();
        this.assetLoader.getSound("bgm").currentTime = 0;
        this.assetLoader.getSound("game_win_sound").play();
    }

    renderGameOverScreen() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const gameOverImage = this.assetLoader.getImage("game_over");
        this.ctx.drawImage(gameOverImage, 0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'red';
        this.ctx.font = '72px Arial Black';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.fillText("Press ENTER to return to Title", this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    renderGameWinScreen() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const gameWinImage = this.assetLoader.getImage("game_win");
        this.ctx.drawImage(gameWinImage, 0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'green';
        this.ctx.font = '72px Arial Black';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText("YOU WIN!", this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.fillText("Press ENTER to return to Title", this.canvas.width / 2, this.canvas.height / 2 + 50);
    }
}

// Create and initialize the game instance
const game = new CrazyArcadeGame();
game.init().catch(err => console.error("Game initialization failed:", err));