// Define types for game data and entities
interface GameData {
    canvas: {
        width: number;
        height: number;
        mapWidth: number; // NEW: Total width of the playable map area
        mapHeight: number; // NEW: Total height of the playable map area
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
        expBarWidth: number;
        expBarHeight: number;
        healthBarWidth: number;
        healthBarHeight: number;
        playerSize: number; // Drawing size for the player sprite
        baseNumberOfAttacks: number; // Initial number of projectiles fired per attack
        attackSpreadAngle: number; // Total spread angle in degrees for multiple projectiles
    };
    enemies: Array<{
        name: string;
        assetName: string;
        maxHealth: number;
        speed: number;
        damage: number; // Damage per second when colliding with player
        expReward: number;
        spawnRateWeight: number; // For weighted random spawning
        size: number; // Drawing size for the enemy sprite
    }>;
    projectiles: {
        assetName: string;
        size: number; // Drawing size for the projectile sprite
    };
    experienceGems: {
        assetName: string;
        baseValue: number;
        size: number; // Drawing size for the gem sprite
    };
    gameplay: {
        enemySpawnInterval: number; // in seconds
        initialEnemyCount: number;
        maxEnemies: number;
        levelUpExpMultiplier: number; // How much next level exp increases
        attackSpeedIncreasePerLevel: number; // Percentage reduction in attack cooldown per level (e.g., 0.02 for 2%)
    };
    ui: {
        font: string;
        textColor: string;
        titleScreenText: string;
        gameOverText: string;
        levelUpText: string;
        levelUpOptions: Array<{ name: string; description: string; effect: string }>;
    };
    assets: {
        images: Array<{ name: string; path: string; width: number; height: number }>;
        sounds: Array<{ name: string; path: string; duration_seconds: number; volume: number }>;
    };
}

// Interfaces for game entities
interface GameObject {
    x: number;
    y: number;
    size: number;
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
    expGemAttractRadius: number;
    numberOfAttacks: number; // NEW: Number of projectiles fired per attack
}

interface Enemy extends GameObject {
    id: number;
    health: number;
    maxHealth: number;
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

let gameState: GameState = GameState.TITLE;
let lastUpdateTime = 0;
let deltaTime = 0; // Time since last frame in seconds

let keysPressed: { [key: string]: boolean } = {};

let lastEnemySpawnTime = 0;
let enemyIdCounter = 0;
let gameTimer = 0; // In seconds

let cameraX: number = 0; // NEW: X-coordinate of the camera's top-left corner in world space
let cameraY: number = 0; // NEW: Y-coordinate of the camera's top-left corner in world space

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
        } else if (gameState === GameState.LEVEL_UP && e.key === 'Enter') {
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
        expGemAttractRadius: gameData.player.expGemAttractRadius,
        size: gameData.player.playerSize, // Player drawing size loaded from data
        numberOfAttacks: gameData.player.baseNumberOfAttacks, // NEW: Initial number of attacks
    };

    // Clear entities
    enemies = [];
    projectiles = [];
    experienceGems = [];

    // Reset game state variables
    lastEnemySpawnTime = 0;
    enemyIdCounter = 0;
    gameTimer = 0;

    // Initialize camera position based on player's starting position
    updateCamera();

    // Populate initial enemies
    for (let i = 0; i < gameData.gameplay.initialEnemyCount; i++) {
        spawnSingleEnemy(true); // Spawn initially within map bounds
    }

    stopAllSounds(); // Stop any previous BGM or SFX
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
        checkCollisions();
        spawnEnemies(dt);
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
    player.x = Math.max(player.size / 2, Math.min(gameData.canvas.mapWidth - player.size / 2, player.x));
    player.y = Math.max(player.size / 2, Math.min(gameData.canvas.mapHeight - player.size / 2, player.y));

    // Player auto-attack logic
    player.currentAttackCooldown -= dt;
    if (player.currentAttackCooldown <= 0) {
        playerFireAttack(); // Calls the new attack function
        player.currentAttackCooldown = player.attackCooldown;
        playSound('shoot');
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

// NEW: Function to handle player's attack, potentially firing multiple projectiles
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

        // Remove if lifetime expires or goes off-screen (relative to camera view)
        if (proj.lifetime <= 0 || !isWithinBounds(proj.x, proj.y, proj.size)) {
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

        // Attract gems if player is within the attract radius
        if (dist < player.expGemAttractRadius && dist > 0) {
            const attractSpeed = player.speed * 2; // Gems move faster than player
            gem.x += (dx / dist) * attractSpeed * dt;
            gem.y += (dy / dist) * attractSpeed * dt;
        }
    }
}

function spawnEnemies(dt: number): void {
    lastEnemySpawnTime += dt;
    if (lastEnemySpawnTime >= gameData.gameplay.enemySpawnInterval && enemies.length < gameData.gameplay.maxEnemies) {
        lastEnemySpawnTime = 0;
        spawnSingleEnemy(false); // Spawn continuously off-screen (relative to camera view)
    }
}

