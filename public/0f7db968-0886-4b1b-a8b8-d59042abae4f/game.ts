interface Point {
    x: number;
    y: number;
}

interface GameConfig {
    canvas: {
        width: number;
        height: number;
    };
    grid: {
        size: number;
    };
    game: {
        initialSnakeLength: number;
        initialSpeed: number; // Lower value = faster
        speedIncreaseInterval: number; // Score points to increase speed
        foodScoreValue: number;
    };
    colors: {
        background: string;
        wallOutline: string;
        uiText: string;
    };
    uiText: {
        title: string;
        startPrompt: string;
        controlsTitle: string;
        controlsInstructions: string[];
        gameOverTitle: string;
        scorePrefix: string;
        restartPrompt: string;
    };
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

interface ImageAsset {
    name: string;
    path: string;
    width: number;
    height: number;
    img?: HTMLImageElement; // Loaded image object
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
    audio?: HTMLAudioElement; // Loaded audio object
}

enum GameState {
    TITLE,
    CONTROLS,
    PLAYING,
    GAME_OVER
}

enum Direction {
    UP,
    DOWN,
    LEFT,
    RIGHT
}

// Global game variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameConfig: GameConfig;
let assets: { images: Record<string, ImageAsset>; sounds: Record<string, SoundAsset>; };

let currentGameState: GameState = GameState.TITLE;
let snake: Point[] = [];
let food: Point;
let direction: Direction;
let nextDirection: Direction; // To prevent immediate reversal and queue input
let score: number = 0;
let lastUpdateTime: number = 0;
let updateInterval: number; // Milliseconds per snake movement
let animationFrameId: number; // For requestAnimationFrame

// Sound instances for control (to stop/start BGM)
let bgmAudio: HTMLAudioElement | null = null;

// Initialization function, called when the DOM is ready
async function initGame(): Promise<void> {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d')!;

    await loadData();
    canvas.width = gameConfig.canvas.width;
    canvas.height = gameConfig.canvas.height;
    ctx.imageSmoothingEnabled = false; // For pixel art

    await loadAssets();
    setupInput();

    // Start the game loop for rendering title screen
    animationFrameId = requestAnimationFrame(gameLoop);
}

// Loads game configuration from data.json
async function loadData(): Promise<void> {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        gameConfig = await response.json() as GameConfig;
        updateInterval = gameConfig.game.initialSpeed;
    } catch (error) {
        console.error("Failed to load game data:", error);
        // Provide a minimal default config to prevent total failure
        gameConfig = {
            canvas: { width: 600, height: 400 },
            grid: { size: 20 },
            game: { initialSnakeLength: 3, initialSpeed: 200, speedIncreaseInterval: 5, foodScoreValue: 10 },
            colors: { background: '#ADD8E6', wallOutline: '#8B4513', uiText: '#000000' },
            uiText: {
                title: '귀여운 뱀 게임',
                startPrompt: '아무 키나 눌러 시작',
                controlsTitle: '조작법',
                controlsInstructions: ['WASD 또는 화살표 키로 뱀 이동', '먹이를 먹고 점수를 얻고 몸집을 키우세요!', '벽이나 자신의 몸에 부딪히면 게임 끝!', '즐거운 게임 되세요!'],
                gameOverTitle: '게임 오버!',
                scorePrefix: '점수: ',
                restartPrompt: 'R 키를 눌러 다시 시작'
            },
            assets: { images: [], sounds: [] }
        };
    }
}

// Loads all image and sound assets
async function loadAssets(): Promise<void> {
    assets = { images: {}, sounds: {} } as any; // Initialize assets object

    const imagePromises = gameConfig.assets.images.map(asset => {
        return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                asset.img = img;
                assets.images[asset.name] = asset;
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${asset.path}`);
                reject();
            };
        });
    });

    const soundPromises = gameConfig.assets.sounds.map(asset => {
        return new Promise<void>((resolve, reject) => {
            const audio = new Audio();
            audio.src = asset.path;
            audio.oncanplaythrough = () => { // Ensure sound is ready to play
                asset.audio = audio;
                assets.sounds[asset.name] = asset;
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${asset.path}`);
                reject();
            };
        });
    });

    try {
        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    } catch (error) {
        console.error("Error loading some assets:", error);
    }
}

// Draws an image asset, scaling it to the grid size
function drawImage(imageName: string, x: number, y: number, width: number = gameConfig.grid.size, height: number = gameConfig.grid.size): void {
    const asset = assets.images[imageName];
    if (asset && asset.img) {
        ctx.drawImage(asset.img, x, y, width, height);
    } else {
        // Fallback for missing images (draw a colored square)
        ctx.fillStyle = '#FF00FF'; // Magenta for missing textures
        ctx.fillRect(x, y, width, height);
        console.warn(`Image '${imageName}' not loaded or found.`);
    }
}

