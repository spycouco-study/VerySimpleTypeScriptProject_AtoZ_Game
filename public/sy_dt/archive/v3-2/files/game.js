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
  // Modified drawPiece to accept an optional baseX and baseY for drawing origin
  drawPiece(piece, offsetX, offsetY, alpha = 1, baseX = null, baseY = null) {
    const effectiveBaseX = baseX !== null ? baseX : this.gameBoardX;
    const effectiveBaseY = baseY !== null ? baseY : this.gameBoardY;
    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col] !== 0) {
          const blockX = effectiveBaseX + (piece.x + col + offsetX) * this.blockSize;
          const blockY = effectiveBaseY + (piece.y + row + offsetY) * this.blockSize;
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
    const PANEL_LABEL_HEIGHT_OFFSET = 50;
    const panelImage = this.assets.images.get("frame_panel");
    const holdX = settings.holdPanelOffsetX;
    const holdY = settings.holdPanelOffsetY;
    if (panelImage) this.ctx.drawImage(panelImage, holdX, holdY, settings.panelWidth, settings.panelHeight);
    this.drawText(texts.holdLabel, holdX + settings.panelWidth / 2, holdY + 20, settings.textColor, "20px Arial", "center");
    if (this.holdPiece) {
      const pieceShapeWidth = this.holdPiece.shape[0].length;
      const pieceShapeHeight = this.holdPiece.shape.length;
      const pieceDisplayWidth = pieceShapeWidth * this.blockSize;
      const pieceDisplayHeight = pieceShapeHeight * this.blockSize;
      const contentWidth = settings.panelWidth;
      const contentHeight = settings.panelHeight - PANEL_LABEL_HEIGHT_OFFSET;
      const blockOffsetX = Math.floor((contentWidth - pieceDisplayWidth) / 2 / this.blockSize);
      const blockOffsetY = Math.floor((contentHeight - pieceDisplayHeight) / 2 / this.blockSize);
      this.drawPiece(this.holdPiece, blockOffsetX, blockOffsetY, 1, holdX, holdY + PANEL_LABEL_HEIGHT_OFFSET);
    }
    const nextX = settings.nextPanelOffsetX;
    const nextY = settings.nextPanelOffsetY;
    if (panelImage) this.ctx.drawImage(panelImage, nextX, nextY, settings.panelWidth, settings.panelHeight);
    this.drawText(texts.nextLabel, nextX + settings.panelWidth / 2, nextY + 20, settings.textColor, "20px Arial", "center");
    if (this.nextPiece) {
      const pieceShapeWidth = this.nextPiece.shape[0].length;
      const pieceShapeHeight = this.nextPiece.shape.length;
      const pieceDisplayWidth = pieceShapeWidth * this.blockSize;
      const pieceDisplayHeight = pieceShapeHeight * this.blockSize;
      const contentWidth = settings.panelWidth;
      const contentHeight = settings.panelHeight - PANEL_LABEL_HEIGHT_OFFSET;
      const blockOffsetX = Math.floor((contentWidth - pieceDisplayWidth) / 2 / this.blockSize);
      const blockOffsetY = Math.floor((contentHeight - pieceDisplayHeight) / 2 / this.blockSize);
      this.drawPiece(this.nextPiece, blockOffsetX, blockOffsetY, 1, nextX, nextY + PANEL_LABEL_HEIGHT_OFFSET);
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
      this.drawPiece(ghostPiece, 0, 0, this.config.gameSettings.ghostPieceAlpha, this.gameBoardX, this.gameBoardY);
      this.drawPiece(this.currentPiece, 0, 0, 1, this.gameBoardX, this.gameBoardY);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHBhdGg6IHN0cmluZztcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU291bmREYXRhQ29uZmlnIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcbiAgICB2b2x1bWU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFRldHJvbWlub0NvbmZpZyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGlkOiBudW1iZXI7IC8vIDEtNywgY29ycmVzcG9uZHMgdG8gZ3JpZCB2YWx1ZSBhbmQgdGV4dHVyZU5hbWVcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nO1xuICAgIHNwYXduT2Zmc2V0WDogbnVtYmVyOyAvLyBJbml0aWFsIHNwYXduIFggb2Zmc2V0IGZvciBwcm9wZXIgY2VudGVyaW5nXG4gICAgc3Bhd25PZmZzZXRZOiBudW1iZXI7IC8vIEluaXRpYWwgc3Bhd24gWSBvZmZzZXQsIHR5cGljYWxseSAwIG9yIC0xXG4gICAgc2hhcGVzOiBudW1iZXJbXVtdW107IC8vIEFycmF5IG9mIHJvdGF0aW9uIHN0YXRlc1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XG4gICAgZ2FtZVNldHRpbmdzOiB7XG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XG4gICAgICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xuICAgICAgICBncmlkV2lkdGg6IG51bWJlcjtcbiAgICAgICAgZ3JpZEhlaWdodDogbnVtYmVyO1xuICAgICAgICBibG9ja1NpemU6IG51bWJlcjtcbiAgICAgICAgZ2FtZUJvYXJkT2Zmc2V0WDogbnVtYmVyO1xuICAgICAgICBnYW1lQm9hcmRPZmZzZXRZOiBudW1iZXI7XG4gICAgICAgIGluaXRpYWxGYWxsU3BlZWQ6IG51bWJlcjsgLy8gbXMgcGVyIGdyaWQgY2VsbFxuICAgICAgICBsZXZlbFVwTGluZUNvdW50OiBudW1iZXI7XG4gICAgICAgIGxldmVsVXBTcGVlZE11bHRpcGxpZXI6IG51bWJlcjsgLy8gZS5nLiwgMC45IGZvciAxMCUgZmFzdGVyXG4gICAgICAgIHNjb3JlUGVyTGluZTogbnVtYmVyO1xuICAgICAgICBzY29yZVBlckhhcmREcm9wQmxvY2s6IG51bWJlcjtcbiAgICAgICAgc2NvcmVQZXJTb2Z0RHJvcEJsb2NrOiBudW1iZXI7XG4gICAgICAgIGhvbGRQYW5lbE9mZnNldFg6IG51bWJlcjtcbiAgICAgICAgaG9sZFBhbmVsT2Zmc2V0WTogbnVtYmVyO1xuICAgICAgICBuZXh0UGFuZWxPZmZzZXRYOiBudW1iZXI7XG4gICAgICAgIG5leHRQYW5lbE9mZnNldFk6IG51bWJlcjtcbiAgICAgICAgaW5mb1BhbmVsT2Zmc2V0WDogbnVtYmVyO1xuICAgICAgICBpbmZvUGFuZWxPZmZzZXRZOiBudW1iZXI7XG4gICAgICAgIHBhbmVsV2lkdGg6IG51bWJlcjtcbiAgICAgICAgcGFuZWxIZWlnaHQ6IG51bWJlcjtcbiAgICAgICAgdGV4dENvbG9yOiBzdHJpbmc7XG4gICAgICAgIGJvYXJkQm9yZGVyQ29sb3I6IHN0cmluZztcbiAgICAgICAgcGFuZWxCb3JkZXJDb2xvcjogc3RyaW5nO1xuICAgICAgICBnaG9zdFBpZWNlQWxwaGE6IG51bWJlcjtcbiAgICB9O1xuICAgIHRldHJvbWlub2VzOiBUZXRyb21pbm9Db25maWdbXTtcbiAgICB0ZXh0czoge1xuICAgICAgICB0aXRsZTogc3RyaW5nO1xuICAgICAgICBwcmVzc0FueUtleTogc3RyaW5nO1xuICAgICAgICBjb250cm9sc1RpdGxlOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzTW92ZUxlZnQ6IHN0cmluZztcbiAgICAgICAgY29udHJvbHNNb3ZlUmlnaHQ6IHN0cmluZztcbiAgICAgICAgY29udHJvbHNTb2Z0RHJvcDogc3RyaW5nO1xuICAgICAgICBjb250cm9sc0hhcmREcm9wOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzUm90YXRlOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzSG9sZDogc3RyaW5nO1xuICAgICAgICBjb250cm9sc1BhdXNlOiBzdHJpbmc7XG4gICAgICAgIHN0YXJ0VGV4dDogc3RyaW5nO1xuICAgICAgICBzY29yZUxhYmVsOiBzdHJpbmc7XG4gICAgICAgIGxldmVsTGFiZWw6IHN0cmluZztcbiAgICAgICAgbGluZXNMYWJlbDogc3RyaW5nO1xuICAgICAgICBuZXh0TGFiZWw6IHN0cmluZztcbiAgICAgICAgaG9sZExhYmVsOiBzdHJpbmc7XG4gICAgICAgIGdhbWVPdmVyVGl0bGU6IHN0cmluZztcbiAgICAgICAgZ2FtZU92ZXJTY29yZTogc3RyaW5nO1xuICAgICAgICBwcmVzc1JUb1Jlc3RhcnQ6IHN0cmluZztcbiAgICAgICAgcGF1c2VkVGV4dDogc3RyaW5nO1xuICAgIH07XG4gICAgYXNzZXRzOiB7XG4gICAgICAgIGltYWdlczogSW1hZ2VEYXRhQ29uZmlnW107XG4gICAgICAgIHNvdW5kczogU291bmREYXRhQ29uZmlnW107XG4gICAgfTtcbn1cblxuLy8gRW51bSBmb3IgR2FtZVN0YXRlXG5lbnVtIEdhbWVTdGF0ZSB7XG4gICAgVGl0bGUsXG4gICAgQ29udHJvbHMsXG4gICAgUGxheWluZyxcbiAgICBHYW1lT3ZlcixcbiAgICBQYXVzZWRcbn1cblxuLy8gVGV0cm9taW5vIGNsYXNzXG5jbGFzcyBUZXRyb21pbm8ge1xuICAgIGlkOiBudW1iZXI7IC8vIFVuaXF1ZSBJRCBmb3IgdGV4dHVyZSBsb29rdXAgYW5kIGdyaWQgdmFsdWVcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgc2hhcGVzOiBudW1iZXJbXVtdW107IC8vIEFycmF5IG9mIHJvdGF0aW9uIHN0YXRlcywgZWFjaCBzdGF0ZSBpcyBhIDJEIGFycmF5IChtYXRyaXgpXG4gICAgY3VycmVudFJvdGF0aW9uOiBudW1iZXI7XG4gICAgeDogbnVtYmVyO1xuICAgIHk6IG51bWJlcjtcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBLZXkgdG8gbG9va3VwIGltYWdlIGluIGFzc2V0cy5pbWFnZXNcbiAgICBzcGF3bk9mZnNldFg6IG51bWJlcjtcbiAgICBzcGF3bk9mZnNldFk6IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZzogVGV0cm9taW5vQ29uZmlnKSB7XG4gICAgICAgIHRoaXMuaWQgPSBjb25maWcuaWQ7XG4gICAgICAgIHRoaXMubmFtZSA9IGNvbmZpZy5uYW1lO1xuICAgICAgICB0aGlzLnNoYXBlcyA9IGNvbmZpZy5zaGFwZXM7XG4gICAgICAgIHRoaXMuY3VycmVudFJvdGF0aW9uID0gMDtcbiAgICAgICAgdGhpcy54ID0gMDtcbiAgICAgICAgdGhpcy55ID0gMDtcbiAgICAgICAgdGhpcy50ZXh0dXJlTmFtZSA9IGNvbmZpZy50ZXh0dXJlTmFtZTtcbiAgICAgICAgdGhpcy5zcGF3bk9mZnNldFggPSBjb25maWcuc3Bhd25PZmZzZXRYO1xuICAgICAgICB0aGlzLnNwYXduT2Zmc2V0WSA9IGNvbmZpZy5zcGF3bk9mZnNldFk7XG4gICAgfVxuXG4gICAgZ2V0IHNoYXBlKCk6IG51bWJlcltdW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5zaGFwZXNbdGhpcy5jdXJyZW50Um90YXRpb25dO1xuICAgIH1cblxuICAgIHJvdGF0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jdXJyZW50Um90YXRpb24gPSAodGhpcy5jdXJyZW50Um90YXRpb24gKyAxKSAlIHRoaXMuc2hhcGVzLmxlbmd0aDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGVzIGEgZGVlcCBjb3B5IG9mIHRoZSB0ZXRyb21pbm8sIHVzZWZ1bCBmb3Igcm90YXRpb24gY2hlY2tzIG9yIGdob3N0IHBpZWNlXG4gICAgY2xvbmUoKTogVGV0cm9taW5vIHtcbiAgICAgICAgY29uc3QgY2xvbmVkID0gbmV3IFRldHJvbWlubyh7XG4gICAgICAgICAgICBpZDogdGhpcy5pZCxcbiAgICAgICAgICAgIG5hbWU6IHRoaXMubmFtZSxcbiAgICAgICAgICAgIHNoYXBlczogdGhpcy5zaGFwZXMsIC8vIHNoYXBlcyBhcnJheSBjYW4gYmUgc2hhbGxvdyBjb3BpZWQgYXMgaXRzIGNvbnRlbnQgaXMgaW1tdXRhYmxlXG4gICAgICAgICAgICB0ZXh0dXJlTmFtZTogdGhpcy50ZXh0dXJlTmFtZSxcbiAgICAgICAgICAgIHNwYXduT2Zmc2V0WDogdGhpcy5zcGF3bk9mZnNldFgsXG4gICAgICAgICAgICBzcGF3bk9mZnNldFk6IHRoaXMuc3Bhd25PZmZzZXRZLFxuICAgICAgICB9KTtcbiAgICAgICAgY2xvbmVkLmN1cnJlbnRSb3RhdGlvbiA9IHRoaXMuY3VycmVudFJvdGF0aW9uO1xuICAgICAgICBjbG9uZWQueCA9IHRoaXMueDtcbiAgICAgICAgY2xvbmVkLnkgPSB0aGlzLnk7XG4gICAgICAgIHJldHVybiBjbG9uZWQ7XG4gICAgfVxufVxuXG4vLyBNYWluIEdhbWUgQ2xhc3NcbmNsYXNzIFRldHJpc0dhbWUge1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZztcbiAgICBwcml2YXRlIGFzc2V0czoge1xuICAgICAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+O1xuICAgICAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xuICAgIH0gPSB7IGltYWdlczogbmV3IE1hcCgpLCBzb3VuZHM6IG5ldyBNYXAoKSB9O1xuXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5UaXRsZTtcbiAgICBwcml2YXRlIGxhc3RUaW1lc3RhbXA6IG51bWJlciA9IDA7XG5cbiAgICAvLyBHYW1lIHZhcmlhYmxlczpcbiAgICBwcml2YXRlIGdyaWQ6IG51bWJlcltdW107IC8vIDAgZm9yIGVtcHR5LCAxLTcgZm9yIGRpZmZlcmVudCBibG9jayB0eXBlcyAodGV0cm9taW5vIElEcylcbiAgICBwcml2YXRlIGFsbFRldHJvbWlub1RlbXBsYXRlczogVGV0cm9taW5vW10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnJlbnRQaWVjZTogVGV0cm9taW5vIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBuZXh0UGllY2U6IFRldHJvbWlubyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgaG9sZFBpZWNlOiBUZXRyb21pbm8gfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIGNhblN3YXBIb2xkOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHRldHJvbWlub1F1ZXVlOiBUZXRyb21pbm9bXSA9IFtdOyAvLyA3LWJhZyBnZW5lcmF0aW9uXG5cbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgbGV2ZWw6IG51bWJlciA9IDE7XG4gICAgcHJpdmF0ZSBsaW5lc0NsZWFyZWQ6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBmYWxsU3BlZWQ6IG51bWJlcjsgLy8gaW4gbXMgcGVyIGdyaWQgY2VsbFxuICAgIHByaXZhdGUgbGFzdEZhbGxUaW1lOiBudW1iZXIgPSAwO1xuXG4gICAgLy8gSW5wdXQgZGVib3VuY2UvcmF0ZSBsaW1pdGluZ1xuICAgIHByaXZhdGUgbGFzdE1vdmVUaW1lOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgbW92ZURlbGF5OiBudW1iZXIgPSAxMDA7IC8vIG1zIGZvciBob3Jpem9udGFsIG1vdmVtZW50XG4gICAgcHJpdmF0ZSBsYXN0Um90YXRlVGltZTogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIHJvdGF0ZURlbGF5OiBudW1iZXIgPSAxNTA7IC8vIG1zIGZvciByb3RhdGlvblxuICAgIHByaXZhdGUgbGFzdERyb3BLZXlUaW1lOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgZHJvcEtleURlbGF5OiBudW1iZXIgPSA1MDsgLy8gbXMgZm9yIHNvZnQgZHJvcCBrZXlcblxuICAgIC8vIEdhbWUgZGltZW5zaW9ucyAoZGVyaXZlZCBmcm9tIGNvbmZpZylcbiAgICBwcml2YXRlIGJvYXJkV2lkdGg6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBib2FyZEhlaWdodDogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIGJsb2NrU2l6ZTogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIGdhbWVCb2FyZFg6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBnYW1lQm9hcmRZOiBudW1iZXIgPSAwO1xuXG4gICAgLy8gQXVkaW8gdHJhY2tpbmdcbiAgICBwcml2YXRlIGN1cnJlbnRCZ206IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcbiAgICAgICAgdGhpcy5jdHguaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7IC8vIEZvciBjcmlzcCBwaXhlbCBhcnQgaWYgZGVzaXJlZFxuXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuZ3JpZCA9IFtdOyAvLyBXaWxsIGJlIGluaXRpYWxpemVkIGluIHJlc2V0R2FtZVxuICAgICAgICB0aGlzLmZhbGxTcGVlZCA9IDA7IC8vIFdpbGwgYmUgaW5pdGlhbGl6ZWQgZnJvbSBjb25maWdcblxuICAgICAgICB0aGlzLmluaXQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XG4gICAgICAgIHRoaXMuc2V0dXBHYW1lRGltZW5zaW9ucygpO1xuXG4gICAgICAgIC8vIFN0YXJ0IHRpdGxlIG11c2ljXG4gICAgICAgIHRoaXMuY3VycmVudEJnbSA9IHRoaXMucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlKTtcblxuICAgICAgICB0aGlzLmdhbWVMb29wKDApOyAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZyBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWc6JywgZXJyb3IpO1xuICAgICAgICAgICAgYWxlcnQoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi4nKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nQ29uZmlnID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0NvbmZpZy5wYXRoO1xuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLmltYWdlcy5zZXQoaW1nQ29uZmlnLm5hbWUsIGltZyk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdDb25maWcucGF0aH1gKTtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdDb25maWcucGF0aH1gKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzbmRDb25maWcgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc25kQ29uZmlnLnBhdGgpO1xuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNuZENvbmZpZy52b2x1bWU7XG4gICAgICAgICAgICAgICAgLy8gUHJlbG9hZCBjYW4gZmFpbCBzaWxlbnRseSwgc28gd2UganVzdCByZXNvbHZlLlxuICAgICAgICAgICAgICAgIC8vIEFjdHVhbCBwbGF5YmFjayB3aWxsIGhhbmRsZSBlcnJvcnMuXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuc291bmRzLnNldChzbmRDb25maWcubmFtZSwgYXVkaW8pO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBbGwgYXNzZXRzIGxvYWRlZC4nKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIHNvbWUgYXNzZXRzOicsIGVycm9yKTtcbiAgICAgICAgICAgIGFsZXJ0KCdGYWlsZWQgdG8gbG9hZCBzb21lIGdhbWUgYXNzZXRzLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLicpO1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldHVwR2FtZURpbWVuc2lvbnMoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzO1xuICAgICAgICB0aGlzLmJvYXJkV2lkdGggPSBzZXR0aW5ncy5ncmlkV2lkdGg7XG4gICAgICAgIHRoaXMuYm9hcmRIZWlnaHQgPSBzZXR0aW5ncy5ncmlkSGVpZ2h0O1xuICAgICAgICB0aGlzLmJsb2NrU2l6ZSA9IHNldHRpbmdzLmJsb2NrU2l6ZTtcbiAgICAgICAgdGhpcy5nYW1lQm9hcmRYID0gc2V0dGluZ3MuZ2FtZUJvYXJkT2Zmc2V0WDtcbiAgICAgICAgdGhpcy5nYW1lQm9hcmRZID0gc2V0dGluZ3MuZ2FtZUJvYXJkT2Zmc2V0WTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluaXRHYW1lKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFsbFRldHJvbWlub1RlbXBsYXRlcyA9IHRoaXMuY29uZmlnLnRldHJvbWlub2VzLm1hcChcbiAgICAgICAgICAgIGNvbmZpZyA9PiBuZXcgVGV0cm9taW5vKGNvbmZpZylcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUGxheWluZztcbiAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gdGhpcy5wbGF5U291bmQoJ2JnbV9nYW1lJywgdHJ1ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZ3JpZCA9IEFycmF5KHRoaXMuYm9hcmRIZWlnaHQpLmZpbGwobnVsbCkubWFwKCgpID0+IEFycmF5KHRoaXMuYm9hcmRXaWR0aCkuZmlsbCgwKSk7XG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xuICAgICAgICB0aGlzLmxldmVsID0gMTtcbiAgICAgICAgdGhpcy5saW5lc0NsZWFyZWQgPSAwO1xuICAgICAgICB0aGlzLmZhbGxTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5pbml0aWFsRmFsbFNwZWVkO1xuICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IDA7XG4gICAgICAgIHRoaXMuY3VycmVudFBpZWNlID0gbnVsbDtcbiAgICAgICAgdGhpcy5uZXh0UGllY2UgPSBudWxsO1xuICAgICAgICB0aGlzLmhvbGRQaWVjZSA9IG51bGw7XG4gICAgICAgIHRoaXMuY2FuU3dhcEhvbGQgPSB0cnVlO1xuICAgICAgICB0aGlzLnRldHJvbWlub1F1ZXVlID0gW107XG4gICAgICAgIHRoaXMuZmlsbFRldHJvbWlub1F1ZXVlKCk7XG4gICAgICAgIHRoaXMubmV3UGllY2UoKTtcbiAgICB9XG5cbiAgICAvLyBGaWxscyB0aGUgcXVldWUgd2l0aCBhIFwiNy1iYWdcIiBvZiB0ZXRyb21pbm9lc1xuICAgIHByaXZhdGUgZmlsbFRldHJvbWlub1F1ZXVlKCk6IHZvaWQge1xuICAgICAgICBjb25zdCBiYWcgPSBbLi4udGhpcy5hbGxUZXRyb21pbm9UZW1wbGF0ZXNdO1xuICAgICAgICAvLyBTaHVmZmxlIHRoZSBiYWdcbiAgICAgICAgZm9yIChsZXQgaSA9IGJhZy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XG4gICAgICAgICAgICBbYmFnW2ldLCBiYWdbal1dID0gW2JhZ1tqXSwgYmFnW2ldXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRldHJvbWlub1F1ZXVlLnB1c2goLi4uYmFnKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG5ld1BpZWNlKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy50ZXRyb21pbm9RdWV1ZS5sZW5ndGggPCA3KSB7IC8vIFJlZmlsbCBpZiBsZXNzIHRoYW4gYSBmdWxsIGJhZ1xuICAgICAgICAgICAgdGhpcy5maWxsVGV0cm9taW5vUXVldWUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5uZXh0UGllY2UpIHtcbiAgICAgICAgICAgIHRoaXMubmV4dFBpZWNlID0gdGhpcy50ZXRyb21pbm9RdWV1ZS5zaGlmdCgpIS5jbG9uZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2UgPSB0aGlzLm5leHRQaWVjZTtcbiAgICAgICAgdGhpcy5uZXh0UGllY2UgPSB0aGlzLnRldHJvbWlub1F1ZXVlLnNoaWZ0KCkhLmNsb25lKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpZWNlKSB7XG4gICAgICAgICAgICAvLyBSZXNldCBwb3NpdGlvbiB0byBzcGF3biBwb2ludFxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueCA9IE1hdGguZmxvb3IodGhpcy5ib2FyZFdpZHRoIC8gMikgKyB0aGlzLmN1cnJlbnRQaWVjZS5zcGF3bk9mZnNldFg7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ID0gdGhpcy5jdXJyZW50UGllY2Uuc3Bhd25PZmZzZXRZO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UuY3VycmVudFJvdGF0aW9uID0gMDsgLy8gUmVzZXQgcm90YXRpb24gZm9yIG5ldyBwaWVjZVxuXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDApKSB7IC8vIENoZWNrIGNvbGxpc2lvbiBhdCBzcGF3blxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhblN3YXBIb2xkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdhbWVPdmVyKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HYW1lT3ZlcjtcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9nYW1lb3ZlcicpO1xuICAgICAgICB0aGlzLnN0b3BTb3VuZCgnYmdtX2dhbWUnKTtcbiAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBNYWluIGdhbWUgbG9vcFxuICAgIHByaXZhdGUgZ2FtZUxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gdGltZXN0YW1wIC0gdGhpcy5sYXN0VGltZXN0YW1wO1xuICAgICAgICB0aGlzLmxhc3RUaW1lc3RhbXAgPSB0aW1lc3RhbXA7XG5cbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcblxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSArPSBkZWx0YVRpbWU7XG4gICAgICAgICAgICBpZiAodGhpcy5sYXN0RmFsbFRpbWUgPj0gdGhpcy5mYWxsU3BlZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRyb3BQaWVjZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMubGFzdEZhbGxUaW1lID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG5cbiAgICAgICAgLy8gRHJhdyBiYWNrZ3JvdW5kIGZpcnN0XG4gICAgICAgIGNvbnN0IGJnSW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVGl0bGUgfHwgdGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5Db250cm9scyA/ICd0aXRsZV9zY3JlZW5fYmcnIDogJ2dhbWVfYmcnKTtcbiAgICAgICAgaWYgKGJnSW1hZ2UpIHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjMWExYTJlJzsgLy8gRmFsbGJhY2sgZGFyayBzY2ktZmkgY29sb3JcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVGl0bGU6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUaXRsZVNjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuQ29udHJvbHM6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJDb250cm9sc1NjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUGxheWluZzpcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBhdXNlZDogLy8gUmVuZGVyIHBsYXlpbmcgc2NyZWVuIGZvciBwYXVzZWQgc3RhdGUgdG9vLCB3aXRoIG92ZXJsYXlcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclBsYXlpbmdTY3JlZW4oKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuY29uZmlnLnRleHRzLnBhdXNlZFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgJzQ4cHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR2FtZU92ZXI6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJHYW1lT3ZlclNjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSW5wdXQgSGFuZGxpbmdcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY3VycmVudFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5UaXRsZSB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkNvbnRyb2xzKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnRXNjYXBlJyAmJiB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkNvbnRyb2xzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVGl0bGU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVGl0bGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5Db250cm9scztcbiAgICAgICAgICAgIH0gZWxzZSB7IC8vIENvbnRyb2xzIHNjcmVlbiwgYW55IGtleSBjYW4gcHJvY2VlZCB0byBnYW1lLlxuICAgICAgICAgICAgICAgIHRoaXMuaW5pdEdhbWUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdhbWVPdmVyKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdyJykge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRpdGxlO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbSA9IHRoaXMucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlKTsgLy8gUmVzdGFydCB0aXRsZSBtdXNpY1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUGF1c2VkKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdwJykge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBsYXlpbmc7XG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ2JnbV9nYW1lJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPbmx5IHByb2Nlc3MgZ2FtZSBpbnB1dHMgaWYgcGxheWluZ1xuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QbGF5aW5nICYmIHRoaXMuY3VycmVudFBpZWNlKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dMZWZ0JyAmJiBjdXJyZW50VGltZSAtIHRoaXMubGFzdE1vdmVUaW1lID4gdGhpcy5tb3ZlRGVsYXkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb3ZlUGllY2UoLTEsIDApKSB0aGlzLnBsYXlTb3VuZCgnc2Z4X3JvdGF0ZScpOyAvLyBSZXVzZSByb3RhdGUgc291bmQgZm9yIG1vdmUsIG9yIGNyZWF0ZSBuZXdcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RNb3ZlVGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiBjdXJyZW50VGltZSAtIHRoaXMubGFzdE1vdmVUaW1lID4gdGhpcy5tb3ZlRGVsYXkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb3ZlUGllY2UoMSwgMCkpIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0TW92ZVRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyAmJiBjdXJyZW50VGltZSAtIHRoaXMubGFzdERyb3BLZXlUaW1lID4gdGhpcy5kcm9wS2V5RGVsYXkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb3ZlUGllY2UoMCwgMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJTb2Z0RHJvcEJsb2NrO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IDA7IC8vIFJlc2V0IGZhbGwgdGltZXIgb24gc29mdCBkcm9wXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMubGFzdERyb3BLZXlUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93VXAnICYmIGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0Um90YXRlVGltZSA+IHRoaXMucm90YXRlRGVsYXkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJvdGF0ZVBpZWNlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0Um90YXRlVGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICcgJykgeyAvLyBIYXJkIGRyb3BcbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBQcmV2ZW50IHBhZ2Ugc2Nyb2xsXG4gICAgICAgICAgICAgICAgdGhpcy5oYXJkRHJvcCgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJ2MnIHx8IGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAnc2hpZnQnKSB7IC8vIEhvbGQgcGllY2VcbiAgICAgICAgICAgICAgICB0aGlzLnN3YXBIb2xkUGllY2UoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdwJykgeyAvLyBQYXVzZVxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBhdXNlZDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3BTb3VuZCgnYmdtX2dhbWUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgLy8gU3RvcCBzb2Z0IGRyb3AgaWYga2V5IHJlbGVhc2VkLCBhbGxvd2luZyBub3JtYWwgZmFsbCBzcGVlZFxuICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyAmJiB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBsYXlpbmcpIHtcbiAgICAgICAgICAgIC8vIElmIHNvZnQgZHJvcCBpbmNyZWFzZWQgZmFsbCBzcGVlZCwgcmVzZXQgaXQgb3IgZW5zdXJlIG5vcm1hbCB1cGRhdGUgbG9naWMgdGFrZXMgb3Zlci5cbiAgICAgICAgICAgIC8vIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gcmVsaWVzIG9uIGxhc3RGYWxsVGltZSByZXNldCBmb3IgY29udGludW91cyBzb2Z0IGRyb3AuXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb3JlIFRldHJpcyBMb2dpY1xuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb24ocGllY2U6IFRldHJvbWlubywgb2Zmc2V0WDogbnVtYmVyLCBvZmZzZXRZOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDwgcGllY2Uuc2hhcGUubGVuZ3RoOyByb3crKykge1xuICAgICAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDwgcGllY2Uuc2hhcGVbcm93XS5sZW5ndGg7IGNvbCsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBpZWNlLnNoYXBlW3Jvd11bY29sXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdYID0gcGllY2UueCArIGNvbCArIG9mZnNldFg7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld1kgPSBwaWVjZS55ICsgcm93ICsgb2Zmc2V0WTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBib3VuZGFyaWVzXG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXdYIDwgMCB8fCBuZXdYID49IHRoaXMuYm9hcmRXaWR0aCB8fCBuZXdZID49IHRoaXMuYm9hcmRIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBDb2xsaXNpb24gd2l0aCB3YWxsIG9yIGZsb29yXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG5ld1kgPCAwKSBjb250aW51ZTsgLy8gQWxsb3cgcGllY2VzIHRvIGJlIGFib3ZlIHRoZSBib2FyZCwgZG9uJ3QgY2hlY2sgZ3JpZCBjb2xsaXNpb24gZm9yIHRoZXNlXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgY29sbGlzaW9uIHdpdGggZXhpc3RpbmcgYmxvY2tzXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbbmV3WV1bbmV3WF0gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGlzVmFsaWRNb3ZlKHBpZWNlOiBUZXRyb21pbm8sIG9mZnNldFg6IG51bWJlciwgb2Zmc2V0WTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIC8vIENyZWF0ZSBhIHRlbXBvcmFyeSBwaWVjZSBmb3IgY29sbGlzaW9uIGNoZWNrIGF0IHRoZSBwb3RlbnRpYWwgbmV3IHBvc2l0aW9uXG4gICAgICAgIGNvbnN0IHRlbXBQaWVjZSA9IHBpZWNlLmNsb25lKCk7XG4gICAgICAgIHRlbXBQaWVjZS54ICs9IG9mZnNldFg7XG4gICAgICAgIHRlbXBQaWVjZS55ICs9IG9mZnNldFk7XG5cbiAgICAgICAgLy8gQ2hlY2sgY29sbGlzaW9uIGZyb20gdGhlIHRlbXBQaWVjZSdzIG5ldyBwb3NpdGlvbiAob2Zmc2V0IHBhcmFtZXRlcnMgdG8gY2hlY2tDb2xsaXNpb24gYXJlIDAsMClcbiAgICAgICAgcmV0dXJuICF0aGlzLmNoZWNrQ29sbGlzaW9uKHRlbXBQaWVjZSwgMCwgMCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBtb3ZlUGllY2Uob2Zmc2V0WDogbnVtYmVyLCBvZmZzZXRZOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpZWNlICYmIHRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIG9mZnNldFgsIG9mZnNldFkpKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS54ICs9IG9mZnNldFg7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ICs9IG9mZnNldFk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByb3RhdGVQaWVjZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWVjZSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsUm90YXRpb24gPSB0aGlzLmN1cnJlbnRQaWVjZS5jdXJyZW50Um90YXRpb247XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsWCA9IHRoaXMuY3VycmVudFBpZWNlLng7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsWSA9IHRoaXMuY3VycmVudFBpZWNlLnk7XG5cbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2Uucm90YXRlKCk7XG5cbiAgICAgICAgLy8gU2ltcGxlIHdhbGwga2ljay9mbG9vciBraWNrIGZvciBiYXNpYyByb3RhdGlvblxuICAgICAgICBjb25zdCBraWNrVGVzdHMgPSBbXG4gICAgICAgICAgICBbMCwgMF0sICAgLy8gTm8ga2lja1xuICAgICAgICAgICAgWy0xLCAwXSwgIC8vIEtpY2sgbGVmdFxuICAgICAgICAgICAgWzEsIDBdLCAgIC8vIEtpY2sgcmlnaHRcbiAgICAgICAgICAgIFswLCAtMV0sICAvLyBLaWNrIHVwIChmb3IgY2VpbGluZylcbiAgICAgICAgICAgIFstMiwgMF0sICAvLyBEb3VibGUga2ljayBsZWZ0XG4gICAgICAgICAgICBbMiwgMF0gICAgLy8gRG91YmxlIGtpY2sgcmlnaHRcbiAgICAgICAgXTtcblxuICAgICAgICBmb3IgKGNvbnN0IFtreCwga3ldIG9mIGtpY2tUZXN0cykge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueCA9IG9yaWdpbmFsWCArIGt4O1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSA9IG9yaWdpbmFsWSArIGt5O1xuICAgICAgICAgICAgaWYgKHRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDApKSB7IC8vIENoZWNrIGlmIG5ldyBwb3NpdGlvbiAod2l0aCBraWNrKSBpcyB2YWxpZFxuICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBSb3RhdGlvbiBzdWNjZXNzZnVsIHdpdGgga2lja1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgbm8ga2ljayB3b3JrZWQsIHJldmVydCB0byBvcmlnaW5hbCBzdGF0ZVxuICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS5jdXJyZW50Um90YXRpb24gPSBvcmlnaW5hbFJvdGF0aW9uO1xuICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS54ID0gb3JpZ2luYWxYO1xuICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ID0gb3JpZ2luYWxZO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGFyZERyb3AoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGllY2UpIHJldHVybjtcblxuICAgICAgICBsZXQgZHJvcHBlZEJsb2NrcyA9IDA7XG4gICAgICAgIC8vIEtlZXAgbW92aW5nIGRvd24gYXMgbG9uZyBhcyB0aGUgbW92ZSBpcyB2YWxpZFxuICAgICAgICB3aGlsZSAodGhpcy5pc1ZhbGlkTW92ZSh0aGlzLmN1cnJlbnRQaWVjZSwgMCwgMSkpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnkrKztcbiAgICAgICAgICAgIGRyb3BwZWRCbG9ja3MrKztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjb3JlICs9IGRyb3BwZWRCbG9ja3MgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJIYXJkRHJvcEJsb2NrO1xuICAgICAgICB0aGlzLmxvY2tQaWVjZSgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZHJvcFBpZWNlKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpZWNlKSByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDEpKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55Kys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvY2tQaWVjZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2NrUGllY2UoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGllY2UpIHJldHVybjtcblxuICAgICAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCB0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZS5sZW5ndGg7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjb2wgPSAwOyBjb2wgPCB0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZVtyb3ddLmxlbmd0aDsgY29sKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50UGllY2Uuc2hhcGVbcm93XVtjb2xdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRYID0gdGhpcy5jdXJyZW50UGllY2UueCArIGNvbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ3JpZFkgPSB0aGlzLmN1cnJlbnRQaWVjZS55ICsgcm93O1xuICAgICAgICAgICAgICAgICAgICBpZiAoZ3JpZFkgPj0gMCAmJiBncmlkWSA8IHRoaXMuYm9hcmRIZWlnaHQgJiYgZ3JpZFggPj0gMCAmJiBncmlkWCA8IHRoaXMuYm9hcmRXaWR0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmlkW2dyaWRZXVtncmlkWF0gPSB0aGlzLmN1cnJlbnRQaWVjZS5pZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2Ryb3AnKTtcbiAgICAgICAgdGhpcy5jbGVhckxpbmVzKCk7XG4gICAgICAgIHRoaXMubmV3UGllY2UoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNsZWFyTGluZXMoKTogdm9pZCB7XG4gICAgICAgIGxldCBsaW5lc0NsZWFyZWRUaGlzVHVybiA9IDA7XG4gICAgICAgIGZvciAobGV0IHJvdyA9IHRoaXMuYm9hcmRIZWlnaHQgLSAxOyByb3cgPj0gMDsgcm93LS0pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcm93XS5ldmVyeShjZWxsID0+IGNlbGwgIT09IDApKSB7XG4gICAgICAgICAgICAgICAgbGluZXNDbGVhcmVkVGhpc1R1cm4rKztcbiAgICAgICAgICAgICAgICB0aGlzLmdyaWQuc3BsaWNlKHJvdywgMSk7IC8vIFJlbW92ZSB0aGUgZnVsbCBsaW5lXG4gICAgICAgICAgICAgICAgdGhpcy5ncmlkLnVuc2hpZnQoQXJyYXkodGhpcy5ib2FyZFdpZHRoKS5maWxsKDApKTsgLy8gQWRkIGEgbmV3IGVtcHR5IGxpbmUgYXQgdGhlIHRvcFxuICAgICAgICAgICAgICAgIHJvdysrOyAvLyBDaGVjayB0aGUgbmV3IGxpbmUgYXQgdGhpcyByb3cgaW5kZXgsIGFzIGFsbCBsaW5lcyBtb3ZlZCBkb3duXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGluZXNDbGVhcmVkVGhpc1R1cm4gPiAwKSB7XG4gICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2NsZWFyJyk7XG4gICAgICAgICAgICB0aGlzLmxpbmVzQ2xlYXJlZCArPSBsaW5lc0NsZWFyZWRUaGlzVHVybjtcbiAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gbGluZXNDbGVhcmVkVGhpc1R1cm4gKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJMaW5lICogdGhpcy5sZXZlbDsgLy8gU2NvcmUgYmFzZWQgb24gbGV2ZWxcbiAgICAgICAgICAgIHRoaXMuY2hlY2tMZXZlbFVwKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNoZWNrTGV2ZWxVcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMubGluZXNDbGVhcmVkID49IHRoaXMubGV2ZWwgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubGV2ZWxVcExpbmVDb3VudCkge1xuICAgICAgICAgICAgdGhpcy5sZXZlbCsrO1xuICAgICAgICAgICAgdGhpcy5mYWxsU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmxldmVsVXBTcGVlZE11bHRpcGxpZXI7IC8vIE1ha2UgaXQgZmFzdGVyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgTGV2ZWwgVXAhIExldmVsOiAke3RoaXMubGV2ZWx9LCBGYWxsIFNwZWVkOiAke3RoaXMuZmFsbFNwZWVkLnRvRml4ZWQoMil9bXNgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc3dhcEhvbGRQaWVjZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWVjZSB8fCAhdGhpcy5jYW5Td2FwSG9sZCkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7IC8vIFVzZSByb3RhdGUgc291bmQgZm9yIHN3YXAgZm9yIG5vd1xuXG4gICAgICAgIGNvbnN0IHRlbXBQaWVjZSA9IHRoaXMuY3VycmVudFBpZWNlO1xuICAgICAgICBpZiAodGhpcy5ob2xkUGllY2UpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlID0gdGhpcy5ob2xkUGllY2UuY2xvbmUoKTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnggPSBNYXRoLmZsb29yKHRoaXMuYm9hcmRXaWR0aCAvIDIpICsgdGhpcy5jdXJyZW50UGllY2Uuc3Bhd25PZmZzZXRYO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSA9IHRoaXMuY3VycmVudFBpZWNlLnNwYXduT2Zmc2V0WTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubmV3UGllY2UoKTsgLy8gR2V0IG5leHQgcGllY2UgaWYgbm8gaG9sZCBwaWVjZSB5ZXRcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmhvbGRQaWVjZSA9IHRlbXBQaWVjZS5jbG9uZSgpO1xuICAgICAgICAvLyBSZXNldCBob2xkIHBpZWNlIHJvdGF0aW9uIGFuZCBwb3NpdGlvbiBmb3IgZGlzcGxheVxuICAgICAgICB0aGlzLmhvbGRQaWVjZS5jdXJyZW50Um90YXRpb24gPSAwO1xuICAgICAgICB0aGlzLmhvbGRQaWVjZS54ID0gMDtcbiAgICAgICAgdGhpcy5ob2xkUGllY2UueSA9IDA7XG5cbiAgICAgICAgdGhpcy5jYW5Td2FwSG9sZCA9IGZhbHNlOyAvLyBDYW4gb25seSBzd2FwIG9uY2UgcGVyIHBpZWNlIGRyb3BcbiAgICB9XG5cbiAgICAvLyBSZW5kZXJpbmcgSGVscGVyIEZ1bmN0aW9uc1xuICAgIHByaXZhdGUgZHJhd0Jsb2NrKHg6IG51bWJlciwgeTogbnVtYmVyLCBibG9ja1R5cGU6IG51bWJlciwgYWxwaGE6IG51bWJlciA9IDEpOiB2b2lkIHtcbiAgICAgICAgaWYgKGJsb2NrVHlwZSA9PT0gMCkgcmV0dXJuOyAvLyBEb24ndCBkcmF3IGVtcHR5IGJsb2Nrc1xuXG4gICAgICAgIGNvbnN0IHRleHR1cmVDb25maWcgPSB0aGlzLmNvbmZpZy50ZXRyb21pbm9lcy5maW5kKHQgPT4gdC5pZCA9PT0gYmxvY2tUeXBlKTtcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRleHR1cmVDb25maWcgPyB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KHRleHR1cmVDb25maWcudGV4dHVyZU5hbWUpIDogdW5kZWZpbmVkO1xuXG4gICAgICAgIHRoaXMuY3R4LnNhdmUoKTtcbiAgICAgICAgdGhpcy5jdHguZ2xvYmFsQWxwaGEgPSBhbHBoYTtcblxuICAgICAgICBpZiAodGV4dHVyZSkge1xuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRleHR1cmUsIHgsIHksIHRoaXMuYmxvY2tTaXplLCB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBGYWxsYmFjayBpZiB0ZXh0dXJlIG5vdCBmb3VuZFxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNjY2MnO1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoeCwgeSwgdGhpcy5ibG9ja1NpemUsIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyM2NjYnO1xuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh4LCB5LCB0aGlzLmJsb2NrU2l6ZSwgdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICAvLyBNb2RpZmllZCBkcmF3UGllY2UgdG8gYWNjZXB0IGFuIG9wdGlvbmFsIGJhc2VYIGFuZCBiYXNlWSBmb3IgZHJhd2luZyBvcmlnaW5cbiAgICBwcml2YXRlIGRyYXdQaWVjZShwaWVjZTogVGV0cm9taW5vLCBvZmZzZXRYOiBudW1iZXIsIG9mZnNldFk6IG51bWJlciwgYWxwaGE6IG51bWJlciA9IDEsIFxuICAgICAgICAgICAgICAgICAgICAgIGJhc2VYOiBudW1iZXIgfCBudWxsID0gbnVsbCwgYmFzZVk6IG51bWJlciB8IG51bGwgPSBudWxsKTogdm9pZCB7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBlZmZlY3RpdmVCYXNlWCA9IGJhc2VYICE9PSBudWxsID8gYmFzZVggOiB0aGlzLmdhbWVCb2FyZFg7IC8vIERlZmF1bHQgdG8gZ2FtZSBib2FyZCBYXG4gICAgICAgIGNvbnN0IGVmZmVjdGl2ZUJhc2VZID0gYmFzZVkgIT09IG51bGwgPyBiYXNlWSA6IHRoaXMuZ2FtZUJvYXJkWTsgLy8gRGVmYXVsdCB0byBnYW1lIGJvYXJkIFlcblxuICAgICAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCBwaWVjZS5zaGFwZS5sZW5ndGg7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjb2wgPSAwOyBjb2wgPCBwaWVjZS5zaGFwZVtyb3ddLmxlbmd0aDsgY29sKyspIHtcbiAgICAgICAgICAgICAgICBpZiAocGllY2Uuc2hhcGVbcm93XVtjb2xdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHBpZWNlLnggYW5kIHBpZWNlLnkgYXJlIHRoZSBwaWVjZSdzIGNvb3JkaW5hdGVzIHJlbGF0aXZlIHRvIGl0cyBiYXNlLlxuICAgICAgICAgICAgICAgICAgICAvLyBvZmZzZXRYIGFuZCBvZmZzZXRZIGFyZSBhZGRpdGlvbmFsIG9mZnNldHMgKGUuZy4sIGZvciBjZW50ZXJpbmcgd2l0aGluIGEgcGFuZWwpLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBibG9ja1ggPSBlZmZlY3RpdmVCYXNlWCArIChwaWVjZS54ICsgY29sICsgb2Zmc2V0WCkgKiB0aGlzLmJsb2NrU2l6ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmxvY2tZID0gZWZmZWN0aXZlQmFzZVkgKyAocGllY2UueSArIHJvdyArIG9mZnNldFkpICogdGhpcy5ibG9ja1NpemU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd0Jsb2NrKGJsb2NrWCwgYmxvY2tZLCBwaWVjZS5pZCwgYWxwaGEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZHJhd0dyaWQoKTogdm9pZCB7XG4gICAgICAgIC8vIERyYXcgZXhpc3RpbmcgYmxvY2tzXG4gICAgICAgIGZvciAobGV0IHJvdyA9IDA7IHJvdyA8IHRoaXMuYm9hcmRIZWlnaHQ7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjb2wgPSAwOyBjb2wgPCB0aGlzLmJvYXJkV2lkdGg7IGNvbCsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ3JpZFtyb3ddW2NvbF0gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmxvY2tYID0gdGhpcy5nYW1lQm9hcmRYICsgY29sICogdGhpcy5ibG9ja1NpemU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrWSA9IHRoaXMuZ2FtZUJvYXJkWSArIHJvdyAqIHRoaXMuYmxvY2tTaXplO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdCbG9jayhibG9ja1gsIGJsb2NrWSwgdGhpcy5ncmlkW3Jvd11bY29sXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRHJhdyBncmlkIGxpbmVzXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJvYXJkQm9yZGVyQ29sb3I7XG4gICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDE7XG4gICAgICAgIGZvciAobGV0IHJvdyA9IDA7IHJvdyA8PSB0aGlzLmJvYXJkSGVpZ2h0OyByb3crKykge1xuICAgICAgICAgICAgdGhpcy5jdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICB0aGlzLmN0eC5tb3ZlVG8odGhpcy5nYW1lQm9hcmRYLCB0aGlzLmdhbWVCb2FyZFkgKyByb3cgKiB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lVG8odGhpcy5nYW1lQm9hcmRYICsgdGhpcy5ib2FyZFdpZHRoICogdGhpcy5ibG9ja1NpemUsIHRoaXMuZ2FtZUJvYXJkWSArIHJvdyAqIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZSgpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGNvbCA9IDA7IGNvbCA8PSB0aGlzLmJvYXJkV2lkdGg7IGNvbCsrKSB7XG4gICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIHRoaXMuY3R4Lm1vdmVUbyh0aGlzLmdhbWVCb2FyZFggKyBjb2wgKiB0aGlzLmJsb2NrU2l6ZSwgdGhpcy5nYW1lQm9hcmRZKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVUbyh0aGlzLmdhbWVCb2FyZFggKyBjb2wgKiB0aGlzLmJsb2NrU2l6ZSwgdGhpcy5nYW1lQm9hcmRZICsgdGhpcy5ib2FyZEhlaWdodCAqIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZSgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIERyYXcgYSB0aGlja2VyIGJvcmRlciBhcm91bmQgdGhlIG1haW4gYm9hcmRcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMztcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh0aGlzLmdhbWVCb2FyZFgsIHRoaXMuZ2FtZUJvYXJkWSwgdGhpcy5ib2FyZFdpZHRoICogdGhpcy5ibG9ja1NpemUsIHRoaXMuYm9hcmRIZWlnaHQgKiB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkcmF3VUkoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzO1xuICAgICAgICBjb25zdCB0ZXh0cyA9IHRoaXMuY29uZmlnLnRleHRzO1xuICAgICAgICBjb25zdCBQQU5FTF9MQUJFTF9IRUlHSFRfT0ZGU0VUID0gNTA7IC8vIFZlcnRpY2FsIG9mZnNldCBmcm9tIHBhbmVsJ3MgdG9wIHdoZXJlIHRoZSBwaWVjZSBkaXNwbGF5IGFyZWEgYmVnaW5zXG5cbiAgICAgICAgY29uc3QgcGFuZWxJbWFnZSA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQoJ2ZyYW1lX3BhbmVsJyk7XG5cbiAgICAgICAgLy8gRHJhdyBIb2xkIHBhbmVsXG4gICAgICAgIGNvbnN0IGhvbGRYID0gc2V0dGluZ3MuaG9sZFBhbmVsT2Zmc2V0WDtcbiAgICAgICAgY29uc3QgaG9sZFkgPSBzZXR0aW5ncy5ob2xkUGFuZWxPZmZzZXRZO1xuICAgICAgICBpZiAocGFuZWxJbWFnZSkgdGhpcy5jdHguZHJhd0ltYWdlKHBhbmVsSW1hZ2UsIGhvbGRYLCBob2xkWSwgc2V0dGluZ3MucGFuZWxXaWR0aCwgc2V0dGluZ3MucGFuZWxIZWlnaHQpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmhvbGRMYWJlbCwgaG9sZFggKyBzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiwgaG9sZFkgKyAyMCwgc2V0dGluZ3MudGV4dENvbG9yLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgaWYgKHRoaXMuaG9sZFBpZWNlKSB7XG4gICAgICAgICAgICBjb25zdCBwaWVjZVNoYXBlV2lkdGggPSB0aGlzLmhvbGRQaWVjZS5zaGFwZVswXS5sZW5ndGg7XG4gICAgICAgICAgICBjb25zdCBwaWVjZVNoYXBlSGVpZ2h0ID0gdGhpcy5ob2xkUGllY2Uuc2hhcGUubGVuZ3RoO1xuICAgICAgICAgICAgY29uc3QgcGllY2VEaXNwbGF5V2lkdGggPSBwaWVjZVNoYXBlV2lkdGggKiB0aGlzLmJsb2NrU2l6ZTtcbiAgICAgICAgICAgIGNvbnN0IHBpZWNlRGlzcGxheUhlaWdodCA9IHBpZWNlU2hhcGVIZWlnaHQgKiB0aGlzLmJsb2NrU2l6ZTtcblxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGNlbnRlcmluZyBvZmZzZXRzIHdpdGhpbiB0aGUgYXZhaWxhYmxlIHBhbmVsIGNvbnRlbnQgYXJlYVxuICAgICAgICAgICAgY29uc3QgY29udGVudFdpZHRoID0gc2V0dGluZ3MucGFuZWxXaWR0aDtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnRIZWlnaHQgPSBzZXR0aW5ncy5wYW5lbEhlaWdodCAtIFBBTkVMX0xBQkVMX0hFSUdIVF9PRkZTRVQ7XG5cbiAgICAgICAgICAgIGNvbnN0IGJsb2NrT2Zmc2V0WCA9IE1hdGguZmxvb3IoKChjb250ZW50V2lkdGggLSBwaWVjZURpc3BsYXlXaWR0aCkgLyAyKSAvIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIGNvbnN0IGJsb2NrT2Zmc2V0WSA9IE1hdGguZmxvb3IoKChjb250ZW50SGVpZ2h0IC0gcGllY2VEaXNwbGF5SGVpZ2h0KSAvIDIpIC8gdGhpcy5ibG9ja1NpemUpO1xuXG4gICAgICAgICAgICAvLyBEcmF3IHRoZSBwaWVjZSB3aXRoIHRoZSBwYW5lbCdzIGNvbnRlbnQgYXJlYSBvcmlnaW4gYXMgaXRzIGJhc2UuXG4gICAgICAgICAgICAvLyBob2xkUGllY2UueCBhbmQgaG9sZFBpZWNlLnkgYXJlIDAsIHNvIG9ubHkgYmxvY2tPZmZzZXRYL1kgYXJlIHVzZWQgZm9yIGNlbnRlcmluZy5cbiAgICAgICAgICAgIHRoaXMuZHJhd1BpZWNlKHRoaXMuaG9sZFBpZWNlLCBibG9ja09mZnNldFgsIGJsb2NrT2Zmc2V0WSwgMSwgaG9sZFgsIGhvbGRZICsgUEFORUxfTEFCRUxfSEVJR0hUX09GRlNFVCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEcmF3IE5leHQgcGFuZWxcbiAgICAgICAgY29uc3QgbmV4dFggPSBzZXR0aW5ncy5uZXh0UGFuZWxPZmZzZXRYO1xuICAgICAgICBjb25zdCBuZXh0WSA9IHNldHRpbmdzLm5leHRQYW5lbE9mZnNldFk7XG4gICAgICAgIGlmIChwYW5lbEltYWdlKSB0aGlzLmN0eC5kcmF3SW1hZ2UocGFuZWxJbWFnZSwgbmV4dFgsIG5leHRZLCBzZXR0aW5ncy5wYW5lbFdpZHRoLCBzZXR0aW5ncy5wYW5lbEhlaWdodCk7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMubmV4dExhYmVsLCBuZXh0WCArIHNldHRpbmdzLnBhbmVsV2lkdGggLyAyLCBuZXh0WSArIDIwLCBzZXR0aW5ncy50ZXh0Q29sb3IsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICBpZiAodGhpcy5uZXh0UGllY2UpIHtcbiAgICAgICAgICAgIGNvbnN0IHBpZWNlU2hhcGVXaWR0aCA9IHRoaXMubmV4dFBpZWNlLnNoYXBlWzBdLmxlbmd0aDtcbiAgICAgICAgICAgIGNvbnN0IHBpZWNlU2hhcGVIZWlnaHQgPSB0aGlzLm5leHRQaWVjZS5zaGFwZS5sZW5ndGg7XG4gICAgICAgICAgICBjb25zdCBwaWVjZURpc3BsYXlXaWR0aCA9IHBpZWNlU2hhcGVXaWR0aCAqIHRoaXMuYmxvY2tTaXplO1xuICAgICAgICAgICAgY29uc3QgcGllY2VEaXNwbGF5SGVpZ2h0ID0gcGllY2VTaGFwZUhlaWdodCAqIHRoaXMuYmxvY2tTaXplO1xuXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgY2VudGVyaW5nIG9mZnNldHMgd2l0aGluIHRoZSBhdmFpbGFibGUgcGFuZWwgY29udGVudCBhcmVhXG4gICAgICAgICAgICBjb25zdCBjb250ZW50V2lkdGggPSBzZXR0aW5ncy5wYW5lbFdpZHRoO1xuICAgICAgICAgICAgY29uc3QgY29udGVudEhlaWdodCA9IHNldHRpbmdzLnBhbmVsSGVpZ2h0IC0gUEFORUxfTEFCRUxfSEVJR0hUX09GRlNFVDtcblxuICAgICAgICAgICAgY29uc3QgYmxvY2tPZmZzZXRYID0gTWF0aC5mbG9vcigoKGNvbnRlbnRXaWR0aCAtIHBpZWNlRGlzcGxheVdpZHRoKSAvIDIpIC8gdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgY29uc3QgYmxvY2tPZmZzZXRZID0gTWF0aC5mbG9vcigoKGNvbnRlbnRIZWlnaHQgLSBwaWVjZURpc3BsYXlIZWlnaHQpIC8gMikgLyB0aGlzLmJsb2NrU2l6ZSk7XG5cbiAgICAgICAgICAgIC8vIERyYXcgdGhlIHBpZWNlIHdpdGggdGhlIHBhbmVsJ3MgY29udGVudCBhcmVhIG9yaWdpbiBhcyBpdHMgYmFzZS5cbiAgICAgICAgICAgIC8vIG5leHRQaWVjZS54IGFuZCBuZXh0UGllY2UueSBhcmUgMCwgc28gb25seSBibG9ja09mZnNldFgvWSBhcmUgdXNlZCBmb3IgY2VudGVyaW5nLlxuICAgICAgICAgICAgdGhpcy5kcmF3UGllY2UodGhpcy5uZXh0UGllY2UsIGJsb2NrT2Zmc2V0WCwgYmxvY2tPZmZzZXRZLCAxLCBuZXh0WCwgbmV4dFkgKyBQQU5FTF9MQUJFTF9IRUlHSFRfT0ZGU0VUKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERyYXcgSW5mbyBwYW5lbCAoU2NvcmUsIExldmVsLCBMaW5lcylcbiAgICAgICAgY29uc3QgaW5mb1ggPSBzZXR0aW5ncy5pbmZvUGFuZWxPZmZzZXRYO1xuICAgICAgICBjb25zdCBpbmZvWSA9IHNldHRpbmdzLmluZm9QYW5lbE9mZnNldFk7XG4gICAgICAgIGlmIChwYW5lbEltYWdlKSB0aGlzLmN0eC5kcmF3SW1hZ2UocGFuZWxJbWFnZSwgaW5mb1gsIGluZm9ZLCBzZXR0aW5ncy5wYW5lbFdpZHRoLCBzZXR0aW5ncy5wYW5lbEhlaWdodCAqIDEuNSk7IC8vIFRhbGxlciBwYW5lbCBmb3IgaW5mb1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLnNjb3JlTGFiZWwgKyB0aGlzLnNjb3JlLCBpbmZvWCArIHNldHRpbmdzLnBhbmVsV2lkdGggLyAyLCBpbmZvWSArIDMwLCBzZXR0aW5ncy50ZXh0Q29sb3IsICcyNHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmxldmVsTGFiZWwgKyB0aGlzLmxldmVsLCBpbmZvWCArIHNldHRpbmdzLnBhbmVsV2lkdGggLyAyLCBpbmZvWSArIDcwLCBzZXR0aW5ncy50ZXh0Q29sb3IsICcyNHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmxpbmVzTGFiZWwgKyB0aGlzLmxpbmVzQ2xlYXJlZCwgaW5mb1ggKyBzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiwgaW5mb1kgKyAxMTAsIHNldHRpbmdzLnRleHRDb2xvciwgJzI0cHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkcmF3VGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBmb250OiBzdHJpbmcsIGFsaWduOiBDYW52YXNUZXh0QWxpZ24gPSAnbGVmdCcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3I7XG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBmb250O1xuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBhbGlnbjtcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dCwgeCwgeSk7XG4gICAgfVxuXG4gICAgLy8gU3RhdGUtc3BlY2lmaWMgcmVuZGVyaW5nXG4gICAgcHJpdmF0ZSByZW5kZXJUaXRsZVNjcmVlbigpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdGV4dHMgPSB0aGlzLmNvbmZpZy50ZXh0cztcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy50aXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzLCAnY3lhbicsICc2MHB4IFwiUHJlc3MgU3RhcnQgMlBcIiwgY3Vyc2l2ZScsICdjZW50ZXInKTtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5wcmVzc0FueUtleSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTAsICd3aGl0ZScsICcyNHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVuZGVyQ29udHJvbHNTY3JlZW4oKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRleHRzID0gdGhpcy5jb25maWcudGV4dHM7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNUaXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyA0LCAnbGltZScsICc0OHB4IFwiUHJlc3MgU3RhcnQgMlBcIiwgY3Vyc2l2ZScsICdjZW50ZXInKTtcbiAgICAgICAgbGV0IHlPZmZzZXQgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzICsgMzA7XG4gICAgICAgIGNvbnN0IGxpbmVIZWlnaHQgPSA0MDtcblxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzTW92ZUxlZnQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3doaXRlJywgJzIwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHlPZmZzZXQgKz0gbGluZUhlaWdodDtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc01vdmVSaWdodCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAnd2hpdGUnLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgeU9mZnNldCArPSBsaW5lSGVpZ2h0O1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzU29mdERyb3AsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3doaXRlJywgJzIwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHlPZmZzZXQgKz0gbGluZUhlaWdodDtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc0hhcmREcm9wLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd3aGl0ZScsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB5T2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNSb3RhdGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3doaXRlJywgJzIwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHlPZmZzZXQgKz0gbGluZUhlaWdodDtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc0hvbGQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3doaXRlJywgJzIwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHlPZmZzZXQgKz0gbGluZUhlaWdodDtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc1BhdXNlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd3aGl0ZScsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB5T2Zmc2V0ICs9IGxpbmVIZWlnaHQgKyAzMDtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5zdGFydFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3llbGxvdycsICcyNHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVuZGVyUGxheWluZ1NjcmVlbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5kcmF3R3JpZCgpO1xuICAgICAgICB0aGlzLmRyYXdVSSgpO1xuXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRQaWVjZSkge1xuICAgICAgICAgICAgLy8gRHJhdyBnaG9zdCBwaWVjZVxuICAgICAgICAgICAgY29uc3QgZ2hvc3RQaWVjZSA9IHRoaXMuY3VycmVudFBpZWNlLmNsb25lKCk7XG4gICAgICAgICAgICB3aGlsZSAodGhpcy5pc1ZhbGlkTW92ZShnaG9zdFBpZWNlLCAwLCAxKSkgeyAvLyBTaW11bGF0ZSBmYWxsIGZvciBnaG9zdCBwaWVjZVxuICAgICAgICAgICAgICAgIGdob3N0UGllY2UueSsrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRHJhdyB0aGUgZ2hvc3QgcGllY2UgdXNpbmcgaXRzIGNhbGN1bGF0ZWQgZmluYWwgcG9zaXRpb25cbiAgICAgICAgICAgIHRoaXMuZHJhd1BpZWNlKGdob3N0UGllY2UsIDAsIDAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5naG9zdFBpZWNlQWxwaGEsIHRoaXMuZ2FtZUJvYXJkWCwgdGhpcy5nYW1lQm9hcmRZKTtcblxuICAgICAgICAgICAgLy8gRHJhdyBhY3R1YWwgY3VycmVudCBwaWVjZSBhdCBpdHMgY3VycmVudCBwb3NpdGlvbiAobm8gYWRkaXRpb25hbCBvZmZzZXQpXG4gICAgICAgICAgICB0aGlzLmRyYXdQaWVjZSh0aGlzLmN1cnJlbnRQaWVjZSwgMCwgMCwgMSwgdGhpcy5nYW1lQm9hcmRYLCB0aGlzLmdhbWVCb2FyZFkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW5kZXJHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJQbGF5aW5nU2NyZWVuKCk7IC8vIFNob3cgdGhlIGZpbmFsIGJvYXJkXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNyknO1xuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcblxuICAgICAgICBjb25zdCB0ZXh0cyA9IHRoaXMuY29uZmlnLnRleHRzO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmdhbWVPdmVyVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMywgJ3JlZCcsICc2MHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmdhbWVPdmVyU2NvcmUgKyB0aGlzLnNjb3JlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICd3aGl0ZScsICczMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLnByZXNzUlRvUmVzdGFydCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNjAsICd5ZWxsb3cnLCAnMjRweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICB9XG5cbiAgICAvLyBBdWRpbyBQbGF5YmFja1xuICAgIHByaXZhdGUgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hc3NldHMuc291bmRzLmdldChuYW1lKTtcbiAgICAgICAgaWYgKGF1ZGlvKSB7XG4gICAgICAgICAgICAvLyBTdG9wIGV4aXN0aW5nIEJHTSBpZiBhIG5ldyBvbmUgaXMgcGxheWluZyBvciBsb29waW5nXG4gICAgICAgICAgICBpZiAobG9vcCAmJiB0aGlzLmN1cnJlbnRCZ20gJiYgdGhpcy5jdXJyZW50QmdtICE9PSBhdWRpbykge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbS5wYXVzZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbS5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZvciBTRlgsIGNsb25lIHRvIGFsbG93IG92ZXJsYXBwaW5nXG4gICAgICAgICAgICBjb25zdCBzb3VuZFRvUGxheSA9IGxvb3AgPyBhdWRpbyA6IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XG4gICAgICAgICAgICBzb3VuZFRvUGxheS5sb29wID0gbG9vcDtcbiAgICAgICAgICAgIHNvdW5kVG9QbGF5LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTsgLy8gQ2F0Y2ggUHJvbWlzZSByZWplY3Rpb25cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGxvb3ApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRCZ20gPSBzb3VuZFRvUGxheTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzb3VuZFRvUGxheTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kICcke25hbWV9JyBub3QgZm91bmQuYCk7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdG9wU291bmQobmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hc3NldHMuc291bmRzLmdldChuYW1lKTtcbiAgICAgICAgaWYgKGF1ZGlvKSB7XG4gICAgICAgICAgICBhdWRpby5wYXVzZSgpO1xuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEJnbSA9PT0gYXVkaW8pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRCZ20gPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdG9wQWxsU291bmRzKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHMuZm9yRWFjaChhdWRpbyA9PiB7XG4gICAgICAgICAgICBhdWRpby5wYXVzZSgpO1xuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gbnVsbDtcbiAgICB9XG59XG5cbi8vIEdsb2JhbCBpbml0aWFsaXphdGlvblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBuZXcgVGV0cmlzR2FtZSgnZ2FtZUNhbnZhcycpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgVGV0cmlzR2FtZTonLCBlKTtcbiAgICAgICAgYWxlcnQoJ1x1QUM4Q1x1Qzc4NCBcdUNEMDhcdUFFMzBcdUQ2NTRcdUM1RDAgXHVDMkU0XHVEMzI4XHVENTg4XHVDMkI1XHVCMkM4XHVCMkU0OiAnICsgZS5tZXNzYWdlKTtcbiAgICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQWlGQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBTEMsU0FBQUE7QUFBQSxHQUFBO0FBU0wsTUFBTSxVQUFVO0FBQUEsRUFXWixZQUFZLFFBQXlCO0FBQ2pDLFNBQUssS0FBSyxPQUFPO0FBQ2pCLFNBQUssT0FBTyxPQUFPO0FBQ25CLFNBQUssU0FBUyxPQUFPO0FBQ3JCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssSUFBSTtBQUNULFNB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
