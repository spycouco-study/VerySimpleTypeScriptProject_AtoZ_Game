interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    boardWidth: number;
    boardHeight: number;
    blockSize: number;
    initialFallSpeed: number; // ms
    speedIncreaseRate: number; // multiplier for fall speed per level
    levelUpLines: number;
    scorePerLine: number;
    scorePerTetris: number;
    boardOffsetX: number;
    boardOffsetY: number;
    nextPieceOffsetX: number;
    nextPieceOffsetY: number;
    scoreTextOffsetX: number;
    scoreTextOffsetY: number;
    levelTextOffsetX: number;
    levelTextOffsetY: number;
    linesTextOffsetX: number;
    linesTextOffsetY: number;
}

interface Colors {
    boardBackground: string;
    gridLine: string;
    textPrimary: string;
    textSecondary: string;
    i_piece: string;
    o_piece: string;
    t_piece: string;
    s_piece: string;
    z_piece: string;
    j_piece: string;
    l_piece: string;
    outline: string;
}

interface TetrominoData {
    name: string;
    color: keyof Colors; // Use keyof Colors to reference color names
    shape: number[][]; // Initial shape
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

interface GameData {
    gameSettings: GameSettings;
    colors: Colors;
    tetrominoes: TetrominoData[];
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

// Global game variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData;
const loadedImages: Map<string, HTMLImageElement> = new Map();
const loadedSounds: Map<string, HTMLAudioElement> = new Map();

// Game State Management
enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    PAUSED, // Added for potential pause screen, though not explicitly requested, it's good practice.
    GAME_OVER
}
let currentGameState: GameState = GameState.TITLE;

// Sound Control
let isSoundOn: boolean = true;
let bgmAudio: HTMLAudioElement | null = null;

// Game Logic Variables
let board: (string | null)[][]; // Stores color keys or null for empty cells
let currentPiece: Tetromino | null = null;
let nextPiece: Tetromino | null = null;
let score: number = 0;
let level: number = 1;
let linesCleared: number = 0;

// Game Loop Timing
let lastFrameTime: DOMHighResTimeStamp = 0;
let fallAccumulator: number = 0; // Time since last auto-fall
let currentFallSpeed: number; // Milliseconds per fall step

// Input handling
let lastHorizontalMoveTime: number = 0;
const horizontalMoveDelay: number = 100; // ms between horizontal moves when key is held
const initialHorizontalMoveDelay: number = 200; // ms for the first horizontal move after press
let keyPressStatus: { [key: string]: boolean } = {}; // To track if a key is currently pressed
let lastHardDropTime: number = 0;
const hardDropCooldown: number = 200; // Cooldown for hard drop to prevent accidental multiple drops

// Tetromino Class
class Tetromino {
    x: number;
    y: number;
    shape: number[][];
    colorKey: keyof Colors;
    rotations: number[][][]; // Array of possible shapes for rotation

    constructor(data: TetrominoData) {
        this.colorKey = data.color;
        this.rotations = this.generateRotations(data.shape);
        this.shape = this.rotations[0]; // Start with the first rotation state
        this.x = Math.floor(gameData.gameSettings.boardWidth / 2) - Math.floor(this.shape[0].length / 2);
        this.y = 0; // Start at the top of the board
    }

    // Generates all 4 rotation states for a given shape
    private generateRotations(initialShape: number[][]): number[][][] {
        const rotations: number[][][] = [initialShape];
        let currentShape = initialShape;

        for (let i = 0; i < 3; i++) { // Generate 3 more rotations
            currentShape = this.rotateMatrix(currentShape);
            rotations.push(currentShape);
        }
        return rotations;
    }

    private rotateMatrix(matrix: number[][]): number[][] {
        const N = matrix.length;
        const M = matrix[0].length;
        const rotated: number[][] = Array(M).fill(0).map(() => Array(N).fill(0));

        for (let i = 0; i < N; i++) {
            for (let j = 0; j < M; j++) {
                rotated[j][N - 1 - i] = matrix[i][j];
            }
        }
        return rotated;
    }

