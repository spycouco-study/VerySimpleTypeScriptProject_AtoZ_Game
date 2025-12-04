// game.ts

// Global variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameSettings: any;
let assets: { images: { [key: string]: HTMLImageElement }, sounds: { [key: string]: HTMLAudioElement } } = { images: {}, sounds: {} };
let gameState: 'TITLE' | 'INSTRUCTIONS' | 'PLAYING' | 'GAME_OVER' = 'TITLE';

let snake: { x: number, y: number }[] = [];
let food: { x: number, y: number };
let score: number = 0;
let direction: { x: number, y: number } = { x: 1, y: 0 }; // Initial direction: right
let nextDirection: { x: number, y: number } = { x: 1, y: 0 }; // Buffer for next input
let lastMoveTime: number = 0;
let gameLoopId: number;

// Asset loading and game initialization
async function initGame() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d')!;

    await loadGameData();
    setupCanvas();
    setupEventListeners();

    // Start background music (muted by default until user interaction)
    if (assets.sounds.bgm) {
        assets.sounds.bgm.loop = true;
        assets.sounds.bgm.volume = gameSettings.bgmVolume;
        assets.sounds.bgm.muted = true;
    }

    // Start the game loop
    gameLoopId = requestAnimationFrame(gameLoop);
}

async function loadGameData() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();
        gameSettings = data.gameSettings;
        Object.assign(gameSettings, data.colors, data.text); // Merge colors and text into gameSettings
        await loadAssets(data.assets);
    } catch (error) {
        console.error("Failed to load game data or assets:", error);
    }
}