// Plays a sound effect
function playAudio(name: string, loop: boolean = false): void {
    const asset = assets.sounds[name];
    if (asset && asset.audio) {
        // Create a new Audio instance to allow multiple simultaneous plays for effects
        const soundInstance = new Audio(asset.path);
        soundInstance.volume = asset.volume;
        soundInstance.loop = loop;
        soundInstance.play().catch(e => console.warn(`Failed to play sound '${name}':`, e));

        if (loop) { // Keep track of BGM instance
            bgmAudio = soundInstance;
        }
    } else {
        console.warn(`Sound '${name}' not loaded or found.`);
    }
}

// Stops a looping audio (like BGM)
function stopAudio(name: string): void {
    if (name === 'bgm_cute' && bgmAudio) {
        bgmAudio.pause();
        bgmAudio.currentTime = 0; // Reset to start
        bgmAudio = null;
    }
}

// Sets up keyboard event listener
function setupInput(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        switch (currentGameState) {
            case GameState.TITLE:
                // Any key starts the game flow
                currentGameState = GameState.CONTROLS;
                break;
            case GameState.CONTROLS:
                // Any key moves from controls to playing
                currentGameState = GameState.PLAYING;
                startGame();
                break;
            case GameState.PLAYING:
                // Only allow direction changes that aren't immediate reversals
                if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                    if (direction !== Direction.DOWN) nextDirection = Direction.UP;
                } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                    if (direction !== Direction.UP) nextDirection = Direction.DOWN;
                } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                    if (direction !== Direction.RIGHT) nextDirection = Direction.LEFT;
                } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                    if (direction !== Direction.LEFT) nextDirection = Direction.RIGHT;
                }
                break;
            case GameState.GAME_OVER:
                if (e.key === 'r' || e.key === 'R') {
                    currentGameState = GameState.TITLE; // Go back to title to restart full cycle
                    stopAudio('bgm_cute');
                }
                break;
        }
    });
}

// Resets game state for a new round
function resetGame(): void {
    snake = [];
    const gridSize = gameConfig.grid.size;
    const initialX = Math.floor(gameConfig.canvas.width / 2 / gridSize) * gridSize;
    const initialY = Math.floor(gameConfig.canvas.height / 2 / gridSize) * gridSize;

    // Initialize snake in the center, moving right
    for (let i = 0; i < gameConfig.game.initialSnakeLength; i++) {
        snake.push({ x: initialX - i * gridSize, y: initialY });
    }

    direction = Direction.RIGHT;
    nextDirection = Direction.RIGHT; // Reset pending direction
    score = 0;
    updateInterval = gameConfig.game.initialSpeed; // Reset speed
    spawnFood();
}

// Starts the game proper
function startGame(): void {
    resetGame();
    lastUpdateTime = performance.now(); // Reset timestamp for game updates
    playAudio('bgm_cute', true); // Start background music
}

// Ends the game
function gameOver(): void {
    currentGameState = GameState.GAME_OVER;
    playAudio('game_over_sound'); // Play game over sound
    stopAudio('bgm_cute'); // Stop background music
}

// Main game loop using requestAnimationFrame
function gameLoop(timestamp: number): void {
    animationFrameId = requestAnimationFrame(gameLoop); // Schedule next frame

    draw(); // Always draw, regardless of game state

    if (currentGameState === GameState.PLAYING) {
        const elapsed = timestamp - lastUpdateTime;
        if (elapsed > updateInterval) {
            // Adjust lastUpdateTime to account for potential frame drops,
            // ensuring consistent update timing.
            lastUpdateTime = timestamp - (elapsed % updateInterval);
            update();
        }
    }
}

// Updates game logic (movement, collisions, etc.)
function update(): void {
    direction = nextDirection; // Apply the next desired direction
    const head = { ...snake[0] }; // Copy head to calculate new position
    const gridSize = gameConfig.grid.size;

    // Move head based on current direction
    switch (direction) {
        case Direction.UP:
            head.y -= gridSize;
            break;
        case Direction.DOWN:
            head.y += gridSize;
            break;
        case Direction.LEFT:
            head.x -= gridSize;
            break;
        case Direction.RIGHT:
            head.x += gridSize;
            break;
    }

    // Check for collisions
    if (checkCollision(head)) {
        gameOver();
        return;
    }

    // Add new head to the snake
    snake.unshift(head);

    // Check if food was eaten
    if (head.x === food.x && head.y === food.y) {
        score += gameConfig.game.foodScoreValue;
        playAudio('eat_sound');
        spawnFood(); // Place new food

        // Increase speed every N points
        if (score % gameConfig.game.speedIncreaseInterval === 0 && updateInterval > 50) {
            updateInterval -= 10; // Make it faster
        }
    } else {
        // If no food eaten, remove tail to simulate movement
        snake.pop();
    }
}

