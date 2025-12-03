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
    scrollSpeed: number;
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

interface AssetData {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface PlayerConfig {
    width: number;
    height: number;
    imageName: string;
    bulletImageName: string;
}

interface BulletTypeConfig {
    width: number;
    height: number;
    imageName: string;
    damage: number;
    speed: number; // This speed will now be interpreted as magnitude for velocity vector
}

interface EnemyTypeConfig {
    width: number;
    height: number;
    imageName: string;
    health: number;
    speed: number;
    fireRate: number; // Shots per second
    scoreValue: number;
    bulletType: string | null; // Key for bulletTypes
}

interface BossPhase {
    duration: number; // seconds
    movementPattern: "hover" | "charge" | "zigzag" | "sideways";
    fireRateMultiplier: number;
    bulletSpeedMultiplier: number;
}

interface BossTypeConfig {
    width: number;
    height: number;
    imageName: string;
    health: number;
    speed: number;
    scoreValue: number;
    bulletType: string | null;
    fireRate: number;
    phases: BossPhase[];
}

interface WaveEnemySpawn {
    type: string; // Key for enemyTypes
    count: number;
    spawnDelay: number; // seconds between spawning each enemy in this group
}

interface LevelWave {
    time: number; // When this wave starts (relative to level start, in seconds)
    enemies: WaveEnemySpawn[];
}

interface LevelConfig {
    id: number;
    duration: number; // Total duration before boss appears
    waves: LevelWave[];
    bossType: string; // Key for bossTypes
}

interface GameData {
    gameSettings: GameSettings;
    assets: AssetData;
    player: PlayerConfig;
    bulletTypes: { [key: string]: BulletTypeConfig; };
    enemyTypes: { [key: string]: EnemyTypeConfig; };
    bossTypes: { [key: string]: BossTypeConfig; };
    levels: LevelConfig[];
}

interface LoadedAssets {
    images: { [key: string]: HTMLImageElement; };
    sounds: { [key: string]: AudioBuffer; };
}

// Global game variables
let gameCanvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData;
let assets: LoadedAssets = { images: {}, sounds: {} };

enum GameState {
    LOADING,
    MENU,
    CONTROLS,
    PLAYING,
    GAME_OVER,
    LEVEL_CLEAR
}

let currentGameState: GameState = GameState.LOADING;

let player: Player;
let bullets: Bullet[] = [];
let enemies: Enemy[] = [];
let particles: Particle[] = [];
let score: number = 0;
let currentLevelIndex: number = 0;
let levelTimer: number = 0;
let lastFrameTime: DOMHighResTimeStamp = 0;
let keysPressed: Set<string> = new Set();
let audioContext: AudioContext;
let bgmSource: AudioBufferSourceNode | null = null;
let currentBGM: string | null = null;

let backgroundY: number = 0;

// Utility classes
class Vector2 {
    constructor(public x: number, public y: number) { }
}

class GameObject {
    constructor(
        public pos: Vector2,
        public width: number,
        public height: number,
        public imageName: string | null = null,
        public color: string = "#fff"
    ) { }

    draw(ctx: CanvasRenderingContext2D, assets: LoadedAssets) {
        if (this.imageName && assets.images[this.imageName]) {
            const img = assets.images[this.imageName];
            ctx.drawImage(img, this.pos.x - this.width / 2, this.pos.y - this.height / 2, this.width, this.height);
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.pos.x - this.width / 2, this.pos.y - this.height / 2, this.width, this.height);
        }
    }

    getBounds() {
        return {
            left: this.pos.x - this.width / 2,
            right: this.pos.x + this.width / 2,
            top: this.pos.y - this.height / 2,
            bottom: this.pos.y + this.height / 2
        };
    }

    isColliding(other: GameObject): boolean {
        const b1 = this.getBounds();
        const b2 = other.getBounds();

        return b1.left < b2.right &&
               b1.right > b2.left &&
               b1.top < b2.bottom &&
               b1.bottom > b2.top;
    }
}

