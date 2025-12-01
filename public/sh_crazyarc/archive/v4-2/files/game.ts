let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let game: Game;

enum Direction {
    None,
    Up,
    Down,
    Left,
    Right
}

enum TileType {
    Empty,
    Wall,
    Block,
    Bomb // Represent a bomb planted on the tile
}

enum ItemType {
    BombUp = "item_bomb_up",
    RangeUp = "item_range_up",
    SpeedUp = "item_speed_up",
    WaterBalloonUp = "item_water_balloon_up" // New item type for increasing water balloon count
}

enum GameState {
    Title,
    Playing,
    GameOver,
    Victory
}

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

interface AssetsData {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface GameSettings {
    tileSize: number;
    playerSpeed: number;
    bombTimer: number;
    initialBombRange: number;
    initialMaxBombs: number;
    enemyCount: number;
    aiSpeedMultiplier: number;
    aiBombDropChance: number;
    maxMapWidthTiles: number;
    maxMapHeightTiles: number;
    titleScreenText: string;
    pressKeyToStartText: string;
    explosionDuration: number;
    itemLifespan: number;
    blockDropRate: number; // New setting for item drop chance from blocks
}

interface ItemDropRates {
    [key: string]: number; // e.g., "item_bomb_up": 0.3, "no_item": 0.1
}

interface GameData {
    gameSettings: GameSettings;
    assets: AssetsData;
    itemDropRates: ItemDropRates;
}

class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private imageAssets: ImageAsset[];
    private soundAssets: SoundAsset[];

    constructor(imageAssets: ImageAsset[], soundAssets: SoundAsset[]) {
        this.imageAssets = imageAssets;
        this.soundAssets = soundAssets;
    }

    async loadAll(): Promise<void> {
        const imagePromises = this.imageAssets.map(asset => this.loadImage(asset));
        const soundPromises = this.soundAssets.map(asset => this.loadSound(asset));

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private loadImage(asset: ImageAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                this.images.set(asset.name, img);
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${asset.path}`);
                reject(new Error(`Failed to load image: ${asset.path}`));
            };
        });
    }

    private loadSound(asset: SoundAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(asset.path);
            audio.preload = 'auto';
            audio.volume = asset.volume;
            audio.oncanplaythrough = () => {
                this.sounds.set(asset.name, audio);
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${asset.path}`);
                reject(new Error(`Failed to load sound: ${asset.path}`));
            };
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }
}

class SoundPlayer {
    private assets: AssetLoader;
    private bgmAudio: HTMLAudioElement | null = null;

    constructor(assets: AssetLoader) {
        this.assets = assets;
    }

    play(name: string, loop: boolean = false): void {
        const audio = this.assets.getSound(name);
        if (audio) {
            const clone = audio.cloneNode() as HTMLAudioElement;
            clone.loop = loop;
            clone.volume = audio.volume; // Ensure cloned audio has correct volume
            clone.play().catch(e => console.warn(`Sound playback failed: ${name}`, e));
        }
    }

    playBGM(name: string): void {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
        }
        this.bgmAudio = this.assets.getSound(name) ?? null; // Fix: Use nullish coalescing to assign null if undefined
        if (this.bgmAudio) {
            this.bgmAudio.loop = true;
            this.bgmAudio.play().catch(e => console.warn(`BGM playback failed: ${name}`, e));
        }
    }

    stopBGM(): void {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
        }
    }
}

abstract class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    imageName: string;
    isAlive: boolean = true; // Added 'isAlive' property

    constructor(x: number, y: number, width: number, height: number, imageName: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageName = imageName;
    }

    abstract update(deltaTime: number, game: Game): void;

    draw(ctx: CanvasRenderingContext2D, assets: AssetLoader, tileSize: number): void {
        const image = assets.getImage(this.imageName);
        if (image) {
            ctx.drawImage(image, this.x, this.y, this.width, this.height);
        } else {
            // Fallback for missing images (optional)
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = 'white';
            ctx.fillText(this.imageName, this.x + 5, this.y + this.height / 2);
        }
    }
}

