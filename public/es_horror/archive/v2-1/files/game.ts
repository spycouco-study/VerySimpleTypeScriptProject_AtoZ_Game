// Define interfaces for data.json structure to ensure type safety
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

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    playerSpeed: number;
    playerWidth: number;
    playerHeight: number;
    obstacleSpawnInterval: number; // in milliseconds
    obstacleMinSpeed: number; // pixels per second
    obstacleMaxSpeed: number; // pixels per second
    obstacleMinSize: number; // width/height in pixels
    obstacleMaxSize: number; // width/height in pixels
    scoreIncrement: number;
    titleScreenText: string;
    pressSpaceText: string;
    gameOverScreenText: string;
    titleScreenFont: string;
    scoreFont: string;
    gameOverFont: string;
    titleScreenTextColor: string;
    scoreTextColor: string;
    gameOverTextColor: string;
    playerImageName: string;
    obstacleImageName: string;
    bgmSoundName: string;
    gameOverSoundName: string;
}

interface GameData {
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
    gameSettings: GameSettings;
}

// --- Game State Variables ---
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData; // Stores parsed data.json content

// Maps to store loaded image and audio assets
interface LoadedAssets {
    images: Map<string, HTMLImageElement>;
    sounds: Map<string, HTMLAudioElement>;
}
const assets: LoadedAssets = {
    images: new Map(),
    sounds: new Map()
};

// Enum-like type for game states
type GameState = 'LOADING' | 'TITLE' | 'PLAYING' | 'GAME_OVER';
let currentGameState: GameState = 'LOADING';

// Time tracking for frame-rate independent updates
let lastTime = 0;
let deltaTime = 0; // Time elapsed since last frame, in seconds

// Player object
interface Player {
    x: number;
    y: number;
    width: number;
    height: number;
    dx: number; // Direction multiplier for horizontal movement (-1 for left, 1 for right, 0 for stationary)
}
let player: Player;

// Obstacle array
interface Obstacle {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number; // pixels per second
}
let obstacles: Obstacle[] = [];

let score = 0;
let obstacleSpawnTimer = 0; // Accumulator for obstacle spawning, in milliseconds

// Input state for keyboard presses
interface InputState {
    left: boolean;
    right: boolean;
    space: boolean;
}
const input: InputState = {
    left: false,
    right: false,
    space: false
};

// Audio elements for background music and sound effects
let backgroundMusic: HTMLAudioElement | null = null;
let gameOverEffect: HTMLAudioElement | null = null;


// --- Core Game Functions ---

/**
 * Initializes the game: fetches data, loads assets, sets up canvas and event listeners.
 */
async function loadGame() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("Failed to get 2D rendering context.");
        return;
    }

    try {
        // 1. Fetch game data from data.json
        const response = await fetch('data.json');
        gameData = await response.json();

        // 2. Set canvas dimensions from game settings
        canvas.width = gameData.gameSettings.canvasWidth;
        canvas.height = gameData.gameSettings.canvasHeight;

        // 3. Load all assets (images and sounds)
        await loadAssets();

        // 4. Initialize game state and start loop
        initGame();
        requestAnimationFrame(gameLoop);

    } catch (error) {
        console.error("Failed to load game data or assets:", error);
        // Display an error message on the canvas if loading fails
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("Failed to load game. Check console for details.", canvas.width / 2, canvas.height / 2);
    }
}

/**
 * Loads all image and sound assets specified in gameData.
 */
async function loadAssets() {
    currentGameState = 'LOADING'; // Indicate loading state
    // The loading text is now handled by the draw function when currentGameState is 'LOADING'

    const imagePromises = gameData.assets.images.map(img => {
        return new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = img.path;
            image.onload = () => {
                assets.images.set(img.name, image);
                resolve();
            };
            image.onerror = () => {
                console.warn(`Failed to load image: ${img.path}`);
                assets.images.set(img.name, new Image()); // Store a dummy image to prevent breaking drawAsset, but warn
                resolve(); // Resolve anyway to allow game to continue, potentially with fallbacks
            };
        });
    });

    const soundPromises = gameData.assets.sounds.map(snd => {
        return new Promise<void>((resolve, reject) => {
            const audio = new Audio(snd.path);
            audio.volume = snd.volume; // Set volume here during loading
            // Safari and other browsers require user interaction for media playback.
            // oncanplaythrough indicates the browser can play it, but it might not autoplay.
            audio.oncanplaythrough = () => {
                assets.sounds.set(snd.name, audio);
                resolve();
            };
            audio.onerror = () => {
                console.warn(`Failed to load sound: ${snd.path}`);
                assets.sounds.set(snd.name, new Audio()); // Store a dummy audio to prevent breaking
                resolve(); // Resolve anyway
            };
            // Fallback for cases where oncanplaythrough doesn't fire as expected (e.g., some formats/browsers)
            setTimeout(() => {
                if (!assets.sounds.has(snd.name)) {
                    assets.sounds.set(snd.name, audio);
                    resolve();
                }
            }, 1000); // Give it a second to load
        });
    });

    try {
        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    } catch (error) {
        console.error("Error loading assets (some may have failed but allowed progression):", error);
    }
}

