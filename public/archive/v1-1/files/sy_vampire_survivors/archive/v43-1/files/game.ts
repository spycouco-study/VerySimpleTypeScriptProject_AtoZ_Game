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
        // expBarWidth: number; // REMOVED: Moved to ui.expBar
        // expBarHeight: number; // REMOVED: Moved to ui.expBar
        // healthBarWidth: number; // REMOVED: Moved to ui.healthBar
        // healthBarHeight: number; // REMOVED: Moved to ui.healthBar
        // playerSize: number; // Drawing size for the player sprite - REMOVED
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
        effectValue: number;    // Specific value for the effect (e.g., bonus attract radius, num projectiles)
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
        baseItemSpawnInterval: number; // NEW: How often items attempt to spawn (seconds)
        minItemSpawnInterval: number; // NEW: Minimum interval
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

// Interfaces for game entities
interface GameObject {
    x: number;
    y: number;
    size: number; // Used for collision and for drawing other square objects
}

interface Player extends GameObject {
    dx: number;
    dy: number;
    health: number;
    maxHealth: number;
    speed: number;
    damage: number;
    attackCooldown: number;
    currentAttackCooldown: number;
    level: number;
    experience: number;
    nextLevelExp: number;
    assetName: string;
    weaponAsset: string;
    expGemAttractRadius: number; // Base attract radius
    drawWidth: number; // NEW: Specific width for drawing the player sprite
    drawHeight: number; // NEW: Specific height for drawing the player sprite
    numberOfAttacks: number; // NEW: Number of projectiles fired per attack

    // NEW: Item related properties
    currentMagnetAttractRadius: number; // Dynamically updated attract radius including magnet item effect
    magnetEffectTimer: number;          // Timer for magnet effect
    specialAttackEffectTimer: number;   // Timer for special attack effect
    isSpecialAttacking: boolean;        // Flag to indicate if special attack is active
    specialAttackFireCooldown: number; // For controlling radial attack fire rate
    specialAttackBaseFireRate: number; // For special attack fire rate in data.json
}

interface Enemy extends GameObject {
    id: number;
    health: number;
    maxHealth: number; // Keep max health for health bar drawing
    speed: number;
    damage: number;
    assetName: string;
    expReward: number;
}

interface Projectile extends GameObject {
    vx: number;
    vy: number;
    damage: number;
    lifetime: number; // in seconds
    assetName: string;
}

interface ExperienceGem extends GameObject {
    value: number;
    assetName: string;
    size: number;
    lifetime: number; // ADDED: Current remaining lifetime of the gem
}

// NEW: Interface for items that drop
interface Item extends GameObject {
    type: string; // e.g., "magnet", "special_attack"
    assetName: string;
    effectDuration: number; // total duration of the item's effect once collected
    effectValue: number;    // specific value for the effect (e.g., bonus attract radius, num projectiles)
    totalLifetime: number;  // How long item exists on map before despawning
    currentLifetime: number; // Remaining lifetime
}

interface LoadedAssets {
    images: Map<string, HTMLImageElement>;
    sounds: Map<string, HTMLAudioElement>;
}

// Enum for managing game states
enum GameState {
    TITLE = 'TITLE',
    PLAYING = 'PLAYING',
    LEVEL_UP = 'LEVEL_UP',
    GAME_OVER = 'GAME_OVER',
}

// Global game variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData;
let assets: LoadedAssets = { images: new Map(), sounds: new Map() };

let player: Player;
let enemies: Enemy[] = [];
let projectiles: Projectile[] = [];
let experienceGems: ExperienceGem[] = [];
let items: Item[] = []; // NEW: Array to hold spawned items

let gameState: GameState = GameState.TITLE;
let lastUpdateTime = 0;
let deltaTime = 0; // Time since last frame in seconds

let keysPressed: { [key: string]: boolean } = {};

let lastEnemySpawnTime = 0;
let lastItemSpawnTime = 0; // NEW: Timer for item spawning
let enemyIdCounter = 0;
let gameTimer = 0; // In seconds

let cameraX: number = 0; // NEW: X-coordinate of the camera's top-left corner in world space
let cameraY: number = 0; // NEW: Y-coordinate of the camera's top-left corner in world space

// NEW: Dynamic gameplay values based on player level
let currentEffectiveMaxEnemies: number;
let currentEffectiveEnemySpawnInterval: number;

// --- Asset Loading ---
async function loadGameData(): Promise<void> {
    try {
        const response = await fetch('data.json');
        gameData = await response.json();

        canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!canvas) {
            console.error('Canvas element with ID "gameCanvas" not found.');
            return;
        }
        ctx = canvas.getContext('2d')!;
        canvas.width = gameData.canvas.width;
        canvas.height = gameData.canvas.height;

        await loadAssets();
        initGame();
        gameLoop(0); // Start the game loop
    } catch (error) {
        console.error('Failed to load game data or assets:', error);
    }
}

