// Type Definitions for better readability and maintainability
interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    gameDurationSeconds: number;
    targetClicks: number;
    rainSettings: RainSettings;
    clickableObject: ClickableObjectSettings;
    fontSettings: FontSettings;
}

interface RainSettings {
    maxRaindrops: number;
    minRainSpeed: number;
    maxRainSpeed: number;
    minRainLength: number;
    maxRainLength: number;
    rainColor: string;
    rainSpawnRateMs: number;
}

interface ClickableObjectSettings {
    imageName: string;
    defaultWidth: number;
    defaultHeight: number;
    minScale: number;
    maxScale: number;
    spawnPadding: number;
}

interface FontSettings {
    titleFontSize: string;
    instructionFontSize: string;
    gameUiFontSize: string;
    gameOverFontSize: string;
    textColor: string;
}

interface Texts {
    loading: string;
    titleScreen: { title: string; startPrompt: string; };
    instructionsScreen: { instructions: string; startPrompt: string; };
    playingScreen: { clicksLabel: string; timeLabel: string; };
    winScreen: { message: string; clicksAchieved: string; restartPrompt: string; };
    loseScreen: { message: string; clicksAchieved: string; restartPrompt: string; };
}

interface AssetImageData { // Renamed from ImageData to AssetImageData to avoid conflict with built-in DOM ImageData interface
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundData {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
    loop: boolean;
}

interface AssetsData {
    images: AssetImageData[]; // Updated this line
    sounds: SoundData[];
}

interface GameData {
    gameSettings: GameSettings;
    texts: Texts;
    assets: AssetsData;
}

interface Raindrop {
    x: number;
    y: number;
    speed: number;
    length: number;
}

interface ClickableGameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
}

// Game State Enum
enum GameState {
    LOADING,
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER,
}

// Global Game Variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData;
let currentGameState: GameState = GameState.LOADING;

// Assets
const loadedImages: Map<string, HTMLImageElement> = new Map();
const loadedSounds: Map<string, HTMLAudioElement> = new Map();

// Game Logic Variables
let clicks: number = 0;
let timeLeft: number = 0; // in seconds
let gameStartTime: number = 0; // performance.now() timestamp
let lastFrameTime: number = 0; // performance.now() for delta time calculation

// Rain Effect Variables
const rainDrops: Raindrop[] = [];
let lastRainSpawnTime: number = 0;

// Clickable Object
let clickableObject: ClickableGameObject | null = null;

// --- Utility Functions ---
function getRandomNumber(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function playSound(name: string, loop: boolean = false): void {
    const audio = loadedSounds.get(name);
    if (audio) {
        audio.currentTime = 0; // Rewind to start for quick repeated plays
        audio.volume = gameData.assets.sounds.find(s => s.name === name)?.volume ?? 1.0;
        audio.loop = loop;
        audio.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e));
    }
}

function stopSound(name: string): void {
    const audio = loadedSounds.get(name);
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

// --- Asset Loading ---
async function loadAssets(): Promise<void> {
    const imagePromises = gameData.assets.images.map(imgData => {
        return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.src = imgData.path;
            img.onload = () => {
                loadedImages.set(imgData.name, img);
                resolve();
            };
            img.onerror = () => reject(`Failed to load image: ${imgData.path}`);
        });
    });

    const soundPromises = gameData.assets.sounds.map(soundData => {
        return new Promise<void>((resolve, reject) => {
            const audio = new Audio(soundData.path);
            audio.preload = 'auto';
            audio.oncanplaythrough = () => {
                loadedSounds.set(soundData.name, audio);
                resolve();
            };
            audio.onerror = () => reject(`Failed to load sound: ${soundData.path}`);
        });
    });

    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
}

// --- Game Initialization ---
async function initGame(): Promise<void> {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    try {
        const response = await fetch('data.json');
        gameData = await response.json();

        canvas.width = gameData.gameSettings.canvasWidth;
        canvas.height = gameData.gameSettings.canvasHeight;

        await loadAssets();
        currentGameState = GameState.TITLE;
        console.log("Game initialized. Ready to start.");
    } catch (error) {
        console.error("Failed to load game data or assets:", error);
        currentGameState = GameState.LOADING; // Stay in loading or show error state
        drawLoadingScreen(); // Show loading error
        return;
    }

    // Set up event listener for clicks
    canvas.addEventListener('click', handleClick);

    // Initialize rain drops
    generateRaindrops(gameData.gameSettings.rainSettings.maxRaindrops);

    // Start the game loop
    lastFrameTime = performance.now();
    gameLoop(lastFrameTime);
}

