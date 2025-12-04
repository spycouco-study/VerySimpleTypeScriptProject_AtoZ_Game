// Global game variables
// ... (existing global variables)
// NEW: Declarations added to resolve TS2304 errors

// Define GameState enum
enum GameState {
    TITLE,
    PLAYING,
    LEVEL_UP,
    GAME_OVER,
}

// Declare global game state variables
let gameState: GameState = GameState.TITLE;
let gameData: GameData; // This will be assigned after data.json is loaded
let gameTimer: number = 0;

// Declare canvas and context (assuming they are initialized elsewhere, e.g., in an init function)
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let titleScreenBlinkVisibility: boolean = true;
let titleScreenBlinkTimer: number = 0; // Will accumulate deltaTime when in TITLE state

// Define types for game data and entities
interface GameData {
    canvas: {
        width: number;
        height: number;
        mapWidth: number; // NEW: Total width of the playable map area
        mapHeight: number; // NEW: Total height of the playable map area
        backgroundImage: string; // NEW: Asset name for the game background image
    };
    player: {
        speed: number;
        maxHealth: number;
        baseDamage: number;
        attackCooldown: number; // in seconds
        projectileSpeed: number; // pixels per second
        projectileLifetime: number; // in seconds
        assetName: string;
        weaponAsset: string;
        expGemAttractRadius: number;
        playerDrawWidth: number; // NEW: Drawing width for the player sprite
        playerDrawHeight: number; // NEW: Drawing height for the player sprite
        baseNumberOfAttacks: number; // Initial number of projectiles fired per attack
        attackSpreadAngle: number; // Total spread angle in degrees for multiple projectiles
        specialAttackBaseFireRate: number; // NEW: How often special attack fires when active
    };
    enemies: Array<{
        name: string;
        assetName: string;
        maxHealth: number;
        speed: number;
        damage: number; // Damage per second when colliding with player
        expReward: number;
        spawnRateWeight: number; // For weighted random spawning
        size: number; // Drawing size for the enemy sprite (also used for collision)
    }>;
    projectiles: {
        assetName: string;
        size: number; // Drawing size for the projectile sprite (also used for collision)
    };
    experienceGems: {
        assetName: string;
        baseValue: number;
        size: number; // Drawing size for the gem sprite (also used for collision)
        totalLifetime: number; // ADDED: Total time an experience gem will exist before despawning
        blinkThresholdSeconds: number; // ADDED: Time remaining when gem starts to blink
        blinkFrequency: number; // ADDED: How many times per second the gem blinks when below threshold
    };
    items: Array<{ // NEW: Item definitions
        name: string;
        assetName: string;
        size: number;
        effectDuration: number; // Duration of the item's effect once collected (seconds)
        effectValue: number;    // Specific value for the effect (e.g., bonus attract radius, num projectiles, heal amount)
        spawnRateWeight: number; // For weighted random spawning
        totalLifetime: number; // How long item exists on map before despawning
    }>;
    gameplay: {
        baseEnemySpawnInterval: number; // in seconds - RENAMED
        spawnIntervalReductionFactorPerLevel: number; // NEW: Multiplier to reduce spawn interval per level (e.g., 0.98 for 2% faster)
        minEnemySpawnInterval: number; // NEW: Minimum possible spawn interval
        initialEnemyCount: number;
        baseMaxEnemies: number; // RENAMED
        maxEnemiesIncreasePerLevel: number; // NEW: How many max enemies increase per player level
        enemyHealthScalePerLevel: number; // NEW: Percentage increase in enemy health per player level
        enemySpeedScalePerLevel: number; // NEW: Percentage increase in enemy speed per player level
        enemyDamageScalePerLevel: number; // NEW: Percentage increase in enemy damage per level
        levelUpExpMultiplier: number; // How much next level exp increases
        attackSpeedIncreasePerLevel: number; // Percentage reduction in attack cooldown per level (e.g., 0.02 for 2%)
        itemDropChanceOnEnemyDefeat: number; // NEW: Chance for an item to drop when an enemy is defeated
        maxSimultaneousItems: number; // NEW: Max items on screen at once
    };
    ui: {
        font: string;
        textColor: string;
        gameTitleText: string; // NEW: Title text for the game's title screen
        titleScreenText: string;
        gameOverText: string;
        levelUpText: string;
        levelUpOptions: Array<{ name: string; description: string; effect: string }>;
        titleScreenImage: string; // NEW: Asset name for the title screen background image
        titleScreenBlinkFrequency?: number; // ADDED: How many times per second the title screen text blinks
        // NEW: Player Health Bar UI settings
        healthBar: {
            width: number;
            height: number;
            fillColor: string;
            backgroundColor: string;
            borderColor: string;
            labelColor: string;
            labelShadowColor: string;
            cornerRadius: number;
            labelYOffset: number;
        };
        // NEW: Player Experience Bar UI settings
        expBar: {
            width: number;
            height: number;
            fillColor: string;
            backgroundColor: string;
            borderColor: string;
            labelColor: string;
            labelShadowColor: string;
            cornerRadius: number;
            labelYOffset: number;
        };
        barLabelFont: string; // NEW: Font specifically for health/exp bar labels
    };
    assets: {
        images: Array<{ name: string; path: string; width: number; height: number }>;
        sounds: Array<{ name: string; path: string; duration_seconds: number; volume: number }>;
    };
    // NEW: Graphics settings, including shadow properties
    graphics: {
        shadowEnabled: boolean;
        shadowColor: string;
        shadowOffsetX: number;
        shadowOffsetY: number;
        shadowBlur: number;
    };
}

