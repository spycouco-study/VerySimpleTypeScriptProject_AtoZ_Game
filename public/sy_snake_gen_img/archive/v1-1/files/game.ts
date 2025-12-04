interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    gridSize: number;
    initialSnakeLength: number;
    gameSpeedMs: number;
    scorePerFood: number;
    uiFont: string;
    smallUiFont: string;
    titleScreenText: {
        title: string;
        subtitle: string;
        color: string;
    };
    controlsScreenText: {
        title: string;
        moveText: string;
        objectiveText: string;
        warningText: string;
        continueText: string;
        color: string;
    };
    gameOverScreenText: {
        title: string;
        subtitle: string;
        restartText: string;
        color: string;
    };
    scoreDisplayColor: string;
    assets: {
        images: AssetImage[];
        sounds: AssetSound[];
    };
}

interface AssetImage {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface AssetSound {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface LoadedAssets {
    images: { [key: string]: HTMLImageElement };
    sounds: { [key: string]: HTMLAudioElement };
}

type GameState = 'TITLE' | 'CONTROLS' | 'PLAYING' | 'GAME_OVER';
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface SnakeSegment {
    x: number;
    y: number;
}

let config: GameConfig;
let loadedAssets: LoadedAssets;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let gameState: GameState = 'TITLE';
let snake: SnakeSegment[];
let food: SnakeSegment;
let score: number;
let currentDirection: Direction;
let nextDirection: Direction; // Buffer for immediate direction change
let gameIntervalId: number | undefined;

const KEY_SPACE = ' ';
const KEY_ENTER = 'Enter';
const KEY_W = 'w';
const KEY_A = 'a';
const KEY_S = 's';
const KEY_D = 'd';
const KEY_UP = 'ArrowUp';
const KEY_LEFT = 'ArrowLeft';
const KEY_DOWN = 'ArrowDown';
const KEY_RIGHT = 'ArrowRight';

async function initGame() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element with ID "gameCanvas" not found.');
        return;
    }
    ctx = canvas.getContext('2d')!;

    try {
        const response = await fetch('data.json');
        config = await response.json();

        canvas.width = config.canvasWidth;
        canvas.height = config.canvasHeight;

        loadedAssets = await loadAssets(config.assets);
        setupEventListeners();
        resetGame(); // Ensure initial state is ready for title screen
        gameLoop();

    } catch (error) {
        console.error('Failed to load game configuration or assets:', error);
    }
}

async function loadAssets(assetConfig: { images: AssetImage[]; sounds: AssetSound[] }): Promise<LoadedAssets> {
    const imagePromises = assetConfig.images.map(img => {
        return new Promise<[string, HTMLImageElement]>((resolve, reject) => {
            const image = new Image();
            image.src = img.path;
            image.onload = () => resolve([img.name, image]);
            image.onerror = () => reject(`Failed to load image: ${img.path}`);
        });
    });

    const soundPromises = assetConfig.sounds.map(snd => {
        return new Promise<[string, HTMLAudioElement]>((resolve, reject) => {
            const audio = new Audio();
            audio.src = snd.path;
            audio.volume = snd.volume;
            audio.loop = snd.name === 'bgm'; // Loop background music
            audio.oncanplaythrough = () => resolve([snd.name, audio]);
            audio.onerror = () => reject(`Failed to load sound: ${snd.path}`);
        });
    });

    const loadedImages = await Promise.all(imagePromises);
    const loadedSounds = await Promise.all(soundPromises);

    const imagesMap: { [key: string]: HTMLImageElement } = {};
    loadedImages.forEach(([name, img]) => (imagesMap[name] = img));

    const soundsMap: { [key: string]: HTMLAudioElement } = {};
    loadedSounds.forEach(([name, audio]) => (soundsMap[name] = audio));

    return { images: imagesMap, sounds: soundsMap };
}