class Player extends GameObject {
    health: number;
    speed: number;
    fireRate: number;
    canShoot: boolean = true;
    lastShotTime: number = 0;
    bulletTypeConfig: BulletTypeConfig;

    constructor(pos: Vector2, config: PlayerConfig, bulletConfig: BulletTypeConfig, gameSettings: GameSettings) {
        super(pos, config.width, config.height, config.imageName);
        this.health = gameSettings.playerHealth;
        this.speed = gameSettings.playerSpeed;
        this.fireRate = gameSettings.playerFireRate;
        this.bulletTypeConfig = bulletConfig;
    }

    update(deltaTime: number, keysPressed: Set<string>, gameData: GameData) {
        let dx = 0;
        let dy = 0;

        if (keysPressed.has("ArrowLeft") || keysPressed.has("a")) dx = -1;
        if (keysPressed.has("ArrowRight") || keysPressed.has("d")) dx = 1;
        if (keysPressed.has("ArrowUp") || keysPressed.has("w")) dy = -1;
        if (keysPressed.has("ArrowDown") || keysPressed.has("s")) dy = 1;

        if (dx !== 0 && dy !== 0) {
            const mag = Math.sqrt(dx * dx + dy * dy);
            dx /= mag;
            dy /= mag;
        }

        this.pos.x += dx * this.speed * deltaTime;
        this.pos.y += dy * this.speed * deltaTime;

        this.pos.x = Math.max(this.width / 2, Math.min(gameData.gameSettings.canvasWidth - this.width / 2, this.pos.x));
        this.pos.y = Math.max(this.height / 2, Math.min(gameData.gameSettings.canvasHeight - this.height / 2, this.pos.y));

        if ((keysPressed.has("Space") || keysPressed.has(" ")) && this.canShoot) {
            this.shoot();
            this.canShoot = false;
            this.lastShotTime = performance.now();
        }

        if (!this.canShoot && (performance.now() - this.lastShotTime) / 1000 >= (1 / this.fireRate)) {
            this.canShoot = true;
        }
    }

    shoot() {
        const bullet = new Bullet(
            new Vector2(this.pos.x, this.pos.y - this.height / 2),
            this.bulletTypeConfig.width,
            this.bulletTypeConfig.height,
            this.bulletTypeConfig.imageName,
            this.bulletTypeConfig.damage,
            0, // Player bullets shoot straight up, so velX is 0
            -this.bulletTypeConfig.speed, // velY is negative for upwards movement
            "player"
        );
        bullets.push(bullet);
        playSFX("shoot", gameData.assets.sounds.find(s => s.name === "shoot")?.volume || 0.5);
    }

    takeDamage(damage: number) {
        this.health -= damage;
        playSFX("hit", gameData.assets.sounds.find(s => s.name === "hit")?.volume || 0.4);
        if (this.health <= 0) {
            currentGameState = GameState.GAME_OVER;
            playSFX("explosion", gameData.assets.sounds.find(s => s.name === "explosion")?.volume || 0.7);
            spawnExplosion(this.pos.x, this.pos.y, gameData.gameSettings.explosionParticleCount);
        }
    }
}

class Bullet extends GameObject {
    damage: number;
    velX: number; // Velocity in X direction
    velY: number; // Velocity in Y direction
    shooter: "player" | "enemy";

    // Constructor now takes velX and velY instead of a single 'speed'
    constructor(pos: Vector2, width: number, height: number, imageName: string, damage: number, velX: number, velY: number, shooter: "player" | "enemy") {
        super(pos, width, height, imageName);
        this.damage = damage;
        this.velX = velX;
        this.velY = velY;
        this.shooter = shooter;
    }

    update(deltaTime: number) {
        this.pos.x += this.velX * deltaTime;
        this.pos.y += this.velY * deltaTime;
    }
}

class Enemy extends GameObject {
    health: number;
    speed: number;
    scoreValue: number;
    fireRate: number;
    lastShotTime: number = 0;
    bulletTypeConfig: BulletTypeConfig | null;
    isBoss: boolean = false;

