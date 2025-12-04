// Enums for game states and input keys
enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    SOLVED
}

enum InputKey {
    ARROW_LEFT = "ArrowLeft",
    ARROW_RIGHT = "ArrowRight",
    ARROW_UP = "ArrowUp",
    ARROW_DOWN = "ArrowDown",
    SPACE = " ",
    ENTER = "Enter",
    KEY_1 = "1", KEY_2 = "2", KEY_3 = "3", KEY_4 = "4", KEY_5 = "5",
    KEY_6 = "6", KEY_7 = "7", KEY_8 = "8", KEY_9 = "9",
    BACKSPACE = "Backspace",
    DELETE = "Delete" // For clearing a cell
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
    instructionTitle: string;
    instructionLines: string[]; // Added for instructions screen
    instructionStartGame: string; // Added for instructions screen
    solvedText: string; // Renamed from gameOverText to solvedText
    restartInstruction: string;
    titleTextColor: string;
    backgroundColor: string;
    fontFamily: string; // For general UI text
}

interface SudokuSettings {
    boardSize: number; // e.g., 9 for 9x9 Sudoku
    cellSize: number;
    boardPadding: number; // Not currently used in drawing, but kept for future expansion
    gridLineColor: string;
    majorGridLineColor: string;
    selectedCellColor: string;
    highlightColor: string; // For selected row/col/block
    fixedNumberColor: string;
    playerNumberColor: string;
    errorNumberColor: string; // Optional: for incorrect numbers, not currently implemented for real-time validation
    numberFontFamily: string;
    numberFontSize: number;
    difficultyLevels: { [key: string]: number }; // e.g., { "easy": 40, "medium": 50, "hard": 60 } (cells to remove)
}

interface GameConfig {
    gameSettings: GameSettings;
    sudokuSettings: SudokuSettings;
    assets: AssetsConfig;
}

// Global game variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameConfig: GameConfig;
let loadedImages: Map<string, HTMLImageElement> = new Map(); // Images are not used in Sudoku but framework is kept
let loadedSounds: Map<string, HTMLAudioElement> = new Map();
let inputState: Set<InputKey> = new Set();
let currentState: GameState = GameState.TITLE;
let lastFrameTime: number = 0;

let sudokuBoard: number[][] = []; // Current state of the board
let initialBoard: number[][] = []; // Fixed numbers from the puzzle
let selectedRow: number = -1;
let selectedCol: number = -1;
let currentDifficulty: string = "easy"; // Default difficulty, can be made selectable later

let backgroundMusic: HTMLAudioElement | undefined;
let startSound: HTMLAudioElement | undefined;
let cellSelectSound: HTMLAudioElement | undefined;
let placeNumberSound: HTMLAudioElement | undefined;
let clearNumberSound: HTMLAudioElement | undefined;
let winSound: HTMLAudioElement | undefined;

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

    // Load images (none currently used for Sudoku board, but framework exists)
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
            audio.load();
        });
        soundPromises.push(promise);
    }

    await Promise.all([...imagePromises, ...soundPromises]);
}

// --- Sudoku Logic ---
function createEmptyBoard(): number[][] {
    return Array(gameConfig.sudokuSettings.boardSize).fill(0).map(() => Array(gameConfig.sudokuSettings.boardSize).fill(0));
}

function isValid(board: number[][], row: number, col: number, num: number): boolean {
    const N = gameConfig.sudokuSettings.boardSize;

    // Check row
    for (let x = 0; x < N; x++) {
        if (board[row][x] === num) return false;
    }

    // Check column
    for (let x = 0; x < N; x++) {
        if (board[x][col] === num) return false;
    }

    // Check 3x3 box
    const blockSize = Math.sqrt(N);
    const startRow = row - (row % blockSize);
    const startCol = col - (col % blockSize);
    for (let i = 0; i < blockSize; i++) {
        for (let j = 0; j < blockSize; j++) {
            if (board[i + startRow][j + startCol] === num) return false;
        }
    }

    return true;
}

// Fills a 3x3 block with random valid numbers
function fillBlock(board: number[][], row: number, col: number): void {
    const N = gameConfig.sudokuSettings.boardSize;
    const blockSize = Math.sqrt(N);
    let numbers = Array.from({ length: N }, (_, i) => i + 1); // [1, 2, ..., N]
    
    // Simple shuffle (Fisher-Yates)
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }

    let numIdx = 0;
    for (let i = 0; i < blockSize; i++) {
        for (let j = 0; j < blockSize; j++) {
            board[row + i][col + j] = numbers[numIdx++];
        }
    }
}

