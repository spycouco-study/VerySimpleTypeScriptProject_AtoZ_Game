// 수정된 TypeScript 코드를 이곳에 넣으세요. 이 코드는 game.ts에 저장될 예정입니다.
// Enums for game states and item types
enum GameState {
    Village,
    Outside,
    OutsideNorth, // New: Map to the north of Outside
    OutsideWest,  // New: Map to the west of Outside
    OutsideEast   // New: Map to the east of Outside
}

enum ItemType {
    Potion,
    Sword
}

// Interfaces for external game data structure
interface AssetData {
    name: string;
    path: string;
}

interface PlayerStatsData {
    width: number;
    height: number;
    speed: number;
    health: number;
    maxHealth: number;
    attackDamage: number;
    attackRange: number;
}

interface EnemyStatsData {
    width: number;
    height: number;
    speed: number;
    health: number;
    maxHealth: number;
    attackDamage: number;
    attackRange: number;
    detectionRange: number;
    attackCooldown: number;
}

interface ItemTemplateData {
    width: number;
    height: number;
    imageName: string;
}

interface TileTypeData {
    image: string;
    collidable: boolean;
}

interface MapEntityData {
    type: "enemy" | "item";
    enemyType?: string; // Key for enemyTypes
    itemType?: string; // Key for itemTemplates
    xTile: number;
    yTile: number;
    value?: number; // Specific value for this item instance (e.g., potion heal amount)
}

interface MapTransitionData {
    targetState: string; // Corresponds to GameState enum string
    targetEntryPlayerPosition: { xTile: number; yTile: number }; // Modified: Renamed for clarity
    triggerArea: { yMinTile: number; yMaxTile: number; xMinTile: number; xMaxTile: number };
}

interface MapConfigData {
    layout: number[][];
    tileTypes: { [key: string]: TileTypeData };
    initialPlayerPosition: { xTile: number; yTile: number };
    transitions: MapTransitionData[]; // Modified: Changed to an array to support multiple transitions
    entities: MapEntityData[];
}

interface MapsGlobalData {
    tileWidth: number;
    tileHeight: number;
    village: MapConfigData;
    outside: MapConfigData;
    outsideNorth: MapConfigData; // New: Configuration for the map north of Outside
    outsideWest: MapConfigData;  // New: Configuration for the map west of Outside
    outsideEast: MapConfigData;  // New: Configuration for the map east of Outside
}

interface GameData {
    assets: AssetData[];
    playerData: PlayerStatsData;
    enemyTypes: { [key: string]: EnemyStatsData };
    itemTemplates: { [key: string]: ItemTemplateData };
    mapsData: MapsGlobalData;
}


// Interface for all game objects that can be drawn
interface GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void;
}

// Player Class: Handles player's state, movement, and actions
class Player implements GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    health: number;
    maxHealth: number;
    attackDamage: number;
    attackRange: number; // Pixels
    inventory: Item[] = [];
    image: HTMLImageElement;

    constructor(x: number, y: number, image: HTMLImageElement, playerData: PlayerStatsData) {
        this.x = x;
        this.y = y;
        this.image = image;
        this.width = playerData.width;
        this.height = playerData.height;
        this.speed = playerData.speed;
        this.health = playerData.health;
        this.maxHealth = playerData.maxHealth;
        this.attackDamage = playerData.attackDamage;
        this.attackRange = playerData.attackRange;
    }

    // Moves the player, checking for map boundaries, tile collisions, and enemy collisions
    move(dx: number, dy: number, mapWidth: number, mapHeight: number, collidableTiles: Tile[], enemies: Enemy[]) {
        const newX = this.x + dx * this.speed;
        const newY = this.y + dy * this.speed;

        // Map boundary collision
        if (newX < 0 || newX + this.width > mapWidth) return;
        if (newY < 0 || newY + this.height > mapHeight) return;

        const nextRect = { x: newX, y: newY, width: this.width, height: this.height };

        // Tile collision (Axis-Aligned Bounding Box)
        for (const tile of collidableTiles) {
            if (tile.collidable && this.checkCollision(nextRect, tile)) {
                return; // Prevent movement if collision detected
            }
        }

        // Enemy collision: Player cannot move through enemies
        for (const enemy of enemies) {
            if (enemy.isAlive && this.checkCollision(nextRect, enemy)) {
                return; // Prevent movement if collision detected
            }
        }

        this.x = newX;
        this.y = newY;
    }

    // Generic AABB collision detection
    checkCollision(rect1: { x: number, y: number, width: number, height: number }, rect2: { x: number, y: number, width: number, height: number }): boolean {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    // Draws the player sprite and health bar
    draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
        ctx.drawImage(this.image, this.x - cameraX, this.y - cameraY, this.width, this.height);
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - cameraX, this.y - cameraY - 10, this.width, 5);
        ctx.fillStyle = 'lime';
        ctx.fillRect(this.x - cameraX, this.y - cameraY - 10, this.width * (this.health / this.maxHealth), 5);
    }

    // Applies damage to the player
    takeDamage(amount: number) {
        this.health -= amount;
        // Ensure health doesn't go below 0
        if (this.health < 0) {
            this.health = 0;
        }
        // Game over logic is handled by the Game class.
    }

    // Heals the player
    heal(amount: number) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }
}

