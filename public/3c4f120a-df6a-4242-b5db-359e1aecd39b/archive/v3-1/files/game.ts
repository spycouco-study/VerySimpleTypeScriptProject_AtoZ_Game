interface Point {
    x: number;
    y: number;
}

interface Cell {
    isMine: boolean;
    isRevealed: boolean;
    isFlagged: boolean;
    adjacentMines: number;
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
    duration_seconds: number;
    volume: number;
}

interface AssetsConfig {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface GameSettings {
    boardWidth: number;
    boardHeight: number;
    numMines: number;
    cellSize: number;
    boardOffsetX: number; // Will be dynamically calculated
    boardOffsetY: number; // Will be dynamically calculated
}

interface UISettings {
    canvasWidth: number;
    canvasHeight: number;
    titleScreenText: string;
    titleScreenInstructions: string;
    instructionsText: string[];
    winMessage: string;
    loseMessage: string;
    mineCounterPrefix: string;
    timerPrefix: string;
}

interface Colors {
    backgroundColor: string;
    textColor: string;
    coveredCellColor: string;
    revealedCellColor: string;
    mineTextColor: string;
    numberColors: { [key: string]: string };
}

interface GameConfig {
    gameSettings: GameSettings;
    uiSettings: UISettings;
    colors: Colors;
    assets: AssetsConfig;
}

enum GameState {
    LOADING = 'LOADING',
    TITLE = 'TITLE',
    INSTRUCTIONS = 'INSTRUCTIONS',
    PLAYING = 'PLAYING',
    GAME_OVER_WIN = 'GAME_OVER_WIN',
    GAME_OVER_LOSE = 'GAME_OVER_LOSE'
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let config: GameConfig;
let images: Map<string, HTMLImageElement> = new Map();
let sounds: Map<string, HTMLAudioElement> = new Map();

let gameState: GameState = GameState.LOADING;
let board: Cell[][];
let remainingMines: number;
let firstClick: boolean = true;
let revealedCellsCount: number = 0;
let flagsPlacedCount: number = 0;
let startTime: number = 0;
let elapsedTime: number = 0;
let isMouseDown: boolean = false; // To track mouse hold for click detection

async function loadImage(asset: ImageAsset): Promise<[string, HTMLImageElement]> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = asset.path;
        img.onload = () => resolve([asset.name, img]);
        img.onerror = () => reject(new Error(`Failed to load image: ${asset.path}`));
    });
}

async function loadSound(asset: SoundAsset): Promise<[string, HTMLAudioElement]> {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = asset.path;
        audio.preload = 'auto';
        audio.volume = asset.volume;
        // Ensure audio can be played through before resolving
        audio.oncanplaythrough = () => resolve([asset.name, audio]);
        audio.onerror = () => reject(new Error(`Failed to load sound: ${asset.path}`));
    });
}

function playAudio(name: string, loop: boolean = false) {
    const audio = sounds.get(name);
    if (audio) {
        audio.currentTime = 0;
        audio.loop = loop;
        // Playing audio might require user interaction, wrap in try/catch for safety
        audio.play().catch(e => {
            console.error(`Error playing audio ${name}:`, e);
            // On some browsers, autoplay without user gesture might be blocked.
            // A common workaround is to have the user interact first.
        });
    }
}

function stopAudio(name: string) {
    const audio = sounds.get(name);
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

function drawCenteredText(text: string, y: number, font: string, color: string) {
    if (!ctx || !config) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, config.uiSettings.canvasWidth / 2, y);
}

function getMousePos(event: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;    // Get the ratio of canvas internal width to its CSS width
    const scaleY = canvas.height / rect.height;  // Get the ratio of canvas internal height to its CSS height

    return {
        x: (event.clientX - rect.left) * scaleX, // Scale the mouse coordinates to the canvas drawing buffer size
        y: (event.clientY - rect.top) * scaleY
    };
}

