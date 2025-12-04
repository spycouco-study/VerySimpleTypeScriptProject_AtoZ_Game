var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2["TITLE"] = "TITLE";
  GameState2["INSTRUCTIONS"] = "INSTRUCTIONS";
  GameState2["PLAYING"] = "PLAYING";
  GameState2["GAME_OVER"] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Game {
  constructor(canvasId) {
    this.gameState = "TITLE" /* TITLE */;
    this.lastFrameTime = 0;
    this.score = 0;
    this.timeLeft = 0;
    this.selectedBlock = null;
    this.isProcessingMove = false;
    // To prevent multiple moves/inputs during cascades
    this.gridOffsetX = 0;
    // New: X offset to center the grid
    this.gridOffsetY = 0;
    // New: Y offset to center the grid
    this.bgmAudio = null;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.assets = { images: /* @__PURE__ */ new Map(), sounds: /* @__PURE__ */ new Map() };
    this.canvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
    this.grid = [];
    this.loadConfig().then(() => {
      this.canvas.width = this.config.canvasWidth;
      this.canvas.height = this.config.canvasHeight;
      this.loadAssets().then(() => {
        this.calculateGridPosition();
        this.initGame();
        requestAnimationFrame(this.gameLoop.bind(this));
      });
    }).catch((error) => {
      console.error("Failed to load game configuration or assets:", error);
    });
  }
  async loadConfig() {
    const response = await fetch("data.json");
    this.config = await response.json();
  }
  async loadAssets() {
    const imagePromises = this.config.assets.images.map((img) => {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = img.path;
        image.onload = () => {
          this.assets.images.set(img.name, image);
          resolve();
        };
        image.onerror = () => reject(`Failed to load image: ${img.path}`);
      });
    });
    const soundPromises = this.config.assets.sounds.map((snd) => {
      return new Promise((resolve) => {
        const audio = new Audio(snd.path);
        audio.volume = snd.volume;
        audio.addEventListener("canplaythrough", () => {
          this.assets.sounds.set(snd.name, audio);
          resolve();
        }, { once: true });
        audio.load();
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
  }
  calculateGridPosition() {
    const { rows, cols, blockSize } = this.config.grid;
    const gridWidth = cols * blockSize;
    const gridHeight = rows * blockSize;
    this.gridOffsetX = (this.canvas.width - gridWidth) / 2;
    this.gridOffsetY = (this.canvas.height - gridHeight) / 2;
  }
  initGame() {
    this.gameState = "TITLE" /* TITLE */;
    this.score = this.config.gameplay.initialScore;
    this.timeLeft = this.config.gameplay.timeLimitSeconds;
    this.selectedBlock = null;
    this.isProcessingMove = false;
    this.playBGM();
  }
  startGame() {
    this.gameState = "PLAYING" /* PLAYING */;
    this.score = this.config.gameplay.initialScore;
    this.timeLeft = this.config.gameplay.timeLimitSeconds;
    this.selectedBlock = null;
    this.isProcessingMove = false;
    this.generateGrid();
    this.playBGM();
  }
  playBGM() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
    const bgm = this.assets.sounds.get("bgm_loop");
    if (bgm) {
      this.bgmAudio = bgm;
      this.bgmAudio.loop = true;
      this.bgmAudio.play().catch((e) => console.warn("BGM auto-play blocked:", e));
    }
  }
  gameLoop(timestamp) {
    if (!this.lastFrameTime) {
      this.lastFrameTime = timestamp;
    }
    const deltaTime = (timestamp - this.lastFrameTime) / 1e3;
    this.lastFrameTime = timestamp;
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    switch (this.gameState) {
      case "PLAYING" /* PLAYING */:
        if (this.timeLeft > 0) {
          this.timeLeft -= deltaTime;
        } else {
          this.timeLeft = 0;
          this.gameState = "GAME_OVER" /* GAME_OVER */;
          if (this.bgmAudio) this.bgmAudio.pause();
        }
        break;
    }
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.config.colors.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const gameBg = this.assets.images.get("game_bg");
    if (gameBg) {
      this.ctx.drawImage(gameBg, 0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.gameState) {
      case "TITLE" /* TITLE */:
        this.drawTitleScreen();
        break;
      case "INSTRUCTIONS" /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case "PLAYING" /* PLAYING */:
        this.drawGridAndBlocks();
        this.drawUI();
        break;
      case "GAME_OVER" /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  handleMouseDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    switch (this.gameState) {
      case "TITLE" /* TITLE */:
        this.gameState = "INSTRUCTIONS" /* INSTRUCTIONS */;
        break;
      case "INSTRUCTIONS" /* INSTRUCTIONS */:
        this.startGame();
        break;
      case "PLAYING" /* PLAYING */:
        if (this.isProcessingMove) return;
        const gridMouseX = mouseX - this.gridOffsetX;
        const gridMouseY = mouseY - this.gridOffsetY;
        const col = Math.floor(gridMouseX / this.config.grid.blockSize);
        const row = Math.floor(gridMouseY / this.config.grid.blockSize);
        if (row >= 0 && row < this.config.grid.rows && col >= 0 && col < this.config.grid.cols) {
          if (this.selectedBlock) {
            const sRow = this.selectedBlock.row;
            const sCol = this.selectedBlock.col;
            const isAdjacent = Math.abs(sRow - row) + Math.abs(sCol - col) === 1;
            if (isAdjacent) {
              this.isProcessingMove = true;
              this.trySwap(sRow, sCol, row, col);
            }
            this.selectedBlock = null;
          } else {
            this.selectedBlock = { row, col };
          }
        }
        break;
      case "GAME_OVER" /* GAME_OVER */:
        this.initGame();
        break;
    }
  }
  drawTitleScreen() {
    const titleBg = this.assets.images.get("title_bg");
    if (titleBg) {
      this.ctx.drawImage(titleBg, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.config.colors.overlay;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "bold 48px sans-serif";
    this.ctx.fillText(this.config.text.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.text.clickToStart, this.canvas.width / 2, this.canvas.height / 2 + 30);
  }
  drawInstructionsScreen() {
    const titleBg = this.assets.images.get("title_bg");
    if (titleBg) {
      this.ctx.drawImage(titleBg, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.config.colors.overlay;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "bold 36px sans-serif";
    this.ctx.fillText(this.config.text.instructionsTitle, this.canvas.width / 2, this.canvas.height / 2 - 100);
    this.ctx.font = "20px sans-serif";
    const lineHeight = 30;
    this.config.text.instructions.forEach((line, index) => {
      this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 - 50 + index * lineHeight);
    });
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.text.clickToStart, this.canvas.width / 2, this.canvas.height / 2 + 100);
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = this.config.colors.overlay;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "bold 48px sans-serif";
    this.ctx.fillText(this.config.text.gameOverTitle, this.canvas.width / 2, this.canvas.height / 2 - 80);
    this.ctx.font = "36px sans-serif";
    this.ctx.fillText(`${this.config.text.timeUp}`, this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.fillText(`${this.config.text.scoreLabel} ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 30);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.text.restartGame, this.canvas.width / 2, this.canvas.height / 2 + 100);
  }
  drawGridAndBlocks() {
    const { rows, cols, blockSize } = this.config.grid;
    const offsetX = this.gridOffsetX;
    const offsetY = this.gridOffsetY;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const blockType = this.grid[r][c];
        const x = c * blockSize + offsetX;
        const y = r * blockSize + offsetY;
        this.ctx.fillStyle = (r + c) % 2 === 0 ? "#AAD751" : "#A2D149";
        this.ctx.fillRect(x, y, blockSize, blockSize);
        if (blockType) {
          const blockImg = this.assets.images.get(blockType);
          if (blockImg) {
            this.ctx.drawImage(blockImg, x, y, blockSize, blockSize);
          }
        }
        if (this.selectedBlock && this.selectedBlock.row === r && this.selectedBlock.col === c) {
          this.ctx.strokeStyle = this.config.colors.selection;
          this.ctx.lineWidth = 4;
          this.ctx.strokeRect(x + 2, y + 2, blockSize - 4, blockSize - 4);
        }
      }
    }
  }
  drawUI() {
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "bold 24px sans-serif";
    this.ctx.fillText(`${this.config.text.scoreLabel} ${this.score}`, 10, this.canvas.height - 30);
    this.ctx.textAlign = "right";
    const displayTime = Math.max(0, Math.floor(this.timeLeft));
    this.ctx.fillText(`${this.config.text.timeLabel} ${displayTime}`, this.canvas.width - 10, this.canvas.height - 30);
  }
  generateGrid() {
    const { rows, cols } = this.config.grid;
    const blockNames = this.config.assets.images.filter((img) => img.name.startsWith("block_")).map((img) => img.name);
    this.grid = Array(rows).fill(0).map(() => Array(cols).fill(null));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let blockType;
        do {
          blockType = blockNames[Math.floor(Math.random() * blockNames.length)];
        } while (c >= this.config.gameplay.minMatch - 1 && this.grid[r][c - 1] === blockType && this.grid[r][c - 2] === blockType || // Check horizontal match
        r >= this.config.gameplay.minMatch - 1 && this.grid[r - 1][c] === blockType && this.grid[r - 2][c] === blockType);
        this.grid[r][c] = blockType;
      }
    }
  }
  getBlock(r, c) {
    if (r < 0 || r >= this.config.grid.rows || c < 0 || c >= this.config.grid.cols) {
      return null;
    }
    return this.grid[r][c];
  }
  setBlock(r, c, type) {
    if (r >= 0 && r < this.config.grid.rows && c >= 0 && c < this.config.grid.cols) {
      this.grid[r][c] = type;
    }
  }
  async trySwap(r1, c1, r2, c2) {
    const temp = this.getBlock(r1, c1);
    this.setBlock(r1, c1, this.getBlock(r2, c2));
    this.setBlock(r2, c2, temp);
    const matches = this.findAllMatches();
    if (matches.length > 0) {
      this.playMatchSound();
      this.score += matches.length * this.config.gameplay.scorePerMatch;
      await this.processMatchesAndCascades(matches);
    } else {
      const tempBack = this.getBlock(r1, c1);
      this.setBlock(r1, c1, this.getBlock(r2, c2));
      this.setBlock(r2, c2, tempBack);
    }
    this.isProcessingMove = false;
  }
  findAllMatches() {
    const matches = [];
    const { rows, cols } = this.config.grid;
    const minMatch = this.config.gameplay.minMatch;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const blockType = this.getBlock(r, c);
        if (blockType === null) continue;
        let horizontalMatchCount = 1;
        for (let i = 1; c + i < cols; i++) {
          if (this.getBlock(r, c + i) === blockType) {
            horizontalMatchCount++;
          } else {
            break;
          }
        }
        if (horizontalMatchCount >= minMatch) {
          for (let i = 0; i < horizontalMatchCount; i++) {
            if (!matches.some((m) => m.row === r && m.col === c + i)) {
              matches.push({ row: r, col: c + i });
            }
          }
        }
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const blockType = this.getBlock(r, c);
        if (blockType === null) continue;
        let verticalMatchCount = 1;
        for (let i = 1; r + i < rows; i++) {
          if (this.getBlock(r + i, c) === blockType) {
            verticalMatchCount++;
          } else {
            break;
          }
        }
        if (verticalMatchCount >= minMatch) {
          for (let i = 0; i < verticalMatchCount; i++) {
            if (!matches.some((m) => m.row === r + i && m.col === c)) {
              matches.push({ row: r + i, col: c });
            }
          }
        }
      }
    }
    return matches;
  }
  async processMatchesAndCascades(initialMatches) {
    let currentMatches = initialMatches;
    while (currentMatches.length > 0) {
      currentMatches.forEach(({ row, col }) => this.setBlock(row, col, null));
      await this.delay(100);
      this.dropBlocks();
      await this.delay(200);
      this.fillEmptyBlocks();
      await this.delay(100);
      currentMatches = this.findAllMatches();
      if (currentMatches.length > 0) {
        this.playMatchSound();
        this.score += currentMatches.length * this.config.gameplay.scorePerMatch;
      }
    }
  }
  dropBlocks() {
    const { rows, cols } = this.config.grid;
    for (let c = 0; c < cols; c++) {
      let emptySpaces = 0;
      for (let r = rows - 1; r >= 0; r--) {
        if (this.getBlock(r, c) === null) {
          emptySpaces++;
        } else if (emptySpaces > 0) {
          this.setBlock(r + emptySpaces, c, this.getBlock(r, c));
          this.setBlock(r, c, null);
        }
      }
    }
  }
  fillEmptyBlocks() {
    const { rows, cols } = this.config.grid;
    const blockNames = this.config.assets.images.filter((img) => img.name.startsWith("block_")).map((img) => img.name);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.getBlock(r, c) === null) {
          this.setBlock(r, c, blockNames[Math.floor(Math.random() * blockNames.length)]);
        }
      }
    }
  }
  playMatchSound() {
    const matchSound = this.assets.sounds.get("match_sound");
    if (matchSound) {
      const clone = matchSound.cloneNode(true);
      clone.volume = matchSound.volume;
      clone.play().catch((e) => console.warn("Match sound play blocked:", e));
    }
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new Game("gameCanvas");
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgZ3JpZDoge1xyXG4gICAgICAgIHJvd3M6IG51bWJlcjtcclxuICAgICAgICBjb2xzOiBudW1iZXI7XHJcbiAgICAgICAgYmxvY2tTaXplOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZ2FtZXBsYXk6IHtcclxuICAgICAgICB0aW1lTGltaXRTZWNvbmRzOiBudW1iZXI7XHJcbiAgICAgICAgbWluTWF0Y2g6IG51bWJlcjtcclxuICAgICAgICBzY29yZVBlck1hdGNoOiBudW1iZXI7XHJcbiAgICAgICAgaW5pdGlhbFNjb3JlOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY29sb3JzOiB7XHJcbiAgICAgICAgYmFja2dyb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIGdyaWRMaW5lOiBzdHJpbmc7XHJcbiAgICAgICAgdGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHNlbGVjdGlvbjogc3RyaW5nO1xyXG4gICAgICAgIG92ZXJsYXk6IHN0cmluZztcclxuICAgIH07XHJcbiAgICB0ZXh0OiB7XHJcbiAgICAgICAgdGl0bGU6IHN0cmluZztcclxuICAgICAgICBjbGlja1RvU3RhcnQ6IHN0cmluZztcclxuICAgICAgICBpbnN0cnVjdGlvbnNUaXRsZTogc3RyaW5nO1xyXG4gICAgICAgIGluc3RydWN0aW9uczogc3RyaW5nW107XHJcbiAgICAgICAgZ2FtZU92ZXJUaXRsZTogc3RyaW5nO1xyXG4gICAgICAgIHRpbWVVcDogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlTGFiZWw6IHN0cmluZztcclxuICAgICAgICB0aW1lTGFiZWw6IHN0cmluZztcclxuICAgICAgICByZXN0YXJ0R2FtZTogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogSW1hZ2VBc3NldFtdO1xyXG4gICAgICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG4gICAgfTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxudHlwZSBCbG9ja1R5cGUgPSBzdHJpbmcgfCBudWxsOyAvLyBVc2UgaW1hZ2UgbmFtZXMgYXMgYmxvY2sgdHlwZXMsIG51bGwgZm9yIGVtcHR5XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSA9ICdUSVRMRScsXHJcbiAgICBJTlNUUlVDVElPTlMgPSAnSU5TVFJVQ1RJT05TJyxcclxuICAgIFBMQVlJTkcgPSAnUExBWUlORycsXHJcbiAgICBHQU1FX09WRVIgPSAnR0FNRV9PVkVSJyxcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnOyAvLyBMb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PjtcclxuICAgICAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xyXG4gICAgfTtcclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICBwcml2YXRlIGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBncmlkOiBCbG9ja1R5cGVbXVtdO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgdGltZUxlZnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHNlbGVjdGVkQmxvY2s6IHsgcm93OiBudW1iZXI7IGNvbDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaXNQcm9jZXNzaW5nTW92ZTogYm9vbGVhbiA9IGZhbHNlOyAvLyBUbyBwcmV2ZW50IG11bHRpcGxlIG1vdmVzL2lucHV0cyBkdXJpbmcgY2FzY2FkZXNcclxuXHJcbiAgICBwcml2YXRlIGdyaWRPZmZzZXRYOiBudW1iZXIgPSAwOyAvLyBOZXc6IFggb2Zmc2V0IHRvIGNlbnRlciB0aGUgZ3JpZFxyXG4gICAgcHJpdmF0ZSBncmlkT2Zmc2V0WTogbnVtYmVyID0gMDsgLy8gTmV3OiBZIG9mZnNldCB0byBjZW50ZXIgdGhlIGdyaWRcclxuXHJcbiAgICBwcml2YXRlIGJnbUF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgd2l0aCBJRCAnJHtjYW52YXNJZH0nIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmFzc2V0cyA9IHsgaW1hZ2VzOiBuZXcgTWFwKCksIHNvdW5kczogbmV3IE1hcCgpIH07XHJcblxyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBJbml0aWFsaXplIGdyaWQgYXMgYW4gZW1wdHkgYXJyYXksIHdpbGwgYmUgcG9wdWxhdGVkIGFmdGVyIGNvbmZpZy9hc3NldHMgbG9hZFxyXG4gICAgICAgIHRoaXMuZ3JpZCA9IFtdO1xyXG5cclxuICAgICAgICB0aGlzLmxvYWRDb25maWcoKS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgICAgICB0aGlzLmxvYWRBc3NldHMoKS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FsY3VsYXRlR3JpZFBvc2l0aW9uKCk7IC8vIE5ldzogQ2FsY3VsYXRlIGdyaWQgcG9zaXRpb24gYWZ0ZXIgY2FudmFzIHNpemUgaXMgc2V0XHJcbiAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uIG9yIGFzc2V0czpcIiwgZXJyb3IpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1hZ2Uuc3JjID0gaW1nLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuaW1hZ2VzLnNldChpbWcubmFtZSwgaW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWcucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzbmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNuZC5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5dGhyb3VnaCcsICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHMuc2V0KHNuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfSwgeyBvbmNlOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9hZCgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkFsbCBhc3NldHMgbG9hZGVkLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNhbGN1bGF0ZUdyaWRQb3NpdGlvbigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB7IHJvd3MsIGNvbHMsIGJsb2NrU2l6ZSB9ID0gdGhpcy5jb25maWcuZ3JpZDtcclxuICAgICAgICBjb25zdCBncmlkV2lkdGggPSBjb2xzICogYmxvY2tTaXplO1xyXG4gICAgICAgIGNvbnN0IGdyaWRIZWlnaHQgPSByb3dzICogYmxvY2tTaXplO1xyXG5cclxuICAgICAgICB0aGlzLmdyaWRPZmZzZXRYID0gKHRoaXMuY2FudmFzLndpZHRoIC0gZ3JpZFdpZHRoKSAvIDI7XHJcbiAgICAgICAgdGhpcy5ncmlkT2Zmc2V0WSA9ICh0aGlzLmNhbnZhcy5oZWlnaHQgLSBncmlkSGVpZ2h0KSAvIDI7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gdGhpcy5jb25maWcuZ2FtZXBsYXkuaW5pdGlhbFNjb3JlO1xyXG4gICAgICAgIHRoaXMudGltZUxlZnQgPSB0aGlzLmNvbmZpZy5nYW1lcGxheS50aW1lTGltaXRTZWNvbmRzO1xyXG4gICAgICAgIHRoaXMuc2VsZWN0ZWRCbG9jayA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5pc1Byb2Nlc3NpbmdNb3ZlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5wbGF5QkdNKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLnNjb3JlID0gdGhpcy5jb25maWcuZ2FtZXBsYXkuaW5pdGlhbFNjb3JlO1xyXG4gICAgICAgIHRoaXMudGltZUxlZnQgPSB0aGlzLmNvbmZpZy5nYW1lcGxheS50aW1lTGltaXRTZWNvbmRzO1xyXG4gICAgICAgIHRoaXMuc2VsZWN0ZWRCbG9jayA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5pc1Byb2Nlc3NpbmdNb3ZlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUdyaWQoKTtcclxuICAgICAgICB0aGlzLnBsYXlCR00oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlCR00oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGJnbSA9IHRoaXMuYXNzZXRzLnNvdW5kcy5nZXQoJ2JnbV9sb29wJyk7XHJcbiAgICAgICAgaWYgKGJnbSkge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gYmdtO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkJHTSBhdXRvLXBsYXkgYmxvY2tlZDpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxhc3RGcmFtZVRpbWUpIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gdGltZXN0YW1wO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZXN0YW1wIC0gdGhpcy5sYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSB0aW1lc3RhbXA7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50aW1lTGVmdCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWVMZWZ0IC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lTGVmdCA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgLy8gTm8gdXBkYXRlcyBmb3Igb3RoZXIgc3RhdGVzIG5lZWRlZCBmb3Igbm93XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5jb2xvcnMuYmFja2dyb3VuZDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBiYWNrZ3JvdW5kIGltYWdlIGlmIGF2YWlsYWJsZVxyXG4gICAgICAgIGNvbnN0IGdhbWVCZyA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQoJ2dhbWVfYmcnKTtcclxuICAgICAgICBpZiAoZ2FtZUJnKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShnYW1lQmcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dyaWRBbmRCbG9ja3MoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1VJKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZU1vdXNlRG93bihldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IG1vdXNlWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc1Byb2Nlc3NpbmdNb3ZlKSByZXR1cm47IC8vIElnbm9yZSBpbnB1dCBpZiBnYW1lIGlzIHByb2Nlc3NpbmcgYSBtb3ZlXHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQWRqdXN0IG1vdXNlIGNvb3JkaW5hdGVzIGJ5IGdyaWQgb2Zmc2V0XHJcbiAgICAgICAgICAgICAgICBjb25zdCBncmlkTW91c2VYID0gbW91c2VYIC0gdGhpcy5ncmlkT2Zmc2V0WDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdyaWRNb3VzZVkgPSBtb3VzZVkgLSB0aGlzLmdyaWRPZmZzZXRZO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbCA9IE1hdGguZmxvb3IoZ3JpZE1vdXNlWCAvIHRoaXMuY29uZmlnLmdyaWQuYmxvY2tTaXplKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoZ3JpZE1vdXNlWSAvIHRoaXMuY29uZmlnLmdyaWQuYmxvY2tTaXplKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAocm93ID49IDAgJiYgcm93IDwgdGhpcy5jb25maWcuZ3JpZC5yb3dzICYmIGNvbCA+PSAwICYmIGNvbCA8IHRoaXMuY29uZmlnLmdyaWQuY29scykge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNlbGVjdGVkQmxvY2spIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc1JvdyA9IHRoaXMuc2VsZWN0ZWRCbG9jay5yb3c7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNDb2wgPSB0aGlzLnNlbGVjdGVkQmxvY2suY29sO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYWRqYWNlbnRcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNBZGphY2VudCA9IChNYXRoLmFicyhzUm93IC0gcm93KSArIE1hdGguYWJzKHNDb2wgLSBjb2wpKSA9PT0gMTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0FkamFjZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlzUHJvY2Vzc2luZ01vdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50cnlTd2FwKHNSb3csIHNDb2wsIHJvdywgY29sKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkQmxvY2sgPSBudWxsOyAvLyBEZXNlbGVjdCBhZnRlciBhdHRlbXB0ZWQgc3dhcFxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0ZWRCbG9jayA9IHsgcm93LCBjb2wgfTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5pbml0R2FtZSgpOyAvLyBHbyBiYWNrIHRvIHRpdGxlIHNjcmVlblxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHRpdGxlQmcgPSB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KCd0aXRsZV9iZycpO1xyXG4gICAgICAgIGlmICh0aXRsZUJnKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZSh0aXRsZUJnLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5jb2xvcnMub3ZlcmxheTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5jb2xvcnMudGV4dDtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJ2JvbGQgNDhweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50ZXh0LnRpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50ZXh0LmNsaWNrVG9TdGFydCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMzApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB0aXRsZUJnID0gdGhpcy5hc3NldHMuaW1hZ2VzLmdldCgndGl0bGVfYmcnKTtcclxuICAgICAgICBpZiAodGl0bGVCZykge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UodGl0bGVCZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLm92ZXJsYXk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLnRleHQ7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDM2cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5pbnN0cnVjdGlvbnNUaXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyMHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIGNvbnN0IGxpbmVIZWlnaHQgPSAzMDtcclxuICAgICAgICB0aGlzLmNvbmZpZy50ZXh0Lmluc3RydWN0aW9ucy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChsaW5lLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCArIGluZGV4ICogbGluZUhlaWdodCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50ZXh0LmNsaWNrVG9TdGFydCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5jb2xvcnMub3ZlcmxheTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLnRleHQ7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5nYW1lT3ZlclRpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzZweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLmNvbmZpZy50ZXh0LnRpbWVVcH1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAyMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudGV4dC5zY29yZUxhYmVsfSAke3RoaXMuc2NvcmV9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMzApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5yZXN0YXJ0R2FtZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHcmlkQW5kQmxvY2tzKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHsgcm93cywgY29scywgYmxvY2tTaXplIH0gPSB0aGlzLmNvbmZpZy5ncmlkO1xyXG4gICAgICAgIGNvbnN0IG9mZnNldFggPSB0aGlzLmdyaWRPZmZzZXRYOyAvLyBVc2Ugc3RvcmVkIG9mZnNldFxyXG4gICAgICAgIGNvbnN0IG9mZnNldFkgPSB0aGlzLmdyaWRPZmZzZXRZOyAvLyBVc2Ugc3RvcmVkIG9mZnNldFxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERyYXcgZ3JpZCBiYWNrZ3JvdW5kIGFuZCBibG9ja3NcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHJvd3M7IHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IGNvbHM7IGMrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmxvY2tUeXBlID0gdGhpcy5ncmlkW3JdW2NdO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeCA9IGMgKiBibG9ja1NpemUgKyBvZmZzZXRYOyAvLyBBcHBseSBvZmZzZXRcclxuICAgICAgICAgICAgICAgIGNvbnN0IHkgPSByICogYmxvY2tTaXplICsgb2Zmc2V0WTsgLy8gQXBwbHkgb2Zmc2V0XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBjZWxsIGJhY2tncm91bmQgZm9yIGNoZWNrZXJib2FyZCBlZmZlY3RcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IChyICsgYykgJSAyID09PSAwID8gJyNBQUQ3NTEnIDogJyNBMkQxNDknO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoeCwgeSwgYmxvY2tTaXplLCBibG9ja1NpemUpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChibG9ja1R5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBibG9ja0ltZyA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQoYmxvY2tUeXBlKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYmxvY2tJbWcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJsb2NrSW1nLCB4LCB5LCBibG9ja1NpemUsIGJsb2NrU2l6ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIERyYXcgc2VsZWN0aW9uIGhpZ2hsaWdodFxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2VsZWN0ZWRCbG9jayAmJiB0aGlzLnNlbGVjdGVkQmxvY2sucm93ID09PSByICYmIHRoaXMuc2VsZWN0ZWRCbG9jay5jb2wgPT09IGMpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy5zZWxlY3Rpb247XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gNDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KHggKyAyLCB5ICsgMiwgYmxvY2tTaXplIC0gNCwgYmxvY2tTaXplIC0gNCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VUkoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy50ZXh0O1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnYm9sZCAyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnRleHQuc2NvcmVMYWJlbH0gJHt0aGlzLnNjb3JlfWAsIDEwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLSAzMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICAgICAgY29uc3QgZGlzcGxheVRpbWUgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMudGltZUxlZnQpKTsgLy8gTm8gbmVnYXRpdmUgdGltZSBkaXNwbGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudGV4dC50aW1lTGFiZWx9ICR7ZGlzcGxheVRpbWV9YCwgdGhpcy5jYW52YXMud2lkdGggLSAxMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMzApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2VuZXJhdGVHcmlkKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHsgcm93cywgY29scyB9ID0gdGhpcy5jb25maWcuZ3JpZDtcclxuICAgICAgICBjb25zdCBibG9ja05hbWVzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5maWx0ZXIoaW1nID0+IGltZy5uYW1lLnN0YXJ0c1dpdGgoJ2Jsb2NrXycpKS5tYXAoaW1nID0+IGltZy5uYW1lKTtcclxuICAgICAgICB0aGlzLmdyaWQgPSBBcnJheShyb3dzKS5maWxsKDApLm1hcCgoKSA9PiBBcnJheShjb2xzKS5maWxsKG51bGwpKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGxldCBibG9ja1R5cGU6IEJsb2NrVHlwZTtcclxuICAgICAgICAgICAgICAgIGRvIHtcclxuICAgICAgICAgICAgICAgICAgICBibG9ja1R5cGUgPSBibG9ja05hbWVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGJsb2NrTmFtZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgICAgICB9IHdoaWxlIChcclxuICAgICAgICAgICAgICAgICAgICAoYyA+PSB0aGlzLmNvbmZpZy5nYW1lcGxheS5taW5NYXRjaCAtMSAmJiB0aGlzLmdyaWRbcl1bYyAtIDFdID09PSBibG9ja1R5cGUgJiYgdGhpcy5ncmlkW3JdW2MgLSAyXSA9PT0gYmxvY2tUeXBlKSB8fCAvLyBDaGVjayBob3Jpem9udGFsIG1hdGNoXHJcbiAgICAgICAgICAgICAgICAgICAgKHIgPj0gdGhpcy5jb25maWcuZ2FtZXBsYXkubWluTWF0Y2ggLTEgJiYgdGhpcy5ncmlkW3IgLSAxXVtjXSA9PT0gYmxvY2tUeXBlICYmIHRoaXMuZ3JpZFtyIC0gMl1bY10gPT09IGJsb2NrVHlwZSkgICAgLy8gQ2hlY2sgdmVydGljYWwgbWF0Y2hcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdyaWRbcl1bY10gPSBibG9ja1R5cGU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRCbG9jayhyOiBudW1iZXIsIGM6IG51bWJlcik6IEJsb2NrVHlwZSB7XHJcbiAgICAgICAgaWYgKHIgPCAwIHx8IHIgPj0gdGhpcy5jb25maWcuZ3JpZC5yb3dzIHx8IGMgPCAwIHx8IGMgPj0gdGhpcy5jb25maWcuZ3JpZC5jb2xzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5ncmlkW3JdW2NdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0QmxvY2socjogbnVtYmVyLCBjOiBudW1iZXIsIHR5cGU6IEJsb2NrVHlwZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChyID49IDAgJiYgciA8IHRoaXMuY29uZmlnLmdyaWQucm93cyAmJiBjID49IDAgJiYgYyA8IHRoaXMuY29uZmlnLmdyaWQuY29scykge1xyXG4gICAgICAgICAgICB0aGlzLmdyaWRbcl1bY10gPSB0eXBlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHRyeVN3YXAocjE6IG51bWJlciwgYzE6IG51bWJlciwgcjI6IG51bWJlciwgYzI6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IHRlbXAgPSB0aGlzLmdldEJsb2NrKHIxLCBjMSk7XHJcbiAgICAgICAgdGhpcy5zZXRCbG9jayhyMSwgYzEsIHRoaXMuZ2V0QmxvY2socjIsIGMyKSk7XHJcbiAgICAgICAgdGhpcy5zZXRCbG9jayhyMiwgYzIsIHRlbXApO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBmb3IgbWF0Y2hlcyBhZnRlciB0ZW1wb3Jhcnkgc3dhcFxyXG4gICAgICAgIGNvbnN0IG1hdGNoZXMgPSB0aGlzLmZpbmRBbGxNYXRjaGVzKCk7XHJcblxyXG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5TWF0Y2hTb3VuZCgpO1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlICs9IG1hdGNoZXMubGVuZ3RoICogdGhpcy5jb25maWcuZ2FtZXBsYXkuc2NvcmVQZXJNYXRjaDtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzTWF0Y2hlc0FuZENhc2NhZGVzKG1hdGNoZXMpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIE5vIG1hdGNoLCBzd2FwIGJhY2tcclxuICAgICAgICAgICAgY29uc3QgdGVtcEJhY2sgPSB0aGlzLmdldEJsb2NrKHIxLCBjMSk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0QmxvY2socjEsIGMxLCB0aGlzLmdldEJsb2NrKHIyLCBjMikpO1xyXG4gICAgICAgICAgICB0aGlzLnNldEJsb2NrKHIyLCBjMiwgdGVtcEJhY2spO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmlzUHJvY2Vzc2luZ01vdmUgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbmRBbGxNYXRjaGVzKCk6IHsgcm93OiBudW1iZXIsIGNvbDogbnVtYmVyIH1bXSB7XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlczogeyByb3c6IG51bWJlciwgY29sOiBudW1iZXIgfVtdID0gW107XHJcbiAgICAgICAgY29uc3QgeyByb3dzLCBjb2xzIH0gPSB0aGlzLmNvbmZpZy5ncmlkO1xyXG4gICAgICAgIGNvbnN0IG1pbk1hdGNoID0gdGhpcy5jb25maWcuZ2FtZXBsYXkubWluTWF0Y2g7XHJcbiAgICBcclxuICAgICAgICAvLyBIb3Jpem9udGFsIG1hdGNoZXNcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHJvd3M7IHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IGNvbHM7IGMrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmxvY2tUeXBlID0gdGhpcy5nZXRCbG9jayhyLCBjKTtcclxuICAgICAgICAgICAgICAgIGlmIChibG9ja1R5cGUgPT09IG51bGwpIGNvbnRpbnVlO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICBsZXQgaG9yaXpvbnRhbE1hdGNoQ291bnQgPSAxO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGMgKyBpIDwgY29sczsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2V0QmxvY2sociwgYyArIGkpID09PSBibG9ja1R5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaG9yaXpvbnRhbE1hdGNoQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoaG9yaXpvbnRhbE1hdGNoQ291bnQgPj0gbWluTWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGhvcml6b250YWxNYXRjaENvdW50OyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFtYXRjaGVzLnNvbWUobSA9PiBtLnJvdyA9PT0gciAmJiBtLmNvbCA9PT0gYyArIGkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goeyByb3c6IHIsIGNvbDogYyArIGkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAvLyBWZXJ0aWNhbCBtYXRjaGVzXHJcbiAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByb3dzOyByKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrVHlwZSA9IHRoaXMuZ2V0QmxvY2sociwgYyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoYmxvY2tUeXBlID09PSBudWxsKSBjb250aW51ZTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgbGV0IHZlcnRpY2FsTWF0Y2hDb3VudCA9IDE7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgciArIGkgPCByb3dzOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5nZXRCbG9jayhyICsgaSwgYykgPT09IGJsb2NrVHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0aWNhbE1hdGNoQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodmVydGljYWxNYXRjaENvdW50ID49IG1pbk1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0aWNhbE1hdGNoQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1hdGNoZXMuc29tZShtID0+IG0ucm93ID09PSByICsgaSAmJiBtLmNvbCA9PT0gYykpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaCh7IHJvdzogciArIGksIGNvbDogYyB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0Y2hlcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzTWF0Y2hlc0FuZENhc2NhZGVzKGluaXRpYWxNYXRjaGVzOiB7IHJvdzogbnVtYmVyLCBjb2w6IG51bWJlciB9W10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBsZXQgY3VycmVudE1hdGNoZXMgPSBpbml0aWFsTWF0Y2hlcztcclxuXHJcbiAgICAgICAgd2hpbGUgKGN1cnJlbnRNYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIG1hdGNoZWQgYmxvY2tzXHJcbiAgICAgICAgICAgIGN1cnJlbnRNYXRjaGVzLmZvckVhY2goKHsgcm93LCBjb2wgfSkgPT4gdGhpcy5zZXRCbG9jayhyb3csIGNvbCwgbnVsbCkpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDEwMCk7IC8vIFNtYWxsIGRlbGF5IGZvciB2aXN1YWwgZWZmZWN0IG9mIGJsb2NrcyBkaXNhcHBlYXJpbmdcclxuXHJcbiAgICAgICAgICAgIC8vIERyb3AgYmxvY2tzXHJcbiAgICAgICAgICAgIHRoaXMuZHJvcEJsb2NrcygpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDIwMCk7IC8vIFNtYWxsIGRlbGF5IGZvciB2aXN1YWwgZWZmZWN0IG9mIGJsb2NrcyBmYWxsaW5nXHJcblxyXG4gICAgICAgICAgICAvLyBGaWxsIG5ldyBibG9ja3NcclxuICAgICAgICAgICAgdGhpcy5maWxsRW1wdHlCbG9ja3MoKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxheSgxMDApOyAvLyBTbWFsbCBkZWxheSBmb3IgdmlzdWFsIGVmZmVjdCBvZiBuZXcgYmxvY2tzIGFwcGVhcmluZ1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIG5ldyBjYXNjYWRlIG1hdGNoZXNcclxuICAgICAgICAgICAgY3VycmVudE1hdGNoZXMgPSB0aGlzLmZpbmRBbGxNYXRjaGVzKCk7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50TWF0Y2hlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlNYXRjaFNvdW5kKCk7IC8vIFBsYXkgc291bmQgZm9yIGNhc2NhZGUgbWF0Y2hlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSBjdXJyZW50TWF0Y2hlcy5sZW5ndGggKiB0aGlzLmNvbmZpZy5nYW1lcGxheS5zY29yZVBlck1hdGNoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJvcEJsb2NrcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB7IHJvd3MsIGNvbHMgfSA9IHRoaXMuY29uZmlnLmdyaWQ7XHJcbiAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgbGV0IGVtcHR5U3BhY2VzID0gMDtcclxuICAgICAgICAgICAgZm9yIChsZXQgciA9IHJvd3MgLSAxOyByID49IDA7IHItLSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2V0QmxvY2sociwgYykgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbXB0eVNwYWNlcysrO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChlbXB0eVNwYWNlcyA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBNb3ZlIGJsb2NrIGRvd24gYnkgYGVtcHR5U3BhY2VzYCBhbW91bnRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldEJsb2NrKHIgKyBlbXB0eVNwYWNlcywgYywgdGhpcy5nZXRCbG9jayhyLCBjKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRCbG9jayhyLCBjLCBudWxsKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbGxFbXB0eUJsb2NrcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB7IHJvd3MsIGNvbHMgfSA9IHRoaXMuY29uZmlnLmdyaWQ7XHJcbiAgICAgICAgY29uc3QgYmxvY2tOYW1lcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMuZmlsdGVyKGltZyA9PiBpbWcubmFtZS5zdGFydHNXaXRoKCdibG9ja18nKSkubWFwKGltZyA9PiBpbWcubmFtZSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcm93czsgcisrKSB7IC8vIEl0ZXJhdGUgZnJvbSB0b3AgdG8gYm90dG9tXHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5nZXRCbG9jayhyLCBjKSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0QmxvY2sociwgYywgYmxvY2tOYW1lc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBibG9ja05hbWVzLmxlbmd0aCldKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlNYXRjaFNvdW5kKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG1hdGNoU291bmQgPSB0aGlzLmFzc2V0cy5zb3VuZHMuZ2V0KCdtYXRjaF9zb3VuZCcpO1xyXG4gICAgICAgIGlmIChtYXRjaFNvdW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gbWF0Y2hTb3VuZC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gbWF0Y2hTb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIk1hdGNoIHNvdW5kIHBsYXkgYmxvY2tlZDpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRlbGF5KG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBpbml0aWFsaXphdGlvblxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQXNEQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxXQUFBLFdBQVE7QUFDUixFQUFBQSxXQUFBLGtCQUFlO0FBQ2YsRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxlQUFZO0FBSlgsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxLQUFLO0FBQUEsRUFzQlAsWUFBWSxVQUFrQjtBQWQ5QixTQUFRLFlBQXVCO0FBQy9CLFNBQVEsZ0JBQXdCO0FBR2hDLFNBQVEsUUFBZ0I7QUFDeEIsU0FBUSxXQUFtQjtBQUMzQixTQUFRLGdCQUFxRDtBQUM3RCxTQUFRLG1CQUE0QjtBQUVwQztBQUFBLFNBQVEsY0FBc0I7QUFDOUI7QUFBQSxTQUFRLGNBQXNCO0FBRTlCO0FBQUEsU0FBUSxXQUFvQztBQUd4QyxTQUFLLFNBQVMsU0FBUyxlQUFlLFFBQVE7QUFDOUMsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNkLFlBQU0sSUFBSSxN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SUFDSjtBQUFBLEVBQ0o7QUFBQSxFQUVRLGFBQW1CO0FBQ3ZCLFVBQU0sRUFBRSxNQUFNLEtBQUssSUFBSSxLQUFLLE9BQU87QUFDbkMsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLEtBQUs7QUFDM0IsVUFBSSxjQUFjO0FBQ2xCLGVBQVMsSUFBSSxPQUFPLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDaEMsWUFBSSxLQUFLLFNBQVMsR0FBRyxDQUFDLE1BQU0sTUFBTTtBQUM5QjtBQUFBLFFBQ0osV0FBVyxjQUFjLEdBQUc7QUFFeEIsZUFBSyxTQUFTLElBQUksYUFBYSxHQUFHLEtBQUssU0FBUyxHQUFHLENBQUMsQ0FBQztBQUNyRCxlQUFLLFNBQVMsR0FBRyxHQUFHLElBQUk7QUFBQSxRQUM1QjtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBLEVBRVEsa0JBQXdCO0FBQzVCLFVBQU0sRUFBRSxNQUFNLEtBQUssSUFBSSxLQUFLLE9BQU87QUFDbkMsVUFBTSxhQUFhLEtBQUssT0FBTyxPQUFPLE9BQU8sT0FBTyxTQUFPLElBQUksS0FBSyxXQUFXLFFBQVEsQ0FBQyxFQUFFLElBQUksU0FBTyxJQUFJLElBQUk7QUFFN0csYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLEtBQUs7QUFDM0IsZUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLEtBQUs7QUFDM0IsWUFBSSxLQUFLLFNBQVMsR0FBRyxDQUFDLE1BQU0sTUFBTTtBQUM5QixlQUFLLFNBQVMsR0FBRyxHQUFHLFdBQVcsS0FBSyxNQUFNLEtBQUssT0FBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFBQSxRQUNqRjtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBLEVBRVEsaUJBQXVCO0FBQzNCLFVBQU0sYUFBYSxLQUFLLE9BQU8sT0FBTyxJQUFJLGFBQWE7QUFDdkQsUUFBSSxZQUFZO0FBQ1osWUFBTSxRQUFRLFdBQVcsVUFBVSxJQUFJO0FBQ3ZDLFlBQU0sU0FBUyxXQUFXO0FBQzFCLFlBQU0sS0FBSyxFQUFFLE1BQU0sT0FBSyxRQUFRLEtBQUssNkJBQTZCLENBQUMsQ0FBQztBQUFBLElBQ3hFO0FBQUEsRUFDSjtBQUFBLEVBRVEsTUFBTSxJQUEyQjtBQUNyQyxXQUFPLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxFQUFFLENBQUM7QUFBQSxFQUN6RDtBQUNKO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsTUFBSSxLQUFLLFlBQVk7QUFDekIsQ0FBQzsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIl0KfQo=