    constructor(pos: Vector2, typeConfig: EnemyTypeConfig, bulletConfig: BulletTypeConfig | null) {
        super(pos, typeConfig.width, typeConfig.height, typeConfig.imageName);
        this.health = typeConfig.health;
        this.speed = typeConfig.speed;
        this.scoreValue = typeConfig.scoreValue;
        this.fireRate = typeConfig.fireRate;
        this.bulletTypeConfig = bulletConfig;
    }

    update(deltaTime: number, playerPos: Vector2, gameData: GameData) {
        this.pos.y += this.speed * deltaTime;

        // Only allow shooting if on screen and has a bullet type and fire rate
        if (this.pos.y > 0 && this.pos.y < gameData.gameSettings.canvasHeight && this.bulletTypeConfig && this.fireRate > 0) {
            if ((performance.now() - this.lastShotTime) / 1000 >= (1 / this.fireRate)) {
                this.shoot(playerPos, gameData.gameSettings.enemyBulletSpeed); // Pass playerPos and default enemy bullet speed
                this.lastShotTime = performance.now();
            }
        }
    }

    shoot(playerPos: Vector2, customBulletSpeed: number | null = null) {
        if (!this.bulletTypeConfig) return;

        const bulletSpeed = customBulletSpeed !== null ? customBulletSpeed : this.bulletTypeConfig.speed;

        const startX = this.pos.x;
        const startY = this.pos.y + this.height / 2; // Bullet originates from bottom center of enemy

        // Calculate direction vector towards player
        const dirX = playerPos.x - startX;
        const dirY = playerPos.y - startY;
        const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);

        let velX = 0;
        let velY = bulletSpeed; // Default to straight down if magnitude is zero or for safety

        if (magnitude > 0) {
            velX = (dirX / magnitude) * bulletSpeed;
            velY = (dirY / magnitude) * bulletSpeed;
        }

        const bullet = new Bullet(
            new Vector2(startX, startY),
            this.bulletTypeConfig.width,
            this.bulletTypeConfig.height,
            this.bulletTypeConfig.imageName,
            this.bulletTypeConfig.damage,
            velX, // Calculated X velocity
            velY, // Calculated Y velocity
            "enemy"
        );
        bullets.push(bullet);
        playSFX("enemy_shoot", gameData.assets.sounds.find(s => s.name === "enemy_shoot")?.volume || 0.3);
    }

    takeDamage(damage: number) {
        this.health -= damage;
        if (this.health <= 0) {
            score += this.scoreValue;
            playSFX("explosion", gameData.assets.sounds.find(s => s.name === "explosion")?.volume || 0.7);
            spawnExplosion(this.pos.x, this.pos.y, gameData.gameSettings.explosionParticleCount);
            return true;
        }
        playSFX("hit", gameData.assets.sounds.find(s => s.name === "hit")?.volume || 0.4);
        return false;
    }
}

class Boss extends Enemy {
    bossConfig: BossTypeConfig;
    currentPhase: number = 0;
    phaseTimer: number = 0;
    targetX: number = 0;

    constructor(pos: Vector2, bossConfig: BossTypeConfig, bulletConfig: BulletTypeConfig | null) {
        super(pos, {
            ...bossConfig,
            fireRate: bossConfig.fireRate,
            bulletType: bossConfig.bulletType
        }, bulletConfig);
        this.bossConfig = bossConfig;
        this.isBoss = true;
        this.health = bossConfig.health;
        this.targetX = pos.x;
    }