/**
 * Sets up initial game state after assets are loaded, and registers event listeners.
 */
function initGame() {
    // Setup event listeners for player input
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Prepare audio elements
    backgroundMusic = assets.sounds.get(gameData.gameSettings.bgmSoundName) || null;
    if (backgroundMusic) {
        backgroundMusic.loop = true; // Loop background music
        // Volume is already set during loading in loadAssets, no need to set again here.
    }

    gameOverEffect = assets.sounds.get(gameData.gameSettings.gameOverSoundName) || null;
    if (gameOverEffect) {
        // Volume is already set during loading in loadAssets, no need to set again here.
    }

    currentGameState = 'TITLE'; // Start on the title screen
}

/**
 * Resets game state to start a new game (from title or game over screen).
 */
function newGame() {
    // Initialize player position and size
    player = {
        x: canvas.width / 2 - gameData.gameSettings.playerWidth / 2,
        y: canvas.height - gameData.gameSettings.playerHeight - 20,
        width: gameData.gameSettings.playerWidth,
        height: gameData.gameSettings.playerHeight,
        dx: 0 // Player starts stationary
    };
    obstacles = []; // Clear all obstacles
    score = 0; // Reset score
    obstacleSpawnTimer = 0; // Reset obstacle spawn timer

    currentGameState = 'PLAYING'; // Change state to playing
    input.space = false; // Consume the 'space' input that triggered newGame

    // Play background music (handling browser autoplay policies)
    if (backgroundMusic) {
        backgroundMusic.currentTime = 0; // Rewind to start
        backgroundMusic.play().catch(e => console.warn("Background music autoplay prevented:", e));
    }
}

/**
 * Main game loop, called continuously via requestAnimationFrame.
 * @param currentTime The DOMHighResTimeStamp for the current frame.
 */
function gameLoop(currentTime: number) {
    if (lastTime === 0) lastTime = currentTime;
    deltaTime = (currentTime - lastTime) / 1000; // Convert delta time to seconds
    lastTime = currentTime;

    update(deltaTime); // Update game logic
    draw();           // Draw game elements

    requestAnimationFrame(gameLoop); // Request next frame
}

/**
 * Updates game logic based on the current game state.
 * @param dt Time elapsed since the last frame in seconds.
 */
function update(dt: number) {
    switch (currentGameState) {
        case 'LOADING':
            // No game logic update needed while loading
            break;
        case 'TITLE':
            if (input.space) {
                newGame(); // Start game on space press
            }
            break;
        case 'PLAYING':
            // Update player position
            player.x += player.dx * gameData.gameSettings.playerSpeed * dt;
            // Clamp player within canvas bounds
            player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

            // Obstacle spawning logic
            obstacleSpawnTimer += dt * 1000; // Accumulate time in milliseconds
            if (obstacleSpawnTimer >= gameData.gameSettings.obstacleSpawnInterval) {
                const obstacleWidth = Math.random() * (gameData.gameSettings.obstacleMaxSize - gameData.gameSettings.obstacleMinSize) + gameData.gameSettings.obstacleMinSize;
                const obstacleHeight = obstacleWidth; // Make obstacles square for simplicity
                const obstacleX = Math.random() * (canvas.width - obstacleWidth);
                const obstacleSpeed = Math.random() * (gameData.gameSettings.obstacleMaxSpeed - gameData.gameSettings.obstacleMinSpeed) + gameData.gameSettings.obstacleMinSpeed;

                obstacles.push({
                    x: obstacleX,
                    y: -obstacleHeight, // Start obstacle just above the canvas
                    width: obstacleWidth,
                    height: obstacleHeight,
                    speed: obstacleSpeed
                });
                obstacleSpawnTimer = 0; // Reset timer
            }

            // Update obstacle positions and check for collisions
            for (let i = 0; i < obstacles.length; i++) {
                const obs = obstacles[i];
                obs.y += obs.speed * dt; // Move obstacle downwards

                // Simple AABB collision detection
                if (
                    player.x < obs.x + obs.width &&
                    player.x + player.width > obs.x &&
                    player.y < obs.y + obs.height &&
                    player.y + player.height > obs.y
                ) {
                    // Collision detected! Game Over
                    currentGameState = 'GAME_OVER';
                    if (gameOverEffect) {
                        gameOverEffect.currentTime = 0; // Rewind and play sound effect
                        gameOverEffect.play().catch(e => console.warn("Game over sound play prevented:", e));
                    }
                    if (backgroundMusic) {
                        backgroundMusic.pause(); // Pause BGM
                        backgroundMusic.currentTime = 0; // Rewind BGM for next game
                    }
                    break; // Exit loop, game state changed
                }
            }

            // Remove off-screen obstacles and update score
            for (let i = obstacles.length - 1; i >= 0; i--) {
                if (obstacles[i].y > canvas.height) { // Obstacle has moved off-screen
                    obstacles.splice(i, 1); // Remove it
                    score += gameData.gameSettings.scoreIncrement; // Increase score
                }
            }
            break;
        case 'GAME_OVER':
            if (input.space) {
                newGame(); // Restart game on space press
            }
            break;
    }
}