function setupEventListeners() {
    document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(event: KeyboardEvent) {
    const key = event.key;

    if (gameState === 'TITLE' || gameState === 'CONTROLS' || gameState === 'GAME_OVER') {
        if (key === KEY_SPACE || key === KEY_ENTER) {
            event.preventDefault(); // Prevent scrolling
            if (gameState === 'TITLE') {
                gameState = 'CONTROLS';
                playBGM();
            } else if (gameState === 'CONTROLS') {
                gameState = 'PLAYING';
                startGameInterval();
            } else if (gameState === 'GAME_OVER') {
                resetGame();
                gameState = 'TITLE';
                stopBGM(); 
            }
        }
    }

    if (gameState === 'PLAYING') {
        let newDirection: Direction | null = null;
        switch (key) {
            case KEY_UP:
            case KEY_W:
                newDirection = 'UP';
                break;
            case KEY_DOWN:
            case KEY_S:
                newDirection = 'DOWN';
                break;
            case KEY_LEFT:
            case KEY_A:
                newDirection = 'LEFT';
                break;
            case KEY_RIGHT:
            case KEY_D:
                newDirection = 'RIGHT';
                break;
        }

        if (newDirection) {
            // Prevent immediate reverse direction
            if (!((newDirection === 'UP' && currentDirection === 'DOWN') ||
                (newDirection === 'DOWN' && currentDirection === 'UP') ||
                (newDirection === 'LEFT' && currentDirection === 'RIGHT') ||
                (newDirection === 'RIGHT' && currentDirection === 'LEFT'))) {
                nextDirection = newDirection;
            }
            event.preventDefault(); // Prevent default browser actions for arrow keys
        }
    }
}

function resetGame() {
    snake = [];
    for (let i = 0; i < config.initialSnakeLength; i++) {
        snake.push({ x: Math.floor(config.canvasWidth / 2 / config.gridSize), y: Math.floor(config.canvasHeight / 2 / config.gridSize) + i });
    }
    currentDirection = 'UP';
    nextDirection = 'UP';
    score = 0;
    generateFood();
    stopGameInterval();
    if (gameState === 'GAME_OVER') {
        stopBGM();
    }
}

function startGameInterval() {
    if (gameIntervalId) {
        clearInterval(gameIntervalId);
    }
    gameIntervalId = setInterval(gameTick, config.gameSpeedMs);
    playBGM(); 
}

function stopGameInterval() {
    if (gameIntervalId) {
        clearInterval(gameIntervalId);
        gameIntervalId = undefined;
    }
}

function gameTick() {
    if (gameState !== 'PLAYING') return;

    currentDirection = nextDirection;

    const head = { ...snake[0] };

    switch (currentDirection) {
        case 'UP':
            head.y--;
            break;
        case 'DOWN':
            head.y++;
            break;
        case 'LEFT':
            head.x--;
            break;
        case 'RIGHT':
            head.x++;
            break;
    }

    if (
        head.x < 0 ||
        head.x >= config.canvasWidth / config.gridSize ||
        head.y < 0 ||
        head.y >= config.canvasHeight / config.gridSize ||
        checkSelfCollision(head)
    ) {
        endGame();
        return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score += config.scorePerFood;
        loadedAssets.sounds['eat_food']?.play();
        generateFood();
    } else {
        snake.pop();
    }
}

function checkSelfCollision(head: SnakeSegment): boolean {
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }
    return false;
}

function generateFood() {
    let newFood: SnakeSegment;
    const maxX = config.canvasWidth / config.gridSize;
    const maxY = config.canvasHeight / config.gridSize;
    do {
        newFood = {
            x: Math.floor(Math.random() * maxX),
            y: Math.floor(Math.random() * maxY)
        };
    } while (isOccupiedBySnake(newFood));
    food = newFood;
}

function isOccupiedBySnake(segment: SnakeSegment): boolean {
    return snake.some(s => s.x === segment.x && s.y === segment.y);
}

function endGame() {
    gameState = 'GAME_OVER';
    stopGameInterval();
    loadedAssets.sounds['game_over']?.play();
    stopBGM();
}