async function initGame() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d')!;

    try {
        const response = await fetch('data.json');
        config = await response.json();
    } catch (error) {
        console.error("Failed to load game configuration:", error);
        return;
    }

    canvas.width = config.uiSettings.canvasWidth;
    canvas.height = config.uiSettings.canvasHeight;

    // Calculate dynamic board offsets for centering
    const { boardWidth, boardHeight, cellSize } = config.gameSettings;
    const { canvasWidth, canvasHeight } = config.uiSettings;

    const totalBoardWidth = boardWidth * cellSize;
    const totalBoardHeight = boardHeight * cellSize;

    // Calculate horizontal offset for true centering
    config.gameSettings.boardOffsetX = (canvasWidth - totalBoardWidth) / 2;

    // Calculate vertical offset, ensuring enough space for UI at the top
    // UI text (mine counter, timer) will be drawn at a fixed Y=30.
    // The board should start below a certain minimum Y to avoid overlap.
    const minBoardTopY = 60; // Allow for UI text (approx 24px font) plus padding
    const potentialBoardOffsetY = (canvasHeight - totalBoardHeight) / 2;
    config.gameSettings.boardOffsetY = Math.max(potentialBoardOffsetY, minBoardTopY);

    try {
        const imagePromises = config.assets.images.map(loadImage);
        const soundPromises = config.assets.sounds.map(loadSound);

        const loadedImages = await Promise.all(imagePromises);
        loadedImages.forEach(([name, img]) => images.set(name, img));

        const loadedSounds = await Promise.all(soundPromises);
        loadedSounds.forEach(([name, audio]) => sounds.set(name, audio));

        console.log("Assets loaded successfully.");
    } catch (error) {
        console.error("Failed to load assets:", error);
        return;
    }

    addEventListeners();
    gameState = GameState.TITLE;
    gameLoop();
}

function addEventListeners() {
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('contextmenu', handleContextMenu);
}

function resetGame() {
    const { boardWidth, boardHeight } = config.gameSettings;
    board = Array(boardHeight).fill(null).map(() =>
        Array(boardWidth).fill(null).map(() => ({
            isMine: false,
            isRevealed: false,
            isFlagged: false,
            adjacentMines: 0
        }))
    );
    remainingMines = config.gameSettings.numMines;
    firstClick = true;
    revealedCellsCount = 0;
    flagsPlacedCount = 0;
    startTime = 0;
    elapsedTime = 0;
    stopAudio('bgm');
    gameState = GameState.PLAYING;
    playAudio('bgm', true); // Automatically start BGM when game enters PLAYING state
}

function generateBoard(initialClickX: number, initialClickY: number) {
    const { boardWidth, boardHeight, numMines } = config.gameSettings;
    let minesToPlace = numMines;

    while (minesToPlace > 0) {
        const r = Math.floor(Math.random() * boardHeight);
        const c = Math.floor(Math.random() * boardWidth);

        const isSafeZone = (x: number, y: number) => {
            return (
                Math.abs(x - initialClickX) <= 1 &&
                Math.abs(y - initialClickY) <= 1
            );
        };

        if (!board[r][c].isMine && !isSafeZone(c, r)) {
            board[r][c].isMine = true;
            minesToPlace--;
        }
    }

    for (let r = 0; r < boardHeight; r++) {
        for (let c = 0; c < boardWidth; c++) {
            if (!board[r][c].isMine) {
                board[r][c].adjacentMines = countAdjacentMines(r, c);
            }
        }
    }
}

function countAdjacentMines(r: number, c: number): number {
    const { boardWidth, boardHeight } = config.gameSettings;
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;

            const nr = r + dr;
            const nc = c + dc;

            if (nr >= 0 && nr < boardHeight && nc >= 0 && nc < boardWidth && board[nr][nc].isMine) {
                count++;
            }
        }
    }
    return count;
}