abstract class Character extends GameObject {
    speed: number;
    maxBombs: number;
    currentBombs: number;
    bombRange: number;
    direction: Direction = Direction.None;
    isMoving: boolean = false;
    protected _movedX: number = 0;
    protected _movedY: number = 0;
    protected currentTileX: number;
    protected currentTileY: number;

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, maxBombs: number, bombRange: number, tileSize: number) {
        super(x, y, width, height, imageName);
        this.speed = speed;
        this.maxBombs = maxBombs;
        this.currentBombs = maxBombs;
        this.bombRange = bombRange;
        this.currentTileX = Math.round(x / tileSize);
        this.currentTileY = Math.round(y / tileSize);
    }

    get centerX(): number { return this.x + this.width / 2; }
    get centerY(): number { return this.y + this.height / 2; }

    get gridX(): number { return Math.floor(this.centerX / game.settings.tileSize); }
    get gridY(): number { return Math.floor(this.centerY / game.settings.tileSize); }

    update(deltaTime: number, game: Game): void {
        if (!this.isAlive) return;

        const bombsDroppedByMe = game.bombs.filter(b => b.owner === this && b.isAlive).length;
        this.currentBombs = this.maxBombs - bombsDroppedByMe;

        if (this.isMoving) {
            this.moveCharacter(deltaTime, game);
        } else {
            this.processNewMovement(game);
        }
    }

    private moveCharacter(deltaTime: number, game: Game): void {
        const tileSize = game.settings.tileSize;
        const targetTileX = this.currentTileX;
        const targetTileY = this.currentTileY;

        let deltaX = 0;
        let deltaY = 0;

        switch (this.direction) {
            case Direction.Up:
                deltaY = -this.speed * deltaTime;
                this._movedY += deltaY;
                if (this._movedY <= -tileSize) {
                    deltaY -= (this._movedY + tileSize);
                    this.y = (targetTileY - 1) * tileSize + (tileSize - this.height) / 2;
                    this.currentTileY--;
                    this.isMoving = false;
                    this._movedY = 0;
                }
                break;
            case Direction.Down:
                deltaY = this.speed * deltaTime;
                this._movedY += deltaY;
                if (this._movedY >= tileSize) {
                    deltaY -= (this._movedY - tileSize);
                    this.y = (targetTileY + 1) * tileSize + (tileSize - this.height) / 2;
                    this.currentTileY++;
                    this.isMoving = false;
                    this._movedY = 0;
                }
                break;
            case Direction.Left:
                deltaX = -this.speed * deltaTime;
                this._movedX += deltaX;
                if (this._movedX <= -tileSize) {
                    deltaX -= (this._movedX + tileSize);
                    this.x = (targetTileX - 1) * tileSize + (tileSize - this.width) / 2;
                    this.currentTileX--;
                    this.isMoving = false;
                    this._movedX = 0;
                }
                break;
            case Direction.Right:
                deltaX = this.speed * deltaTime;
                this._movedX += deltaX;
                if (this._movedX >= tileSize) {
                    deltaX -= (this._movedX - tileSize);
                    this.x = (targetTileX + 1) * tileSize + (tileSize - this.width) / 2;
                    this.currentTileX++;
                    this.isMoving = false;
                    this._movedX = 0;
                }
                break;
        }

        this.x += deltaX;
        this.y += deltaY;

        if (!this.isMoving) {
            this.direction = Direction.None;
        }
    }

    protected tryMove(direction: Direction, game: Game): boolean {
        let newGridX = this.gridX;
        let newGridY = this.gridY;

        switch (direction) {
            case Direction.Up: newGridY--; break;
            case Direction.Down: newGridY++; break;
            case Direction.Left: newGridX--; break;
            case Direction.Right: newGridX++; break;
            case Direction.None: return false;
        }

        if (game.isWalkable(newGridX, newGridY)) {
            this.direction = direction;
            this.isMoving = true;
            this._movedX = 0;
            this._movedY = 0;
            return true;
        }
        return false;
    }

    protected processNewMovement(game: Game): void {}

    dropBomb(game: Game): boolean {
        if (!this.isAlive || this.currentBombs <= 0) return false;

        // Changed gx and gy calculation to use the consistent gridX and gridY properties
        // This ensures the bomb is dropped on the tile the character is considered to be on.
        const gx = this.gridX;
        const gy = this.gridY;

        // Allows dropping a bomb only on an empty tile.
        // This prevents stacking multiple bombs on the same spot and respects walls/blocks.
        if (game.getTileAt(gx, gy) === TileType.Empty) {
            game.dropBomb(this, gx, gy); // Call game's dropBomb method
            game.soundPlayer.play("bomb_drop");
            return true;
        }
        return false;
    }

    takeDamage(game: Game): void {
        if (!this.isAlive) return;
        this.isAlive = false;
        game.soundPlayer.play("player_die"); // This sound is general for character death.
    }
}

class Player extends Character {
    private keysPressed: Set<string> = new Set();
    private canDropBomb: boolean = true; // To prevent continuous bomb drop

    constructor(x: number, y: number, settings: GameSettings) {
        super(x, y, settings.tileSize * 0.9, settings.tileSize * 0.9, 'player', settings.playerSpeed, settings.initialMaxBombs, settings.initialBombRange, settings.tileSize);
        this.x += (settings.tileSize - this.width) / 2;
        this.y += (settings.tileSize - this.height) / 2;
    }

    update(deltaTime: number, game: Game): void {
        super.update(deltaTime, game);
        if (!this.isAlive) return;
        
        if (this.keysPressed.has(' ') && this.canDropBomb) {
            this.dropBomb(game);
            this.canDropBomb = false; // Disable bomb drop until key up
        }
    }

    protected processNewMovement(game: Game): void {
        let newDir: Direction = Direction.None;
        if (this.keysPressed.has('ArrowUp')) newDir = Direction.Up;
        else if (this.keysPressed.has('ArrowDown')) newDir = Direction.Down;
        else if (this.keysPressed.has('ArrowLeft')) newDir = Direction.Left;
        else if (this.keysPressed.has('ArrowRight')) newDir = Direction.Right;

        if (newDir !== Direction.None) {
            this.tryMove(newDir, game);
        }
    }

    handleKeyDown(key: string): void {
        this.keysPressed.add(key);
        if (key === ' ') this.canDropBomb = true; // Reset on keydown for space
    }