// Checks for collisions (walls or self)
function checkCollision(head: Point): boolean {
    const canvasWidth = gameConfig.canvas.width;
    const canvasHeight = gameConfig.canvas.height;
    const gridSize = gameConfig.grid.size;

    // Wall collision
    if (head.x < 0 || head.x >= canvasWidth || head.y < 0 || head.y >= canvasHeight) {
        return true;
    }

    // Self collision (start checking from 4th segment to avoid immediate self-collision due to head-body overlap)
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }

    return false;
}

// Places food at a random valid location
function spawnFood(): void {
    const gridSize = gameConfig.grid.size;
    const maxX = (gameConfig.canvas.width / gridSize) - 1;
    const maxY = (gameConfig.canvas.height / gridSize) - 1;

    let newFood: Point;
    let collisionWithSnake: boolean;

    do {
        newFood = {
            x: Math.floor(Math.random() * (maxX + 1)) * gridSize,
            y: Math.floor(Math.random() * (maxY + 1)) * gridSize
        };
        collisionWithSnake = snake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
    } while (collisionWithSnake);

    food = newFood;
}

// Draws all game elements based on current state
function draw(): void {
    ctx.clearRect(0, 0, gameConfig.canvas.width, gameConfig.canvas.height);
    ctx.fillStyle = gameConfig.colors.background;
    ctx.fillRect(0, 0, gameConfig.canvas.width, gameConfig.canvas.height);

    // Draw wall border
    drawWallBorder();

    switch (currentGameState) {
        case GameState.TITLE:
            drawTitleScreen();
            break;
        case GameState.CONTROLS:
            drawControlsScreen();
            break;
        case GameState.PLAYING:
            drawPlayingScreen();
            break;
        case GameState.GAME_OVER:
            drawGameOverScreen();
            break;
    }
}

// Draws the title screen
function drawTitleScreen(): void {
    ctx.fillStyle = gameConfig.colors.uiText;
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(gameConfig.uiText.title, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 50);

    ctx.font = '24px sans-serif';
    ctx.fillText(gameConfig.uiText.startPrompt, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 + 20);
}

// Draws the controls screen
function drawControlsScreen(): void {
    ctx.fillStyle = gameConfig.colors.uiText;
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(gameConfig.uiText.controlsTitle, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 100);

    ctx.font = '20px sans-serif';
    gameConfig.uiText.controlsInstructions.forEach((instruction, index) => {
        ctx.fillText(instruction, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 40 + index * 30);
    });

    ctx.font = '20px sans-serif';
    ctx.fillText(gameConfig.uiText.startPrompt.replace('시작', '계속'), gameConfig.canvas.width / 2, gameConfig.canvas.height - 50);
}

// Draws the main game elements (snake, food, score)
function drawPlayingScreen(): void {
    const gridSize = gameConfig.grid.size;

    // Draw food
    drawImage('food_apple', food.x, food.y);

    // Draw snake
    for (let i = 0; i < snake.length; i++) {
        const segment = snake[i];
        if (i === 0) {
            drawImage('snake_head', segment.x, segment.y);
        } else {
            drawImage('snake_body', segment.x, segment.y);
        }
    }

    // Draw score
    ctx.fillStyle = gameConfig.colors.uiText;
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${gameConfig.uiText.scorePrefix}${score}`, 10, 30);
}

// Draws the game over screen
function drawGameOverScreen(): void {
    drawPlayingScreen(); // Show the final game state with snake and food
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Dim background
    ctx.fillRect(0, 0, gameConfig.canvas.width, gameConfig.canvas.height);

    ctx.fillStyle = gameConfig.colors.uiText;
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(gameConfig.uiText.gameOverTitle, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 50);

    ctx.font = '32px sans-serif';
    ctx.fillText(`${gameConfig.uiText.scorePrefix}${score}`, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 + 10);

    ctx.font = '24px sans-serif';
    ctx.fillText(gameConfig.uiText.restartPrompt, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 + 70);
}

// Draws the decorative wall border using wall_tile asset
function drawWallBorder(): void {
    const gridSize = gameConfig.grid.size;
    const canvasWidth = gameConfig.canvas.width;
    const canvasHeight = gameConfig.canvas.height;

    // Top and Bottom walls
    for (let x = 0; x < canvasWidth; x += gridSize) {
        drawImage('wall_tile', x, 0); // Top
        drawImage('wall_tile', x, canvasHeight - gridSize); // Bottom
    }

    // Left and Right walls (excluding corners already drawn)
    for (let y = gridSize; y < canvasHeight - gridSize; y += gridSize) {
        drawImage('wall_tile', 0, y); // Left
        drawImage('wall_tile', canvasWidth - gridSize, y); // Right
    }
}


// Ensure the game starts when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initGame);