function spawnSingleEnemy(initialSpawn: boolean): void {
    const enemyTypeConfig = selectRandomEnemyType();
    if (!enemyTypeConfig) return;

    let x, y;
    const spawnPadding = 50; // Distance off-screen for regular spawns

    if (initialSpawn) {
        // For initial enemies, spawn them somewhat centered on the screen, but within the larger map
        x = Math.random() * (gameData.canvas.mapWidth - enemyTypeConfig.size) + enemyTypeConfig.size / 2;
        y = Math.random() * (gameData.canvas.mapHeight - enemyTypeConfig.size) + enemyTypeConfig.size / 2;
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

        // Clamp the spawn position to ensure it's still within the overall map boundaries
        x = Math.max(enemyTypeConfig.size / 2, Math.min(gameData.canvas.mapWidth - enemyTypeConfig.size / 2, x));
        y = Math.max(enemyTypeConfig.size / 2, Math.min(gameData.canvas.mapHeight - enemyTypeConfig.size / 2, y));
    }

    enemies.push({
        id: enemyIdCounter++,
        x: x,
        y: y,
        health: enemyTypeConfig.maxHealth,
        maxHealth: enemyTypeConfig.maxHealth,
        speed: enemyTypeConfig.speed,
        damage: enemyTypeConfig.damage,
        assetName: enemyTypeConfig.assetName,
        expReward: enemyTypeConfig.expReward,
        size: enemyTypeConfig.size,
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
            playSound('player_hit'); // Play hit sound when player takes damage
            if (player.health <= 0) {
                gameState = GameState.GAME_OVER;
                stopAllSounds(); // Stop BGM on game over
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
    });
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
function drawSprite(assetName: string, x: number, y: number, width: number, height: number): void {
    const image = assets.images.get(assetName);
    if (image) {
        // NEW: Subtract cameraX and cameraY to draw game objects relative to the camera's view
        ctx.drawImage(image, x - width / 2 - cameraX, y - height / 2 - cameraY, width, height);
    } else {
        // Fallback: draw a colored rectangle if image not found
        ctx.fillStyle = 'red';
        ctx.fillRect(x - width / 2 - cameraX, y - height / 2 - cameraY, width, height);
        console.warn(`Image asset "${assetName}" not found. Drawing placeholder.`);
    }
}

function drawTitleScreen(): void {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = gameData.ui.textColor;
    ctx.font = `bold 48px ${gameData.ui.font}`;
    ctx.fillText('Vampire Survivors Clone', canvas.width / 2, canvas.height / 2 - 50);

    ctx.font = `24px ${gameData.ui.font}`;
    ctx.fillText(gameData.ui.titleScreenText, canvas.width / 2, canvas.height / 2 + 20);
}

function drawGameplay(): void {
    // Optional: Draw map boundaries for debugging purposes
    // This will appear relative to the camera, so it moves as the camera moves
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 5;
    ctx.strokeRect(0 - cameraX, 0 - cameraY, gameData.canvas.mapWidth, gameData.canvas.mapHeight);
    
    // Draw player
    drawSprite(player.assetName, player.x, player.y, player.size, player.size);

    // Draw enemies
    for (const enemy of enemies) {
        drawSprite(enemy.assetName, enemy.x, enemy.y, enemy.size, enemy.size);
        // Optional: Draw enemy health bar - would also need camera offset
        // drawHealthBar(enemy.x - cameraX, enemy.y - enemy.size / 2 - 10 - cameraY, enemy.size, 5, enemy.health, enemy.maxHealth, 'red', 'darkred');
    }

    // Draw projectiles
    for (const proj of projectiles) {
        drawSprite(proj.assetName, proj.x, proj.y, proj.size, proj.size);
    }

    // Draw experience gems
    for (const gem of experienceGems) {
        drawSprite(gem.assetName, gem.x, gem.y, gem.size, gem.size);
    }
}

function drawUI(): void {
    ctx.font = `18px ${gameData.ui.font}`;
    ctx.fillStyle = gameData.ui.textColor;
    ctx.textAlign = 'left';

    // Health Bar
    const healthBarX = 10;
    const healthBarY = 10;
    const healthBarWidth = gameData.player.healthBarWidth;
    const healthBarHeight = gameData.player.healthBarHeight;
    ctx.fillStyle = 'gray';
    ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    ctx.fillStyle = 'red';
    ctx.fillRect(healthBarX, healthBarY, (player.health / player.maxHealth) * healthBarWidth, healthBarHeight);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    ctx.textAlign = 'center';
    ctx.fillText(`HP: ${Math.ceil(player.health)}/${player.maxHealth}`, healthBarX + healthBarWidth / 2, healthBarY + healthBarHeight + 15);


    // Experience Bar
    const expBarX = 10;
    const expBarY = healthBarY + healthBarHeight + 30;
    const expBarWidth = gameData.player.expBarWidth;
    const expBarHeight = gameData.player.expBarHeight;
    ctx.fillStyle = 'gray';
    ctx.fillRect(expBarX, expBarY, expBarWidth, expBarHeight);
    ctx.fillStyle = 'lime';
    ctx.fillRect(expBarX, expBarY, (player.experience / player.nextLevelExp) * expBarWidth, expBarHeight);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(expBarX, expBarY, expBarWidth, expBarHeight);
    ctx.textAlign = 'center';
    ctx.fillText(`LV ${player.level} | EXP: ${Math.ceil(player.experience)}/${player.nextLevelExp}`, expBarX + expBarWidth / 2, expBarY + expBarHeight + 15);

    // Game Timer
    ctx.textAlign = 'right';
    ctx.fillText(`Time: ${Math.floor(gameTimer / 60).toString().padStart(2, '0')}:${Math.floor(gameTimer % 60).toString().padStart(2, '0')}`, canvas.width - 10, 30);
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
        ctx.fillText(`[Enter] ${option.name}: ${option.description}`, canvas.width / 2, canvas.height / 2);
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