// Fills the diagonal 3x3 blocks to simplify the backtracking
function fillDiagonalBlocks(board: number[][]): void {
    const N = gameConfig.sudokuSettings.boardSize;
    const blockSize = Math.sqrt(N); // Should be 3 for 9x9
    for (let i = 0; i < N; i += blockSize) {
        fillBlock(board, i, i);
    }
}


function solveSudoku(board: number[][]): boolean {
    const N = gameConfig.sudokuSettings.boardSize;
    for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
            if (board[row][col] === 0) {
                // To randomize puzzle generation, shuffle numbers 1-N
                let numbersToTry = Array.from({ length: N }, (_, i) => i + 1);
                for (let i = numbersToTry.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [numbersToTry[i], numbersToTry[j]] = [numbersToTry[j], numbersToTry[i]];
                }

                for (const num of numbersToTry) {
                    if (isValid(board, row, col, num)) {
                        board[row][col] = num;
                        if (solveSudoku(board)) {
                            return true;
                        } else {
                            board[row][col] = 0; // Backtrack
                        }
                    }
                }
                return false; // No number fits
            }
        }
    }
    return true; // Board is solved
}

function generateSudokuBoard(): { initial: number[][], current: number[][] } {
    const N = gameConfig.sudokuSettings.boardSize;
    const newBoard: number[][] = createEmptyBoard();

    // Step 1: Fill diagonal 3x3 blocks
    fillDiagonalBlocks(newBoard);

    // Step 2: Solve the rest of the board using backtracking
    solveSudoku(newBoard);

    const puzzleBoard: number[][] = newBoard.map(row => [...row]); // This will be the initial puzzle

    // Step 3: Remove numbers to create the puzzle
    const cellsToRemove = gameConfig.sudokuSettings.difficultyLevels[currentDifficulty] || 40; // Default to 40 if not found
    let count = cellsToRemove;
    let attempts = 0; // Prevent infinite loops in case removing 'count' cells is hard

    while (count > 0 && attempts < N * N * 2) { // Add attempts limit
        let row = Math.floor(Math.random() * N);
        let col = Math.floor(Math.random() * N);

        if (puzzleBoard[row][col] !== 0) {
            // For simplicity, we just remove the number. A more robust generator
            // would check for unique solvability after each removal.
            puzzleBoard[row][col] = 0; 
            count--;
        }
        attempts++;
    }

    return { initial: puzzleBoard, current: puzzleBoard.map(row => [...row]) };
}

function isBoardComplete(board: number[][]): boolean {
    const N = gameConfig.sudokuSettings.boardSize;
    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            if (board[r][c] === 0) {
                return false;
            }
        }
    }
    return true;
}

function checkWinCondition(): boolean {
    const N = gameConfig.sudokuSettings.boardSize;
    if (!isBoardComplete(sudokuBoard)) {
        return false;
    }

    // Check all cells for validity
    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            const num = sudokuBoard[r][c];
            if (num === 0) return false; // Should not happen if isBoardComplete is true

            // Temporarily remove number to check its validity against others
            const originalValue = sudokuBoard[r][c];
            sudokuBoard[r][c] = 0;
            const valid = isValid(sudokuBoard, r, c, originalValue);
            sudokuBoard[r][c] = originalValue; // Put it back

            if (!valid) return false;
        }
    }

    return true; // All checks passed
}


// Resets game elements to their initial state for a new game
function resetGame(): void {
    const { initial, current } = generateSudokuBoard();
    initialBoard = initial;
    sudokuBoard = current;
    selectedRow = 0;
    selectedCol = 0;
}

