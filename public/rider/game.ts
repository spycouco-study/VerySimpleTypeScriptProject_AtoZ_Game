// game.ts에 저장될 TypeScript 코드를 이곳에 넣으세요.

// Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 800;
const CELL_SIZE = 20;

// Game Board
const BOARD_COLS = 10;
const BOARD_ROWS = 20;
const BOARD_WIDTH = BOARD_COLS * CELL_SIZE;
const BOARD_HEIGHT = BOARD_ROWS * CELL_SIZE;
const BOARD_X = (CANVAS_WIDTH - BOARD_WIDTH) / 2; // 300px
const BOARD_Y = (CANVAS_HEIGHT - BOARD_HEIGHT) / 2; // 200px

// UI Elements
const UI_GAP = 20;
const UI_RIGHT_X = BOARD_X + BOARD_WIDTH + UI_GAP;

// Score Board
const SCORE_BOARD_WIDTH = 160;
const SCORE_BOARD_HEIGHT = 60;
const SCORE_Y = BOARD_Y;

// Next Block Preview
const NEXT_PREVIEW_WIDTH = 160;
const NEXT_PREVIEW_HEIGHT = 100;
const NEXT_GRID_SIZE = 4;
const NEXT_GRID_INNER_WIDTH = NEXT_GRID_SIZE * CELL_SIZE; // 80px
const NEXT_GRID_INNER_HEIGHT = NEXT_GRID_SIZE * CELL_SIZE; // 80px
const NEXT_Y = SCORE_Y + SCORE_BOARD_HEIGHT + UI_GAP;

// Colors
const COLOR_WHITE = '#FFFFFF';
const COLOR_BLACK = '#000000';
const COLOR_CYAN = '#00FFFF';
const COLOR_YELLOW = '#FFFF00';
const COLOR_MAGENTA = '#FF00FF';
const COLOR_GREEN = '#00FF00';
const COLOR_RED = '#FF0000';
const COLOR_BLUE = '#0000FF';
const COLOR_ORANGE = '#FFA500';
const COLOR_DARK_GRAY = '#333333';
const COLOR_LIGHT_GRAY_TEXT = '#AAAAAA'; // For button hover
const COLOR_OVERLAY = 'rgba(0, 0, 0, 0.5)'; // 50% transparent black for pause/game over

// Game Speed
const DROP_INTERVAL_MS = 1000; // 1 block per second
const SOFT_DROP_INTERVAL_MS = 50; // Soft drop faster, 20 cells per second

// Font Styles
const FONT_SANS_SERIF = 'sans-serif';
const TITLE_FONT_SIZE = '64px';
const BUTTON_FONT_SIZE = '32px';
const PAUSE_OVER_FONT_SIZE = '48px';
const SCORE_NEXT_FONT_SIZE = '24px';

// Tetromino Types
// 수정: TetrominoType 열거형 멤버에 명시적인 0이 아닌 값을 할당합니다.
// 이전에 TetrominoType.I는 기본값인 0을 가졌고, 이는 보드 그리드의 빈 셀을 나타내는 0과 충돌하여
// I-블록이 보드에 배치된 후에도 렌더링되지 않는 원인이었습니다.
enum TetrominoType {
    I = 1, // I-블록의 값을 1로 시작하도록 명시적으로 설정합니다.
    O,     // 나머지 블록들은 자동으로 2, 3... 순서로 할당됩니다.
    T,
    S,
    Z,
    J,
    L
}

// Block colors map
const BLOCK_COLORS: { [key in TetrominoType]: string } = {
    [TetrominoType.I]: COLOR_CYAN,
    [TetrominoType.O]: COLOR_YELLOW,
    [TetrominoType.T]: COLOR_MAGENTA,
    [TetrominoType.S]: COLOR_GREEN,
    [TetrominoType.Z]: COLOR_RED,
    [TetrominoType.J]: COLOR_BLUE,
    [TetrominoType.L]: COLOR_ORANGE,
};