    handleKeyUp(key: string): void {
        this.keysPressed.delete(key);
        // Note: canDropBomb is set to true on keydown, and false after a bomb is dropped.
        // It's reset to true on the next spacebar keydown, preventing multiple bombs from a single press.
    }

    collectItem(item: Item, game: Game): void {
        game.soundPlayer.play("item_collect");
        switch (item.type) {
            case ItemType.BombUp: this.maxBombs++; break;
            case ItemType.RangeUp: this.bombRange++; break;
            case ItemType.SpeedUp: this.speed *= 1.1; break;
            case ItemType.WaterBalloonUp: this.maxBombs++; break; // New: Increase water balloon count (maxBombs)
        }
    }
}

class Enemy extends Character {
    private targetGridX: number = -1;
    private targetGridY: number = -1;
    private path: { gx: number, gy: number }[] = [];
    private lastBombDropTime: number = 0;
    private bombDropCooldown: number = 2000;

    constructor(x: number, y: number, settings: GameSettings) {
        super(x, y, settings.tileSize * 0.9, settings.tileSize * 0.9, 'enemy', settings.playerSpeed * settings.aiSpeedMultiplier, settings.initialMaxBombs, settings.initialBombRange, settings.tileSize);
        this.x += (settings.tileSize - this.width) / 2;
        this.y += (settings.tileSize - this.height) / 2;
    }

    update(deltaTime: number, game: Game): void {
        super.update(deltaTime, game);
        if (!this.isAlive) return;

        if (!this.isMoving) {
            this.processNewMovement(game);
        }

        const now = performance.now();
        if (now - this.lastBombDropTime > this.bombDropCooldown) {
            if (this.shouldDropBomb(game)) {
                this.dropBomb(game);
                this.lastBombDropTime = now;
            }
        }
    }

    protected processNewMovement(game: Game): void {
        const myGridX = this.gridX;
        const myGridY = this.gridY;

        // Check danger zone with current game state (not simulated)
        if (game.isDangerZone(myGridX, myGridY)) {
            // Pass current game map and bombs for escape route calculation
            const escapeRoute = this.findEscapeRoute(myGridX, myGridY, game, game.map, game.bombs);
            if (escapeRoute !== Direction.None) {
                this.tryMove(escapeRoute, game);
                return;
            }
        }

        if (this.path.length === 0 || (myGridX === this.targetGridX && myGridY === this.targetGridY)) {
            this.findNewTarget(game);
        }

        if (this.path.length > 0) {
            const nextStep = this.path[0];
            let newDir: Direction = Direction.None;
            if (nextStep.gx > myGridX) newDir = Direction.Right;
            else if (nextStep.gx < myGridX) newDir = Direction.Left;
            else if (nextStep.gy > myGridY) newDir = Direction.Down;
            else if (nextStep.gy < myGridY) newDir = Direction.Up;

            if (newDir !== Direction.None && this.tryMove(newDir, game)) {
                this.path.shift();
            } else {
                // If the planned move failed (e.g., player moved into the path, or new danger), re-evaluate
                this.findNewTarget(game);
            }
        } else {
            // No path, or path is empty, try a random move
            const randomDir = [Direction.Up, Direction.Down, Direction.Left, Direction.Right][Math.floor(Math.random() * 4)];
            this.tryMove(randomDir, game);
        }
    }

    private findNewTarget(game: Game): void {
        const myGridX = this.gridX;
        const myGridY = this.gridY;
        const targets: { gx: number, gy: number, type: 'block' | 'player' | 'enemy' }[] = [];

        if (game.player.isAlive) {
            const dist = Math.abs(myGridX - game.player.gridX) + Math.abs(myGridY - game.player.gridY);
            if (dist <= 5) { // Prioritize player if close
                targets.push({ gx: game.player.gridX, gy: game.player.gridY, type: 'player' });
            }
        }

        game.enemies.forEach(enemy => {
            if (enemy !== this && enemy.isAlive) {
                const dist = Math.abs(myGridX - enemy.gridX) + Math.abs(myGridY - enemy.gridY);
                if (dist <= 3) { // Consider other enemies if close (maybe to avoid collision or group up)
                     targets.push({ gx: enemy.gridX, gy: enemy.gridY, type: 'enemy' });
                }
            }
        });

        for (let y = 0; y < game.map.length; y++) {
            for (let x = 0; x < game.map[0].length; x++) {
                if (game.map[y][x] === TileType.Block) { // Break blocks
                    targets.push({ gx: x, gy: y, type: 'block' });
                }
            }
        }

        if (targets.length > 0) {
            // Randomly pick a target, but prioritize player/enemies
            let chosenTarget = targets[Math.floor(Math.random() * targets.length)];
            const playerTargets = targets.filter(t => t.type === 'player');
            if (playerTargets.length > 0) {
                chosenTarget = playerTargets[0]; // Always target player if available
            } else {
                 const blockTargets = targets.filter(t => t.type === 'block');
                 if (blockTargets.length > 0) {
                     chosenTarget = blockTargets[Math.floor(Math.random() * blockTargets.length)];
                 }
            }
            
            // Pathfinding uses current game state
            const foundPath = game.findPath({ gx: myGridX, gy: myGridY }, { gx: chosenTarget.gx, gy: chosenTarget.gy }, (gx, gy) => game.isWalkable(gx, gy) && !game.isDangerZone(gx, gy));
            if (foundPath.length > 0) {
                this.path = foundPath;
                this.targetGridX = chosenTarget.gx;
                this.targetGridY = chosenTarget.gy;
                return;
            }
        }
        
        this.targetGridX = -1;
        this.targetGridY = -1;
        this.path = [];
    }