// Enemy Class: Manages enemy state, movement, and attacks
class Enemy implements GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    health: number;
    maxHealth: number;
    attackDamage: number;
    attackRange: number;
    detectionRange: number;
    image: HTMLImageElement;
    isAlive: boolean = true;
    lastAttackTime: number = 0;
    attackCooldown: number; // 1 second

    constructor(x: number, y: number, image: HTMLImageElement, enemyData: EnemyStatsData) {
        this.x = x;
        this.y = y;
        this.image = image;
        this.width = enemyData.width;
        this.height = enemyData.height;
        this.speed = enemyData.speed;
        this.health = enemyData.health;
        this.maxHealth = enemyData.maxHealth;
        this.attackDamage = enemyData.attackDamage;
        this.attackRange = enemyData.attackRange;
        this.detectionRange = enemyData.detectionRange;
        this.attackCooldown = enemyData.attackCooldown;
    }

    // Generic AABB collision detection (copied from Player for simplicity)
    checkCollision(rect1: { x: number, y: number, width: number, height: number }, rect2: { x: number, y: number, width: number, height: number }): boolean {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    // Updates enemy logic (movement towards player, attacking)
    update(player: Player, deltaTime: number, mapCollidableTiles: Tile[], activeEnemies: Enemy[]) { // Added mapCollidableTiles and activeEnemies for enemy collision
        if (!this.isAlive) return;

        const distanceToPlayer = Math.sqrt(Math.pow(player.x - this.x, 2) + Math.pow(player.y - this.y, 2));

        if (distanceToPlayer < this.detectionRange) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const moveStepX = Math.cos(angle) * this.speed;
            const moveStepY = Math.sin(angle) * this.speed;

            let newX = this.x + moveStepX;
            let newY = this.y + moveStepY;

            // --- Collision detection and resolution for Player, Tiles, and Other Enemies ---

            // Test X movement
            let canMoveX = true;
            let testRectX = { x: newX, y: this.y, width: this.width, height: this.height };
            
            // Check collision with player
            if (this.checkCollision(testRectX, player)) {
                canMoveX = false;
            }
            // Check collision with collidable tiles
            for (const tile of mapCollidableTiles) {
                if (tile.collidable && this.checkCollision(testRectX, tile)) {
                    canMoveX = false;
                    break;
                }
            }
            // Check collision with other enemies
            for (const otherEnemy of activeEnemies) {
                if (otherEnemy !== this && otherEnemy.isAlive && this.checkCollision(testRectX, otherEnemy)) {
                    canMoveX = false;
                    break;
                }
            }

            if (canMoveX) {
                this.x = newX;
            }

            // Test Y movement (using potentially updated this.x)
            let canMoveY = true;
            let testRectY = { x: this.x, y: newY, width: this.width, height: this.height };
            
            // Check collision with player
            if (this.checkCollision(testRectY, player)) {
                canMoveY = false;
            }
            // Check collision with collidable tiles
            for (const tile of mapCollidableTiles) {
                if (tile.collidable && this.checkCollision(testRectY, tile)) {
                    canMoveY = false;
                    break;
                }
            }
            // Check collision with other enemies
            for (const otherEnemy of activeEnemies) {
                if (otherEnemy !== this && otherEnemy.isAlive && this.checkCollision(testRectY, otherEnemy)) {
                    canMoveY = false;
                    break;
                }
            }
            if (canMoveY) {
                this.y = newY;
            }
            // --- End Collision detection and resolution ---

            // Attack player if within range (contact) and cooldown
            // Use the current distance. If enemy is halted by player, this counts as "contact".
            const currentDistanceToPlayer = Math.sqrt(Math.pow(player.x - this.x, 2) + Math.pow(player.y - this.y, 2));
            if (currentDistanceToPlayer < this.attackRange && (Date.now() - this.lastAttackTime > this.attackCooldown)) {
                player.takeDamage(this.attackDamage);
                this.lastAttackTime = Date.now();
            }
        }
    }

    // Draws the enemy sprite and health bar
    draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
        if (!this.isAlive) return;
        ctx.drawImage(this.image, this.x - cameraX, this.y - cameraY, this.width, this.height);
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - cameraX, this.y - cameraY - 10, this.width, 5);
        ctx.fillStyle = 'lime';
        ctx.fillRect(this.x - cameraX, this.y - cameraY - 10, this.width * (this.health / this.maxHealth), 5);
    }

    // Applies damage to the enemy
    takeDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            console.log("Enemy defeated!");
        }
    }
}

