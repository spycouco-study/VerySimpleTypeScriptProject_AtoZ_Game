// Enums for game states and choices
enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER
}

enum Choice {
    ROCK = 0,
    PAPER = 1,
    SCISSORS = 2
}

// Helper interface for asset configurations
interface ImageAssetConfig {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundAssetConfig {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface AssetsConfig {
    images: ImageAssetConfig[];
    sounds: SoundAssetConfig[];
}

// Game configuration interface, loaded from data.json
interface GameConfig {
    gameSettings: {
        initialLives: number;
        roundTimeLimit: number;
        canvasWidth: number;
        canvasHeight: number;
        choiceIconSize: number;
        playerButtonWidth: number;
        playerButtonHeight: number;
        playerButtonSpacing: number;
        fontSizeTitle: string;
        fontSizeInstructions: string;
        fontSizeUI: string;
        fontSizeLarge: string;
        fontColorDefault: string;
        fontColorHighlight: string;
    };
    assets: AssetsConfig;
}

// Global game variables
let config: GameConfig;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let loadedImages: Map<string, HTMLImageElement> = new Map();
let loadedSounds: Map<string, HTMLAudioElement> = new Map();
let currentBGM: HTMLAudioElement | null = null;
let bgmPlaying: boolean = false;

// Game state variables
let gameState: GameState = GameState.TITLE;
let score: number = 0;
let lives: number = 0;
let timeRemaining: number = 0;
let computerChoice: Choice = Choice.ROCK;
let lastFrameTime: number = 0;
let gameOverReason: string = "";

// Array to map Choice enum to asset names
const choiceNames = ['rock', 'paper', 'scissors'];

// Player choice button definitions for clickable areas
interface PlayerButton {
    choice: Choice;
    rect: { x: number; y: number; width: number; height: number; };
}
let playerChoiceButtons: PlayerButton[] = [];

// Helper functions for asset loading
async function loadImage(asset: ImageAssetConfig): Promise<void> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = asset.path;
        img.onload = () => {
            loadedImages.set(asset.name, img);
            resolve();
        };
        img.onerror = (e) => {
            console.error(`Failed to load image: ${asset.path}`, e);
            reject(e);
        };
    });
}

async function loadSound(asset: SoundAssetConfig): Promise<void> {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = asset.path;
        audio.volume = asset.volume;
        audio.oncanplaythrough = () => {
            loadedSounds.set(asset.name, audio);
            resolve();
        };
        audio.onerror = (e) => {
            console.error(`Failed to load sound: ${asset.path}`, e);
            reject(e);
        };
    });
}

async function loadAssets(): Promise<void> {
    const imagePromises = config.assets.images.map(loadImage);
    const soundPromises = config.assets.sounds.map(loadSound);
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded!");
}

function playSound(name: string, loop: boolean = false, volume?: number): void {
    const audio = loadedSounds.get(name);
    if (audio) {
        // Stop previous instance if not looping BGM to allow overlapping effects
        if (!loop) {
            audio.currentTime = 0; // Reset to start
            audio.pause(); // Ensure it's stopped if already playing
        }
        audio.loop = loop;
        if (volume !== undefined) {
            audio.volume = volume;
        } else {
            // Restore default volume if not specified, or use the one from config
            const soundConfig = config.assets.sounds.find(s => s.name === name);
            if (soundConfig) audio.volume = soundConfig.volume;
        }
        audio.play().catch(e => console.warn(`Failed to play sound ${name}:`, e));

        if (loop) {
            currentBGM = audio;
            bgmPlaying = true;
        }
    } else {
        console.warn(`Sound '${name}' not found.`);
    }
}

function stopSound(name: string): void {
    const audio = loadedSounds.get(name);
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        if (audio === currentBGM) {
            currentBGM = null;
            bgmPlaying = false;
        }
    }
}

function stopAllSounds(): void {
    loadedSounds.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
    currentBGM = null;
    bgmPlaying = false;
}