    private findEscapeRoute(myGridX: number, myGridY: number, game: Game, currentMap: TileType[][], currentBombs: Bomb[]): Direction {
        const possibleDirections = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
        // Shuffle directions to add some randomness to escape
        possibleDirections.sort(() => Math.random() - 0.5);

        for (const dir of possibleDirections) {
            let nextX = myGridX;
            let nextY = myGridY;
            switch (dir) {
                case Direction.Up: nextY--; break;
                case Direction.Down: nextY++; break;
                case Direction.Left: nextX--; break;
                case Direction.Right: nextX++; break;
            }
            // A valid escape route must be walkable and NOT a danger zone
            // Pass the simulated map and bombs to these checks
            if (game.isWalkable(nextX, nextY, currentMap) && !game.isDangerZone(nextX, nextY, currentMap, currentBombs)) {
                return dir;
            }
        }
        return Direction.None;
    }

    private shouldDropBomb(game: Game): boolean {
        const myGridX = this.gridX;
        const myGridY = this.gridY;

        // Don't drop bomb if current tile is already a danger zone from *existing* bombs.
        // This check uses the actual game state.
        if (game.isDangerZone(myGridX, myGridY)) {
            return false;
        }

        // Create a temporary map and bombs array for simulating a bomb drop
        const tempMap = [...game.map.map(row => [...row])]; // Deep copy map
        tempMap[myGridY][myGridX] = TileType.Bomb; // Simulate bomb placement

        const simulatedBombs = [...game.bombs];
        // Create a mock bomb representing the one just 'dropped' for simulation
        const mockBomb = new Bomb(myGridX, myGridY, this, game.settings.tileSize, game.settings.bombTimer);
        simulatedBombs.push(mockBomb); // Add the mock bomb to the simulated list

        let isBombUseful = false;

        // Check if there's a block to destroy
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const d of directions) {
            const targetX = myGridX + d.dx;
            const targetY = myGridY + d.dy;
            if (game.getTileAt(targetX, targetY) === TileType.Block) { // Use actual game map for blocks
                isBombUseful = true;
                break;
            }
        }

        // Check if player or another enemy is in bomb range
        const characters = [game.player, ...game.enemies].filter(c => c.isAlive && c !== this);
        for (const char of characters) {
            // Check horizontal range
            if (char.gridY === myGridY && Math.abs(char.gridX - myGridX) <= this.bombRange) {
                let clearPath = true;
                const minX = Math.min(myGridX, char.gridX);
                const maxX = Math.max(myGridX, char.gridX);
                for (let x = minX + 1; x < maxX; x++) {
                    if (game.getTileAt(x, myGridY) === TileType.Wall) { // Use actual game map for walls
                        clearPath = false;
                        break;
                    }
                }
                if (clearPath) {
                    isBombUseful = true;
                }
            }
            // Check vertical range
            if (char.gridX === myGridX && Math.abs(char.gridY - myGridY) <= this.bombRange) {
                let clearPath = true;
                const minY = Math.min(myGridY, char.gridY);
                const maxY = Math.max(myGridY, char.gridY);
                for (let y = minY + 1; y < maxY; y++) {
                    if (game.getTileAt(myGridX, y) === TileType.Wall) { // Use actual game map for walls
                        clearPath = false;
                        break;
                    }
                }
                if (clearPath) {
                    isBombUseful = true;
                }
            }
        }
        
        if (isBombUseful) {
            // If the bomb is useful, check if the enemy has an escape route after dropping THIS bomb
            // Pass the simulated map and bombs (including the mock bomb)
            const hasEscape = this.findEscapeRoute(myGridX, myGridY, game, tempMap, simulatedBombs) !== Direction.None;
            if (hasEscape) return true;
        }
        
        // Random chance to drop a bomb if nothing else is useful
        if (Math.random() < game.settings.aiBombDropChance) {
            // Check if an escape route exists after dropping this bomb, even if not immediately useful
            const hasEscape = this.findEscapeRoute(myGridX, myGridY, game, tempMap, simulatedBombs) !== Direction.None;
            if (hasEscape) return true;
        }

        return false;
    }
}

class Bomb extends GameObject {
    timer: number;
    range: number;
    gx: number;
    gy: number;
    owner: Character;

    constructor(gx: number, gy: number, owner: Character, tileSize: number, bombTimer: number) {
        super(gx * tileSize + (tileSize - tileSize * 0.9) / 2, gy * tileSize + (tileSize - tileSize * 0.9) / 2, tileSize * 0.9, tileSize * 0.9, 'bomb');
        this.gx = gx;
        this.gy = gy;
        this.owner = owner;
        this.timer = bombTimer;
        this.range = owner.bombRange; // Bomb range is determined by the owner's current bombRange
    }

