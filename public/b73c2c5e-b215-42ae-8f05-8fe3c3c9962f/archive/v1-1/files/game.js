var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class AssetManager {
  constructor(config) {
    this.config = config;
    this.imageAssets = /* @__PURE__ */ new Map();
    this.soundAssets = /* @__PURE__ */ new Map();
    this.imagesLoaded = 0;
    this.soundsLoaded = 0;
    this.totalImages = 0;
    this.totalSounds = 0;
    this.totalImages = config.images.length;
    this.totalSounds = config.sounds.length;
  }
  // Loads all images and sounds specified in the config
  async loadAssets() {
    const imagePromises = this.config.images.map((img) => this.loadImage(img));
    const soundPromises = this.config.sounds.map((snd) => this.loadSound(snd));
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  // Loads a single image asset
  loadImage(asset) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = asset.path;
      img.onload = () => {
        this.imageAssets.set(asset.name, img);
        this.imagesLoaded++;
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${asset.path}`);
        this.imagesLoaded++;
        resolve();
      };
    });
  }
  // Loads a single sound asset
  loadSound(asset) {
    return new Promise((resolve) => {
      const audio = new Audio(asset.path);
      audio.volume = asset.volume;
      audio.addEventListener("canplaythrough", () => {
        this.soundAssets.set(asset.name, audio);
        this.soundsLoaded++;
        resolve();
      }, { once: true });
      audio.addEventListener("error", () => {
        console.error(`Failed to load sound: ${asset.path}`);
        this.soundsLoaded++;
        resolve();
      });
      audio.load();
    });
  }
  // Retrieves an image by its name
  getImage(name) {
    return this.imageAssets.get(name);
  }
  // Plays a sound by its name
  playSound(name, loop = false) {
    const audio = this.soundAssets.get(name);
    if (audio) {
      audio.currentTime = 0;
      audio.loop = loop;
      audio.play().catch((e) => console.warn(`Sound playback failed for ${name}:`, e));
    }
  }
  // Stops a sound by its name
  stopSound(name) {
    const audio = this.soundAssets.get(name);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
  // Checks if all assets are loaded
  isReady() {
    return this.imagesLoaded === this.totalImages && this.soundsLoaded === this.totalSounds;
  }
}
class AnimalConnectGame {
  constructor(canvasId, config) {
    this.gameState = 0 /* TITLE */;
    this.currentLevelIndex = 0;
    // Game board: 0 for empty, >0 for animal ID
    this.selectedTiles = [];
    // Stores coordinates of selected tiles
    this.remainingTime = 0;
    this.score = 0;
    this.matchedPairs = 0;
    // Number of pairs matched in the current level
    this.totalPairs = 0;
    this.lastFrameTime = 0;
    this.hoveredButton = null;
    // Handles mouse click events based on the current game state
    this.handleClick = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      if (this.gameState === 0 /* TITLE */) {
        if (this.isPointInRect(mouseX, mouseY, this.titleButtonRect)) {
          this.assets.playSound("tile_select");
          this.showInstructions();
        }
      } else if (this.gameState === 1 /* INSTRUCTIONS */) {
        if (this.isPointInRect(mouseX, mouseY, this.instructionsButtonRect)) {
          this.assets.playSound("tile_select");
          this.startGame();
        }
      } else if (this.gameState === 2 /* PLAYING */) {
        this.handleGameClick(mouseX, mouseY);
      } else if (this.gameState === 3 /* GAME_OVER */) {
        if (this.isPointInRect(mouseX, mouseY, this.gameOverButtonRect)) {
          this.assets.playSound("tile_select");
          this.resetGame();
          this.startTitleScreen();
        }
      }
    };
    // Handles mouse move events to update button hover states
    this.handleMouseMove = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      this.hoveredButton = null;
      if (this.gameState === 0 /* TITLE */ && this.isPointInRect(mouseX, mouseY, this.titleButtonRect)) {
        this.hoveredButton = "title";
      } else if (this.gameState === 1 /* INSTRUCTIONS */ && this.isPointInRect(mouseX, mouseY, this.instructionsButtonRect)) {
        this.hoveredButton = "instructions";
      } else if (this.gameState === 3 /* GAME_OVER */ && this.isPointInRect(mouseX, mouseY, this.gameOverButtonRect)) {
        this.hoveredButton = "gameOver";
      }
    };
    // Main game loop, continuously updates and draws the game
    this.gameLoop = (currentTime) => {
      if (!this.lastFrameTime) {
        this.lastFrameTime = currentTime;
      }
      const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
      this.lastFrameTime = currentTime;
      this.update(deltaTime);
      this.draw();
      this.gameLoopRequestId = requestAnimationFrame(this.gameLoop);
    };
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.config = config;
    this.assets = new AssetManager(config.assets);
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    this.setupEventListeners();
  }
  // Initializes the game by loading assets and setting up the initial state
  async init() {
    await this.assets.loadAssets();
    this.currentLevelIndex = 0;
    this.currentLevelConfig = this.config.levels[this.currentLevelIndex];
    this.calculateBoardDimensions();
    this.startTitleScreen();
    this.gameLoopRequestId = requestAnimationFrame(this.gameLoop);
  }
  // Calculates the size and position of the game board and tiles to fit the canvas
  calculateBoardDimensions() {
    const { rows, cols } = this.currentLevelConfig;
    const maxBoardWidth = this.canvas.width - 2 * this.config.boardMarginX;
    const maxBoardHeight = this.canvas.height - 2 * this.config.boardMarginY;
    const tileWidthFromCols = maxBoardWidth / cols;
    const tileHeightFromRows = maxBoardHeight / rows;
    this.tileSize = Math.min(this.config.baseTileSize, tileWidthFromCols, tileHeightFromRows);
    const actualBoardWidth = this.tileSize * cols;
    const actualBoardHeight = this.tileSize * rows;
    this.boardOffsetX = (this.canvas.width - actualBoardWidth) / 2;
    this.boardOffsetY = (this.canvas.height - actualBoardHeight) / 2;
  }
  // Sets up mouse event listeners for interaction
  setupEventListeners() {
    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
  }
  // Checks if a point (mouseX, mouseY) is within a given rectangle
  isPointInRect(x, y, rect) {
    if (!rect) return false;
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }
  // Sets the game state to title screen
  startTitleScreen() {
    this.assets.stopSound("bgm_loop");
    this.gameState = 0 /* TITLE */;
    this.draw();
  }
  // Sets the game state to instructions screen
  showInstructions() {
    this.gameState = 1 /* INSTRUCTIONS */;
    this.draw();
  }
  // Starts the actual game play
  startGame() {
    this.assets.playSound("bgm_loop", true);
    this.gameState = 2 /* PLAYING */;
    this.score = 0;
    this.currentLevelIndex = 0;
    this.nextLevel();
  }
  // Resets game-specific variables
  resetGame() {
    cancelAnimationFrame(this.gameLoopRequestId);
    this.currentLevelIndex = 0;
    this.score = 0;
    this.matchedPairs = 0;
    this.selectedTiles = [];
    this.assets.stopSound("bgm_loop");
  }
  // Ends the game and shows the game over screen
  gameOver(won) {
    this.assets.stopSound("bgm_loop");
    this.assets.playSound("game_over");
    this.gameState = 3 /* GAME_OVER */;
    this.draw();
  }
  // Proceeds to the next level or ends the game if all levels are complete
  nextLevel() {
    if (this.currentLevelIndex >= this.config.levels.length) {
      this.gameOver(true);
      return;
    }
    this.currentLevelConfig = this.config.levels[this.currentLevelIndex];
    this.calculateBoardDimensions();
    this.remainingTime = this.currentLevelConfig.timeLimitSeconds;
    this.selectedTiles = [];
    this.matchedPairs = 0;
    this.generateBoard();
    if (this.currentLevelIndex > 0) {
      this.assets.playSound("level_complete");
    }
  }
  // Generates a new game board with animal tiles
  generateBoard() {
    const { rows, cols, numAnimalTypes } = this.currentLevelConfig;
    this.board = Array(rows).fill(0).map(() => Array(cols).fill(0));
    const totalTiles = rows * cols;
    this.totalPairs = totalTiles / 2;
    const animalPool = [];
    for (let i = 0; i < this.totalPairs; i++) {
      const animalId = i % numAnimalTypes + 1;
      animalPool.push(animalId, animalId);
    }
    for (let i = animalPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [animalPool[i], animalPool[j]] = [animalPool[j], animalPool[i]];
    }
    let poolIndex = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.board[r][c] = animalPool[poolIndex++];
      }
    }
  }
  // Handles a click event on the game board during PLAYING state
  handleGameClick(mouseX, mouseY) {
    const { rows, cols } = this.currentLevelConfig;
    const gridX = Math.floor((mouseX - this.boardOffsetX) / this.tileSize);
    const gridY = Math.floor((mouseY - this.boardOffsetY) / this.tileSize);
    if (gridX < 0 || gridX >= cols || gridY < 0 || gridY >= rows) {
      return;
    }
    const clickedTileValue = this.board[gridY][gridX];
    if (clickedTileValue === 0) {
      return;
    }
    this.assets.playSound("tile_select");
    const existingSelectionIndex = this.selectedTiles.findIndex(
      (tile) => tile.x === gridX && tile.y === gridY
    );
    if (existingSelectionIndex !== -1) {
      this.selectedTiles.splice(existingSelectionIndex, 1);
    } else {
      this.selectedTiles.push({ x: gridX, y: gridY });
      if (this.selectedTiles.length === 2) {
        const [tile1, tile2] = this.selectedTiles;
        if (tile1.x === tile2.x && tile1.y === tile2.y) {
          this.selectedTiles = [];
          return;
        }
        if (this.board[tile1.y][tile1.x] === this.board[tile2.y][tile2.x]) {
          if (this.canConnect(tile1.x, tile1.y, tile2.x, tile2.y)) {
            this.assets.playSound("tile_match");
            this.score += this.config.matchScore * this.currentLevelConfig.scoreMultiplier;
            this.matchedPairs++;
            this.board[tile1.y][tile1.x] = 0;
            this.board[tile2.y][tile2.x] = 0;
            this.selectedTiles = [];
            if (this.matchedPairs === this.totalPairs) {
              this.currentLevelIndex++;
              this.nextLevel();
            }
          } else {
            this.assets.playSound("wrong_match");
            this.remainingTime = Math.max(0, this.remainingTime - this.config.penaltyTime);
            this.selectedTiles = [];
          }
        } else {
          this.assets.playSound("wrong_match");
          this.remainingTime = Math.max(0, this.remainingTime - this.config.penaltyTime);
          this.selectedTiles = [];
        }
      }
    }
  }
  // Helper for pathfinding: Checks if a cell is empty or one of the points to be ignored
  isCellEmptyOrIgnored(cx, cy, ignorePoints) {
    const { rows, cols } = this.currentLevelConfig;
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
      return true;
    }
    for (const p of ignorePoints) {
      if (p.x === cx && p.y === cy) {
        return true;
      }
    }
    return this.board[cy][cx] === 0;
  }
  // Helper for pathfinding: Checks if a straight horizontal or vertical path between two points is clear
  checkStraightPath(x1, y1, x2, y2, ignorePoints) {
    if (x1 === x2 && Math.abs(y1 - y2) <= 1 || y1 === y2 && Math.abs(x1 - x2) <= 1) {
      return true;
    }
    if (x1 === x2) {
      const startY = Math.min(y1, y2);
      const endY = Math.max(y1, y2);
      for (let y = startY + 1; y < endY; y++) {
        if (!this.isCellEmptyOrIgnored(x1, y, ignorePoints)) {
          return false;
        }
      }
      return true;
    } else if (y1 === y2) {
      const startX = Math.min(x1, x2);
      const endX = Math.max(x1, x2);
      for (let x = startX + 1; x < endX; x++) {
        if (!this.isCellEmptyOrIgnored(x, y1, ignorePoints)) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  // Determines if two tiles at (x1, y1) and (x2, y2) can be connected
  canConnect(x1, y1, x2, y2) {
    const ignore = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    if (this.checkStraightPath(x1, y1, x2, y2, ignore)) {
      return true;
    }
    if (this.isCellEmptyOrIgnored(x1, y2, ignore) && this.checkStraightPath(x1, y1, x1, y2, ignore) && this.checkStraightPath(x1, y2, x2, y2, ignore)) {
      return true;
    }
    if (this.isCellEmptyOrIgnored(x2, y1, ignore) && this.checkStraightPath(x1, y1, x2, y1, ignore) && this.checkStraightPath(x2, y1, x2, y2, ignore)) {
      return true;
    }
    const { rows, cols } = this.currentLevelConfig;
    for (let px = -1; px <= cols; px++) {
      if (this.isCellEmptyOrIgnored(px, y1, ignore) && // First turn point
      this.isCellEmptyOrIgnored(px, y2, ignore) && // Second turn point
      this.checkStraightPath(x1, y1, px, y1, ignore) && // Path segment 1
      this.checkStraightPath(px, y1, px, y2, ignore) && // Path segment 2
      this.checkStraightPath(px, y2, x2, y2, ignore)) {
        return true;
      }
    }
    for (let py = -1; py <= rows; py++) {
      if (this.isCellEmptyOrIgnored(x1, py, ignore) && // First turn point
      this.isCellEmptyOrIgnored(x2, py, ignore) && // Second turn point
      this.checkStraightPath(x1, y1, x1, py, ignore) && // Path segment 1
      this.checkStraightPath(x1, py, x2, py, ignore) && // Path segment 2
      this.checkStraightPath(x2, py, x2, y2, ignore)) {
        return true;
      }
    }
    return false;
  }
  // Updates game logic, especially the timer for PLAYING state
  update(deltaTime) {
    if (this.gameState === 2 /* PLAYING */) {
      this.remainingTime -= deltaTime;
      if (this.remainingTime <= 0) {
        this.remainingTime = 0;
        this.gameOver(false);
      }
    }
  }
  // Clears the canvas and draws the current game screen based on state
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bgImage = this.assets.getImage("background");
    if (bgImage) {
      this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#ADD8E6";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 1 /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case 2 /* PLAYING */:
        this.drawGameScreen();
        break;
      case 3 /* GAME_OVER */:
        const wonGame = this.currentLevelIndex >= this.config.levels.length && this.matchedPairs === this.totalPairs;
        this.drawGameOverScreen(wonGame);
        break;
    }
  }
  // Draws the title screen elements
  drawTitleScreen() {
    this.ctx.font = `bold 48px ${this.config.gameFont}`;
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.config.titleScreenText, this.canvas.width / 2, this.canvas.height / 3);
    const buttonText = this.config.titleButtonText;
    const buttonWidth = 240;
    const buttonHeight = 70;
    const buttonX = (this.canvas.width - buttonWidth) / 2;
    const buttonY = this.canvas.height / 2 + 50;
    this.titleButtonRect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    this.ctx.fillStyle = this.hoveredButton === "title" ? this.config.uiButtonHoverColor : this.config.uiButtonColor;
    this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    this.ctx.strokeStyle = this.config.uiColor;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    this.ctx.font = `bold 28px ${this.config.gameFont}`;
    this.ctx.fillStyle = this.config.uiButtonTextColor;
    this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
  }
  // Draws the instructions screen elements
  drawInstructionsScreen() {
    this.ctx.font = `bold 36px ${this.config.gameFont}`;
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "top";
    this.ctx.fillText("\uAC8C\uC784 \uBC29\uBC95", this.canvas.width / 2, 80);
    this.ctx.font = `20px ${this.config.gameFont}`;
    this.ctx.textAlign = "left";
    const instructionLines = this.config.instructionsText.split("\n");
    let currentY = 140;
    const startX = this.canvas.width / 2 - 250;
    for (const line of instructionLines) {
      this.ctx.fillText(line, startX, currentY);
      currentY += 28;
    }
    const buttonText = this.config.instructionsButtonText;
    const buttonWidth = 240;
    const buttonHeight = 70;
    const buttonX = (this.canvas.width - buttonWidth) / 2;
    const buttonY = this.canvas.height - 100;
    this.instructionsButtonRect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    this.ctx.fillStyle = this.hoveredButton === "instructions" ? this.config.uiButtonHoverColor : this.config.uiButtonColor;
    this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    this.ctx.strokeStyle = this.config.uiColor;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    this.ctx.font = `bold 28px ${this.config.gameFont}`;
    this.ctx.fillStyle = this.config.uiButtonTextColor;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
  }
  // Draws the game board and UI elements during active gameplay
  drawGameScreen() {
    const { rows, cols } = this.currentLevelConfig;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const animalId = this.board[r][c];
        const isSelected = this.selectedTiles.some((tile) => tile.x === c && tile.y === r);
        this.drawTile(c, r, animalId, isSelected);
      }
    }
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.font = `bold 24px ${this.config.gameFont}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(`\uB808\uBCA8: ${this.currentLevelIndex + 1}`, 20, 20);
    this.ctx.fillText(`\uC810\uC218: ${Math.floor(this.score)}`, 20, 50);
    this.ctx.textAlign = "right";
    const timeColor = this.remainingTime <= 10 ? "red" : this.config.uiColor;
    this.ctx.fillStyle = timeColor;
    this.ctx.fillText(`\uC2DC\uAC04: ${Math.max(0, Math.floor(this.remainingTime))}\uCD08`, this.canvas.width - 20, 20);
  }
  // Draws a single animal tile on the board
  drawTile(gridX, gridY, animalId, isSelected) {
    const x = this.boardOffsetX + gridX * this.tileSize + this.config.tilePadding;
    const y = this.boardOffsetY + gridY * this.tileSize + this.config.tilePadding;
    const size = this.tileSize - 2 * this.config.tilePadding;
    if (animalId === 0) {
      this.ctx.fillStyle = "#CCC";
      this.ctx.fillRect(x, y, size, size);
    } else {
      const imageName = `animal_${animalId}`;
      const animalImage = this.assets.getImage(imageName);
      if (animalImage) {
        this.ctx.drawImage(animalImage, x, y, size, size);
      } else {
        this.ctx.fillStyle = "#888";
        this.ctx.fillRect(x, y, size, size);
        this.ctx.fillStyle = "#FFF";
        this.ctx.font = `16px ${this.config.gameFont}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(`? ${animalId}`, x + size / 2, y + size / 2);
      }
    }
    if (isSelected) {
      this.ctx.strokeStyle = this.config.selectedTileOutlineColor;
      this.ctx.lineWidth = 4;
      this.ctx.strokeRect(x, y, size, size);
    }
  }
  // Draws the game over screen (win or lose)
  drawGameOverScreen(won) {
    this.ctx.font = `bold 48px ${this.config.gameFont}`;
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    const message = won ? this.config.gameOverWinText : this.config.gameOverLoseText;
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 3);
    this.ctx.font = `24px ${this.config.gameFont}`;
    this.ctx.fillText(`\uCD5C\uC885 \uC810\uC218: ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2);
    const buttonText = this.config.gameOverButtonText;
    const buttonWidth = 240;
    const buttonHeight = 70;
    const buttonX = (this.canvas.width - buttonWidth) / 2;
    const buttonY = this.canvas.height / 2 + 100;
    this.gameOverButtonRect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    this.ctx.fillStyle = this.hoveredButton === "gameOver" ? this.config.uiButtonHoverColor : this.config.uiButtonColor;
    this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    this.ctx.strokeStyle = this.config.uiColor;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    this.ctx.font = `bold 28px ${this.config.gameFont}`;
    this.ctx.fillStyle = this.config.uiButtonTextColor;
    this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  fetch("data.json").then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }).then((data) => {
    const game = new AnimalConnectGame("gameCanvas", data);
    game.init();
  }).catch((error) => {
    console.error("Error loading game data:", error);
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "red";
      ctx.font = "24px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\uAC8C\uC784 \uB85C\uB4DC \uC911 \uC624\uB958 \uBC1C\uC0DD: " + error.message, canvas.width / 2, canvas.height / 2);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gRGVmaW5lIGNvbW1vbiBpbnRlcmZhY2VzIHRoYXQgd2lsbCBiZSB1c2VkIGJvdGggaW4gVHlwZVNjcmlwdCBhbmQgRGF0YVxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUFzc2V0cyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGV2ZWxDb25maWcge1xyXG4gICAgcm93czogbnVtYmVyO1xyXG4gICAgY29sczogbnVtYmVyO1xyXG4gICAgbnVtQW5pbWFsVHlwZXM6IG51bWJlcjsgLy8gTWF4IGFuaW1hbCBJRCB0byB1c2UgZm9yIHRoaXMgbGV2ZWwgKGZyb20gMSB0byBOKVxyXG4gICAgdGltZUxpbWl0U2Vjb25kczogbnVtYmVyO1xyXG4gICAgc2NvcmVNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXIgZm9yIHNjb3JlIGVhcm5lZCBpbiB0aGlzIGxldmVsXHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIGJvYXJkTWFyZ2luWDogbnVtYmVyOyAvLyBNaW5pbXVtIG1hcmdpbiBvbiB4LWF4aXMgZm9yIHRoZSBib2FyZFxyXG4gICAgYm9hcmRNYXJnaW5ZOiBudW1iZXI7IC8vIE1pbmltdW0gbWFyZ2luIG9uIHktYXhpcyBmb3IgdGhlIGJvYXJkXHJcbiAgICBiYXNlVGlsZVNpemU6IG51bWJlcjsgLy8gUHJlZmVycmVkIHRpbGUgc2l6ZSwgd2lsbCBzY2FsZSBkb3duIGlmIGJvYXJkIHRvbyBiaWdcclxuICAgIHRpbGVQYWRkaW5nOiBudW1iZXI7IC8vIFBhZGRpbmcgYmV0d2VlbiB0aGUgdmlzdWFsIGltYWdlIGFuZCB0aGUgdGlsZSBib3VuZGFyeVxyXG4gICAgbWF0Y2hTY29yZTogbnVtYmVyO1xyXG4gICAgcGVuYWx0eVRpbWU6IG51bWJlcjsgLy8gVGltZSBwZW5hbHR5IGluIHNlY29uZHMgZm9yIGEgd3JvbmcgbWF0Y2hcclxuICAgIGFzc2V0czogR2FtZUFzc2V0cztcclxuICAgIGxldmVsczogTGV2ZWxDb25maWdbXTtcclxuICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgdGl0bGVCdXR0b25UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNCdXR0b25UZXh0OiBzdHJpbmc7XHJcbiAgICBnYW1lT3ZlcldpblRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyTG9zZVRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyQnV0dG9uVGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZUZvbnQ6IHN0cmluZztcclxuICAgIHVpQ29sb3I6IHN0cmluZztcclxuICAgIHVpQnV0dG9uQ29sb3I6IHN0cmluZztcclxuICAgIHVpQnV0dG9uSG92ZXJDb2xvcjogc3RyaW5nO1xyXG4gICAgdWlCdXR0b25UZXh0Q29sb3I6IHN0cmluZztcclxuICAgIHNlbGVjdGVkVGlsZU91dGxpbmVDb2xvcjogc3RyaW5nO1xyXG59XHJcblxyXG4vLyBFbnVtcyBmb3IgR2FtZVN0YXRlXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG4vLyBBc3NldE1hbmFnZXIgY2xhc3MgZm9yIGxvYWRpbmcgYW5kIG1hbmFnaW5nIGdhbWUgYXNzZXRzIChpbWFnZXMgYW5kIHNvdW5kcylcclxuY2xhc3MgQXNzZXRNYW5hZ2VyIHtcclxuICAgIHByaXZhdGUgaW1hZ2VBc3NldHM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZEFzc2V0czogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIGltYWdlc0xvYWRlZCA9IDA7XHJcbiAgICBwcml2YXRlIHNvdW5kc0xvYWRlZCA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsSW1hZ2VzID0gMDtcclxuICAgIHByaXZhdGUgdG90YWxTb3VuZHMgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBHYW1lQXNzZXRzKSB7XHJcbiAgICAgICAgdGhpcy50b3RhbEltYWdlcyA9IGNvbmZpZy5pbWFnZXMubGVuZ3RoO1xyXG4gICAgICAgIHRoaXMudG90YWxTb3VuZHMgPSBjb25maWcuc291bmRzLmxlbmd0aDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBMb2FkcyBhbGwgaW1hZ2VzIGFuZCBzb3VuZHMgc3BlY2lmaWVkIGluIHRoZSBjb25maWdcclxuICAgIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmltYWdlcy5tYXAoaW1nID0+IHRoaXMubG9hZEltYWdlKGltZykpO1xyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5zb3VuZHMubWFwKHNuZCA9PiB0aGlzLmxvYWRTb3VuZChzbmQpKTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBMb2FkcyBhIHNpbmdsZSBpbWFnZSBhc3NldFxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoYXNzZXQ6IEltYWdlQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbWFnZUFzc2V0cy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzTG9hZGVkKys7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzTG9hZGVkKys7IC8vIFN0aWxsIGNvdW50IHRvIGF2b2lkIGJsb2NraW5nIGFsbFxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheSB0byBwcm9jZWVkIHdpdGggb3RoZXIgYXNzZXRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTG9hZHMgYSBzaW5nbGUgc291bmQgYXNzZXRcclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKGFzc2V0OiBTb3VuZEFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKGFzc2V0LnBhdGgpO1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBhc3NldC52b2x1bWU7XHJcbiAgICAgICAgICAgIC8vIFByZWxvYWQgbWV0YWRhdGEgdG8gZW5zdXJlIGl0J3MgcmVhZHlcclxuICAgICAgICAgICAgYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcignY2FucGxheXRocm91Z2gnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kQXNzZXRzLnNldChhc3NldC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kc0xvYWRlZCsrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIGF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc291bmRzTG9hZGVkKys7IC8vIFN0aWxsIGNvdW50IHRvIGF2b2lkIGJsb2NraW5nIGFsbFxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheSB0byBwcm9jZWVkXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmV0cmlldmVzIGFuIGltYWdlIGJ5IGl0cyBuYW1lXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZUFzc2V0cy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUGxheXMgYSBzb3VuZCBieSBpdHMgbmFtZVxyXG4gICAgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kQXNzZXRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwOyAvLyBSZXdpbmQgdG8gc3RhcnRcclxuICAgICAgICAgICAgYXVkaW8ubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU3RvcHMgYSBzb3VuZCBieSBpdHMgbmFtZVxyXG4gICAgc3RvcFNvdW5kKG5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZEFzc2V0cy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2tzIGlmIGFsbCBhc3NldHMgYXJlIGxvYWRlZFxyXG4gICAgaXNSZWFkeSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXNMb2FkZWQgPT09IHRoaXMudG90YWxJbWFnZXMgJiYgdGhpcy5zb3VuZHNMb2FkZWQgPT09IHRoaXMudG90YWxTb3VuZHM7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIE1haW4gQW5pbWFsIENvbm5lY3QgR2FtZSBjbGFzc1xyXG5jbGFzcyBBbmltYWxDb25uZWN0R2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0czogQXNzZXRNYW5hZ2VyO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuXHJcbiAgICBwcml2YXRlIGN1cnJlbnRMZXZlbEluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBib2FyZDogbnVtYmVyW11bXTsgLy8gR2FtZSBib2FyZDogMCBmb3IgZW1wdHksID4wIGZvciBhbmltYWwgSURcclxuICAgIHByaXZhdGUgc2VsZWN0ZWRUaWxlczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W10gPSBbXTsgLy8gU3RvcmVzIGNvb3JkaW5hdGVzIG9mIHNlbGVjdGVkIHRpbGVzXHJcbiAgICBwcml2YXRlIHJlbWFpbmluZ1RpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBtYXRjaGVkUGFpcnM6IG51bWJlciA9IDA7IC8vIE51bWJlciBvZiBwYWlycyBtYXRjaGVkIGluIHRoZSBjdXJyZW50IGxldmVsXHJcbiAgICBwcml2YXRlIHRvdGFsUGFpcnM6IG51bWJlciA9IDA7ICAgLy8gVG90YWwgcGFpcnMgdG8gbWF0Y2ggaW4gdGhlIGN1cnJlbnQgbGV2ZWxcclxuICAgIHByaXZhdGUgZ2FtZUxvb3BSZXF1ZXN0SWQ6IG51bWJlcjtcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRMZXZlbENvbmZpZzogTGV2ZWxDb25maWc7IC8vIENvbmZpZ3VyYXRpb24gZm9yIHRoZSBjdXJyZW50IGxldmVsXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgZm9yIGJ1dHRvbiBpbnRlcmFjdGlvbnNcclxuICAgIHByaXZhdGUgdGl0bGVCdXR0b25SZWN0OiB7IHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9O1xyXG4gICAgcHJpdmF0ZSBpbnN0cnVjdGlvbnNCdXR0b25SZWN0OiB7IHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9O1xyXG4gICAgcHJpdmF0ZSBnYW1lT3ZlckJ1dHRvblJlY3Q6IHsgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyIH07XHJcbiAgICBwcml2YXRlIGhvdmVyZWRCdXR0b246ICd0aXRsZScgfCAnaW5zdHJ1Y3Rpb25zJyB8ICdnYW1lT3ZlcicgfCBudWxsID0gbnVsbDsgLy8gVHJhY2tzIHdoaWNoIGJ1dHRvbiBpcyBob3ZlcmVkXHJcblxyXG4gICAgLy8gQm9hcmQgcmVuZGVyaW5nIHByb3BlcnRpZXNcclxuICAgIHByaXZhdGUgYm9hcmRPZmZzZXRYOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIGJvYXJkT2Zmc2V0WTogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSB0aWxlU2l6ZTogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcsIGNvbmZpZzogR2FtZUNvbmZpZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgICAgICAgdGhpcy5hc3NldHMgPSBuZXcgQXNzZXRNYW5hZ2VyKGNvbmZpZy5hc3NldHMpO1xyXG5cclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgdGhpcy5zZXR1cEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZXMgdGhlIGdhbWUgYnkgbG9hZGluZyBhc3NldHMgYW5kIHNldHRpbmcgdXAgdGhlIGluaXRpYWwgc3RhdGVcclxuICAgIGFzeW5jIGluaXQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5hc3NldHMubG9hZEFzc2V0cygpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudExldmVsSW5kZXggPSAwOyAvLyBTdGFydCBmcm9tIHRoZSBmaXJzdCBsZXZlbFxyXG4gICAgICAgIHRoaXMuY3VycmVudExldmVsQ29uZmlnID0gdGhpcy5jb25maWcubGV2ZWxzW3RoaXMuY3VycmVudExldmVsSW5kZXhdO1xyXG4gICAgICAgIHRoaXMuY2FsY3VsYXRlQm9hcmREaW1lbnNpb25zKCk7IC8vIENhbGN1bGF0ZSBpbml0aWFsIGJvYXJkIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnN0YXJ0VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICB0aGlzLmdhbWVMb29wUmVxdWVzdElkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENhbGN1bGF0ZXMgdGhlIHNpemUgYW5kIHBvc2l0aW9uIG9mIHRoZSBnYW1lIGJvYXJkIGFuZCB0aWxlcyB0byBmaXQgdGhlIGNhbnZhc1xyXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVCb2FyZERpbWVuc2lvbnMoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgeyByb3dzLCBjb2xzIH0gPSB0aGlzLmN1cnJlbnRMZXZlbENvbmZpZztcclxuICAgICAgICBjb25zdCBtYXhCb2FyZFdpZHRoID0gdGhpcy5jYW52YXMud2lkdGggLSAyICogdGhpcy5jb25maWcuYm9hcmRNYXJnaW5YO1xyXG4gICAgICAgIGNvbnN0IG1heEJvYXJkSGVpZ2h0ID0gdGhpcy5jYW52YXMuaGVpZ2h0IC0gMiAqIHRoaXMuY29uZmlnLmJvYXJkTWFyZ2luWTtcclxuXHJcbiAgICAgICAgY29uc3QgdGlsZVdpZHRoRnJvbUNvbHMgPSBtYXhCb2FyZFdpZHRoIC8gY29scztcclxuICAgICAgICBjb25zdCB0aWxlSGVpZ2h0RnJvbVJvd3MgPSBtYXhCb2FyZEhlaWdodCAvIHJvd3M7XHJcblxyXG4gICAgICAgIC8vIFVzZSB0aGUgc21hbGxlciBvZiB0aGUgdHdvIHRvIGVuc3VyZSBhbGwgdGlsZXMgZml0LCBjYXBwZWQgYnkgYmFzZVRpbGVTaXplXHJcbiAgICAgICAgdGhpcy50aWxlU2l6ZSA9IE1hdGgubWluKHRoaXMuY29uZmlnLmJhc2VUaWxlU2l6ZSwgdGlsZVdpZHRoRnJvbUNvbHMsIHRpbGVIZWlnaHRGcm9tUm93cyk7XHJcblxyXG4gICAgICAgIC8vIENlbnRlciB0aGUgYm9hcmQgb24gdGhlIGNhbnZhc1xyXG4gICAgICAgIGNvbnN0IGFjdHVhbEJvYXJkV2lkdGggPSB0aGlzLnRpbGVTaXplICogY29scztcclxuICAgICAgICBjb25zdCBhY3R1YWxCb2FyZEhlaWdodCA9IHRoaXMudGlsZVNpemUgKiByb3dzO1xyXG4gICAgICAgIHRoaXMuYm9hcmRPZmZzZXRYID0gKHRoaXMuY2FudmFzLndpZHRoIC0gYWN0dWFsQm9hcmRXaWR0aCkgLyAyO1xyXG4gICAgICAgIHRoaXMuYm9hcmRPZmZzZXRZID0gKHRoaXMuY2FudmFzLmhlaWdodCAtIGFjdHVhbEJvYXJkSGVpZ2h0KSAvIDI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2V0cyB1cCBtb3VzZSBldmVudCBsaXN0ZW5lcnMgZm9yIGludGVyYWN0aW9uXHJcbiAgICBwcml2YXRlIHNldHVwRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNsaWNrKTtcclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLmhhbmRsZU1vdXNlTW92ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGFuZGxlcyBtb3VzZSBjbGljayBldmVudHMgYmFzZWQgb24gdGhlIGN1cnJlbnQgZ2FtZSBzdGF0ZVxyXG4gICAgcHJpdmF0ZSBoYW5kbGVDbGljayA9IChldmVudDogTW91c2VFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IG1vdXNlWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaXNQb2ludEluUmVjdChtb3VzZVgsIG1vdXNlWSwgdGhpcy50aXRsZUJ1dHRvblJlY3QpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5wbGF5U291bmQoJ3RpbGVfc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNob3dJbnN0cnVjdGlvbnMoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlMpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaXNQb2ludEluUmVjdChtb3VzZVgsIG1vdXNlWSwgdGhpcy5pbnN0cnVjdGlvbnNCdXR0b25SZWN0KSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldHMucGxheVNvdW5kKCd0aWxlX3NlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlR2FtZUNsaWNrKG1vdXNlWCwgbW91c2VZKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmlzUG9pbnRJblJlY3QobW91c2VYLCBtb3VzZVksIHRoaXMuZ2FtZU92ZXJCdXR0b25SZWN0KSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldHMucGxheVNvdW5kKCd0aWxlX3NlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRUaXRsZVNjcmVlbigpOyAvLyBHbyBiYWNrIHRvIHRpdGxlIHNjcmVlblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBIYW5kbGVzIG1vdXNlIG1vdmUgZXZlbnRzIHRvIHVwZGF0ZSBidXR0b24gaG92ZXIgc3RhdGVzXHJcbiAgICBwcml2YXRlIGhhbmRsZU1vdXNlTW92ZSA9IChldmVudDogTW91c2VFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IG1vdXNlWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICAgICAgdGhpcy5ob3ZlcmVkQnV0dG9uID0gbnVsbDsgLy8gUmVzZXQgaG92ZXJlZCBidXR0b25cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiB0aGlzLmlzUG9pbnRJblJlY3QobW91c2VYLCBtb3VzZVksIHRoaXMudGl0bGVCdXR0b25SZWN0KSkge1xyXG4gICAgICAgICAgICB0aGlzLmhvdmVyZWRCdXR0b24gPSAndGl0bGUnO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlMgJiYgdGhpcy5pc1BvaW50SW5SZWN0KG1vdXNlWCwgbW91c2VZLCB0aGlzLmluc3RydWN0aW9uc0J1dHRvblJlY3QpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaG92ZXJlZEJ1dHRvbiA9ICdpbnN0cnVjdGlvbnMnO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIgJiYgdGhpcy5pc1BvaW50SW5SZWN0KG1vdXNlWCwgbW91c2VZLCB0aGlzLmdhbWVPdmVyQnV0dG9uUmVjdCkpIHtcclxuICAgICAgICAgICAgdGhpcy5ob3ZlcmVkQnV0dG9uID0gJ2dhbWVPdmVyJztcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIENoZWNrcyBpZiBhIHBvaW50IChtb3VzZVgsIG1vdXNlWSkgaXMgd2l0aGluIGEgZ2l2ZW4gcmVjdGFuZ2xlXHJcbiAgICBwcml2YXRlIGlzUG9pbnRJblJlY3QoeDogbnVtYmVyLCB5OiBudW1iZXIsIHJlY3Q6IHsgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyIH0pOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXJlY3QpIHJldHVybiBmYWxzZTtcclxuICAgICAgICByZXR1cm4geCA+PSByZWN0LnggJiYgeCA8PSByZWN0LnggKyByZWN0LndpZHRoICYmXHJcbiAgICAgICAgICAgICAgIHkgPj0gcmVjdC55ICYmIHkgPD0gcmVjdC55ICsgcmVjdC5oZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2V0cyB0aGUgZ2FtZSBzdGF0ZSB0byB0aXRsZSBzY3JlZW5cclxuICAgIHByaXZhdGUgc3RhcnRUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmFzc2V0cy5zdG9wU291bmQoJ2JnbV9sb29wJyk7IC8vIEVuc3VyZSBCR00gaXMgc3RvcHBlZFxyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHRoaXMuZHJhdygpOyAvLyBSZWRyYXcgaW1tZWRpYXRlbHkgZm9yIHN0YXRlIGNoYW5nZVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFNldHMgdGhlIGdhbWUgc3RhdGUgdG8gaW5zdHJ1Y3Rpb25zIHNjcmVlblxyXG4gICAgcHJpdmF0ZSBzaG93SW5zdHJ1Y3Rpb25zKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUztcclxuICAgICAgICB0aGlzLmRyYXcoKTsgLy8gUmVkcmF3IGltbWVkaWF0ZWx5IGZvciBzdGF0ZSBjaGFuZ2VcclxuICAgIH1cclxuXHJcbiAgICAvLyBTdGFydHMgdGhlIGFjdHVhbCBnYW1lIHBsYXlcclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuYXNzZXRzLnBsYXlTb3VuZCgnYmdtX2xvb3AnLCB0cnVlKTsgLy8gU3RhcnQgQkdNIGxvb3BcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudExldmVsSW5kZXggPSAwOyAvLyBTdGFydCBmcm9tIGxldmVsIDAgZm9yIGEgbmV3IGdhbWVcclxuICAgICAgICB0aGlzLm5leHRMZXZlbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlc2V0cyBnYW1lLXNwZWNpZmljIHZhcmlhYmxlc1xyXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcFJlcXVlc3RJZCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCA9IDA7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5tYXRjaGVkUGFpcnMgPSAwO1xyXG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUaWxlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuYXNzZXRzLnN0b3BTb3VuZCgnYmdtX2xvb3AnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFbmRzIHRoZSBnYW1lIGFuZCBzaG93cyB0aGUgZ2FtZSBvdmVyIHNjcmVlblxyXG4gICAgcHJpdmF0ZSBnYW1lT3Zlcih3b246IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmFzc2V0cy5zdG9wU291bmQoJ2JnbV9sb29wJyk7XHJcbiAgICAgICAgdGhpcy5hc3NldHMucGxheVNvdW5kKCdnYW1lX292ZXInKTtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJvY2VlZHMgdG8gdGhlIG5leHQgbGV2ZWwgb3IgZW5kcyB0aGUgZ2FtZSBpZiBhbGwgbGV2ZWxzIGFyZSBjb21wbGV0ZVxyXG4gICAgcHJpdmF0ZSBuZXh0TGV2ZWwoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudExldmVsSW5kZXggPj0gdGhpcy5jb25maWcubGV2ZWxzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAvLyBBbGwgbGV2ZWxzIGNvbXBsZXRlZCwgcGxheWVyIHdpbnMhXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIodHJ1ZSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudExldmVsQ29uZmlnID0gdGhpcy5jb25maWcubGV2ZWxzW3RoaXMuY3VycmVudExldmVsSW5kZXhdO1xyXG4gICAgICAgIHRoaXMuY2FsY3VsYXRlQm9hcmREaW1lbnNpb25zKCk7IC8vIFJlY2FsY3VsYXRlIGJvYXJkIGJhc2VkIG9uIG5ldyBsZXZlbCBjb25maWdcclxuXHJcbiAgICAgICAgdGhpcy5yZW1haW5pbmdUaW1lID0gdGhpcy5jdXJyZW50TGV2ZWxDb25maWcudGltZUxpbWl0U2Vjb25kcztcclxuICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZXMgPSBbXTtcclxuICAgICAgICB0aGlzLm1hdGNoZWRQYWlycyA9IDA7XHJcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUJvYXJkKCk7IC8vIEdlbmVyYXRlIG5ldyBib2FyZCBmb3IgdGhlIGxldmVsXHJcblxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRMZXZlbEluZGV4ID4gMCkgeyAvLyBQbGF5IGxldmVsIGNvbXBsZXRlIHNvdW5kIGlmIG5vdCB0aGUgdmVyeSBmaXJzdCBsZXZlbFxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0cy5wbGF5U291bmQoJ2xldmVsX2NvbXBsZXRlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEdlbmVyYXRlcyBhIG5ldyBnYW1lIGJvYXJkIHdpdGggYW5pbWFsIHRpbGVzXHJcbiAgICBwcml2YXRlIGdlbmVyYXRlQm9hcmQoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgeyByb3dzLCBjb2xzLCBudW1BbmltYWxUeXBlcyB9ID0gdGhpcy5jdXJyZW50TGV2ZWxDb25maWc7XHJcblxyXG4gICAgICAgIC8vIEluaXRpYWxpemUgYm9hcmQgd2l0aCB6ZXJvc1xyXG4gICAgICAgIHRoaXMuYm9hcmQgPSBBcnJheShyb3dzKS5maWxsKDApLm1hcCgoKSA9PiBBcnJheShjb2xzKS5maWxsKDApKTtcclxuICAgICAgICBjb25zdCB0b3RhbFRpbGVzID0gcm93cyAqIGNvbHM7XHJcbiAgICAgICAgLy8gRW5zdXJlIHRvdGFsVGlsZXMgaXMgZXZlbiwgaWYgbm90LCBhZGp1c3QgbG9naWMgb3IgZGF0YSB0byBhdm9pZCBpc3N1ZXMuXHJcbiAgICAgICAgLy8gQXNzdW1pbmcgKHJvd3MgKiBjb2xzKSBpcyBhbHdheXMgZXZlbiBmb3IgcGFpciBtYXRjaGluZy5cclxuICAgICAgICB0aGlzLnRvdGFsUGFpcnMgPSB0b3RhbFRpbGVzIC8gMjtcclxuXHJcbiAgICAgICAgY29uc3QgYW5pbWFsUG9vbDogbnVtYmVyW10gPSBbXTtcclxuICAgICAgICAvLyBGaWxsIHRoZSBwb29sIHdpdGggcGFpcnMgb2YgYW5pbWFsIElEcyAoMSB0byBudW1BbmltYWxUeXBlcylcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudG90YWxQYWlyczsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFuaW1hbElkID0gKGkgJSBudW1BbmltYWxUeXBlcykgKyAxO1xyXG4gICAgICAgICAgICBhbmltYWxQb29sLnB1c2goYW5pbWFsSWQsIGFuaW1hbElkKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNodWZmbGUgdGhlIGFuaW1hbCBwb29sIHRvIHJhbmRvbWl6ZSB0aWxlIHBsYWNlbWVudFxyXG4gICAgICAgIGZvciAobGV0IGkgPSBhbmltYWxQb29sLmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgaiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChpICsgMSkpO1xyXG4gICAgICAgICAgICBbYW5pbWFsUG9vbFtpXSwgYW5pbWFsUG9vbFtqXV0gPSBbYW5pbWFsUG9vbFtqXSwgYW5pbWFsUG9vbFtpXV07IC8vIEVTNiBzd2FwXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgYm9hcmQgd2l0aCBzaHVmZmxlZCBhbmltYWwgSURzXHJcbiAgICAgICAgbGV0IHBvb2xJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9hcmRbcl1bY10gPSBhbmltYWxQb29sW3Bvb2xJbmRleCsrXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBIYW5kbGVzIGEgY2xpY2sgZXZlbnQgb24gdGhlIGdhbWUgYm9hcmQgZHVyaW5nIFBMQVlJTkcgc3RhdGVcclxuICAgIHByaXZhdGUgaGFuZGxlR2FtZUNsaWNrKG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHsgcm93cywgY29scyB9ID0gdGhpcy5jdXJyZW50TGV2ZWxDb25maWc7XHJcblxyXG4gICAgICAgIC8vIENvbnZlcnQgbW91c2UgY29vcmRpbmF0ZXMgdG8gZ3JpZCBjb29yZGluYXRlc1xyXG4gICAgICAgIGNvbnN0IGdyaWRYID0gTWF0aC5mbG9vcigobW91c2VYIC0gdGhpcy5ib2FyZE9mZnNldFgpIC8gdGhpcy50aWxlU2l6ZSk7XHJcbiAgICAgICAgY29uc3QgZ3JpZFkgPSBNYXRoLmZsb29yKChtb3VzZVkgLSB0aGlzLmJvYXJkT2Zmc2V0WSkgLyB0aGlzLnRpbGVTaXplKTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgY2xpY2sgaXMgb3V0c2lkZSBib2FyZCBib3VuZHNcclxuICAgICAgICBpZiAoZ3JpZFggPCAwIHx8IGdyaWRYID49IGNvbHMgfHwgZ3JpZFkgPCAwIHx8IGdyaWRZID49IHJvd3MpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY2xpY2tlZFRpbGVWYWx1ZSA9IHRoaXMuYm9hcmRbZ3JpZFldW2dyaWRYXTtcclxuXHJcbiAgICAgICAgLy8gRG8gbm90aGluZyBpZiBhbiBlbXB0eSB0aWxlIGlzIGNsaWNrZWRcclxuICAgICAgICBpZiAoY2xpY2tlZFRpbGVWYWx1ZSA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmFzc2V0cy5wbGF5U291bmQoJ3RpbGVfc2VsZWN0Jyk7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBjbGlja2VkIHRpbGUgaXMgYWxyZWFkeSBzZWxlY3RlZFxyXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nU2VsZWN0aW9uSW5kZXggPSB0aGlzLnNlbGVjdGVkVGlsZXMuZmluZEluZGV4KFxyXG4gICAgICAgICAgICB0aWxlID0+IHRpbGUueCA9PT0gZ3JpZFggJiYgdGlsZS55ID09PSBncmlkWVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmIChleGlzdGluZ1NlbGVjdGlvbkluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAvLyBEZXNlbGVjdCB0aGUgdGlsZSBpZiBpdCB3YXMgYWxyZWFkeSBzZWxlY3RlZFxyXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZXMuc3BsaWNlKGV4aXN0aW5nU2VsZWN0aW9uSW5kZXgsIDEpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIEFkZCB0aGUgdGlsZSB0byBzZWxlY3Rpb25cclxuICAgICAgICAgICAgdGhpcy5zZWxlY3RlZFRpbGVzLnB1c2goeyB4OiBncmlkWCwgeTogZ3JpZFkgfSk7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RlZFRpbGVzLmxlbmd0aCA9PT0gMikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgW3RpbGUxLCB0aWxlMl0gPSB0aGlzLnNlbGVjdGVkVGlsZXM7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSWYgc2FtZSB0aWxlIGNsaWNrZWQgdHdpY2UsIGRlc2VsZWN0IGJvdGhcclxuICAgICAgICAgICAgICAgIGlmICh0aWxlMS54ID09PSB0aWxlMi54ICYmIHRpbGUxLnkgPT09IHRpbGUyLnkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZXMgPSBbXTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIG1hdGNoIGFuZCBjb25uZWN0aW9uXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ib2FyZFt0aWxlMS55XVt0aWxlMS54XSA9PT0gdGhpcy5ib2FyZFt0aWxlMi55XVt0aWxlMi54XSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmNhbkNvbm5lY3QodGlsZTEueCwgdGlsZTEueSwgdGlsZTIueCwgdGlsZTIueSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHMucGxheVNvdW5kKCd0aWxlX21hdGNoJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gdGhpcy5jb25maWcubWF0Y2hTY29yZSAqIHRoaXMuY3VycmVudExldmVsQ29uZmlnLnNjb3JlTXVsdGlwbGllcjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVkUGFpcnMrKztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENsZWFyIHRoZSBtYXRjaGVkIHRpbGVzIGZyb20gdGhlIGJvYXJkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYm9hcmRbdGlsZTEueV1bdGlsZTEueF0gPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmJvYXJkW3RpbGUyLnldW3RpbGUyLnhdID0gMDtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0ZWRUaWxlcyA9IFtdOyAvLyBDbGVhciBzZWxlY3Rpb25cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFsbCBwYWlycyBhcmUgbWF0Y2hlZCBpbiB0aGUgY3VycmVudCBsZXZlbFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5tYXRjaGVkUGFpcnMgPT09IHRoaXMudG90YWxQYWlycykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCsrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXh0TGV2ZWwoKTsgLy8gR28gdG8gdGhlIG5leHQgbGV2ZWxcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE1pc21hdGNoOiB0aWxlcyBoYXZlIHNhbWUgdmFsdWUgYnV0IGNhbm5vdCBjb25uZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLnBsYXlTb3VuZCgnd3JvbmdfbWF0Y2gnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW1haW5pbmdUaW1lID0gTWF0aC5tYXgoMCwgdGhpcy5yZW1haW5pbmdUaW1lIC0gdGhpcy5jb25maWcucGVuYWx0eVRpbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZXMgPSBbXTsgLy8gRGVzZWxlY3QgYm90aFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gTWlzbWF0Y2g6IHRpbGVzIGhhdmUgZGlmZmVyZW50IHZhbHVlc1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLnBsYXlTb3VuZCgnd3JvbmdfbWF0Y2gnKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbWFpbmluZ1RpbWUgPSBNYXRoLm1heCgwLCB0aGlzLnJlbWFpbmluZ1RpbWUgLSB0aGlzLmNvbmZpZy5wZW5hbHR5VGltZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWxlY3RlZFRpbGVzID0gW107IC8vIERlc2VsZWN0IGJvdGhcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBIZWxwZXIgZm9yIHBhdGhmaW5kaW5nOiBDaGVja3MgaWYgYSBjZWxsIGlzIGVtcHR5IG9yIG9uZSBvZiB0aGUgcG9pbnRzIHRvIGJlIGlnbm9yZWRcclxuICAgIHByaXZhdGUgaXNDZWxsRW1wdHlPcklnbm9yZWQoY3g6IG51bWJlciwgY3k6IG51bWJlciwgaWdub3JlUG9pbnRzOiB7IHg6IG51bWJlciwgeTogbnVtYmVyIH1bXSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IHsgcm93cywgY29scyB9ID0gdGhpcy5jdXJyZW50TGV2ZWxDb25maWc7XHJcblxyXG4gICAgICAgIC8vIEEgY2VsbCBvdXRzaWRlIHRoZSBib2FyZCBpcyBjb25zaWRlcmVkICdlbXB0eScgZm9yIHBhdGhmaW5kaW5nIHB1cnBvc2VzXHJcbiAgICAgICAgaWYgKGN4IDwgMCB8fCBjeCA+PSBjb2xzIHx8IGN5IDwgMCB8fCBjeSA+PSByb3dzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGNlbGwgaXMgb25lIG9mIHRoZSBleHBsaWNpdGx5IGlnbm9yZWQgcG9pbnRzIChlLmcuLCB0aGUgc2VsZWN0ZWQgdGlsZXMgdGhlbXNlbHZlcylcclxuICAgICAgICBmb3IgKGNvbnN0IHAgb2YgaWdub3JlUG9pbnRzKSB7XHJcbiAgICAgICAgICAgIGlmIChwLnggPT09IGN4ICYmIHAueSA9PT0gY3kpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBPdGhlcndpc2UsIGNoZWNrIGlmIHRoZSBjZWxsIGlzIHRydWx5IGVtcHR5IG9uIHRoZSBib2FyZFxyXG4gICAgICAgIHJldHVybiB0aGlzLmJvYXJkW2N5XVtjeF0gPT09IDA7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGVscGVyIGZvciBwYXRoZmluZGluZzogQ2hlY2tzIGlmIGEgc3RyYWlnaHQgaG9yaXpvbnRhbCBvciB2ZXJ0aWNhbCBwYXRoIGJldHdlZW4gdHdvIHBvaW50cyBpcyBjbGVhclxyXG4gICAgcHJpdmF0ZSBjaGVja1N0cmFpZ2h0UGF0aCh4MTogbnVtYmVyLCB5MTogbnVtYmVyLCB4MjogbnVtYmVyLCB5MjogbnVtYmVyLCBpZ25vcmVQb2ludHM6IHsgeDogbnVtYmVyLCB5OiBudW1iZXIgfVtdKTogYm9vbGVhbiB7XHJcbiAgICAgICAgLy8gSWYgdGhlIHBhdGggaXMgYmV0d2VlbiBpZGVudGljYWwgb3IgYWRqYWNlbnQgY2VsbHMsIGl0J3MgY29uc2lkZXJlZCBjbGVhciAobm8gaW50ZXJtZWRpYXRlIGNlbGxzKVxyXG4gICAgICAgIGlmICgoeDEgPT09IHgyICYmIE1hdGguYWJzKHkxIC0geTIpIDw9IDEpIHx8ICh5MSA9PT0geTIgJiYgTWF0aC5hYnMoeDEgLSB4MikgPD0gMSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoeDEgPT09IHgyKSB7IC8vIFZlcnRpY2FsIHBhdGhcclxuICAgICAgICAgICAgY29uc3Qgc3RhcnRZID0gTWF0aC5taW4oeTEsIHkyKTtcclxuICAgICAgICAgICAgY29uc3QgZW5kWSA9IE1hdGgubWF4KHkxLCB5Mik7XHJcbiAgICAgICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBpbnRlcm1lZGlhdGUgY2VsbHNcclxuICAgICAgICAgICAgZm9yIChsZXQgeSA9IHN0YXJ0WSArIDE7IHkgPCBlbmRZOyB5KyspIHtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5pc0NlbGxFbXB0eU9ySWdub3JlZCh4MSwgeSwgaWdub3JlUG9pbnRzKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gUGF0aCBibG9ja2VkXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIFBhdGggaXMgY2xlYXJcclxuICAgICAgICB9IGVsc2UgaWYgKHkxID09PSB5MikgeyAvLyBIb3Jpem9udGFsIHBhdGhcclxuICAgICAgICAgICAgY29uc3Qgc3RhcnRYID0gTWF0aC5taW4oeDEsIHgyKTtcclxuICAgICAgICAgICAgY29uc3QgZW5kWCA9IE1hdGgubWF4KHgxLCB4Mik7XHJcbiAgICAgICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBpbnRlcm1lZGlhdGUgY2VsbHNcclxuICAgICAgICAgICAgZm9yIChsZXQgeCA9IHN0YXJ0WCArIDE7IHggPCBlbmRYOyB4KyspIHtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5pc0NlbGxFbXB0eU9ySWdub3JlZCh4LCB5MSwgaWdub3JlUG9pbnRzKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gUGF0aCBibG9ja2VkXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIFBhdGggaXMgY2xlYXJcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBOb3QgYSBzdHJhaWdodCBwYXRoXHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGV0ZXJtaW5lcyBpZiB0d28gdGlsZXMgYXQgKHgxLCB5MSkgYW5kICh4MiwgeTIpIGNhbiBiZSBjb25uZWN0ZWRcclxuICAgIHByaXZhdGUgY2FuQ29ubmVjdCh4MTogbnVtYmVyLCB5MTogbnVtYmVyLCB4MjogbnVtYmVyLCB5MjogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgaWdub3JlID0gW3sgeDogeDEsIHk6IHkxIH0sIHsgeDogeDIsIHk6IHkyIH1dOyAvLyBUaGUgc2VsZWN0ZWQgdGlsZXMgdGhlbXNlbHZlcyBkb24ndCBibG9jayBwYXRoc1xyXG5cclxuICAgICAgICAvLyAwLXR1cm4gY29ubmVjdGlvbiAoRGlyZWN0IGhvcml6b250YWwgb3IgdmVydGljYWwgcGF0aClcclxuICAgICAgICBpZiAodGhpcy5jaGVja1N0cmFpZ2h0UGF0aCh4MSwgeTEsIHgyLCB5MiwgaWdub3JlKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDEtdHVybiBjb25uZWN0aW9ucyAoTC1zaGFwZSBwYXRocylcclxuICAgICAgICAvLyBDaGVjayB2aWEgY29ybmVyICh4MSwgeTIpXHJcbiAgICAgICAgaWYgKHRoaXMuaXNDZWxsRW1wdHlPcklnbm9yZWQoeDEsIHkyLCBpZ25vcmUpICYmXHJcbiAgICAgICAgICAgIHRoaXMuY2hlY2tTdHJhaWdodFBhdGgoeDEsIHkxLCB4MSwgeTIsIGlnbm9yZSkgJiZcclxuICAgICAgICAgICAgdGhpcy5jaGVja1N0cmFpZ2h0UGF0aCh4MSwgeTIsIHgyLCB5MiwgaWdub3JlKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2hlY2sgdmlhIGNvcm5lciAoeDIsIHkxKVxyXG4gICAgICAgIGlmICh0aGlzLmlzQ2VsbEVtcHR5T3JJZ25vcmVkKHgyLCB5MSwgaWdub3JlKSAmJlxyXG4gICAgICAgICAgICB0aGlzLmNoZWNrU3RyYWlnaHRQYXRoKHgxLCB5MSwgeDIsIHkxLCBpZ25vcmUpICYmXHJcbiAgICAgICAgICAgIHRoaXMuY2hlY2tTdHJhaWdodFBhdGgoeDIsIHkxLCB4MiwgeTIsIGlnbm9yZSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyAyLXR1cm4gY29ubmVjdGlvbnMgKFogb3IgVS1zaGFwZSBwYXRocylcclxuICAgICAgICBjb25zdCB7IHJvd3MsIGNvbHMgfSA9IHRoaXMuY3VycmVudExldmVsQ29uZmlnO1xyXG5cclxuICAgICAgICAvLyBIb3Jpem9udGFsLVZlcnRpY2FsLUhvcml6b250YWwgKEhWSCkgcGF0aGluZzogKHgxLHkxKSAtPiAocHgseTEpIC0+IChweCx5MikgLT4gKHgyLHkyKVxyXG4gICAgICAgIC8vIEl0ZXJhdGUgdGhyb3VnaCBhbGwgcG9zc2libGUgaW50ZXJtZWRpYXRlIGNvbHVtbiBwb3NpdGlvbnMgKHB4KSwgaW5jbHVkaW5nIG91dHNpZGUgdGhlIGJvYXJkXHJcbiAgICAgICAgZm9yIChsZXQgcHggPSAtMTsgcHggPD0gY29sczsgcHgrKykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pc0NlbGxFbXB0eU9ySWdub3JlZChweCwgeTEsIGlnbm9yZSkgJiYgLy8gRmlyc3QgdHVybiBwb2ludFxyXG4gICAgICAgICAgICAgICAgdGhpcy5pc0NlbGxFbXB0eU9ySWdub3JlZChweCwgeTIsIGlnbm9yZSkgJiYgLy8gU2Vjb25kIHR1cm4gcG9pbnRcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tTdHJhaWdodFBhdGgoeDEsIHkxLCBweCwgeTEsIGlnbm9yZSkgJiYgLy8gUGF0aCBzZWdtZW50IDFcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tTdHJhaWdodFBhdGgocHgsIHkxLCBweCwgeTIsIGlnbm9yZSkgJiYgLy8gUGF0aCBzZWdtZW50IDJcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tTdHJhaWdodFBhdGgocHgsIHkyLCB4MiwgeTIsIGlnbm9yZSkpIHsgLy8gUGF0aCBzZWdtZW50IDNcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBWZXJ0aWNhbC1Ib3Jpem9udGFsLVZlcnRpY2FsIChWSFYpIHBhdGhpbmc6ICh4MSx5MSkgLT4gKHgxLHB5KSAtPiAoeDIscHkpIC0+ICh4Mix5MilcclxuICAgICAgICAvLyBJdGVyYXRlIHRocm91Z2ggYWxsIHBvc3NpYmxlIGludGVybWVkaWF0ZSByb3cgcG9zaXRpb25zIChweSksIGluY2x1ZGluZyBvdXRzaWRlIHRoZSBib2FyZFxyXG4gICAgICAgIGZvciAobGV0IHB5ID0gLTE7IHB5IDw9IHJvd3M7IHB5KyspIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaXNDZWxsRW1wdHlPcklnbm9yZWQoeDEsIHB5LCBpZ25vcmUpICYmIC8vIEZpcnN0IHR1cm4gcG9pbnRcclxuICAgICAgICAgICAgICAgIHRoaXMuaXNDZWxsRW1wdHlPcklnbm9yZWQoeDIsIHB5LCBpZ25vcmUpICYmIC8vIFNlY29uZCB0dXJuIHBvaW50XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrU3RyYWlnaHRQYXRoKHgxLCB5MSwgeDEsIHB5LCBpZ25vcmUpICYmIC8vIFBhdGggc2VnbWVudCAxXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrU3RyYWlnaHRQYXRoKHgxLCBweSwgeDIsIHB5LCBpZ25vcmUpICYmIC8vIFBhdGggc2VnbWVudCAyXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrU3RyYWlnaHRQYXRoKHgyLCBweSwgeDIsIHkyLCBpZ25vcmUpKSB7IC8vIFBhdGggc2VnbWVudCAzXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBObyB2YWxpZCBwYXRoIGZvdW5kXHJcbiAgICB9XHJcblxyXG4gICAgLy8gTWFpbiBnYW1lIGxvb3AsIGNvbnRpbnVvdXNseSB1cGRhdGVzIGFuZCBkcmF3cyB0aGUgZ2FtZVxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCA9IChjdXJyZW50VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCk6IHZvaWQgPT4ge1xyXG4gICAgICAgIGlmICghdGhpcy5sYXN0RnJhbWVUaW1lKSB7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RGcmFtZVRpbWUpIC8gMTAwMDsgLy8gRGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7IC8vIFVwZGF0ZSBnYW1lIGxvZ2ljXHJcbiAgICAgICAgdGhpcy5kcmF3KCk7ICAgICAgICAgIC8vIERyYXcgZ2FtZSBzdGF0ZVxyXG5cclxuICAgICAgICB0aGlzLmdhbWVMb29wUmVxdWVzdElkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBVcGRhdGVzIGdhbWUgbG9naWMsIGVzcGVjaWFsbHkgdGhlIHRpbWVyIGZvciBQTEFZSU5HIHN0YXRlXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5yZW1haW5pbmdUaW1lIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucmVtYWluaW5nVGltZSA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbWFpbmluZ1RpbWUgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcihmYWxzZSk7IC8vIFRpbWUgcmFuIG91dCwgcGxheWVyIGxvc2VzXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2xlYXJzIHRoZSBjYW52YXMgYW5kIGRyYXdzIHRoZSBjdXJyZW50IGdhbWUgc2NyZWVuIGJhc2VkIG9uIHN0YXRlXHJcbiAgICBwcml2YXRlIGRyYXcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IGJhY2tncm91bmQgaW1hZ2Ugb3IgYSBmYWxsYmFjayBjb2xvclxyXG4gICAgICAgIGNvbnN0IGJnSW1hZ2UgPSB0aGlzLmFzc2V0cy5nZXRJbWFnZSgnYmFja2dyb3VuZCcpO1xyXG4gICAgICAgIGlmIChiZ0ltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnI0FERDhFNic7IC8vIExpZ2h0IGJsdWUgZmFsbGJhY2tcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIC8vIFBhc3MgdHJ1ZSBmb3Igd2luIG9ubHkgaWYgYWxsIGxldmVscyBhcmUgY29tcGxldGVkLlxyXG4gICAgICAgICAgICAgICAgY29uc3Qgd29uR2FtZSA9IHRoaXMuY3VycmVudExldmVsSW5kZXggPj0gdGhpcy5jb25maWcubGV2ZWxzLmxlbmd0aCAmJiB0aGlzLm1hdGNoZWRQYWlycyA9PT0gdGhpcy50b3RhbFBhaXJzO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4od29uR2FtZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhd3MgdGhlIHRpdGxlIHNjcmVlbiBlbGVtZW50c1xyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDQ4cHggJHt0aGlzLmNvbmZpZy5nYW1lRm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7IC8vIENlbnRlciB0ZXh0IHZlcnRpY2FsbHlcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50aXRsZVNjcmVlblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMyk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvblRleHQgPSB0aGlzLmNvbmZpZy50aXRsZUJ1dHRvblRleHQ7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uV2lkdGggPSAyNDA7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uSGVpZ2h0ID0gNzA7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uWCA9ICh0aGlzLmNhbnZhcy53aWR0aCAtIGJ1dHRvbldpZHRoKSAvIDI7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uWSA9IHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MDtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZUJ1dHRvblJlY3QgPSB7IHg6IGJ1dHRvblgsIHk6IGJ1dHRvblksIHdpZHRoOiBidXR0b25XaWR0aCwgaGVpZ2h0OiBidXR0b25IZWlnaHQgfTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBidXR0b25cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmhvdmVyZWRCdXR0b24gPT09ICd0aXRsZScgPyB0aGlzLmNvbmZpZy51aUJ1dHRvbkhvdmVyQ29sb3IgOiB0aGlzLmNvbmZpZy51aUJ1dHRvbkNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJ1dHRvblgsIGJ1dHRvblksIGJ1dHRvbldpZHRoLCBidXR0b25IZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5jb25maWcudWlDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAzO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QoYnV0dG9uWCwgYnV0dG9uWSwgYnV0dG9uV2lkdGgsIGJ1dHRvbkhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgYnV0dG9uIHRleHRcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgMjhweCAke3RoaXMuY29uZmlnLmdhbWVGb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWlCdXR0b25UZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYnV0dG9uVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBidXR0b25ZICsgYnV0dG9uSGVpZ2h0IC8gMik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhd3MgdGhlIGluc3RydWN0aW9ucyBzY3JlZW4gZWxlbWVudHNcclxuICAgIHByaXZhdGUgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgMzZweCAke3RoaXMuY29uZmlnLmdhbWVGb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWlDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAndG9wJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIlx1QUM4Q1x1Qzc4NCBcdUJDMjlcdUJDOTVcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCA4MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjBweCAke3RoaXMuY29uZmlnLmdhbWVGb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIGNvbnN0IGluc3RydWN0aW9uTGluZXMgPSB0aGlzLmNvbmZpZy5pbnN0cnVjdGlvbnNUZXh0LnNwbGl0KCdcXG4nKTtcclxuICAgICAgICBsZXQgY3VycmVudFkgPSAxNDA7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRYID0gdGhpcy5jYW52YXMud2lkdGggLyAyIC0gMjUwOyAvLyBBZGp1c3QgZm9yIGxlZnQgYWxpZ25tZW50XHJcbiAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGluc3RydWN0aW9uTGluZXMpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgc3RhcnRYLCBjdXJyZW50WSk7XHJcbiAgICAgICAgICAgIGN1cnJlbnRZICs9IDI4OyAvLyBMaW5lIHNwYWNpbmdcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvblRleHQgPSB0aGlzLmNvbmZpZy5pbnN0cnVjdGlvbnNCdXR0b25UZXh0O1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbldpZHRoID0gMjQwO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbkhlaWdodCA9IDcwO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvblggPSAodGhpcy5jYW52YXMud2lkdGggLSBidXR0b25XaWR0aCkgLyAyO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvblkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLSAxMDA7XHJcblxyXG4gICAgICAgIHRoaXMuaW5zdHJ1Y3Rpb25zQnV0dG9uUmVjdCA9IHsgeDogYnV0dG9uWCwgeTogYnV0dG9uWSwgd2lkdGg6IGJ1dHRvbldpZHRoLCBoZWlnaHQ6IGJ1dHRvbkhlaWdodCB9O1xyXG5cclxuICAgICAgICAvLyBEcmF3IGJ1dHRvblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuaG92ZXJlZEJ1dHRvbiA9PT0gJ2luc3RydWN0aW9ucycgPyB0aGlzLmNvbmZpZy51aUJ1dHRvbkhvdmVyQ29sb3IgOiB0aGlzLmNvbmZpZy51aUJ1dHRvbkNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJ1dHRvblgsIGJ1dHRvblksIGJ1dHRvbldpZHRoLCBidXR0b25IZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5jb25maWcudWlDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAzO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QoYnV0dG9uWCwgYnV0dG9uWSwgYnV0dG9uV2lkdGgsIGJ1dHRvbkhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgYnV0dG9uIHRleHRcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgMjhweCAke3RoaXMuY29uZmlnLmdhbWVGb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWlCdXR0b25UZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYnV0dG9uVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBidXR0b25ZICsgYnV0dG9uSGVpZ2h0IC8gMik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhd3MgdGhlIGdhbWUgYm9hcmQgYW5kIFVJIGVsZW1lbnRzIGR1cmluZyBhY3RpdmUgZ2FtZXBsYXlcclxuICAgIHByaXZhdGUgZHJhd0dhbWVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgeyByb3dzLCBjb2xzIH0gPSB0aGlzLmN1cnJlbnRMZXZlbENvbmZpZztcclxuXHJcbiAgICAgICAgLy8gRHJhdyBib2FyZCB0aWxlc1xyXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcm93czsgcisrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhbmltYWxJZCA9IHRoaXMuYm9hcmRbcl1bY107XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc1NlbGVjdGVkID0gdGhpcy5zZWxlY3RlZFRpbGVzLnNvbWUodGlsZSA9PiB0aWxlLnggPT09IGMgJiYgdGlsZS55ID09PSByKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpbGUoYywgciwgYW5pbWFsSWQsIGlzU2VsZWN0ZWQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IFVJIGVsZW1lbnRzIChsZXZlbCwgc2NvcmUsIHRpbWUpXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWlDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgMjRweCAke3RoaXMuY29uZmlnLmdhbWVGb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICd0b3AnO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVCODA4XHVCQ0E4OiAke3RoaXMuY3VycmVudExldmVsSW5kZXggKyAxfWAsIDIwLCAyMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QzgxMFx1QzIxODogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIDIwLCA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICAgICAgY29uc3QgdGltZUNvbG9yID0gdGhpcy5yZW1haW5pbmdUaW1lIDw9IDEwID8gJ3JlZCcgOiB0aGlzLmNvbmZpZy51aUNvbG9yOyAvLyBDaGFuZ2UgdGltZXIgY29sb3IgaWYgbG93XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGltZUNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBcdUMyRENcdUFDMDQ6ICR7TWF0aC5tYXgoMCwgTWF0aC5mbG9vcih0aGlzLnJlbWFpbmluZ1RpbWUpKX1cdUNEMDhgLCB0aGlzLmNhbnZhcy53aWR0aCAtIDIwLCAyMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhd3MgYSBzaW5nbGUgYW5pbWFsIHRpbGUgb24gdGhlIGJvYXJkXHJcbiAgICBwcml2YXRlIGRyYXdUaWxlKGdyaWRYOiBudW1iZXIsIGdyaWRZOiBudW1iZXIsIGFuaW1hbElkOiBudW1iZXIsIGlzU2VsZWN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB4ID0gdGhpcy5ib2FyZE9mZnNldFggKyBncmlkWCAqIHRoaXMudGlsZVNpemUgKyB0aGlzLmNvbmZpZy50aWxlUGFkZGluZztcclxuICAgICAgICBjb25zdCB5ID0gdGhpcy5ib2FyZE9mZnNldFkgKyBncmlkWSAqIHRoaXMudGlsZVNpemUgKyB0aGlzLmNvbmZpZy50aWxlUGFkZGluZztcclxuICAgICAgICBjb25zdCBzaXplID0gdGhpcy50aWxlU2l6ZSAtIDIgKiB0aGlzLmNvbmZpZy50aWxlUGFkZGluZztcclxuXHJcbiAgICAgICAgaWYgKGFuaW1hbElkID09PSAwKSB7XHJcbiAgICAgICAgICAgIC8vIERyYXcgZW1wdHkgdGlsZSBiYWNrZ3JvdW5kXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjQ0NDJzsgLy8gTGlnaHQgZ3JleSBmb3IgZW1wdHlcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoeCwgeSwgc2l6ZSwgc2l6ZSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gR2V0IGFuaW1hbCBpbWFnZSBiYXNlZCBvbiBJRCAoZS5nLiwgXCJhbmltYWxfMVwiLCBcImFuaW1hbF8yXCIpXHJcbiAgICAgICAgICAgIGNvbnN0IGltYWdlTmFtZSA9IGBhbmltYWxfJHthbmltYWxJZH1gO1xyXG4gICAgICAgICAgICBjb25zdCBhbmltYWxJbWFnZSA9IHRoaXMuYXNzZXRzLmdldEltYWdlKGltYWdlTmFtZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoYW5pbWFsSW1hZ2UpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShhbmltYWxJbWFnZSwgeCwgeSwgc2l6ZSwgc2l6ZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBGYWxsYmFjayBmb3IgbWlzc2luZyBpbWFnZTogZHJhdyBhIGNvbG9yZWQgc3F1YXJlIHdpdGggSURcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjODg4JztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHgsIHksIHNpemUsIHNpemUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNGRkYnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGAxNnB4ICR7dGhpcy5jb25maWcuZ2FtZUZvbnR9YDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgPyAke2FuaW1hbElkfWAsIHggKyBzaXplIC8gMiwgeSArIHNpemUgLyAyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRHJhdyBzZWxlY3Rpb24gb3V0bGluZSBpZiB0aGUgdGlsZSBpcyBzZWxlY3RlZFxyXG4gICAgICAgIGlmIChpc1NlbGVjdGVkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5jb25maWcuc2VsZWN0ZWRUaWxlT3V0bGluZUNvbG9yO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSA0O1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KHgsIHksIHNpemUsIHNpemUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBEcmF3cyB0aGUgZ2FtZSBvdmVyIHNjcmVlbiAod2luIG9yIGxvc2UpXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbih3b246IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgNDhweCAke3RoaXMuY29uZmlnLmdhbWVGb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWlDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuXHJcbiAgICAgICAgLy8gRGlzcGxheSBhcHByb3ByaWF0ZSBtZXNzYWdlIGJhc2VkIG9uIHdpbi9sb3NzXHJcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IHdvbiA/IHRoaXMuY29uZmlnLmdhbWVPdmVyV2luVGV4dCA6IHRoaXMuY29uZmlnLmdhbWVPdmVyTG9zZVRleHQ7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNHB4ICR7dGhpcy5jb25maWcuZ2FtZUZvbnR9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDRDVDXHVDODg1IFx1QzgxMFx1QzIxODogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvblRleHQgPSB0aGlzLmNvbmZpZy5nYW1lT3ZlckJ1dHRvblRleHQ7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uV2lkdGggPSAyNDA7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uSGVpZ2h0ID0gNzA7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uWCA9ICh0aGlzLmNhbnZhcy53aWR0aCAtIGJ1dHRvbldpZHRoKSAvIDI7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uWSA9IHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAxMDA7XHJcblxyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJCdXR0b25SZWN0ID0geyB4OiBidXR0b25YLCB5OiBidXR0b25ZLCB3aWR0aDogYnV0dG9uV2lkdGgsIGhlaWdodDogYnV0dG9uSGVpZ2h0IH07XHJcblxyXG4gICAgICAgIC8vIERyYXcgYnV0dG9uXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5ob3ZlcmVkQnV0dG9uID09PSAnZ2FtZU92ZXInID8gdGhpcy5jb25maWcudWlCdXR0b25Ib3ZlckNvbG9yIDogdGhpcy5jb25maWcudWlCdXR0b25Db2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChidXR0b25YLCBidXR0b25ZLCBidXR0b25XaWR0aCwgYnV0dG9uSGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGJ1dHRvblgsIGJ1dHRvblksIGJ1dHRvbldpZHRoLCBidXR0b25IZWlnaHQpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IGJ1dHRvbiB0ZXh0XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDI4cHggJHt0aGlzLmNvbmZpZy5nYW1lRm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQnV0dG9uVGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGJ1dHRvblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgYnV0dG9uWSArIGJ1dHRvbkhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBHbG9iYWwgaW5pdGlhbGl6YXRpb24gbG9naWM6IGZldGNoZXMgZ2FtZSBjb25maWd1cmF0aW9uIGFuZCBzdGFydHMgdGhlIGdhbWVcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIGZldGNoKCdkYXRhLmpzb24nKVxyXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAudGhlbihkYXRhID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZ2FtZSA9IG5ldyBBbmltYWxDb25uZWN0R2FtZSgnZ2FtZUNhbnZhcycsIGRhdGEpO1xyXG4gICAgICAgICAgICBnYW1lLmluaXQoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgZ2FtZSBkYXRhOicsIGVycm9yKTtcclxuICAgICAgICAgICAgLy8gRGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGRpcmVjdGx5IG9uIHRoZSBjYW52YXMgaWYgbG9hZGluZyBmYWlsc1xyXG4gICAgICAgICAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgICAgICBjb25zdCBjdHggPSBjYW52YXM/LmdldENvbnRleHQoJzJkJyk7XHJcbiAgICAgICAgICAgIGlmIChjdHgpIHtcclxuICAgICAgICAgICAgICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICAgICAgICAgIGN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgICAgICAgICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgICAgICAgICAgY3R4LmZpbGxUZXh0KCdcdUFDOENcdUM3ODQgXHVCODVDXHVCNERDIFx1QzkxMSBcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREOiAnICsgZXJyb3IubWVzc2FnZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAg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