// Game logic functions
function determineWinner(player: Choice, computer: Choice): -1 | 0 | 1 {
    // 0: ROCK, 1: PAPER, 2: SCISSORS
    // Winning conditions:
    // Rock (0) beats Scissors (2)
    // Paper (1) beats Rock (0)
    // Scissors (2) beats Paper (1)
    if (player === computer) {
        return 0; // Draw
    }
    if (
        (player === Choice.ROCK && computer === Choice.SCISSORS) ||
        (player === Choice.PAPER && computer === Choice.ROCK) ||
        (player === Choice.SCISSORS && computer === Choice.PAPER)
    ) {
        return 1; // Player wins
    }
    return -1; // Computer wins
}

function newRound(): void {
    computerChoice = Math.floor(Math.random() * 3);
    timeRemaining = config.gameSettings.roundTimeLimit;
}

function startGame(): void {
    score = 0;
    lives = config.gameSettings.initialLives;
    gameState = GameState.PLAYING;
    newRound();
    playSound('game_bgm', true);
}

function restartGame(): void {
    stopAllSounds();
    gameState = GameState.TITLE;
    score = 0;
    lives = 0;
    timeRemaining = 0;
    gameOverReason = "";
    bgmPlaying = false; // Reset BGM state
}

// Drawing functions
function clearCanvas(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawCenteredText(text: string, y: number, color: string, font: string): void {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, y);
}

function drawIcon(choice: Choice, x: number, y: number, width: number, height: number): void {
    const img = loadedImages.get(choiceNames[choice]);
    if (img) {
        ctx.drawImage(img, x, y, width, height);
    } else {
        ctx.fillStyle = 'red';
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '20px Arial';
        ctx.fillText(choiceNames[choice], x + width / 2, y + height / 2);
    }
}