// Tetromino shapes (0-rotation)
const TETROMINOES: { [key in TetrominoType]: number[][][] } = {
    [TetrominoType.I]: [
        [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // 0 deg
        [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]], // 90 deg
        [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]], // 180 deg
        [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]]  // 270 deg
    ],
    [TetrominoType.O]: [
        [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
    ], // O-block is 2x2, only one rotation state
    [TetrominoType.T]: [
        [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
        [[0, 1, 0], [0, 1, 1], [0, 1, 0]],
        [[0, 0, 0], [1, 1, 1], [0, 1, 0]],
        [[0, 1, 0], [1, 1, 0], [0, 1, 0]]
    ],
    [TetrominoType.S]: [
        [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
        [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
        [[0, 0, 0], [0, 1, 1], [1, 1, 0]],
        [[1, 0, 0], [1, 1, 0], [0, 1, 0]]
    ],
    [TetrominoType.Z]: [
        [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
        [[0, 0, 1], [0, 1, 1], [0, 1, 0]],
        [[0, 0, 0], [1, 1, 0], [0, 1, 1]],
        [[0, 1, 0], [1, 1, 0], [1, 0, 0]]
    ],
    [TetrominoType.J]: [
        [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
        [[0, 1, 1], [0, 1, 0], [0, 1, 0]],
        [[0, 0, 0], [1, 1, 1], [0, 0, 1]],
        [[0, 1, 0], [0, 1, 0], [1, 1, 0]]
    ],
    [TetrominoType.L]: [
        [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
        [[0, 1, 0], [0, 1, 0], [0, 1, 1]],
        [[0, 0, 0], [1, 1, 1], [1, 0, 0]],
        [[1, 1, 0], [0, 1, 0], [0, 1, 0]]
    ],
};

// SRS Wall Kick Data (offsets [dx, dy])
// [rotationDir][currentRotationState][testNum] = [dx, dy]
// rotationDir: 0 for clockwise, 1 for counter-clockwise
// currentRotationState: 0 (0 deg), 1 (90 deg), 2 (180 deg), 3 (270 deg)
const SRS_KICKS_JLSTZ = [
    // Clockwise rotations (0->1, 1->2, 2->3, 3->0)
    [
        [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], // 0->1
        [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],    // 1->2
        [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],    // 2->3
        [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]  // 3->0
    ],
    // Counter-clockwise rotations (0->3, 3->2, 2->1, 1->0)
    [
        [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],    // 0->3
        [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], // 3->2
        [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], // 2->1
        [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]     // 1->0
    ]
];

const SRS_KICKS_I = [
    // Clockwise rotations (0->1, 1->2, 2->3, 3->0)
    [
        [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], // 0->1
        [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]], // 1->2
        [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], // 2->3
        [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]]  // 3->0
    ],
    // Counter-clockwise rotations (0->3, 3->2, 2->1, 1->0)
    [
        [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], // 0->3
        [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], // 3->2
        [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], // 2->1
        [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]  // 1->0
    ]
];

// Game State Enum
enum GameState {
    IDLE,       // Start screen
    PLAYING,
    PAUSED,
    GAME_OVER
}

class Block {
    type: TetrominoType;
    color: string;
    x: number;
    y: number;
    rotation: number; // 0, 1, 2, 3
    shape: number[][]; // Current shape based on rotation

    constructor(type: TetrominoType, x: number, y: number, rotation: number = 0) {
        this.type = type;
        this.color = BLOCK_COLORS[type];
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.shape = this.getShape(rotation);
    }

    // Get the shape for the current rotation
    getShape(rotation: number): number[][] {
        const shapes = TETROMINOES[this.type];
        return shapes[rotation % shapes.length];
    }

    // Draw the block on a context
    draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, cellSize: number, alpha: number = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;

        this.shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell) {
                    const blockX = (this.x + c) * cellSize + offsetX;
                    const blockY = (this.y + r) * cellSize + offsetY;

                    ctx.fillStyle = this.color;
                    ctx.fillRect(blockX, blockY, cellSize, cellSize);

                    ctx.strokeStyle = COLOR_DARK_GRAY; // Block outline
                    ctx.lineWidth = 1;
                    ctx.strokeRect(blockX, blockY, cellSize, cellSize);
                }
            });
        });
        ctx.restore();
    }
}