function revealCell(r: number, c: number) {
    const { boardWidth, boardHeight, numMines } = config.gameSettings;

    if (r < 0 || r >= boardHeight || c < 0 || c >= boardWidth || board[r][c].isRevealed || board[r][c].isFlagged) {
        return;
    }

    if (firstClick) {
        // BGM is now started in resetGame() when transitioning to PLAYING
        // Only generate board and set start time here for the very first click
        generateBoard(c, r);
        firstClick = false;
        startTime = performance.now();
    }

    board[r][c].isRevealed = true;
    revealedCellsCount++;
    playAudio('click_reveal');

    if (board[r][c].isMine) {
        gameOver(GameState.GAME_OVER_LOSE);
        return;
    }

    if (board[r][c].adjacentMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                revealCell(r + dr, c + dc);
            }
        }
    }

    checkWinCondition();
}

function toggleFlag(r: number, c: number) {
    const { boardWidth, boardHeight } = config.gameSettings;

    if (r < 0 || r >= boardHeight || c < 0 || c >= boardWidth || board[r][c].isRevealed) {
        return;
    }

    if (firstClick) return;

    board[r][c].isFlagged = !board[r][c].isFlagged;
    playAudio('click_flag');

    if (board[r][c].isFlagged) {
        flagsPlacedCount++;
    } else {
        flagsPlacedCount--;
    }
    remainingMines = config.gameSettings.numMines - flagsPlacedCount;
    checkWinCondition();
}

function checkWinCondition() {
    const { boardWidth, boardHeight, numMines } = config.gameSettings;
    const totalCells = boardWidth * boardHeight;

    if (revealedCellsCount === (totalCells - numMines)) {
        gameOver(GameState.GAME_OVER_WIN);
    }
}

function gameOver(reason: GameState) {
    gameState = reason;
    stopAudio('bgm');
    if (reason === GameState.GAME_OVER_LOSE) {
        const { boardWidth, boardHeight } = config.gameSettings;
        for (let r = 0; r < boardHeight; r++) {
            for (let c = 0; c < boardWidth; c++) {
                if (board[r][c].isMine && !board[r][c].isFlagged) {
                    board[r][c].isRevealed = true;
                }
            }
        }
        playAudio('explosion');
    } else if (reason === GameState.GAME_OVER_WIN) {
        playAudio('win_sound');
    }
}

function draw() {
    if (!ctx || !config) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = config.colors.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    switch (gameState) {
        case GameState.LOADING:
            drawCenteredText('로딩 중...', canvas.height / 2, '30px Arial', config.colors.textColor);
            break;
        case GameState.TITLE:
            drawTitleScreen();
            break;
        case GameState.INSTRUCTIONS:
            drawInstructionsScreen();
            break;
        case GameState.PLAYING:
        case GameState.GAME_OVER_WIN:
        case GameState.GAME_OVER_LOSE:
            drawGameScreen();
            drawUIScreen();
            if (gameState === GameState.GAME_OVER_WIN || gameState === GameState.GAME_OVER_LOSE) {
                drawGameOverScreen();
            }
            break;
    }
}

function drawTitleScreen() {
    if (!config) return;
    drawCenteredText(config.uiSettings.titleScreenText, canvas.height / 2 - 50, '50px Arial', config.colors.textColor);
    drawCenteredText(config.uiSettings.titleScreenInstructions, canvas.height / 2 + 50, '20px Arial', config.colors.textColor);
}

function drawInstructionsScreen() {
    if (!config) return;
    let yOffset = canvas.height / 2 - config.uiSettings.instructionsText.length * 20 / 2;
    for (const line of config.uiSettings.instructionsText) {
        drawCenteredText(line, yOffset, '20px Arial', config.colors.textColor);
        yOffset += 30;
    }
}