async function loadAssets(assetData: any) {
    const loadImagePromises = (assetData.images || []).map((img: any) => {
        return new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = img.path;
            image.onload = () => {
                assets.images[img.name] = image;
                resolve();
            };
            image.onerror = () => {
                console.error(`Failed to load image: ${img.path}`);
                reject();
            };
        });
    });

    const loadSoundPromises = (assetData.sounds || []).map((snd: any) => {
        return new Promise<void>((resolve, reject) => {
            const audio = new Audio();
            audio.src = snd.path;
            audio.volume = snd.volume || 1.0;
            audio.oncanplaythrough = () => {
                assets.sounds[snd.name] = audio;
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${snd.path}`);
                reject();
            };
            // Try to load immediately to trigger error if path is bad
            audio.load();
        });
    });

    await Promise.all([...loadImagePromises, ...loadSoundPromises]);
    console.log("All assets loaded.");
}

function setupCanvas() {
    canvas.width = gameSettings.canvasWidth;
    canvas.height = gameSettings.canvasHeight;
    ctx.imageSmoothingEnabled = false; // For a more pixelated/retro look
}

function setupEventListeners() {
    document.addEventListener('keydown', handleKeyDown);
    // Add a click/touch listener for initial user interaction to unmute sounds
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
}

function handleUserInteraction() {
    if (assets.sounds.bgm) {
        assets.sounds.bgm.muted = false;
        assets.sounds.bgm.play().catch(e => console.warn("Background music autoplay prevented:", e));
    }
}

function handleKeyDown(event: KeyboardEvent) {
    if (gameState === 'TITLE' || gameState === 'INSTRUCTIONS' || gameState === 'GAME_OVER') {
        if (event.code === 'Space') {
            playSound('menuSelect');
            if (gameState === 'TITLE') {
                gameState = 'INSTRUCTIONS';
            } else if (gameState === 'INSTRUCTIONS') {
                gameState = 'PLAYING';
                resetGame();
            } else if (gameState === 'GAME_OVER') {
                gameState = 'TITLE'; // Go back to title screen to restart
            }
            event.preventDefault(); // Prevent page scrolling
        }
    } else if (gameState === 'PLAYING') {
        let newDirection = { x: direction.x, y: direction.y };
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                if (direction.y === 0) newDirection = { x: 0, y: -1 };
                break;
            case 'ArrowDown':
            case 'KeyS':
                if (direction.y === 0) newDirection = { x: 0, y: 1 };
                break;
            case 'ArrowLeft':
            case 'KeyA':
                if (direction.x === 0) newDirection = { x: -1, y: 0 };
                break;
            case 'ArrowRight':
            case 'KeyD':
                if (direction.x === 0) newDirection = { x: 1, y: 0 };
                break;
        }
        // Only update nextDirection if it's a valid change (not reversing direction)
        if (newDirection.x !== -direction.x || newDirection.y !== -direction.y) {
            nextDirection = newDirection;
        }
        event.preventDefault(); // Prevent page scrolling
    }
}

function resetGame() {
    snake = [];
    // Initialize snake in the middle-left part of the screen
    const startX = Math.floor(gameSettings.canvasWidth / (gameSettings.gridSize * 4));
    const startY = Math.floor(gameSettings.canvasHeight / (gameSettings.gridSize * 2));
    for (let i = 0; i < gameSettings.initialSnakeLength; i++) {
        snake.push({ x: startX - i, y: startY });
    }
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    spawnFood();
    lastMoveTime = performance.now();
    
    // Ensure BGM is playing if it was paused during game over
    if (assets.sounds.bgm && assets.sounds.bgm.paused && !assets.sounds.bgm.muted) {
        assets.sounds.bgm.play().catch(e => console.warn("Background music autoplay prevented:", e));
    }
}

function spawnFood() {
    let newFood: { x: number, y: number };
    const maxGridX = gameSettings.canvasWidth / gameSettings.gridSize;
    const maxGridY = gameSettings.canvasHeight / gameSettings.gridSize;

    do {
        newFood = {
            x: Math.floor(Math.random() * maxGridX),
            y: Math.floor(Math.random() * maxGridY)
        };
    } while (isOccupiedBySnake(newFood));

    food = newFood;
}

function isOccupiedBySnake(position: { x: number, y: number }): boolean {
    return snake.some(segment => segment.x === position.x && segment.y === position.y);
}

function update(currentTime: number) {
    if (gameState === 'PLAYING') {
        if (currentTime - lastMoveTime > gameSettings.gameSpeed) {
            lastMoveTime = currentTime;
            direction = nextDirection; // Apply buffered direction

            const head = { ...snake[0] }; // Copy current head

            // Calculate new head position
            head.x += direction.x;
            head.y += direction.y;

            // Wall collision
            const maxGridX = gameSettings.canvasWidth / gameSettings.gridSize;
            const maxGridY = gameSettings.canvasHeight / gameSettings.gridSize;
            if (head.x < 0 || head.x >= maxGridX || head.y < 0 || head.y >= maxGridY) {
                gameOver();
                return;
            }

            // Self collision (start checking from the 4th segment to avoid immediate game over on start/turn)
            for (let i = 1; i < snake.length; i++) {
                if (head.x === snake[i].x && head.y === snake[i].y) {
                    gameOver();
                    return;
                }
            }

            // Food collision
            if (head.x === food.x && head.y === food.y) { // Fixed: Changed food.y === food.y to head.y === food.y
                score += gameSettings.scorePerFood;
                playSound('eat');
                snake.unshift(head); // Add new head, body will grow
                spawnFood();
            } else {
                // Move snake by adding new head and removing tail
                snake.pop(); // Remove tail
                snake.unshift(head); // Add new head
            }
        }
    }
}

function gameOver() {
    gameState = 'GAME_OVER';
    playSound('gameOver');
    if (assets.sounds.bgm) {
        assets.sounds.bgm.pause();
    }
}

function drawScaledImage(image: HTMLImageElement, gridX: number, gridY: number, size: number) {
    ctx.drawImage(image, gridX * size, gridY * size, size, size);
}

function drawText(text: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'center') {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
}

function playSound(soundName: string) {
    const sound = assets.sounds[soundName];
    if (sound) {
        sound.currentTime = 0; // Rewind to start
        sound.volume = gameSettings.sfxVolume;
        sound.play().catch(e => console.warn(`Sound ${soundName} autoplay prevented:`, e));
    }
}

function gameLoop(currentTime: number) {
    update(currentTime);
    draw();
    gameLoopId = requestAnimationFrame(gameLoop);
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (gameState) {
        case 'TITLE':
            drawBackground(assets.images.titleBackground);
            drawText(gameSettings.title, canvas.width / 2, canvas.height / 2 - 50, gameSettings.textColor, '60px Arial, sans-serif');
            drawText(gameSettings.titleMessage, canvas.width / 2, canvas.height / 2 + 50, gameSettings.textColor, '30px Arial, sans-serif');
            break;

        case 'INSTRUCTIONS':
            drawBackground(assets.images.instructionsBackground);
            drawText(gameSettings.instructionsTitle, canvas.width / 2, 100, gameSettings.textColor, '45px Arial, sans-serif');
            drawText(gameSettings.instructionsLine1, canvas.width / 2, 200, gameSettings.textColor, '24px Arial, sans-serif');
            drawText(gameSettings.instructionsLine2, canvas.width / 2, 240, gameSettings.textColor, '24px Arial, sans-serif');
            drawText(gameSettings.instructionsLine3, canvas.width / 2, 280, gameSettings.textColor, '24px Arial, sans-serif');
            drawText(gameSettings.instructionsLine4, canvas.width / 2, 320, gameSettings.textColor, '24px Arial, sans-serif');
            drawText(gameSettings.instructionsMessage, canvas.width / 2, canvas.height - 100, gameSettings.textColor, '30px Arial, sans-serif');
            break;

        case 'PLAYING':
            drawBackground(assets.images.gameBackground);

            // Draw food
            if (food && assets.images.foodItem) {
                drawScaledImage(assets.images.foodItem, food.x, food.y, gameSettings.gridSize);
            }

            // Draw snake
            for (let i = 0; i < snake.length; i++) {
                let segmentImage: HTMLImageElement;
                if (i === 0) { // Head
                    segmentImage = assets.images.snakeHead;
                } else if (i === snake.length - 1) { // Tail
                    segmentImage = assets.images.snakeTail;
                } else { // Body
                    segmentImage = assets.images.snakeBody;
                }
                drawScaledImage(segmentImage, snake[i].x, snake[i].y, gameSettings.gridSize);
            }

            // Draw score
            drawText(`${gameSettings.scorePrefix}${score}`, 10, 30, gameSettings.textColor, '24px Arial, sans-serif', 'left');
            break;

        case 'GAME_OVER':
            drawBackground(assets.images.gameOverBackground);
            drawText(gameSettings.gameOver, canvas.width / 2, canvas.height / 2 - 80, gameSettings.gameOverColor, '60px Arial, sans-serif');
            drawText(`${gameSettings.gameOverScorePrefix}${score}`, canvas.width / 2, canvas.height / 2, gameSettings.textColor, '40px Arial, sans-serif');
            drawText(gameSettings.gameOverMessage, canvas.width / 2, canvas.height / 2 + 80, gameSettings.textColor, '30px Arial, sans-serif');
            break;
    }
}

function drawBackground(image: HTMLImageElement) {
    if (image) {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#1a1a2e'; // Fallback solid background color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// Ensure the game starts when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initGame);
