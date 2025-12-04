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
  isValidMove(piece, offsetX, offsetY, targetY = piece.y) {
    const tempPiece = piece.clone();
    tempPiece.x += offsetX;
    tempPiece.y = targetY + offsetY;
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
      const pieceDisplayX = holdX + (settings.panelWidth - this.holdPiece.shape[0].length * this.blockSize) / 2;
      const pieceDisplayY = holdY + 50;
      this.drawPiece(this.holdPiece, Math.floor((pieceDisplayX - this.gameBoardX) / this.blockSize), Math.floor((pieceDisplayY - this.gameBoardY) / this.blockSize), 1);
    }
    const nextX = settings.nextPanelOffsetX;
    const nextY = settings.nextPanelOffsetY;
    if (panelImage) this.ctx.drawImage(panelImage, nextX, nextY, settings.panelWidth, settings.panelHeight);
    this.drawText(texts.nextLabel, nextX + settings.panelWidth / 2, nextY + 20, settings.textColor, "20px Arial", "center");
    if (this.nextPiece) {
      const pieceDisplayX = nextX + (settings.panelWidth - this.nextPiece.shape[0].length * this.blockSize) / 2;
      const pieceDisplayY = nextY + 50;
      this.drawPiece(this.nextPiece, Math.floor((pieceDisplayX - this.gameBoardX) / this.blockSize), Math.floor((pieceDisplayY - this.gameBoardY) / this.blockSize), 1);
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
      let ghostY = this.currentPiece.y;
      while (this.isValidMove(this.currentPiece, 0, 1, ghostY)) {
        ghostY++;
      }
      this.drawPiece(this.currentPiece, 0, ghostY, this.config.gameSettings.ghostPieceAlpha);
      this.drawPiece(this.currentPiece, 0, this.currentPiece.y, 1);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHBhdGg6IHN0cmluZztcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU291bmREYXRhQ29uZmlnIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcbiAgICB2b2x1bWU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFRldHJvbWlub0NvbmZpZyB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGlkOiBudW1iZXI7IC8vIDEtNywgY29ycmVzcG9uZHMgdG8gZ3JpZCB2YWx1ZSBhbmQgdGV4dHVyZU5hbWVcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nO1xuICAgIHNwYXduT2Zmc2V0WDogbnVtYmVyOyAvLyBJbml0aWFsIHNwYXduIFggb2Zmc2V0IGZvciBwcm9wZXIgY2VudGVyaW5nXG4gICAgc3Bhd25PZmZzZXRZOiBudW1iZXI7IC8vIEluaXRpYWwgc3Bhd24gWSBvZmZzZXQsIHR5cGljYWxseSAwIG9yIC0xXG4gICAgc2hhcGVzOiBudW1iZXJbXVtdW107IC8vIEFycmF5IG9mIHJvdGF0aW9uIHN0YXRlc1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XG4gICAgZ2FtZVNldHRpbmdzOiB7XG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XG4gICAgICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xuICAgICAgICBncmlkV2lkdGg6IG51bWJlcjtcbiAgICAgICAgZ3JpZEhlaWdodDogbnVtYmVyO1xuICAgICAgICBibG9ja1NpemU6IG51bWJlcjtcbiAgICAgICAgZ2FtZUJvYXJkT2Zmc2V0WDogbnVtYmVyO1xuICAgICAgICBnYW1lQm9hcmRPZmZzZXRZOiBudW1iZXI7XG4gICAgICAgIGluaXRpYWxGYWxsU3BlZWQ6IG51bWJlcjsgLy8gbXMgcGVyIGdyaWQgY2VsbFxuICAgICAgICBsZXZlbFVwTGluZUNvdW50OiBudW1iZXI7XG4gICAgICAgIGxldmVsVXBTcGVlZE11bHRpcGxpZXI6IG51bWJlcjsgLy8gZS5nLiwgMC45IGZvciAxMCUgZmFzdGVyXG4gICAgICAgIHNjb3JlUGVyTGluZTogbnVtYmVyO1xuICAgICAgICBzY29yZVBlckhhcmREcm9wQmxvY2s6IG51bWJlcjtcbiAgICAgICAgc2NvcmVQZXJTb2Z0RHJvcEJsb2NrOiBudW1iZXI7XG4gICAgICAgIGhvbGRQYW5lbE9mZnNldFg6IG51bWJlcjtcbiAgICAgICAgaG9sZFBhbmVsT2Zmc2V0WTogbnVtYmVyO1xuICAgICAgICBuZXh0UGFuZWxPZmZzZXRYOiBudW1iZXI7XG4gICAgICAgIG5leHRQYW5lbE9mZnNldFk6IG51bWJlcjtcbiAgICAgICAgaW5mb1BhbmVsT2Zmc2V0WDogbnVtYmVyO1xuICAgICAgICBpbmZvUGFuZWxPZmZzZXRZOiBudW1iZXI7XG4gICAgICAgIHBhbmVsV2lkdGg6IG51bWJlcjtcbiAgICAgICAgcGFuZWxIZWlnaHQ6IG51bWJlcjtcbiAgICAgICAgdGV4dENvbG9yOiBzdHJpbmc7XG4gICAgICAgIGJvYXJkQm9yZGVyQ29sb3I6IHN0cmluZztcbiAgICAgICAgcGFuZWxCb3JkZXJDb2xvcjogc3RyaW5nO1xuICAgICAgICBnaG9zdFBpZWNlQWxwaGE6IG51bWJlcjtcbiAgICB9O1xuICAgIHRldHJvbWlub2VzOiBUZXRyb21pbm9Db25maWdbXTtcbiAgICB0ZXh0czoge1xuICAgICAgICB0aXRsZTogc3RyaW5nO1xuICAgICAgICBwcmVzc0FueUtleTogc3RyaW5nO1xuICAgICAgICBjb250cm9sc1RpdGxlOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzTW92ZUxlZnQ6IHN0cmluZztcbiAgICAgICAgY29udHJvbHNNb3ZlUmlnaHQ6IHN0cmluZztcbiAgICAgICAgY29udHJvbHNTb2Z0RHJvcDogc3RyaW5nO1xuICAgICAgICBjb250cm9sc0hhcmREcm9wOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzUm90YXRlOiBzdHJpbmc7XG4gICAgICAgIGNvbnRyb2xzSG9sZDogc3RyaW5nO1xuICAgICAgICBjb250cm9sc1BhdXNlOiBzdHJpbmc7XG4gICAgICAgIHN0YXJ0VGV4dDogc3RyaW5nO1xuICAgICAgICBzY29yZUxhYmVsOiBzdHJpbmc7XG4gICAgICAgIGxldmVsTGFiZWw6IHN0cmluZztcbiAgICAgICAgbGluZXNMYWJlbDogc3RyaW5nO1xuICAgICAgICBuZXh0TGFiZWw6IHN0cmluZztcbiAgICAgICAgaG9sZExhYmVsOiBzdHJpbmc7XG4gICAgICAgIGdhbWVPdmVyVGl0bGU6IHN0cmluZztcbiAgICAgICAgZ2FtZU92ZXJTY29yZTogc3RyaW5nO1xuICAgICAgICBwcmVzc1JUb1Jlc3RhcnQ6IHN0cmluZztcbiAgICAgICAgcGF1c2VkVGV4dDogc3RyaW5nO1xuICAgIH07XG4gICAgYXNzZXRzOiB7XG4gICAgICAgIGltYWdlczogSW1hZ2VEYXRhQ29uZmlnW107XG4gICAgICAgIHNvdW5kczogU291bmREYXRhQ29uZmlnW107XG4gICAgfTtcbn1cblxuLy8gRW51bSBmb3IgR2FtZVN0YXRlXG5lbnVtIEdhbWVTdGF0ZSB7XG4gICAgVGl0bGUsXG4gICAgQ29udHJvbHMsXG4gICAgUGxheWluZyxcbiAgICBHYW1lT3ZlcixcbiAgICBQYXVzZWRcbn1cblxuLy8gVGV0cm9taW5vIGNsYXNzXG5jbGFzcyBUZXRyb21pbm8ge1xuICAgIGlkOiBudW1iZXI7IC8vIFVuaXF1ZSBJRCBmb3IgdGV4dHVyZSBsb29rdXAgYW5kIGdyaWQgdmFsdWVcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgc2hhcGVzOiBudW1iZXJbXVtdW107IC8vIEFycmF5IG9mIHJvdGF0aW9uIHN0YXRlcywgZWFjaCBzdGF0ZSBpcyBhIDJEIGFycmF5IChtYXRyaXgpXG4gICAgY3VycmVudFJvdGF0aW9uOiBudW1iZXI7XG4gICAgeDogbnVtYmVyO1xuICAgIHk6IG51bWJlcjtcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBLZXkgdG8gbG9va3VwIGltYWdlIGluIGFzc2V0cy5pbWFnZXNcbiAgICBzcGF3bk9mZnNldFg6IG51bWJlcjtcbiAgICBzcGF3bk9mZnNldFk6IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZzogVGV0cm9taW5vQ29uZmlnKSB7XG4gICAgICAgIHRoaXMuaWQgPSBjb25maWcuaWQ7XG4gICAgICAgIHRoaXMubmFtZSA9IGNvbmZpZy5uYW1lO1xuICAgICAgICB0aGlzLnNoYXBlcyA9IGNvbmZpZy5zaGFwZXM7XG4gICAgICAgIHRoaXMuY3VycmVudFJvdGF0aW9uID0gMDtcbiAgICAgICAgdGhpcy54ID0gMDtcbiAgICAgICAgdGhpcy55ID0gMDtcbiAgICAgICAgdGhpcy50ZXh0dXJlTmFtZSA9IGNvbmZpZy50ZXh0dXJlTmFtZTtcbiAgICAgICAgdGhpcy5zcGF3bk9mZnNldFggPSBjb25maWcuc3Bhd25PZmZzZXRYO1xuICAgICAgICB0aGlzLnNwYXduT2Zmc2V0WSA9IGNvbmZpZy5zcGF3bk9mZnNldFk7XG4gICAgfVxuXG4gICAgZ2V0IHNoYXBlKCk6IG51bWJlcltdW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5zaGFwZXNbdGhpcy5jdXJyZW50Um90YXRpb25dO1xuICAgIH1cblxuICAgIHJvdGF0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5jdXJyZW50Um90YXRpb24gPSAodGhpcy5jdXJyZW50Um90YXRpb24gKyAxKSAlIHRoaXMuc2hhcGVzLmxlbmd0aDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGVzIGEgZGVlcCBjb3B5IG9mIHRoZSB0ZXRyb21pbm8sIHVzZWZ1bCBmb3Igcm90YXRpb24gY2hlY2tzIG9yIGdob3N0IHBpZWNlXG4gICAgY2xvbmUoKTogVGV0cm9taW5vIHtcbiAgICAgICAgY29uc3QgY2xvbmVkID0gbmV3IFRldHJvbWlubyh7XG4gICAgICAgICAgICBpZDogdGhpcy5pZCxcbiAgICAgICAgICAgIG5hbWU6IHRoaXMubmFtZSxcbiAgICAgICAgICAgIHNoYXBlczogdGhpcy5zaGFwZXMsIC8vIHNoYXBlcyBhcnJheSBjYW4gYmUgc2hhbGxvdyBjb3BpZWQgYXMgaXRzIGNvbnRlbnQgaXMgaW1tdXRhYmxlXG4gICAgICAgICAgICB0ZXh0dXJlTmFtZTogdGhpcy50ZXh0dXJlTmFtZSxcbiAgICAgICAgICAgIHNwYXduT2Zmc2V0WDogdGhpcy5zcGF3bk9mZnNldFgsXG4gICAgICAgICAgICBzcGF3bk9mZnNldFk6IHRoaXMuc3Bhd25PZmZzZXRZLFxuICAgICAgICB9KTtcbiAgICAgICAgY2xvbmVkLmN1cnJlbnRSb3RhdGlvbiA9IHRoaXMuY3VycmVudFJvdGF0aW9uO1xuICAgICAgICBjbG9uZWQueCA9IHRoaXMueDtcbiAgICAgICAgY2xvbmVkLnkgPSB0aGlzLnk7XG4gICAgICAgIHJldHVybiBjbG9uZWQ7XG4gICAgfVxufVxuXG4vLyBNYWluIEdhbWUgQ2xhc3NcbmNsYXNzIFRldHJpc0dhbWUge1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZztcbiAgICBwcml2YXRlIGFzc2V0czoge1xuICAgICAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+O1xuICAgICAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xuICAgIH0gPSB7IGltYWdlczogbmV3IE1hcCgpLCBzb3VuZHM6IG5ldyBNYXAoKSB9O1xuXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5UaXRsZTtcbiAgICBwcml2YXRlIGxhc3RUaW1lc3RhbXA6IG51bWJlciA9IDA7XG5cbiAgICAvLyBHYW1lIHZhcmlhYmxlczpcbiAgICBwcml2YXRlIGdyaWQ6IG51bWJlcltdW107IC8vIDAgZm9yIGVtcHR5LCAxLTcgZm9yIGRpZmZlcmVudCBibG9jayB0eXBlcyAodGV0cm9taW5vIElEcylcbiAgICBwcml2YXRlIGFsbFRldHJvbWlub1RlbXBsYXRlczogVGV0cm9taW5vW10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnJlbnRQaWVjZTogVGV0cm9taW5vIHwgbnVsbCA9IG51bGw7XG4gICAgcHJpdmF0ZSBuZXh0UGllY2U6IFRldHJvbWlubyB8IG51bGwgPSBudWxsO1xuICAgIHByaXZhdGUgaG9sZFBpZWNlOiBUZXRyb21pbm8gfCBudWxsID0gbnVsbDtcbiAgICBwcml2YXRlIGNhblN3YXBIb2xkOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHRldHJvbWlub1F1ZXVlOiBUZXRyb21pbm9bXSA9IFtdOyAvLyA3LWJhZyBnZW5lcmF0aW9uXG5cbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgbGV2ZWw6IG51bWJlciA9IDE7XG4gICAgcHJpdmF0ZSBsaW5lc0NsZWFyZWQ6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBmYWxsU3BlZWQ6IG51bWJlcjsgLy8gaW4gbXMgcGVyIGdyaWQgY2VsbFxuICAgIHByaXZhdGUgbGFzdEZhbGxUaW1lOiBudW1iZXIgPSAwO1xuXG4gICAgLy8gSW5wdXQgZGVib3VuY2UvcmF0ZSBsaW1pdGluZ1xuICAgIHByaXZhdGUgbGFzdE1vdmVUaW1lOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgbW92ZURlbGF5OiBudW1iZXIgPSAxMDA7IC8vIG1zIGZvciBob3Jpem9udGFsIG1vdmVtZW50XG4gICAgcHJpdmF0ZSBsYXN0Um90YXRlVGltZTogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIHJvdGF0ZURlbGF5OiBudW1iZXIgPSAxNTA7IC8vIG1zIGZvciByb3RhdGlvblxuICAgIHByaXZhdGUgbGFzdERyb3BLZXlUaW1lOiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgZHJvcEtleURlbGF5OiBudW1iZXIgPSA1MDsgLy8gbXMgZm9yIHNvZnQgZHJvcCBrZXlcblxuICAgIC8vIEdhbWUgZGltZW5zaW9ucyAoZGVyaXZlZCBmcm9tIGNvbmZpZylcbiAgICBwcml2YXRlIGJvYXJkV2lkdGg6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBib2FyZEhlaWdodDogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIGJsb2NrU2l6ZTogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIGdhbWVCb2FyZFg6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSBnYW1lQm9hcmRZOiBudW1iZXIgPSAwO1xuXG4gICAgLy8gQXVkaW8gdHJhY2tpbmdcbiAgICBwcml2YXRlIGN1cnJlbnRCZ206IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcbiAgICAgICAgdGhpcy5jdHguaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7IC8vIEZvciBjcmlzcCBwaXhlbCBhcnQgaWYgZGVzaXJlZFxuXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuZ3JpZCA9IFtdOyAvLyBXaWxsIGJlIGluaXRpYWxpemVkIGluIHJlc2V0R2FtZVxuICAgICAgICB0aGlzLmZhbGxTcGVlZCA9IDA7IC8vIFdpbGwgYmUgaW5pdGlhbGl6ZWQgZnJvbSBjb25maWdcblxuICAgICAgICB0aGlzLmluaXQoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XG4gICAgICAgIHRoaXMuc2V0dXBHYW1lRGltZW5zaW9ucygpO1xuXG4gICAgICAgIC8vIFN0YXJ0IHRpdGxlIG11c2ljXG4gICAgICAgIHRoaXMuY3VycmVudEJnbSA9IHRoaXMucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlKTtcblxuICAgICAgICB0aGlzLmdhbWVMb29wKDApOyAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZyBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWc6JywgZXJyb3IpO1xuICAgICAgICAgICAgYWxlcnQoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi4nKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nQ29uZmlnID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0NvbmZpZy5wYXRoO1xuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLmltYWdlcy5zZXQoaW1nQ29uZmlnLm5hbWUsIGltZyk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdDb25maWcucGF0aH1gKTtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdDb25maWcucGF0aH1gKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzbmRDb25maWcgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc25kQ29uZmlnLnBhdGgpO1xuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNuZENvbmZpZy52b2x1bWU7XG4gICAgICAgICAgICAgICAgLy8gUHJlbG9hZCBjYW4gZmFpbCBzaWxlbnRseSwgc28gd2UganVzdCByZXNvbHZlLlxuICAgICAgICAgICAgICAgIC8vIEFjdHVhbCBwbGF5YmFjayB3aWxsIGhhbmRsZSBlcnJvcnMuXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuc291bmRzLnNldChzbmRDb25maWcubmFtZSwgYXVkaW8pO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBbGwgYXNzZXRzIGxvYWRlZC4nKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIHNvbWUgYXNzZXRzOicsIGVycm9yKTtcbiAgICAgICAgICAgIGFsZXJ0KCdGYWlsZWQgdG8gbG9hZCBzb21lIGdhbWUgYXNzZXRzLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLicpO1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldHVwR2FtZURpbWVuc2lvbnMoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzO1xuICAgICAgICB0aGlzLmJvYXJkV2lkdGggPSBzZXR0aW5ncy5ncmlkV2lkdGg7XG4gICAgICAgIHRoaXMuYm9hcmRIZWlnaHQgPSBzZXR0aW5ncy5ncmlkSGVpZ2h0O1xuICAgICAgICB0aGlzLmJsb2NrU2l6ZSA9IHNldHRpbmdzLmJsb2NrU2l6ZTtcbiAgICAgICAgdGhpcy5nYW1lQm9hcmRYID0gc2V0dGluZ3MuZ2FtZUJvYXJkT2Zmc2V0WDtcbiAgICAgICAgdGhpcy5nYW1lQm9hcmRZID0gc2V0dGluZ3MuZ2FtZUJvYXJkT2Zmc2V0WTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluaXRHYW1lKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFsbFRldHJvbWlub1RlbXBsYXRlcyA9IHRoaXMuY29uZmlnLnRldHJvbWlub2VzLm1hcChcbiAgICAgICAgICAgIGNvbmZpZyA9PiBuZXcgVGV0cm9taW5vKGNvbmZpZylcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUGxheWluZztcbiAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gdGhpcy5wbGF5U291bmQoJ2JnbV9nYW1lJywgdHJ1ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZ3JpZCA9IEFycmF5KHRoaXMuYm9hcmRIZWlnaHQpLmZpbGwobnVsbCkubWFwKCgpID0+IEFycmF5KHRoaXMuYm9hcmRXaWR0aCkuZmlsbCgwKSk7XG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xuICAgICAgICB0aGlzLmxldmVsID0gMTtcbiAgICAgICAgdGhpcy5saW5lc0NsZWFyZWQgPSAwO1xuICAgICAgICB0aGlzLmZhbGxTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5pbml0aWFsRmFsbFNwZWVkO1xuICAgICAgICB0aGlzLmxhc3RGYWxsVGltZSA9IDA7XG4gICAgICAgIHRoaXMuY3VycmVudFBpZWNlID0gbnVsbDtcbiAgICAgICAgdGhpcy5uZXh0UGllY2UgPSBudWxsO1xuICAgICAgICB0aGlzLmhvbGRQaWVjZSA9IG51bGw7XG4gICAgICAgIHRoaXMuY2FuU3dhcEhvbGQgPSB0cnVlO1xuICAgICAgICB0aGlzLnRldHJvbWlub1F1ZXVlID0gW107XG4gICAgICAgIHRoaXMuZmlsbFRldHJvbWlub1F1ZXVlKCk7XG4gICAgICAgIHRoaXMubmV3UGllY2UoKTtcbiAgICB9XG5cbiAgICAvLyBGaWxscyB0aGUgcXVldWUgd2l0aCBhIFwiNy1iYWdcIiBvZiB0ZXRyb21pbm9lc1xuICAgIHByaXZhdGUgZmlsbFRldHJvbWlub1F1ZXVlKCk6IHZvaWQge1xuICAgICAgICBjb25zdCBiYWcgPSBbLi4udGhpcy5hbGxUZXRyb21pbm9UZW1wbGF0ZXNdO1xuICAgICAgICAvLyBTaHVmZmxlIHRoZSBiYWdcbiAgICAgICAgZm9yIChsZXQgaSA9IGJhZy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XG4gICAgICAgICAgICBbYmFnW2ldLCBiYWdbal1dID0gW2JhZ1tqXSwgYmFnW2ldXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRldHJvbWlub1F1ZXVlLnB1c2goLi4uYmFnKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG5ld1BpZWNlKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy50ZXRyb21pbm9RdWV1ZS5sZW5ndGggPCA3KSB7IC8vIFJlZmlsbCBpZiBsZXNzIHRoYW4gYSBmdWxsIGJhZ1xuICAgICAgICAgICAgdGhpcy5maWxsVGV0cm9taW5vUXVldWUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5uZXh0UGllY2UpIHtcbiAgICAgICAgICAgIHRoaXMubmV4dFBpZWNlID0gdGhpcy50ZXRyb21pbm9RdWV1ZS5zaGlmdCgpIS5jbG9uZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2UgPSB0aGlzLm5leHRQaWVjZTtcbiAgICAgICAgdGhpcy5uZXh0UGllY2UgPSB0aGlzLnRldHJvbWlub1F1ZXVlLnNoaWZ0KCkhLmNsb25lKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpZWNlKSB7XG4gICAgICAgICAgICAvLyBSZXNldCBwb3NpdGlvbiB0byBzcGF3biBwb2ludFxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueCA9IE1hdGguZmxvb3IodGhpcy5ib2FyZFdpZHRoIC8gMikgKyB0aGlzLmN1cnJlbnRQaWVjZS5zcGF3bk9mZnNldFg7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ID0gdGhpcy5jdXJyZW50UGllY2Uuc3Bhd25PZmZzZXRZO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UuY3VycmVudFJvdGF0aW9uID0gMDsgLy8gUmVzZXQgcm90YXRpb24gZm9yIG5ldyBwaWVjZVxuXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDApKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2FuU3dhcEhvbGQgPSB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdhbWVPdmVyO1xuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2dhbWVvdmVyJyk7XG4gICAgICAgIHRoaXMuc3RvcFNvdW5kKCdiZ21fZ2FtZScpO1xuICAgICAgICB0aGlzLmN1cnJlbnRCZ20gPSBudWxsO1xuICAgIH1cblxuICAgIC8vIE1haW4gZ2FtZSBsb29wXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSB0aW1lc3RhbXAgLSB0aGlzLmxhc3RUaW1lc3RhbXA7XG4gICAgICAgIHRoaXMubGFzdFRpbWVzdGFtcCA9IHRpbWVzdGFtcDtcblxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xuICAgICAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMubGFzdEZhbGxUaW1lICs9IGRlbHRhVGltZTtcbiAgICAgICAgICAgIGlmICh0aGlzLmxhc3RGYWxsVGltZSA+PSB0aGlzLmZhbGxTcGVlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZHJvcFBpZWNlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0RmFsbFRpbWUgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW5kZXIoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcblxuICAgICAgICAvLyBEcmF3IGJhY2tncm91bmQgZmlyc3RcbiAgICAgICAgY29uc3QgYmdJbWFnZSA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5UaXRsZSB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkNvbnRyb2xzID8gJ3RpdGxlX3NjcmVlbl9iZycgOiAnZ2FtZV9iZycpO1xuICAgICAgICBpZiAoYmdJbWFnZSkge1xuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJnSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyMxYTFhMmUnOyAvLyBGYWxsYmFjayBkYXJrIHNjaS1maSBjb2xvclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UaXRsZTpcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclRpdGxlU2NyZWVuKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5Db250cm9sczpcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlckNvbnRyb2xzU2NyZWVuKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QbGF5aW5nOlxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUGF1c2VkOiAvLyBSZW5kZXIgcGxheWluZyBzY3JlZW4gZm9yIHBhdXNlZCBzdGF0ZSB0b28sIHdpdGggb3ZlcmxheVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyUGxheWluZ1NjcmVlbigpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5jb25maWcudGV4dHMucGF1c2VkVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyLCAnd2hpdGUnLCAnNDhweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HYW1lT3ZlcjpcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlckdhbWVPdmVyU2NyZWVuKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJbnB1dCBIYW5kbGluZ1xuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRpdGxlIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuQ29udHJvbHMpIHtcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkgPT09ICdFc2NhcGUnICYmIHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuQ29udHJvbHMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5UaXRsZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5UaXRsZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkNvbnRyb2xzO1xuICAgICAgICAgICAgfSBlbHNlIHsgLy8gQ29udHJvbHMgc2NyZWVuLCBhbnkga2V5IGNhbiBwcm9jZWVkIHRvIGdhbWUuXG4gICAgICAgICAgICAgICAgdGhpcy5pbml0R2FtZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR2FtZU92ZXIpIHtcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJ3InKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVGl0bGU7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gdGhpcy5wbGF5U291bmQoJ2JnbV90aXRsZScsIHRydWUpOyAvLyBSZXN0YXJ0IHRpdGxlIG11c2ljXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QYXVzZWQpIHtcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJ3AnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUGxheWluZztcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnYmdtX2dhbWUnLCB0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBnYW1lIGlucHV0cyBpZiBwbGF5aW5nXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBsYXlpbmcgJiYgdGhpcy5jdXJyZW50UGllY2UpIHtcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkgPT09ICdBcnJvd0xlZnQnICYmIGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0TW92ZVRpbWUgPiB0aGlzLm1vdmVEZWxheSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1vdmVQaWVjZSgtMSwgMCkpIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7IC8vIFJldXNlIHJvdGF0ZSBzb3VuZCBmb3IgbW92ZSwgb3IgY3JlYXRlIG5ld1xuICAgICAgICAgICAgICAgIHRoaXMubGFzdE1vdmVUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93UmlnaHQnICYmIGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0TW92ZVRpbWUgPiB0aGlzLm1vdmVEZWxheSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1vdmVQaWVjZSgxLCAwKSkgdGhpcy5wbGF5U291bmQoJ3NmeF9yb3RhdGUnKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RNb3ZlVGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICdBcnJvd0Rvd24nICYmIGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RHJvcEtleVRpbWUgPiB0aGlzLmRyb3BLZXlEZWxheSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1vdmVQaWVjZSgwLCAxKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zY29yZVBlclNvZnREcm9wQmxvY2s7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGFzdEZhbGxUaW1lID0gMDsgLy8gUmVzZXQgZmFsbCB0aW1lciBvbiBzb2Z0IGRyb3BcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0RHJvcEtleVRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dVcCcgJiYgY3VycmVudFRpbWUgLSB0aGlzLmxhc3RSb3RhdGVUaW1lID4gdGhpcy5yb3RhdGVEZWxheSkge1xuICAgICAgICAgICAgICAgIHRoaXMucm90YXRlUGllY2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RSb3RhdGVUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJyAnKSB7IC8vIEhhcmQgZHJvcFxuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgcGFnZSBzY3JvbGxcbiAgICAgICAgICAgICAgICB0aGlzLmhhcmREcm9wKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAnYycgfHwgZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdzaGlmdCcpIHsgLy8gSG9sZCBwaWVjZVxuICAgICAgICAgICAgICAgIHRoaXMuc3dhcEhvbGRQaWVjZSgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJ3AnKSB7IC8vIFBhdXNlXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUGF1c2VkO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RvcFNvdW5kKCdiZ21fZ2FtZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgICAgICAvLyBTdG9wIHNvZnQgZHJvcCBpZiBrZXkgcmVsZWFzZWQsIGFsbG93aW5nIG5vcm1hbCBmYWxsIHNwZWVkXG4gICAgICAgIGlmIChldmVudC5rZXkgPT09ICdBcnJvd0Rvd24nICYmIHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUGxheWluZykge1xuICAgICAgICAgICAgLy8gSWYgc29mdCBkcm9wIGluY3JlYXNlZCBmYWxsIHNwZWVkLCByZXNldCBpdCBvciBlbnN1cmUgbm9ybWFsIHVwZGF0ZSBsb2dpYyB0YWtlcyBvdmVyLlxuICAgICAgICAgICAgLy8gQ3VycmVudCBpbXBsZW1lbnRhdGlvbiByZWxpZXMgb24gbGFzdEZhbGxUaW1lIHJlc2V0IGZvciBjb250aW51b3VzIHNvZnQgZHJvcC5cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvcmUgVGV0cmlzIExvZ2ljXG4gICAgcHJpdmF0ZSBjaGVja0NvbGxpc2lvbihwaWVjZTogVGV0cm9taW5vLCBvZmZzZXRYOiBudW1iZXIsIG9mZnNldFk6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCBwaWVjZS5zaGFwZS5sZW5ndGg7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjb2wgPSAwOyBjb2wgPCBwaWVjZS5zaGFwZVtyb3ddLmxlbmd0aDsgY29sKyspIHtcbiAgICAgICAgICAgICAgICBpZiAocGllY2Uuc2hhcGVbcm93XVtjb2xdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld1ggPSBwaWVjZS54ICsgY29sICsgb2Zmc2V0WDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3WSA9IHBpZWNlLnkgKyByb3cgKyBvZmZzZXRZO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGJvdW5kYXJpZXNcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5ld1ggPCAwIHx8IG5ld1ggPj0gdGhpcy5ib2FyZFdpZHRoIHx8IG5ld1kgPj0gdGhpcy5ib2FyZEhlaWdodCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIENvbGxpc2lvbiB3aXRoIHdhbGwgb3IgZmxvb3JcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAobmV3WSA8IDApIGNvbnRpbnVlOyAvLyBBbGxvdyBwaWVjZXMgdG8gYmUgYWJvdmUgdGhlIGJvYXJkXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgY29sbGlzaW9uIHdpdGggZXhpc3RpbmcgYmxvY2tzXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbbmV3WV1bbmV3WF0gIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGlzVmFsaWRNb3ZlKHBpZWNlOiBUZXRyb21pbm8sIG9mZnNldFg6IG51bWJlciwgb2Zmc2V0WTogbnVtYmVyLCB0YXJnZXRZOiBudW1iZXIgPSBwaWVjZS55KTogYm9vbGVhbiB7XG4gICAgICAgIC8vIENyZWF0ZSBhIHRlbXBvcmFyeSBwaWVjZSBmb3IgY29sbGlzaW9uIGNoZWNrXG4gICAgICAgIGNvbnN0IHRlbXBQaWVjZSA9IHBpZWNlLmNsb25lKCk7XG4gICAgICAgIHRlbXBQaWVjZS54ICs9IG9mZnNldFg7XG4gICAgICAgIHRlbXBQaWVjZS55ID0gdGFyZ2V0WSArIG9mZnNldFk7XG5cbiAgICAgICAgcmV0dXJuICF0aGlzLmNoZWNrQ29sbGlzaW9uKHRlbXBQaWVjZSwgMCwgMCk7IC8vIENoZWNrIGNvbGxpc2lvbiBmcm9tIHRoZSB0ZW1wUGllY2UncyBuZXcgcG9zaXRpb25cbiAgICB9XG5cbiAgICBwcml2YXRlIG1vdmVQaWVjZShvZmZzZXRYOiBudW1iZXIsIG9mZnNldFk6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodGhpcy5jdXJyZW50UGllY2UgJiYgdGhpcy5pc1ZhbGlkTW92ZSh0aGlzLmN1cnJlbnRQaWVjZSwgb2Zmc2V0WCwgb2Zmc2V0WSkpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnggKz0gb2Zmc2V0WDtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnkgKz0gb2Zmc2V0WTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJvdGF0ZVBpZWNlKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpZWNlKSByZXR1cm47XG5cbiAgICAgICAgY29uc3Qgb3JpZ2luYWxSb3RhdGlvbiA9IHRoaXMuY3VycmVudFBpZWNlLmN1cnJlbnRSb3RhdGlvbjtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxYID0gdGhpcy5jdXJyZW50UGllY2UueDtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxZID0gdGhpcy5jdXJyZW50UGllY2UueTtcblxuICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS5yb3RhdGUoKTtcblxuICAgICAgICAvLyBTaW1wbGUgd2FsbCBraWNrL2Zsb29yIGtpY2sgZm9yIGJhc2ljIHJvdGF0aW9uXG4gICAgICAgIGNvbnN0IGtpY2tUZXN0cyA9IFtcbiAgICAgICAgICAgIFswLCAwXSwgICAvLyBObyBraWNrXG4gICAgICAgICAgICBbLTEsIDBdLCAgLy8gS2ljayBsZWZ0XG4gICAgICAgICAgICBbMSwgMF0sICAgLy8gS2ljayByaWdodFxuICAgICAgICAgICAgWzAsIC0xXSwgIC8vIEtpY2sgdXAgKGZvciBjZWlsaW5nKVxuICAgICAgICAgICAgWy0yLCAwXSwgIC8vIERvdWJsZSBraWNrIGxlZnRcbiAgICAgICAgICAgIFsyLCAwXSAgICAvLyBEb3VibGUga2ljayByaWdodFxuICAgICAgICBdO1xuXG4gICAgICAgIGZvciAoY29uc3QgW2t4LCBreV0gb2Yga2lja1Rlc3RzKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS54ID0gb3JpZ2luYWxYICsga3g7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55ID0gb3JpZ2luYWxZICsga3k7XG4gICAgICAgICAgICBpZiAodGhpcy5pc1ZhbGlkTW92ZSh0aGlzLmN1cnJlbnRQaWVjZSwgMCwgMCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X3JvdGF0ZScpO1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gUm90YXRpb24gc3VjY2Vzc2Z1bCB3aXRoIGtpY2tcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIG5vIGtpY2sgd29ya2VkLCByZXZlcnQgdG8gb3JpZ2luYWwgc3RhdGVcbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2UuY3VycmVudFJvdGF0aW9uID0gb3JpZ2luYWxSb3RhdGlvbjtcbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueCA9IG9yaWdpbmFsWDtcbiAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSA9IG9yaWdpbmFsWTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhcmREcm9wKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpZWNlKSByZXR1cm47XG5cbiAgICAgICAgbGV0IGRyb3BwZWRCbG9ja3MgPSAwO1xuICAgICAgICB3aGlsZSAodGhpcy5pc1ZhbGlkTW92ZSh0aGlzLmN1cnJlbnRQaWVjZSwgMCwgMSkpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnkrKztcbiAgICAgICAgICAgIGRyb3BwZWRCbG9ja3MrKztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjb3JlICs9IGRyb3BwZWRCbG9ja3MgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJIYXJkRHJvcEJsb2NrO1xuICAgICAgICB0aGlzLmxvY2tQaWVjZSgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZHJvcFBpZWNlKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3VycmVudFBpZWNlKSByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuaXNWYWxpZE1vdmUodGhpcy5jdXJyZW50UGllY2UsIDAsIDEpKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRQaWVjZS55Kys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvY2tQaWVjZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2NrUGllY2UoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jdXJyZW50UGllY2UpIHJldHVybjtcblxuICAgICAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCB0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZS5sZW5ndGg7IHJvdysrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjb2wgPSAwOyBjb2wgPCB0aGlzLmN1cnJlbnRQaWVjZS5zaGFwZVtyb3ddLmxlbmd0aDsgY29sKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50UGllY2Uuc2hhcGVbcm93XVtjb2xdICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRYID0gdGhpcy5jdXJyZW50UGllY2UueCArIGNvbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ3JpZFkgPSB0aGlzLmN1cnJlbnRQaWVjZS55ICsgcm93O1xuICAgICAgICAgICAgICAgICAgICBpZiAoZ3JpZFkgPj0gMCAmJiBncmlkWSA8IHRoaXMuYm9hcmRIZWlnaHQgJiYgZ3JpZFggPj0gMCAmJiBncmlkWCA8IHRoaXMuYm9hcmRXaWR0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmlkW2dyaWRZXVtncmlkWF0gPSB0aGlzLmN1cnJlbnRQaWVjZS5pZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2Ryb3AnKTtcbiAgICAgICAgdGhpcy5jbGVhckxpbmVzKCk7XG4gICAgICAgIHRoaXMubmV3UGllY2UoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNsZWFyTGluZXMoKTogdm9pZCB7XG4gICAgICAgIGxldCBsaW5lc0NsZWFyZWRUaGlzVHVybiA9IDA7XG4gICAgICAgIGZvciAobGV0IHJvdyA9IHRoaXMuYm9hcmRIZWlnaHQgLSAxOyByb3cgPj0gMDsgcm93LS0pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcm93XS5ldmVyeShjZWxsID0+IGNlbGwgIT09IDApKSB7XG4gICAgICAgICAgICAgICAgbGluZXNDbGVhcmVkVGhpc1R1cm4rKztcbiAgICAgICAgICAgICAgICB0aGlzLmdyaWQuc3BsaWNlKHJvdywgMSk7IC8vIFJlbW92ZSB0aGUgZnVsbCBsaW5lXG4gICAgICAgICAgICAgICAgdGhpcy5ncmlkLnVuc2hpZnQoQXJyYXkodGhpcy5ib2FyZFdpZHRoKS5maWxsKDApKTsgLy8gQWRkIGEgbmV3IGVtcHR5IGxpbmUgYXQgdGhlIHRvcFxuICAgICAgICAgICAgICAgIHJvdysrOyAvLyBDaGVjayB0aGUgbmV3IGxpbmUgYXQgdGhpcyByb3cgaW5kZXgsIGFzIGFsbCBsaW5lcyBtb3ZlZCBkb3duXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGluZXNDbGVhcmVkVGhpc1R1cm4gPiAwKSB7XG4gICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2NsZWFyJyk7XG4gICAgICAgICAgICB0aGlzLmxpbmVzQ2xlYXJlZCArPSBsaW5lc0NsZWFyZWRUaGlzVHVybjtcbiAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gbGluZXNDbGVhcmVkVGhpc1R1cm4gKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmVQZXJMaW5lICogdGhpcy5sZXZlbDsgLy8gU2NvcmUgYmFzZWQgb24gbGV2ZWxcbiAgICAgICAgICAgIHRoaXMuY2hlY2tMZXZlbFVwKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGNoZWNrTGV2ZWxVcCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMubGluZXNDbGVhcmVkID49IHRoaXMubGV2ZWwgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubGV2ZWxVcExpbmVDb3VudCkge1xuICAgICAgICAgICAgdGhpcy5sZXZlbCsrO1xuICAgICAgICAgICAgdGhpcy5mYWxsU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmxldmVsVXBTcGVlZE11bHRpcGxpZXI7IC8vIE1ha2UgaXQgZmFzdGVyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgTGV2ZWwgVXAhIExldmVsOiAke3RoaXMubGV2ZWx9LCBGYWxsIFNwZWVkOiAke3RoaXMuZmFsbFNwZWVkLnRvRml4ZWQoMil9bXNgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc3dhcEhvbGRQaWVjZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnRQaWVjZSB8fCAhdGhpcy5jYW5Td2FwSG9sZCkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfcm90YXRlJyk7IC8vIFVzZSByb3RhdGUgc291bmQgZm9yIHN3YXAgZm9yIG5vd1xuXG4gICAgICAgIGNvbnN0IHRlbXBQaWVjZSA9IHRoaXMuY3VycmVudFBpZWNlO1xuICAgICAgICBpZiAodGhpcy5ob2xkUGllY2UpIHtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlID0gdGhpcy5ob2xkUGllY2UuY2xvbmUoKTtcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFBpZWNlLnggPSBNYXRoLmZsb29yKHRoaXMuYm9hcmRXaWR0aCAvIDIpICsgdGhpcy5jdXJyZW50UGllY2Uuc3Bhd25PZmZzZXRYO1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGllY2UueSA9IHRoaXMuY3VycmVudFBpZWNlLnNwYXduT2Zmc2V0WTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubmV3UGllY2UoKTsgLy8gR2V0IG5leHQgcGllY2UgaWYgbm8gaG9sZCBwaWVjZSB5ZXRcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmhvbGRQaWVjZSA9IHRlbXBQaWVjZS5jbG9uZSgpO1xuICAgICAgICAvLyBSZXNldCBob2xkIHBpZWNlIHJvdGF0aW9uIGFuZCBwb3NpdGlvbiBmb3IgZGlzcGxheVxuICAgICAgICB0aGlzLmhvbGRQaWVjZS5jdXJyZW50Um90YXRpb24gPSAwO1xuICAgICAgICB0aGlzLmhvbGRQaWVjZS54ID0gMDtcbiAgICAgICAgdGhpcy5ob2xkUGllY2UueSA9IDA7XG5cbiAgICAgICAgdGhpcy5jYW5Td2FwSG9sZCA9IGZhbHNlOyAvLyBDYW4gb25seSBzd2FwIG9uY2UgcGVyIHBpZWNlIGRyb3BcbiAgICB9XG5cbiAgICAvLyBSZW5kZXJpbmcgSGVscGVyIEZ1bmN0aW9uc1xuICAgIHByaXZhdGUgZHJhd0Jsb2NrKHg6IG51bWJlciwgeTogbnVtYmVyLCBibG9ja1R5cGU6IG51bWJlciwgYWxwaGE6IG51bWJlciA9IDEpOiB2b2lkIHtcbiAgICAgICAgaWYgKGJsb2NrVHlwZSA9PT0gMCkgcmV0dXJuOyAvLyBEb24ndCBkcmF3IGVtcHR5IGJsb2Nrc1xuXG4gICAgICAgIGNvbnN0IHRleHR1cmVDb25maWcgPSB0aGlzLmNvbmZpZy50ZXRyb21pbm9lcy5maW5kKHQgPT4gdC5pZCA9PT0gYmxvY2tUeXBlKTtcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRleHR1cmVDb25maWcgPyB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KHRleHR1cmVDb25maWcudGV4dHVyZU5hbWUpIDogdW5kZWZpbmVkO1xuXG4gICAgICAgIHRoaXMuY3R4LnNhdmUoKTtcbiAgICAgICAgdGhpcy5jdHguZ2xvYmFsQWxwaGEgPSBhbHBoYTtcblxuICAgICAgICBpZiAodGV4dHVyZSkge1xuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRleHR1cmUsIHgsIHksIHRoaXMuYmxvY2tTaXplLCB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBGYWxsYmFjayBpZiB0ZXh0dXJlIG5vdCBmb3VuZFxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNjY2MnO1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoeCwgeSwgdGhpcy5ibG9ja1NpemUsIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyM2NjYnO1xuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh4LCB5LCB0aGlzLmJsb2NrU2l6ZSwgdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRyYXdQaWVjZShwaWVjZTogVGV0cm9taW5vLCBvZmZzZXRYOiBudW1iZXIsIG9mZnNldFk6IG51bWJlciwgYWxwaGE6IG51bWJlciA9IDEpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDwgcGllY2Uuc2hhcGUubGVuZ3RoOyByb3crKykge1xuICAgICAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDwgcGllY2Uuc2hhcGVbcm93XS5sZW5ndGg7IGNvbCsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBpZWNlLnNoYXBlW3Jvd11bY29sXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBibG9ja1ggPSB0aGlzLmdhbWVCb2FyZFggKyAocGllY2UueCArIGNvbCArIG9mZnNldFgpICogdGhpcy5ibG9ja1NpemU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrWSA9IHRoaXMuZ2FtZUJvYXJkWSArIChwaWVjZS55ICsgcm93ICsgb2Zmc2V0WSkgKiB0aGlzLmJsb2NrU2l6ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3QmxvY2soYmxvY2tYLCBibG9ja1ksIHBpZWNlLmlkLCBhbHBoYSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkcmF3R3JpZCgpOiB2b2lkIHtcbiAgICAgICAgLy8gRHJhdyBleGlzdGluZyBibG9ja3NcbiAgICAgICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDwgdGhpcy5ib2FyZEhlaWdodDsgcm93KyspIHtcbiAgICAgICAgICAgIGZvciAobGV0IGNvbCA9IDA7IGNvbCA8IHRoaXMuYm9hcmRXaWR0aDsgY29sKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ncmlkW3Jvd11bY29sXSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBibG9ja1ggPSB0aGlzLmdhbWVCb2FyZFggKyBjb2wgKiB0aGlzLmJsb2NrU2l6ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmxvY2tZID0gdGhpcy5nYW1lQm9hcmRZICsgcm93ICogdGhpcy5ibG9ja1NpemU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd0Jsb2NrKGJsb2NrWCwgYmxvY2tZLCB0aGlzLmdyaWRbcm93XVtjb2xdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEcmF3IGdyaWQgbGluZXNcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYm9hcmRCb3JkZXJDb2xvcjtcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMTtcbiAgICAgICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDw9IHRoaXMuYm9hcmRIZWlnaHQ7IHJvdysrKSB7XG4gICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIHRoaXMuY3R4Lm1vdmVUbyh0aGlzLmdhbWVCb2FyZFgsIHRoaXMuZ2FtZUJvYXJkWSArIHJvdyAqIHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVUbyh0aGlzLmdhbWVCb2FyZFggKyB0aGlzLmJvYXJkV2lkdGggKiB0aGlzLmJsb2NrU2l6ZSwgdGhpcy5nYW1lQm9hcmRZICsgcm93ICogdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlKCk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDw9IHRoaXMuYm9hcmRXaWR0aDsgY29sKyspIHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgdGhpcy5jdHgubW92ZVRvKHRoaXMuZ2FtZUJvYXJkWCArIGNvbCAqIHRoaXMuYmxvY2tTaXplLCB0aGlzLmdhbWVCb2FyZFkpO1xuICAgICAgICAgICAgdGhpcy5jdHgubGluZVRvKHRoaXMuZ2FtZUJvYXJkWCArIGNvbCAqIHRoaXMuYmxvY2tTaXplLCB0aGlzLmdhbWVCb2FyZFkgKyB0aGlzLmJvYXJkSGVpZ2h0ICogdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRHJhdyBhIHRoaWNrZXIgYm9yZGVyIGFyb3VuZCB0aGUgbWFpbiBib2FyZFxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAzO1xuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KHRoaXMuZ2FtZUJvYXJkWCwgdGhpcy5nYW1lQm9hcmRZLCB0aGlzLmJvYXJkV2lkdGggKiB0aGlzLmJsb2NrU2l6ZSwgdGhpcy5ib2FyZEhlaWdodCAqIHRoaXMuYmxvY2tTaXplKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRyYXdVSSgpOiB2b2lkIHtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3M7XG4gICAgICAgIGNvbnN0IHRleHRzID0gdGhpcy5jb25maWcudGV4dHM7XG5cbiAgICAgICAgY29uc3QgcGFuZWxJbWFnZSA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQoJ2ZyYW1lX3BhbmVsJyk7XG5cbiAgICAgICAgLy8gRHJhdyBIb2xkIHBhbmVsXG4gICAgICAgIGNvbnN0IGhvbGRYID0gc2V0dGluZ3MuaG9sZFBhbmVsT2Zmc2V0WDtcbiAgICAgICAgY29uc3QgaG9sZFkgPSBzZXR0aW5ncy5ob2xkUGFuZWxPZmZzZXRZO1xuICAgICAgICBpZiAocGFuZWxJbWFnZSkgdGhpcy5jdHguZHJhd0ltYWdlKHBhbmVsSW1hZ2UsIGhvbGRYLCBob2xkWSwgc2V0dGluZ3MucGFuZWxXaWR0aCwgc2V0dGluZ3MucGFuZWxIZWlnaHQpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmhvbGRMYWJlbCwgaG9sZFggKyBzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiwgaG9sZFkgKyAyMCwgc2V0dGluZ3MudGV4dENvbG9yLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgaWYgKHRoaXMuaG9sZFBpZWNlKSB7XG4gICAgICAgICAgICAvLyBDZW50ZXIgdGhlIGhlbGQgcGllY2UgaW4gdGhlIHBhbmVsXG4gICAgICAgICAgICBjb25zdCBwaWVjZURpc3BsYXlYID0gaG9sZFggKyAoc2V0dGluZ3MucGFuZWxXaWR0aCAtIHRoaXMuaG9sZFBpZWNlLnNoYXBlWzBdLmxlbmd0aCAqIHRoaXMuYmxvY2tTaXplKSAvIDI7XG4gICAgICAgICAgICBjb25zdCBwaWVjZURpc3BsYXlZID0gaG9sZFkgKyA1MDtcbiAgICAgICAgICAgIHRoaXMuZHJhd1BpZWNlKHRoaXMuaG9sZFBpZWNlLCBNYXRoLmZsb29yKChwaWVjZURpc3BsYXlYIC0gdGhpcy5nYW1lQm9hcmRYKSAvIHRoaXMuYmxvY2tTaXplKSwgTWF0aC5mbG9vcigocGllY2VEaXNwbGF5WSAtIHRoaXMuZ2FtZUJvYXJkWSkgLyB0aGlzLmJsb2NrU2l6ZSksIDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRHJhdyBOZXh0IHBhbmVsXG4gICAgICAgIGNvbnN0IG5leHRYID0gc2V0dGluZ3MubmV4dFBhbmVsT2Zmc2V0WDtcbiAgICAgICAgY29uc3QgbmV4dFkgPSBzZXR0aW5ncy5uZXh0UGFuZWxPZmZzZXRZO1xuICAgICAgICBpZiAocGFuZWxJbWFnZSkgdGhpcy5jdHguZHJhd0ltYWdlKHBhbmVsSW1hZ2UsIG5leHRYLCBuZXh0WSwgc2V0dGluZ3MucGFuZWxXaWR0aCwgc2V0dGluZ3MucGFuZWxIZWlnaHQpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLm5leHRMYWJlbCwgbmV4dFggKyBzZXR0aW5ncy5wYW5lbFdpZHRoIC8gMiwgbmV4dFkgKyAyMCwgc2V0dGluZ3MudGV4dENvbG9yLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgaWYgKHRoaXMubmV4dFBpZWNlKSB7XG4gICAgICAgICAgICBjb25zdCBwaWVjZURpc3BsYXlYID0gbmV4dFggKyAoc2V0dGluZ3MucGFuZWxXaWR0aCAtIHRoaXMubmV4dFBpZWNlLnNoYXBlWzBdLmxlbmd0aCAqIHRoaXMuYmxvY2tTaXplKSAvIDI7XG4gICAgICAgICAgICBjb25zdCBwaWVjZURpc3BsYXlZID0gbmV4dFkgKyA1MDtcbiAgICAgICAgICAgIHRoaXMuZHJhd1BpZWNlKHRoaXMubmV4dFBpZWNlLCBNYXRoLmZsb29yKChwaWVjZURpc3BsYXlYIC0gdGhpcy5nYW1lQm9hcmRYKSAvIHRoaXMuYmxvY2tTaXplKSwgTWF0aC5mbG9vcigocGllY2VEaXNwbGF5WSAtIHRoaXMuZ2FtZUJvYXJkWSkgLyB0aGlzLmJsb2NrU2l6ZSksIDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRHJhdyBJbmZvIHBhbmVsIChTY29yZSwgTGV2ZWwsIExpbmVzKVxuICAgICAgICBjb25zdCBpbmZvWCA9IHNldHRpbmdzLmluZm9QYW5lbE9mZnNldFg7XG4gICAgICAgIGNvbnN0IGluZm9ZID0gc2V0dGluZ3MuaW5mb1BhbmVsT2Zmc2V0WTtcbiAgICAgICAgaWYgKHBhbmVsSW1hZ2UpIHRoaXMuY3R4LmRyYXdJbWFnZShwYW5lbEltYWdlLCBpbmZvWCwgaW5mb1ksIHNldHRpbmdzLnBhbmVsV2lkdGgsIHNldHRpbmdzLnBhbmVsSGVpZ2h0ICogMS41KTsgLy8gVGFsbGVyIHBhbmVsIGZvciBpbmZvXG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuc2NvcmVMYWJlbCArIHRoaXMuc2NvcmUsIGluZm9YICsgc2V0dGluZ3MucGFuZWxXaWR0aCAvIDIsIGluZm9ZICsgMzAsIHNldHRpbmdzLnRleHRDb2xvciwgJzI0cHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMubGV2ZWxMYWJlbCArIHRoaXMubGV2ZWwsIGluZm9YICsgc2V0dGluZ3MucGFuZWxXaWR0aCAvIDIsIGluZm9ZICsgNzAsIHNldHRpbmdzLnRleHRDb2xvciwgJzI0cHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMubGluZXNMYWJlbCArIHRoaXMubGluZXNDbGVhcmVkLCBpbmZvWCArIHNldHRpbmdzLnBhbmVsV2lkdGggLyAyLCBpbmZvWSArIDExMCwgc2V0dGluZ3MudGV4dENvbG9yLCAnMjRweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRyYXdUZXh0KHRleHQ6IHN0cmluZywgeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIGZvbnQ6IHN0cmluZywgYWxpZ246IENhbnZhc1RleHRBbGlnbiA9ICdsZWZ0Jyk6IHZvaWQge1xuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBjb2xvcjtcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGZvbnQ7XG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IGFsaWduO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcbiAgICB9XG5cbiAgICAvLyBTdGF0ZS1zcGVjaWZpYyByZW5kZXJpbmdcbiAgICBwcml2YXRlIHJlbmRlclRpdGxlU2NyZWVuKCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0ZXh0cyA9IHRoaXMuY29uZmlnLnRleHRzO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLnRpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDMsICdjeWFuJywgJzYwcHggXCJQcmVzcyBTdGFydCAyUFwiLCBjdXJzaXZlJywgJ2NlbnRlcicpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLnByZXNzQW55S2V5LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJ3doaXRlJywgJzI0cHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW5kZXJDb250cm9sc1NjcmVlbigpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdGV4dHMgPSB0aGlzLmNvbmZpZy50ZXh0cztcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc1RpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDQsICdsaW1lJywgJzQ4cHggXCJQcmVzcyBTdGFydCAyUFwiLCBjdXJzaXZlJywgJ2NlbnRlcicpO1xuICAgICAgICBsZXQgeU9mZnNldCA9IHRoaXMuY2FudmFzLmhlaWdodCAvIDMgKyAzMDtcbiAgICAgICAgY29uc3QgbGluZUhlaWdodCA9IDQwO1xuXG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNNb3ZlTGVmdCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAnd2hpdGUnLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgeU9mZnNldCArPSBsaW5lSGVpZ2h0O1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzTW92ZVJpZ2h0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlPZmZzZXQsICd3aGl0ZScsICcyMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB5T2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG4gICAgICAgIHRoaXMuZHJhd1RleHQodGV4dHMuY29udHJvbHNTb2Z0RHJvcCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAnd2hpdGUnLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgeU9mZnNldCArPSBsaW5lSGVpZ2h0O1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzSGFyZERyb3AsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3doaXRlJywgJzIwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHlPZmZzZXQgKz0gbGluZUhlaWdodDtcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0ZXh0cy5jb250cm9sc1JvdGF0ZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAnd2hpdGUnLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgeU9mZnNldCArPSBsaW5lSGVpZ2h0O1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzSG9sZCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAnd2hpdGUnLCAnMjBweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICAgICAgeU9mZnNldCArPSBsaW5lSGVpZ2h0O1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmNvbnRyb2xzUGF1c2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeU9mZnNldCwgJ3doaXRlJywgJzIwcHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgICAgIHlPZmZzZXQgKz0gbGluZUhlaWdodCArIDMwO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLnN0YXJ0VGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0LCAneWVsbG93JywgJzI0cHggQXJpYWwnLCAnY2VudGVyJyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW5kZXJQbGF5aW5nU2NyZWVuKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmRyYXdHcmlkKCk7XG4gICAgICAgIHRoaXMuZHJhd1VJKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFBpZWNlKSB7XG4gICAgICAgICAgICAvLyBEcmF3IGdob3N0IHBpZWNlXG4gICAgICAgICAgICBsZXQgZ2hvc3RZID0gdGhpcy5jdXJyZW50UGllY2UueTtcbiAgICAgICAgICAgIHdoaWxlICh0aGlzLmlzVmFsaWRNb3ZlKHRoaXMuY3VycmVudFBpZWNlLCAwLCAxLCBnaG9zdFkpKSB7XG4gICAgICAgICAgICAgICAgZ2hvc3RZKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmRyYXdQaWVjZSh0aGlzLmN1cnJlbnRQaWVjZSwgMCwgZ2hvc3RZLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ2hvc3RQaWVjZUFscGhhKTtcblxuICAgICAgICAgICAgLy8gRHJhdyBhY3R1YWwgY3VycmVudCBwaWVjZVxuICAgICAgICAgICAgdGhpcy5kcmF3UGllY2UodGhpcy5jdXJyZW50UGllY2UsIDAsIHRoaXMuY3VycmVudFBpZWNlLnksIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW5kZXJHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJQbGF5aW5nU2NyZWVuKCk7IC8vIFNob3cgdGhlIGZpbmFsIGJvYXJkXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNyknO1xuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcblxuICAgICAgICBjb25zdCB0ZXh0cyA9IHRoaXMuY29uZmlnLnRleHRzO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmdhbWVPdmVyVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMywgJ3JlZCcsICc2MHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLmdhbWVPdmVyU2NvcmUgKyB0aGlzLnNjb3JlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICd3aGl0ZScsICczMHB4IEFyaWFsJywgJ2NlbnRlcicpO1xuICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHRzLnByZXNzUlRvUmVzdGFydCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNjAsICd5ZWxsb3cnLCAnMjRweCBBcmlhbCcsICdjZW50ZXInKTtcbiAgICB9XG5cbiAgICAvLyBBdWRpbyBQbGF5YmFja1xuICAgIHByaXZhdGUgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hc3NldHMuc291bmRzLmdldChuYW1lKTtcbiAgICAgICAgaWYgKGF1ZGlvKSB7XG4gICAgICAgICAgICAvLyBTdG9wIGV4aXN0aW5nIEJHTSBpZiBhIG5ldyBvbmUgaXMgcGxheWluZyBvciBsb29waW5nXG4gICAgICAgICAgICBpZiAobG9vcCAmJiB0aGlzLmN1cnJlbnRCZ20gJiYgdGhpcy5jdXJyZW50QmdtICE9PSBhdWRpbykge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbS5wYXVzZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEJnbS5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZvciBTRlgsIGNsb25lIHRvIGFsbG93IG92ZXJsYXBwaW5nXG4gICAgICAgICAgICBjb25zdCBzb3VuZFRvUGxheSA9IGxvb3AgPyBhdWRpbyA6IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XG4gICAgICAgICAgICBzb3VuZFRvUGxheS5sb29wID0gbG9vcDtcbiAgICAgICAgICAgIHNvdW5kVG9QbGF5LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTsgLy8gQ2F0Y2ggUHJvbWlzZSByZWplY3Rpb25cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKGxvb3ApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRCZ20gPSBzb3VuZFRvUGxheTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzb3VuZFRvUGxheTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kICcke25hbWV9JyBub3QgZm91bmQuYCk7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdG9wU291bmQobmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hc3NldHMuc291bmRzLmdldChuYW1lKTtcbiAgICAgICAgaWYgKGF1ZGlvKSB7XG4gICAgICAgICAgICBhdWRpby5wYXVzZSgpO1xuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEJnbSA9PT0gYXVkaW8pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRCZ20gPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdG9wQWxsU291bmRzKCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHMuZm9yRWFjaChhdWRpbyA9PiB7XG4gICAgICAgICAgICBhdWRpby5wYXVzZSgpO1xuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5jdXJyZW50QmdtID0gbnVsbDtcbiAgICB9XG59XG5cbi8vIEdsb2JhbCBpbml0aWFsaXphdGlvblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBuZXcgVGV0cmlzR2FtZSgnZ2FtZUNhbnZhcycpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgVGV0cmlzR2FtZTonLCBlKTtcbiAgICAgICAgYWxlcnQoJ1x1QUM4Q1x1Qzc4NCBcdUNEMDhcdUFFMzBcdUQ2NTRcdUM1RDAgXHVDMkU0XHVEMzI4XHVENTg4XHVDMkI1XHVCMkM4XHVCMkU0OiAnICsgZS5tZXNzYWdlKTtcbiAgICB9XG59KTtcbiJdLAogICJtYXBw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