function drawGameScreen() {
    const { boardWidth, boardHeight, cellSize, boardOffsetX, boardOffsetY } = config.gameSettings;

    for (let r = 0; r < boardHeight; r++) {
        for (let c = 0; c < boardWidth; c++) {
            const cell = board[r][c];
            const x = boardOffsetX + c * cellSize;
            const y = boardOffsetY + r * cellSize;

            let img: HTMLImageElement | undefined;

            if (cell.isRevealed) {
                if (cell.isMine) {
                    img = images.get('mine');
                } else if (cell.adjacentMines > 0) {
                    img = images.get(`number_${cell.adjacentMines}`);
                } else {
                    img = images.get('revealed_empty');
                }
            } else if (cell.isFlagged) {
                img = images.get('flag');
            } else {
                img = images.get('covered');
            }

            if (img) {
                ctx.drawImage(img, x, y, cellSize, cellSize);
            }
        }
    }
}

function drawUIScreen() {
    const { mineCounterPrefix, timerPrefix } = config.uiSettings;
    const { boardOffsetX } = config.gameSettings; // Only need boardOffsetX for horizontal positioning
    const { textColor } = config.colors;

    const uiTextY = 30; // Fixed Y position for UI text elements

    ctx.font = '24px Arial';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.fillText(`${mineCounterPrefix}${remainingMines}`, boardOffsetX, uiTextY); // Use fixed Y

    if (gameState === GameState.PLAYING && startTime > 0) {
        elapsedTime = Math.floor((performance.now() - startTime) / 1000);
    }
    ctx.textAlign = 'right';
    ctx.fillText(`${timerPrefix}${elapsedTime}`, config.uiSettings.canvasWidth - boardOffsetX, uiTextY); // Use fixed Y
}

function drawGameOverScreen() {
    const { winMessage, loseMessage } = config.uiSettings;
    const { textColor } = config.colors;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const message = (gameState === GameState.GAME_OVER_WIN) ? winMessage : loseMessage;
    drawCenteredText(message, canvas.height / 2 - 50, '40px Arial', textColor);
    drawCenteredText('다시 시작하려면 클릭하세요.', canvas.height / 2 + 50, '20px Arial', textColor);
}

function handleMouseDown(event: MouseEvent) {
    isMouseDown = true;
}

function handleMouseUp(event: MouseEvent) {
    if (!isMouseDown) return;
    isMouseDown = false;

    const mousePos = getMousePos(event);
    const { boardOffsetX, boardOffsetY, cellSize, boardWidth, boardHeight } = config.gameSettings;

    const col = Math.floor((mousePos.x - boardOffsetX) / cellSize);
    const row = Math.floor((mousePos.y - boardOffsetY) / cellSize);

    const isInsideBoard = col >= 0 && col < boardWidth && row >= 0 && row < boardHeight;

    switch (gameState) {
        case GameState.TITLE:
            gameState = GameState.INSTRUCTIONS;
            break;
        case GameState.INSTRUCTIONS:
            resetGame(); // Prepares board structure and starts BGM
            break;
        case GameState.PLAYING:
            if (isInsideBoard) {
                if (event.button === 0) { // Left click
                    revealCell(row, col);
                }
            }
            break;
        case GameState.GAME_OVER_WIN:
        case GameState.GAME_OVER_LOSE:
            resetGame();
            break;
    }
}

function handleContextMenu(event: MouseEvent) {
    event.preventDefault();

    if (gameState === GameState.PLAYING) {
        const mousePos = getMousePos(event);
        const { boardOffsetX, boardOffsetY, cellSize, boardWidth, boardHeight } = config.gameSettings;

        const col = Math.floor((mousePos.x - boardOffsetX) / cellSize);
        const row = Math.floor((mousePos.y - boardOffsetY) / cellSize);

        const isInsideBoard = col >= 0 && col < boardWidth && row >= 0 && row < boardHeight;

        if (isInsideBoard && event.button === 2) { // Right click
            toggleFlag(row, col);
        }
    }
}

function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}

initGame();