    // Attempts to move the piece, returns true if successful
    move(dx: number, dy: number): boolean {
        if (!checkCollision(this, dx, dy, this.shape)) {
            this.x += dx;
            this.y += dy;
            return true;
        }
        return false;
    }

    // Attempts to rotate the piece, returns true if successful
    rotate(): boolean {
        const currentRotationIndex = this.rotations.indexOf(this.shape);
        const nextRotationIndex = (currentRotationIndex + 1) % this.rotations.length;
        const nextShape = this.rotations[nextRotationIndex];

        // Simple wall kick mechanism: try to shift if collision
        const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]; // Try original, left, right, up, down
        for (const [ox, oy] of offsets) {
            if (!checkCollision(this, ox, oy, nextShape)) {
                this.x += ox;
                this.y += oy;
                this.shape = nextShape;
                playSound('rotate');
                return true;
            }
        }
        return false;
    }

    // Draws the tetromino on the canvas
    draw(offsetX: number = 0, offsetY: number = 0): void {
        const { blockSize } = gameData.gameSettings;
        const color = gameData.colors[this.colorKey];
        const blockImage = loadedImages.get('block');

        for (let r = 0; r < this.shape.length; r++) {
            for (let c = 0; c < this.shape[r].length; c++) {
                if (this.shape[r][c] === 1) {
                    const drawX = (this.x + c + offsetX) * blockSize + gameData.gameSettings.boardOffsetX;
                    const drawY = (this.y + r + offsetY) * blockSize + gameData.gameSettings.boardOffsetY;

                    if (blockImage) {
                        ctx.drawImage(blockImage, drawX, drawY, blockSize, blockSize);
                    } else {
                        ctx.fillStyle = color;
                        ctx.fillRect(drawX, drawY, blockSize, blockSize);
                        ctx.strokeStyle = gameData.colors.outline;
                        ctx.strokeRect(drawX, drawY, blockSize, blockSize);
                    }
                }
            }
        }
    }
}

// Asset Loading
async function loadAssets(): Promise<void> {
    const imagePromises = gameData.assets.images.map(asset => {
        return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                loadedImages.set(asset.name, img);
                resolve();
            };
            img.onerror = () => reject(`Failed to load image: ${asset.path}`);
        });
    });

    const soundPromises = gameData.assets.sounds.map(asset => {
        return new Promise<void>((resolve, reject) => {
            const audio = new Audio(asset.path);
            audio.volume = asset.volume;
            audio.oncanplaythrough = () => {
                loadedSounds.set(asset.name, audio);
                resolve();
            };
            audio.onerror = () => reject(`Failed to load sound: ${asset.path}`);
        });
    });

    await Promise.all([...imagePromises, ...soundPromises]);
}

// Game Data Loading
async function loadGameData(): Promise<GameData> {
    const response = await fetch('data.json');
    if (!response.ok) {
        throw new Error(`Failed to load data.json: ${response.statusText}`);
    }
    return response.json();
}

// Game Initialization
async function initGame(): Promise<void> {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    ctx = canvas.getContext('2d')!;

    // Load game data and assets
    try {
        gameData = await loadGameData();
        canvas.width = gameData.gameSettings.canvasWidth;
        canvas.height = gameData.gameSettings.canvasHeight;
        await loadAssets();
        console.log('Game data and assets loaded successfully!');
    } catch (error) {
        console.error('Error during initialization:', error);
        return;
    }

    // Initialize sound
    bgmAudio = loadedSounds.get('bgm') || null;
    if (bgmAudio) {
        bgmAudio.loop = true;
        bgmAudio.volume = isSoundOn ? gameData.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.3 : 0;
        bgmAudio.play().catch(e => console.log("BGM auto-play blocked, will play on user interaction.", e));
    }

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousedown', handleMouseDown);

    resetGameVariables();
    currentFallSpeed = gameData.gameSettings.initialFallSpeed;

    // Start the game loop
    requestAnimationFrame(gameLoop);
}

