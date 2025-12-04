var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["Title"] = 0] = "Title";
  GameState2[GameState2["Controls"] = 1] = "Controls";
  GameState2[GameState2["Playing"] = 2] = "Playing";
  GameState2[GameState2["GameOver"] = 3] = "GameOver";
  GameState2[GameState2["Paused"] = 4] = "Paused";
  return GameState2;
})(GameState || {});
class Tetromino {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.shapes = config.shapes;
    this.currentRotation = 0;
    this.x = 0;
    this.y = 0;
    this.textureName = config.textureName;
    this.spawnOffsetX = config.spawnOffsetX;
    this.spawnOffsetY = config.spawnOffsetY;
  }
  get shape() {
    return this.shapes[this.currentRotation];
  }
  rotate() {
    this.currentRotation = (this.currentRotation + 1) % this.shapes.length;
  }
  // Creates a deep copy of the tetromino, useful for rotation checks or ghost piece
  clone() {
    const cloned = new Tetromino({
      id: this.id,
      name: this.name,
      shapes: this.shapes,
      // shapes array can be shallow copied as its content is immutable
      textureName: this.textureName,
      spawnOffsetX: this.spawnOffsetX,
      spawnOffsetY: this.spawnOffsetY
    });
    cloned.currentRotation = this.currentRotation;
    cloned.x = this.x;
    cloned.y = this.y;
    return cloned;
  }
}
class TetrisGame {
  constructor(canvasId) {
    this.assets = { images: /* @__PURE__ */ new Map(), sounds: /* @__PURE__ */ new Map() };
    this.gameState = 0 /* Title */;
    this.lastTimestamp = 0;
    // 0 for empty, 1-7 for different block types (tetromino IDs)
    this.allTetrominoTemplates = [];
    this.currentPiece = null;
    this.nextPiece = null;
    this.holdPiece = null;
    this.canSwapHold = true;
    this.tetrominoQueue = [];
    // 7-bag generation
    this.score = 0;
    this.level = 1;
    this.linesCleared = 0;
    // in ms per grid cell
    this.lastFallTime = 0;
    // Input debounce/rate limiting
    this.lastMoveTime = 0;
    this.moveDelay = 100;
    // ms for horizontal movement
    this.lastRotateTime = 0;
    this.rotateDelay = 150;
    // ms for rotation
    this.lastDropKeyTime = 0;
    this.dropKeyDelay = 50;
    // ms for soft drop key
    // Game dimensions (derived from config)
    this.boardWidth = 0;
    this.boardHeight = 0;
    this.blockSize = 0;
    this.gameBoardX = 0;
    this.gameBoardY = 0;
    // Audio tracking
    this.currentBgm = null;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));
    this.grid = [];
    this.fallSpeed = 0;
    this.init();
  }
  async init() {
    await this.loadConfig();
    this.canvas.width = this.config.gameSettings.canvasWidth;
    this.canvas.height = this.config.gameSettings.canvasHeight;
    await this.loadAssets();
    this.setupGameDimensions();
    this.currentBgm = this.playSound("bgm_title", true);
    this.gameLoop(0);
  }
  async loadConfig() {
    try {
      const response = await fetch("data.json");
      this.config = await response.json();
      console.log("Game config loaded:", this.config);
    } catch (error) {
      console.error("Failed to load game config:", error);
      alert("Failed to load game configuration. Please check data.json.");
      throw error;
    }
  }
  async loadAssets() {
    const imagePromises = this.config.assets.images.map((imgConfig) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imgConfig.path;
        img.onload = () => {
          this.assets.images.set(imgConfig.name, img);
          resolve();
        };
        img.onerror = () => {
          console.error(`Failed to load image: ${imgConfig.path}`);
          reject(`Failed to load image: ${imgConfig.path}`);
        };
      });
    });
    const soundPromises = this.config.assets.sounds.map((sndConfig) => {
      return new Promise((resolve) => {
        const audio = new Audio(sndConfig.path);
        audio.volume = sndConfig.volume;
        this.assets.sounds.set(sndConfig.name, audio);
        resolve();
      });
    });
    try {
      await Promise.all([...imagePromises, ...soundPromises]);
      console.log("All assets loaded.");
    } catch (error) {
      console.error("Failed to load some assets:", error);
      alert("Failed to load some game assets. Check console for details.");
      throw error;
    }
  }
  setupGameDimensions() {
    const settings = this.config.gameSettings;
    this.boardWidth = settings.gridWidth;
    this.boardHeight = settings.gridHeight;
    this.blockSize = settings.blockSize;
    this.gameBoardX = settings.gameBoardOffsetX;
    this.gameBoardY = settings.gameBoardOffsetY;
  }
  initGame() {
    this.allTetrominoTemplates = this.config.tetrominoes.map(
      (config) => new Tetromino(config)
    );
    this.resetGame();
    this.gameState = 2 /* Playing */;
    this.currentBgm = this.playSound("bgm_game", true);
  }
  resetGame() {
    this.grid = Array(this.boardHeight).fill(null).map(() => Array(this.boardWidth).fill(0));
    this.score = 0;
    this.level = 1;
    this.linesCleared = 0;
    this.fallSpeed = this.config.gameSettings.initialFallSpeed;
    this.lastFallTime = 0;
    this.currentPiece = null;
    this.nextPiece = null;
    this.holdPiece = null;
    this.canSwapHold = true;
    this.tetrominoQueue = [];
    this.fillTetrominoQueue();
    this.newPiece();
  }
  // Fills the queue with a "7-bag" of tetrominoes
  fillTetrominoQueue() {
    const bag = [...this.allTetrominoTemplates];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.tetrominoQueue.push(...bag);
  }
  newPiece() {
    if (this.tetrominoQueue.length < 7) {
      this.fillTetrominoQueue();
    }
    if (!this.nextPiece) {
      this.nextPiece = this.tetrominoQueue.shift().clone();
    }
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.tetrominoQueue.shift().clone();
    if (this.currentPiece) {
      this.currentPiece.x = Math.floor(this.boardWidth / 2) + this.currentPiece.spawnOffsetX;
      this.currentPiece.y = this.currentPiece.spawnOffsetY;
      this.currentPiece.currentRotation = 0;
      if (!this.isValidMove(this.currentPiece, 0, 0)) {
        this.gameOver();
      }
    }
    this.canSwapHold = true;
  }
  gameOver() {
    this.gameState = 3 /* GameOver */;
    this.playSound("sfx_gameover");
    this.stopSound("bgm_game");
    this.currentBgm = null;
  }
  // Main game loop
  gameLoop(timestamp) {
    const deltaTime = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    if (this.gameState === 2 /* Playing */) {
      this.lastFallTime += deltaTime;
      if (this.lastFallTime >= this.fallSpeed) {
        this.dropPiece();
        this.lastFallTime = 0;
      }
    }
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bgImage = this.assets.images.get(this.gameState === 0 /* Title */ || this.gameState === 1 /* Controls */ ? "title_screen_bg" : "game_bg");
    if (bgImage) {
      this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#1a1a2e";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.gameState) {
      case 0 /* Title */:
        this.renderTitleScreen();
        break;
      case 1 /* Controls */:
        this.renderControlsScreen();
        break;
      case 2 /* Playing */:
      case 4 /* Paused */:
        this.renderPlayingScreen();
        if (this.gameState === 4 /* Paused */) {
          this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          this.drawText(this.config.texts.pausedText, this.canvas.width / 2, this.canvas.height / 2, "white", "48px Arial", "center");
        }
        break;
      case 3 /* GameOver */:
        this.renderGameOverScreen();
        break;
    }
  }
  // Input Handling
  handleKeyDown(event) {
    const currentTime = performance.now();
    if (this.gameState === 0 /* Title */ || this.gameState === 1 /* Controls */) {
      if (event.key === "Escape" && this.gameState === 1 /* Controls */) {
        this.gameState = 0 /* Title */;
      } else if (this.gameState === 0 /* Title */) {
        this.gameState = 1 /* Controls */;
      } else {
        this.initGame();
      }
      return;
    }
    if (this.gameState === 3 /* GameOver */) {
      if (event.key.toLowerCase() === "r") {
        this.gameState = 0 /* Title */;
        this.currentBgm = this.playSound("bgm_title", true);
      }
      return;
    }
    if (this.gameState === 4 /* Paused */) {
      if (event.key.toLowerCase() === "p") {
        this.gameState = 2 /* Playing */;
        this.playSound("bgm_game", true);
      }
      return;
    }
    if (this.gameState === 2 /* Playing */ && this.currentPiece) {
      if (event.key === "ArrowLeft" && currentTime - this.lastMoveTime > this.moveDelay) {
        if (this.movePiece(-1, 0)) this.playSound("sfx_rotate");
        this.lastMoveTime = currentTime;
      } else if (event.key === "ArrowRight" && currentTime - this.lastMoveTime > this.moveDelay) {
        if (this.movePiece(1, 0)) this.playSound("sfx_rotate");
        this.lastMoveTime = currentTime;
      } else if (event.key === "ArrowDown" && currentTime - this.lastDropKeyTime > this.dropKeyDelay) {
        if (this.movePiece(0, 1)) {
          this.score += this.config.gameSettings.scorePerSoftDropBlock;
          this.lastFallTime = 0;
        }
        this.lastDropKeyTime = currentTime;
      } else if (event.key === "ArrowUp" && currentTime - this.lastRotateTime > this.rotateDelay) {
        this.rotatePiece();
        this.lastRotateTime = currentTime;
      } else if (event.key === " ") {
        event.preventDefault();
        this.hardDrop();
      } else if (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "shift") {
        this.swapHoldPiece();
      } else if (event.key.toLowerCase() === "p") {
        this.gameState = 4 /* Paused */;
        this.stopSound("bgm_game");
      }
    }
  }
  handleKeyUp(event) {
    if (event.key === "ArrowDown" && this.gameState === 2 /* Playing */) {
    }
  }
  // Core Tetris Logic
  checkCollision(piece, offsetX, offsetY) {
    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col] !== 0) {
          const newX = piece.x + col + offsetX;
          const newY = piece.y + row + offsetY;
          if (newX < 0 || newX >= this.boardWidth || newY >= this.boardHeight) {
            return true;
          }
          if (newY < 0) continue;
          if (this.grid[newY][newX] !== 0) {
            return true;
          }
        }
      }
    }
    return false;
  }
  isValidMove(piece, offsetX, offsetY) {
    const tempPiece = piece.clone();
    tempPiece.x += offsetX;
    tempPiece.y += offsetY;
    return !this.checkCollision(tempPiece, 0, 0);
  }
  movePiece(offsetX, offsetY) {
    if (this.currentPiece && this.isValidMove(this.currentPiece, offsetX, offsetY)) {
      this.currentPiece.x += offsetX;
      this.currentPiece.y += offsetY;
      return true;
    }
    return false;
  }
  rotatePiece() {
    if (!this.currentPiece) return;
    const originalRotation = this.currentPiece.currentRotation;
    const originalX = this.currentPiece.x;
    const originalY = this.currentPiece.y;
    this.currentPiece.rotate();
    const kickTests = [
      [0, 0],
      // No kick
      [-1, 0],
      // Kick left
      [1, 0],
      // Kick right
      [0, -1],
      // Kick up (for ceiling)
      [-2, 0],
      // Double kick left
      [2, 0]
      // Double kick right
    ];
    for (const [kx, ky] of kickTests) {
      this.currentPiece.x = originalX + kx;
      this.currentPiece.y = originalY + ky;
      if (this.isValidMove(this.currentPiece, 0, 0)) {
        this.playSound("sfx_rotate");
        return;
      }
    }
    this.currentPiece.currentRotation = originalRotation;
    this.currentPiece.x = originalX;
    this.currentPiece.y = originalY;
  }
  hardDrop() {
    if (!this.currentPiece) return;
    let droppedBlocks = 0;
    while (this.isValidMove(this.currentPiece, 0, 1)) {
      this.currentPiece.y++;
      droppedBlocks++;
    }
    this.score += droppedBlocks * this.config.gameSettings.scorePerHardDropBlock;
    this.lockPiece();
  }
  dropPiece() {
    if (!this.currentPiece) return;
    if (this.isValidMove(this.currentPiece, 0, 1)) {
      this.currentPiece.y++;
    } else {
      this.lockPiece();
    }
  }
  lockPiece() {
    if (!this.currentPiece) return;
    for (let row = 0; row < this.currentPiece.shape.length; row++) {
      for (let col = 0; col < this.currentPiece.shape[row].length; col++) {
        if (this.currentPiece.shape[row][col] !== 0) {
          const gridX = this.currentPiece.x + col;
          const gridY = this.currentPiece.y + row;
          if (gridY >= 0 && gridY < this.boardHeight && gridX >= 0 && gridX < this.boardWidth) {
            this.grid[gridY][gridX] = this.currentPiece.id;
          }
        }
      }
    }
    this.playSound("sfx_drop");
    this.clearLines();
    this.newPiece();
  }
  clearLines() {
    let linesClearedThisTurn = 0;
    for (let row = this.boardHeight - 1; row >= 0; row--) {
      if (this.grid[row].every((cell) => cell !== 0)) {
        linesClearedThisTurn++;
        this.grid.splice(row, 1);
        this.grid.unshift(Array(this.boardWidth).fill(0));
        row++;
      }
    }
    if (linesClearedThisTurn > 0) {
      this.playSound("sfx_clear");
      this.linesCleared += linesClearedThisTurn;
      this.score += linesClearedThisTurn * this.config.gameSettings.scorePerLine * this.level;
      this.checkLevelUp();
    }
  }
  checkLevelUp() {
    if (this.linesCleared >= this.level * this.config.gameSettings.levelUpLineCount) {
      this.level++;
      this.fallSpeed *= this.config.gameSettings.levelUpSpeedMultiplier;
      console.log(`Level Up! Level: ${this.level}, Fall Speed: ${this.fallSpeed.toFixed(2)}ms`);
    }
  }
  swapHoldPiece() {
    if (!this.currentPiece || !this.canSwapHold) return;
    this.playSound("sfx_rotate");
    const tempPiece = this.currentPiece;
    if (this.holdPiece) {
      this.currentPiece = this.holdPiece.clone();
      this.currentPiece.x = Math.floor(this.boardWidth / 2) + this.currentPiece.spawnOffsetX;
      this.currentPiece.y = this.currentPiece.spawnOffsetY;
    } else {
      this.newPiece();
    }
    this.holdPiece = tempPiece.clone();
    this.holdPiece.currentRotation = 0;
    this.holdPiece.x = 0;
    this.holdPiece.y = 0;
    this.canSwapHold = false;
  }
  // Rendering Helper Functions
  drawBlock(x, y, blockType, alpha = 1) {
    if (blockType === 0) return;
    const textureConfig = this.config.tetrominoes.find((t) => t.id === blockType);
    const texture = textureConfig ? this.assets.images.get(textureConfig.textureName) : void 0;
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    if (texture) {
      this.ctx.drawImage(texture, x, y, this.blockSize, this.blockSize);
    } else {
      this.ctx.fillStyle = "#ccc";
      this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
      this.ctx.strokeStyle = "#666";
      this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
    }
    this.ctx.restore();
  }
  drawPiece(piece, offsetX, offsetY, alpha = 1) {
    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col] !== 0) {
          const blockX = this.gameBoardX + (piece.x + col + offsetX) * this.blockSize;
          const blockY = this.gameBoardY + (piece.y + row + offsetY) * this.blockSize;
          this.drawBlock(blockX, blockY, piece.id, alpha);
        }
      }
    }
  }
  drawGrid() {
    for (let row = 0; row < this.boardHeight; row++) {
      for (let col = 0; col < this.boardWidth; col++) {
        if (this.grid[row][col] !== 0) {
          const blockX = this.gameBoardX + col * this.blockSize;
          const blockY = this.gameBoardY + row * this.blockSize;
          this.drawBlock(blockX, blockY, this.grid[row][col]);
        }
      }
    }
    this.ctx.strokeStyle = this.config.gameSettings.boardBorderColor;
    this.ctx.lineWidth = 1;
    for (let row = 0; row <= this.boardHeight; row++) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.gameBoardX, this.gameBoardY + row * this.blockSize);
      this.ctx.lineTo(this.gameBoardX + this.boardWidth * this.blockSize, this.gameBoardY + row * this.blockSize);
      this.ctx.stroke();
    }
    for (let col = 0; col <= this.boardWidth; col++) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.gameBoardX + col * this.blockSize, this.gameBoardY);
      this.ctx.lineTo(this.gameBoardX + col * this.blockSize, this.gameBoardY + this.boardHeight * this.blockSize);
      this.ctx.stroke();
    }
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(this.gameBoardX, this.gameBoardY, this.boardWidth * this.blockSize, this.boardHeight * this.blockSize);
  }
  drawUI() {
    const settings = this.config.gameSettings;
    const texts = this.config.texts;
    const panelImage = this.assets.images.get("frame_panel");
    const holdX = settings.holdPanelOffsetX;
    const holdY = settings.holdPanelOffsetY;
    if (panelImage) this.ctx.drawImage(panelImage, holdX, holdY, settings.panelWidth, settings.panelHeight);
    this.drawText(texts.holdLabel, holdX + settings.panelWidth / 2, holdY + 20, settings.textColor, "20px Arial", "center");
    if (this.holdPiece) {
      const pieceShapeWidth = this.holdPiece.shape[0].length;
      const pieceShapeHeight = this.holdPiece.shape.length;
      const renderOffsetX = Math.floor((settings.panelWidth / 2 - pieceShapeWidth * this.blockSize / 2) / this.blockSize);
      const renderOffsetY = Math.floor((50 + (settings.panelHeight / 2 - pieceShapeHeight * this.blockSize / 2)) / this.blockSize) - 1;
      this.drawPiece(this.holdPiece, renderOffsetX, renderOffsetY, 1);
    }
    const nextX = settings.nextPanelOffsetX;
    const nextY = settings.nextPanelOffsetY;
    if (panelImage) this.ctx.drawImage(panelImage, nextX, nextY, settings.panelWidth, settings.panelHeight);
    this.drawText(texts.nextLabel, nextX + settings.panelWidth / 2, nextY + 20, settings.textColor, "20px Arial", "center");
    if (this.nextPiece) {
      const pieceShapeWidth = this.nextPiece.shape[0].length;
      const pieceShapeHeight = this.nextPiece.shape.length;
      const renderOffsetX = Math.floor((settings.panelWidth / 2 - pieceShapeWidth * this.blockSize / 2) / this.blockSize);
      const renderOffsetY = Math.floor((50 + (settings.panelHeight / 2 - pieceShapeHeight * this.blockSize / 2)) / this.blockSize) - 1;
      this.drawPiece(this.nextPiece, renderOffsetX, renderOffsetY, 1);
    }
    const infoX = settings.infoPanelOffsetX;
    const infoY = settings.infoPanelOffsetY;
    if (panelImage) this.ctx.drawImage(panelImage, infoX, infoY, settings.panelWidth, settings.panelHeight * 1.5);
    this.drawText(texts.scoreLabel + this.score, infoX + settings.panelWidth / 2, infoY + 30, settings.textColor, "24px Arial", "center");
    this.drawText(texts.levelLabel + this.level, infoX + settings.panelWidth / 2, infoY + 70, settings.textColor, "24px Arial", "center");
    this.drawText(texts.linesLabel + this.linesCleared, infoX + settings.panelWidth / 2, infoY + 110, settings.textColor, "24px Arial", "center");
  }
  drawText(text, x, y, color, font, align = "left") {
    this.ctx.fillStyle = color;
    this.ctx.font = font;
    this.ctx.textAlign = align;
    this.ctx.fillText(text, x, y);
  }
  // State-specific rendering
  renderTitleScreen() {
    const texts = this.config.texts;
    this.drawText(texts.title, this.canvas.width / 2, this.canvas.height / 3, "cyan", '60px "Press Start 2P", cursive', "center");
    this.drawText(texts.pressAnyKey, this.canvas.width / 2, this.canvas.height / 2 + 50, "white", "24px Arial", "center");
  }
  renderControlsScreen() {
    const texts = this.config.texts;
    this.drawText(texts.controlsTitle, this.canvas.width / 2, this.canvas.height / 4, "lime", '48px "Press Start 2P", cursive', "center");
    let yOffset = this.canvas.height / 3 + 30;
    const lineHeight = 40;
    this.drawText(texts.controlsMoveLeft, this.canvas.width / 2, yOffset, "white", "20px Arial", "center");
    yOffset += lineHeight;
    this.drawText(texts.controlsMoveRight, this.canvas.width / 2, yOffset, "white", "20px Arial", "center");
    yOffset += lineHeight;
    this.drawText(texts.controlsSoftDrop, this.canvas.width / 2, yOffset, "white", "20px Arial", "center");
    yOffset += lineHeight;
    this.drawText(texts.controlsHardDrop, this.canvas.width / 2, yOffset, "white", "20px Arial", "center");
    yOffset += lineHeight;
    this.drawText(texts.controlsRotate, this.canvas.width / 2, yOffset, "white", "20px Arial", "center");
    yOffset += lineHeight;
    this.drawText(texts.controlsHold, this.canvas.width / 2, yOffset, "white", "20px Arial", "center");
    yOffset += lineHeight;
    this.drawText(texts.controlsPause, this.canvas.width / 2, yOffset, "white", "20px Arial", "center");
    yOffset += lineHeight + 30;
    this.drawText(texts.startText, this.canvas.width / 2, yOffset, "yellow", "24px Arial", "center");
  }
  renderPlayingScreen() {
    this.drawGrid();
    this.drawUI();
    if (this.currentPiece) {
      const ghostPiece = this.currentPiece.clone();
      while (this.isValidMove(ghostPiece, 0, 1)) {
        ghostPiece.y++;
      }
      this.drawPiece(ghostPiece, 0, 0, this.config.gameSettings.ghostPieceAlpha);
      this.drawPiece(this.currentPiece, 0, 0, 1);
    }
  }
  renderGameOverScreen() {
    this.renderPlayingScreen();
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const texts = this.config.texts;
    this.drawText(texts.gameOverTitle, this.canvas.width / 2, this.canvas.height / 3, "red", "60px Arial", "center");
    this.drawText(texts.gameOverScore + this.score, this.canvas.width / 2, this.canvas.height / 2, "white", "30px Arial", "center");
    this.drawText(texts.pressRToRestart, this.canvas.width / 2, this.canvas.height / 2 + 60, "yellow", "24px Arial", "center");
  }
  // Audio Playback
  playSound(name, loop = false) {
    const audio = this.assets.sounds.get(name);
    if (audio) {
      if (loop && this.currentBgm && this.currentBgm !== audio) {
        this.currentBgm.pause();
        this.currentBgm.currentTime = 0;
      }
      const soundToPlay = loop ? audio : audio.cloneNode();
      soundToPlay.loop = loop;
      soundToPlay.play().catch((e) => console.warn(`Audio playback failed for ${name}:`, e));
      if (loop) {
        this.currentBgm = soundToPlay;
      }
      return soundToPlay;
    }
    console.warn(`Sound '${name}' not found.`);
    return void 0;
  }
  stopSound(name) {
    const audio = this.assets.sounds.get(name);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      if (this.currentBgm === audio) {
        this.currentBgm = null;
      }
    }
  }
  stopAllSounds() {
    this.assets.sounds.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    this.currentBgm = null;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  try {
    new TetrisGame("gameCanvas");
  } catch (e) {
    console.error("Failed to initialize TetrisGame:", e);
    alert("\uAC8C\uC784 \uCD08\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: " + e.message);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHBhdGg6IHN0cmluZztcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU291bmREYXRhQ29uZmlnIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcbiAgICB2b2x1bWU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFRldHJvbWlub0NvbmZpZyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGlkOiBudW1iZXI7IC8vIDEtNywgY29ycmVzcG9uZHMgdG8gZ3JpZCB2YWx1ZSBhbmQgdGV4dHVyZU5hbWVcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nO1xuICAgIHNwYXduT2Zmc2V0WDogbnVtYmVyOyAvLyBJbml0aWFsIHNwYXduIFggb2Zmc2V0IGZvciBwcm9wZXIgY2VudGVyaW5nXG4gICAgc3Bhd25PZmZzZXRZOiBudW1iZXI7IC8vIEluaXRpYWwgc3Bhd24gWSBvZmZzZXQsIHR5cGljYWxseSAwIG9yIC0xXG4gICAgc2hhcGVzOiBudW1iZXJbXVtdW107IC8vIEFycmF5IG9mIHJvdGF0aW9uIHN0YXRlc1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XG4gICAgZ2FtZVNldHRpbmdzOiB7XG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XG4gICAgICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xuICAgICAgICBncmlkV2lkdGg6IG51bWJlcjtcbiAgICAgICAgZ3JpZEhlaWdodDogbnVtYmVyO1xuICAgICAgICBibG9ja1NpemU6IG51bWJlcjtcbiAgICAgICAgZ2FtZUJvYXJkT2Zmc2V0WDogbnVtYmVyO1xuICAgICAgICBnYW1lQm9hcmRPZmZzZXRZOiBudW1iZXI7XG4gICAgICAgIGluaXRpYWxGYWxsU3BlZWQ6IG51bWJlcjsgLy8gbXMgcGVyIGdyaWQgY2VsbFxuICAgICAgICBsZXZlbFVwTGluZUNvdW50OiBudW1iZXI7XG4gICAgICAgIGxldmVsVXBTcGVlZE11bHRpcGxpZXI6IG51bWJlcjsgLy8gZS5nLiwgMC45IGZvciAxMCUgZmFzdGVyXG4gICAgICAgIHNjb3JlUGVyTGluZTogbnVtYmVyO1xuICAgICAgICBzY29yZVBlckhhcmREcm9wQmxvY2s6IG51bWJlcjtcbiAgICAgICAgc2NvcmVQZXJTb2Z0RHJvcEJsb2NrOiBudW1iZXI7XG4gICAgICAgIGhvbGRQYW5lbE9mZnNldFg6IG51bWJlcjtcbiAgICAgICAgaG9sZFBhbmVsT2Zmc2V0WTogbnVtYmVyO1xuICAgICAgICBuZXh0UGFuZWxPZmZzZXRYOiBudW1iZXI7XG4gICAgICAgIG5leHRQYW5lbE9mZnNldFk6IG51bWJlcjtcbiAgICAgICAgaW5mb1BhbmVsT2Zmc2V0WDogbnVtYmVyO1xuICAgICAgICBpbmZvUGFuZWxPZmZzZXRZOiBudW1iZXI7XG4gICAgICAgIHBhbmVsV2lkdGg6IG51bWJlcjtcbiAgICAgICAgcGFuZWxIZWlnaHQ6IG51bWJlcjtcbiAgICAgICAgdGV4dENvbG9yOiBzdHJpbmc7XG4gICAgICAgIGJvYXJkQm9yZGVyQ29sb3I6IHN0cmluZztcbiAgICAgICAgcGFuZWxCb3JkZXJDb2xvcjogc3RyaW5nO1xuICAgICAgICBnaG9zdFBpZWNlQWxwaGE6IG51bWJlcjtcbiAgICB9O1xuICAgIHRldHJvbWlub2VzOiBUZXRyb21pbm9Db25maWdbXTtcbiAgICB0ZXh0czoge1xuICAgICAgICB0aXRsZTogc3RyaW5nO1xuICAgICAgICBwcmVzc0FueUtleTogc3RyaW5nO1xuICAgICAgICBjb250cm9sc1RpdGxlOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzTW92ZUxlZnQ6IHN0cmluZztcbiAgICAgICAgY29udHJvbHNNb3ZlUmlnaHQ6IHN0cmluZztcbiAgICAgICAgY29udHJvbHNTb2Z0RHJvcDogc3RyaW5nO1xuICAgICAgICBjb250cm9sc0hhcmREcm9wOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzUm90YXRlOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzSG9sZDogc3RyaW5nO1xuICAgICAgICBjb250cm9sc1BhdXNlOiBzdHJpbmc7XG4gICAgICAgIHN0YXJ0VGV4dDogc3RyaW5nO1xuICAgICAgICBzY29yZUxhYmVsOiBzdHJpbmc7XG4gICAgICAgIGxldmVsTGFiZWw6IHN0cmluZztcbiAgICAgICAgbGluZXNMYWJlbDogc3RyaW5nO1xuICAgICAgICBuZXh0TGFiZWw6IHN0cmluZztcbiAgICAgICAgaG9sZExhYmVsOiBzdHJpbmc7XG4gICAgICAgIGdhbWVPdmVyVGl0bGU6IHN0cmluZztcbiAgICAgICAgZ2FtZU92ZXJTY29yZTogc3RyaW5nO1xuICAgICAgICBwcmVzc1JUb1Jlc3RhcnQ6IHN0cmluZztcbiAgICAgICAgcGF1c2VkVGV4dDogc3RyaW5nO1xuICAgIH07XG4gICAgYXNzZXRzOiB7XG4gICAgICAgIGltYWdlczogSW1hZ2VEYXRhQ29uZmlnW107XG4gICAgICAgIHNvdW5kczogU291bmREYXRhQ29uZmlnW107XG4gICAgfTtcbn1cblxuLy8gRW51bSBmb3IgR2FtZVN0YXRlXG5lbnVtIEdhbWVTdGF0ZSB7XG4gICAgVGl0bGUsXG4gICAgQ29udHJvbHMsXG4gICAgUGxheWluZyxcbiAgICBHYW1lT3ZlcixcbiAgICBQYXVzZWRcbn1cblxuLy8gVGV0cm9taW5vIGNsYXNzXG5jbGFzcyBUZXRyb21pbm8ge1xuICAgIGlkOiBudW1iZXI7IC8vIFVuaXF1ZSBJRCBmb3IgdGV4dHVyZSBsb29rdXAgYW5kIGdyaWQgdmFsdWVcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgc2hhcGVzOiBudW1iZXJbXVtdW107IC8vIEFycmF5IG9mIHJvdGF0aW9uIHN0YXRlcywgZWFjaCBzdGF0ZSBpcyBhIDJEIGFycmF5IChtYXRyaXgpXG4gICAgY3VycmVudFJvdGF0aW9uOiBudW1iZXI7XG4gICAgeDogbnVtYmVyO1xuICAgIHk6IG51bWJlcjtcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBLZXkgdG8gbG9va3VwIGltYWdlIGluIGFzc2V0cy5pbWFnZXNcbiAgICBzcGF3bk9mZnNldFg6IG51bWJlcjtcbiAgICBzcGF3bk9mZnNldFk6IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZzogVGV0cm9taW5vQ29uZmlnKSB7XG4gICAgICAgIHRoaXMuaWQgPSBjb25maWcuaWQ7XG4gICAgICAgIHRoaXMubmFtZSA9IGNvbmZpZy5uYW1lO1xuICAgICAgICB0aGlzLnNoYXBlcyA9IGNvbmZpZy5zaGFwZXM7XG4gICAgICAgIHRoaXMuY3VycmVudFJvdGF0aW9uID0gMDtcbiAgICAgICAgdGhpcy54ID0gMDtcbiAgICAgICAgdGhpcy55ID0gMDtcbiAgICAgICAgdGhpcy50ZXh0dXJlTmFtZSA9IGNvbmZpZy50ZXh0dXJlTmFtZTtcbiAgICAgICAgdGhpcy5zcGF3bk9mZnNldFggPSBjb25maWcuc3Bhd25PZmZzZXRYO1xuICAgICAgICB0aGlzLnNwYXduT2Zmc2V0WSA9IGNvbmZpZy5zcGF3bk9mZnNldFk7XG4gICAgfVxuXG4gICAgZ2V0IHNoYXBlKCk6IG51bWJlcltdW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5zaGFwZXNbdGhpcy5jdXJyZW50Um90YXRpb25dO1xuICAgIH1cblxuICAgIHJvdGF0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jdXJyZW50Um90YXRpb24gPSAodGhpcy5jdXJyZW50Um90YXRpb24gKyAxKSAlIHRoaXMuc2hhcGVzLmxlbmd0aDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGVzIGEgZGVlcCBjb3B5IG9mIHRoZSB0ZXRyb21pbm8sIHVzZWZ1bCBmb3Igcm90YXRpb24gY2hlY2tzIG9yIGdob3N0IHBpZWNlXG4gICAgY2xvbmUoKTogVGV0cm9taW5vIHtcbiAgICAgICAgY29uc3QgY2xvbmVkID0gbmV3IFRldHJvbWlubyh7XG4gICAgICAgICAgICBpZDogdGhpcy5pZCxcbiAgICAgICAgICAgIG5hbWU6IHRoaXMubmFtZSxcbiAgICAgICAgICAgIHNoYXBlczogdGhpcy5zaGFwZXMsIC8vIHNoYXBlcyBhcnJheSBjYW4gYmUgc2hhbGxvdyBjb3BpZWQgYXMgaXRzIGNvbnRlbnQgaXMgaW1tdXRhYmxlXG4gICAgICAgICAgICB0ZXh0dXJlTmFtZTogdGhpcy50ZXh0dXJlTmFtZSxcbiAgICAgICAgICAgIHNwYXduT2Zmc2V0WDogdGhpcy5zcGF3bk9mZnNldFgsXG4gICAgICAgICAgICBzcGF3bk9mZnNldFk6IHRoaXMuc3Bhd25PZmZzZXRZLFxuICAgICAgICB9KTtcbiAgICAgICAgY2xvbmVkLmN1cnJlbnRSb3RhdGlvbiA9IHRoaXMuY3VycmVudFJvdGF0aW9uO1xuICAgICAgICBjbG9uZWQueCA9IHRoaXMueDtcbiAgICAgICAgY2xvbmVkLnkgPSB0aGlzLnk7XG4gICAgICAgIHJldHVybiBjbG9uZWQ7XG4gICAgfVxufVxuXG4vLyBNYWluIEdhbWUgQ2xhc3NcbmNsYXNzIFRldHJpc0dhbWUge1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZztcbiAgICBwcml2YXRlIGFzc2V0czoge1xuICAgICAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+O1xuICAgICAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xuICAgIH0gPSB7IGltYWdlczogbmV3IE1hcCgpLCBzb3VuZHM6IG5ldyBNYXAoKSB9O1xuXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5UaXRsZTtcbiAgICBwcml2YXRlIGxhc3RUaW1lc3RhbXA6IG51bWJlciA9IDA7XG5cbiAgICAvLyBHYW1lIHZhcmlhYmxlczpcbiAgICBwcml2YXRlIGdyaWQ6IG51bWJlcltdW107IC8vIDAgZm9yIGVtcHR5LCAxLTcgZm9yIGRpZmZlcmVudCBibG9jayB0eXBlcyAodGV0cm9taW5vIElEcylcbiAgICBwcml2YXRlIGFsbFRldHJvbWlub1RlbXBsYXRlczogVGV0cm9taW5vW10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnJlbnRQaWVjZTogVGV0cm9taW5vIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBuZXh0UGllY2U6IFRldHJvbWlubyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgaG9sZFBpZWNlOiBUZXRyb21pbm8gfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIGNhblN3YXBIb2xkOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHRldHJvbWlub1F1ZXVlOiBUZXRyb21pbm9bXSA9IFtdOyAvLyA3LWJhZyBnZW5lcmF0aW9uXG5cbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgbGV2ZWw6IG51bWJlciA9IDE7XG4gICAgcHJpdmF0ZSBsaW5lc0NsZWFyZWQ6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBmYWxsU3BlZWQ6IG51bWJlcjsgLy8gaW4gbXMgcGVyIGdyaWQgY2VsbFxuICAgIHByaXZhdGUgbGFzdEZhbGxUaW1lOiBudW1iZXIgPSAwO1xuXG4gICAgLy8gSW5wdXQgZGVib3VuY2UvcmF0ZSBsaW1pdGluZ1xuICAgIHByaXZhdGUgbGFzdE1vdmVUaW1lOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgbW92ZURlbGF5OiBudW1iZXIgPSAxMDA7IC8vIG1zIGZvciBob3Jpem9udGFsIG1vdmVtZW50XG4gICAgcHJpdmF0ZSBsYXN0Um90YXRlVGltZTogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIHJvdGF0ZURlbGF5OiBudW1iZXIgPSAxNTA7IC8vIG1zIGZvciByb3RhdGlvblxuICAgIHByaXZhdGUgbGFzdERyb3BLZXlUaW1lOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgZHJvcEtleURlbGF5OiBudW1iZXIgPSA1MDsgLy8gbXMgZm9yIHNvZnQgZHJvcCBrZXlcblxuICAgIC8vIEdhbWUgZGltZW5zaW9ucyAoZGVyaXZlZCBmcm9tIGNvbmZpZylcbiAgICBwcml2YXRlIGJvYXJkV2lkdGg6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBib2FyZEhlaWdodDogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIGJsb2NrU2l6ZTogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIGdhbWVCb2FyZFg6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBnYW1lQm9hcmRZOiBudW1iZXIgPSAwO1xuXG4gICAgLy8gQXVkaW8gdHJhY2tpbmdcbiAgICBwcml2YXRlIGN1cnJlbnRCZ206IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcbiAgICAgICAgdGhpcy5jdHguaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7IC8vIEZvciBjcmlzcCBwaXhlbCBhcnQgaWYgZGVzaXJlZFxuXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuZ3JpZCA9IFtdOyAvLyBXaWxsIGJlIGluaXRpYWxpemVkIGluIHJlc2V0R2FtZVxuICAgICAgICB0aGlzLmZhbGxTcGVlZCA9IDA7IC8vIFdpbGwgYmUgaW5pdGlhbGl6ZWQgZnJvbSBjb25maWdcblxuICAgICAgICB0aGlzLmluaXQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XG4gICAgICAgIHRoaXMuc2V0dXBHYW1lRGltZW5zaW9ucygpO1xuXG4gICAgICAgIC8vIFN0YXJ0IHRpdGxlIG11c2ljXG4gICAgICAgIHRoaXMuY3VycmVudEJnbSA9IHRoaXMucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlKTtcblxuICAgICAgICB0aGlzLmdhbWVMb29wKDApOyAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZyBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWc6JywgZXJyb3IpO1xuICAgICAgICAgICAgYWxlcnQoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi4nKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nQ29uZmlnID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0NvbmZpZy5wYXRoO1xuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLmltYWdlcy5zZXQoaW1nQ29uZmlnLm5hbWUsIGltZyk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdDb25maWcucGF0aH1gKTtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdDb25maWcucGF0aH1gKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzbmRDb25maWcgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc25kQ29uZmlnLnBhdGgpO1xuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNuZENvbmZpZy52b2x1bWU7XG4gICAgICAgICAgICAgICAgLy8gUHJlbG9hZCBjYW4gZmFpbCBzaWxlbnRseSwgc28gd2UganVzdCByZXNvbHZlLlxuICAgICAgICAgICAgICAgIC8vIEFjdHVhbCBwbGF5YmFjayB3aWxsIGhhbmRsZSBlcnJvcnMuXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuc291bmRzLnNldChzbmRDb25maWcubmFtZSwgYXVkaW8pO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBbGwgYXNzZXRzIGxvYWRlZC4nKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIHNvbWUgYXNzZXRzOicsIGVycm9yKTtcbiAgICAgICAgICAgIGFsZXJ0KCdGYWlsZWQgdG8gbG9hZCBzb21lIGdhbWUgYXNzZXRzLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLicpO1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldHVwR2FtZURpbWVuc2lvbnMoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzO1xuICAgICAgICB0aGlzLmJvYXJkV2lkdGggPSBzZXR0aW5ncy5ncmlkV2lkdGg7XG4gICAgICAgIHRoaXMuYm9hcmRIZWlnaHQgPSBzZXR0aW5ncy5ncmlkSGVpZ2h0O1xuICAgICAgICB0aGlzLmJsb2NrU2l6ZSA9IHNldHRpbmdzLmJsb2NrU2l6ZTtcbiAgICAgICAgdGhpcy5nYW1lQm9hcmRYID0gc2V0dGluZ3MuZ2FtZUJvYXJkT2Zmc2V0WDtcbiAgICAgICAgdGhpcy5nYW1lQm9hcmRZID0gc2V0dGluZ3MuZ2FtZUJvYXJkT2Zmc2V0WTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluaXRHYW1lKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFsbFRldHJvbWlub1RlbXBsYXRlcyA9IHRoaXMuY29uZmlnLnRldHJvbWlub2VzLm1hcChcbiAgICAgICAgICAgIGNvbmZpZyA9PiBuZXcgVGV0cm9taW5vKGNvbmZpZylcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUGxheWluZztcbiAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gdGhpcy5wbGF5U291bmQoJ2JnbV9nYW1lJywgdHJ1ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZ3JpZCA9IEFycmF5KHRoaXMuYm9hcmRIZWlnaHQpLmZpbGwobnVsbCkubWFwKCgpID0+IEFycmF5KHRoaXMuYm9hcmRXaWR0aCkuZmlsbCgwKSk7XG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xuICAgICAgICB0aGlzLmxldmVsID0gMTtcbiAgICAgICAgdGhpcy5saW5lc0NsZWFyZWQgPSAwO1xuICAgICAgICB0aGlzLmZhbGxTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5pbml0aWFsRmFsbFNwZWVkO1xuICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IDA7XG4gICAgICAgIHRoaXMuY3VycmVudFBpZWNlID0gbnVsbDtcbiAgICAgICAgdGhpcy5uZXh0UGllY2UgPSBudWxsO1xuICAgICAgICB0aGlzLmhvbGRQaWVjZSA9IG51bGw7XG4gICAgICAgIHRoaXMuY2FuU3dhcEhvbGQgPSB0cnVlO1xuICAgICAgICB0aGlzLnRldHJvbWlub1F1ZXVlID0gW107XG4gICAgICAgIHRoaXMuZmlsbFRldHJvbWlub1F1ZXVlKCk7XG4gICAgICAgIHRoaXMubmV3UGllY2UoKTtcbiAgICB9XG5cbiAgICAvLyBGaWxscyB0aGUgcXVldWUgd2l0aCBhIFwiNy1iYWdcIiBvZiB0ZXRyb21pbm9lc1xuICAgIHByaXZhdGUgZmlsbFRldHJvbWlub1F1ZXVlKCk6IHZvaWQge1xuICAgICAgICBjb25zdCBiYWcgPSBbLi4udGhpcy5hbGxUZXRyb21pbm9UZW1wbGF0ZXNdO1xuICAgICAgICAvLyBTaHVmZmxlIHRoZSBiYWdcbiAgICAgICAgZm9yIChsZXQgaSA9IGJhZy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XG4gICAgICAgICAgICBbYmFnW2ldLCBiYWdbal1dID0gW2JhZ1tqXSwgYmFnW2ldXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRldHJvbWlub1F1ZXVlLnB1c2goLi4uYmFnKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG5ld1BpZWNlKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy50ZXRyb21pbm9RdWV1ZS5sZW5ndGggPCA3KSB7IC8vIFJlZmlsbCBpZiBsZXNzIHRoYW4gYSBmdWxsIGJhZ1xuICAgICAgICAgICAgdGhpcy5maWxsVGV0cm9taW5vUXVldWUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5uZXh0UGllY2UpIHtcbiAgICAgICAgICAgIHRoaXMubmV4dFBpZWNlID0gdGhpcy50ZXRyb21pbm9RdWV1ZS5zaGlmdCgpIS5jbG9uZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2UgPSB0aGlzLm5leHRQaWVjZTtcbiAgICAgICAgdGhpcy5uZXh0UGllY2UgPSB0aGlzLnRldHJvbWlub1F1ZXVlLnNoaWZ0KCkhLmNsb25lKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpZWNlKSB7XG4gICAgICAgICAgICAvLyBSZXNldCBwb3NpdGlvbiB0byBzcGF3biBwb2ludFxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueCA9IE1hdGguZmxvb3IodGhpcy5ib2FyZFdpZHRoIC8gMikgKyB0aGlzLmN1cnJlbnRQaWVjZS5zcGF3bk9mZnNldFg7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ID0gdGhpcy5jdXJyZW50UGllY2Uuc3Bhd25PZmZzZXRZO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UuY3VycmVudFJvdGF0aW9uID0gMDsgLy8gUmVzZXQgcm90YXRpb24gZm9yIG5ldyBwaWVjZVxuXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDApKSB7IC8vIENoZWNrIGNvbGxpc2lvbiBhdCBzcGF3blxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhblN3YXBIb2xkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdhbWVPdmVyKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HYW1lT3ZlcjtcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9nYW1lb3ZlcicpO1xuICAgICAgICB0aGlzLnN0b3BTb3VuZCgnYmdtX2dhbWUnKTtcbiAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBNYWluIGdhbWUgbG9vcFxuICAgIHByaXZhdGUgZ2FtZUxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gdGltZXN0YW1wIC0gdGhpcy5sYXN0VGltZXN0YW1wO1xuICAgICAgICB0aGlzLmxhc3RUaW1lc3RhbXAgPSB0aW1lc3RhbXA7XG5cbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcblxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSArPSBkZWx0YVRpbWU7XG4gICAgICAgICAgICBpZiAodGhpcy5sYXN0RmFsbFRpbWUgPj0gdGhpcy5mYWxsU3BlZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRyb3BQaWVjZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMubGFzdEZhbGxUaW1lID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG5cbiAgICAgICAgLy8gRHJhdyBiYWNrZ3JvdW5kIGZpcnN0XG4gICAgICAgIGNvbnN0IGJnSW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVGl0bGUgfHwgdGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5Db250cm9scyA/ICd0aXRsZV9zY3JlZW5fYmcnIDogJ2dhbWVfYmcnKTtcbiAgICAgICAgaWYgKGJnSW1hZ2UpIHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjMWExYTJlJzsgLy8gRmFsbGJhY2sgZGFyayBzY2ktZmkgY29sb3JcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVGl0bGU6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUaXRsZVNjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuQ29udHJvbHM6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJDb250cm9sc1NjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUGxheWluZzpcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBhdXNlZDogLy8gUmVuZGVyIHBsYXlpbmcgc2NyZWVuIGZvciBwYXVzZWQgc3RhdGUgdG9vLCB3aXRoIG92ZXJsYXlcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclBsYXlpbmdTY3JlZW4oKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuY29uZmlnLnRleHRzLnBhdXNlZFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgJzQ4cHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR2FtZU92ZXI6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJHYW1lT3ZlclNjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSW5wdXQgSGFuZGxpbmdcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY3VycmVudFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5UaXRsZSB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkNvbnRyb2xzKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnRXNjYXBlJyAmJiB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkNvbnRyb2xzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVGl0bGU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVGl0bGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5Db250cm9scztcbiAgICAgICAgICAgIH0gZWxzZSB7IC8vIENvbnRyb2xzIHNjcmVlbiwgYW55IGtleSBjYW4gcHJvY2VlZCB0byBnYW1lLlxuICAgICAgICAgICAgICAgIHRoaXMuaW5pdEdhbWUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdhbWVPdmVyKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdyJykge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRpdGxlO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbSA9IHRoaXMucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlKTsgLy8gUmVzdGFydCB0aXRsZSBtdXNpY1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUGF1c2VkKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdwJykge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBsYXlpbmc7XG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ2JnbV9nYW1lJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPbmx5IHByb2Nlc3MgZ2FtZSBpbnB1dHMgaWYgcGxheWluZ1xuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QbGF5aW5nICYmIHRoaXMuY3VycmVudFBpZWNlKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dMZWZ0JyAmJiBjdXJyZW50VGltZSAtIHRoaXMubGFzdE1vdmVUaW1lID4gdGhpcy5tb3ZlRGVsYXkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb3ZlUGllY2UoLTEsIDApKSB0aGlzLnBsYXlTb3VuZCgnc2Z4X3JvdGF0ZScpOyAvLyBSZXVzZSByb3RhdGUgc291bmQgZm9yIG1vdmUsIG9yIGNyZWF0ZSBuZXdcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RNb3ZlVGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiBjdXJyZW50VGltZSAtIHRoaXMubGFzdE1vdmVUaW1lID4gdGhpcy5tb3ZlRGVsYXkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb3ZlUGllY2UoMSwgMCkpIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0TW92ZVRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyAmJiBjdXJyZW50VGltZSAtIHRoaXMubGFzdERyb3BLZXlUaW1lID4gdGhpcy5kcm9wS2V5RGVsYXkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb3ZlUGllY2UoMCwgMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJTb2Z0RHJvcEJsb2NrO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IDA7IC8vIFJlc2V0IGZhbGwgdGltZXIgb24gc29mdCBkcm9wXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMubGFzdERyb3BLZXlUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93VXAnICYmIGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0Um90YXRlVGltZSA+IHRoaXMucm90YXRlRGVsYXkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJvdGF0ZVBpZWNlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0Um90YXRlVGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICcgJykgeyAvLyBIYXJkIGRyb3BcbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBQcmV2ZW50IHBhZ2Ugc2Nyb2xsXG4gICAgICAgICAgICAgICAgdGhpcy5oYXJkRHJvcCgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJ2MnIHx8IGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAnc2hpZnQnKSB7IC8vIEhvbGQgcGllY2VcbiAgICAgICAgICAgICAgICB0aGlzLnN3YXBIb2xkUGllY2UoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdwJykgeyAvLyBQYXVzZVxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBhdXNlZDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3BTb3VuZCgnYmdtX2dhbWUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgLy8gU3RvcCBzb2Z0IGRyb3AgaWYga2V5IHJlbGVhc2VkLCBhbGxvd2luZyBub3JtYWwgZmFsbCBzcGVlZFxuICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyAmJiB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBsYXlpbmcpIHtcbiAgICAgICAgICAgIC8vIElmIHNvZnQgZHJvcCBpbmNyZWFzZWQgZmFsbCBzcGVlZCwgcmVzZXQgaXQgb3IgZW5zdXJlIG5vcm1hbCB1cGRhdGUgbG9naWMgdGFrZXMgb3Zlci5cbiAgICAgICAgICAgIC8vIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVsaWVzIG9uIGxhc3RGYWxsVGltZSByZXNldCBmb3IgY29udGludW91cyBzb2Z0IGRyb3AuXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb3JlIFRldHJpcyBMb2dpY1xuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb24ocGllY2U6IFRldHJvbWlubywgb2Zmc2V0WDogbnVtYmVyLCBvZmZzZXRZOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDwgcGllY2Uuc2hhcGUubGVuZ3RoOyByb3crKykge1xuICAgICAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDwgcGllY2Uuc2hhcGVbcm93XS5sZW5ndGg7IGNvbCsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBpZWNlLnNoYXBlW3Jvd11bY29sXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdYID0gcGllY2UueCArIGNvbCArIG9mZnNldFg7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld1kgPSBwaWVjZS55ICsgcm93ICsgb2Zmc2V0WTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBib3VuZGFyaWVzXG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXdYIDwgMCB8fCBuZXdYID49IHRoaXMuYm9hcmRXaWR0aCB8fCBuZXdZID49IHRoaXMuYm9hcmRIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBDb2xsaXNpb24gd2l0aCB3YWxsIG9yIGZsb29yXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5ld1kgPCAwKSBjb250aW51ZTsgLy8gQWxsb3cgcGllY2VzIHRvIGJlIGFib3ZlIHRoZSBib2FyZCwgZG9uJ3QgY2hlY2sgZ3JpZCBjb2xsaXNpb24gZm9yIHRoZXNlXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgY29sbGlzaW9uIHdpdGggZXhpc3RpbmcgYmxvY2tzXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbbmV3WV1bbmV3WF0gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGlzVmFsaWRNb3ZlKHBpZWNlOiBUZXRyb21pbm8sIG9mZnNldFg6IG51bWJlciwgb2Zmc2V0WTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIC8vIENyZWF0ZSBhIHRlbXBvcmFyeSBwaWVjZSBmb3IgY29sbGlzaW9uIGNoZWNrIGF0IHRoZSBwb3RlbnRpYWwgbmV3IHBvc2l0aW9uXG4gICAgICAgIGNvbnN0IHRlbXBQaWVjZSA9IHBpZWNlLmNsb25lKCk7XG4gICAgICAgIHRlbXBQaWVjZS54ICs9IG9mZnNldFg7XG4gICAgICAgIHRlbXBQaWVjZS55ICs9IG9mZnNldFk7XG5cbiAgICAgICAgLy8gQ2hlY2sgY29sbGlzaW9uIGZyb20gdGhlIHRlbXBQaWVjZSdzIG5ldyBwb3NpdGlvbiAob2Zmc2V0IHBhcmFtZXRlcnMgdG8gY2hlY2tDb2xsaXNpb24gYXJlIDAsMClcbiAgICAgICAgcmV0dXJuICF0aGlzLmNoZWNrQ29sbGlzaW9uKHRlbXBQaWVjZSwgMCwgMCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBtb3ZlUGllY2Uob2Zmc2V0WDogbnVtYmVyLCBvZmZzZXRZOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpZWNlICYmIHRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIG9mZnNldFgsIG9mZnNldFkpKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS54ICs9IG9mZnNldFg7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ICs9IG9mZnNldFk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByb3RhdGVQaWVjZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWVjZSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsUm90YXRpb24gPSB0aGlzLmN1cnJlbnRQaWVjZS5jdXJyZW50Um90YXRpb247XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsWCA9IHRoaXMuY3VycmVudFBpZWNlLng7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsWSA9IHRoaXMuY3VycmVudFBpZWNlLnk7XG5cbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2Uucm90YXRlKCk7XG5cbiAgICAgICAgLy8gU2ltcGxlIHdhbGwga2ljay9mbG9vciBraWNrIGZvciBiYXNpYyByb3RhdGlvblxuICAgICAgICBjb25zdCBraWNrVGVzdHMgPSBbXG4gICAgICAgICAgICBbMCwgMF0sICAgLy8gTm8ga2lja1xuICAgICAgICAgICAgWy0xLCAwXSwgIC8vIEtpY2sgbGVmdFxuICAgICAgICAgICAgWzEsIDBdLCAgIC8vIEtpY2sgcmlnaHRcbiAgICAgICAgICAgIFswLCAtMV0sICAvLyBLaWNrIHVwIChmb3IgY2VpbGluZylcbiAgICAgICAgICAgIFstMiwgMF0sICAvLyBEb3VibGUga2ljayBsZWZ0XG4gICAgICAgICAgICBbMiwgMF0gICAgLy8gRG91YmxlIGtpY2sgcmlnaHRcbiAgICAgICAgXTtcblxuICAgICAgICBmb3IgKGNvbnN0IFtreCwga3ldIG9mIGtpY2tUZXN0cykge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueCA9IG9yaWdpbmFsWCArIGt4O1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSA9IG9yaWdpbmFsWSArIGt5O1xuICAgICAgICAgICAgaWYgKHRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDApKSB7IC8vIENoZWNrIGlmIG5ldyBwb3NpdGlvbiAod2l0aCBraWNrKSBpcyB2YWxpZFxuICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBSb3RhdGlvbiBzdWNjZXNzZnVsIHdpdGgga2lja1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgbm8ga2ljayB3b3JrZWQsIHJldmVydCB0byBvcmlnaW5hbCBzdGF0ZVxuICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS5jdXJyZW50Um90YXRpb24gPSBvcmlnaW5hbFJvdGF0aW9uO1xuICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS54ID0gb3JpZ2luYWxYO1xuICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ID0gb3JpZ2luYWxZO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGFyZERyb3AoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGllY2UpIHJldHVybjtcblxuICAgICAgICBsZXQgZHJvcHBlZEJsb2NrcyA9IDA7XG4gICAgICAgIC8vIEtlZXAgbW92aW5nIGRvd24gYXMgbG9uZyBhcyB0aGUgbW92ZSBpcyB2YWxpZFxuICAgICAgICB3aGlsZSAodGhpcy5pc1ZhbGlkTW92ZSh0aGlzLmN1cnJlbnRQaWVjZSwgMCwgMSkpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnkrKztcbiAgICAgICAgICAgIGRyb3BwZWRCbG9ja3MrKztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjb3JlICs9IGRyb3BwZWRCbG9ja3MgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJIYXJkRHJvcEJsb2NrO1xuICAgICAgICB0aGlzLmxvY2tQaWVjZSgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZHJvcFBpZWNlKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpZWNlKSByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDEpKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55Kys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvY2tQaWVjZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2NrUGllY2UoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGllY2UpIHJldHVybjtcblxuICAgICAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCB0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZS5sZW5ndGg7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjb2wgPSAwOyBjb2wgPCB0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZVtyb3ddLmxlbmd0aDsgY29sKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50UGllY2Uuc2hhcGVbcm93XVtjb2xdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRYID0gdGhpcy5jdXJyZW50UGllY2UueCArIGNvbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ3JpZFkgPSB0aGlzLmN1cnJlbnRQaWVjZS55ICsgcm93O1xuICAgICAgICAgICAgICAgICAgICBpZiAoZ3JpZFkgPj0gMCAmJiBncmlkWSA8IHRoaXMuYm9hcmRIZWlnaHQgJiYgZ3JpZFggPj0gMCAmJiBncmlkWCA8IHRoaXMuYm9hcmRXaWR0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmlkW2dyaWRZXVtncmlkWF0gPSB0aGlzLmN1cnJlbnRQaWVjZS5pZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2Ryb3AnKTtcbiAgICAgICAgdGhpcy5jbGVhckxpbmVzKCk7XG4gICAgICAgIHRoaXMubmV3UGllY2UoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNsZWFyTGluZXMoKTogdm9pZCB7XG4gICAgICAgIGxldCBsaW5lc0NsZWFyZWRUaGlzVHVybiA9IDA7XG4gICAgICAgIGZvciAobGV0IHJvdyA9IHRoaXMuYm9hcmRIZWlnaHQgLSAxOyByb3cgPj0gMDsgcm93LS0pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcm93XS5ldmVyeShjZWxsID0+IGNlbGwgIT09IDApKSB7XG4gICAgICAgICAgICAgICAgbGluZXNDbGVhcmVkVGhpc1R1cm4rKztcbiAgICAgICAgICAgICAgICB0aGlzLmdyaWQuc3BsaWNlKHJvdywgMSk7IC8vIFJlbW92ZSB0aGUgZnVsbCBsaW5lXG4gICAgICAgICAgICAgICAgdGhpcy5ncmlkLnVuc2hpZnQoQXJyYXkodGhpcy5ib2FyZFdpZHRoKS5maWxsKDApKTsgLy8gQWRkIGEgbmV3IGVtcHR5IGxpbmUgYXQgdGhlIHRvcFxuICAgICAgICAgICAgICAgIHJvdysrOyAvLyBDaGVjayB0aGUgbmV3IGxpbmUgYXQgdGhpcyByb3cgaW5kZXgsIGFzIGFsbCBsaW5lcyBtb3ZlZCBkb3duXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGluZXNDbGVhcmVkVGhpc1R1cm4gPiAwKSB7XG4gICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2NsZWFyJyk7XG4gICAgICAgICAgICB0aGlzLmxpbmVzQ2xlYXJlZCArPSBsaW5lc0NsZWFyZWRUaGlzVHVybjtcbiAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gbGluZXNDbGVhcmVkVGhpc1R1cm4gKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJMaW5lICogdGhpcy5sZXZlbDsgLy8gU2NvcmUgYmFzZWQgb24gbGV2ZWxcbiAgICAgICAgICAgIHRoaXMuY2hlY2tMZXZlbFVwKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNoZWNrTGV2ZWxVcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMubGluZXNDbGVhcmVkID49IHRoaXMubGV2ZWwgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubGV2ZWxVcExpbmVDb3VudCkge1xuICAgICAgICAgICAgdGhpcy5sZXZlbCsrO1xuICAgICAgICAgICAgdGhpcy5mYWxsU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmxldmVsVXBTcGVlZE11bHRpcGxpZXI7IC8vIE1ha2UgaXQgZmFzdGVyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgTGV2ZWwgVXAhIExldmVsOiAke3RoaXMubGV2ZWx9LCBGYWxsIFNwZWVkOiAke3RoaXMuZmFsbFNwZWVkLnRvRml4ZWQoMil9bXNgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc3dhcEhvbGRQaWVjZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWVjZSB8fCAhdGhpcy5jYW5Td2FwSG9sZCkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7IC8vIFVzZSByb3RhdGUgc291bmQgZm9yIHN3YXAgZm9yIG5vd1xuXG4gICAgICAgIGNvbnN0IHRlbXBQaWVjZSA9IHRoaXMuY3VycmVudFBpZWNlO1xuICAgICAgICBpZiAodGhpcy5ob2xkUGllY2UpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlID0gdGhpcy5ob2xkUGllY2UuY2xvbmUoKTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnggPSBNYXRoLmZsb29yKHRoaXMuYm9hcmRXaWR0aCAvIDIpICsgdGhpcy5jdXJyZW50UGllY2Uuc3Bhd25PZmZzZXRYO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSA9IHRoaXMuY3VycmVudFBpZWNlLnNwYXduT2Zmc2V0WTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubmV3UGllY2UoKTsgLy8gR2V0IG5leHQgcGllY2UgaWYgbm8gaG9sZCBwaWVjZSB5ZXRcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmhvbGRQaWVjZSA9IHRlbXBQaWVjZS5jbG9uZSgpO1xuICAgICAgICAvLyBSZXNldCBob2xkIHBpZWNlIHJvdGF0aW9uIGFuZCBwb3NpdGlvbiBmb3IgZGlzcGxheVxuICAgICAgICB0aGlzLmhvbGRQaWVjZS5jdXJyZW50Um90YXRpb24gPSAwO1xuICAgICAgICB0aGlzLmhvbGRQaWVjZS54ID0gMDtcbiAgICAgICAgdGhpcy5ob2xkUGllY2UueSA9IDA7XG5cbiAgICAgICAgdGhpcy5jYW5Td2FwSG9sZCA9IGZhbHNlOyAvLyBDYW4gb25seSBzd2FwIG9uY2UgcGVyIHBpZWNlIGRyb3BcbiAgICB9XG5cbiAgICAvLyBSZW5kZXJpbmcgSGVscGVyIEZ1bmN0aW9uc1xuICAgIHByaXZhdGUgZHJhd0Jsb2NrKHg6IG51bWJlciwgeTogbnVtYmVyLCBibG9ja1R5cGU6IG51bWJlciwgYWxwaGE6IG51bWJlciA9IDEpOiB2b2lkIHtcbiAgICAgICAgaWYgKGJsb2NrVHlwZSA9PT0gMCkgcmV0dXJuOyAvLyBEb24ndCBkcmF3IGVtcHR5IGJsb2Nrc1xuXG4gICAgICAgIGNvbnN0IHRleHR1cmVDb25maWcgPSB0aGlzLmNvbmZpZy50ZXRyb21pbm9lcy5maW5kKHQgPT4gdC5pZCA9PT0gYmxvY2tUeXBlKTtcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRleHR1cmVDb25maWcgPyB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KHRleHR1cmVDb25maWcudGV4dHVyZU5hbWUpIDogdW5kZWZpbmVkO1xuXG4gICAgICAgIHRoaXMuY3R4LnNhdmUoKTtcbiAgICAgICAgdGhpcy5jdHguZ2xvYmFsQWxwaGEgPSBhbHBoYTtcblxuICAgICAgICBpZiAodGV4dHVyZSkge1xuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRleHR1cmUsIHgsIHksIHRoaXMuYmxvY2tTaXplLCB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBGYWxsYmFjayBpZiB0ZXh0dXJlIG5vdCBmb3VuZFxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNjY2MnO1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoeCwgeSwgdGhpcy5ibG9ja1NpemUsIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyM2NjYnO1xuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh4LCB5LCB0aGlzLmJsb2NrU2l6ZSwgdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRyYXdQaWVjZShwaWVjZTogVGV0cm9taW5vLCBvZmZzZXRYOiBudW1iZXIsIG9mZnNldFk6IG51bWJlciwgYWxwaGE6IG51bWJlciA9IDEpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDwgcGllY2Uuc2hhcGUubGVuZ3RoOyByb3crKykge1xuICAgICAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDwgcGllY2Uuc2hhcGVbcm93XS5sZW5ndGg7IGNvbCsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBpZWNlLnNoYXBlW3Jvd11bY29sXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBwaWVjZS54IGFuZCBwaWVjZS55IGFyZSB0aGUgYmFzZSBjb29yZGluYXRlc1xuICAgICAgICAgICAgICAgICAgICAvLyBvZmZzZXRYIGFuZCBvZmZzZXRZIGFyZSBhZGRpdGlvbmFsIHJlbmRlciBvZmZzZXRzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrWCA9IHRoaXMuZ2FtZUJvYXJkWCArIChwaWVjZS54ICsgY29sICsgb2Zmc2V0WCkgKiB0aGlzLmJsb2NrU2l6ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmxvY2tZID0gdGhpcy5nYW1lQm9hcmRZICsgKHBpZWNlLnkgKyByb3cgKyBvZmZzZXRZKSAqIHRoaXMuYmxvY2tTaXplO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdCbG9jayhibG9ja1gsIGJsb2NrWSwgcGllY2UuaWQsIGFscGhhKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRyYXdHcmlkKCk6IHZvaWQge1xuICAgICAgICAvLyBEcmF3IGV4aXN0aW5nIGJsb2Nrc1xuICAgICAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCB0aGlzLmJvYXJkSGVpZ2h0OyByb3crKykge1xuICAgICAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDwgdGhpcy5ib2FyZFdpZHRoOyBjb2wrKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcm93XVtjb2xdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrWCA9IHRoaXMuZ2FtZUJvYXJkWCArIGNvbCAqIHRoaXMuYmxvY2tTaXplO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBibG9ja1kgPSB0aGlzLmdhbWVCb2FyZFkgKyByb3cgKiB0aGlzLmJsb2NrU2l6ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3QmxvY2soYmxvY2tYLCBibG9ja1ksIHRoaXMuZ3JpZFtyb3ddW2NvbF0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERyYXcgZ3JpZCBsaW5lc1xuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ib2FyZEJvcmRlckNvbG9yO1xuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAxO1xuICAgICAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPD0gdGhpcy5ib2FyZEhlaWdodDsgcm93KyspIHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgdGhpcy5jdHgubW92ZVRvKHRoaXMuZ2FtZUJvYXJkWCwgdGhpcy5nYW1lQm9hcmRZICsgcm93ICogdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgdGhpcy5jdHgubGluZVRvKHRoaXMuZ2FtZUJvYXJkWCArIHRoaXMuYm9hcmRXaWR0aCAqIHRoaXMuYmxvY2tTaXplLCB0aGlzLmdhbWVCb2FyZFkgKyByb3cgKiB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBjb2wgPSAwOyBjb2wgPD0gdGhpcy5ib2FyZFdpZHRoOyBjb2wrKykge1xuICAgICAgICAgICAgdGhpcy5jdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICB0aGlzLmN0eC5tb3ZlVG8odGhpcy5nYW1lQm9hcmRYICsgY29sICogdGhpcy5ibG9ja1NpemUsIHRoaXMuZ2FtZUJvYXJkWSk7XG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lVG8odGhpcy5nYW1lQm9hcmRYICsgY29sICogdGhpcy5ibG9ja1NpemUsIHRoaXMuZ2FtZUJvYXJkWSArIHRoaXMuYm9hcmRIZWlnaHQgKiB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBEcmF3IGEgdGhpY2tlciBib3JkZXIgYXJvdW5kIHRoZSBtYWluIGJvYXJkXG4gICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDM7XG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QodGhpcy5nYW1lQm9hcmRYLCB0aGlzLmdhbWVCb2FyZFksIHRoaXMuYm9hcmRXaWR0aCAqIHRoaXMuYmxvY2tTaXplLCB0aGlzLmJvYXJkSGVpZ2h0ICogdGhpcy5ibG9ja1NpemUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZHJhd1VJKCk6IHZvaWQge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncztcbiAgICAgICAgY29uc3QgdGV4dHMgPSB0aGlzLmNvbmZpZy50ZXh0cztcblxuICAgICAgICBjb25zdCBwYW5lbEltYWdlID0gdGhpcy5hc3NldHMuaW1hZ2VzLmdldCgnZnJhbWVfcGFuZWwnKTtcblxuICAgICAgICAvLyBEcmF3IEhvbGQgcGFuZWxcbiAgICAgICAgY29uc3QgaG9sZFggPSBzZXR0aW5ncy5ob2xkUGFuZWxPZmZzZXRYO1xuICAgICAgICBjb25zdCBob2xkWSA9IHNldHRpbmdzLmhvbGRQYW5lbE9mZnNldFk7XG4gICAgICAgIGlmIChwYW5lbEltYWdlKSB0aGlzLmN0eC5kcmF3SW1hZ2UocGFuZWxJbWFnZSwgaG9sZFgsIGhvbGRZLCBzZXR0aW5ncy5wYW5lbFdpZHRoLCBzZXR0aW5ncy5wYW5lbEhlaWdodCk7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuaG9sZExhYmVsLCBob2xkWCArIHNldHRpbmdzLnBhbmVsV2lkdGggLyAyLCBob2xkWSArIDIwLCBzZXR0aW5ncy50ZXh0Q29sb3IsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICBpZiAodGhpcy5ob2xkUGllY2UpIHtcbiAgICAgICAgICAgIC8vIENlbnRlciB0aGUgaGVsZCBwaWVjZSBpbiB0aGUgcGFuZWwgLSBwaWVjZS54LCBwaWVjZS55IHdpbGwgYmUgMCwwIGZvciBob2xkUGllY2UgZm9yIGRpc3BsYXlcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBvZmZzZXRzIHRvIGNlbnRlciBpdCB2aXN1YWxseVxuICAgICAgICAgICAgY29uc3QgcGllY2VTaGFwZVdpZHRoID0gdGhpcy5ob2xkUGllY2Uuc2hhcGVbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgY29uc3QgcGllY2VTaGFwZUhlaWdodCA9IHRoaXMuaG9sZFBpZWNlLnNoYXBlLmxlbmd0aDtcbiAgICAgICAgICAgIGNvbnN0IHJlbmRlck9mZnNldFggPSBNYXRoLmZsb29yKChzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiAtIChwaWVjZVNoYXBlV2lkdGggKiB0aGlzLmJsb2NrU2l6ZSkgLyAyKSAvIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIGNvbnN0IHJlbmRlck9mZnNldFkgPSBNYXRoLmZsb29yKCg1MCArIChzZXR0aW5ncy5wYW5lbEhlaWdodCAvIDIgLSAocGllY2VTaGFwZUhlaWdodCAqIHRoaXMuYmxvY2tTaXplKSAvIDIpKSAvIHRoaXMuYmxvY2tTaXplKSAtIDE7IC8vIEFkanVzdCBZIGZvciBsYWJlbFxuICAgICAgICAgICAgdGhpcy5kcmF3UGllY2UodGhpcy5ob2xkUGllY2UsIHJlbmRlck9mZnNldFgsIHJlbmRlck9mZnNldFksIDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRHJhdyBOZXh0IHBhbmVsXG4gICAgICAgIGNvbnN0IG5leHRYID0gc2V0dGluZ3MubmV4dFBhbmVsT2Zmc2V0WDtcbiAgICAgICAgY29uc3QgbmV4dFkgPSBzZXR0aW5ncy5uZXh0UGFuZWxPZmZzZXRZO1xuICAgICAgICBpZiAocGFuZWxJbWFnZSkgdGhpcy5jdHguZHJhd0ltYWdlKHBhbmVsSW1hZ2UsIG5leHRYLCBuZXh0WSwgc2V0dGluZ3MucGFuZWxXaWR0aCwgc2V0dGluZ3MucGFuZWxIZWlnaHQpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLm5leHRMYWJlbCwgbmV4dFggKyBzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiwgbmV4dFkgKyAyMCwgc2V0dGluZ3MudGV4dENvbG9yLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgaWYgKHRoaXMubmV4dFBpZWNlKSB7XG4gICAgICAgICAgICAvLyBDZW50ZXIgdGhlIG5leHQgcGllY2UgaW4gdGhlIHBhbmVsXG4gICAgICAgICAgICBjb25zdCBwaWVjZVNoYXBlV2lkdGggPSB0aGlzLm5leHRQaWVjZS5zaGFwZVswXS5sZW5ndGg7XG4gICAgICAgICAgICBjb25zdCBwaWVjZVNoYXBlSGVpZ2h0ID0gdGhpcy5uZXh0UGllY2Uuc2hhcGUubGVuZ3RoO1xuICAgICAgICAgICAgY29uc3QgcmVuZGVyT2Zmc2V0WCA9IE1hdGguZmxvb3IoKHNldHRpbmdzLnBhbmVsV2lkdGggLyAyIC0gKHBpZWNlU2hhcGVXaWR0aCAqIHRoaXMuYmxvY2tTaXplKSAvIDIpIC8gdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgY29uc3QgcmVuZGVyT2Zmc2V0WSA9IE1hdGguZmxvb3IoKDUwICsgKHNldHRpbmdzLnBhbmVsSGVpZ2h0IC8gMiAtIChwaWVjZVNoYXBlSGVpZ2h0ICogdGhpcy5ibG9ja1NpemUpIC8gMikpIC8gdGhpcy5ibG9ja1NpemUpIC0gMTsgLy8gQWRqdXN0IFkgZm9yIGxhYmVsXG4gICAgICAgICAgICB0aGlzLmRyYXdQaWVjZSh0aGlzLm5leHRQaWVjZSwgcmVuZGVyT2Zmc2V0WCwgcmVuZGVyT2Zmc2V0WSwgMSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEcmF3IEluZm8gcGFuZWwgKFNjb3JlLCBMZXZlbCwgTGluZXMpXG4gICAgICAgIGNvbnN0IGluZm9YID0gc2V0dGluZ3MuaW5mb1BhbmVsT2Zmc2V0WDtcbiAgICAgICAgY29uc3QgaW5mb1kgPSBzZXR0aW5ncy5pbmZvUGFuZWxPZmZzZXRZO1xuICAgICAgICBpZiAocGFuZWxJbWFnZSkgdGhpcy5jdHguZHJhd0ltYWdlKHBhbmVsSW1hZ2UsIGluZm9YLCBpbmZvWSwgc2V0dGluZ3MucGFuZWxXaWR0aCwgc2V0dGluZ3MucGFuZWxIZWlnaHQgKiAxLjUpOyAvLyBUYWxsZXIgcGFuZWwgZm9yIGluZm9cbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5zY29yZUxhYmVsICsgdGhpcy5zY29yZSwgaW5mb1ggKyBzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiwgaW5mb1kgKyAzMCwgc2V0dGluZ3MudGV4dENvbG9yLCAnMjRweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5sZXZlbExhYmVsICsgdGhpcy5sZXZlbCwgaW5mb1ggKyBzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiwgaW5mb1kgKyA3MCwgc2V0dGluZ3MudGV4dENvbG9yLCAnMjRweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5saW5lc0xhYmVsICsgdGhpcy5saW5lc0NsZWFyZWQsIGluZm9YICsgc2V0dGluZ3MucGFuZWxXaWR0aCAvIDIsIGluZm9ZICsgMTEwLCBzZXR0aW5ncy50ZXh0Q29sb3IsICcyNHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZHJhd1RleHQodGV4dDogc3RyaW5nLCB4OiBudW1iZXIsIHk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZm9udDogc3RyaW5nLCBhbGlnbjogQ2FudmFzVGV4dEFsaWduID0gJ2xlZnQnKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IGNvbG9yO1xuICAgICAgICB0aGlzLmN0eC5mb250ID0gZm9udDtcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gYWxpZ247XG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRleHQsIHgsIHkpO1xuICAgIH1cblxuICAgIC8vIFN0YXRlLXNwZWNpZmljIHJlbmRlcmluZ1xuICAgIHByaXZhdGUgcmVuZGVyVGl0bGVTY3JlZW4oKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRleHRzID0gdGhpcy5jb25maWcudGV4dHM7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMudGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMywgJ2N5YW4nLCAnNjBweCBcIlByZXNzIFN0YXJ0IDJQXCIsIGN1cnNpdmUnLCAnY2VudGVyJyk7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMucHJlc3NBbnlLZXksIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwLCAnd2hpdGUnLCAnMjRweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbmRlckNvbnRyb2xzU2NyZWVuKCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0ZXh0cyA9IHRoaXMuY29uZmlnLnRleHRzO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gNCwgJ2xpbWUnLCAnNDhweCBcIlByZXNzIFN0YXJ0IDJQXCIsIGN1cnNpdmUnLCAnY2VudGVyJyk7XG4gICAgICAgIGxldCB5T2Zmc2V0ID0gdGhpcy5jYW52YXMuaGVpZ2h0IC8gMyArIDMwO1xuICAgICAgICBjb25zdCBsaW5lSGVpZ2h0ID0gNDA7XG5cbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc01vdmVMZWZ0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd3aGl0ZScsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB5T2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNNb3ZlUmlnaHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3doaXRlJywgJzIwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHlPZmZzZXQgKz0gbGluZUhlaWdodDtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc1NvZnREcm9wLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd3aGl0ZScsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB5T2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNIYXJkRHJvcCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAnd2hpdGUnLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgeU9mZnNldCArPSBsaW5lSGVpZ2h0O1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzUm90YXRlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd3aGl0ZScsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB5T2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNIb2xkLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd3aGl0ZScsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB5T2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNQYXVzZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAnd2hpdGUnLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgeU9mZnNldCArPSBsaW5lSGVpZ2h0ICsgMzA7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuc3RhcnRUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd5ZWxsb3cnLCAnMjRweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbmRlclBsYXlpbmdTY3JlZW4oKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZHJhd0dyaWQoKTtcbiAgICAgICAgdGhpcy5kcmF3VUkoKTtcblxuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGllY2UpIHtcbiAgICAgICAgICAgIC8vIERyYXcgZ2hvc3QgcGllY2VcbiAgICAgICAgICAgIGNvbnN0IGdob3N0UGllY2UgPSB0aGlzLmN1cnJlbnRQaWVjZS5jbG9uZSgpO1xuICAgICAgICAgICAgd2hpbGUgKHRoaXMuaXNWYWxpZE1vdmUoZ2hvc3RQaWVjZSwgMCwgMSkpIHsgLy8gU2ltdWxhdGUgZmFsbCBmb3IgZ2hvc3QgcGllY2VcbiAgICAgICAgICAgICAgICBnaG9zdFBpZWNlLnkrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIERyYXcgdGhlIGdob3N0IHBpZWNlIHVzaW5nIGl0cyBjYWxjdWxhdGVkIGZpbmFsIHBvc2l0aW9uXG4gICAgICAgICAgICB0aGlzLmRyYXdQaWVjZShnaG9zdFBpZWNlLCAwLCAwLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ2hvc3RQaWVjZUFscGhhKTtcblxuICAgICAgICAgICAgLy8gRHJhdyBhY3R1YWwgY3VycmVudCBwaWVjZSBhdCBpdHMgY3VycmVudCBwb3NpdGlvbiAobm8gYWRkaXRpb25hbCBvZmZzZXQpXG4gICAgICAgICAgICB0aGlzLmRyYXdQaWVjZSh0aGlzLmN1cnJlbnRQaWVjZSwgMCwgMCwgMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbmRlckdhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlclBsYXlpbmdTY3JlZW4oKTsgLy8gU2hvdyB0aGUgZmluYWwgYm9hcmRcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuXG4gICAgICAgIGNvbnN0IHRleHRzID0gdGhpcy5jb25maWcudGV4dHM7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuZ2FtZU92ZXJUaXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzLCAncmVkJywgJzYwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuZ2FtZU92ZXJTY29yZSArIHRoaXMuc2NvcmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgJzMwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMucHJlc3NSVG9SZXN0YXJ0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA2MCwgJ3llbGxvdycsICcyNHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgIH1cblxuICAgIC8vIEF1ZGlvIFBsYXliYWNrXG4gICAgcHJpdmF0ZSBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmFzc2V0cy5zb3VuZHMuZ2V0KG5hbWUpO1xuICAgICAgICBpZiAoYXVkaW8pIHtcbiAgICAgICAgICAgIC8vIFN0b3AgZXhpc3RpbmcgQkdNIGlmIGEgbmV3IG9uZSBpcyBwbGF5aW5nIG9yIGxvb3BpbmdcbiAgICAgICAgICAgIGlmIChsb29wICYmIHRoaXMuY3VycmVudEJnbSAmJiB0aGlzLmN1cnJlbnRCZ20gIT09IGF1ZGlvKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50QmdtLnBhdXNlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50QmdtLmN1cnJlbnRUaW1lID0gMDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRm9yIFNGWCwgY2xvbmUgdG8gYWxsb3cgb3ZlcmxhcHBpbmdcbiAgICAgICAgICAgIGNvbnN0IHNvdW5kVG9QbGF5ID0gbG9vcCA/IGF1ZGlvIDogYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcbiAgICAgICAgICAgIHNvdW5kVG9QbGF5Lmxvb3AgPSBsb29wO1xuICAgICAgICAgICAgc291bmRUb1BsYXkucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBBdWRpbyBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpOyAvLyBDYXRjaCBQcm9taXNlIHJlamVjdGlvblxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAobG9vcCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbSA9IHNvdW5kVG9QbGF5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHNvdW5kVG9QbGF5O1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZC5gKTtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0b3BTb3VuZChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmFzc2V0cy5zb3VuZHMuZ2V0KG5hbWUpO1xuICAgICAgICBpZiAoYXVkaW8pIHtcbiAgICAgICAgICAgIGF1ZGlvLnBhdXNlKCk7XG4gICAgICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50QmdtID09PSBhdWRpbykge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbSA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHN0b3BBbGxTb3VuZHMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuYXNzZXRzLnNvdW5kcy5mb3JFYWNoKGF1ZGlvID0+IHtcbiAgICAgICAgICAgIGF1ZGlvLnBhdXNlKCk7XG4gICAgICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmN1cnJlbnRCZ20gPSBudWxsO1xuICAgIH1cbn1cblxuLy8gR2xvYmFsIGluaXRpYWxpemF0aW9uXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIG5ldyBUZXRyaXNHYW1lKCdnYW1lQ2FudmFzJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSBUZXRyaXNHYW1lOicsIGUpO1xuICAgICAgICBhbGVydCgnXHVBQzhDXHVDNzg0IFx1Q0QwOFx1QUUzMFx1RDY1NFx1QzVEMCBcdUMyRTRcdUQzMjhcdUQ1ODhcdUMyQjVcdUIyQzhcdUIyRTQ6ICcgKyBlLm1lc3NhZ2UpO1xuICAgIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBaUZBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFMQyxTQUFBQTtBQUFBLEdBQUE7QUFTTCxNQUFNLFVBQVU7QUFBQSxFQVdaLFlBQVksUUFBeUI7QUFDakMsU0FBSyxLQUFLLE9BQU87QUFDakIsU0FBSyxPQUFPLE9BQU87QUFDbkIsU0FBSyxTQUFTLE9BQU87QUFDckIsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxJQUFJO0FBQ1QsU0FBSyxJQUFJO0FBQ1QsU0FBSyxjQUFjLE9BQU87QUFDMUIsU0FBSyxlQUFlLE9BQU87QUFDM0IsU0FBSyxlQUFlLE9BQU87QUFBQSxFQUMvQjtBQUFBLEVBRUEsSUFBSSxRQUFvQjtBQUNwQixXQUFPLEtBQUssT0FBTyxLQUFLLGVBQWU7QUFBQSxFQUMzQztBQUFBLEVBRUEsU0FBZTtBQUNYLFNBQUssbUJBQW1CLEtBQUssa0JBQWtCLEtBQUssS0FBSyxPQUFPO0FBQUEsRUFDcEU7QUFBQTtBQUFBLEVBR0EsUUFBbUI7QUFDZixVQUFNLFNBQVMsSUFBSSxVQUFVO0FBQUEsTUFDekIsSUFBSSxLQUFLO0FBQUEsTUFDVCxNQUFNLEtBQUs7QUFBQSxNQUNYLFFBQVEsS0FBSztBQUFBO0FBQUEsTUFDYixhQUFhLEtBQUs7QUFBQSxNQUNsQixjQUFjLEtBQUs7QUFBQSxNQUNuQixjQUFjLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQ0QsV0FBTyxrQkFBa0IsS0FBSztBQUM5QixXQUFPLElBQUksS0FBSztBQUNoQixXQUFPLElBQUksS0FBSztBQUNoQixXQUFPO0FBQUEsRUFDWDtBQUNKO0FBR0EsTUFBTSxXQUFXO0FBQUEsRUE2Q2IsWUFBWSxV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