    update(deltaTime: number, game: Game): void {
        if (!this.isAlive) return;
        this.timer -= deltaTime * 1000;
        if (this.timer <= 0) {
            game.explodeBomb(this); // Call game's explodeBomb method
            this.isAlive = false;
        }
    }
}

class Explosion extends GameObject {
    timer: number;
    gx: number;
    gy: number;
    
    constructor(gx: number, gy: number, tileSize: number, duration: number, imageName: string = 'explosion') {
        super(gx * tileSize, gy * tileSize, tileSize, tileSize, imageName);
        this.gx = gx;
        this.gy = gy;
        this.timer = duration;
    }

    update(deltaTime: number, game: Game): void {
        if (!this.isAlive) return;
        this.timer -= deltaTime * 1000;
        if (this.timer <= 0) {
            this.isAlive = false;
        }
    }
}

class Item extends GameObject {
    type: ItemType;
    gx: number;
    gy: number;
    lifespan: number;

    constructor(gx: number, gy: number, type: ItemType, tileSize: number, lifespan: number) {
        // The imageName for an item is its type value (e.g., "item_bomb_up")
        super(gx * tileSize + tileSize * 0.1, gy * tileSize + tileSize * 0.1, tileSize * 0.8, tileSize * 0.8, type);
        this.gx = gx;
        this.gy = gy;
        this.type = type;
        this.lifespan = lifespan;
    }

    update(deltaTime: number, game: Game): void {
        if (!this.isAlive) return;
        this.lifespan -= deltaTime * 1000;
        if (this.lifespan <= 0) {
            this.isAlive = false;
        }
    }
}

class Game {
    private gameState: GameState = GameState.Title;
    private lastTime: number = 0;
    private playedEndSound: boolean = false; // Flag to play end screen sound only once
    
    player!: Player;
    enemies: Enemy[] = [];
    bombs: Bomb[] = [];
    explosions: Explosion[] = [];
    items: Item[] = [];
    map!: TileType[][];

    assets: AssetLoader;
    soundPlayer: SoundPlayer;
    settings: GameSettings;
    itemDropRates: ItemDropRates;

    private activeKeys: Set<string> = new Set(); // This property is not currently used.
    private mapWidthTiles!: number;
    private mapHeightTiles!: number;

    constructor(data: GameData) {
        this.settings = data.gameSettings;
        this.itemDropRates = data.itemDropRates;
        this.assets = new AssetLoader(data.assets.images, data.assets.sounds);
        this.soundPlayer = new SoundPlayer(this.assets);
    }

    async init(): Promise<void> {
        await this.assets.loadAll();
        this.mapWidthTiles = this.settings.maxMapWidthTiles;
        this.mapHeightTiles = this.settings.maxMapHeightTiles;
        canvas.width = this.mapWidthTiles * this.settings.tileSize;
        canvas.height = this.mapHeightTiles * this.settings.tileSize;
        
        this.setupInput();
        this.soundPlayer.playBGM("bgm");
        requestAnimationFrame(this.gameLoop);
    }

    private setupInput(): void {
        document.addEventListener('keydown', (e) => {
            if (this.gameState === GameState.Title && e.key === ' ') {
                this.startGame();
                return;
            }
            if (this.player && this.player.isAlive && this.gameState === GameState.Playing) {
                this.player.handleKeyDown(e.key);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.player) {
                this.player.handleKeyUp(e.key);
            }
        });
    }

    startGame(): void {
        this.gameState = GameState.Playing;
        this.playedEndSound = false; // Reset for new game
        this.initializeGameWorld();
    }

    initializeGameWorld(): void {
        this.map = this.generateMap();
        this.bombs = [];
        this.explosions = [];
        this.items = [];

        this.player = new Player(this.settings.tileSize, this.settings.tileSize, this.settings);
        this.map[this.player.gridY][this.player.gridX] = TileType.Empty;

        this.enemies = [];
        const spawnPoints = this.getEnemySpawnPoints(this.map);
        for (let i = 0; i < this.settings.enemyCount; i++) {
            if (spawnPoints.length > 0) {
                const spawnIndex = Math.floor(Math.random() * spawnPoints.length);
                const spawn = spawnPoints.splice(spawnIndex, 1)[0];
                const enemy = new Enemy(spawn.gx * this.settings.tileSize, spawn.gy * this.settings.tileSize, this.settings);
                this.enemies.push(enemy);
                this.map[spawn.gy][spawn.gx] = TileType.Empty;
            }
        }
    }

    private getEnemySpawnPoints(map: TileType[][]): { gx: number, gy: number }[] {
        const spawnPoints: { gx: number, gy: number }[] = [];
        const occupiedTiles = new Set<string>();
        occupiedTiles.add(`${this.player.gridX},${this.player.gridY}`); // Player spawn

        const candidates = [
            { gx: this.mapWidthTiles - 2, gy: 1 },
            { gx: 1, gy: this.mapHeightTiles - 2 },
            { gx: this.mapWidthTiles - 2, gy: this.mapHeightTiles - 2 },
            { gx: Math.floor(this.mapWidthTiles / 2), gy: 1 },
            { gx: 1, gy: Math.floor(this.mapHeightTiles / 2) }
        ];

        for (const p of candidates) {
            if (p.gx > 0 && p.gx < this.mapWidthTiles - 1 && p.gy > 0 && p.gy < this.mapHeightTiles - 1) {
                const key = `${p.gx},${p.gy}`;
                // Use current game map for walkability check
                if (!occupiedTiles.has(key) && this.isWalkable(p.gx, p.gy, this.map)) {
                    spawnPoints.push(p);
                    occupiedTiles.add(key);
                }
            }
        }
        return spawnPoints;
    }

