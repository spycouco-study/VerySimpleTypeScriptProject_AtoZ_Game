const BLOCK_SIZE = 30;
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const CANVAS_WIDTH = BOARD_WIDTH * BLOCK_SIZE;
const CANVAS_HEIGHT = BOARD_HEIGHT * BLOCK_SIZE;
const PREVIEW_BOARD_WIDTH = 6;
const PREVIEW_BOARD_HEIGHT = 6;
const INITIAL_FALL_SPEED = 1e3;
const FAST_FALL_SPEED = 50;
const LEVEL_UP_LINES = 10;
const GAME_BACKGROUND_COLOR = "#1A0033";
const COLORS = [
  "cyan",
  "blue",
  "orange",
  "yellow",
  "lime",
  "purple",
  "red",
  GAME_BACKGROUND_COLOR
  // Last one for board background/empty
];
const SHAPES = [
  // I (cyan)
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // J (blue)
  [
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // L (orange)
  [
    [0, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // O (yellow)
  [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // S (lime)
  [
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // T (purple)
  [
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // Z (red)
  [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]
];
class TetrisGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = CANVAS_WIDTH + PREVIEW_BOARD_WIDTH * BLOCK_SIZE;
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
    this.nextPiece = this.generateRandomPiece();
    this.spawnNewPiece();
    this.attachEventListeners();
    this.gameLoop(0);
  }
  createEmptyBoard() {
    return Array.from(
      { length: BOARD_HEIGHT },
      () => Array(BOARD_WIDTH).fill(0)
    );
  }
  generateRandomPiece() {
    const typeId = Math.floor(Math.random() * SHAPES.length);
    const shape = SHAPES[typeId];
    const color = COLORS[typeId];
    const startX = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
    return {
      shape,
      color,
      x: startX,
      y: 0,
      typeId
    };
  }
  spawnNewPiece() {
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.generateRandomPiece();
    if (!this.isValidMove(this.currentPiece.shape, this.currentPiece.x, this.currentPiece.y)) {
      this.gameOver = true;
      cancelAnimationFrame(this.animationFrameId);
      this.drawGameOver();
    }
  }
  attachEventListeners() {
    document.addEventListener("keydown", this.handleKeyPress.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));
  }
  handleKeyPress(event) {
    if (this.gameOver) return;
    switch (event.key) {
      case "ArrowLeft":
        this.movePiece(-1, 0);
        break;
      case "ArrowRight":
        this.movePiece(1, 0);
        break;
      case "ArrowDown":
        if (!this.isFastDropping) {
          this.isFastDropping = true;
          this.fallDelay = FAST_FALL_SPEED;
        }
        this.dropPiece(false);
        break;
      case "ArrowUp":
        this.rotatePiece();
        break;
      case " ":
        this.hardDrop();
        break;
    }
  }
  handleKeyUp(event) {
    if (this.gameOver) return;
    if (event.key === "ArrowDown") {
      this.isFastDropping = false;
      this.fallDelay = INITIAL_FALL_SPEED / this.level;
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
    const kicks = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [-2, 0],
      [2, 0]
      // Try original, left, right, down, more left/right
    ];
    for (const [offsetX, offsetY] of kicks) {
      if (this.isValidMove(rotatedShape, this.currentPiece.x + offsetX, this.currentPiece.y + offsetY)) {
        this.currentPiece.shape = rotatedShape;
        this.currentPiece.x += offsetX;
        this.currentPiece.y += offsetY;
        return;
      }
    }
  }
  rotateMatrix(matrix) {
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
      if (!autoDrop) {
        this.score += 1;
      }
    } else {
      this.lockPiece();
      this.clearLines();
      this.spawnNewPiece();
      this.isFastDropping = false;
      this.fallDelay = INITIAL_FALL_SPEED / this.level;
      this.lastFallTime = performance.now();
    }
  }
  hardDrop() {
    let blocksDropped = 0;
    while (this.isValidMove(this.currentPiece.shape, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y++;
      blocksDropped++;
    }
    this.score += blocksDropped * 2;
    this.lockPiece();
    this.clearLines();
    this.spawnNewPiece();
    this.isFastDropping = false;
    this.fallDelay = INITIAL_FALL_SPEED / this.level;
    this.lastFallTime = performance.now();
  }
  lockPiece() {
    this.currentPiece.shape.forEach((row, dy) => {
      row.forEach((value, dx) => {
        if (value !== 0) {
          const boardX = this.currentPiece.x + dx;
          const boardY = this.currentPiece.y + dy;
          if (boardX >= 0 && boardX < BOARD_WIDTH && boardY >= 0 && boardY < BOARD_HEIGHT) {
            this.board[boardY][boardX] = this.currentPiece.typeId + 1;
          }
        }
      });
    });
  }
  clearLines() {
    let linesRemoved = 0;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (this.board[y].every((cell) => cell !== 0)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(BOARD_WIDTH).fill(0));
        linesRemoved++;
        y++;
      }
    }
    if (linesRemoved > 0) {
      this.linesCleared += linesRemoved;
      this.updateScore(linesRemoved);
      this.updateLevel();
    }
  }
  updateScore(linesRemoved) {
    const scoreMultiplier = [0, 40, 100, 300, 1200];
    this.score += scoreMultiplier[linesRemoved] * this.level;
  }
  updateLevel() {
    const newLevel = Math.floor(this.linesCleared / LEVEL_UP_LINES) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      this.fallDelay = Math.max(FAST_FALL_SPEED + 10, INITIAL_FALL_SPEED / this.level);
    }
  }
  isValidMove(shape, x, y) {
    for (let dy = 0; dy < shape.length; dy++) {
      for (let dx = 0; dx < shape[dy].length; dx++) {
        if (shape[dy][dx] !== 0) {
          const boardX = x + dx;
          const boardY = y + dy;
          if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
            return false;
          }
          if (boardY >= 0 && this.board[boardY][boardX] !== 0) {
            return false;
          }
        }
      }
    }
    return true;
  }
  drawBlock(x, y, colorIndex, offsetX = 0, offsetY = 0) {
    this.ctx.fillStyle = COLORS[colorIndex - 1] || "transparent";
    this.ctx.fillRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    this.ctx.strokeStyle = "#333";
    this.ctx.strokeRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  }
  drawBoard() {
    this.ctx.fillStyle = COLORS[COLORS.length - 1];
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (this.board[y][x] !== 0) {
          this.drawBlock(x, y, this.board[y][x]);
        } else {
          this.ctx.strokeStyle = "#222";
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
    this.ctx.fillStyle = GAME_BACKGROUND_COLOR;
    this.ctx.fillRect(previewAreaX - BLOCK_SIZE / 2, previewAreaY - BLOCK_SIZE / 2, PREVIEW_BOARD_WIDTH * BLOCK_SIZE, PREVIEW_BOARD_HEIGHT * BLOCK_SIZE);
    this.ctx.strokeStyle = "#AAA";
    this.ctx.strokeRect(previewAreaX - BLOCK_SIZE / 2, previewAreaY - BLOCK_SIZE / 2, PREVIEW_BOARD_WIDTH * BLOCK_SIZE, PREVIEW_BOARD_HEIGHT * BLOCK_SIZE);
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("NEXT", previewAreaX + PREVIEW_BOARD_WIDTH * BLOCK_SIZE / 2 - BLOCK_SIZE / 2, previewAreaY - BLOCK_SIZE / 2);
    const pieceWidth = this.nextPiece.shape[0].length;
    const pieceHeight = this.nextPiece.shape.length;
    const centerOffsetX = previewAreaX + (PREVIEW_BOARD_WIDTH * BLOCK_SIZE - pieceWidth * BLOCK_SIZE) / 2;
    const centerOffsetY = previewAreaY + (PREVIEW_BOARD_HEIGHT * BLOCK_SIZE - pieceHeight * BLOCK_SIZE) / 2;
    this.nextPiece.shape.forEach((row, dy) => {
      row.forEach((value, dx) => {
        if (value !== 0) {
          this.ctx.fillStyle = this.nextPiece.color;
          this.ctx.fillRect(centerOffsetX + dx * BLOCK_SIZE, centerOffsetY + dy * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          this.ctx.strokeStyle = "#333";
          this.ctx.strokeRect(centerOffsetX + dx * BLOCK_SIZE, centerOffsetY + dy * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        }
      });
    });
  }
  drawScore() {
    const infoAreaX = CANVAS_WIDTH + BLOCK_SIZE;
    const infoAreaY = PREVIEW_BOARD_HEIGHT * BLOCK_SIZE + 2 * BLOCK_SIZE;
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`SCORE: ${this.score}`, infoAreaX, infoAreaY);
    this.ctx.fillText(`LEVEL: ${this.level}`, infoAreaX, infoAreaY + 30);
    this.ctx.fillText(`LINES: ${this.linesCleared}`, infoAreaX, infoAreaY + 60);
  }
  drawGameOver() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "red";
    this.ctx.font = "48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("GAME OVER!", this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.fillText("Press F5 to restart", this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  gameLoop(timestamp) {
    if (this.gameOver) {
      return;
    }
    if (!this.lastFallTime) {
      this.lastFallTime = timestamp;
    }
    const deltaTime = timestamp - this.lastFallTime;
    if (deltaTime > this.fallDelay) {
      this.dropPiece(true);
      this.lastFallTime = timestamp;
    }
    this.ctx.fillStyle = GAME_BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBoard();
    this.drawPiece(this.currentPiece);
    this.drawNextPiece();
    this.drawScore();
    this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
  }
}
document.addEventListener("DOMContentLoaded", () => {
  let gameCanvas = document.getElementById("gameCanvas");
  if (!gameCanvas) {
    gameCanvas = document.createElement("canvas");
    gameCanvas.id = "gameCanvas";
    document.body.appendChild(gameCanvas);
  }
  try {
    new TetrisGame("gameCanvas");
  } catch (e) {
    console.error(e);
    const errorDiv = document.createElement("div");
    errorDiv.style.color = "red";
    errorDiv.textContent = "Error initializing game: " + (e instanceof Error ? e.message : String(e));
    document.body.appendChild(errorDiv);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xyXG5cclxuLy8gQ29uc3RhbnRzXHJcbmNvbnN0IEJMT0NLX1NJWkUgPSAzMDsgLy8gcGl4ZWxzXHJcbmNvbnN0IEJPQVJEX1dJRFRIID0gMTA7IC8vIGJsb2Nrc1xyXG5jb25zdCBCT0FSRF9IRUlHSFQgPSAyMDsgLy8gYmxvY2tzXHJcbmNvbnN0IENBTlZBU19XSURUSCA9IEJPQVJEX1dJRFRIICogQkxPQ0tfU0laRTtcclxuY29uc3QgQ0FOVkFTX0hFSUdIVCA9IEJPQVJEX0hFSUdIVCAqIEJMT0NLX1NJWkU7XHJcblxyXG5jb25zdCBQUkVWSUVXX0JPQVJEX1dJRFRIID0gNjtcclxuY29uc3QgUFJFVklFV19CT0FSRF9IRUlHSFQgPSA2O1xyXG5cclxuY29uc3QgSU5JVElBTF9GQUxMX1NQRUVEID0gMTAwMDsgLy8gbXMgcGVyIGJsb2NrIGZhbGxcclxuY29uc3QgRkFTVF9GQUxMX1NQRUVEID0gNTA7IC8vIG1zIGZvciBmYXN0IGRyb3BcclxuY29uc3QgTEVWRUxfVVBfTElORVMgPSAxMDtcclxuXHJcbi8vIEFEREVEOiBDb25zdGFudCBmb3IgdGhlIHVuaWZpZWQgYmFja2dyb3VuZCBjb2xvclxyXG5jb25zdCBHQU1FX0JBQ0tHUk9VTkRfQ09MT1IgPSAnIzFBMDAzMyc7IC8vIEEgZGFyayBwdXJwbGUgaGV4IGNvZGVcclxuXHJcbi8vIENvbG9ycyBmb3IgVGV0cm9taW5vZXMgYW5kIGJvYXJkXHJcbmNvbnN0IENPTE9SUzogc3RyaW5nW10gPSBbXHJcbiAgICAnY3lhbicsICdibHVlJywgJ29yYW5nZScsICd5ZWxsb3cnLCAnbGltZScsICdwdXJwbGUnLCAncmVkJywgR0FNRV9CQUNLR1JPVU5EX0NPTE9SIC8vIExhc3Qgb25lIGZvciBib2FyZCBiYWNrZ3JvdW5kL2VtcHR5XHJcbl07XHJcblxyXG4vLyBUZXRyb21pbm8gc2hhcGVzIChtYXRyaWNlcylcclxuLy8gRWFjaCBzaGFwZSBpcyByZXByZXNlbnRlZCBieSBhIDR4NCBtYXRyaXgsIGV2ZW4gaWYgc21hbGxlclxyXG4vLyBJbmRleCBjb3JyZXNwb25kcyB0byBDT0xPUlNcclxuY29uc3QgU0hBUEVTOiBudW1iZXJbXVtdW10gPSBbXHJcbiAgICAvLyBJIChjeWFuKVxyXG4gICAgW1swLCAwLCAwLCAwXSxcclxuICAgICBbMSwgMSwgMSwgMV0sXHJcbiAgICAgWzAsIDAsIDAsIDBdLFxyXG4gICAgIFswLCAwLCAwLCAwXV0sXHJcbiAgICAvLyBKIChibHVlKVxyXG4gICAgW1sxLCAwLCAwLCAwXSxcclxuICAgICBbMSwgMSwgMSwgMF0sXHJcbiAgICAgWzAsIDAsIDAsIDBdLFxyXG4gICAgIFswLCAwLCAwLCAwXV0sXHJcbiAgICAvLyBMIChvcmFuZ2UpXHJcbiAgICBbWzAsIDAsIDEsIDBdLFxyXG4gICAgIFsxLCAxLCAxLCAwXSxcclxuICAgICBbMCwgMCwgMCwgMF0sXHJcbiAgICAgWzAsIDAsIDAsIDBdXSxcclxuICAgIC8vIE8gKHllbGxvdylcclxuICAgIFtbMCwgMSwgMSwgMF0sXHJcbiAgICAgWzAsIDEsIDEsIDBdLFxyXG4gICAgIFswLCAwLCAwLCAwXSxcclxuICAgICBbMCwgMCwgMCwgMF1dLFxyXG4gICAgLy8gUyAobGltZSlcclxuICAgIFtbMCwgMSwgMSwgMF0sXHJcbiAgICAgWzEsIDEsIDAsIDBdLFxyXG4gICAgIFswLCAwLCAwLCAwXSxcclxuICAgICBbMCwgMCwgMCwgMF1dLFxyXG4gICAgLy8gVCAocHVycGxlKVxyXG4gICAgW1swLCAxLCAwLCAwXSxcclxuICAgICBbMSwgMSwgMSwgMF0sXHJcbiAgICAgWzAsIDAsIDAsIDBdLFxyXG4gICAgIFswLCAwLCAwLCAwXV0sXHJcbiAgICAvLyBaIChyZWQpXHJcbiAgICBbWzEsIDEsIDAsIDBdLFxyXG4gICAgIFswLCAxLCAxLCAwXSxcclxuICAgICBbMCwgMCwgMCwgMF0sXHJcbiAgICAgWzAsIDAsIDAsIDBdXVxyXG5dO1xyXG5cclxuaW50ZXJmYWNlIFBpZWNlIHtcclxuICAgIHNoYXBlOiBudW1iZXJbXVtdO1xyXG4gICAgY29sb3I6IHN0cmluZztcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHR5cGVJZDogbnVtYmVyOyAvLyBJbmRleCBpbnRvIFNIQVBFUyBhbmQgQ09MT1JTXHJcbn1cclxuXHJcbmNsYXNzIFRldHJpc0dhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgYm9hcmQ6IG51bWJlcltdW107IC8vIDAgZm9yIGVtcHR5LCAxLTcgZm9yIGNvbG9yZWQgYmxvY2tzICh0eXBlSWQgKyAxKVxyXG4gICAgcHJpdmF0ZSBjdXJyZW50UGllY2U6IFBpZWNlO1xyXG4gICAgcHJpdmF0ZSBuZXh0UGllY2U6IFBpZWNlO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBsZXZlbDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBsaW5lc0NsZWFyZWQ6IG51bWJlcjtcclxuICAgIHByaXZhdGUgZ2FtZU92ZXI6IGJvb2xlYW47XHJcbiAgICBwcml2YXRlIGFuaW1hdGlvbkZyYW1lSWQ6IG51bWJlcjtcclxuICAgIHByaXZhdGUgbGFzdEZhbGxUaW1lOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIGZhbGxEZWxheTogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBpc0Zhc3REcm9wcGluZzogYm9vbGVhbjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyBlbGVtZW50IHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSBDQU5WQVNfV0lEVEggKyBQUkVWSUVXX0JPQVJEX1dJRFRIICogQkxPQ0tfU0laRTsgLy8gQWRkIHNwYWNlIGZvciBuZXh0IHBpZWNlIHByZXZpZXcgYW5kIGluZm9cclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSBDQU5WQVNfSEVJR0hUO1xyXG5cclxuICAgICAgICB0aGlzLmJvYXJkID0gdGhpcy5jcmVhdGVFbXB0eUJvYXJkKCk7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5sZXZlbCA9IDE7XHJcbiAgICAgICAgdGhpcy5saW5lc0NsZWFyZWQgPSAwO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXIgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmFuaW1hdGlvbkZyYW1lSWQgPSAwO1xyXG4gICAgICAgIHRoaXMubGFzdEZhbGxUaW1lID0gMDtcclxuICAgICAgICB0aGlzLmZhbGxEZWxheSA9IElOSVRJQUxfRkFMTF9TUEVFRDtcclxuICAgICAgICB0aGlzLmlzRmFzdERyb3BwaW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIEluaXRpYWxpemUgcGllY2VzXHJcbiAgICAgICAgdGhpcy5uZXh0UGllY2UgPSB0aGlzLmdlbmVyYXRlUmFuZG9tUGllY2UoKTtcclxuICAgICAgICB0aGlzLnNwYXduTmV3UGllY2UoKTsgLy8gQXNzaWduIG5leHRQaWVjZSB0byBjdXJyZW50UGllY2UgYW5kIGdlbmVyYXRlIGEgbmV3IG5leHRQaWVjZVxyXG5cclxuICAgICAgICB0aGlzLmF0dGFjaEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICAgICAgdGhpcy5nYW1lTG9vcCgwKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlRW1wdHlCb2FyZCgpOiBudW1iZXJbXVtdIHtcclxuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbSh7IGxlbmd0aDogQk9BUkRfSEVJR0hUIH0sICgpID0+XHJcbiAgICAgICAgICAgIEFycmF5KEJPQVJEX1dJRFRIKS5maWxsKDApXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdlbmVyYXRlUmFuZG9tUGllY2UoKTogUGllY2Uge1xyXG4gICAgICAgIGNvbnN0IHR5cGVJZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIFNIQVBFUy5sZW5ndGgpO1xyXG4gICAgICAgIGNvbnN0IHNoYXBlID0gU0hBUEVTW3R5cGVJZF07XHJcbiAgICAgICAgY29uc3QgY29sb3IgPSBDT0xPUlNbdHlwZUlkXTtcclxuXHJcbiAgICAgICAgLy8gQ2VudGVyIHRoZSBwaWVjZSBob3Jpem9udGFsbHkgYXQgdGhlIHRvcFxyXG4gICAgICAgIGNvbnN0IHN0YXJ0WCA9IE1hdGguZmxvb3IoKEJPQVJEX1dJRFRIIC0gc2hhcGVbMF0ubGVuZ3RoKSAvIDIpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgICAgICAgICAgY29sb3I6IGNvbG9yLFxyXG4gICAgICAgICAgICB4OiBzdGFydFgsXHJcbiAgICAgICAgICAgIHk6IDAsXHJcbiAgICAgICAgICAgIHR5cGVJZDogdHlwZUlkXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduTmV3UGllY2UoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2UgPSB0aGlzLm5leHRQaWVjZTtcclxuICAgICAgICB0aGlzLm5leHRQaWVjZSA9IHRoaXMuZ2VuZXJhdGVSYW5kb21QaWVjZSgpO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBmb3IgaW1tZWRpYXRlIGdhbWUgb3ZlciAocGllY2Ugc3Bhd25zIGFscmVhZHkgY29sbGlkaW5nKVxyXG4gICAgICAgIGlmICghdGhpcy5pc1ZhbGlkTW92ZSh0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZSwgdGhpcy5jdXJyZW50UGllY2UueCwgdGhpcy5jdXJyZW50UGllY2UueSkpIHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lT3ZlciA9IHRydWU7XHJcbiAgICAgICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0aW9uRnJhbWVJZCk7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXR0YWNoRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5UHJlc3MuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwLmJpbmQodGhpcykpOyAvLyBGb3IgcmVzZXR0aW5nIGZhc3QgZHJvcFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5UHJlc3MoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lT3ZlcikgcmV0dXJuO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKGV2ZW50LmtleSkge1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd0xlZnQnOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlUGllY2UoLTEsIDApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ0Fycm93UmlnaHQnOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlUGllY2UoMSwgMCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnQXJyb3dEb3duJzpcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5pc0Zhc3REcm9wcGluZykgeyAvLyBPbmx5IGNoYW5nZSBzcGVlZCBvbmNlIG9uIHByZXNzXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pc0Zhc3REcm9wcGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mYWxsRGVsYXkgPSBGQVNUX0ZBTExfU1BFRUQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyb3BQaWVjZShmYWxzZSk7IC8vIE1vdmUgZG93biBpbW1lZGlhdGVseSwgZG9uJ3QgdHJpZ2dlciBuZXcgcGllY2Ugc3Bhd25cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd1VwJzpcclxuICAgICAgICAgICAgICAgIHRoaXMucm90YXRlUGllY2UoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICcgJzogLy8gU3BhY2ViYXIgZm9yIGhhcmQgZHJvcFxyXG4gICAgICAgICAgICAgICAgdGhpcy5oYXJkRHJvcCgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lT3ZlcikgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJykge1xyXG4gICAgICAgICAgICB0aGlzLmlzRmFzdERyb3BwaW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuZmFsbERlbGF5ID0gSU5JVElBTF9GQUxMX1NQRUVEIC8gdGhpcy5sZXZlbDsgLy8gUmVzZXQgdG8gbm9ybWFsIGZhbGwgc3BlZWRcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBtb3ZlUGllY2UoZHg6IG51bWJlciwgZHk6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzVmFsaWRNb3ZlKHRoaXMuY3VycmVudFBpZWNlLnNoYXBlLCB0aGlzLmN1cnJlbnRQaWVjZS54ICsgZHgsIHRoaXMuY3VycmVudFBpZWNlLnkgKyBkeSkpIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueCArPSBkeDtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSArPSBkeTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByb3RhdGVQaWVjZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCByb3RhdGVkU2hhcGUgPSB0aGlzLnJvdGF0ZU1hdHJpeCh0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZSk7XHJcbiAgICAgICAgLy8gU2ltcGxpZmllZCB3YWxsIGtpY2sgbG9naWM6IHRyeSB0byBzaGlmdCB0aGUgcGllY2Ugc2xpZ2h0bHkgaWYgYSByb3RhdGlvbiBjb2xsaWRlc1xyXG4gICAgICAgIGNvbnN0IGtpY2tzID0gW1xyXG4gICAgICAgICAgICBbMCwgMF0sIFstMSwgMF0sIFsxLCAwXSwgWzAsIC0xXSwgWy0yLCAwXSwgWzIsIDBdIC8vIFRyeSBvcmlnaW5hbCwgbGVmdCwgcmlnaHQsIGRvd24sIG1vcmUgbGVmdC9yaWdodFxyXG4gICAgICAgIF07XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgW29mZnNldFgsIG9mZnNldFldIG9mIGtpY2tzKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmlzVmFsaWRNb3ZlKHJvdGF0ZWRTaGFwZSwgdGhpcy5jdXJyZW50UGllY2UueCArIG9mZnNldFgsIHRoaXMuY3VycmVudFBpZWNlLnkgKyBvZmZzZXRZKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2Uuc2hhcGUgPSByb3RhdGVkU2hhcGU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS54ICs9IG9mZnNldFg7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ICs9IG9mZnNldFk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIFJvdGF0aW9uIHN1Y2Nlc3NmdWxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJvdGF0ZU1hdHJpeChtYXRyaXg6IG51bWJlcltdW10pOiBudW1iZXJbXVtdIHtcclxuICAgICAgICAvLyBUcmFuc3Bvc2UgYW5kIHJldmVyc2Ugcm93cyBmb3IgOTAtZGVncmVlIGNsb2Nrd2lzZSByb3RhdGlvblxyXG4gICAgICAgIGNvbnN0IE4gPSBtYXRyaXgubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IG5ld01hdHJpeCA9IEFycmF5LmZyb20oeyBsZW5ndGg6IE4gfSwgKCkgPT4gQXJyYXkoTikuZmlsbCgwKSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTjsgaSsrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgTjsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICBuZXdNYXRyaXhbal1bTiAtIDEgLSBpXSA9IG1hdHJpeFtpXVtqXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbmV3TWF0cml4O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJvcFBpZWNlKGF1dG9Ecm9wOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzVmFsaWRNb3ZlKHRoaXMuY3VycmVudFBpZWNlLnNoYXBlLCB0aGlzLmN1cnJlbnRQaWVjZS54LCB0aGlzLmN1cnJlbnRQaWVjZS55ICsgMSkpIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSsrO1xyXG4gICAgICAgICAgICBpZiAoIWF1dG9Ecm9wKSB7IC8vIEFkZCBzY29yZSBmb3IgbWFudWFsIHNvZnQgZHJvcFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5sb2NrUGllY2UoKTtcclxuICAgICAgICAgICAgdGhpcy5jbGVhckxpbmVzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25OZXdQaWVjZSgpO1xyXG4gICAgICAgICAgICAvLyBSZXNldCBmYXN0IGRyb3Agc3RhdGUgYW5kIGZhbGwgZGVsYXkgYWZ0ZXIgbG9ja2luZyBhIHBpZWNlXHJcbiAgICAgICAgICAgIHRoaXMuaXNGYXN0RHJvcHBpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5mYWxsRGVsYXkgPSBJTklUSUFMX0ZBTExfU1BFRUQgLyB0aGlzLmxldmVsO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBSZXNldCBmYWxsIHRpbWUgYWZ0ZXIgbG9ja2luZ1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhcmREcm9wKCk6IHZvaWQge1xyXG4gICAgICAgIGxldCBibG9ja3NEcm9wcGVkID0gMDtcclxuICAgICAgICB3aGlsZSAodGhpcy5pc1ZhbGlkTW92ZSh0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZSwgdGhpcy5jdXJyZW50UGllY2UueCwgdGhpcy5jdXJyZW50UGllY2UueSArIDEpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnkrKztcclxuICAgICAgICAgICAgYmxvY2tzRHJvcHBlZCsrO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnNjb3JlICs9IGJsb2Nrc0Ryb3BwZWQgKiAyOyAvLyBTY29yZSBmb3IgaGFyZCBkcm9wXHJcbiAgICAgICAgdGhpcy5sb2NrUGllY2UoKTtcclxuICAgICAgICB0aGlzLmNsZWFyTGluZXMoKTtcclxuICAgICAgICB0aGlzLnNwYXduTmV3UGllY2UoKTtcclxuICAgICAgICAvLyBSZXNldCBmYXN0IGRyb3Agc3RhdGUgYW5kIGZhbGwgZGVsYXkgYWZ0ZXIgbG9ja2luZyBhIHBpZWNlXHJcbiAgICAgICAgdGhpcy5pc0Zhc3REcm9wcGluZyA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuZmFsbERlbGF5ID0gSU5JVElBTF9GQUxMX1NQRUVEIC8gdGhpcy5sZXZlbDtcclxuICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBSZXNldCBmYWxsIHRpbWUgYWZ0ZXIgbG9ja2luZ1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9ja1BpZWNlKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnNoYXBlLmZvckVhY2goKHJvdywgZHkpID0+IHtcclxuICAgICAgICAgICAgcm93LmZvckVhY2goKHZhbHVlLCBkeCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYm9hcmRYID0gdGhpcy5jdXJyZW50UGllY2UueCArIGR4O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvYXJkWSA9IHRoaXMuY3VycmVudFBpZWNlLnkgKyBkeTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYm9hcmRYID49IDAgJiYgYm9hcmRYIDwgQk9BUkRfV0lEVEggJiYgYm9hcmRZID49IDAgJiYgYm9hcmRZIDwgQk9BUkRfSEVJR0hUKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYm9hcmRbYm9hcmRZXVtib2FyZFhdID0gdGhpcy5jdXJyZW50UGllY2UudHlwZUlkICsgMTsgLy8gU3RvcmUgdHlwZUlkICsgMSAoMS1iYXNlZCBpbmRleClcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2xlYXJMaW5lcygpOiB2b2lkIHtcclxuICAgICAgICBsZXQgbGluZXNSZW1vdmVkID0gMDtcclxuICAgICAgICBmb3IgKGxldCB5ID0gQk9BUkRfSEVJR0hUIC0gMTsgeSA+PSAwOyB5LS0pIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYm9hcmRbeV0uZXZlcnkoY2VsbCA9PiBjZWxsICE9PSAwKSkge1xyXG4gICAgICAgICAgICAgICAgLy8gTGluZSBpcyBmdWxsLCByZW1vdmUgaXRcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9hcmQuc3BsaWNlKHksIDEpO1xyXG4gICAgICAgICAgICAgICAgLy8gQWRkIGEgbmV3IGVtcHR5IHJvdyBhdCB0aGUgdG9wXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvYXJkLnVuc2hpZnQoQXJyYXkoQk9BUkRfV0lEVEgpLmZpbGwoMCkpO1xyXG4gICAgICAgICAgICAgICAgbGluZXNSZW1vdmVkKys7XHJcbiAgICAgICAgICAgICAgICB5Kys7IC8vIFJlY2hlY2sgdGhlIHNhbWUgWSBjb29yZGluYXRlIGFzIHJvd3Mgc2hpZnRlZCBkb3duXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChsaW5lc1JlbW92ZWQgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubGluZXNDbGVhcmVkICs9IGxpbmVzUmVtb3ZlZDtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVTY29yZShsaW5lc1JlbW92ZWQpO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUxldmVsKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlU2NvcmUobGluZXNSZW1vdmVkOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzY29yZU11bHRpcGxpZXIgPSBbMCwgNDAsIDEwMCwgMzAwLCAxMjAwXTsgLy8gU3RhbmRhcmQgVGV0cmlzIHNjb3JpbmcgZm9yIDAsIDEsIDIsIDMsIDQgbGluZXNcclxuICAgICAgICB0aGlzLnNjb3JlICs9IHNjb3JlTXVsdGlwbGllcltsaW5lc1JlbW92ZWRdICogdGhpcy5sZXZlbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUxldmVsKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG5ld0xldmVsID0gTWF0aC5mbG9vcih0aGlzLmxpbmVzQ2xlYXJlZCAvIExFVkVMX1VQX0xJTkVTKSArIDE7XHJcbiAgICAgICAgaWYgKG5ld0xldmVsID4gdGhpcy5sZXZlbCkge1xyXG4gICAgICAgICAgICB0aGlzLmxldmVsID0gbmV3TGV2ZWw7XHJcbiAgICAgICAgICAgIC8vIEluY3JlYXNlIGZhbGwgc3BlZWQgYXMgbGV2ZWwgaW5jcmVhc2VzLCBidXQgZW5zdXJlIGl0J3Mgbm90IHNsb3dlciB0aGFuIEZBU1RfRkFMTF9TUEVFRFxyXG4gICAgICAgICAgICB0aGlzLmZhbGxEZWxheSA9IE1hdGgubWF4KEZBU1RfRkFMTF9TUEVFRCArIDEwLCBJTklUSUFMX0ZBTExfU1BFRUQgLyB0aGlzLmxldmVsKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpc1ZhbGlkTW92ZShzaGFwZTogbnVtYmVyW11bXSwgeDogbnVtYmVyLCB5OiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBmb3IgKGxldCBkeSA9IDA7IGR5IDwgc2hhcGUubGVuZ3RoOyBkeSsrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGR4ID0gMDsgZHggPCBzaGFwZVtkeV0ubGVuZ3RoOyBkeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoc2hhcGVbZHldW2R4XSAhPT0gMCkgeyAvLyBJZiBpdCdzIGEgYmxvY2sgaW4gdGhlIHBpZWNlXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYm9hcmRYID0geCArIGR4O1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvYXJkWSA9IHkgKyBkeTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgYm91bmRhcmllc1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChib2FyZFggPCAwIHx8IGJvYXJkWCA+PSBCT0FSRF9XSURUSCB8fCBib2FyZFkgPj0gQk9BUkRfSEVJR0hUKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gT3V0IG9mIGhvcml6b250YWwgb3IgYm90dG9tIGJvdW5kc1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBjb2xsaXNpb24gd2l0aCBleGlzdGluZyBibG9ja3Mgb24gdGhlIGJvYXJkIChpZ25vcmUgaWYgYWJvdmUgYm9hcmQgdG9wKVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChib2FyZFkgPj0gMCAmJiB0aGlzLmJvYXJkW2JvYXJkWV1bYm9hcmRYXSAhPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7IC8vIENvbGxpc2lvblxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdCbG9jayh4OiBudW1iZXIsIHk6IG51bWJlciwgY29sb3JJbmRleDogbnVtYmVyLCBvZmZzZXRYOiBudW1iZXIgPSAwLCBvZmZzZXRZOiBudW1iZXIgPSAwKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gQ09MT1JTW2NvbG9ySW5kZXggLSAxXSB8fCAndHJhbnNwYXJlbnQnOyAvLyBjb2xvckluZGV4IGlzIDEtYmFzZWQgZnJvbSBib2FyZFxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KG9mZnNldFggKyB4ICogQkxPQ0tfU0laRSwgb2Zmc2V0WSArIHkgKiBCTE9DS19TSVpFLCBCTE9DS19TSVpFLCBCTE9DS19TSVpFKTtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICcjMzMzJztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KG9mZnNldFggKyB4ICogQkxPQ0tfU0laRSwgb2Zmc2V0WSArIHkgKiBCTE9DS19TSVpFLCBCTE9DS19TSVpFLCBCTE9DS19TSVpFKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdCb2FyZCgpOiB2b2lkIHtcclxuICAgICAgICAvLyBNYWluIGdhbWUgYm9hcmQgYmFja2dyb3VuZFxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IENPTE9SU1tDT0xPUlMubGVuZ3RoIC0gMV07IC8vIFRoaXMgd2lsbCBub3cgdXNlIEdBTUVfQkFDS0dST1VORF9DT0xPUlxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIENBTlZBU19XSURUSCwgQ0FOVkFTX0hFSUdIVCk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgQk9BUkRfSEVJR0hUOyB5KyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCBCT0FSRF9XSURUSDsgeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ib2FyZFt5XVt4XSAhPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd0Jsb2NrKHgsIHksIHRoaXMuYm9hcmRbeV1beF0pO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBEcmF3IGVtcHR5IGJsb2NrIGJvcmRlcnMgZm9yIGdyaWQgdmlzaWJpbGl0eVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyMyMjInO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QoeCAqIEJMT0NLX1NJWkUsIHkgKiBCTE9DS19TSVpFLCBCTE9DS19TSVpFLCBCTE9DS19TSVpFKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdQaWVjZShwaWVjZTogUGllY2UsIG9mZnNldFg6IG51bWJlciA9IDAsIG9mZnNldFk6IG51bWJlciA9IDApOiB2b2lkIHtcclxuICAgICAgICBwaWVjZS5zaGFwZS5mb3JFYWNoKChyb3csIGR5KSA9PiB7XHJcbiAgICAgICAgICAgIHJvdy5mb3JFYWNoKCh2YWx1ZSwgZHgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAhPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd0Jsb2NrKHBpZWNlLnggKyBkeCwgcGllY2UueSArIGR5LCBwaWVjZS50eXBlSWQgKyAxLCBvZmZzZXRYLCBvZmZzZXRZKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TmV4dFBpZWNlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHByZXZpZXdBcmVhWCA9IENBTlZBU19XSURUSCArIEJMT0NLX1NJWkU7XHJcbiAgICAgICAgY29uc3QgcHJldmlld0FyZWFZID0gQkxPQ0tfU0laRTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBwcmV2aWV3IGFyZWEgYmFja2dyb3VuZFxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IEdBTUVfQkFDS0dST1VORF9DT0xPUjsgLy8gTU9ESUZJRUQ6IFVzZSB0aGUgdW5pZmllZCBiYWNrZ3JvdW5kIGNvbG9yXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QocHJldmlld0FyZWFYIC0gQkxPQ0tfU0laRS8yLCBwcmV2aWV3QXJlYVkgLSBCTE9DS19TSVpFLzIsIFBSRVZJRVdfQk9BUkRfV0lEVEggKiBCTE9DS19TSVpFLCBQUkVWSUVXX0JPQVJEX0hFSUdIVCAqIEJMT0NLX1NJWkUpO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyNBQUEnO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QocHJldmlld0FyZWFYIC0gQkxPQ0tfU0laRS8yLCBwcmV2aWV3QXJlYVkgLSBCTE9DS19TSVpFLzIsIFBSRVZJRVdfQk9BUkRfV0lEVEggKiBCTE9DS19TSVpFLCBQUkVWSUVXX0JPQVJEX0hFSUdIVCAqIEJMT0NLX1NJWkUpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IFwiTkVYVFwiIGxhYmVsXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNGRkYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ05FWFQnLCBwcmV2aWV3QXJlYVggKyAoUFJFVklFV19CT0FSRF9XSURUSCAqIEJMT0NLX1NJWkUgLyAyKSAtIEJMT0NLX1NJWkUvMiwgcHJldmlld0FyZWFZIC0gQkxPQ0tfU0laRSAvIDIpO1xyXG5cclxuICAgICAgICAvLyBDZW50ZXIgbmV4dCBwaWVjZSBpbiBwcmV2aWV3IGFyZWFcclxuICAgICAgICBjb25zdCBwaWVjZVdpZHRoID0gdGhpcy5uZXh0UGllY2Uuc2hhcGVbMF0ubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IHBpZWNlSGVpZ2h0ID0gdGhpcy5uZXh0UGllY2Uuc2hhcGUubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IGNlbnRlck9mZnNldFggPSBwcmV2aWV3QXJlYVggKyAoUFJFVklFV19CT0FSRF9XSURUSCAqIEJMT0NLX1NJWkUgLSBwaWVjZVdpZHRoICogQkxPQ0tfU0laRSkgLyAyO1xyXG4gICAgICAgIGNvbnN0IGNlbnRlck9mZnNldFkgPSBwcmV2aWV3QXJlYVkgKyAoUFJFVklFV19CT0FSRF9IRUlHSFQgKiBCTE9DS19TSVpFIC0gcGllY2VIZWlnaHQgKiBCTE9DS19TSVpFKSAvIDI7XHJcblxyXG4gICAgICAgIHRoaXMubmV4dFBpZWNlLnNoYXBlLmZvckVhY2goKHJvdywgZHkpID0+IHtcclxuICAgICAgICAgICAgcm93LmZvckVhY2goKHZhbHVlLCBkeCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5uZXh0UGllY2UuY29sb3I7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoY2VudGVyT2Zmc2V0WCArIGR4ICogQkxPQ0tfU0laRSwgY2VudGVyT2Zmc2V0WSArIGR5ICogQkxPQ0tfU0laRSwgQkxPQ0tfU0laRSwgQkxPQ0tfU0laRSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnIzMzMyc7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdChjZW50ZXJPZmZzZXRYICsgZHggKiBCTE9DS19TSVpFLCBjZW50ZXJPZmZzZXRZICsgZHkgKiBCTE9DS19TSVpFLCBCTE9DS19TSVpFLCBCTE9DS19TSVpFKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3U2NvcmUoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgaW5mb0FyZWFYID0gQ0FOVkFTX1dJRFRIICsgQkxPQ0tfU0laRTtcclxuICAgICAgICBjb25zdCBpbmZvQXJlYVkgPSBQUkVWSUVXX0JPQVJEX0hFSUdIVCAqIEJMT0NLX1NJWkUgKyAyICogQkxPQ0tfU0laRTsgLy8gQmVsb3cgbmV4dCBwaWVjZSBwcmV2aWV3XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjRkZGJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JzsgLy8gUmVzZXQgdGV4dCBhbGlnbm1lbnRcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgU0NPUkU6ICR7dGhpcy5zY29yZX1gLCBpbmZvQXJlYVgsIGluZm9BcmVhWSk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYExFVkVMOiAke3RoaXMubGV2ZWx9YCwgaW5mb0FyZWFYLCBpbmZvQXJlYVkgKyAzMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYExJTkVTOiAke3RoaXMubGluZXNDbGVhcmVkfWAsIGluZm9BcmVhWCwgaW5mb0FyZWFZICsgNjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNzUpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdHQU1FIE9WRVIhJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1ByZXNzIEY1IHRvIHJlc3RhcnQnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVPdmVyKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBsb2dpYyBiYXNlZCBvbiB0aW1lXHJcbiAgICAgICAgaWYgKCF0aGlzLmxhc3RGYWxsVGltZSkge1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IHRpbWVzdGFtcDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gdGltZXN0YW1wIC0gdGhpcy5sYXN0RmFsbFRpbWU7XHJcblxyXG4gICAgICAgIGlmIChkZWx0YVRpbWUgPiB0aGlzLmZhbGxEZWxheSkge1xyXG4gICAgICAgICAgICB0aGlzLmRyb3BQaWVjZSh0cnVlKTsgLy8gQXV0byBkcm9wXHJcbiAgICAgICAgICAgIHRoaXMubGFzdEZhbGxUaW1lID0gdGltZXN0YW1wO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRHJhd2luZ1xyXG4gICAgICAgIC8vIE1PRElGSUVEOiBSZXBsYWNlZCBjbGVhclJlY3Qgd2l0aCBmaWxsUmVjdCB1c2luZyB0aGUgbmV3IGJhY2tncm91bmQgY29sb3JcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBHQU1FX0JBQ0tHUk9VTkRfQ09MT1I7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgLy8gdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpOyAvLyBPcmlnaW5hbCBsaW5lIGNvbW1lbnRlZCBvdXRcclxuXHJcbiAgICAgICAgdGhpcy5kcmF3Qm9hcmQoKTtcclxuICAgICAgICB0aGlzLmRyYXdQaWVjZSh0aGlzLmN1cnJlbnRQaWVjZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3TmV4dFBpZWNlKCk7XHJcbiAgICAgICAgdGhpcy5kcmF3U2NvcmUoKTtcclxuXHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25GcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEVuc3VyZSB0aGUgRE9NIGlzIGxvYWRlZCBiZWZvcmUgaW5pdGlhbGl6aW5nIHRoZSBnYW1lXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICAvLyBDcmVhdGUgdGhlIGNhbnZhcyBlbGVtZW50IGlmIGl0IGRvZXNuJ3QgZXhpc3RcclxuICAgIGxldCBnYW1lQ2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghZ2FtZUNhbnZhcykge1xyXG4gICAgICAgIGdhbWVDYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICBnYW1lQ2FudmFzLmlkID0gJ2dhbWVDYW52YXMnO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZ2FtZUNhbnZhcyk7XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBuZXcgVGV0cmlzR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XHJcbiAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgIGVycm9yRGl2LnRleHRDb250ZW50ID0gJ0Vycm9yIGluaXRpYWxpemluZyBnYW1lOiAnICsgKGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICB9XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUdBLE1BQU0sYUFBYTtBQUNuQixNQUFNLGNBQWM7QUFDcEIsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sZUFBZSxjQUFjO0FBQ25DLE1BQU0sZ0JBQWdCLGVBQWU7QUFFckMsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSx1QkFBdUI7QUFFN0IsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSxrQkFBa0I7QUFDeEIsTUFBTSxpQkFBaUI7QUFHdkIsTUFBTSx3QkFBd0I7QUFHOUIsTUFBTSxTQUFtQjtBQUFBLEVBQ3JCO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFVO0FBQUEsRUFBVTtBQUFBLEVBQVE7QUFBQSxFQUFVO0FBQUEsRUFBTztBQUFBO0FBQ2pFO0FBS0EsTUFBTSxTQUF1QjtBQUFBO0FBQUEsRUFFekI7QUFBQSxJQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLEVBQUM7QUFBQTtBQUFBLEVBRWI7QUFBQSxJQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLEVBQUM7QUFBQTtBQUFBLEVBRWI7QUFBQSxJQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FB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