// Reset game variables for new game
function resetGameVariables(): void {
    const { boardWidth, boardHeight } = gameData.gameSettings;
    board = Array(boardHeight).fill(null).map(() => Array(boardWidth).fill(null));
    score = 0;
    level = 1;
    linesCleared = 0;
    currentPiece = null;
    nextPiece = null;
    spawnNewPiece(); // Spawn first piece
    spawnNextPiece(); // Spawn piece for 'next' display
    fallAccumulator = 0;
    currentFallSpeed = gameData.gameSettings.initialFallSpeed;
}

// Game Loop
function gameLoop(currentTime: DOMHighResTimeStamp): void {
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

// Update game state
function update(deltaTime: number): void {
    if (currentGameState === GameState.PLAYING) {
        fallAccumulator += deltaTime;

        // Auto fall logic
        if (fallAccumulator >= currentFallSpeed) {
            if (currentPiece && !currentPiece.move(0, 1)) {
                // Piece landed
                mergePieceIntoBoard();
                clearLines();
                if (!spawnNewPiece()) {
                    currentGameState = GameState.GAME_OVER;
                    playSound('game_over');
                    if (bgmAudio) bgmAudio.pause();
                }
            }
            fallAccumulator = 0;
        }

        // Handle continuous horizontal movement
        if (keyPressStatus['ArrowLeft'] || keyPressStatus['ArrowRight']) {
            const now = performance.now();
            if (now - lastHorizontalMoveTime > (lastHorizontalMoveTime === 0 ? initialHorizontalMoveDelay : horizontalMoveDelay)) {
                if (keyPressStatus['ArrowLeft'] && currentPiece && currentPiece.move(-1, 0)) {
                    playSound('move');
                } else if (keyPressStatus['ArrowRight'] && currentPiece && currentPiece.move(1, 0)) {
                    playSound('move');
                }
                lastHorizontalMoveTime = now;
            }
        } else {
            lastHorizontalMoveTime = 0; // Reset timer when no horizontal key is pressed
        }
    }
}

// Draw everything on the canvas
function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (currentGameState) {
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
            drawPlayingScreen(); // Draw game board for game over screen
            drawGameOverScreen();
            break;
    }

    drawSoundToggleButton();
}

// UI Drawing Functions
function drawTitleScreen(): void {
    const { canvasWidth, canvasHeight } = gameData.gameSettings;
    const backgroundImage = loadedImages.get('title_screen_bg');
    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = gameData.colors.boardBackground;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    ctx.fillStyle = gameData.colors.textPrimary;
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial';
    ctx.fillText('테트리스', canvasWidth / 2, canvasHeight / 2 - 50);

    ctx.font = '24px Arial';
    ctx.fillText('시작하려면 Enter 키를 누르세요', canvasWidth / 2, canvasHeight / 2 + 50);
}

function drawInstructionsScreen(): void {
    const { canvasWidth, canvasHeight } = gameData.gameSettings;
    ctx.fillStyle = gameData.colors.boardBackground;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = gameData.colors.textPrimary;
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Arial';
    ctx.fillText('조작법', canvasWidth / 2, 100);

    ctx.font = '24px Arial';
    ctx.fillText('← → : 블록 이동', canvasWidth / 2, 200);
    ctx.fillText('↑ 또는 X : 블록 회전', canvasWidth / 2, 250);
    ctx.fillText('↓ : 소프트 드롭 (천천히 내리기)', canvasWidth / 2, 300);
    ctx.fillText('Space : 하드 드롭 (바로 내리기)', canvasWidth / 2, 350);
    ctx.fillText('Enter : 게임 시작', canvasWidth / 2, 450);
}