async function loadAssets(): Promise<void> {
    const imagePromises = gameData.assets.images.map(img => {
        return new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = img.path;
            image.onload = () => {
                assets.images.set(img.name, image);
                resolve();
            };
            image.onerror = () => {
                console.error(`Failed to load image: ${img.path}`);
                reject(new Error(`Failed to load image: ${img.path}`));
            };
        });
    });

    const soundPromises = gameData.assets.sounds.map(snd => {
        return new Promise<void>((resolve, reject) => {
            const audio = new Audio();
            audio.src = snd.path;
            audio.volume = snd.volume;
            audio.oncanplaythrough = () => {
                assets.sounds.set(snd.name, audio);
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${snd.path}`);
                reject(new Error(`Failed to load sound: ${snd.path}`));
            };
        });
    });

    await Promise.all([...imagePromises, ...soundPromises]);
    console.log('All assets loaded.');
}

// --- Game Initialization ---
function initGame(): void {
    // Event Listeners for input
    window.addEventListener('keydown', (e) => {
        keysPressed[e.key.toLowerCase()] = true; // Use toLowerCase for case-insensitivity
        if (gameState === GameState.TITLE || gameState === GameState.GAME_OVER) {
            startNewGame();
        } else if (gameState === GameState.LEVEL_UP && e.key.toLowerCase() === ' ') { // Changed 'Enter' to 'Spacebar'
            // For simplicity, automatically apply the first level up option
            if (gameData.ui.levelUpOptions.length > 0) {
                applyLevelUpEffect(gameData.ui.levelUpOptions[0]);
            }
            gameState = GameState.PLAYING;
            playSound('level_up');
        }
    });
    window.addEventListener('keyup', (e) => {
        keysPressed[e.key.toLowerCase()] = false;
    });

    // Handle click for title screen / game over restart
    canvas.addEventListener('click', () => {
        if (gameState === GameState.TITLE || gameState === GameState.GAME_OVER) {
            startNewGame();
        }
    });

    // Initial setup for the game, starting in TITLE state
    gameState = GameState.TITLE;
}

function startNewGame(): void {
    // Reset player state
    player = {
        x: gameData.canvas.mapWidth / 2, // Player starts in the center of the *map*
        y: gameData.canvas.mapHeight / 2, // Player starts in the center of the *map*
        dx: 0,
        dy: 0,
        health: gameData.player.maxHealth,
        maxHealth: gameData.player.maxHealth,
        speed: gameData.player.speed,
        damage: gameData.player.baseDamage,
        attackCooldown: gameData.player.attackCooldown, // Start with base cooldown
        currentAttackCooldown: 0,
        level: 1,
        experience: 0,
        nextLevelExp: 100,
        assetName: gameData.player.assetName,
        weaponAsset: gameData.player.weaponAsset,
        expGemAttractRadius: gameData.player.expGemAttractRadius, // Base value
        // Calculate player collision size as an average or representative dimension
        // Using average of drawWidth and drawHeight to maintain a similar 'size' feel for collision
        size: (gameData.player.playerDrawWidth + gameData.player.playerDrawHeight) / 2, // For collision detection
        drawWidth: gameData.player.playerDrawWidth,   // For drawing the sprite
        drawHeight: gameData.player.playerDrawHeight, // For drawing the sprite
        numberOfAttacks: gameData.player.baseNumberOfAttacks, // Initial number of attacks

        // NEW: Item effect properties
        currentMagnetAttractRadius: gameData.player.expGemAttractRadius, // Start with base
        magnetEffectTimer: 0,
        specialAttackEffectTimer: 0,
        isSpecialAttacking: false,
        specialAttackFireCooldown: 0, // Ready to fire initially
        specialAttackBaseFireRate: gameData.player.specialAttackBaseFireRate,
    };

    // Clear entities
    enemies = [];
    projectiles = [];
    experienceGems = [];
    items = []; // NEW: Clear items

    // Reset game state variables
    lastEnemySpawnTime = 0;
    lastItemSpawnTime = 0; // NEW: Reset item spawn timer
    enemyIdCounter = 0;
    gameTimer = 0;

    // NEW: Initialize dynamic gameplay values based on data and starting level (level 1)
    currentEffectiveMaxEnemies = gameData.gameplay.baseMaxEnemies;
    currentEffectiveEnemySpawnInterval = gameData.gameplay.baseEnemySpawnInterval;

    // Initialize camera position based on player's starting position
    updateCamera();

    // Populate initial enemies (these do not scale with player level 1, as (player.level - 1) * scale is 0)
    for (let i = 0; i < gameData.gameplay.initialEnemyCount; i++) {
        spawnSingleEnemy(true); // Spawn initially within camera view, around player
    }

    stopAllSounds(); // Stop any previous BGM or SFX (including game over music)
    playBGM('bgm');
    gameState = GameState.PLAYING;
}

function stopAllSounds(): void {
    assets.sounds.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
}

function playBGM(name: string): void {
    const audio = assets.sounds.get(name);
    if (audio) {
        audio.loop = true;
        // Attempt to play, catch potential errors (e.g., user interaction required)
        audio.play().catch(e => console.warn("BGM playback failed (user interaction required):", e));
    }
}

function playSound(name: string): void {
    const audio = assets.sounds.get(name);
    if (audio) {
        // Clone the audio element to allow multiple simultaneous plays without cutting off previous ones
        const clonedAudio = audio.cloneNode() as HTMLAudioElement;
        clonedAudio.volume = audio.volume; // Retain original volume
        clonedAudio.play().catch(e => console.warn("SFX playback failed:", e));
    }
}

// --- Game Loop ---
function gameLoop(currentTime: DOMHighResTimeStamp): void {
    // Calculate deltaTime in seconds
    deltaTime = (currentTime - lastUpdateTime) / 1000;
    lastUpdateTime = currentTime;

    update(deltaTime);
    render();

    requestAnimationFrame(gameLoop);
}

// --- Update Logic ---
function update(dt: number): void {
    if (gameState === GameState.PLAYING) {
        gameTimer += dt;
        updatePlayer(dt);
        updateCamera(); // NEW: Update camera after player movement
        updateProjectiles(dt);
        updateEnemies(dt);
        updateExperienceGems(dt);
        updateItems(dt); // NEW: Update items (e.g., despawn timer)
        checkCollisions();
        spawnEnemies(dt);
        spawnItems(dt); // NEW: Spawn items
    }
    // Other states (TITLE, LEVEL_UP, GAME_OVER) do not update game logic
}

function updatePlayer(dt: number): void {
    player.dx = 0;
    player.dy = 0;

    // Movement input
    if (keysPressed['w'] || keysPressed['arrowup']) player.dy = -1;
    if (keysPressed['s'] || keysPressed['arrowdown']) player.dy = 1;
    if (keysPressed['a'] || keysPressed['arrowleft']) player.dx = -1;
    if (keysPressed['d'] || keysPressed['arrowright']) player.dx = 1;

    // Normalize diagonal movement speed
    if (player.dx !== 0 && player.dy !== 0) {
        const magnitude = Math.sqrt(player.dx * player.dx + player.dy * player.dy);
        player.dx /= magnitude;
        player.dy /= magnitude;
    }

    player.x += player.dx * player.speed * dt;
    player.y += player.dy * player.speed * dt;

    // Keep player within *map* bounds (not canvas bounds)
    // Using player.size for boundary checks, consistent with collision detection
    player.x = Math.max(player.size / 2, Math.min(gameData.canvas.mapWidth - player.size / 2, player.x));
    player.y = Math.max(player.size / 2, Math.min(gameData.canvas.mapHeight - player.size / 2, player.y));

    // NEW: Update item effect timers
    if (player.magnetEffectTimer > 0) {
        player.magnetEffectTimer -= dt;
        if (player.magnetEffectTimer <= 0) {
            player.magnetEffectTimer = 0;
            player.currentMagnetAttractRadius = gameData.player.expGemAttractRadius; // Reset to base
            console.log('Magnet effect ended.');
        }
    }

    if (player.specialAttackEffectTimer > 0) {
        player.specialAttackEffectTimer -= dt;
        if (player.specialAttackEffectTimer <= 0) {
            player.specialAttackEffectTimer = 0;
            player.isSpecialAttacking = false;
            player.specialAttackFireCooldown = 0; // Reset
            console.log('Special Attack effect ended.');
        } else {
            // Special attack is active, fire radial attacks
            player.specialAttackFireCooldown -= dt;
            if (player.specialAttackFireCooldown <= 0) {
                const numProjectiles = gameData.items.find(item => item.name === 'special_attack')?.effectValue || 15;
                fireRadialAttack(numProjectiles);
                playSound('shoot'); // Can be a different sound
                player.specialAttackFireCooldown = player.specialAttackBaseFireRate;
            }
        }
    }

    // Player auto-attack logic (only if not currently special attacking)
    if (!player.isSpecialAttacking) {
        player.currentAttackCooldown -= dt;
        if (player.currentAttackCooldown <= 0) {
            playerFireAttack(); // Calls the targeted attack function
            player.currentAttackCooldown = player.attackCooldown;
            playSound('shoot');
        }
    }
}

// NEW: Function to update the camera's position
function updateCamera(): void {
    // Calculate raw camera position, centering on player
    let targetCameraX = player.x - canvas.width / 2;
    let targetCameraY = player.y - canvas.height / 2;

    // Clamp camera to map boundaries
    // Horizontal clamping
    if (gameData.canvas.mapWidth <= canvas.width) {
        // Map is smaller than or equal to canvas width, center it
        cameraX = (gameData.canvas.mapWidth - canvas.width) / 2;
    } else {
        // Map is larger than canvas width, clamp to edges
        cameraX = Math.max(0, Math.min(targetCameraX, gameData.canvas.mapWidth - canvas.width));
    }

    // Vertical clamping
    if (gameData.canvas.mapHeight <= canvas.height) {
        // Map is smaller than or equal to canvas height, center it
        cameraY = (gameData.canvas.mapHeight - canvas.height) / 2;
    } else {
        // Map is larger than canvas height, clamp to edges
        cameraY = Math.max(0, Math.min(targetCameraY, gameData.canvas.mapHeight - canvas.height));
    }
}

function findClosestEnemy(x: number, y: number): Enemy | null {
    let closest: Enemy | null = null;
    let minDistanceSq = Infinity;

    for (const enemy of enemies) {
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closest = enemy;
        }
    }
    return closest;
}

// Function to handle player's normal (targeted/spread) attack
function playerFireAttack(): void {
    const targetEnemy = findClosestEnemy(player.x, player.y);
    if (!targetEnemy) return; // No target, no attack

    const initialDx = targetEnemy.x - player.x;
    const initialDy = targetEnemy.y - player.y;
    const initialAngle = Math.atan2(initialDy, initialDx); // Angle to target in radians

    const numAttacks = player.numberOfAttacks;
    const spreadAngleRad = gameData.player.attackSpreadAngle * (Math.PI / 180); // Convert degrees to radians

    let startAngleOffset = 0;
    let angleStep = 0;

    if (numAttacks > 1) {
        angleStep = spreadAngleRad / (numAttacks - 1);
        startAngleOffset = -spreadAngleRad / 2;
    }
    // If numAttacks is 1, startAngleOffset and angleStep remain 0,
    // causing a single projectile to fire straight at the target.

    for (let i = 0; i < numAttacks; i++) {
        const currentAngle = initialAngle + startAngleOffset + (i * angleStep);

        const projSpeed = gameData.player.projectileSpeed;
        const vx = Math.cos(currentAngle) * projSpeed;
        const vy = Math.sin(currentAngle) * projSpeed;

        projectiles.push({
            x: player.x,
            y: player.y,
            vx: vx,
            vy: vy,
            damage: player.damage,
            lifetime: gameData.player.projectileLifetime,
            assetName: gameData.projectiles.assetName,
            size: gameData.projectiles.size, // Projectile still uses 'size' for collision and drawing
        });
    }
}

// NEW: Function to handle special radial attack
function fireRadialAttack(numProjectiles: number): void {
    const angleStep = (2 * Math.PI) / numProjectiles;

    for (let i = 0; i < numProjectiles; i++) {
        const currentAngle = i * angleStep;
        const projSpeed = gameData.player.projectileSpeed;
        const vx = Math.cos(currentAngle) * projSpeed;
        const vy = Math.sin(currentAngle) * projSpeed;

        projectiles.push({
            x: player.x,
            y: player.y,
            vx: vx,
            vy: vy,
            damage: player.damage, // Special attack projectiles use player damage
            lifetime: gameData.player.projectileLifetime,
            assetName: gameData.projectiles.assetName,
            size: gameData.projectiles.size,
        });
    }
}

function updateProjectiles(dt: number): void {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
        proj.lifetime -= dt;

        // Remove if lifetime expires. Projectiles despawn after lifetime, not necessarily when off-screen.
        if (proj.lifetime <= 0) {
            projectiles.splice(i, 1);
        }
    }
}

function updateEnemies(dt: number): void {
    for (const enemy of enemies) {
        // Move towards player
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            enemy.x += (dx / dist) * enemy.speed * dt;
            enemy.y += (dy / dist) * enemy.speed * dt;
        }
    }
}

function updateExperienceGems(dt: number): void {
    for (let i = experienceGems.length - 1; i >= 0; i--) {
        const gem = experienceGems[i];
        const dx = player.x - gem.x;
        const dy = player.y - gem.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Attract gems if player is within the attract radius (using currentMagnetAttractRadius)
        if (dist < player.currentMagnetAttractRadius && dist > 0) { // MODIFIED
            const attractSpeed = player.speed * 2; // Gems move faster than player
            gem.x += (dx / dist) * attractSpeed * dt;
            gem.y += (dy / dist) * attractSpeed * dt;
        }

        // ADDED: Decrement lifetime and remove if expired
        gem.lifetime -= dt;
        if (gem.lifetime <= 0) {
            experienceGems.splice(i, 1);
            continue; // Move to the next gem, preventing further processing of a removed gem
        }
    }
}

// NEW: Update items lifetime
function updateItems(dt: number): void {
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.currentLifetime -= dt;
        if (item.currentLifetime <= 0) {
            items.splice(i, 1); // Remove if lifetime expires
        }
    }
}


function spawnEnemies(dt: number): void {
    lastEnemySpawnTime += dt;
    // Use dynamic effective spawn interval and max enemies
    if (lastEnemySpawnTime >= currentEffectiveEnemySpawnInterval && enemies.length < currentEffectiveMaxEnemies) {
        lastEnemySpawnTime = 0;
        spawnSingleEnemy(false); // Spawn continuously off-screen (relative to camera view)
    }
}

// NEW: Spawn items
function spawnItems(dt: number): void {
    lastItemSpawnTime += dt;
    if (lastItemSpawnTime >= gameData.gameplay.baseItemSpawnInterval && items.length < gameData.gameplay.maxSimultaneousItems) {
        lastItemSpawnTime = 0; // Reset timer
        const itemTypeConfig = selectRandomItemType();
        if (!itemTypeConfig) return;

        // Spawn completely off-screen *relative to the current camera view*
        const spawnPadding = 50;
        const side = Math.floor(Math.random() * 4); // 0:top, 1:right, 2:bottom, 3:left
        let x, y;

        switch (side) {
            case 0: // Top
                x = cameraX + Math.random() * canvas.width;
                y = cameraY - spawnPadding;
                break;
            case 1: // Right
                x = cameraX + canvas.width + spawnPadding;
                y = cameraY + Math.random() * canvas.height;
                break;
            case 2: // Bottom
                x = cameraX + Math.random() * canvas.width;
                y = cameraY + canvas.height + spawnPadding;
                break;
            case 3: // Left
                x = cameraX - spawnPadding;
                y = cameraY + Math.random() * canvas.height;
                break;
            default: x = 0; y = 0; // Fallback
        }

        // Clamp to map boundaries
        x = Math.max(itemTypeConfig.size / 2, Math.min(gameData.canvas.mapWidth - itemTypeConfig.size / 2, x));
        y = Math.max(itemTypeConfig.size / 2, Math.min(gameData.canvas.mapHeight - itemTypeConfig.size / 2, y));

        items.push({
            x: x,
            y: y,
            size: itemTypeConfig.size,
            type: itemTypeConfig.name,
            assetName: itemTypeConfig.assetName,
            effectDuration: itemTypeConfig.effectDuration,
            effectValue: itemTypeConfig.effectValue,
            totalLifetime: itemTypeConfig.totalLifetime,
            currentLifetime: itemTypeConfig.totalLifetime,
        });
    }
}

function spawnSingleEnemy(initialSpawn: boolean): void {
    const enemyTypeConfig = selectRandomEnemyType();
    if (!enemyTypeConfig) return;

    let x, y;
    const spawnPadding = 50; // Distance off-screen for regular spawns

    if (initialSpawn) {
        // For initial enemies, spawn them somewhat centered on the screen, around the player
        x = player.x + (Math.random() - 0.5) * canvas.width * 0.8;
        y = player.y + (Math.random() - 0.5) * canvas.height * 0.8;
    } else {
        // For continuous spawns, spawn completely off-screen *relative to the current camera view*
        const side = Math.floor(Math.random() * 4); // 0:top, 1:right, 2:bottom, 3:left

        switch (side) {
            case 0: // Top (above camera view)
                x = cameraX + Math.random() * canvas.width;
                y = cameraY - spawnPadding;
                break;
            case 1: // Right (right of camera view)
                x = cameraX + canvas.width + spawnPadding;
                y = cameraY + Math.random() * canvas.height;
                break;
            case 2: // Bottom (below camera view)
                x = cameraX + Math.random() * canvas.width;
                y = cameraY + canvas.height + spawnPadding;
                break;
            case 3: // Left (left of camera view)
                x = cameraX - spawnPadding;
                y = cameraY + Math.random() * canvas.height;
                break;
            default: // Should not happen
                x = 0; y = 0;
        }
    }

    // Clamp the spawn position to ensure it's still within the overall map boundaries
    x = Math.max(enemyTypeConfig.size / 2, Math.min(gameData.canvas.mapWidth - enemyTypeConfig.size / 2, x));
    y = Math.max(enemyTypeConfig.size / 2, Math.min(gameData.canvas.mapHeight - enemyTypeConfig.size / 2, y));

    // NEW: Apply level scaling to enemy stats based on player's current level
    // Level 1 has a factor of 0, Level 2 has 1, etc.
    const levelFactor = player.level - 1;
    const healthScale = 1 + levelFactor * gameData.gameplay.enemyHealthScalePerLevel;
    const speedScale = 1 + levelFactor * gameData.gameplay.enemySpeedScalePerLevel;
    const damageScale = 1 + levelFactor * gameData.gameplay.enemyDamageScalePerLevel;

    enemies.push({
        id: enemyIdCounter++,
        x: x,
        y: y,
        health: enemyTypeConfig.maxHealth * healthScale,
        maxHealth: enemyTypeConfig.maxHealth * healthScale, // Max health also needs to scale for health bar drawing
        speed: enemyTypeConfig.speed * speedScale,
        damage: enemyTypeConfig.damage * damageScale,
        assetName: enemyTypeConfig.assetName,
        expReward: enemyTypeConfig.expReward, // Experience reward can also scale if desired
        size: enemyTypeConfig.size, // Enemy still uses 'size'
    });
}


function selectRandomEnemyType(): GameData['enemies'][number] | undefined {
    const totalWeight = gameData.enemies.reduce((sum, enemy) => sum + enemy.spawnRateWeight, 0);
    let random = Math.random() * totalWeight;

    for (const enemyType of gameData.enemies) {
        if (random < enemyType.spawnRateWeight) {
            return enemyType;
        }
        random -= enemyType.spawnRateWeight;
    }
    return undefined; // Should not happen if totalWeight > 0
}

// NEW: Select random item type
function selectRandomItemType(): GameData['items'][number] | undefined {
    const totalWeight = gameData.items.reduce((sum, item) => sum + item.spawnRateWeight, 0);
    if (totalWeight === 0) return undefined;

    let random = Math.random() * totalWeight;

    for (const itemType of gameData.items) {
        if (random < itemType.spawnRateWeight) {
            return itemType;
        }
        random -= itemType.spawnRateWeight;
    }
    return undefined; // Should not happen if totalWeight > 0
}

function isWithinBounds(x: number, y: number, size: number): boolean {
    // Checks if an object is within the currently visible *canvas* bounds, considering camera offset
    return x + size / 2 > cameraX && x - size / 2 < cameraX + canvas.width &&
           y + size / 2 > cameraY && y - size / 2 < cameraY + canvas.height;
}

// --- Collision Detection ---
function checkCollisions(): void {
    // Projectile-Enemy collisions
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (isColliding(proj, enemy)) {
                enemy.health -= proj.damage;
                projectiles.splice(i, 1); // Remove projectile on hit
                playSound('enemy_hit');
                if (enemy.health <= 0) {
                    dropExperienceGem(enemy.x, enemy.y, enemy.expReward);
                    enemies.splice(j, 1); // Remove defeated enemy
                }
                break; // A projectile can only hit one enemy
            }
        }
    }

    // Player-Enemy collisions
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (isColliding(player, enemy)) {
            player.health -= enemy.damage * deltaTime; // Apply damage over time
            // For now, playing hit sound repeatedly during collision is too noisy.
            // A cooldown or dedicated 'player_damaged' event could be used.
            if (player.health <= 0) {
                gameState = GameState.GAME_OVER;
                stopAllSounds(); // Stop BGM on game over
                playBGM('game_over_music'); // Play game over music
            }
            // Optional: add knockback for player or enemy
        }
    }

    // Player-ExperienceGem collisions
    for (let i = experienceGems.length - 1; i >= 0; i--) {
        const gem = experienceGems[i];
        if (isColliding(player, gem)) {
            player.experience += gem.value;
            experienceGems.splice(i, 1); // Remove collected gem
            playSound('gem_collect');
            if (player.experience >= player.nextLevelExp) {
                playerLevelUp();
            }
        }
    }

    // NEW: Player-Item collisions
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (isColliding(player, item)) {
            applyItemEffect(item);
            items.splice(i, 1); // Remove collected item
            playSound('item_collect'); // Play item collect sound
        }
    }
}

// Simple circular collision detection (approximated with size as diameter)
function isColliding(obj1: GameObject, obj2: GameObject): boolean {
    const distanceX = obj1.x - obj2.x;
    const distanceY = obj1.y - obj2.y;
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

    const combinedRadius = (obj1.size / 2) + (obj2.size / 2);
    return distance < combinedRadius;
}

function dropExperienceGem(x: number, y: number, value: number): void {
    experienceGems.push({
        x: x,
        y: y,
        value: value,
        assetName: gameData.experienceGems.assetName,
        size: gameData.experienceGems.size,
        lifetime: gameData.experienceGems.totalLifetime, // ADDED: Initialize lifetime
    });
}

// NEW: Apply item effect to player
function applyItemEffect(item: Item): void {
    switch (item.type) {
        case 'magnet':
            player.magnetEffectTimer = item.effectDuration;
            // Magnet effect value is ADDED to base radius
            player.currentMagnetAttractRadius = gameData.player.expGemAttractRadius + item.effectValue;
            console.log(`Magnet activated! Attract radius: ${player.currentMagnetAttractRadius} for ${item.effectDuration}s.`);
            break;
        case 'special_attack':
            player.specialAttackEffectTimer = item.effectDuration;
            player.isSpecialAttacking = true;
            player.specialAttackFireCooldown = 0; // Immediately ready to fire
            playSound('special_attack_activate'); // Play special attack sound
            console.log(`Special Attack activated! Radial attack for ${item.effectDuration}s.`);
            break;
        default:
            console.warn(`Unknown item type collected: ${item.type}`);
    }
}

function playerLevelUp(): void {
    player.level++;
    player.experience -= player.nextLevelExp; // Deduct only the required experience
    player.nextLevelExp = Math.floor(player.nextLevelExp * gameData.gameplay.levelUpExpMultiplier);

    // NEW: Increase attack speed (reduce attack cooldown) with each level up
    // Ensure cooldown doesn't become too small (e.g., negative or zero), setting a minimum of 0.05 seconds
    player.attackCooldown = Math.max(0.05, player.attackCooldown * (1 - gameData.gameplay.attackSpeedIncreasePerLevel));

    // USER REQUEST: When the level becomes a multiple of 3, increase the number of attacks by one
    if (player.level % 3 === 0) {
        player.numberOfAttacks++;
        console.log(`Player leveled up to ${player.level}! Number of attacks increased to ${player.numberOfAttacks}.`);
    }

    // USER REQUEST: Dynamically adjust enemy spawning and difficulty
    // 1. Increase max enemies allowed based on player level
    currentEffectiveMaxEnemies = gameData.gameplay.baseMaxEnemies + (player.level - 1) * gameData.gameplay.maxEnemiesIncreasePerLevel;
    // 2. Decrease enemy spawn interval (spawn faster) based on player level
    // Using Math.pow for multiplicative reduction per level.
    currentEffectiveEnemySpawnInterval = Math.max(
        gameData.gameplay.minEnemySpawnInterval,
        gameData.gameplay.baseEnemySpawnInterval * Math.pow(gameData.gameplay.spawnIntervalReductionFactorPerLevel, player.level - 1)
    );

    // Transition to LEVEL_UP state to pause and display choices
    gameState = GameState.LEVEL_UP;
    // Sound will be played once 'Enter' is pressed and option is chosen
}

function applyLevelUpEffect(option: GameData['ui']['levelUpOptions'][number]): void {
    // This is a simple interpretation of effects directly from JSON string.
    // In a production game, a more robust system (e.g., function mapping) would be used.
    try {
        // eslint-disable-next-line no-eval
        eval(option.effect); // Execute the effect string. WARNING: eval is dangerous in real apps!
        // Re-clamp health after maxHealth change
        player.health = Math.min(player.health, player.maxHealth);
    } catch (e) {
        console.error('Failed to apply level up effect:', option.effect, e);
    }
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

// Draws an image asset, scaled to specified width/height and centered at (x,y)
// Added applyShadow parameter to control whether shadows are drawn for this specific sprite
// NEW: added relativeToCamera parameter, if false, x,y are canvas coordinates (not world coordinates)
function drawSprite(assetName: string, x: number, y: number, width: number, height: number, applyShadow: boolean = true, relativeToCamera: boolean = true): void {
    const image = assets.images.get(assetName);
    if (image) {
        let drawX, drawY;

        if (relativeToCamera) {
            // Calculate the top-left drawing position relative to the camera
            drawX = x - width / 2 - cameraX;
            drawY = y - height / 2 - cameraY;
        } else {
            // x, y are already canvas-relative coordinates, center the image
            drawX = x - width / 2;
            drawY = y - height / 2;
        }

        ctx.save(); // Save the current canvas rendering context state

        // Apply shadow properties if enabled in gameData and requested for this sprite
        if (gameData.graphics.shadowEnabled && applyShadow) {
            ctx.shadowColor = gameData.graphics.shadowColor;
            ctx.shadowBlur = gameData.graphics.shadowBlur;
            ctx.shadowOffsetX = gameData.graphics.shadowOffsetX;
            ctx.shadowOffsetY = gameData.graphics.shadowOffsetY;
        }

        // Draw the image (with shadow if configured)
        ctx.drawImage(image, drawX, drawY, width, height);

        ctx.restore(); // Restore the canvas rendering context state (removes shadow settings)

    } else {
        // Fallback: draw a colored rectangle if image not found
        ctx.fillStyle = 'red';
        // Note: Fallback rectangle drawing also needs to respect camera position
        // This logic needs to mirror the drawX/drawY calculation above
        let fallbackDrawX, fallbackDrawY;
        if (relativeToCamera) {
            fallbackDrawX = x - width / 2 - cameraX;
            fallbackDrawY = y - height / 2 - cameraY;
        } else {
            fallbackDrawX = x - width / 2;
            fallbackDrawY = y - height / 2;
        }
        ctx.fillRect(fallbackDrawX, fallbackDrawY, width, height);
        console.warn(`Image asset "${assetName}" not found. Drawing placeholder.`);
    }
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
    ctx.fillText(gameData.ui.titleScreenText, canvas.width / 2, canvas.height / 2 + 20);
}

function drawGameplay(): void {
    // NEW: Draw background image first
    const backgroundImageName = gameData.canvas.backgroundImage;
    const backgroundImage = assets.images.get(backgroundImageName);

    if (backgroundImage) {
        // Draw the background image to cover the entire map, adjusted by camera
        // The drawSprite function already subtracts cameraX/Y and centers the image.
        // So we pass the center of the map as x,y and map dimensions as width,height.
        // IMPORTANT: Background should NOT have a shadow, so pass 'false' for applyShadow
        drawSprite(backgroundImageName, gameData.canvas.mapWidth / 2, gameData.canvas.mapHeight / 2, gameData.canvas.mapWidth, gameData.canvas.mapHeight, false);
    } else {
        // Fallback: draw a solid color if background image is not found
        ctx.fillStyle = '#333'; // Dark gray fallback
        ctx.fillRect(0 - cameraX, 0 - cameraY, gameData.canvas.mapWidth, gameData.canvas.mapHeight);
    }
    
    // Optional: Draw map boundaries for debugging purposes
    // This will appear relative to the camera, so it moves as the camera moves
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 5;
    ctx.strokeRect(0 - cameraX, 0 - cameraY, gameData.canvas.mapWidth, gameData.canvas.mapHeight);
    
    // Draw player
    // Use player.drawWidth and player.drawHeight for drawing
    drawSprite(player.assetName, player.x, player.y, player.drawWidth, player.drawHeight); // applyShadow defaults to true

    // Draw enemies
    for (const enemy of enemies) {
        // Enemies still use a single 'size' for both drawing and collision (square sprite assumption)
        drawSprite(enemy.assetName, enemy.x, enemy.y, enemy.size, enemy.size); // applyShadow defaults to true
        // Draw enemy health bar
        drawHealthBar(enemy.x - cameraX, enemy.y - enemy.size / 2 - 10 - cameraY, enemy.size, 5, enemy.health, enemy.maxHealth, 'red', 'darkred');
    }

    // Draw projectiles
    for (const proj of projectiles) {
        // Projectiles still use a single 'size' for both drawing and collision (square sprite assumption)
        drawSprite(proj.assetName, proj.x, proj.y, proj.size, proj.size); // applyShadow defaults to true
    }

    // Draw experience gems
    for (const gem of experienceGems) {
        // ADDED: Blinking logic for experience gems
        let shouldDrawGem = true;
        if (gem.lifetime <= gameData.experienceGems.blinkThresholdSeconds) {
            // Determine if the gem should be drawn based on current time for blinking effect
            // We use Math.floor(gameTimer * blinkFrequency) % 2 to alternate drawing/not drawing
            if (Math.floor(gameTimer * gameData.experienceGems.blinkFrequency) % 2 !== 0) {
                shouldDrawGem = false; // Skip drawing this frame to create blink effect
            }
        }

        if (shouldDrawGem) {
            // Gems still use a single 'size' for both drawing and collision (square sprite assumption)
            drawSprite(gem.assetName, gem.x, gem.y, gem.size, gem.size); // applyShadow defaults to true
        }
    }

    // NEW: Draw items
    for (const item of items) {
        drawSprite(item.assetName, item.x, item.y, item.size, item.size); // applyShadow defaults to true
    }
}

// Helper function to draw a health bar (used for enemies)
function drawHealthBar(x: number, y: number, width: number, height: number, currentHealth: number, maxHealth: number, fillColor: string, bgColor: string): void {
    ctx.fillStyle = bgColor;
    ctx.fillRect(x - width / 2, y, width, height);
    ctx.fillStyle = fillColor;
    ctx.fillRect(x - width / 2, y, (currentHealth / maxHealth) * width, height);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2, y, width, height);
}

// NEW: Helper function to draw a rounded rectangle
function drawRoundedRect(x: number, y: number, width: number, height: number, radius: number, fillColor: string | null = null, strokeColor: string | null = null, strokeWidth: number = 1): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y); /* FIX: Changed 'quadraticCurveCurveTo' to 'quadraticCurveTo' */
    ctx.closePath();

    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }
    if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
    }
}


function drawUI(): void {
    // Health Bar
    const healthBarConfig = gameData.ui.healthBar;
    const healthBarX = 10;
    const healthBarY = 10;
    const healthBarWidth = healthBarConfig.width;
    const healthBarHeight = healthBarConfig.height;
    const healthBarRadius = healthBarConfig.cornerRadius;
    const currentHealthWidth = (player.health / player.maxHealth) * healthBarWidth;

    // Draw health bar background
    drawRoundedRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight, healthBarRadius, healthBarConfig.backgroundColor);
    // Draw health bar fill
    drawRoundedRect(healthBarX, healthBarY, currentHealthWidth, healthBarHeight, healthBarRadius, healthBarConfig.fillColor);
    // Draw health bar border
    drawRoundedRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight, healthBarRadius, null, healthBarConfig.borderColor, 2);

    // Health bar text
    ctx.font = gameData.ui.barLabelFont;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = healthBarConfig.labelShadowColor;
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = healthBarConfig.labelColor;
    ctx.fillText(`HP: ${Math.ceil(player.health)}/${player.maxHealth}`, healthBarX + healthBarWidth / 2, healthBarY + healthBarHeight + healthBarConfig.labelYOffset);
    ctx.restore();


    // Experience Bar
    const expBarConfig = gameData.ui.expBar;
    const expBarX = 10;
    const expBarY = healthBarY + healthBarHeight + 30;
    const expBarWidth = expBarConfig.width;
    const expBarHeight = expBarConfig.height;
    const expBarRadius = expBarConfig.cornerRadius;
    const currentExpWidth = (player.experience / player.nextLevelExp) * expBarWidth;

    // Draw exp bar background
    drawRoundedRect(expBarX, expBarY, expBarWidth, expBarHeight, expBarRadius, expBarConfig.backgroundColor);
    // Draw exp bar fill
    drawRoundedRect(expBarX, expBarY, currentExpWidth, expBarHeight, expBarRadius, expBarConfig.fillColor);
    // Draw exp bar border
    drawRoundedRect(expBarX, expBarY, expBarWidth, expBarHeight, expBarRadius, null, expBarConfig.borderColor, 2);

    // Experience bar text
    ctx.font = gameData.ui.barLabelFont;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = expBarConfig.labelShadowColor;
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = expBarConfig.labelColor;
    ctx.fillText(`LV ${player.level} | EXP: ${Math.ceil(player.experience)}/${player.nextLevelExp}`, expBarX + expBarWidth / 2, expBarY + expBarHeight + expBarConfig.labelYOffset);
    ctx.restore();

    // Game Timer
    ctx.font = `18px ${gameData.ui.font}`; // Revert to base font for other UI
    ctx.fillStyle = gameData.ui.textColor;
    ctx.textAlign = 'right';
    ctx.fillText(`Time: ${Math.floor(gameTimer / 60).toString().padStart(2, '0')}:${Math.floor(gameTimer % 60).toString().padStart(2, '0')}`, canvas.width - 10, 30);

    // Display current enemy count and spawn interval for debugging/info
    ctx.textAlign = 'right';
    ctx.fillText(`Enemies: ${enemies.length} / ${Math.floor(currentEffectiveMaxEnemies)}`, canvas.width - 10, 60);
    ctx.fillText(`Spawn Interval: ${currentEffectiveEnemySpawnInterval.toFixed(2)}s`, canvas.width - 10, 90);

    // NEW: Draw active item effects UI
    let uiEffectX = canvas.width - 10; // Right side of the canvas
    const uiEffectY = expBarY + expBarHeight + 30; // Below EXP bar
    const uiEffectIconSize = 30;
    const uiEffectTextOffset = uiEffectIconSize / 2 + 5; // Text below icon

    if (player.magnetEffectTimer > 0) {
        // Draw Magnet icon (fixed on canvas, no shadow)
        drawSprite('item_magnet', uiEffectX - uiEffectIconSize/2, uiEffectY + uiEffectIconSize/2, uiEffectIconSize, uiEffectIconSize, false, false);
        ctx.textAlign = 'center';
        ctx.fillStyle = gameData.ui.textColor;
        ctx.font = `14px ${gameData.ui.font}`;
        ctx.fillText(`${Math.ceil(player.magnetEffectTimer)}s`, uiEffectX - uiEffectIconSize/2, uiEffectY + uiEffectIconSize + uiEffectTextOffset);
        uiEffectX -= (uiEffectIconSize + 20); // Move left for next icon
    }

    if (player.specialAttackEffectTimer > 0) {
        // Draw Special Attack icon (fixed on canvas, no shadow)
        drawSprite('item_special_attack', uiEffectX - uiEffectIconSize/2, uiEffectY + uiEffectIconSize/2, uiEffectIconSize, uiEffectIconSize, false, false);
        ctx.textAlign = 'center';
        ctx.fillStyle = gameData.ui.textColor;
        ctx.font = `14px ${gameData.ui.font}`;
        ctx.fillText(`${Math.ceil(player.specialAttackEffectTimer)}s`, uiEffectX - uiEffectIconSize/2, uiEffectY + uiEffectIconSize + uiEffectTextOffset);
        uiEffectX -= (uiEffectIconSize + 20); // Move left for next icon
    }
}

function drawLevelUpScreen(): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = gameData.ui.textColor;
    ctx.font = `bold 36px ${gameData.ui.font}`;
    ctx.fillText(`${gameData.ui.levelUpText} Choose an upgrade (Level ${player.level})`, canvas.width / 2, canvas.height / 2 - 100);

    ctx.font = `24px ${gameData.ui.font}`;
    if (gameData.ui.levelUpOptions.length > 0) {
        // Display the first option (for simplicity in this basic version)
        const option = gameData.ui.levelUpOptions[0];
        // Updated text to reflect Spacebar
        ctx.fillText(`[Spacebar] ${option.name}: ${option.description}`, canvas.width / 2, canvas.height / 2);
    } else {
        ctx.fillText('No upgrades available.', canvas.width / 2, canvas.height / 2);
    }
}

function drawGameOverScreen(): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = gameData.ui.textColor;
    ctx.font = `bold 48px ${gameData.ui.font}`;
    ctx.fillText(gameData.ui.gameOverText, canvas.width / 2, canvas.height / 2 - 50);

    ctx.font = `24px ${gameData.ui.font}`;
    ctx.fillText(`You survived for: ${Math.floor(gameTimer / 60).toString().padStart(2, '0')}:${Math.floor(gameTimer % 60).toString().padStart(2, '0')}`, canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText('Press any key or click to restart.', canvas.width / 2, canvas.height / 2 + 60);
}

// Start the game by loading data
loadGameData();