    update(deltaTime: number, playerPos: Vector2, gameData: GameData) {
        this.phaseTimer += deltaTime;

        const currentPhaseConfig = this.bossConfig.phases[this.currentPhase];
        if (!currentPhaseConfig) {
            return;
        }

        const effectiveFireRate = this.bossConfig.fireRate * currentPhaseConfig.fireRateMultiplier;
        // Use enemyBulletSpeed from gameSettings if bulletTypeConfig is null, otherwise use its speed
        const baseBulletSpeed = this.bulletTypeConfig?.speed || gameData.gameSettings.enemyBulletSpeed;
        const effectiveBulletSpeed = baseBulletSpeed * currentPhaseConfig.bulletSpeedMultiplier;

        switch (currentPhaseConfig.movementPattern) {
            case "hover":
                if (this.pos.y < gameData.gameSettings.bossSpawnHeight) {
                    this.pos.y += this.speed * deltaTime / 2;
                } else {
                    this.pos.x += Math.sin(this.phaseTimer * 0.5) * this.speed * deltaTime * 0.2;
                }
                break;
            case "charge":
                if (this.pos.y < gameData.gameSettings.bossSpawnHeight) {
                    this.pos.y += this.speed * deltaTime / 2;
                } else {
                    if (this.phaseTimer < currentPhaseConfig.duration / 2) {
                        this.targetX = playerPos.x;
                    } else {
                        this.targetX = gameData.gameSettings.canvasWidth / 2;
                    }
                    const dx = this.targetX - this.pos.x;
                    this.pos.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * deltaTime);
                }
                break;
            case "zigzag":
                if (this.pos.y < gameData.gameSettings.bossSpawnHeight) {
                    this.pos.y += this.speed * deltaTime / 2;
                } else {
                     this.pos.x += Math.sin(this.phaseTimer * 2) * this.speed * deltaTime;
                }
                break;
            case "sideways":
                if (this.pos.y < gameData.gameSettings.bossSpawnHeight) {
                    this.pos.y += this.speed * deltaTime / 2;
                } else {
                    this.pos.x += Math.sin(this.phaseTimer * 4) * this.speed * deltaTime * 1.5;
                }
                break;
        }

        this.pos.x = Math.max(this.width / 2, Math.min(gameData.gameSettings.canvasWidth - this.width / 2, this.pos.x));

        if (this.bulletTypeConfig && effectiveFireRate > 0) {
            if ((performance.now() - this.lastShotTime) / 1000 >= (1 / effectiveFireRate)) {
                this.shoot(playerPos, effectiveBulletSpeed); // Pass playerPos and calculated effective bullet speed
                this.lastShotTime = performance.now();
            }
        }

        if (this.phaseTimer >= currentPhaseConfig.duration) {
            this.currentPhase = (this.currentPhase + 1) % this.bossConfig.phases.length;
            this.phaseTimer = 0;
        }
    }

    shoot(playerPos: Vector2, bulletSpeed: number | null = null) {
        if (!this.bulletTypeConfig) return;
        const currentBulletSpeed = bulletSpeed !== null ? bulletSpeed : this.bulletTypeConfig.speed;

        const startX = this.pos.x;
        const startY = this.pos.y + this.height / 2; // Bullet originates from bottom center of boss

        // Calculate direction vector towards player
        const dirX = playerPos.x - startX;
        const dirY = playerPos.y - startY;
        const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);

        let velX = 0;
        let velY = currentBulletSpeed; // Default to straight down if magnitude is zero or for safety

        if (magnitude > 0) {
            velX = (dirX / magnitude) * currentBulletSpeed;
            velY = (dirY / magnitude) * currentBulletSpeed;
        }

        const bullet = new Bullet(
            new Vector2(startX, startY),
            this.bulletTypeConfig.width,
            this.bulletTypeConfig.height,
            this.bulletTypeConfig.imageName,
            this.bulletTypeConfig.damage,
            velX, // Calculated X velocity
            velY, // Calculated Y velocity
            "enemy"
        );
        bullets.push(bullet);
        playSFX("enemy_shoot", gameData.assets.sounds.find(s => s.name === "enemy_shoot")?.volume || 0.3);
    }
}


class Particle extends GameObject {
    lifeTime: number;
    currentLife: number = 0;
    vel: Vector2;
    initialColor: string;
    targetColor: string;