/**
 * Draws all game elements on the canvas based on the current game state.
 */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas

    switch (currentGameState) {
        case 'LOADING':
            drawText('Loading assets...', canvas.width / 2, canvas.height / 2, '24px Arial', '#ffffff');
            break;
        case 'TITLE':
            drawText(gameData.gameSettings.titleScreenText, canvas.width / 2, canvas.height / 2 - 50, gameData.gameSettings.titleScreenFont, gameData.gameSettings.titleScreenTextColor);
            drawText(gameData.gameSettings.pressSpaceText, canvas.width / 2, canvas.height / 2 + 20, gameData.gameSettings.scoreFont, gameData.gameSettings.titleScreenTextColor);
            break;
        case 'PLAYING':
            // Draw player
            drawAsset(gameData.gameSettings.playerImageName, player.x, player.y, player.width, player.height);

            // Draw obstacles
            for (const obs of obstacles) {
                drawAsset(gameData.gameSettings.obstacleImageName, obs.x, obs.y, obs.width, obs.height);
            }

            // Draw score
            ctx.font = gameData.gameSettings.scoreFont;
            ctx.fillStyle = gameData.gameSettings.scoreTextColor;
            ctx.textAlign = 'left'; // Align score to the left
            ctx.fillText(`Score: ${score}`, 10, 30); // Position score at top-left
            break;
        case 'GAME_OVER':
            drawText(gameData.gameSettings.gameOverScreenText, canvas.width / 2, canvas.height / 2 - 50, gameData.gameSettings.gameOverFont, gameData.gameSettings.gameOverTextColor);
            drawText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2, gameData.gameSettings.scoreFont, gameData.gameSettings.gameOverTextColor);
            drawText(gameData.gameSettings.pressSpaceText, canvas.width / 2, canvas.height / 2 + 50, gameData.gameSettings.scoreFont, gameData.gameSettings.gameOverTextColor);
            break;
    }
}

// --- Helper Functions ---

/**
 * Draws text on the canvas.
 * @param text The text string to draw.
 * @param x X-coordinate (center).
 * @param y Y-coordinate (center).
 * @param font CSS font string (e.g., "30px Arial").
 * @param color CSS color string (e.g., "#FFFFFF").
 */
function drawText(text: string, x: number, y: number, font: string, color: string) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // Center vertically as well
    ctx.fillText(text, x, y);
}

/**
 * Draws an image asset on the canvas, scaled to the specified dimensions.
 * If the image asset is not found, a colored rectangle is drawn as a fallback.
 * @param name The name of the image asset (as defined in data.json).
 * @param x X-coordinate of the top-left corner.
 * @param y Y-coordinate of the top-left corner.
 * @param width Desired width for drawing.
 * @param height Desired height for drawing.
 */
function drawAsset(name: string, x: number, y: number, width: number, height: number) {
    const image = assets.images.get(name);
    if (image && image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, x, y, width, height);
    } else {
        // Fallback: draw a colored rectangle if image is not loaded or invalid
        ctx.fillStyle = name === gameData.gameSettings.playerImageName ? 'blue' : 'red'; // Different colors for player/obstacles
        ctx.fillRect(x, y, width, height);
        // console.warn(`Asset image '${name}' not found or not loaded. Drawing fallback rectangle.`); // Uncomment for debugging
    }
}

/**
 * Updates the player's horizontal movement direction based on current input.
 */
function updatePlayerDirection() {
    if (player) { // Ensure player object exists before updating
        if (input.left && !input.right) {
            player.dx = -1;
        } else if (input.right && !input.left) {
            player.dx = 1;
        } else {
            player.dx = 0;
        }
    }
}

/**
 * Handles keyboard key down events.
 * @param event The KeyboardEvent object.
 */
function handleKeyDown(event: KeyboardEvent) {
    if (event.code === 'ArrowLeft') {
        input.left = true;
    } else if (event.code === 'ArrowRight') {
        input.right = true;
    } else if (event.code === 'Space') {
        input.space = true;
    }
    updatePlayerDirection(); // Update player movement immediately
}

/**
 * Handles keyboard key up events.
 * @param event The KeyboardEvent object.
 */
function handleKeyUp(event: KeyboardEvent) {
    if (event.code === 'ArrowLeft') {
        input.left = false;
    } else if (event.code === 'ArrowRight') {
        input.right = false;
    }
    // Space key 'up' doesn't immediately clear 'input.space' because it's
    // consumed by the game state logic when starting/restarting the game.
    updatePlayerDirection(); // Update player movement immediately
}

// Start the game when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', loadGame);