// NEW: Placeholder function declarations (these would be implemented fully in a complete game)
function updatePlayer(dt: number): void {}
function updateCamera(): void {}
function updateProjectiles(dt: number): void {}
function updateEnemies(dt: number): void {}
function updateExperienceGems(dt: number): void {}
function updateItems(dt: number): void {}
function checkCollisions(): void {}
function spawnEnemies(dt: number): void {}

function drawGameplay(): void {}
function drawUI(): void {}
function drawLevelUpScreen(): void {}
function drawGameOverScreen(): void {}
function drawSprite(assetName: string, x: number, y: number, width: number, height: number, useCamera: boolean, applyShadow: boolean): void {
    // Basic placeholder implementation for drawSprite or assume it's implemented elsewhere.
    // For compilation, an empty function is sufficient.
}
function drawTitleScreen(): void {
    // Draw the title screen image first, filling the entire canvas
    // It's not relative to the camera, and it doesn't need a shadow.
    const titleImageName = gameData.ui.titleScreenImage;
    if (titleImageName) {
        drawSprite(titleImageName, canvas.width / 2, canvas.height / 2, canvas.width, canvas.height, false, false);
    } else {
        // Fallback: clear the canvas if no title image is specified
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Overlay text
    ctx.textAlign = 'center';
    ctx.fillStyle = gameData.ui.textColor;
    ctx.font = `bold 48px ${gameData.ui.font}`;
    ctx.fillText(gameData.ui.gameTitleText, canvas.width / 2, canvas.height / 2 - 50);

    ctx.font = `24px ${gameData.ui.font}`;
    // Apply blinking logic for titleScreenText
    if (titleScreenBlinkVisibility) {
        // Position at the bottom of the screen (e.g., 70 pixels from bottom)
        ctx.fillText(gameData.ui.titleScreenText, canvas.width / 2, canvas.height - 70);
    }
}

// --- Update Logic ---
function update(dt: number): void {
    if (gameState === GameState.TITLE) {
        titleScreenBlinkTimer += dt;
        // Access blink frequency from gameData, default to 1Hz (1 blink per second) if not found
        const blinkFrequency = gameData.ui.titleScreenBlinkFrequency || 1;
        // Toggle visibility if half of the blink cycle duration has passed
        if (titleScreenBlinkTimer >= (1 / blinkFrequency) / 2) {
            titleScreenBlinkVisibility = !titleScreenBlinkVisibility;
            titleScreenBlinkTimer = 0; // Reset timer for the next half cycle
        }
    }
    
    if (gameState === GameState.PLAYING) {
        gameTimer += dt;
        updatePlayer(dt);
        updateCamera(); // NEW: Update camera after player movement
        updateProjectiles(dt);
        updateEnemies(dt);
        updateExperienceGems(dt);
        updateItems(dt); // NEW: Update items (e.g., despawn timer and attraction)
        checkCollisions();
        spawnEnemies(dt);
        // REMOVED: spawnItems(dt) function as items now drop from enemies
    }
    // Other states (LEVEL_UP, GAME_OVER) do not update game logic
}

// --- Rendering ---
function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (gameState) {
        case GameState.TITLE:
            drawTitleScreen();
            break;
        case GameState.PLAYING:
        case GameState.LEVEL_UP: // Show game in background during level up
            drawGameplay();
            drawUI();
            if (gameState === GameState.LEVEL_UP) {
                drawLevelUpScreen();
            }
            break;
        case GameState.GAME_OVER:
            drawGameplay(); // Show final game state
            drawGameOverScreen();
            break;
    }
}

// ... (rest of the code)