    constructor(pos: Vector2, size: number, lifeTime: number, vel: Vector2, initialColor: string, targetColor: string = initialColor) {
        super(pos, size, size, null, initialColor);
        this.lifeTime = lifeTime;
        this.vel = vel;
        this.initialColor = initialColor;
        this.targetColor = targetColor;
    }

    update(deltaTime: number) {
        this.currentLife += deltaTime;
        this.pos.x += this.vel.x * deltaTime;
        this.pos.y += this.vel.y * deltaTime;

        const t = this.currentLife / this.lifeTime;
        const r1 = parseInt(this.initialColor.substring(1, 3), 16);
        const g1 = parseInt(this.initialColor.substring(3, 5), 16);
        const b1 = parseInt(this.initialColor.substring(5, 7), 16);

        const r2 = parseInt(this.targetColor.substring(1, 3), 16);
        const g2 = parseInt(this.targetColor.substring(3, 5), 16);
        const b2 = parseInt(this.targetColor.substring(5, 7), 16);

        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);

        this.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    draw(ctx: CanvasRenderingContext2D, assets: LoadedAssets) {
        const alpha = 1 - (this.currentLife / this.lifeTime);
        if (alpha <= 0) return;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.width / 2 * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    isAlive(): boolean {
        return this.currentLife < this.lifeTime;
    }
}

// Level management
let activeLevel: LevelConfig | null = null;
let currentWaveIndex: number = 0;
let waveSpawnTimer: number = 0;
let enemiesToSpawnInCurrentWave: WaveEnemySpawn[] = [];
let isBossActive: boolean = false;
let bossInstance: Boss | null = null;

async function loadJson(path: string): Promise<any> {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load JSON from ${path}: ${response.statusText}`);
    }
    return response.json();
}

async function loadImage(asset: ImageAsset): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = asset.path;
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${asset.path}`));
    });
}

