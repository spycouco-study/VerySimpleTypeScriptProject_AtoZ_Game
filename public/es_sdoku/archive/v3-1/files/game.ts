// Enums for game states and input keys
enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER
}

enum InputKey {
    ARROW_LEFT = "ArrowLeft",
    ARROW_RIGHT = "ArrowRight",
    ARROW_UP = "ArrowUp",
    ARROW_DOWN = "ArrowDown",
    SPACE = " ",
    ENTER = "Enter",
    KEY_G = "g" // Added for debugging game over transition
}

// Interfaces for data.json structure
interface ImageConfig {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundConfig {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface AssetsConfig {
    images: ImageConfig[];
    sounds: SoundConfig[];
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    titleText: string;
    startInstruction: string;
    gameOverText: string;
    restartInstruction: string; // Added restart instruction
    titleTextColor: string;
    backgroundColor: string;
    fontFamily: string;
}

interface PlayerSettings {
    imageName: string;
    initialX: number;
    initialY: number;
    width: number;
    height: number;
    speed: number;
}

interface BulletSettings {
    imageName: string;
    width: number;
    height: number;
    speed: number;
    fireRate: number; // Bullets per second
}

interface GameConfig {
    gameSettings: GameSettings;
    playerSettings: PlayerSettings;
    bulletSettings: BulletSettings; // Added bullet settings
    assets: AssetsConfig;
}

// Global game variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameConfig: GameConfig;
let loadedImages: Map<string, HTMLImageElement> = new Map();
let loadedSounds: Map<string, HTMLAudioElement> = new Map();
let inputState: Set<InputKey> = new Set();
let currentState: GameState = GameState.TITLE;
let lastFrameTime: number = 0;
let player: Player;
let playerBullets: Bullet[] = []; // Array to hold active player bullets
let backgroundMusic: HTMLAudioElement | undefined;

// Game Object base class (can be extended for enemies, bullets etc.)
class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    imageName: string;
    protected image: HTMLImageElement | undefined;

    constructor(x: number, y: number, width: number, height: number, imageName: string, images: Map<string, HTMLImageElement>) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageName = imageName;
        this.image = images.get(imageName);
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            // Fallback: draw a colored rectangle if image not found
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

// Player class
class Player extends GameObject {
    speed: number;
    private bulletSettings: BulletSettings;
    private fireDelay: number; // Time between shots
    private fireCooldown: number = 0; // Current cooldown

    constructor(playerSettings: PlayerSettings, bulletSettings: BulletSettings, images: Map<string, HTMLImageElement>) {
        super(playerSettings.initialX, playerSettings.initialY, playerSettings.width, playerSettings.height, playerSettings.imageName, images);
        this.speed = playerSettings.speed;
        this.bulletSettings = bulletSettings;
        this.fireDelay = 1 / bulletSettings.fireRate;
    }

    update(deltaTime: number): void {
        let dx = 0;
        let dy = 0;

        if (inputState.has(InputKey.ARROW_LEFT)) dx -= this.speed * deltaTime;
        if (inputState.has(InputKey.ARROW_RIGHT)) dx += this.speed * deltaTime;
        if (inputState.has(InputKey.ARROW_UP)) dy -= this.speed * deltaTime;
        if (inputState.has(InputKey.ARROW_DOWN)) dy += this.speed * deltaTime;

        this.x += dx;
        this.y += dy;

        // Clamp player position within canvas boundaries
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
        this.y = Math.max(0, Math.min(canvas.height - this.height, this.y));

        // Update fire cooldown
        if (this.fireCooldown > 0) {
            this.fireCooldown -= deltaTime;
        }

        // Player shooting logic
        if (inputState.has(InputKey.SPACE) && this.fireCooldown <= 0) {
            this.fireCooldown = this.fireDelay; // Reset cooldown

            // Create a new bullet
            const bulletX = this.x + (this.width / 2) - (this.bulletSettings.width / 2); // Center bullet
            const bulletY = this.y; // Start at player's top edge
            const newBullet = new Bullet(
                bulletX,
                bulletY,
                this.bulletSettings.width,
                this.bulletSettings.height,
                this.bulletSettings.imageName,
                this.bulletSettings.speed,
                loadedImages
            );
            playerBullets.push(newBullet); // Add to global bullet array

            // Play shoot sound
            const shootSound = loadedSounds.get("shoot_sound");
            if (shootSound) {
                // Clone the sound to allow multiple concurrent plays without cutting off previous ones
                const clonedSound = shootSound.cloneNode() as HTMLAudioElement;
                clonedSound.volume = shootSound.volume;
                clonedSound.play().catch(e => console.error("Shoot sound playback failed:", e));
            }
        }
    }
}

// Bullet class
class Bullet extends GameObject {
    speed: number;