class Board {
    grid: (TetrominoType | 0)[][]; // 0 for empty, TetrominoType enum value for filled
    constructor() {
        this.grid = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(0));
    }

    // Check if a block can be placed at a given position and rotation
    isValid(block: Block, dx: number, dy: number, newRotation: number): boolean {
        const shape = block.getShape(newRotation);
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    const newX = block.x + c + dx;
                    const newY = block.y + r + dy;

                    // Check boundaries
                    if (newX < 0 || newX >= BOARD_COLS || newY >= BOARD_ROWS) {
                        return false;
                    }
                    // Check collision with existing blocks (ignore blocks above board for initial spawn)
                    if (newY >= 0 && this.grid[newY][newX] !== 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    // Place a block permanently on the board
    placeBlock(block: Block) {
        block.shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell) {
                    const boardX = block.x + c;
                    const boardY = block.y + r;
                    if (boardY >= 0 && boardY < BOARD_ROWS && boardX >= 0 && boardX < BOARD_COLS) {
                        this.grid[boardY][boardX] = block.type;
                    }
                }
            });
        });
    }

    // Clear full lines and return points earned
    clearLines(): number {
        let linesCleared = 0;
        for (let r = BOARD_ROWS - 1; r >= 0; r--) {
            // 수정: 이제 모든 블록 타입(I-블록 포함)이 0이 아닌 값을 가지므로 `cell !== 0` 조건이 올바르게 작동합니다.
            if (this.grid[r].every(cell => cell !== 0)) { 
                linesCleared++;
                // Remove line and add empty line at top
                this.grid.splice(r, 1);
                this.grid.unshift(Array(BOARD_COLS).fill(0));
                r++; // Recheck the same row as it's now a new row
            }
        }

        switch (linesCleared) {
            case 1: return 100;
            case 2: return 300;
            case 3: return 500;
            case 4: return 800; // Tetris!
            default: return 0;
        }
    }

    // Draw the board and its placed blocks
    draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = COLOR_BLACK;
        ctx.fillRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);

        // Draw placed blocks
        this.grid.forEach((row, r) => {
            row.forEach((cell, c) => {
                // 수정: 이제 모든 블록 타입(I-블록 포함)이 0이 아닌 값을 가지므로 `cell !== 0` 조건이 올바르게 작동합니다.
                if (cell !== 0) { 
                    const blockX = BOARD_X + c * CELL_SIZE;
                    const blockY = BOARD_Y + r * CELL_SIZE;

                    ctx.fillStyle = BLOCK_COLORS[cell];
                    ctx.fillRect(blockX, blockY, CELL_SIZE, CELL_SIZE);

                    ctx.strokeStyle = COLOR_DARK_GRAY; // Block outline
                    ctx.lineWidth = 1;
                    ctx.strokeRect(blockX, blockY, CELL_SIZE, CELL_SIZE);
                }
            });
        });
    }
}