async function loadSound(asset: SoundAsset): Promise<AudioBuffer> {
    if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const response = await fetch(asset.path);
    if (!response.ok) {
        throw new Error(`Failed to load sound: ${asset.path}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Promise((resolve, reject) => {
        audioContext.decodeAudioData(arrayBuffer, resolve, reject);
    });
}

async function loadAssets() {
    currentGameState = GameState.LOADING;
    try {
        gameData = await loadJson("data.json");

        const imagePromises = gameData.assets.images.map(async (imgAsset: ImageAsset) => {
            assets.images[imgAsset.name] = await loadImage(imgAsset);
        });

        const soundPromises = gameData.assets.sounds.map(async (sndAsset: SoundAsset) => {
            assets.sounds[sndAsset.name] = await loadSound(sndAsset);
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded!");
        currentGameState = GameState.MENU;
        playBGM("bgm_menu", gameData.assets.sounds.find(s => s.name === "bgm_menu")?.volume || 0.5, true);
    } catch (error) {
        console.error("Error loading game data or assets:", error);
    }
}

function playSFX(soundName: string, volume: number = 1.0) {
    if (!audioContext || !assets.sounds[soundName]) return;

    const source = audioContext.createBufferSource();
    source.buffer = assets.sounds[soundName];

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
}

function playBGM(soundName: string, volume: number = 0.5, loop: boolean = true) {
    if (!audioContext || !assets.sounds[soundName] || currentBGM === soundName) return;

    stopBGM();

    bgmSource = audioContext.createBufferSource();
    bgmSource.buffer = assets.sounds[soundName];
    bgmSource.loop = loop;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

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

    gameCanvas.width = 800;
    gameCanvas.height = 600;

    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && currentGameState === GameState.MENU) {
            currentGameState = GameState.CONTROLS;
            return;
        }
        if (e.key === "Enter" && currentGameState === GameState.CONTROLS) {
            startGame();
            return;
        }
        keysPressed.add(e.key);
    });
    document.addEventListener("keyup", (e) => keysPressed.delete(e.key));

    loadAssets().then(() => {
        if (gameData && gameData.gameSettings) {
            gameCanvas.width = gameData.gameSettings.canvasWidth;
            gameCanvas.height = gameData.gameSettings.canvasHeight;
        }
    });

    requestAnimationFrame(gameLoop);
}

function startGame() {
    currentGameState = GameState.PLAYING;
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

    const playerConfig = gameData.player;
    const playerBulletConfig = gameData.bulletTypes[playerConfig.bulletImageName];
    if (!playerBulletConfig) {
        console.error("Player bullet type config not found:", playerConfig.bulletImageName);
        return;
    }
    player = new Player(
        new Vector2(gameData.gameSettings.canvasWidth / 2, gameData.gameSettings.canvasHeight - 50),
        playerConfig,
        playerBulletConfig,
        gameData.gameSettings
    );

    loadLevel(currentLevelIndex);
    playBGM("bgm_game", gameData.assets.sounds.find(s => s.name === "bgm_game")?.volume || 0.3, true);
}

function loadLevel(levelIndex: number) {
    if (levelIndex >= gameData.levels.length) {
        console.log("All levels cleared! Game Won!");
        currentGameState = GameState.MENU;
        stopBGM();
        playBGM("bgm_menu", gameData.assets.sounds.find(s => s.name === "bgm_menu")?.volume || 0.5, true);
        return;
    }

    activeLevel = gameData.levels[levelIndex];
    if (!activeLevel) {
        console.error("Level configuration not found for index:", levelIndex);
        return;
    }

    levelTimer = 0;
    currentWaveIndex = 0;
    enemies = [];
    bullets = bullets.filter(b => b.shooter === "player"); // Clear enemy bullets
    isBossActive = false;
    bossInstance = null;
    enemiesToSpawnInCurrentWave = [];
}

function spawnEnemy(enemyType: string, x: number, y: number) {
    const enemyConfig = gameData.enemyTypes[enemyType];
    if (!enemyConfig) {
        console.error("Unknown enemy type:", enemyType);
        return;
    }

    const enemyBulletConfig = enemyConfig.bulletType ? gameData.bulletTypes[enemyConfig.bulletType] : null;

    const enemy = new Enemy(
        new Vector2(x, y),
        enemyConfig,
        enemyBulletConfig
    );
    enemies.push(enemy);
}

function spawnBoss(bossType: string) {
    const bossConfig = gameData.bossTypes[bossType];
    if (!bossConfig) {
        console.error("Unknown boss type:", bossType);
        return;
    }
    const bossBulletConfig = bossConfig.bulletType ? gameData.bulletTypes[bossConfig.bulletType] : null;

    bossInstance = new Boss(
        new Vector2(gameData.gameSettings.canvasWidth / 2, -bossConfig.height / 2),
        bossConfig,
        bossBulletConfig
    );
    enemies.push(bossInstance);
    isBossActive = true;
    console.log(`Boss ${bossType} spawned!`);
}

function spawnExplosion(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 100 + 50;
        const vel = new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
        const size = Math.random() * 5 + 5;
        const life = Math.random() * gameData.gameSettings.explosionParticleLife + 0.1;
        particles.push(new Particle(new Vector2(x, y), size, life, vel, "#FFA500", "#FF0000"));
    }
}

function gameLoop(currentTime: DOMHighResTimeStamp) {
    requestAnimationFrame(gameLoop);

    const deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;

    if (deltaTime > 0.1) return; // Cap deltaTime to prevent physics weirdness on lag spikes

    update(deltaTime);
    draw();
}

function update(deltaTime: number) {
    if (!gameData) return;

    backgroundY = (backgroundY + gameData.gameSettings.scrollSpeed * deltaTime) % gameData.gameSettings.canvasHeight;

    switch (currentGameState) {
        case GameState.LOADING:
            break;
        case GameState.MENU:
            // Input handled by global keydown listener
            break;
        case GameState.CONTROLS:
            // Input handled by global keydown listener
            break;
        case GameState.PLAYING:
            if (player.health <= 0) {
                currentGameState = GameState.GAME_OVER;
                stopBGM();
                playBGM("bgm_menu", gameData.assets.sounds.find(s => s.name === "bgm_menu")?.volume || 0.5, true);
                return;
            }

            player.update(deltaTime, keysPressed, gameData);

            if (activeLevel) {
                levelTimer += deltaTime;

                if (!isBossActive) {
                    if (enemiesToSpawnInCurrentWave.length > 0) {
                        waveSpawnTimer += deltaTime;
                        const currentSpawnGroup = enemiesToSpawnInCurrentWave[0];

                        if (waveSpawnTimer >= currentSpawnGroup.spawnDelay) {
                            const x = Math.random() * (gameData.gameSettings.canvasWidth - 60) + 30;
                            const y = -50;
                            spawnEnemy(currentSpawnGroup.type, x, y);
                            currentSpawnGroup.count--;

                            if (currentSpawnGroup.count <= 0) {
                                enemiesToSpawnInCurrentWave.shift();
                                waveSpawnTimer = 0;
                            } else {
                                waveSpawnTimer = 0; // Reset for next enemy in group
                            }
                        }
                    } else {
                        // Check if current wave has finished and if there are more waves
                        while (currentWaveIndex < activeLevel.waves.length && activeLevel.waves[currentWaveIndex].time <= levelTimer) {
                            for (const group of activeLevel.waves[currentWaveIndex].enemies) {
                                enemiesToSpawnInCurrentWave.push({ ...group });
                            }
                            currentWaveIndex++;
                            waveSpawnTimer = 0;
                        }
                    }

                    // Conditions for boss spawn
                    const allWavesProcessed = currentWaveIndex >= activeLevel.waves.length && enemiesToSpawnInCurrentWave.length === 0;
                    const noRegularEnemiesOnScreen = !enemies.some(e => !e.isBoss); // Check if any non-boss enemy exists

                    if (!bossInstance && levelTimer >= activeLevel.duration && allWavesProcessed && noRegularEnemiesOnScreen) {
                        spawnBoss(activeLevel.bossType);
                    }
                }
            }

            for (let i = bullets.length - 1; i >= 0; i--) {
                const bullet = bullets[i];
                bullet.update(deltaTime);
                // Remove bullets that go off-screen
                if (bullet.pos.y < -bullet.height || bullet.pos.y > gameData.gameSettings.canvasHeight + bullet.height ||
                    bullet.pos.x < -bullet.width || bullet.pos.x > gameData.gameSettings.canvasWidth + bullet.width) {
                    bullets.splice(i, 1);
                }
            }

            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                enemy.update(deltaTime, player.pos, gameData); // Pass player's position for targeting

                // Remove non-boss enemies that go off-screen
                if (!enemy.isBoss && enemy.pos.y > gameData.gameSettings.canvasHeight + enemy.height / 2) {
                    enemies.splice(i, 1);
                    continue;
                }

                // Enemy collision with player
                if (player.isColliding(enemy)) {
                    player.takeDamage(1); // Player takes damage on contact
                    if (!enemy.isBoss) { // Regular enemies are destroyed on contact
                        spawnExplosion(enemy.pos.x, enemy.pos.y, gameData.gameSettings.explosionParticleCount);
                        playSFX("explosion", gameData.assets.sounds.find(s => s.name === "explosion")?.volume || 0.7);
                        enemies.splice(i, 1);
                        continue;
                    }
                }

                // Player bullet collision with enemy
                for (let j = bullets.length - 1; j >= 0; j--) {
                    const bullet = bullets[j];
                    if (bullet.shooter === "player" && bullet.isColliding(enemy)) {
                        bullets.splice(j, 1); // Destroy bullet on hit
                        if (enemy.takeDamage(bullet.damage)) { // Enemy is destroyed
                            if (enemy.isBoss) {
                                bossInstance = null;
                                isBossActive = false;
                                enemies.splice(i, 1); // Remove boss
                                currentGameState = GameState.LEVEL_CLEAR;
                                stopBGM();
                                playBGM("bgm_menu", gameData.assets.sounds.find(s => s.name === "bgm_menu")?.volume || 0.5, true);
                                break; // Boss defeated, break inner loop to avoid iterating over removed enemy
                            } else {
                                enemies.splice(i, 1); // Remove regular enemy
                                break; // Enemy destroyed, break inner loop
                            }
                        }
                    }
                }
            }

            // Enemy bullet collision with player
            for (let i = bullets.length - 1; i >= 0; i--) {
                const bullet = bullets[i];
                if (bullet.shooter === "enemy" && bullet.isColliding(player)) {
                    bullets.splice(i, 1); // Destroy bullet on hit
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
                startGame();
            }
            break;
        case GameState.LEVEL_CLEAR:
            if (keysPressed.has("Enter")) {
                currentLevelIndex++;
                if (currentLevelIndex < gameData.levels.length) {
                    loadLevel(currentLevelIndex);
                    currentGameState = GameState.PLAYING;
                    playBGM("bgm_game", gameData.assets.sounds.find(s => s.name === "bgm_game")?.volume || 0.3, true);
                } else {
                    console.log("Game Finished! All levels cleared!");
                    currentGameState = GameState.MENU; // Back to menu after winning all levels
                    stopBGM();
                    playBGM("bgm_menu", gameData.assets.sounds.find(s => s.name === "bgm_menu")?.volume || 0.5, true);
                }
            }
            break;
    }
}

function draw() {
    if (!ctx || !gameData) return;

    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Draw background (MODIFIED PART)
    const bgImageName = gameData.gameSettings.backgroundImageName;
    const bgImage = assets.images[bgImageName];

    if (bgImage) {
        // Draw the background image, handling vertical scrolling
        // We draw it twice to create a seamless loop
        ctx.drawImage(bgImage, 0, backgroundY, gameCanvas.width, gameCanvas.height);
        ctx.drawImage(bgImage, 0, backgroundY - gameCanvas.height, gameCanvas.width, gameCanvas.height);
    } else {
        // Fallback to solid color if background image not found or not specified
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
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
            drawText("게임 조작법", gameCanvas.width / 2, gameCanvas.height / 2 - 100, "#FFF", 40, "center");
            drawText("이동: WASD 또는 화살표 키", gameCanvas.width / 2, gameCanvas.height / 2 - 20, "#FFF", 25, "center");
            drawText("발사: Spacebar", gameCanvas.width / 2, gameCanvas.height / 2 + 20, "#FFF", 25, "center");
            drawText("Press ENTER to Play", gameCanvas.width / 2, gameCanvas.height / 2 + 100, "#FFF", 30, "center");
            break;
        case GameState.PLAYING:
            player.draw(ctx, assets);
            bullets.forEach(bullet => bullet.draw(ctx, assets));
            enemies.forEach(enemy => enemy.draw(ctx, assets));
            particles.forEach(particle => particle.draw(ctx, assets));

            drawText(`Score: ${score}`, 10, 30, "#FFF", 20);
            drawText(`Health: ${player.health}`, 10, 60, "#FFF", 20);
            drawText(`Level: ${currentLevelIndex + 1}`, gameCanvas.width - 10, 30, "#FFF", 20, "right");

            if (bossInstance) {
                const barWidth = 200;
                const barHeight = 20;
                const barX = gameCanvas.width / 2 - barWidth / 2;
                const barY = 10;
                ctx.fillStyle = "#000";
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = "#F00";
                const healthRatio = bossInstance.health / bossInstance.bossConfig.health;
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
            drawText("Press ENTER for Next Level", gameCanvas.width / 2, gameCanvas.height / 2 + 50, "#FFF", 30, "center");
            break;
    }
}

function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = "left") {
    ctx.fillStyle = color;
    ctx.font = `${size}px Arial`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
}

document.addEventListener("DOMContentLoaded", initGame);