    private gameLoop = (time: number): void => {
        if (this.lastTime === 0) this.lastTime = time;
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop);
    }

    private update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.Title:
                break;
            case GameState.Playing:
                this.updatePlaying(deltaTime);
                break;
            case GameState.GameOver:
            case GameState.Victory:
                break;
        }
    }

    private updatePlaying(deltaTime: number): void {
        this.player.update(deltaTime, this);
        this.enemies.forEach(enemy => enemy.update(deltaTime, this));

        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            bomb.update(deltaTime, this);
            if (!bomb.isAlive) {
                // Only reset the tile if it's currently a bomb tile (avoid clearing player/enemy etc if they are on it)
                if (this.getTileAt(bomb.gx, bomb.gy) === TileType.Bomb) {
                    this.map[bomb.gy][bomb.gx] = TileType.Empty;
                }
                this.bombs.splice(i, 1);
            }
        }

        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            explosion.update(deltaTime, this);
            if (!explosion.isAlive) {
                this.explosions.splice(i, 1);
            }
        }

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            item.update(deltaTime, this);
            
            if (this.player.isAlive && this.checkCollision(this.player, item)) {
                this.player.collectItem(item, this);
                item.isAlive = false;
            }

            if (!item.isAlive) {
                this.items.splice(i, 1);
            }
        }

        const allCharacters = [this.player, ...this.enemies];
        for (const char of allCharacters) {
            if (!char.isAlive) continue;

            const charGridX = char.gridX;
            const charGridY = char.gridY;

            for (const explosion of this.explosions) {
                if (charGridX === explosion.gx && charGridY === explosion.gy) {
                    char.takeDamage(this);
                    break;
                }
            }
        }
        
        this.enemies = this.enemies.filter(enemy => enemy.isAlive);
        this.checkWinCondition();
    }

    private render(): void {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        switch (this.gameState) {
            case GameState.Title:
                this.renderTitleScreen();
                break;
            case GameState.Playing:
                this.renderPlayingScreen();
                break;
            case GameState.GameOver:
            case GameState.Victory:
                break;
        }
    }

    private renderTitleScreen(): void {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = '48px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(this.settings.titleScreenText, canvas.width / 2, canvas.height / 2 - 50);

        ctx.font = '24px Arial';
        ctx.fillText(this.settings.pressKeyToStartText, canvas.width / 2, canvas.height / 2 + 20);
    }

    private renderPlayingScreen(): void {
        const tileSize = this.settings.tileSize;

        for (let y = 0; y < this.mapHeightTiles; y++) {
            for (let x = 0; x < this.mapWidthTiles; x++) {
                const tileType = this.map[y][x];
                let imageName: string | undefined;
                if (tileType === TileType.Wall) {
                    imageName = 'wall';
                } else if (tileType === TileType.Block) {
                    imageName = 'block';
                } else {
                    imageName = 'empty_tile'; // Explicitly draw a base empty tile
                }
                
                const image = this.assets.getImage(imageName);
                if (image) {
                    ctx.drawImage(image, x * tileSize, y * tileSize, tileSize, tileSize);
                } else if (imageName === 'empty_tile') {
                    ctx.fillStyle = '#4CAF50'; // Green for empty tiles
                    ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }

        this.items.forEach(item => item.draw(ctx, this.assets, tileSize));
        this.bombs.forEach(bomb => bomb.draw(ctx, this.assets, tileSize));
        this.explosions.forEach(explosion => explosion.draw(ctx, this.assets, tileSize));
        this.player.draw(ctx, this.assets, tileSize);
        this.enemies.forEach(enemy => enemy.draw(ctx, this.assets, tileSize));

        // Display player's water balloon count (maxBombs) in the top right
        if (this.player.isAlive) {
            const text = `Water Balloons: ${this.player.maxBombs}`;
            const fontSize = 24;
            ctx.font = `${fontSize}px Arial`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'right';

            // Measure text width to position icon correctly
            const textWidth = ctx.measureText(text).width;

            const padding = 10;
            const textX = canvas.width - padding; // 10px from right edge
            const textY = padding + fontSize; // 10px from top, adjusted for font size

            ctx.fillText(text, textX, textY);

            // Draw an icon for the water balloon item
            const iconImage = this.assets.getImage(ItemType.WaterBalloonUp);
            if (iconImage) {
                const iconSize = 24; // Make icon size match font size for visual consistency
                // Position icon to the left of the text, with some spacing
                const iconX = textX - textWidth - iconSize - padding / 2;
                const iconY = padding + (fontSize - iconSize) / 2 + 2; // Adjust Y to visually align with text baseline
                ctx.drawImage(iconImage, iconX, iconY, iconSize, iconSize);
            }
            ctx.textAlign = 'left'; // Reset to default for other rendering if necessary
        }
    }

    private renderEndScreen(message: string, soundName: string): void {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = '60px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);

        this.soundPlayer.stopBGM();
        // Play sound only once when entering end screen
        if (!this.playedEndSound) {
            this.soundPlayer.play(soundName);
            this.playedEndSound = true;
        }
    }

    public worldToGrid(x: number, y: number): { gx: number; gy: number } {
        return {
            gx: Math.floor(x / this.settings.tileSize),
            gy: Math.floor(y / this.settings.tileSize)
        };
    }

    public gridToWorld(gx: number, gy: number): { x: number; y: number } {
        return {
            x: gx * this.settings.tileSize,
            y: gy * this.settings.tileSize
        };
    }

    // Modified to accept an optional map for simulation
    public getTileAt(gx: number, gy: number, currentMap?: TileType[][]): TileType {
        const mapToUse = currentMap || this.map;
        if (gx < 0 || gx >= this.mapWidthTiles || gy < 0 || gy >= this.mapHeightTiles) {
            return TileType.Wall;
        }
        return mapToUse[gy][gx];
    }

    // Modified to accept an optional map for simulation
    public isWalkable(gx: number, gy: number, currentMap?: TileType[][]): boolean {
        const mapToUse = currentMap || this.map;
        const tile = this.getTileAt(gx, gy, mapToUse);
        return tile === TileType.Empty || tile === TileType.Bomb; // Characters can walk onto bombs
    }

    // Modified to accept optional map and bombs for simulation
    public isDangerZone(gx: number, gy: number, currentMap?: TileType[][], currentBombs?: Bomb[]): boolean {
        const mapToUse = currentMap || this.map;
        const bombsToUse = currentBombs || this.bombs;

        for (const bomb of bombsToUse) {
            // Consider bombs that are about to explode, but not already exploded.
            // A short buffer for `bomb.timer` might be added for predictive AI, but for now, any active bomb is considered.
            if (!bomb.isAlive) continue;

            // Is the tile the center of an explosion?
            if (bomb.gx === gx && bomb.gy === gy) return true;

            // Is the tile in the horizontal blast radius?
            if (bomb.gy === gy) {
                const minX = Math.min(bomb.gx, gx);
                const maxX = Math.max(bomb.gx, gx);
                if (maxX - minX <= bomb.range) {
                    let blocked = false;
                    for (let x = minX + 1; x < maxX; x++) {
                        if (this.getTileAt(x, gy, mapToUse) === TileType.Wall) { // Use mapToUse
                            blocked = true;
                            break;
                        }
                    }
                    if (!blocked) return true;
                }
            }

            // Is the tile in the vertical blast radius?
            if (bomb.gx === gx) {
                const minY = Math.min(bomb.gy, gy);
                const maxY = Math.max(bomb.gy, gy);
                if (maxY - minY <= bomb.range) {
                    let blocked = false;
                    for (let y = minY + 1; y < maxY; y++) {
                        if (this.getTileAt(gx, y, mapToUse) === TileType.Wall) { // Use mapToUse
                            blocked = true;
                            break;
                        }
                    }
                    if (!blocked) return true;
                }
            }
        }
        return false;
    }

    public findPath(start: { gx: number, gy: number }, end: { gx: number, gy: number }, isWalkableFn: (gx: number, gy: number) => boolean): { gx: number, gy: number }[] {
        if (!isWalkableFn(end.gx, end.gy) && !(end.gx === start.gx && end.gy === start.gy && this.getTileAt(end.gx, end.gy) === TileType.Empty)) return [];

        const queue: { gx: number, gy: number, path: { gx: number, gy: number }[] }[] = [];
        const visited: Set<string> = new Set();
        
        queue.push({ gx: start.gx, gy: start.gy, path: [] });
        visited.add(`${start.gx},${start.gy}`);

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

        while (queue.length > 0) {
            const { gx, gy, path } = queue.shift()!;

            if (gx === end.gx && gy === end.gy) {
                return path;
            }

            for (const dir of directions) {
                const nextX = gx + dir.dx;
                const nextY = gy + dir.dy;
                const nextKey = `${nextX},${nextY}`;

                if (nextX >= 0 && nextX < this.mapWidthTiles && nextY >= 0 && nextY < this.mapHeightTiles && !visited.has(nextKey)) {
                    // Check if the next tile is walkable *or* if it's the specific end target (even if the end target isn't technically 'walkable' like a block)
                    if (isWalkableFn(nextX, nextY) || (nextX === end.gx && nextY === end.gy && this.getTileAt(nextX, nextY) === TileType.Block)) {
                        visited.add(nextKey);
                        queue.push({ gx: nextX, gy: nextY, path: [...path, { gx: nextX, gy: nextY }] });
                    }
                }
            }
        }
        return [];
    }

    // --- New methods added to the Game class ---

    public dropBomb(owner: Character, gx: number, gy: number): void {
        const newBomb = new Bomb(gx, gy, owner, this.settings.tileSize, this.settings.bombTimer);
        this.bombs.push(newBomb);
        this.map[gy][gx] = TileType.Bomb;
    }

    public explodeBomb(bomb: Bomb): void {
        this.soundPlayer.play("explosion");

        const tilesToExplode: { gx: number, gy: number }[] = [];
        tilesToExplode.push({ gx: bomb.gx, gy: bomb.gy }); // Center of explosion

        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

        for (const dir of directions) {
            for (let i = 1; i <= bomb.range; i++) {
                const targetX = bomb.gx + dir.dx * i;
                const targetY = bomb.gy + dir.dy * i;

                const tileType = this.getTileAt(targetX, targetY);

                if (tileType === TileType.Wall) {
                    break; // Wall blocks explosion
                }

                tilesToExplode.push({ gx: targetX, gy: targetY });

                if (tileType === TileType.Block) {
                    break; // Block stops explosion after hitting it
                }
            }
        }

        // Apply explosion effects
        for (const tile of tilesToExplode) {
            this.explosions.push(new Explosion(tile.gx, tile.gy, this.settings.tileSize, this.settings.explosionDuration));
            const currentTileType = this.getTileAt(tile.gx, tile.gy);

            if (currentTileType === TileType.Block) {
                this.map[tile.gy][tile.gx] = TileType.Empty;
                this.dropItem(tile.gx, tile.gy); // Chance to drop an item
            } else if (currentTileType === TileType.Bomb) {
                // Trigger chain reaction: find the bomb at this location and set its timer to 0
                const hitBomb = this.bombs.find(b => b.gx === tile.gx && b.gy === tile.gy && b.isAlive);
                if (hitBomb && hitBomb !== bomb) { // Ensure it's a different bomb
                    hitBomb.timer = 0; // Will explode on its next update
                }
            }
        }
    }

    private dropItem(gx: number, gy: number): void {
        if (Math.random() < this.settings.blockDropRate) {
            let totalRate = 0;
            for (const itemType in this.itemDropRates) {
                totalRate += this.itemDropRates[itemType];
            }

            let randomValue = Math.random() * totalRate;
            let currentSum = 0;

            for (const itemTypeString in this.itemDropRates) {
                const rate = this.itemDropRates[itemTypeString];
                currentSum += rate;
                if (randomValue <= currentSum) {
                    if (itemTypeString !== "no_item") {
                        const itemType = ItemType[itemTypeString as keyof typeof ItemType];
                        this.items.push(new Item(gx, gy, itemType, this.settings.tileSize, this.settings.itemLifespan));
                    }
                    return;
                }
            }
        }
    }

    private generateMap(): TileType[][] {
        const map: TileType[][] = [];

        // Initialize map with empty tiles
        for (let y = 0; y < this.mapHeightTiles; y++) {
            map[y] = [];
            for (let x = 0; x < this.mapWidthTiles; x++) {
                map[y][x] = TileType.Empty;
            }
        }

        // Place outer walls
        for (let x = 0; x < this.mapWidthTiles; x++) {
            map[0][x] = TileType.Wall;
            map[this.mapHeightTiles - 1][x] = TileType.Wall;
        }
        for (let y = 0; y < this.mapHeightTiles; y++) {
            map[y][0] = TileType.Wall;
            map[y][this.mapWidthTiles - 1] = TileType.Wall;
        }

        // Place internal solid walls (every other tile)
        for (let y = 2; y < this.mapHeightTiles - 1; y += 2) {
            for (let x = 2; x < this.mapWidthTiles - 1; x += 2) {
                map[y][x] = TileType.Wall;
            }
        }

        // Place destructible blocks randomly
        const playerStartX = 1;
        const playerStartY = 1;

        for (let y = 1; y < this.mapHeightTiles - 1; y++) {
            for (let x = 1; x < this.mapWidthTiles - 1; x++) {
                if (map[y][x] === TileType.Empty) { // Only consider empty tiles not already walls
                    // Define a 3x3 safe zone around player start (1,1)
                    const isPlayerSafeZone = (
                        (x >= playerStartX - 1 && x <= playerStartX + 1) &&
                        (y >= playerStartY - 1 && y <= playerStartY + 1)
                    );
                    
                    if (!isPlayerSafeZone && Math.random() < 0.7) { // 70% chance to place a block outside safe zone
                        map[y][x] = TileType.Block;
                    }
                }
            }
        }
        return map;
    }

    public checkCollision(obj1: GameObject, obj2: GameObject): boolean {
        return obj1.x < obj2.x + obj2.width &&
               obj1.x + obj1.width > obj2.x &&
               obj1.y < obj2.y + obj2.height &&
               obj1.y + obj1.height > obj2.y;
    }

    private checkWinCondition(): void {
        if (this.gameState !== GameState.Playing) return;

        if (!this.player.isAlive) {
            this.gameState = GameState.GameOver;
            this.soundPlayer.stopBGM();
            this.playedEndSound = false; // Reset to play sound on next render
        } else if (this.enemies.length === 0) {
            this.gameState = GameState.Victory;
            this.soundPlayer.stopBGM();
            this.playedEndSound = false; // Reset to play sound on next render
        }
    }
}

window.onload = async () => {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d')!;
    if (!ctx) {
        console.error("Failed to get 2D rendering context for canvas.");
        return;
    }

    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const gameData: GameData = await response.json();

        game = new Game(gameData);
        await game.init();
    } catch (error) {
        console.error('Failed to load game data or initialize game:', error);
    }
};