function drawPlayingScreen(): void {
    const { boardWidth, boardHeight, blockSize, boardOffsetX, boardOffsetY, canvasWidth, canvasHeight } = gameData.gameSettings;

    // Draw background for the entire canvas (optional, if using images)
    const gameBackground = loadedImages.get('background');
    if (gameBackground) {
        ctx.drawImage(gameBackground, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = gameData.colors.boardBackground;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }


    // Draw game board background
    ctx.fillStyle = '#111'; // Darker background for the board area
    ctx.fillRect(boardOffsetX, boardOffsetY, boardWidth * blockSize, boardHeight * blockSize);

    // Draw existing blocks on the board
    const blockImage = loadedImages.get('block');
    for (let r = 0; r < boardHeight; r++) {
        for (let c = 0; c < boardWidth; c++) {
            const colorKey = board[r][c];
            if (colorKey) {
                const drawX = c * blockSize + boardOffsetX;
                const drawY = r * blockSize + boardOffsetY;
                if (blockImage) {
                    ctx.drawImage(blockImage, drawX, drawY, blockSize, blockSize);
                } else {
                    ctx.fillStyle = gameData.colors[colorKey];
                    ctx.fillRect(drawX, drawY, blockSize, blockSize);
                    ctx.strokeStyle = gameData.colors.outline;
                    ctx.strokeRect(drawX, drawY, blockSize, blockSize);
                }
            }
        }
    }

    // Draw current falling piece
    if (currentPiece) {
        currentPiece.draw();
    }

    // Draw board grid lines
    ctx.strokeStyle = gameData.colors.gridLine;
    for (let i = 0; i <= boardWidth; i++) {
        ctx.beginPath();
        ctx.moveTo(i * blockSize + boardOffsetX, boardOffsetY);
        ctx.lineTo(i * blockSize + boardOffsetX, boardHeight * blockSize + boardOffsetY);
        ctx.stroke();
    }
    for (let i = 0; i <= boardHeight; i++) {
        ctx.beginPath();
        ctx.moveTo(boardOffsetX, i * blockSize + boardOffsetY);
        ctx.lineTo(boardWidth * blockSize + boardOffsetX, i * blockSize + boardOffsetY);
        ctx.stroke();
    }

    // Draw UI: Score, Level, Lines
    ctx.fillStyle = gameData.colors.textPrimary;
    ctx.textAlign = 'left';
    ctx.font = '24px Arial';
    ctx.fillText(`점수: ${score}`, gameData.gameSettings.scoreTextOffsetX, gameData.gameSettings.scoreTextOffsetY);
    ctx.fillText(`레벨: ${level}`, gameData.gameSettings.levelTextOffsetX, gameData.gameSettings.levelTextOffsetY);
    ctx.fillText(`라인: ${linesCleared}`, gameData.gameSettings.linesTextOffsetX, gameData.gameSettings.linesTextOffsetY);

    // Draw 'Next' piece
    ctx.fillText('다음 블록:', gameData.gameSettings.nextPieceOffsetX, gameData.gameSettings.nextPieceOffsetY - 30);
    if (nextPiece) {
        // Adjust draw position for 'next' piece display area
        const nextPieceDrawX = gameData.gameSettings.nextPieceOffsetX / blockSize;
        const nextPieceDrawY = gameData.gameSettings.nextPieceOffsetY / blockSize;
        nextPiece.draw(nextPieceDrawX - nextPiece.x, nextPieceDrawY - nextPiece.y);
    }
}

function drawGameOverScreen(): void {
    const { canvasWidth, canvasHeight } = gameData.gameSettings;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent overlay
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = gameData.colors.textPrimary;
    ctx.textAlign = 'center';
    ctx.font = 'bold 60px Arial';
    ctx.fillText('게임 오버!', canvasWidth / 2, canvasHeight / 2 - 50);

    ctx.font = '30px Arial';
    ctx.fillText(`최종 점수: ${score}`, canvasWidth / 2, canvasHeight / 2 + 20);
    ctx.fillText('다시 시작하려면 Enter 키를 누르세요', canvasWidth / 2, canvasHeight / 2 + 80);
}

function drawSoundToggleButton(): void {
    const iconSize = 32;
    const padding = 10;
    const drawX = canvas.width - iconSize - padding;
    const drawY = padding;

    const icon = isSoundOn ? loadedImages.get('sound_on_icon') : loadedImages.get('sound_off_icon');
    if (icon) {
        ctx.drawImage(icon, drawX, drawY, iconSize, iconSize);
    } else {
        // Fallback for missing icon image
        ctx.fillStyle = isSoundOn ? 'green' : 'red';
        ctx.fillRect(drawX, drawY, iconSize, iconSize);
        ctx.strokeStyle = 'white';
        ctx.strokeRect(drawX, drawY, iconSize, iconSize);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(isSoundOn ? 'ON' : 'OFF', drawX + iconSize / 2, drawY + iconSize / 2 + 4);
    }
}

// Game Control Functions
function spawnNewPiece(): boolean {
    if (nextPiece) {
        currentPiece = nextPiece;
        spawnNextPiece();
    } else {
        // This case should ideally not happen if nextPiece is always pre-generated
        const randomData = gameData.tetrominoes[Math.floor(Math.random() * gameData.tetrominoes.length)];
        currentPiece = new Tetromino(randomData);
        spawnNextPiece();
    }

    // Check for immediate game over
    if (currentPiece && checkCollision(currentPiece, 0, 0, currentPiece.shape)) {
        return false; // Cannot spawn new piece, game over
    }
    return true;
}

function spawnNextPiece(): void {
    const randomData = gameData.tetrominoes[Math.floor(Math.random() * gameData.tetrominoes.length)];
    nextPiece = new Tetromino(randomData);
    // Reset next piece position to display it clearly in the 'next' box
    nextPiece.x = 0; // Relative to its own small grid for drawing
    nextPiece.y = 0;
}


// Collision detection function
function checkCollision(piece: Tetromino, dx: number, dy: number, newShape: number[][]): boolean {
    const { boardWidth, boardHeight } = gameData.gameSettings;
    for (let r = 0; r < newShape.length; r++) {
        for (let c = 0; c < newShape[r].length; c++) {
            if (newShape[r][c] === 1) {
                const boardX = piece.x + c + dx;
                const boardY = piece.y + r + dy;

                // Check wall and floor collision
                if (boardX < 0 || boardX >= boardWidth || boardY >= boardHeight) {
                    return true;
                }
                // Check ceiling collision (allow pieces to start above board but not get stuck)
                if (boardY < 0) {
                    // if moving down into negative Y, allow. If colliding with existing block at Y=0, disallow.
                    // This specific check avoids false positives when piece spawns at Y=0 and has blocks above it in its shape
                    // If the piece's block at boardY is < 0, it means it's above the visible board, which is fine for spawning.
                    continue;
                }

                // Check collision with existing blocks on the board
                if (board[boardY][boardX] !== null) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Merge the current piece into the board
function mergePieceIntoBoard(): void {
    if (!currentPiece) return;
    playSound('land');
    const color = currentPiece.colorKey;
    for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c] === 1) {
                const boardX = currentPiece.x + c;
                const boardY = currentPiece.y + r;
                if (boardY >= 0 && boardY < gameData.gameSettings.boardHeight &&
                    boardX >= 0 && boardX < gameData.gameSettings.boardWidth) {
                    board[boardY][boardX] = color;
                }
            }
        }
    }
    currentPiece = null; // Piece has landed
}

// Clear full lines and update score/level
function clearLines(): void {
    const { boardHeight, boardWidth, levelUpLines, scorePerLine, scorePerTetris } = gameData.gameSettings;
    let linesClearedThisTurn = 0;
    let newBoard: (string | null)[][] = Array(boardHeight).fill(null).map(() => Array(boardWidth).fill(null));
    let currentRow = boardHeight - 1;

    for (let r = boardHeight - 1; r >= 0; r--) {
        if (board[r].every(cell => cell !== null)) {
            linesClearedThisTurn++;
        } else {
            newBoard[currentRow] = board[r];
            currentRow--;
        }
    }

    board = newBoard;

    if (linesClearedThisTurn > 0) {
        linesCleared += linesClearedThisTurn;
        playSound('line_clear');

        // Scoring logic
        switch (linesClearedThisTurn) {
            case 1: score += scorePerLine; break;
            case 2: score += scorePerLine * 2.5; break; // Example: double line bonus
            case 3: score += scorePerLine * 5; break;  // Example: triple line bonus
            case 4: score += scorePerTetris; break;    // Tetris bonus
        }

        // Level up logic
        const oldLevel = level;
        level = Math.floor(linesCleared / levelUpLines) + 1;
        if (level > oldLevel) {
            currentFallSpeed = gameData.gameSettings.initialFallSpeed * Math.pow(gameData.gameSettings.speedIncreaseRate, level - 1);
            if (currentFallSpeed < 50) currentFallSpeed = 50; // Minimum fall speed
        }
    }
}

// Sound Control Functions
function playSound(name: string, loop: boolean = false): void {
    if (!isSoundOn) return;
    const audio = loadedSounds.get(name);
    if (audio) {
        // Clone audio to allow multiple concurrent plays (e.g. for multiple moves)
        const clonedAudio = audio.cloneNode() as HTMLAudioElement;
        clonedAudio.volume = audio.volume; // Retain original volume
        clonedAudio.loop = loop;
        clonedAudio.play().catch(e => console.error(`Error playing sound ${name}:`, e));
    }
}

function toggleSound(): void {
    isSoundOn = !isSoundOn;
    if (bgmAudio) {
        bgmAudio.volume = isSoundOn ? gameData.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.3 : 0;
        if (isSoundOn && bgmAudio.paused) {
            bgmAudio.play().catch(e => console.error("Error playing BGM:", e));
        }
    }
    // Update all other loaded sounds (or just rely on playSound checking isSoundOn)
    loadedSounds.forEach(audio => {
        if (audio !== bgmAudio) { // Don't touch BGM, it's handled separately
            audio.muted = !isSoundOn;
        }
    });
}

// Event Listeners
function handleKeyDown(event: KeyboardEvent): void {
    keyPressStatus[event.code] = true;

    if (currentGameState === GameState.TITLE) {
        if (event.code === 'Enter') {
            currentGameState = GameState.INSTRUCTIONS;
        }
    } else if (currentGameState === GameState.INSTRUCTIONS) {
        if (event.code === 'Enter') {
            currentGameState = GameState.PLAYING;
            if (bgmAudio && bgmAudio.paused && isSoundOn) {
                bgmAudio.play().catch(e => console.error("Error playing BGM:", e));
            }
            resetGameVariables();
        }
    } else if (currentGameState === GameState.GAME_OVER) {
        if (event.code === 'Enter') {
            currentGameState = GameState.TITLE; // Go back to title or instructions
            resetGameVariables();
        }
    } else if (currentGameState === GameState.PLAYING) {
        if (!currentPiece) return; // No piece to control

        switch (event.code) {
            case 'ArrowLeft':
            case 'ArrowRight':
                // Initial move handled by update loop for continuous movement
                break;
            case 'ArrowDown':
                if (currentPiece.move(0, 1)) {
                    playSound('move');
                    score += 1; // Soft drop points
                }
                fallAccumulator = 0; // Reset fall timer for faster descent
                break;
            case 'ArrowUp':
            case 'KeyX':
                currentPiece.rotate();
                break;
            case 'Space':
                const now = performance.now();
                if (now - lastHardDropTime < hardDropCooldown) return; // Prevent rapid hard drops
                lastHardDropTime = now;

                let linesDropped = 0;
                while (currentPiece.move(0, 1)) {
                    linesDropped++;
                }
                score += linesDropped * 2; // Hard drop points

                mergePieceIntoBoard();
                clearLines();
                if (!spawnNewPiece()) {
                    currentGameState = GameState.GAME_OVER;
                    playSound('game_over');
                    if (bgmAudio) bgmAudio.pause();
                }
                playSound('land'); // Play land sound after hard drop
                fallAccumulator = 0; // Reset fall timer
                break;
        }
        event.preventDefault(); // Prevent default browser actions for arrow keys, space
    }
}

function handleKeyUp(event: KeyboardEvent): void {
    keyPressStatus[event.code] = false;
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        lastHorizontalMoveTime = 0; // Reset for next press
    }
}

function handleMouseDown(event: MouseEvent): void {
    const iconSize = 32;
    const padding = 10;
    const drawX = canvas.width - iconSize - padding;
    const drawY = padding;

    // Check if click is within the sound button bounds
    if (event.offsetX >= drawX && event.offsetX <= drawX + iconSize &&
        event.offsetY >= drawY && event.offsetY <= drawY + iconSize) {
        toggleSound();
    }
}

// Entry point
initGame();