// Game loop functions
function update(deltaTime: number): void {
    switch (currentState) {
        case GameState.TITLE:
            if (inputState.has(InputKey.SPACE)) {
                currentState = GameState.INSTRUCTIONS;
                inputState.delete(InputKey.SPACE); // Consume the input
            }
            break;
        case GameState.INSTRUCTIONS:
            if (inputState.has(InputKey.ENTER)) {
                currentState = GameState.PLAYING;
                inputState.delete(InputKey.ENTER); // Consume the input

                resetGame(); // Reset game state for a fresh start

                // Play BGM when game starts
                if (backgroundMusic) {
                    backgroundMusic.loop = true;
                    backgroundMusic.currentTime = 0; // Rewind BGM
                    backgroundMusic.play().catch(e => console.error("Background music playback failed:", e));
                }
                if (startSound) {
                    startSound.currentTime = 0; // Rewind to start
                    startSound.play().catch(e => console.error("Start sound playback failed:", e));
                }
            }
            break;
        case GameState.PLAYING:
            const N = gameConfig.sudokuSettings.boardSize;
            let movedSelection = false;
            if (inputState.has(InputKey.ARROW_LEFT)) {
                selectedCol = Math.max(0, selectedCol - 1);
                inputState.delete(InputKey.ARROW_LEFT);
                movedSelection = true;
            }
            if (inputState.has(InputKey.ARROW_RIGHT)) {
                selectedCol = Math.min(N - 1, selectedCol + 1);
                inputState.delete(InputKey.ARROW_RIGHT);
                movedSelection = true;
            }
            if (inputState.has(InputKey.ARROW_UP)) {
                selectedRow = Math.max(0, selectedRow - 1);
                inputState.delete(InputKey.ARROW_UP);
                movedSelection = true;
            }
            if (inputState.has(InputKey.ARROW_DOWN)) {
                selectedRow = Math.min(N - 1, selectedRow + 1);
                inputState.delete(InputKey.ARROW_DOWN);
                movedSelection = true;
            }

            if (movedSelection && cellSelectSound) {
                const clonedSound = cellSelectSound.cloneNode() as HTMLAudioElement;
                clonedSound.volume = cellSelectSound.volume;
                clonedSound.currentTime = 0;
                clonedSound.play().catch(e => console.error("Cell select sound playback failed:", e));
            }

            // Number input (1-9)
            for (let i = 1; i <= 9; i++) {
                const key = i.toString() as InputKey;
                if (inputState.has(key)) {
                    if (selectedRow !== -1 && selectedCol !== -1 && initialBoard[selectedRow][selectedCol] === 0) { // Only if not a fixed number
                        sudokuBoard[selectedRow][selectedCol] = i;
                        if (placeNumberSound) {
                            const clonedSound = placeNumberSound.cloneNode() as HTMLAudioElement;
                            clonedSound.volume = placeNumberSound.volume;
                            clonedSound.currentTime = 0;
                            clonedSound.play().catch(e => console.error("Place number sound playback failed:", e));
                        }
                        if (checkWinCondition()) {
                            currentState = GameState.SOLVED;
                            if (backgroundMusic) backgroundMusic.pause();
                            if (winSound) {
                                const clonedSound = winSound.cloneNode() as HTMLAudioElement;
                                clonedSound.volume = winSound.volume;
                                clonedSound.currentTime = 0;
                                clonedSound.play().catch(e => console.error("Win sound playback failed:", e));
                            }
                        }
                    }
                    inputState.delete(key);
                    break; // Only process one number at a time
                }
            }

            // Clear input
            if (inputState.has(InputKey.BACKSPACE) || inputState.has(InputKey.DELETE)) {
                if (selectedRow !== -1 && selectedCol !== -1 && initialBoard[selectedRow][selectedCol] === 0) {
                    sudokuBoard[selectedRow][selectedCol] = 0;
                    if (clearNumberSound) {
                        const clonedSound = clearNumberSound.cloneNode() as HTMLAudioElement;
                        clonedSound.volume = clearNumberSound.volume;
                        clonedSound.currentTime = 0;
                        clonedSound.play().catch(e => console.error("Clear number sound playback failed:", e));
                    }
                }
                inputState.delete(InputKey.BACKSPACE);
                inputState.delete(InputKey.DELETE);
            }
            break;
        case GameState.SOLVED:
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
    ctx.textBaseline = 'middle'; // Center text vertically

    switch (currentState) {
        case GameState.TITLE:
            ctx.fillText(gameConfig.gameSettings.titleText, canvas.width / 2, canvas.height / 2 - 50);
            ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`;
            ctx.fillText(gameConfig.gameSettings.startInstruction, canvas.width / 2, canvas.height / 2 + 20);
            break;
        case GameState.INSTRUCTIONS:
            ctx.fillText(gameConfig.gameSettings.instructionTitle, canvas.width / 2, canvas.height / 2 - 150);
            ctx.font = `20px ${gameConfig.gameSettings.fontFamily}`;
            gameConfig.gameSettings.instructionLines.forEach((line, index) => {
                ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 90 + (index * 30));
            });
            ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`;
            ctx.fillText(gameConfig.gameSettings.instructionStartGame, canvas.width / 2, canvas.height - 80);
            break;
        case GameState.PLAYING:
            drawSudokuBoard();
            break;
        case GameState.SOLVED:
            ctx.fillText(gameConfig.gameSettings.solvedText, canvas.width / 2, canvas.height / 2);
            ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`;
            ctx.fillText(gameConfig.gameSettings.restartInstruction, canvas.width / 2, canvas.height / 2 + 50);
            break;
    }
}

function drawSudokuBoard(): void {
    const s = gameConfig.sudokuSettings;
    const N = s.boardSize;
    const cellSize = s.cellSize;
    const boardWidth = N * cellSize;
    const boardHeight = N * cellSize;
    // Center the board on the canvas
    const boardX = (canvas.width - boardWidth) / 2;
    const boardY = (canvas.height - boardHeight) / 2;

    // Draw background for selected cell's row, column, and block
    if (selectedRow !== -1 && selectedCol !== -1) {
        ctx.fillStyle = s.highlightColor;
        // Highlight row
        ctx.fillRect(boardX, boardY + selectedRow * cellSize, boardWidth, cellSize);
        // Highlight column
        ctx.fillRect(boardX + selectedCol * cellSize, boardY, cellSize, boardHeight);
        // Highlight 3x3 block
        const blockSize = Math.sqrt(N);
        const blockStartRow = Math.floor(selectedRow / blockSize) * blockSize;
        const blockStartCol = Math.floor(selectedCol / blockSize) * blockSize;
        ctx.fillRect(
            boardX + blockStartCol * cellSize,
            boardY + blockStartRow * cellSize,
            blockSize * cellSize,
            blockSize * cellSize
        );
    }

    // Draw selected cell background
    if (selectedRow !== -1 && selectedCol !== -1) {
        ctx.fillStyle = s.selectedCellColor;
        ctx.fillRect(boardX + selectedCol * cellSize, boardY + selectedRow * cellSize, cellSize, cellSize);
    }

    // Draw numbers
    ctx.font = `${s.numberFontSize}px ${s.numberFontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            const num = sudokuBoard[r][c];
            if (num !== 0) {
                const x = boardX + c * cellSize + cellSize / 2;
                const y = boardY + r * cellSize + cellSize / 2;

                if (initialBoard[r][c] !== 0) {
                    ctx.fillStyle = s.fixedNumberColor; // Fixed numbers
                } else {
                    ctx.fillStyle = s.playerNumberColor; // Player entered numbers
                }
                ctx.fillText(num.toString(), x, y);
            }
        }
    }

    // Draw grid lines
    ctx.strokeStyle = s.gridLineColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(boardX, boardY + i * cellSize);
        ctx.lineTo(boardX + boardWidth, boardY + i * cellSize);
        ctx.stroke();

        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(boardX + i * cellSize, boardY);
        ctx.lineTo(boardX + i * cellSize, boardY + boardHeight);
        ctx.stroke();
    }

    // Draw major grid lines (3x3 blocks)
    ctx.strokeStyle = s.majorGridLineColor;
    ctx.lineWidth = 3;
    const blockSize = Math.sqrt(N); // Should be 3 for 9x9
    for (let i = 0; i <= N; i += blockSize) {
        // Horizontal major lines
        ctx.beginPath();
        ctx.moveTo(boardX, boardY + i * cellSize);
        ctx.lineTo(boardX + boardWidth, boardY + i * cellSize);
        ctx.stroke();

        // Vertical major lines
        ctx.beginPath();
        ctx.moveTo(boardX + i * cellSize, boardY);
        ctx.lineTo(boardX + i * cellSize, boardY + boardHeight);
        ctx.stroke();
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

        backgroundMusic = loadedSounds.get("bgm");
        startSound = loadedSounds.get("start_sound");
        cellSelectSound = loadedSounds.get("cell_select_sound");
        placeNumberSound = loadedSounds.get("place_number_sound");
        clearNumberSound = loadedSounds.get("clear_number_sound");
        winSound = loadedSounds.get("win_sound");

        // Set initial selected cell
        selectedRow = 0;
        selectedCol = 0;

        // Input listeners
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            const key = e.key;
            // Map number keys to InputKey enum
            if (key >= '1' && key <= '9') {
                inputState.add(key as InputKey);
            } else if (key === 'Backspace') {
                inputState.add(InputKey.BACKSPACE);
            } else if (key === 'Delete') {
                inputState.add(InputKey.DELETE);
            } else {
                const inputKey = key as InputKey;
                // Only add keys that are explicitly defined in InputKey enum
                if (Object.values(InputKey).includes(inputKey)) {
                    inputState.add(inputKey);
                }
            }
            // Prevent default browser actions for common game keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Backspace', 'Delete'].includes(key)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e: KeyboardEvent) => {
            const key = e.key;
            if (key >= '1' && key <= '9') {
                inputState.delete(key as InputKey);
            } else if (key === 'Backspace') {
                inputState.delete(InputKey.BACKSPACE);
            } else if (key === 'Delete') {
                inputState.delete(InputKey.DELETE);
            } else {
                const inputKey = key as InputKey;
                if (Object.values(InputKey).includes(inputKey)) {
                    inputState.delete(inputKey);
                }
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