// --- Rain Effect ---
function createRaindrop(): Raindrop {
    const { minRainSpeed, maxRainSpeed, minRainLength, maxRainLength } = gameData.gameSettings.rainSettings;
    return {
        x: getRandomNumber(0, canvas.width),
        y: getRandomNumber(-canvas.height, 0), // Start above or at top of screen
        speed: getRandomNumber(minRainSpeed, maxRainSpeed),
        length: getRandomNumber(minRainLength, maxRainLength),
    };
}

function generateRaindrops(count: number): void {
    for (let i = 0; i < count; i++) {
        rainDrops.push(createRaindrop());
    }
}

function updateRaindrops(deltaTime: number): void {
    const { rainSpawnRateMs, maxRaindrops } = gameData.gameSettings.rainSettings;

    // Move existing raindrops
    for (let i = 0; i < rainDrops.length; i++) {
        const drop = rainDrops[i];
        drop.y += drop.speed * (deltaTime / 16.66); // Scale speed by delta time relative to 60fps
        if (drop.y > canvas.height) {
            // Reset raindrop to top if it goes off screen
            drop.x = getRandomNumber(0, canvas.width);
            drop.y = getRandomNumber(-50, -10); // Start slightly above the canvas
        }
    }

    // Add new raindrops if needed
    if (performance.now() - lastRainSpawnTime > rainSpawnRateMs && rainDrops.length < maxRaindrops) {
        rainDrops.push(createRaindrop());
        lastRainSpawnTime = performance.now();
    }
}

function drawRaindrops(): void {
    ctx.strokeStyle = gameData.gameSettings.rainSettings.rainColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const drop of rainDrops) {
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x, drop.y + drop.length);
    }
    ctx.stroke();
}

// --- Game Object Spawning ---
function spawnClickableObject(): void {
    const { imageName, defaultWidth, defaultHeight, minScale, maxScale, spawnPadding } = gameData.gameSettings.clickableObject;
    const image = loadedImages.get(imageName);

    if (!image) {
        console.error(`Image "${imageName}" not loaded.`);
        return;
    }

    const scale = getRandomNumber(minScale, maxScale);
    const width = defaultWidth * scale;
    const height = defaultHeight * scale;

    const minX = spawnPadding;
    const maxX = canvas.width - width - spawnPadding;
    const minY = spawnPadding;
    const maxY = canvas.height - height - spawnPadding;

    if (maxX < minX || maxY < minY) { // Check if padding makes it impossible to spawn
      console.warn("Clickable object spawn area is too small due to padding. Adjusting to center.");
      clickableObject = {
        x: (canvas.width - width) / 2,
        y: (canvas.height - height) / 2,
        width,
        height,
        image
      };
    } else {
      clickableObject = {
          x: getRandomNumber(minX, maxX),
          y: getRandomNumber(minY, maxY),
          width,
          height,
          image,
      };
    }
}

// --- Game Flow & State Management ---
function startGame(): void {
    clicks = 0;
    timeLeft = gameData.gameSettings.gameDurationSeconds;
    gameStartTime = performance.now();
    currentGameState = GameState.PLAYING;
    spawnClickableObject();
    playSound("background_rain_sound", true); // Start background rain sound
}

function resetGame(): void {
    stopSound("background_rain_sound");
    clicks = 0;
    timeLeft = 0;
    gameStartTime = 0;
    clickableObject = null;
    currentGameState = GameState.TITLE;
}

function updateGame(deltaTime: number): void {
    if (currentGameState === GameState.PLAYING) {
        const elapsedSeconds = (performance.now() - gameStartTime) / 1000;
        timeLeft = Math.max(0, gameData.gameSettings.gameDurationSeconds - Math.floor(elapsedSeconds));

        if (clicks >= gameData.gameSettings.targetClicks) {
            currentGameState = GameState.GAME_OVER;
            playSound("win_sound");
            stopSound("background_rain_sound");
        } else if (timeLeft <= 0) {
            currentGameState = GameState.GAME_OVER;
            playSound("lose_sound");
            stopSound("background_rain_sound");
        }
    }
    updateRaindrops(deltaTime);
}

// --- Drawing Functions ---
function drawBackground(): void {
    ctx.fillStyle = '#1a2a3a'; // Dark blue-grey for a stormy sky
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawRaindrops(); // Always draw rain for the background atmosphere
}

function drawLoadingScreen(): void {
    drawBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = gameData?.gameSettings.fontSettings.textColor || '#FFFFFF';
    ctx.font = gameData?.gameSettings.fontSettings.titleFontSize || '48px sans-serif';
    ctx.fillText(gameData?.texts.loading || '로딩 중...', canvas.width / 2, canvas.height / 2);
}