    constructor(x: number, y: number, width: number, height: number, imageName: string, speed: number, images: Map<string, HTMLImageElement>) {
        super(x, y, width, height, imageName, images);
        this.speed = speed;
    }

    update(deltaTime: number): void {
        this.y -= this.speed * deltaTime; // Move upwards
    }
}

// Fetches game configuration from data.json
async function loadGameData(): Promise<GameConfig> {
    const response = await fetch('data.json');
    if (!response.ok) {
        throw new Error(`Failed to load data.json: ${response.statusText}`);
    }
    return response.json();
}

// Loads all image and sound assets
async function loadAssets(config: AssetsConfig): Promise<void> {
    const imagePromises: Promise<void>[] = [];
    const soundPromises: Promise<void>[] = [];

    // Load images
    for (const imgConfig of config.images) {
        const img = new Image();
        img.src = imgConfig.path;
        const promise = new Promise<void>((resolve, reject) => {
            img.onload = () => {
                loadedImages.set(imgConfig.name, img);
                resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${imgConfig.path}`));
        });
        imagePromises.push(promise);
    }

    // Load sounds
    for (const soundConfig of config.sounds) {
        const audio = new Audio(soundConfig.path);
        audio.volume = soundConfig.volume;
        const promise = new Promise<void>((resolve, reject) => {
            audio.oncanplaythrough = () => {
                loadedSounds.set(soundConfig.name, audio);
                resolve();
            };
            audio.onerror = () => reject(new Error(`Failed to load sound: ${soundConfig.path}`));
            // Ensure load() is called for some browsers to fire canplaythrough
            audio.load();
        });
        soundPromises.push(promise);
    }

    await Promise.all([...imagePromises, ...soundPromises]);
}

// Resets game elements to their initial state for a new game
function resetGame(): void {
    player.x = gameConfig.playerSettings.initialX;
    player.y = gameConfig.playerSettings.initialY;
    playerBullets = []; // Clear all active bullets
    // Any other game state (e.g., enemies, score) would be reset here.
}

// Game loop functions
function update(deltaTime: number): void {
    switch (currentState) {
        case GameState.TITLE:
            if (inputState.has(InputKey.SPACE)) {
                currentState = GameState.PLAYING;
                inputState.delete(InputKey.SPACE); // Consume the input

                resetGame(); // Reset game state for a fresh start

                // Play BGM when game starts
                if (backgroundMusic) {
                    backgroundMusic.loop = true;
                    backgroundMusic.currentTime = 0; // Rewind BGM
                    backgroundMusic.play().catch(e => console.error("Background music playback failed:", e));
                }
                const startSound = loadedSounds.get("start_sound");
                if (startSound) {
                    startSound.currentTime = 0; // Rewind to start
                    startSound.play().catch(e => console.error("Start sound playback failed:", e));
                }
            }
            break;
        case GameState.PLAYING:
            player.update(deltaTime);

            // Update player bullets
            for (let i = playerBullets.length - 1; i >= 0; i--) {
                const bullet = playerBullets[i];
                bullet.update(deltaTime);

                // Remove bullets that go off-screen
                if (bullet.y + bullet.height < 0) {
                    playerBullets.splice(i, 1);
                }
            }
            // Add more game logic here (e.g., enemy movement, collisions, scoring)

            // Temporary Game Over trigger for demonstration (e.g., if player presses 'g')
            if (inputState.has(InputKey.KEY_G)) {
                currentState = GameState.GAME_OVER;
                inputState.delete(InputKey.KEY_G); // Consume input
                if (backgroundMusic) {
                    backgroundMusic.pause(); // Pause BGM
                }
                const gameOverSound = loadedSounds.get("explosion_sound"); // Repurpose existing sound for game over
                if (gameOverSound) {
                    const clonedSound = gameOverSound.cloneNode() as HTMLAudioElement;
                    clonedSound.volume = gameOverSound.volume;
                    clonedSound.currentTime = 0;
                    clonedSound.play().catch(e => console.error("Game Over sound playback failed:", e));
                }
            }
            break;
        case GameState.GAME_OVER:
            // Wait for restart input
            if (inputState.has(InputKey.ENTER)) {
                currentState = GameState.TITLE; // Transition back to title screen
                inputState.delete(InputKey.ENTER); // Consume the input
            }
            break;
    }
}

function draw(): void {
    // Clear canvas
    ctx.fillStyle = gameConfig.gameSettings.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `48px ${gameConfig.gameSettings.fontFamily}`;
    ctx.fillStyle = gameConfig.gameSettings.titleTextColor;
    ctx.textAlign = 'center';

    switch (currentState) {
        case GameState.TITLE:
            ctx.fillText(gameConfig.gameSettings.titleText, canvas.width / 2, canvas.height / 2 - 50);
            ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`;
            ctx.fillText(gameConfig.gameSettings.startInstruction, canvas.width / 2, canvas.height / 2 + 20);
            break;
        case GameState.PLAYING:
            player.draw(ctx);
            // Draw player bullets
            for (const bullet of playerBullets) {
                bullet.draw(ctx);
            }
            // Draw other game elements (enemies, bullets, score, etc.)
            break;
        case GameState.GAME_OVER:
            ctx.fillText(gameConfig.gameSettings.gameOverText, canvas.width / 2, canvas.height / 2);
            ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`; // Smaller font for instructions
            ctx.fillText(gameConfig.gameSettings.restartInstruction, canvas.width / 2, canvas.height / 2 + 50); // Display restart instruction
            break;
    }
}

function gameLoop(currentTime: number): void {
    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert ms to seconds
    lastFrameTime = currentTime;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

// Initialize game
async function init(): Promise<void> {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element with ID "gameCanvas" not found.');
        return;
    }
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    try {
        gameConfig = await loadGameData();
        console.log('Game data loaded:', gameConfig);

        canvas.width = gameConfig.gameSettings.canvasWidth;
        canvas.height = gameConfig.gameSettings.canvasHeight;

        await loadAssets(gameConfig.assets);
        console.log('Assets loaded:', loadedImages.size, 'images,', loadedSounds.size, 'sounds');

        player = new Player(gameConfig.playerSettings, gameConfig.bulletSettings, loadedImages); // Pass bulletSettings
        backgroundMusic = loadedSounds.get("bgm");

        // Input listeners
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            const key = e.key as InputKey;
            // Check if the pressed key is one of our defined InputKeys
            if (Object.values(InputKey).includes(key)) {
                inputState.add(key);
                e.preventDefault(); // Prevent default browser actions for game keys
            }
        });

        window.addEventListener('keyup', (e: KeyboardEvent) => {
            const key = e.key as InputKey;
            if (Object.values(InputKey).includes(key)) {
                inputState.delete(key);
            }
        });

        // Start the game loop
        lastFrameTime = performance.now();
        requestAnimationFrame(gameLoop);

    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
}

// Start the game initialization when the window loads
window.onload = init;