function playBGM() {
    const bgm = loadedAssets.sounds['bgm'];
    if (bgm && bgm.paused) {
        bgm.currentTime = 0;
        bgm.play().catch(e => console.warn("BGM autoplay prevented:", e));
    }
}

function stopBGM() {
    const bgm = loadedAssets.sounds['bgm'];
    if (bgm && !bgm.paused) {
        bgm.pause();
    }
}

function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}

function draw() {
    ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);

    const bgImage = loadedAssets.images['background'];
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, config.canvasWidth, config.canvasHeight);
    } else {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);
    }

    if (gameState === 'TITLE') {
        drawTitleScreen();
    } else if (gameState === 'CONTROLS') {
        drawControlsScreen();
    } else if (gameState === 'PLAYING') {
        drawPlayingState();
    } else if (gameState === 'GAME_OVER') {
        drawGameOverScreen();
    }
}

function drawTitleScreen() {
    ctx.fillStyle = config.titleScreenText.color;
    ctx.font = config.uiFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(config.titleScreenText.title, config.canvasWidth / 2, config.canvasHeight / 2 - 50);
    ctx.font = config.smallUiFont;
    ctx.fillText(config.titleScreenText.subtitle, config.canvasWidth / 2, config.canvasHeight / 2 + 20);
}

function drawControlsScreen() {
    ctx.fillStyle = config.controlsScreenText.color;
    ctx.font = config.uiFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(config.controlsScreenText.title, config.canvasWidth / 2, config.canvasHeight / 2 - 120);

    ctx.font = config.smallUiFont;
    ctx.fillText(config.controlsScreenText.moveText, config.canvasWidth / 2, config.canvasHeight / 2 - 40);
    ctx.fillText(config.controlsScreenText.objectiveText, config.canvasWidth / 2, config.canvasHeight / 2);
    ctx.fillText(config.controlsScreenText.warningText, config.canvasWidth / 2, config.canvasHeight / 2 + 40);

    ctx.fillText(config.controlsScreenText.continueText, config.canvasWidth / 2, config.canvasHeight / 2 + 120);
}

function drawPlayingState() {
    const foodImage = loadedAssets.images['food'];
    if (foodImage) {
        ctx.drawImage(foodImage, food.x * config.gridSize, food.y * config.gridSize, config.gridSize, config.gridSize);
    } else {
        ctx.fillStyle = 'orange'; // Fallback
        ctx.fillRect(food.x * config.gridSize, food.y * config.gridSize, config.gridSize, config.gridSize);
    }

    for (let i = 0; i < snake.length; i++) {
        const segment = snake[i];
        const assetName = (i === 0) ? 'snake_head' : 'snake_body';
        const image = loadedAssets.images[assetName];

        if (image) {
            ctx.drawImage(image, segment.x * config.gridSize, segment.y * config.gridSize, config.gridSize, config.gridSize);
        } else {
            ctx.fillStyle = (i === 0) ? '#00FF00' : '#00AA00'; // Fallback colors for head/body
            ctx.fillRect(segment.x * config.gridSize, segment.y * config.gridSize, config.gridSize, config.gridSize);
        }
    }

    ctx.fillStyle = config.scoreDisplayColor;
    ctx.font = config.smallUiFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`점수: ${score}`, 10, 10);
}

function drawGameOverScreen() {
    ctx.fillStyle = config.gameOverScreenText.color;
    ctx.font = config.uiFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(config.gameOverScreenText.title, config.canvasWidth / 2, config.canvasHeight / 2 - 50);
    ctx.font = config.smallUiFont;
    ctx.fillText(`${config.gameOverScreenText.subtitle} ${score}`, config.canvasWidth / 2, config.canvasHeight / 2);
    ctx.fillText(config.gameOverScreenText.restartText, config.canvasWidth / 2, config.canvasHeight / 2 + 50);
}

document.addEventListener('DOMContentLoaded', initGame);