// Item Class: Represents collectible items in the game
class Item implements GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    type: ItemType;
    image: HTMLImageElement;
    isPickedUp: boolean = false;
    value: number; // e.g., heal amount for potion, damage boost for sword

    constructor(x: number, y: number, type: ItemType, image: HTMLImageElement, itemTemplate: ItemTemplateData, value: number) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.image = image;
        this.width = itemTemplate.width;
        this.height = itemTemplate.height;
        this.value = value;
    }

    // Draws the item if it hasn't been picked up
    draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
        if (!this.isPickedUp) {
            ctx.drawImage(this.image, this.x - cameraX, this.y - cameraY, this.width, this.height);
        }
    }

    // Applies the item's effect to the player
    use(player: Player) {
        switch (this.type) {
            case ItemType.Potion:
                player.heal(this.value);
                break;
            case ItemType.Sword:
                player.attackDamage += this.value;
                player.inventory.push(this); // Add to inventory for permanent effects
                break;
        }
        this.isPickedUp = true; // Mark as picked up
    }
}

// Tile Class: Represents a single tile on the map
class Tile {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
    collidable: boolean; // True if players/enemies cannot pass through

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement, collidable: boolean = false) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.image = image;
        this.collidable = collidable;
    }

    // Draws the tile
    draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
        ctx.drawImage(this.image, this.x - cameraX, this.y - cameraY, this.width, this.height);
    }
}

// AssetManager Class: Loads and manages all game images
class AssetManager {
    images: { [key: string]: HTMLImageElement } = {};
    assetsToLoad: AssetData[];
    loadedAssets: number = 0;
    totalAssets: number = 0;

    constructor(assetList: AssetData[]) {
        this.assetsToLoad = assetList;
        this.totalAssets = assetList.length;
    }

    // Loads all assets and calls a callback when complete
    loadAll(callback: () => void) {
        if (this.totalAssets === 0) {
            callback();
            return;
        }

        for (const asset of this.assetsToLoad) {
            const img = new Image();
            img.onload = () => {
                this.loadedAssets++;
                if (this.loadedAssets === this.totalAssets) {
                    callback();
                }
            };
            img.onerror = () => {
                console.error(`Failed to load asset: ${asset.path}`);
                this.loadedAssets++; // Still count as loaded to avoid blocking
                if (this.loadedAssets === this.totalAssets) {
                    callback();
                }
            };
            img.src = asset.path;
            this.images[asset.name] = img;
        }
    }

