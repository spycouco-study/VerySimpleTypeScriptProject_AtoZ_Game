// Define interfaces for data.json structure
interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    playerSpeed: number;
    playerFireRate: number;
    playerHealth: number;
    playerBulletSpeed: number;
    playerBulletDamage: number;
    enemyBulletSpeed: number;
    explosionParticleCount: number;
    explosionParticleLife: number;
    bossSpawnHeight: number;
    backgroundScrollSpeed: number;
    backgroundImageName: string;
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
    volume: number;
    duration_seconds: number;
}

interface AssetsConfig {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface PlayerConfig {
    width: number;
    height: number;
    imageName: string;
    bulletImageName: string;
}

interface BulletConfig {
    width: number;
    height: number;
    imageName: string;
    damage: number;
    speed: number;
}

interface EnemyConfig {
    width: number;
    height: number;
    imageName: string;
    health: number;
    speed: number;
    fireRate: number;
    scoreValue: number;
    bulletType: string;
}

interface BossPhaseConfig {
    duration: number;
    movementPattern: string;
    fireRateMultiplier: number;
    bulletSpeedMultiplier: number;
}

interface BossConfig {
    width: number;
    height: number;
    imageName: string;
    health: number;
    speed: number;
    scoreValue: number;
    bulletType: string;
    fireRate: number;
    phases: BossPhaseConfig[];
}

interface EnemyWaveGroupConfig {
    type: string;
    count: number;
    spawnDelay: number;
}

interface WaveConfig {
    time: number;
    enemies: EnemyWaveGroupConfig[];
}

interface LevelConfig {
    id: number;
    duration: number;
    waves: WaveConfig[];
    bossType: string;
}

interface GameData {
    gameSettings: GameSettings;
    assets: AssetsConfig;
    player: PlayerConfig;
    bulletTypes: { [key: string]: BulletConfig };
    enemyTypes: { [key: string]: EnemyConfig };
    bossTypes: { [key: string]: BossConfig };
    levels: LevelConfig[];
}

// Stores loaded assets (images and audio buffers) and sound configurations for quick lookup
interface LoadedAssets {
    images: { [key: string]: HTMLImageElement };
    sounds: { [key: string]: AudioBuffer };
    soundConfigs: { [key: string]: SoundAsset };
}

// Runtime structure for enemies to spawn in a wave
interface EnemySpawnGroup {
    type: string;
    count: number;
    spawnDelay: number;
}

// Game States
enum GameState {
    LOADING,
    MENU,
    CONTROLS,
    PLAYING,
    PAUSED, // Not implemented in current logic, but good to have
    GAME_OVER,
    LEVEL_CLEAR
}

// Global Variables
let gameCanvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let audioContext: AudioContext | null = null;

let assets: LoadedAssets = { images: {}, sounds: {}, soundConfigs: {} };
let gameData: GameData | null = null; // Will hold all parsed data from data.json

let keysPressed: Set<string> = new Set();
let lastFrameTime: DOMHighResTimeStamp = 0;
let backgroundY: number = 0;

let currentGameState: GameState = GameState.LOADING;

let player: Player | null = null;
let score: number = 0;
let currentLevelIndex: number = 0;
let activeLevel: LevelConfig | null = null; // Currently active level configuration
let currentWaveIndex: number = 0; // Index of the current wave within activeLevel

let bullets: Bullet[] = [];
let enemies: Enemy[] = [];
let particles: Particle[] = [];

let isBossActive: boolean = false;
let bossInstance: Boss | null = null;

let levelTimer: number = 0; // Tracks time within the current level
let waveSpawnTimer: number = 0; // Tracks time for individual enemy spawns within a wave
let enemiesToSpawnInCurrentWave: EnemySpawnGroup[] = []; // Queue of enemies to spawn

let bgmSource: AudioBufferSourceNode | null = null;
let currentBGM: string | null = null;

// Utility classes

class Vector2 {
    constructor(public x: number, public y: number) { }

    add(other: Vector2): Vector2 {
        return new Vector2(this.x + other.x, this.y + other.y);
    }

    sub(other: Vector2): Vector2 {
        return new Vector2(this.x - other.x, this.y - other.y);
    }