function drawTitleScreen(): void {
    drawBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = gameData.gameSettings.fontSettings.textColor;

    ctx.font = gameData.gameSettings.fontSettings.titleFontSize;
    ctx.fillText(gameData.texts.titleScreen.title, canvas.width / 2, canvas.height / 2 - 50);

    ctx.font = gameData.gameSettings.fontSettings.instructionFontSize;
    ctx.fillText(gameData.texts.titleScreen.startPrompt, canvas.width / 2, canvas.height / 2 + 30);
}

function drawInstructionsScreen(): void {
    drawBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = gameData.gameSettings.fontSettings.textColor;

    ctx.font = gameData.gameSettings.fontSettings.instructionFontSize;

    // Replace placeholders in instructions text
    const instructionsText = gameData.texts.instructionsScreen.instructions
        .replace('{TARGET_CLICKS}', gameData.gameSettings.targetClicks.toString())
        .replace('{GAME_DURATION}', gameData.gameSettings.gameDurationSeconds.toString());

    // Split text by newline and draw each line
    const lines = instructionsText.split('\n');
    let y = canvas.height / 2 - (lines.length / 2) * 30; // Adjust starting Y based on number of lines
    for (const line of lines) {
        ctx.fillText(line, canvas.width / 2, y);
        y += 30; // Line height
    }

    ctx.fillText(gameData.texts.instructionsScreen.startPrompt, canvas.width / 2, y + 40);
}


function drawPlayingScreen(): void {
    drawBackground();

    if (clickableObject) {
        ctx.drawImage(
            clickableObject.image,
            clickableObject.x,
            clickableObject.y,
            clickableObject.width,
            clickableObject.height
        );
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = gameData.gameSettings.fontSettings.textColor;
    ctx.font = gameData.gameSettings.fontSettings.gameUiFontSize;
    ctx.fillText(`${gameData.texts.playingScreen.clicksLabel}${clicks}/${gameData.gameSettings.targetClicks}`, 20, 50);

    ctx.textAlign = 'right';
    ctx.fillText(`${gameData.texts.playingScreen.timeLabel}${timeLeft}초`, canvas.width - 20, 50);
}

function drawGameOverScreen(): void {
    drawBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = gameData.gameSettings.fontSettings.textColor;
    ctx.font = gameData.gameSettings.fontSettings.gameOverFontSize;

    const winConditionMet = clicks >= gameData.gameSettings.targetClicks;
    const message = winConditionMet ? gameData.texts.winScreen.message : gameData.texts.loseScreen.message;
    const clicksAchievedText = winConditionMet ? gameData.texts.winScreen.clicksAchieved : gameData.texts.loseScreen.clicksAchieved;
    const restartPrompt = winConditionMet ? gameData.texts.winScreen.restartPrompt : gameData.texts.loseScreen.restartPrompt;


    ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 60);

    ctx.font = gameData.gameSettings.fontSettings.gameUiFontSize;
    ctx.fillText(`${clicksAchievedText}${clicks}회`, canvas.width / 2, canvas.height / 2 + 10);
    ctx.fillText(restartPrompt, canvas.width / 2, canvas.height / 2 + 80);
}

function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas

    switch (currentGameState) {
        case GameState.LOADING:
            drawLoadingScreen();
            break;
        case GameState.TITLE:
            drawTitleScreen();
            break;
        case GameState.INSTRUCTIONS:
            drawInstructionsScreen();
            break;
        case GameState.PLAYING:
            drawPlayingScreen();
            break;
        case GameState.GAME_OVER:
            drawGameOverScreen();
            break;
    }
}

// --- Input Handling ---
function handleClick(event: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    switch (currentGameState) {
        case GameState.TITLE:
            currentGameState = GameState.INSTRUCTIONS;
            break;
        case GameState.INSTRUCTIONS:
            startGame();
            break;
        case GameState.PLAYING:
            if (clickableObject &&
                mouseX >= clickableObject.x &&
                mouseX <= clickableObject.x + clickableObject.width &&
                mouseY >= clickableObject.y &&
                mouseY <= clickableObject.y + clickableObject.height) {
                clicks++;
                playSound("click_sound");
                spawnClickableObject(); // Respawns the object after a click
            }
            break;
        case GameState.GAME_OVER:
            resetGame();
            break;
    }
}

// --- Game Loop ---
function gameLoop(currentTime: number): void {
    const deltaTime = currentTime - lastFrameTime; // in milliseconds
    lastFrameTime = currentTime;

    updateGame(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

// Ensure the game initializes after the window loads
window.onload = initGame;