    // Retrieves a loaded image by its name
    getImage(name: string): HTMLImageElement {
        const img = this.images[name];
        if (!img) {
            console.error(`Image with name '${name}' not found. Make sure it's loaded.`);
            // Return a placeholder or throw an error to prevent crashes.
            // For now, returning an empty Image element, but a default error image would be better.
            return new Image(); 
        }
        return img;
    }
}

// GameMap Class: Defines and loads different game areas (village, outside)
class GameMap {
    tileWidth: number;
    tileHeight: number;
    currentMapDataLayout: number[][] = [];
    tiles: Tile[] = [];
    width: number = 0;
    height: number = 0;
    assetManager: AssetManager;
    mapsGlobalData: MapsGlobalData;
    currentMapConfig: MapConfigData | null = null; // Store current map config for easy access

    constructor(assetManager: AssetManager, mapsGlobalData: MapsGlobalData) {
        this.assetManager = assetManager;
        this.mapsGlobalData = mapsGlobalData;
        this.tileWidth = mapsGlobalData.tileWidth;
        this.tileHeight = mapsGlobalData.tileHeight;
    }

    // Loads tiles for the current game state
    loadMap(state: GameState) {
        this.tiles = []; // Clear existing tiles
        let mapConfig: MapConfigData;

        // Map GameState enum to the correct map configuration in mapsGlobalData
        if (state === GameState.Village) {
            mapConfig = this.mapsGlobalData.village;
        } else if (state === GameState.Outside) { // Existing Outside
            mapConfig = this.mapsGlobalData.outside;
        } else if (state === GameState.OutsideNorth) { // New OutsideNorth
            mapConfig = this.mapsGlobalData.outsideNorth;
        } else if (state === GameState.OutsideWest) {  // New OutsideWest
            mapConfig = this.mapsGlobalData.outsideWest;
        } else if (state === GameState.OutsideEast) {  // New OutsideEast
            mapConfig = this.mapsGlobalData.outsideEast;
        }
        else { 
            console.error(`Attempted to load map for unknown GameState: ${GameState[state]}`);
            return;
        }
        this.currentMapConfig = mapConfig; // Store the active map config
        this.currentMapDataLayout = mapConfig.layout;

        this.width = this.currentMapDataLayout[0].length * this.tileWidth;
        this.height = this.currentMapDataLayout.length * this.tileHeight;

        for (let row = 0; row < this.currentMapDataLayout.length; row++) {
            for (let col = 0; col < this.currentMapDataLayout[row].length; col++) {
                const tileTypeID = this.currentMapDataLayout[row][col];
                const tileData = mapConfig.tileTypes[tileTypeID.toString()];

                let image: HTMLImageElement;
                let collidable: boolean;

                if (tileData) {
                    image = this.assetManager.getImage(tileData.image);
                    collidable = tileData.collidable;
                } else {
                    console.warn(`No tile data found for type ID: ${tileTypeID} in map ${GameState[state]}. Using default grass tile.`);
                    image = this.assetManager.getImage('tile_village_grass'); // Fallback to a generic grass tile
                    collidable = false;
                }
                
                this.tiles.push(new Tile(col * this.tileWidth, row * this.tileHeight, this.tileWidth, this.tileHeight, image, collidable));
            }
        }
    }

    // Returns a list of all collidable tiles on the current map
    getCollidableTiles(): Tile[] {
        return this.tiles.filter(tile => tile.collidable);
    }

    // Draws all tiles on the current map
    draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
        for (const tile of this.tiles) {
            tile.draw(ctx, cameraX, cameraY);
        }
    }

    // Provides access to the current map's configuration data
    getCurrentMapConfig(): MapConfigData {
        if (!this.currentMapConfig) {
            throw new Error("Map has not been loaded yet.");
        }
        return this.currentMapConfig;
    }
}