function drawTitleScreen(): void {
    const background = loadedImages.get('title_background');
    if (background) {
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawCenteredText("가위 바위 보!", canvas.height / 2 - 50, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeTitle);
    drawCenteredText("클릭하여 시작", canvas.height / 2 + 50, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeLarge);
}

function drawInstructionsScreen(): void {
    const background = loadedImages.get('title_background'); // Using title bg for consistency
    if (background) {
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawCenteredText("게임 방법", canvas.height / 4, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeTitle);
    drawCenteredText("화면 중앙의 아이콘을 이길 수 있는", canvas.height / 2 - 60, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeInstructions);
    drawCenteredText("아이콘을 하단에서 3초 안에 클릭하세요.", canvas.height / 2 - 20, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeInstructions);
    drawCenteredText("목숨은 3개 주어집니다.", canvas.height / 2 + 40, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeInstructions);
    drawCenteredText("클릭하여 게임 시작", canvas.height / 2 + 120, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeLarge);
}

function drawGame(): void {
    const background = loadedImages.get('game_background');
    if (background) {
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw UI
    ctx.fillStyle = config.gameSettings.fontColorDefault;
    ctx.font = config.gameSettings.fontSizeUI;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`점수: ${score}`, 20, 20);
    ctx.textAlign = 'right';
    ctx.fillText(`목숨: ${lives}`, canvas.width - 20, 20);

    // Draw timer
    ctx.textAlign = 'center';
    ctx.fillText(`남은 시간: ${Math.max(0, timeRemaining).toFixed(1)}`, canvas.width / 2, 20);

    // Draw computer's choice
    const iconSize = config.gameSettings.choiceIconSize;
    const compX = (canvas.width - iconSize) / 2;
    const compY = canvas.height / 4 - iconSize / 2;
    drawIcon(computerChoice, compX, compY, iconSize, iconSize);

    // Draw player choice buttons
    const btnWidth = config.gameSettings.playerButtonWidth;
    const btnHeight = config.gameSettings.playerButtonHeight;
    const btnSpacing = config.gameSettings.playerButtonSpacing;

    const totalBtnWidth = (btnWidth * 3) + (btnSpacing * 2);
    let startX = (canvas.width - totalBtnWidth) / 2;
    const btnY = canvas.height * 3 / 4 - btnHeight / 2;

    playerChoiceButtons = []; // Clear and re-populate each frame for potential scaling

    for (let i = 0; i < 3; i++) {
        const x = startX + (i * (btnWidth + btnSpacing));
        ctx.strokeStyle = config.gameSettings.fontColorDefault;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, btnY, btnWidth, btnHeight);
        drawIcon(i as Choice, x, btnY, btnWidth, btnHeight);
        playerChoiceButtons.push({ choice: i as Choice, rect: { x, y: btnY, width: btnWidth, height: btnHeight } });
    }
}

function drawGameOverScreen(): void {
    const background = loadedImages.get('title_background'); // Using title bg for consistency
    if (background) {
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawCenteredText("게임 오버!", canvas.height / 2 - 80, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeTitle);
    drawCenteredText(`최종 점수: ${score}`, canvas.height / 2, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeLarge);
    if (gameOverReason) {
        drawCenteredText(`이유: ${gameOverReason}`, canvas.height / 2 + 60, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeUI);
    }
    drawCenteredText("클릭하여 다시 시작", canvas.height / 2 + 140, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeLarge);
}


function draw(): void {
    clearCanvas();
    switch (gameState) {
        case GameState.TITLE:
            drawTitleScreen();
            break;
        case GameState.INSTRUCTIONS:
            drawInstructionsScreen();
            break;
        case GameState.PLAYING:
            drawGame();
            break;
        case GameState.GAME_OVER:
            drawGameOverScreen();
            break;
    }
}

// Event listeners
function handleMouseClick(event: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    playSound('button_click'); // Play click sound for any interaction

    switch (gameState) {
        case GameState.TITLE:
            gameState = GameState.INSTRUCTIONS;
            break;
        case GameState.INSTRUCTIONS:
            startGame();
            break;
        case GameState.PLAYING:
            // Check if player clicked on a choice button
            for (const button of playerChoiceButtons) {
                if (mouseX >= button.rect.x && mouseX <= button.rect.x + button.rect.width &&
                    mouseY >= button.rect.y && mouseY <= button.rect.y + button.rect.height) {
                    
                    const result = determineWinner(button.choice, computerChoice);
                    if (result === 1) { // Player wins
                        score++;
                        playSound('win_sound');
                    } else if (result === 0) { // Draw
                        // No change in score/lives for draw, click sound already played
                    }
                    else { // Player loses
                        lives--;
                        playSound('lose_sound');
                    }
                    
                    if (lives <= 0) {
                        gameState = GameState.GAME_OVER;
                        gameOverReason = result === -1 ? "잘못된 선택" : "목숨이 모두 소진되었습니다.";
                        stopSound('game_bgm');
                    } else {
                        newRound();
                    }
                    return; // Exit after handling click
                }
            }
            break;
        case GameState.GAME_OVER:
            restartGame();
            break;
    }
}

// Main game loop
function gameLoop(currentTime: number): void {
    const deltaTime = (currentTime - lastFrameTime) / 1000; // in seconds
    lastFrameTime = currentTime;

    if (gameState === GameState.PLAYING) {
        timeRemaining -= deltaTime;
        if (timeRemaining <= 0) {
            lives--;
            playSound('lose_sound'); // Play sound for timeout
            if (lives <= 0) {
                gameState = GameState.GAME_OVER;
                gameOverReason = "시간 초과";
                stopSound('game_bgm');
            } else {
                newRound();
            }
        }
    }
    
    // Ensure BGM is playing if in PLAYING state and not already playing
    if (gameState === GameState.PLAYING && !bgmPlaying) {
        playSound('game_bgm', true);
    }
    // Stop BGM if not in PLAYING state and it's currently playing
    if (gameState !== GameState.PLAYING && bgmPlaying) {
        stopSound('game_bgm');
    }

    draw();
    requestAnimationFrame(gameLoop);
}

// Initialization
async function init(): Promise<void> {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with id 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d')!;

    // Fetch configuration from data.json
    try {
        const response = await fetch('data.json');
        config = await response.json();
    } catch (error) {
        console.error("Failed to load game configuration:", error);
        return;
    }

    canvas.width = config.gameSettings.canvasWidth;
    canvas.height = config.gameSettings.canvasHeight;

    // Load assets
    try {
        await loadAssets();
    } catch (error) {
        console.error("Failed to load assets:", error);
        return;
    }

    // Set up event listener
    canvas.addEventListener('click', handleMouseClick);

    // Start the game loop
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// Call init when the DOM is ready
document.addEventListener('DOMContentLoaded', init);
