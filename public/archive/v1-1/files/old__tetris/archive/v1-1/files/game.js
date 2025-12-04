"use strict";
// game.ts
// Constants
const BLOCK_SIZE = 30; // pixels
const BOARD_WIDTH = 10; // blocks
const BOARD_HEIGHT = 20; // blocks
const CANVAS_WIDTH = BOARD_WIDTH * BLOCK_SIZE;
const CANVAS_HEIGHT = BOARD_HEIGHT * BLOCK_SIZE;
const PREVIEW_BOARD_WIDTH = 6;
const PREVIEW_BOARD_HEIGHT = 6;
const INITIAL_FALL_SPEED = 1000; // ms per block fall
const FAST_FALL_SPEED = 50; // ms for fast drop
const LEVEL_UP_LINES = 10;
// ADDED: Constant for the unified background color
const GAME_BACKGROUND_COLOR = '#1A0033'; // A dark purple hex code
// Colors for Tetrominoes and board
const COLORS = [
    'cyan', 'blue', 'orange', 'yellow', 'lime', 'purple', 'red', GAME_BACKGROUND_COLOR // Last one for board background/empty
];
// Tetromino shapes (matrices)
// Each shape is represented by a 4x4 matrix, even if smaller
// Index corresponds to COLORS
const SHAPES = [
    // I (cyan)
    [[0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]],
    // J (blue)
    [[1, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]],
    // L (orange)
    [[0, 0, 1, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]],
    // O (yellow)
    [[0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]],
    // S (lime)
    [[0, 1, 1, 0],
        [1, 1, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]],
    // T (purple)
    [[0, 1, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]],
    // Z (red)
    [[1, 1, 0, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]]
];
class TetrisGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CANVAS_WIDTH + PREVIEW_BOARD_WIDTH * BLOCK_SIZE; // Add space for next piece preview and info
        this.canvas.height = CANVAS_HEIGHT;
        this.board = this.createEmptyBoard();
        this.score = 0;
        this.level = 1;
        this.linesCleared = 0;
        this.gameOver = false;
        this.animationFrameId = 0;
        this.lastFallTime = 0;
        this.fallDelay = INITIAL_FALL_SPEED;
        this.isFastDropping = false;
        // Initialize pieces
        this.nextPiece = this.generateRandomPiece();
        this.spawnNewPiece(); // Assign nextPiece to currentPiece and generate a new nextPiece
        this.attachEventListeners();
        this.gameLoop(0); // Start the game loop
    }
    createEmptyBoard() {
        return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
    }
    generateRandomPiece() {
        const typeId = Math.floor(Math.random() * SHAPES.length);
        const shape = SHAPES[typeId];
        const color = COLORS[typeId];
        // Center the piece horizontally at the top
        const startX = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
        return {
            shape: shape,
            color: color,
            x: startX,
            y: 0,
            typeId: typeId
        };
    }
    spawnNewPiece() {
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.generateRandomPiece();
        // Check for immediate game over (piece spawns already colliding)
        if (!this.isValidMove(this.currentPiece.shape, this.currentPiece.x, this.currentPiece.y)) {
            this.gameOver = true;
            cancelAnimationFrame(this.animationFrameId);
            this.drawGameOver();
        }
    }
    attachEventListeners() {
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this)); // For resetting fast drop
    }
    handleKeyPress(event) {
        if (this.gameOver)
            return;
        switch (event.key) {
            case 'ArrowLeft':
                this.movePiece(-1, 0);
                break;
            case 'ArrowRight':
                this.movePiece(1, 0);
                break;
            case 'ArrowDown':
                if (!this.isFastDropping) { // Only change speed once on press
                    this.isFastDropping = true;
                    this.fallDelay = FAST_FALL_SPEED;
                }
                this.dropPiece(false); // Move down immediately, don't trigger new piece spawn
                break;
            case 'ArrowUp':
                this.rotatePiece();
                break;
            case ' ': // Spacebar for hard drop
                this.hardDrop();
                break;
        }
    }
    handleKeyUp(event) {
        if (this.gameOver)
            return;
        if (event.key === 'ArrowDown') {
            this.isFastDropping = false;
            this.fallDelay = INITIAL_FALL_SPEED / this.level; // Reset to normal fall speed
        }
    }
    movePiece(dx, dy) {
        if (this.isValidMove(this.currentPiece.shape, this.currentPiece.x + dx, this.currentPiece.y + dy)) {
            this.currentPiece.x += dx;
            this.currentPiece.y += dy;
        }
    }
    rotatePiece() {
        const rotatedShape = this.rotateMatrix(this.currentPiece.shape);
        // Simplified wall kick logic: try to shift the piece slightly if a rotation collides
        const kicks = [
            [0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0] // Try original, left, right, down, more left/right
        ];
        for (const [offsetX, offsetY] of kicks) {
            if (this.isValidMove(rotatedShape, this.currentPiece.x + offsetX, this.currentPiece.y + offsetY)) {
                this.currentPiece.shape = rotatedShape;
                this.currentPiece.x += offsetX;
                this.currentPiece.y += offsetY;
                return; // Rotation successful
            }
        }
    }
    rotateMatrix(matrix) {
        // Transpose and reverse rows for 90-degree clockwise rotation
        const N = matrix.length;
        const newMatrix = Array.from({ length: N }, () => Array(N).fill(0));
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                newMatrix[j][N - 1 - i] = matrix[i][j];
            }
        }
        return newMatrix;
    }
    dropPiece(autoDrop = true) {
        if (this.isValidMove(this.currentPiece.shape, this.currentPiece.x, this.currentPiece.y + 1)) {
            this.currentPiece.y++;
            if (!autoDrop) { // Add score for manual soft drop
                this.score += 1;
            }
        }
        else {
            this.lockPiece();
            this.clearLines();
            this.spawnNewPiece();
            // Reset fast drop state and fall delay after locking a piece
            this.isFastDropping = false;
            this.fallDelay = INITIAL_FALL_SPEED / this.level;
            this.lastFallTime = performance.now(); // Reset fall time after locking
        }
    }
    hardDrop() {
        let blocksDropped = 0;
        while (this.isValidMove(this.currentPiece.shape, this.currentPiece.x, this.currentPiece.y + 1)) {
            this.currentPiece.y++;
            blocksDropped++;
        }
        this.score += blocksDropped * 2; // Score for hard drop
        this.lockPiece();
        this.clearLines();
        this.spawnNewPiece();
        // Reset fast drop state and fall delay after locking a piece
        this.isFastDropping = false;
        this.fallDelay = INITIAL_FALL_SPEED / this.level;
        this.lastFallTime = performance.now(); // Reset fall time after locking
    }
    lockPiece() {
        this.currentPiece.shape.forEach((row, dy) => {
            row.forEach((value, dx) => {
                if (value !== 0) {
                    const boardX = this.currentPiece.x + dx;
                    const boardY = this.currentPiece.y + dy;
                    if (boardX >= 0 && boardX < BOARD_WIDTH && boardY >= 0 && boardY < BOARD_HEIGHT) {
                        this.board[boardY][boardX] = this.currentPiece.typeId + 1; // Store typeId + 1 (1-based index)
                    }
                }
            });
        });
    }
    clearLines() {
        let linesRemoved = 0;
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell !== 0)) {
                // Line is full, remove it
                this.board.splice(y, 1);
                // Add a new empty row at the top
                this.board.unshift(Array(BOARD_WIDTH).fill(0));
                linesRemoved++;
                y++; // Recheck the same Y coordinate as rows shifted down
            }
        }
        if (linesRemoved > 0) {
            this.linesCleared += linesRemoved;
            this.updateScore(linesRemoved);
            this.updateLevel();
        }
    }
    updateScore(linesRemoved) {
        const scoreMultiplier = [0, 40, 100, 300, 1200]; // Standard Tetris scoring for 0, 1, 2, 3, 4 lines
        this.score += scoreMultiplier[linesRemoved] * this.level;
    }
    updateLevel() {
        const newLevel = Math.floor(this.linesCleared / LEVEL_UP_LINES) + 1;
        if (newLevel > this.level) {
            this.level = newLevel;
            // Increase fall speed as level increases, but ensure it's not slower than FAST_FALL_SPEED
            this.fallDelay = Math.max(FAST_FALL_SPEED + 10, INITIAL_FALL_SPEED / this.level);
        }
    }
    isValidMove(shape, x, y) {
        for (let dy = 0; dy < shape.length; dy++) {
            for (let dx = 0; dx < shape[dy].length; dx++) {
                if (shape[dy][dx] !== 0) { // If it's a block in the piece
                    const boardX = x + dx;
                    const boardY = y + dy;
                    // Check boundaries
                    if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
                        return false; // Out of horizontal or bottom bounds
                    }
                    // Check collision with existing blocks on the board (ignore if above board top)
                    if (boardY >= 0 && this.board[boardY][boardX] !== 0) {
                        return false; // Collision
                    }
                }
            }
        }
        return true;
    }
    drawBlock(x, y, colorIndex, offsetX = 0, offsetY = 0) {
        this.ctx.fillStyle = COLORS[colorIndex - 1] || 'transparent'; // colorIndex is 1-based from board
        this.ctx.fillRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        this.ctx.strokeStyle = '#333';
        this.ctx.strokeRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    }
    drawBoard() {
        // Main game board background
        this.ctx.fillStyle = COLORS[COLORS.length - 1]; // This will now use GAME_BACKGROUND_COLOR
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (this.board[y][x] !== 0) {
                    this.drawBlock(x, y, this.board[y][x]);
                }
                else {
                    // Draw empty block borders for grid visibility
                    this.ctx.strokeStyle = '#222';
                    this.ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        }
    }
    drawPiece(piece, offsetX = 0, offsetY = 0) {
        piece.shape.forEach((row, dy) => {
            row.forEach((value, dx) => {
                if (value !== 0) {
                    this.drawBlock(piece.x + dx, piece.y + dy, piece.typeId + 1, offsetX, offsetY);
                }
            });
        });
    }
    drawNextPiece() {
        const previewAreaX = CANVAS_WIDTH + BLOCK_SIZE;
        const previewAreaY = BLOCK_SIZE;
        // Draw preview area background
        this.ctx.fillStyle = GAME_BACKGROUND_COLOR; // MODIFIED: Use the unified background color
        this.ctx.fillRect(previewAreaX - BLOCK_SIZE / 2, previewAreaY - BLOCK_SIZE / 2, PREVIEW_BOARD_WIDTH * BLOCK_SIZE, PREVIEW_BOARD_HEIGHT * BLOCK_SIZE);
        this.ctx.strokeStyle = '#AAA';
        this.ctx.strokeRect(previewAreaX - BLOCK_SIZE / 2, previewAreaY - BLOCK_SIZE / 2, PREVIEW_BOARD_WIDTH * BLOCK_SIZE, PREVIEW_BOARD_HEIGHT * BLOCK_SIZE);
        // Draw "NEXT" label
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('NEXT', previewAreaX + (PREVIEW_BOARD_WIDTH * BLOCK_SIZE / 2) - BLOCK_SIZE / 2, previewAreaY - BLOCK_SIZE / 2);
        // Center next piece in preview area
        const pieceWidth = this.nextPiece.shape[0].length;
        const pieceHeight = this.nextPiece.shape.length;
        const centerOffsetX = previewAreaX + (PREVIEW_BOARD_WIDTH * BLOCK_SIZE - pieceWidth * BLOCK_SIZE) / 2;
        const centerOffsetY = previewAreaY + (PREVIEW_BOARD_HEIGHT * BLOCK_SIZE - pieceHeight * BLOCK_SIZE) / 2;
        this.nextPiece.shape.forEach((row, dy) => {
            row.forEach((value, dx) => {
                if (value !== 0) {
                    this.ctx.fillStyle = this.nextPiece.color;
                    this.ctx.fillRect(centerOffsetX + dx * BLOCK_SIZE, centerOffsetY + dy * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                    this.ctx.strokeStyle = '#333';
                    this.ctx.strokeRect(centerOffsetX + dx * BLOCK_SIZE, centerOffsetY + dy * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            });
        });
    }
    drawScore() {
        const infoAreaX = CANVAS_WIDTH + BLOCK_SIZE;
        const infoAreaY = PREVIEW_BOARD_HEIGHT * BLOCK_SIZE + 2 * BLOCK_SIZE; // Below next piece preview
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left'; // Reset text alignment
        this.ctx.fillText(`SCORE: ${this.score}`, infoAreaX, infoAreaY);
        this.ctx.fillText(`LEVEL: ${this.level}`, infoAreaX, infoAreaY + 30);
        this.ctx.fillText(`LINES: ${this.linesCleared}`, infoAreaX, infoAreaY + 60);
    }
    drawGameOver() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'red';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER!', this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press F5 to restart', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }
    gameLoop(timestamp) {
        if (this.gameOver) {
            return;
        }
        // Update logic based on time
        if (!this.lastFallTime) {
            this.lastFallTime = timestamp;
        }
        const deltaTime = timestamp - this.lastFallTime;
        if (deltaTime > this.fallDelay) {
            this.dropPiece(true); // Auto drop
            this.lastFallTime = timestamp;
        }
        // Drawing
        // MODIFIED: Replaced clearRect with fillRect using the new background color
        this.ctx.fillStyle = GAME_BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // Original line commented out
        this.drawBoard();
        this.drawPiece(this.currentPiece);
        this.drawNextPiece();
        this.drawScore();
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }
}
// Ensure the DOM is loaded before initializing the game
document.addEventListener('DOMContentLoaded', () => {
    // Create the canvas element if it doesn't exist
    let gameCanvas = document.getElementById('gameCanvas');
    if (!gameCanvas) {
        gameCanvas = document.createElement('canvas');
        gameCanvas.id = 'gameCanvas';
        document.body.appendChild(gameCanvas);
    }
    try {
        new TetrisGame('gameCanvas');
    }
    catch (e) {
        console.error(e);
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.textContent = 'Error initializing game: ' + (e instanceof Error ? e.message : String(e));
        document.body.appendChild(errorDiv);
    }
});