// Main Game Class: Orchestrates all game logic and rendering
class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D; // Corrected type here
    player!: Player;
    enemies: Enemy[] = [];
    items: Item[] = [];
    map!: GameMap;
    assetManager!: AssetManager; // Initialized after gameData is loaded
    gameData!: GameData; // To hold the loaded data
    currentGameState: GameState = GameState.Village;
    keysPressed: { [key: string]: boolean } = {};
    lastUpdateTime: number = 0;
    cameraX: number = 0;
    cameraY: number = 0;
    isGameOver: boolean = false; // New property for game over state

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D; 
        this.canvas.width = 800; // Fixed canvas size
        this.canvas.height = 600;

        this.initInput();
    }

    // Initializes the game, loads assets, and starts the game loop
    async start() {
        // 1. Load game data JSON
        await this.loadGameData('data.json'); 
        console.log("Game data loaded.");

        // 2. Initialize AssetManager with assets from loaded data
        this.assetManager = new AssetManager(this.gameData.assets);
        await new Promise<void>(resolve => this.assetManager.loadAll(resolve));
        console.log("All assets loaded.");

        // 3. Initialize game components using loaded data
        const initialVillagePos = this.gameData.mapsData.village.initialPlayerPosition;
        const tileWidth = this.gameData.mapsData.tileWidth;
        const tileHeight = this.gameData.mapsData.tileHeight;

        this.player = new Player(
            initialVillagePos.xTile * tileWidth,
            initialVillagePos.yTile * tileHeight,
            this.assetManager.getImage('player'),
            this.gameData.playerData
        );
        this.map = new GameMap(this.assetManager, this.gameData.mapsData);
        this.changeState(GameState.Village); // Start in the village, which will also populate entities

        this.lastUpdateTime = performance.now();
        requestAnimationFrame(() => this.gameLoop());
    }

    // Fetches and parses game data from a JSON file
    async loadGameData(url: string): Promise<void> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.gameData = await response.json() as GameData;
        } catch (error) {
            console.error("Could not load game data:", error);
            // In a real game, you might display an error message and stop.
            throw error; 
        }
    }

    // Sets up keyboard input listeners
    initInput() {
        window.addEventListener('keydown', (e) => {
            this.keysPressed[e.key.toLowerCase()] = true; // Use toLowerCase for consistent key handling
            if (e.key === ' ') {
                if (!this.isGameOver) { // Only attack if not game over
                    this.handlePlayerAttack();
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keysPressed[e.key.toLowerCase()] = false;
        });
    }

    // Changes the current game area (Village or Outside)
    changeState(newState: GameState) {
        this.currentGameState = newState;

        let mapConfig: MapConfigData;
        if (newState === GameState.Village) {
            mapConfig = this.gameData.mapsData.village;
        } else if (newState === GameState.Outside) { // Existing Outside
            mapConfig = this.gameData.mapsData.outside;
        } else if (newState === GameState.OutsideNorth) { // New OutsideNorth
            mapConfig = this.gameData.mapsData.outsideNorth;
        } else if (newState === GameState.OutsideWest) {  // New OutsideWest
            mapConfig = this.gameData.mapsData.outsideWest;
        } else if (newState === GameState.OutsideEast) {  // New OutsideEast
            mapConfig = this.gameData.mapsData.outsideEast;
        } else {
            console.error(`Attempted to change to unknown GameState: ${GameState[newState]}`);
            return;
        }

        this.map.loadMap(newState); // Loads the tile layout and properties for the new map

        this.enemies = []; // Clear existing enemies and items
        this.items = [];

        // Populate entities (enemies, items) for the new area from game data
        for (const entityData of mapConfig.entities) {
            const x = entityData.xTile * this.map.tileWidth;
            const y = entityData.yTile * this.map.tileHeight;

            if (entityData.type === "enemy" && entityData.enemyType) {
                const enemyTemplate = this.gameData.enemyTypes[entityData.enemyType];
                if (enemyTemplate) {
                    this.enemies.push(new Enemy(x, y, this.assetManager.getImage('enemy'), enemyTemplate));
                } else {
                    console.warn(`Enemy template '${entityData.enemyType}' not found in gameData.enemyTypes.`);
                }
            } else if (entityData.type === "item" && entityData.itemType && entityData.value !== undefined) {
                const itemTemplate = this.gameData.itemTemplates[entityData.itemType];
                if (itemTemplate) {
                    let itemEnum: ItemType;
                    switch (entityData.itemType) {
                        case 'potion': itemEnum = ItemType.Potion; break;
                        case 'sword': itemEnum = ItemType.Sword; break;
                        default: console.warn(`Unknown item type: ${entityData.itemType}`); continue;
                    }
                    this.items.push(new Item(x, y, itemEnum, this.assetManager.getImage(itemTemplate.imageName), itemTemplate, entityData.value));
                } else {
                    console.warn(`Item template '${entityData.itemType}' not found in gameData.itemTemplates.`);
                }
            }
        }
        console.log(`Game state changed to: ${GameState[newState]}`);
    }

    // The main game loop: updates game logic and redraws the canvas
    gameLoop() {
        if (this.isGameOver) {
            this.draw(); // Still draw to show game over screen
            requestAnimationFrame(() => this.gameLoop()); // Keep loop running for restart prompt
            return; 
        }

        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(() => this.gameLoop());
    }

    // Updates all game logic: player movement, enemy behavior, item interactions, camera
    update(deltaTime: number) {
        let dx = 0;
        let dy = 0;
        if (this.keysPressed['w'] || this.keysPressed['arrowup']) dy -= 1;
        if (this.keysPressed['s'] || this.keysPressed['arrowdown']) dy += 1;
        if (this.keysPressed['a'] || this.keysPressed['arrowleft']) dx -= 1;
        if (this.keysPressed['d'] || this.keysPressed['arrowright']) dx += 1;

        const mapCollidableTiles = this.map.getCollidableTiles(); // Get collidable tiles once per frame

        if (dx !== 0 || dy !== 0) {
            // Normalize diagonal movement speed
            if (dx !== 0 && dy !== 0) {
                const magnitude = Math.sqrt(dx * dx + dy * dy);
                dx /= magnitude;
                dy /= magnitude;
            }
            // Pass enemies to player.move for collision detection
            this.player.move(dx, dy, this.map.width, this.map.height, mapCollidableTiles, this.enemies);
        }

        // Update enemies, removing defeated ones
        this.enemies = this.enemies.filter(enemy => enemy.isAlive);
        for (const enemy of this.enemies) {
            // Pass active enemies to enemy.update for enemy-enemy collision
            enemy.update(this.player, deltaTime, mapCollidableTiles, this.enemies); 
        }

        // Check for item pickup
        this.items = this.items.filter(item => {
            if (!item.isPickedUp && this.player.checkCollision(this.player, item)) {
                item.use(this.player);
                return false; // Remove item from map if picked up
            }
            return true;
        });

        // Area transition logic - MODIFIED TO SUPPORT MULTIPLE TRANSITIONS
        const currentMapConfig = this.map.getCurrentMapConfig();
        for (const transition of currentMapConfig.transitions) { // Iterate through all defined transitions
            const triggerArea = transition.triggerArea;
            const playerRect = { x: this.player.x, y: this.player.y, width: this.player.width, height: this.player.height };
            const triggerRect = {
                x: triggerArea.xMinTile * this.map.tileWidth,
                y: triggerArea.yMinTile * this.map.tileHeight,
                width: (triggerArea.xMaxTile - triggerArea.xMinTile) * this.map.tileWidth,
                height: (triggerArea.yMaxTile - triggerArea.yMinTile) * this.map.tileHeight
            };

            if (this.player.checkCollision(playerRect, triggerRect)) {
                let nextState: GameState;
                switch (transition.targetState) { // Use transition's targetState
                    case 'Village': nextState = GameState.Village; break;
                    case 'Outside': nextState = GameState.Outside; break;
                    case 'OutsideNorth': nextState = GameState.OutsideNorth; break; // New
                    case 'OutsideWest': nextState = GameState.OutsideWest; break;   // New
                    case 'OutsideEast': nextState = GameState.OutsideEast; break;   // New
                    default:
                        console.error(`Unknown target state: ${transition.targetState}`);
                        return;
                }
                
                // Set player's entry position for the new map immediately before changing state
                const entryPos = transition.targetEntryPlayerPosition; // Use transition's targetEntryPlayerPosition
                this.player.x = entryPos.xTile * this.map.tileWidth;
                this.player.y = entryPos.yTile * this.map.tileHeight;

                this.changeState(nextState);
                return; // Important: Exit update function after a transition to prevent multiple transitions or other updates in the same frame.
            }
        }

        // Game Over check: if player health drops to 0 or below
        if (this.player.health <= 0) {
            this.triggerGameOver();
            return; // Stop further updates once game over is triggered
        }

        // Camera follows player, clamped to map boundaries
        this.cameraX = this.player.x - this.canvas.width / 2 + this.player.width / 2;
        this.cameraY = this.player.y - this.canvas.height / 2 + this.player.height / 2;
        this.cameraX = Math.max(0, Math.min(this.cameraX, this.map.width - this.canvas.width));
        this.cameraY = Math.max(0, Math.min(this.cameraY, this.map.height - this.canvas.height));
    }

    // Draws all game elements on the canvas
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.map.draw(this.ctx, this.cameraX, this.cameraY);
        for (const item of this.items) {
            item.draw(this.ctx, this.cameraX, this.cameraY);
        }
        for (const enemy of this.enemies) {
            enemy.draw(this.ctx, this.cameraX, this.cameraY);
        }
        this.player.draw(this.ctx, this.cameraX, this.cameraY);

        this.drawUI();

        // Draw game over screen if applicable
        if (this.isGameOver) {
            this.drawGameOverScreen();
        }
    }

    // Draws the game's user interface (health, attack, area)
    drawUI() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Health: ${this.player.health}/${this.player.maxHealth}`, 10, 20);
        this.ctx.fillText(`Attack: ${this.player.attackDamage}`, 10, 40);
        this.ctx.fillText(`Area: ${GameState[this.currentGameState]}`, 10, 60);
    }

    // Handles player's attack action (Spacebar)
    handlePlayerAttack() {
        for (const enemy of this.enemies) {
            if (enemy.isAlive) {
                const distance = Math.sqrt(
                    Math.pow(this.player.x - enemy.x, 2) +
                    Math.pow(this.player.y - enemy.y, 2)
                );
                if (distance < this.player.attackRange) {
                    enemy.takeDamage(this.player.attackDamage);
                    console.log(`Player attacked enemy! Enemy health: ${enemy.health}`);
                }
            }
        }
    }

    // New method to handle game over state
    triggerGameOver() {
        this.isGameOver = true;
        console.log("Game Over! Player health reached 0.");
        // Add a restart listener
        window.addEventListener('keydown', this.handleRestart);
    }

    // Event handler for restarting the game
    handleRestart = (e: KeyboardEvent) => {
        if (e.key.toLowerCase() === 'r') {
            window.removeEventListener('keydown', this.handleRestart); // Remove listener to prevent multiple restarts
            this.restartGame();
        }
    };

    // Resets game state to restart
    restartGame() {
        this.isGameOver = false;
        // Reset player to initial state
        const initialVillagePos = this.gameData.mapsData.village.initialPlayerPosition;
        const tileWidth = this.gameData.mapsData.tileWidth;
        const tileHeight = this.gameData.mapsData.tileHeight;

        this.player = new Player(
            initialVillagePos.xTile * tileWidth,
            initialVillagePos.yTile * tileHeight,
            this.assetManager.getImage('player'),
            this.gameData.playerData // Re-initialize with original player stats
        );

        this.currentGameState = GameState.Village; // Reset to the initial map
        this.changeState(GameState.Village); // Reload the initial map and its entities
        this.lastUpdateTime = performance.now(); // Reset last update time for smooth game loop restart
        console.log("Game Restarted!");
    }

    // New method to draw the game over screen
    drawGameOverScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black overlay
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 20);

        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press R to Restart', this.canvas.width / 2, this.canvas.height / 2 + 30);
        
        this.ctx.textAlign = 'left'; // Reset text alignment for other UI elements
    }
}

// Global initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Ensure 'gameCanvas' element exists, create if not
    let gameCanvas = document.getElementById('gameCanvas');
    if (!gameCanvas) {
        gameCanvas = document.createElement('canvas');
        gameCanvas.id = 'gameCanvas';
        document.body.appendChild(gameCanvas);
    }

    // The assetList is now loaded from game_data.json
    const game = new Game('gameCanvas');
    game.start();
});