    mul(scalar: number): Vector2 {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    dist(other: Vector2): number {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    normalize(): Vector2 {
        const length = this.length();
        return length > 0 ? new Vector2(this.x / length, this.y / length) : new Vector2(0, 0);
    }

    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

// Base class for all game objects
class GameObject {
    pos: Vector2;
    width: number;
    height: number;
    imageName: string;

    constructor(pos: Vector2, width: number, height: number, imageName: string) {
        this.pos = pos;
        this.width = width;
        this.height = height;
        this.imageName = imageName;
    }

    draw(ctx: CanvasRenderingContext2D, assets: LoadedAssets) {
        const image = assets.images[this.imageName];
        if (image) {
            ctx.drawImage(image, this.pos.x - this.width / 2, this.pos.y - this.height / 2, this.width, this.height);
        } else {
            // Fallback for missing image, draw a magenta rectangle
            ctx.fillStyle = "magenta";
            ctx.fillRect(this.pos.x - this.width / 2, this.pos.y - this.height / 2, this.width, this.height);
        }
    }

    isColliding(other: GameObject): boolean {
        // Axis-aligned bounding box (AABB) collision detection
        return this.pos.x - this.width / 2 < other.pos.x + other.width / 2 &&
               this.pos.x + this.width / 2 > other.pos.x - other.width / 2 &&
               this.pos.y - this.height / 2 < other.pos.y + other.height / 2 &&
               this.pos.y + this.height / 2 > other.pos.y - other.height / 2;
    }
}

class Player extends GameObject {
    health: number;
    maxHealth: number;
    speed: number;
    fireRate: number; // shots per second
    fireRateTimer: number = 0;
    bulletConfig: BulletConfig;
    gameSettings: GameSettings;

    constructor(position: Vector2, config: PlayerConfig, bulletConfig: BulletConfig, gameSettings: GameSettings) {
        super(position, config.width, config.height, config.imageName);
        this.gameSettings = gameSettings;
        this.maxHealth = gameSettings.playerHealth;
        this.health = this.maxHealth;
        this.speed = gameSettings.playerSpeed;
        this.fireRate = gameSettings.playerFireRate;
        this.bulletConfig = bulletConfig;
    }

    update(deltaTime: number, keysPressed: Set<string>, gameData: GameData) {
        let moveDir = new Vector2(0, 0);
        if (keysPressed.has("ArrowUp") || keysPressed.has("w")) moveDir.y -= 1;
        if (keysPressed.has("ArrowDown") || keysPressed.has("s")) moveDir.y += 1;
        if (keysPressed.has("ArrowLeft") || keysPressed.has("a")) moveDir.x -= 1;
        if (keysPressed.has("ArrowRight") || keysPressed.has("d")) moveDir.x += 1;

        if (moveDir.length() > 0) {
            moveDir = moveDir.normalize();
            this.pos.x += moveDir.x * this.speed * deltaTime;
            this.pos.y += moveDir.y * this.speed * deltaTime;
        }

        // Keep player within canvas bounds
        this.pos.x = Math.max(this.width / 2, Math.min(gameData.gameSettings.canvasWidth - this.width / 2, this.pos.x));
        this.pos.y = Math.max(this.height / 2, Math.min(gameData.gameSettings.canvasHeight - this.height / 2, this.pos.y));

        this.fireRateTimer -= deltaTime;
        if (keysPressed.has(" ") && this.fireRateTimer <= 0) {
            this.shoot();
            this.fireRateTimer = 1 / this.fireRate;
        }
    }

    shoot() {
        if (this.bulletConfig && gameData) {
            const bullet = new Bullet(
                this.pos.add(new Vector2(0, -this.height / 2)),
                this.bulletConfig.width,
                this.bulletConfig.height,
                this.bulletConfig.imageName,
                this.bulletConfig.damage,
                gameData.gameSettings.playerBulletSpeed, // Use playerBulletSpeed from gameSettings
                new Vector2(0, -1), // Upwards
                "player"
            );
            bullets.push(bullet);
            playSFX("shoot", assets.soundConfigs["shoot"]?.volume || 0.3);
        }
    }

    takeDamage(amount: number) {
        this.health -= amount;
        playSFX("hit", assets.soundConfigs["hit"]?.volume || 0.2);
        if (this.health <= 0) {
            // Handled in update loop
        }
    }
}

class Bullet extends GameObject {
    damage: number;
    speed: number;
    direction: Vector2;
    shooter: "player" | "enemy";

    constructor(pos: Vector2, width: number, height: number, imageName: string, damage: number, speed: number, direction: Vector2, shooter: "player" | "enemy") {
        super(pos, width, height, imageName);
        this.damage = damage;
        this.speed = speed;
        this.direction = direction.normalize();
        this.shooter = shooter;
    }

    update(deltaTime: number) {
        this.pos.x += this.direction.x * this.speed * deltaTime;
        this.pos.y += this.direction.y * this.speed * deltaTime;
    }
}

class Enemy extends GameObject {
    health: number;
    maxHealth: number;
    speed: number;
    fireRate: number;
    fireRateTimer: number = 0;
    scoreValue: number;
    bulletConfig: BulletConfig;
    isBoss: boolean = false;
    gameSettings: GameSettings;

    constructor(pos: Vector2, config: EnemyConfig | BossConfig, bulletConfig: BulletConfig, gameSettings: GameSettings) {
        super(pos, config.width, config.height, config.imageName);
        this.gameSettings = gameSettings;
        this.maxHealth = config.health;
        this.health = config.health;
        this.speed = config.speed;
        this.fireRate = config.fireRate;
        this.scoreValue = config.scoreValue;
        this.bulletConfig = bulletConfig;
    }

    update(deltaTime: number, playerPos: Vector2, gameData: GameData) {
        // Basic movement: move downwards
        this.pos.y += this.speed * deltaTime;

        this.fireRateTimer -= deltaTime;
        if (this.fireRateTimer <= 0) {
            this.shoot(playerPos);
            this.fireRateTimer = 1 / this.fireRate + Math.random() * 0.5; // Add some randomness
        }
    }

    shoot(playerPos: Vector2, bulletSpeedMultiplier: number = 1) {
        if (this.bulletConfig && gameData) {
            const direction = playerPos.sub(this.pos).normalize(); // Aim at player
            const bullet = new Bullet(
                this.pos.add(direction.mul(this.height / 2)),
                this.bulletConfig.width,
                this.bulletConfig.height,
                this.bulletConfig.imageName,
                this.bulletConfig.damage,
                gameData.gameSettings.enemyBulletSpeed * bulletSpeedMultiplier, // Use enemyBulletSpeed from gameSettings
                direction,
                "enemy"
            );
            bullets.push(bullet);
            playSFX("enemy_shoot", assets.soundConfigs["enemy_shoot"]?.volume || 0.2);
        }
    }

    takeDamage(amount: number): boolean {
        this.health -= amount;
        playSFX("hit", assets.soundConfigs["hit"]?.volume || 0.2);
        if (this.health <= 0) {
            score += this.scoreValue;
            if (gameData) { // Check gameData before using its settings
                spawnExplosion(this.pos.x, this.pos.y, gameData.gameSettings.explosionParticleCount);
                playSFX("explosion", assets.soundConfigs["explosion"]?.volume || 0.7);
            }
            return true; // Enemy defeated
        }
        return false;
    }
}

class Boss extends Enemy {
    bossConfig: BossConfig;
    phaseTimer: number = 0;
    currentPhaseIndex: number = 0;

    constructor(pos: Vector2, bossConfig: BossConfig, bulletConfig: BulletConfig, gameSettings: GameSettings) {
        super(pos, bossConfig, bulletConfig, gameSettings); // Pass bossConfig as enemyConfig for common properties
        this.bossConfig = bossConfig;
        this.isBoss = true;
        this.health = bossConfig.health; // Override health with boss-specific health
        this.maxHealth = bossConfig.health;
        this.scoreValue = bossConfig.scoreValue;
        this.fireRate = bossConfig.fireRate;
        this.width = bossConfig.width; // Ensure dimensions are from bossConfig
        this.height = bossConfig.height;
        this.imageName = bossConfig.imageName;
    }

    update(deltaTime: number, playerPos: Vector2, gameData: GameData) {
        this.updatePhase(deltaTime);
        const currentPhase = this.bossConfig.phases[this.currentPhaseIndex];

        // Movement logic based on phase pattern
        if (currentPhase.movementPattern === "hover") {
            // Stay mostly in place, maybe slight horizontal drift
            this.pos.x += Math.sin(this.phaseTimer * 0.5) * this.speed * deltaTime * 0.5;
        } else if (currentPhase.movementPattern === "zigzag") {
            this.pos.x += Math.sin(this.phaseTimer * 2) * this.speed * deltaTime;
            // Introduce a small vertical movement component, but generally boss descends slowly or holds position
            this.pos.y += Math.cos(this.phaseTimer * 0.5) * this.speed * deltaTime * 0.1;
        }
        // Ensure boss stays within horizontal bounds
        this.pos.x = Math.max(this.width / 2, Math.min(gameData.gameSettings.canvasWidth - this.width / 2, this.pos.x));

        // Move towards bossSpawnHeight, stopping once reached
        if (this.pos.y < gameData.gameSettings.bossSpawnHeight) {
            this.pos.y += this.speed * deltaTime * 0.5; // Slower descent
            this.pos.y = Math.min(this.pos.y, gameData.gameSettings.bossSpawnHeight);
        }

        // Firing logic
        this.fireRateTimer -= deltaTime;
        if (this.fireRateTimer <= 0) {
            this.shoot(playerPos, currentPhase.bulletSpeedMultiplier);
            this.fireRateTimer = (1 / this.fireRate) / currentPhase.fireRateMultiplier + Math.random() * 0.2; // Add some randomness
        }
    }

    shoot(playerPos: Vector2, bulletSpeedMultiplier: number = 1) {
        // Boss can shoot in various patterns, for now, simple aim at player
        // Override parent method to use phase-specific bullet speed multiplier
        if (this.bulletConfig && gameData) {
            const direction = playerPos.sub(this.pos).normalize();
            const bullet = new Bullet(
                this.pos.add(direction.mul(this.height / 2)),
                this.bulletConfig.width,
                this.bulletConfig.height,
                this.bulletConfig.imageName,
                this.bulletConfig.damage,
                gameData.gameSettings.enemyBulletSpeed * bulletSpeedMultiplier,
                direction,
                "enemy"
            );
            bullets.push(bullet);
            playSFX("enemy_shoot", assets.soundConfigs["enemy_shoot"]?.volume || 0.2);
        }
    }

    updatePhase(deltaTime: number) {
        this.phaseTimer += deltaTime;
        const currentPhase = this.bossConfig.phases[this.currentPhaseIndex];

        if (this.phaseTimer >= currentPhase.duration) {
            this.currentPhaseIndex = (this.currentPhaseIndex + 1) % this.bossConfig.phases.length;
            this.phaseTimer = 0; // Reset timer for new phase
        }
    }
}


class Particle extends GameObject {
    vel: Vector2;
    life: number;
    maxLife: number;
    color: string;

    constructor(pos: Vector2, vel: Vector2, life: number, size: number, color: string, imageName: string = "default_particle") {
        super(pos, size, size, imageName); // Particle might not need an image, but GameObject requires it.
        this.vel = vel;
        this.life = life;
        this.maxLife = life;
        this.color = color;
    }

    update(deltaTime: number) {
        this.pos = this.pos.add(this.vel.mul(deltaTime));
        this.life -= deltaTime;
        // Apply some "gravity" or decay to velocity
        this.vel.y += 50 * deltaTime; // Example: slight downward acceleration
    }

    isAlive(): boolean {
        return this.life > 0;
    }

    draw(ctx: CanvasRenderingContext2D, assets: LoadedAssets) {
        // Particles will draw as colored circles/rectangles, not images normally.
        // But if there's an image specified, draw that.
        const image = assets.images[this.imageName];
        if (image && this.imageName !== "default_particle") { // Check for a meaningful image name
            const alpha = this.life / this.maxLife;
            ctx.globalAlpha = alpha;
            super.draw(ctx, assets); // Call parent draw for image
            ctx.globalAlpha = 1.0; // Reset global alpha
        } else {
            // Draw as a fading circle/rectangle
            const alpha = this.life / this.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
}

// Asset loading functions
async function loadJson(path: string): Promise<any> {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load JSON from ${path}: ${response.statusText}`);
    }
    return response.json();
}

async function loadImage(imageAsset: ImageAsset): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imageAsset.path;
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${imageAsset.path}`));
    });
}

async function loadSound(soundAsset: SoundAsset): Promise<AudioBuffer> {
    if (!audioContext) {
        throw new Error("AudioContext is not initialized or supported.");
    }
    const response = await fetch(soundAsset.path);
    if (!response.ok) {
        throw new Error(`Failed to load sound: ${soundAsset.path}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Promise((resolve, reject) => {
        audioContext!.decodeAudioData(arrayBuffer, resolve, reject);
    });
}

async function loadAssets(): Promise<void> {
    try {
        gameData = await loadJson("data.json");

        const imagePromises = gameData.assets.images.map(async (imageAsset) => {
            assets.images[imageAsset.name] = await loadImage(imageAsset);
        });

        const soundPromises = gameData.assets.sounds.map(async (soundAsset) => {
            assets.sounds[soundAsset.name] = await loadSound(soundAsset);
            assets.soundConfigs[soundAsset.name] = soundAsset; // Store sound config for volume/duration
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        currentGameState = GameState.MENU; // Assets loaded, go to menu
        playBGM("bgm_menu", assets.soundConfigs["bgm_menu"]?.volume || 0.5, true);
    } catch (error) {
        console.error("Error loading assets:", error);
        currentGameState = GameState.GAME_OVER; // Fallback to GAME_OVER or specific error state
    }
}


// Audio functions
function playSFX(soundName: string, volume: number = 1.0) {
    if (!audioContext || !assets.sounds[soundName]) return;

    // Ensure audioContext is resumed (important for browser policies)
    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(e => console.error("Failed to resume AudioContext for SFX:", e));
        return; // Don't play if suspended, wait for resume. Or try again.
    }

    const source = audioContext.createBufferSource();
    source.buffer = assets.sounds[soundName];

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume; // Use provided volume parameter

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
}

function playBGM(soundName: string, volume: number = 0.5, loop: boolean = true) {
    if (!audioContext) {
        console.warn("AudioContext not initialized, cannot play BGM.");
        return;
    }

    // Ensure audioContext is resumed (important for browser policies)
    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(e => console.error("Failed to resume AudioContext for BGM:", e));
        return;
    }

    if (!assets.sounds[soundName] || currentBGM === soundName) return;

    stopBGM();

    bgmSource = audioContext.createBufferSource();
    bgmSource.buffer = assets.sounds[soundName];
    bgmSource.loop = loop;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume; // Use provided volume parameter

    bgmSource.connect(gainNode);
    gainNode.connect(audioContext.destination);
    bgmSource.start(0);
    currentBGM = soundName;
}

function stopBGM() {
    if (bgmSource) {
        bgmSource.stop();
        bgmSource.disconnect();
        bgmSource = null;
        currentBGM = null;
    }
}

// Level management functions
function loadLevel(levelIndex: number) {
    if (!gameData) return;

    if (levelIndex >= gameData.levels.length) {
        console.log("Game Finished! All levels cleared!");
        currentGameState = GameState.LEVEL_CLEAR; // Transition to LEVEL_CLEAR, then from there to Menu
        stopBGM();
        playBGM("bgm_menu", assets.soundConfigs["bgm_menu"]?.volume || 0.5, true);
        return;
    }

    activeLevel = gameData.levels[levelIndex];
    bullets = [];
    enemies = [];
    particles = [];
    isBossActive = false;
    bossInstance = null;
    levelTimer = 0;
    waveSpawnTimer = 0;
    enemiesToSpawnInCurrentWave = [];
    currentWaveIndex = 0; // Reset wave index for the new level

    // Reset player health for new level
    if (player) {
        player.health = player.maxHealth;
    }
    // Ensure player is centered if canvas size changed
    if (player && gameCanvas) {
         player.pos.x = gameCanvas.width / 2;
         player.pos.y = gameCanvas.height - 50;
    }
}

function spawnEnemy(enemyType: string, x: number, y: number) {
    if (!gameData) return;
    const enemyConfig = gameData.enemyTypes[enemyType];
    if (!enemyConfig) {
        console.error("Enemy type config not found:", enemyType);
        return;
    }
    const bulletConfig = gameData.bulletTypes[enemyConfig.bulletType];
    if (!bulletConfig) {
         console.error("Bullet type config not found for enemy:", enemyConfig.bulletType);
         return;
    }
    const enemy = new Enemy(new Vector2(x, y), enemyConfig, bulletConfig, gameData.gameSettings);
    enemies.push(enemy);
}

function spawnBoss(bossType: string) {
    if (!gameData || !gameCanvas) return;
    const bossConfig = gameData.bossTypes[bossType];
    if (!bossConfig) {
        console.error("Boss type config not found:", bossType);
        return;
    }
    const bulletConfig = gameData.bulletTypes[bossConfig.bulletType];
    if (!bulletConfig) {
        console.error("Bullet type config not found for boss:", bossConfig.bulletType);
        return;
    }
    bossInstance = new Boss(
        new Vector2(gameCanvas.width / 2, -bossConfig.height), // Start above screen
        bossConfig,
        bulletConfig,
        gameData.gameSettings
    );
    enemies.push(bossInstance); // Add boss to enemies array for collision detection
    isBossActive = true;
}

function spawnExplosion(x: number, y: number, count: number) {
    if (!gameData) return;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 200 + 50;
        const vel = new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
        const life = Math.random() * gameData.gameSettings.explosionParticleLife + 0.2;
        const size = Math.random() * 5 + 2;
        const color = `hsl(${Math.random() * 60}, 100%, 50%)`; // Orange-red hues
        particles.push(new Particle(new Vector2(x, y), vel, life, size, color));
    }
}


// Game Initialization
function initGame() {
    gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    if (!gameCanvas) {
        console.error("Canvas element 'gameCanvas' not found!");
        return;
    }
    ctx = gameCanvas.getContext("2d")!;
    if (!ctx) {
        console.error("Failed to get 2D rendering context!");
        return;
    }

    // Initialize AudioContext
    try {
        // Safari still uses webkitAudioContext
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
        console.warn("Web Audio API is not supported in this browser:", e);
    }

    // Set initial canvas size (will be updated by gameData after loading)
    gameCanvas.width = 800;
    gameCanvas.height = 600;

    document.addEventListener("keydown", (e) => keysPressed.add(e.key));
    document.addEventListener("keyup", (e) => keysPressed.delete(e.key));

    loadAssets().then(() => {
        // Apply canvas settings from gameData after assets are loaded
        if (gameData && gameData.gameSettings && gameCanvas) {
            gameCanvas.width = gameData.gameSettings.canvasWidth;
            gameCanvas.height = gameData.gameSettings.canvasHeight;
        }
        // Ensure audio context is resumed after user interaction (for some browsers)
        // This is important due to browser autoplay policies
        if (audioContext && audioContext.state === 'suspended') {
            const resumeAudio = () => {
                audioContext!.resume().then(() => {
                    console.log('AudioContext resumed!');
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('keydown', resumeAudio);
                });
            };
            document.addEventListener('click', resumeAudio);
            document.addEventListener('keydown', resumeAudio);
        }
    });

    requestAnimationFrame(gameLoop);
}

function initializeNewGame() {
    if (!gameData || !gameCanvas) return; // Ensure gameData and gameCanvas are available

    score = 0;
    currentLevelIndex = 0;
    bullets = [];
    enemies = [];
    particles = [];
    isBossActive = false;
    bossInstance = null;
    levelTimer = 0;
    waveSpawnTimer = 0;
    enemiesToSpawnInCurrentWave = [];
    currentWaveIndex = 0;

    const playerConfig = gameData.player;
    const playerBulletConfig = gameData.bulletTypes[playerConfig.bulletImageName];
    if (!playerBulletConfig) {
        console.error("Player bullet type config not found:", playerConfig.bulletImageName);
        currentGameState = GameState.GAME_OVER;
        return;
    }
    player = new Player(
        new Vector2(gameCanvas.width / 2, gameCanvas.height - 50), // Use actual canvas dimensions
        playerConfig,
        playerBulletConfig,
        gameData.gameSettings
    );

    loadLevel(currentLevelIndex);
}


// Game Loop
function gameLoop(currentTime: DOMHighResTimeStamp) {
    requestAnimationFrame(gameLoop);

    // Initialize lastFrameTime on first call
    if (lastFrameTime === 0) {
        lastFrameTime = currentTime;
    }

    const deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;

    if (deltaTime > 0.1) return; // Cap deltaTime to prevent physics weirdness on lag spikes

    update(deltaTime);
    draw();
}

function update(deltaTime: number) {
    if (!gameData || !gameCanvas) return; // Ensure gameData and gameCanvas are available

    backgroundY = (backgroundY + gameData.gameSettings.backgroundScrollSpeed * deltaTime) % gameData.gameSettings.canvasHeight;

    switch (currentGameState) {
        case GameState.LOADING:
            // Handled by loadAssets().then()
            break;
        case GameState.MENU:
            if (keysPressed.has("Enter")) {
                currentGameState = GameState.CONTROLS;
                keysPressed.delete("Enter"); // Consume input
            }
            break;
        case GameState.CONTROLS:
            if (keysPressed.has("Enter")) {
                initializeNewGame();
                // Ensure player initialization succeeded before changing state
                if (player) {
                    currentGameState = GameState.PLAYING;
                    playBGM("bgm_game", assets.soundConfigs["bgm_game"]?.volume || 0.3, true);
                }
                keysPressed.delete("Enter"); // Consume input
            }
            break;
        case GameState.PLAYING:
            if (!player) { // Should not happen if initialized correctly
                currentGameState = GameState.GAME_OVER;
                return;
            }
            if (player.health <= 0) {
                currentGameState = GameState.GAME_OVER;
                stopBGM();
                playBGM("bgm_menu", assets.soundConfigs["bgm_menu"]?.volume || 0.5, true);
                return;
            }

            player.update(deltaTime, keysPressed, gameData);

            if (activeLevel) {
                levelTimer += deltaTime;

                if (!isBossActive) {
                    // Spawn enemies from current wave group
                    if (enemiesToSpawnInCurrentWave.length > 0) {
                        waveSpawnTimer += deltaTime;
                        const currentSpawnGroup = enemiesToSpawnInCurrentWave[0];

                        if (waveSpawnTimer >= currentSpawnGroup.spawnDelay) {
                            const x = Math.random() * (gameData.gameSettings.canvasWidth - 60) + 30;
                            const y = -50;
                            spawnEnemy(currentSpawnGroup.type, x, y);
                            currentSpawnGroup.count--;

                            if (currentSpawnGroup.count <= 0) {
                                enemiesToSpawnInCurrentWave.shift(); // Remove completed group
                                waveSpawnTimer = 0;
                            } else {
                                waveSpawnTimer = 0; // Reset timer for next enemy in same group
                            }
                        }
                    } else {
                        // Check if new waves should start based on levelTimer
                        while (currentWaveIndex < activeLevel.waves.length && activeLevel.waves[currentWaveIndex].time <= levelTimer) {
                            for (const group of activeLevel.waves[currentWaveIndex].enemies) {
                                enemiesToSpawnInCurrentWave.push({ ...group }); // Clone group to modify count
                            }
                            currentWaveIndex++;
                            waveSpawnTimer = 0; // Reset for first enemy in new wave
                        }
                    }

                    // Check for boss spawn conditions
                    const allWavesProcessed = currentWaveIndex >= activeLevel.waves.length && enemiesToSpawnInCurrentWave.length === 0;
                    const noRegularEnemiesOnScreen = !enemies.some(e => !e.isBoss);

                    if (!bossInstance && levelTimer >= activeLevel.duration && allWavesProcessed && noRegularEnemiesOnScreen) {
                        spawnBoss(activeLevel.bossType);
                    }
                }
            }

            // Update bullets
            for (let i = bullets.length - 1; i >= 0; i--) {
                const bullet = bullets[i];
                bullet.update(deltaTime);
                // Remove bullets off-screen
                if (bullet.pos.y < -bullet.height || bullet.pos.y > gameData.gameSettings.canvasHeight + bullet.height ||
                    bullet.pos.x < -bullet.width || bullet.pos.x > gameData.gameSettings.canvasWidth + bullet.width) {
                    bullets.splice(i, 1);
                }
            }

            // Update enemies
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                enemy.update(deltaTime, player.pos, gameData);

                // Remove non-boss enemies that go off-screen
                if (!enemy.isBoss && enemy.pos.y > gameData.gameSettings.canvasHeight + enemy.height / 2) {
                    enemies.splice(i, 1);
                    continue;
                }

                // Player collision with enemy
                if (player.isColliding(enemy)) {
                    player.takeDamage(1); // Player takes damage
                    if (!enemy.isBoss) {
                        // Regular enemies are destroyed on collision
                        // Explosion and sound handled in enemy.takeDamage
                        enemy.takeDamage(enemy.health); // Fully damage to trigger defeat logic
                        enemies.splice(i, 1);
                        continue;
                    }
                    // Bosses don't get removed on player collision, player just takes damage
                }

                // Bullet collision with enemy
                for (let j = bullets.length - 1; j >= 0; j--) {
                    const bullet = bullets[j];
                    if (bullet.shooter === "player" && bullet.isColliding(enemy)) {
                        bullets.splice(j, 1); // Remove player bullet
                        if (enemy.takeDamage(bullet.damage)) { // Enemy is defeated
                            if (enemy.isBoss) {
                                bossInstance = null; // Clear boss instance
                                isBossActive = false;
                                enemies.splice(i, 1); // Remove boss from enemies array
                                currentGameState = GameState.LEVEL_CLEAR; // Level cleared
                                stopBGM();
                                playBGM("bgm_menu", assets.soundConfigs["bgm_menu"]?.volume || 0.5, true);
                                break; // Break from inner bullet loop to not process other bullets against this defeated boss
                            } else {
                                enemies.splice(i, 1); // Remove regular enemy
                                break; // Break from inner bullet loop
                            }
                        }
                    }
                }
            }

            // Enemy bullet collision with player
            for (let i = bullets.length - 1; i >= 0; i--) {
                const bullet = bullets[i];
                if (bullet.shooter === "enemy" && player.isColliding(bullet)) {
                    bullets.splice(i, 1); // Remove enemy bullet
                    player.takeDamage(bullet.damage);
                }
            }

            // Update particles
            for (let i = particles.length - 1; i >= 0; i--) {
                const particle = particles[i];
                particle.update(deltaTime);
                if (!particle.isAlive()) {
                    particles.splice(i, 1);
                }
            }
            break;
        case GameState.GAME_OVER:
            if (keysPressed.has("Enter")) {
                currentGameState = GameState.CONTROLS; // Go back to controls screen for restart
                keysPressed.delete("Enter");
            }
            break;
        case GameState.LEVEL_CLEAR:
            if (keysPressed.has("Enter")) {
                currentLevelIndex++;
                if (currentLevelIndex < gameData.levels.length) {
                    loadLevel(currentLevelIndex);
                    currentGameState = GameState.PLAYING;
                    playBGM("bgm_game", assets.soundConfigs["bgm_game"]?.volume || 0.3, true);
                } else {
                    // Game finished, all levels cleared. Return to menu.
                    console.log("Game Finished! All levels cleared!");
                    currentGameState = GameState.MENU; // Go to main menu
                    stopBGM();
                    playBGM("bgm_menu", assets.soundConfigs["bgm_menu"]?.volume || 0.5, true);
                }
                keysPressed.delete("Enter");
            }
            break;
    }
}

function draw() {
    if (!ctx || !gameData || !gameCanvas) return; // Ensure context, gameData, and canvas are available

    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Draw solid background fallback
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Draw background image for scrolling effect
    const backgroundImage = assets.images[gameData.gameSettings.backgroundImageName];
    if (backgroundImage) {
        // Draw the image twice to create a seamless scrolling effect
        ctx.drawImage(backgroundImage, 0, backgroundY, gameCanvas.width, gameCanvas.height);
        ctx.drawImage(backgroundImage, 0, backgroundY - gameCanvas.height, gameCanvas.width, gameCanvas.height);
    } else {
        // Fallback for missing background image, use solid scrolling background
        ctx.fillStyle = "#555";
        ctx.fillRect(0, backgroundY, gameCanvas.width, gameCanvas.height);
        ctx.fillRect(0, backgroundY - gameCanvas.height, gameCanvas.width, gameCanvas.height);
    }


    switch (currentGameState) {
        case GameState.LOADING:
            drawText("Loading Assets...", gameCanvas.width / 2, gameCanvas.height / 2, "#FFF", 30, "center");
            break;
        case GameState.MENU:
            drawText("Simple Shooter", gameCanvas.width / 2, gameCanvas.height / 2 - 50, "#FFF", 50, "center");
            drawText("Press ENTER to Start", gameCanvas.width / 2, gameCanvas.height / 2 + 50, "#FFF", 30, "center");
            break;
        case GameState.CONTROLS:
            drawText("조작법", gameCanvas.width / 2, gameCanvas.height / 2 - 150, "#FFF", 40, "center");
            drawText("이동: 방향키 (↑↓←→) 또는 WASD", gameCanvas.width / 2, gameCanvas.height / 2 - 50, "#FFF", 25, "center");
            drawText("사격: Space (스페이스바)", gameCanvas.width / 2, gameCanvas.height / 2, "#FFF", 25, "center");
            drawText("Press ENTER to Play", gameCanvas.width / 2, gameCanvas.height / 2 + 100, "#FFF", 30, "center");
            break;
        case GameState.PLAYING:
            if (player) {
                player.draw(ctx, assets);
            }
            bullets.forEach(bullet => bullet.draw(ctx, assets));
            enemies.forEach(enemy => enemy.draw(ctx, assets));
            particles.forEach(particle => particle.draw(ctx, assets));

            drawText(`Score: ${score}`, 10, 30, "#FFF", 20);
            if (player) {
                drawText(`Health: ${player.health}`, 10, 60, "#FFF", 20);
            }
            drawText(`Level: ${currentLevelIndex + 1}`, gameCanvas.width - 10, 30, "#FFF", 20, "right");

            if (bossInstance) {
                const barWidth = 200;
                const barHeight = 20;
                const barX = gameCanvas.width / 2 - barWidth / 2;
                const barY = 10;
                ctx.fillStyle = "#000";
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = "#F00";
                const healthRatio = bossInstance.health / bossInstance.maxHealth; // Use maxHealth from boss instance
                ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
                drawText("BOSS", gameCanvas.width / 2, barY + barHeight + 5, "#FFF", 16, "center");
            }
            break;
        case GameState.GAME_OVER:
            drawText("GAME OVER", gameCanvas.width / 2, gameCanvas.height / 2 - 50, "#F00", 50, "center");
            drawText(`Final Score: ${score}`, gameCanvas.width / 2, gameCanvas.height / 2, "#FFF", 30, "center");
            drawText("Press ENTER to Restart", gameCanvas.width / 2, gameCanvas.height / 2 + 50, "#FFF", 30, "center");
            break;
        case GameState.LEVEL_CLEAR:
            drawText(`LEVEL ${currentLevelIndex + 1} CLEARED!`, gameCanvas.width / 2, gameCanvas.height / 2 - 50, "#0F0", 50, "center");
            drawText(`Score: ${score}`, gameCanvas.width / 2, gameCanvas.height / 2, "#FFF", 30, "center");
            // If it's the final level, change text
            if (gameData.levels && currentLevelIndex + 1 >= gameData.levels.length) {
                 drawText("Press ENTER to return to Menu", gameCanvas.width / 2, gameCanvas.height / 2 + 50, "#FFF", 30, "center");
            } else {
                 drawText("Press ENTER for Next Level", gameCanvas.width / 2, gameCanvas.height / 2 + 50, "#FFF", 30, "center");
            }
            break;
    }
}

function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = "left") {
    if (!ctx) return; // Ensure context is available
    ctx.fillStyle = color;
    ctx.font = `${size}px Arial`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
}

document.addEventListener("DOMContentLoaded", initGame);