class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    board: Board;
    currentBlock: Block | null;
    nextBlock: Block | null;
    ghostBlock: Block | null;
    score: number;
    state: GameState;

    lastDropTime: number;
    dropInterval: number;
    softDropActive: boolean;

    animationFrameId: number | null;

    // UI button states for hover
    startButtonHovered: boolean = false;
    restartButtonHovered: boolean = false;
    private prevStartButtonHovered: boolean = false;
    private prevRestartButtonHovered: boolean = false;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;

        this.board = new Board();
        this.currentBlock = null;
        this.nextBlock = null;
        this.ghostBlock = null;
        this.score = 0;
        this.state = GameState.IDLE;

        this.lastDropTime = 0;
        this.dropInterval = DROP_INTERVAL_MS;
        this.softDropActive = false;

        this.animationFrameId = null;

        this.setupEventListeners();
        this.init();
    }

    init() {
        this.draw(); // Draw initial start screen
    }

    setupEventListeners() {
        document.addEventListener('keydown', this.handleKeydown.bind(this));
        document.addEventListener('keyup', this.handleKeyup.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mousedown', this.handleMousedown.bind(this));
    }

    handleKeydown(event: KeyboardEvent) {
        if (this.state === GameState.PLAYING) {
            switch (event.key) {
                case 'ArrowLeft':
                    this.moveBlock(-1, 0);
                    break;
                case 'ArrowRight':
                    this.moveBlock(1, 0);
                    break;
                case 'ArrowDown':
                    if (!this.softDropActive) {
                        this.softDropActive = true;
                        this.moveBlock(0, 1); // Initial soft drop on key press
                        this.lastDropTime = performance.now(); // Reset timer to drop immediately
                    }
                    break;
                case 'ArrowUp':
                    this.rotateBlock();
                    break;
                case ' ': // Spacebar
                    event.preventDefault(); // Prevent page scrolling
                    this.hardDrop();
                    break;
                case 'p':
                case 'P':
                    this.pauseGame();
                    break;
            }
        } else if ((event.key === 'p' || event.key === 'P') && this.state === GameState.PAUSED) {
            this.resumeGame();
        }
    }

    handleKeyup(event: KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            this.softDropActive = false;
        }
    }

    // Helper for button hit detection
    getButtonRect(buttonText: string, textY: number): { x: number, y: number, width: number, height: number } {
        this.ctx.font = `${BUTTON_FONT_SIZE} ${FONT_SANS_SERIF}`;
        const textMetrics = this.ctx.measureText(buttonText);
        const textWidth = textMetrics.width;
        const textHeight = parseInt(BUTTON_FONT_SIZE); // Approximate height
        const padding = 10;
        const buttonX = CANVAS_WIDTH / 2 - textWidth / 2 - padding;
        const buttonY = textY - textHeight / 2 - padding; // Center y to text baseline
        const buttonWidth = textWidth + padding * 2;
        const buttonHeight = textHeight + padding * 2;
        return { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    }

    handleMouseMove(event: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        let needsRedraw = false;

        if (this.state === GameState.IDLE) {
            const buttonRect = this.getButtonRect('게임 시작', CANVAS_HEIGHT / 2 + 50);
            this.startButtonHovered = (mouseX >= buttonRect.x && mouseX <= buttonRect.x + buttonRect.width &&
                                       mouseY >= buttonRect.y && mouseY <= buttonRect.y + buttonRect.height);
            if (this.startButtonHovered !== this.prevStartButtonHovered) {
                this.prevStartButtonHovered = this.startButtonHovered;
                needsRedraw = true;
            }
        } else if (this.state === GameState.GAME_OVER) {
            const buttonRect = this.getButtonRect('다시 시작', BOARD_Y + BOARD_HEIGHT / 2 + CELL_SIZE * 3);
            this.restartButtonHovered = (mouseX >= buttonRect.x && mouseX <= buttonRect.x + buttonRect.width &&
                                         mouseY >= buttonRect.y && mouseY <= buttonRect.y + buttonRect.height);
            if (this.restartButtonHovered !== this.prevRestartButtonHovered) {
                this.prevRestartButtonHovered = this.restartButtonHovered;
                needsRedraw = true;
            }
        }

        if (needsRedraw) {
            this.draw();
        }
    }

    handleMousedown(event: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        if (this.state === GameState.IDLE) {
            const buttonRect = this.getButtonRect('게임 시작', CANVAS_HEIGHT / 2 + 50);
            if (mouseX >= buttonRect.x && mouseX <= buttonRect.x + buttonRect.width &&
                mouseY >= buttonRect.y && mouseY <= buttonRect.y + buttonRect.height) {
                this.startGame();
            }
        } else if (this.state === GameState.GAME_OVER) {
            const buttonRect = this.getButtonRect('다시 시작', BOARD_Y + BOARD_HEIGHT / 2 + CELL_SIZE * 3);
            if (mouseX >= buttonRect.x && mouseX <= buttonRect.x + buttonRect.width &&
                mouseY >= buttonRect.y && mouseY <= buttonRect.y + buttonRect.height) {
                this.resetGame();
                this.startGame();
            }
        }
    }

    startGame() {
        this.state = GameState.PLAYING;
        this.resetGame(); // Ensure a clean board and score
        this.newBlock();
        this.lastDropTime = performance.now();
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    resetGame() {
        this.board = new Board();
        this.score = 0;
        this.currentBlock = null;
        this.nextBlock = null;
        this.ghostBlock = null;
        this.softDropActive = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    pauseGame() {
        if (this.state === GameState.PLAYING) {
            this.state = GameState.PAUSED;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            this.draw(); // Redraw with pause overlay
        }
    }

    resumeGame() {
        if (this.state === GameState.PAUSED) {
            this.state = GameState.PLAYING;
            this.lastDropTime = performance.now(); // Reset timer to prevent instant drop after resuming
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }
    }

    gameOver() {
        this.state = GameState.GAME_OVER;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.draw(); // Redraw with game over overlay
    }

    // Creates a random block type
    getRandomBlockType(): TetrominoType {
        const types = Object.values(TetrominoType).filter(value => typeof value === 'number') as TetrominoType[];
        return types[Math.floor(Math.random() * types.length)];
    }

    newBlock() {
        if (!this.nextBlock) {
            this.nextBlock = new Block(this.getRandomBlockType(), 0, 0); // Placeholder for first next block
        }

        const initialType = this.nextBlock.type;
        const initialShape = TETROMINOES[initialType][0];
        const spawnX = Math.floor(BOARD_COLS / 2) - Math.floor(initialShape[0].length / 2);

        this.currentBlock = new Block(
            initialType,
            spawnX,
            -2 // Start 2 cells above the visible board
        );
        this.nextBlock = new Block(this.getRandomBlockType(), 0, 0);

        // Check for game over condition immediately after new block spawn
        if (!this.board.isValid(this.currentBlock, 0, 0, this.currentBlock.rotation)) {
            this.gameOver();
        }

        this.calculateGhostBlock();
    }

    moveBlock(dx: number, dy: number) {
        if (!this.currentBlock) return;
        if (this.board.isValid(this.currentBlock, dx, dy, this.currentBlock.rotation)) {
            this.currentBlock.x += dx;
            this.currentBlock.y += dy;
            this.calculateGhostBlock();
        } else if (dy > 0 && !this.softDropActive) { // If it tried to move down and couldn't, it means it hit the bottom or another block
            this.lockBlock();
        } else if (dy > 0 && this.softDropActive) { // If soft dropping and hit, lock
            this.lockBlock();
        }
    }

    rotateBlock() {
        if (!this.currentBlock || this.currentBlock.type === TetrominoType.O) return; // O-block does not rotate in terms of shape change

        const originalRotation = this.currentBlock.rotation;
        const newRotation = (originalRotation + 1) % 4; // Clockwise rotation
        const kickTests = this.currentBlock.type === TetrominoType.I ? SRS_KICKS_I : SRS_KICKS_JLSTZ;

        // Determine which set of kicks to use based on current and new rotation
        // For 0->1, 1->2, 2->3, 3->0 (clockwise)
        const kicks = kickTests[0][originalRotation]; // currentRotationState is the index for clockwise kicks

        for (const [dx, dy] of kicks) {
            if (this.board.isValid(this.currentBlock, dx, dy, newRotation)) {
                this.currentBlock.x += dx;
                this.currentBlock.y += dy;
                this.currentBlock.rotation = newRotation;
                this.currentBlock.shape = this.currentBlock.getShape(newRotation); // Update shape
                this.calculateGhostBlock();
                return; // Rotation successful
            }
        }
        // No successful kick, rotation failed
    }

    hardDrop() {
        if (!this.currentBlock) return;

        // 하드 드롭으로 떨어진 거리 계산 (점수 부여용)
        const startY = this.currentBlock.y;

        // 블록이 다른 블록이나 바닥에 닿을 때까지 아래로 이동
        while (this.board.isValid(this.currentBlock, 0, 1, this.currentBlock.rotation)) {
            this.currentBlock.y++;
        }
        // 하드 드롭 점수: 떨어진 셀당 2점 (많은 테트리스 게임에서 사용하는 방식)
        this.score += 2 * (this.currentBlock.y - startY); 
        this.lockBlock();
    }

    lockBlock() {
        if (!this.currentBlock) return;

        this.board.placeBlock(this.currentBlock);
        this.score += this.board.clearLines();
        this.newBlock();
        this.softDropActive = false; // Reset soft drop state
    }

    calculateGhostBlock() {
        if (!this.currentBlock) {
            this.ghostBlock = null;
            return;
        }

        // Create a temporary block at the current block's position
        const tempBlock = new Block(this.currentBlock.type, this.currentBlock.x, this.currentBlock.y, this.currentBlock.rotation);

        // Move the temporary block down until it collides
        while (this.board.isValid(tempBlock, 0, 1, tempBlock.rotation)) {
            tempBlock.y++;
        }
        this.ghostBlock = tempBlock;
    }

    gameLoop(currentTime: DOMHighResTimeStamp) {
        if (this.state !== GameState.PLAYING) {
            return;
        }

        // Auto drop or soft drop
        const effectiveDropInterval = this.softDropActive ? SOFT_DROP_INTERVAL_MS : DROP_INTERVAL_MS;
        if (currentTime - this.lastDropTime > effectiveDropInterval) {
            this.moveBlock(0, 1);
            this.lastDropTime = currentTime;
        }

        this.draw();
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    draw() {
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        this.ctx.fillStyle = COLOR_WHITE;
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Overall app background

        if (this.state === GameState.IDLE) {
            this.drawStartScreen();
        } else { // PLAYING, PAUSED, GAME_OVER
            // Draw game board
            this.board.draw(this.ctx);

            // Draw ghost block
            if (this.ghostBlock && this.currentBlock) {
                // Ghost block should be drawn before current block
                this.ghostBlock.draw(this.ctx, BOARD_X, BOARD_Y, CELL_SIZE, 0.3);
            }

            // Draw current block
            if (this.currentBlock) {
                this.currentBlock.draw(this.ctx, BOARD_X, BOARD_Y, CELL_SIZE);
            }

            // Draw score and next block
            this.drawScoreAndNext();

            if (this.state === GameState.PAUSED) {
                this.drawPauseScreen();
            } else if (this.state === GameState.GAME_OVER) {
                this.drawGameOverScreen();
            }
        }
    }

    drawStartScreen() {
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        this.ctx.fillStyle = COLOR_WHITE;
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Game Title
        this.ctx.font = `${TITLE_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = COLOR_BLACK; // Changed to black for visibility on white background

        this.ctx.fillText('테트리스', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);

        // Start Game Button
        this.ctx.font = `${BUTTON_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.fillStyle = this.startButtonHovered ? COLOR_LIGHT_GRAY_TEXT : COLOR_BLACK; // Changed to black for visibility
        this.ctx.fillText('게임 시작', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
    }

    drawScoreAndNext() {
        // Score Board
        this.ctx.fillStyle = COLOR_BLACK;
        this.ctx.fillRect(UI_RIGHT_X, SCORE_Y, SCORE_BOARD_WIDTH, SCORE_BOARD_HEIGHT);
        this.ctx.strokeStyle = COLOR_WHITE;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(UI_RIGHT_X, SCORE_Y, SCORE_BOARD_WIDTH, SCORE_BOARD_HEIGHT);

        this.ctx.font = `${SCORE_NEXT_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillStyle = COLOR_WHITE;
        this.ctx.fillText('SCORE:', UI_RIGHT_X + 10, SCORE_Y + 10);
        this.ctx.fillText(`${this.score}`, UI_RIGHT_X + 10, SCORE_Y + 35);

        // Next Block Preview
        this.ctx.fillStyle = COLOR_BLACK;
        this.ctx.fillRect(UI_RIGHT_X, NEXT_Y, NEXT_PREVIEW_WIDTH, NEXT_PREVIEW_HEIGHT);
        this.ctx.strokeStyle = COLOR_WHITE;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(UI_RIGHT_X, NEXT_Y, NEXT_PREVIEW_WIDTH, NEXT_PREVIEW_HEIGHT);

        this.ctx.font = `${SCORE_NEXT_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillStyle = COLOR_WHITE;
        this.ctx.fillText('NEXT:', UI_RIGHT_X + 10, NEXT_Y + 10);

        if (this.nextBlock) {
            // Calculate center position for 4x4 grid (80x80px) within 160x100 preview area
            // Offset for the 'NEXT:' label and 4x4 grid.
            const nextGridBaseY = NEXT_Y + NEXT_PREVIEW_HEIGHT - NEXT_GRID_INNER_HEIGHT - 5; // Align bottom of 4x4 grid with bottom of preview box.
            
            // To center the actual block within the 4x4 grid, adjust its (x,y)
            const blockShapeWidth = this.nextBlock.shape[0].length;
            const blockShapeHeight = this.nextBlock.shape.length;

            const drawOffsetX = UI_RIGHT_X + (NEXT_PREVIEW_WIDTH - blockShapeWidth * CELL_SIZE) / 2;
            const drawOffsetY = nextGridBaseY + (NEXT_GRID_INNER_HEIGHT - blockShapeHeight * CELL_SIZE) / 2;

            this.nextBlock.draw(this.ctx, drawOffsetX - this.nextBlock.x * CELL_SIZE, drawOffsetY - this.nextBlock.y * CELL_SIZE, CELL_SIZE);
        }
    }

    drawPauseScreen() {
        // Overlay entire game screen
        this.ctx.fillStyle = COLOR_OVERLAY;
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 'PAUSED' text on game board center
        this.ctx.font = `${PAUSE_OVER_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = COLOR_WHITE;
        this.ctx.fillText('PAUSED', BOARD_X + BOARD_WIDTH / 2, BOARD_Y + BOARD_HEIGHT / 2);
    }

    drawGameOverScreen() {
        // Overlay entire game screen (similar to pause)
        this.ctx.fillStyle = COLOR_OVERLAY;
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 'GAME OVER' text
        this.ctx.font = `${PAUSE_OVER_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = COLOR_WHITE;
        this.ctx.fillText('GAME OVER', BOARD_X + BOARD_WIDTH / 2, BOARD_Y + BOARD_HEIGHT / 2 - CELL_SIZE * 2);

        // Final Score
        this.ctx.font = `${BUTTON_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.fillText(`SCORE: ${this.score}`, BOARD_X + BOARD_WIDTH / 2, BOARD_Y + BOARD_HEIGHT / 2 + CELL_SIZE);

        // Restart Button
        this.ctx.font = `${BUTTON_FONT_SIZE} ${FONT_SANS_SERIF}`;
        this.ctx.fillStyle = this.restartButtonHovered ? COLOR_LIGHT_GRAY_TEXT : COLOR_WHITE;
        this.ctx.fillText('다시 시작', BOARD_X + BOARD_WIDTH / 2, BOARD_Y + BOARD_HEIGHT / 2 + CELL_SIZE * 3);
    }
}

// Initialize the game
const game = new Game('gameCanvas');