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
        const col = Math.floor(mouseX / this.config.grid.blockSize);
        const row = Math.floor(mouseY / this.config.grid.blockSize);
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
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const blockType = this.grid[r][c];
        const x = c * blockSize;
        const y = r * blockSize;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgZ3JpZDoge1xyXG4gICAgICAgIHJvd3M6IG51bWJlcjtcclxuICAgICAgICBjb2xzOiBudW1iZXI7XHJcbiAgICAgICAgYmxvY2tTaXplOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZ2FtZXBsYXk6IHtcclxuICAgICAgICB0aW1lTGltaXRTZWNvbmRzOiBudW1iZXI7XHJcbiAgICAgICAgbWluTWF0Y2g6IG51bWJlcjtcclxuICAgICAgICBzY29yZVBlck1hdGNoOiBudW1iZXI7XHJcbiAgICAgICAgaW5pdGlhbFNjb3JlOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY29sb3JzOiB7XHJcbiAgICAgICAgYmFja2dyb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIGdyaWRMaW5lOiBzdHJpbmc7XHJcbiAgICAgICAgdGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHNlbGVjdGlvbjogc3RyaW5nO1xyXG4gICAgICAgIG92ZXJsYXk6IHN0cmluZztcclxuICAgIH07XHJcbiAgICB0ZXh0OiB7XHJcbiAgICAgICAgdGl0bGU6IHN0cmluZztcclxuICAgICAgICBjbGlja1RvU3RhcnQ6IHN0cmluZztcclxuICAgICAgICBpbnN0cnVjdGlvbnNUaXRsZTogc3RyaW5nO1xyXG4gICAgICAgIGluc3RydWN0aW9uczogc3RyaW5nW107XHJcbiAgICAgICAgZ2FtZU92ZXJUaXRsZTogc3RyaW5nO1xyXG4gICAgICAgIHRpbWVVcDogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlTGFiZWw6IHN0cmluZztcclxuICAgICAgICB0aW1lTGFiZWw6IHN0cmluZztcclxuICAgICAgICByZXN0YXJ0R2FtZTogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogSW1hZ2VBc3NldFtdO1xyXG4gICAgICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG4gICAgfTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxudHlwZSBCbG9ja1R5cGUgPSBzdHJpbmcgfCBudWxsOyAvLyBVc2UgaW1hZ2UgbmFtZXMgYXMgYmxvY2sgdHlwZXMsIG51bGwgZm9yIGVtcHR5XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSA9ICdUSVRMRScsXHJcbiAgICBJTlNUUlVDVElPTlMgPSAnSU5TVFJVQ1RJT05TJyxcclxuICAgIFBMQVlJTkcgPSAnUExBWUlORycsXHJcbiAgICBHQU1FX09WRVIgPSAnR0FNRV9PVkVSJyxcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnOyAvLyBMb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PjtcclxuICAgICAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xyXG4gICAgfTtcclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICBwcml2YXRlIGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBncmlkOiBCbG9ja1R5cGVbXVtdO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgdGltZUxlZnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHNlbGVjdGVkQmxvY2s6IHsgcm93OiBudW1iZXI7IGNvbDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaXNQcm9jZXNzaW5nTW92ZTogYm9vbGVhbiA9IGZhbHNlOyAvLyBUbyBwcmV2ZW50IG11bHRpcGxlIG1vdmVzL2lucHV0cyBkdXJpbmcgY2FzY2FkZXNcclxuXHJcbiAgICBwcml2YXRlIGJnbUF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgd2l0aCBJRCAnJHtjYW52YXNJZH0nIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmFzc2V0cyA9IHsgaW1hZ2VzOiBuZXcgTWFwKCksIHNvdW5kczogbmV3IE1hcCgpIH07XHJcblxyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBJbml0aWFsaXplIGdyaWQgYXMgYW4gZW1wdHkgYXJyYXksIHdpbGwgYmUgcG9wdWxhdGVkIGFmdGVyIGNvbmZpZy9hc3NldHMgbG9hZFxyXG4gICAgICAgIHRoaXMuZ3JpZCA9IFtdO1xyXG5cclxuICAgICAgICB0aGlzLmxvYWRDb25maWcoKS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgICAgICB0aGlzLmxvYWRBc3NldHMoKS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5pdEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5pbWFnZXMuc2V0KGltZy5uYW1lLCBpbWFnZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9uZXJyb3IgPSAoKSA9PiByZWplY3QoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZy5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc25kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc25kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoJ2NhbnBsYXl0aHJvdWdoJywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLnNvdW5kcy5zZXQoc25kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb2FkKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaW5pdEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IHRoaXMuY29uZmlnLmdhbWVwbGF5LmluaXRpYWxTY29yZTtcclxuICAgICAgICB0aGlzLnRpbWVMZWZ0ID0gdGhpcy5jb25maWcuZ2FtZXBsYXkudGltZUxpbWl0U2Vjb25kcztcclxuICAgICAgICB0aGlzLnNlbGVjdGVkQmxvY2sgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuaXNQcm9jZXNzaW5nTW92ZSA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMucGxheUJHTSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IHRoaXMuY29uZmlnLmdhbWVwbGF5LmluaXRpYWxTY29yZTtcclxuICAgICAgICB0aGlzLnRpbWVMZWZ0ID0gdGhpcy5jb25maWcuZ2FtZXBsYXkudGltZUxpbWl0U2Vjb25kcztcclxuICAgICAgICB0aGlzLnNlbGVjdGVkQmxvY2sgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuaXNQcm9jZXNzaW5nTW92ZSA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVHcmlkKCk7XHJcbiAgICAgICAgdGhpcy5wbGF5QkdNKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBiZ20gPSB0aGlzLmFzc2V0cy5zb3VuZHMuZ2V0KCdiZ21fbG9vcCcpO1xyXG4gICAgICAgIGlmIChiZ20pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpbyA9IGJnbTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oXCJCR00gYXV0by1wbGF5IGJsb2NrZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5sYXN0RnJhbWVUaW1lKSB7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHRpbWVzdGFtcDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWVzdGFtcCAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gdGltZXN0YW1wO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudGltZUxlZnQgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lTGVmdCAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGltZUxlZnQgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIC8vIE5vIHVwZGF0ZXMgZm9yIG90aGVyIHN0YXRlcyBuZWVkZWQgZm9yIG5vd1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLmJhY2tncm91bmQ7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgYmFja2dyb3VuZCBpbWFnZSBpZiBhdmFpbGFibGVcclxuICAgICAgICBjb25zdCBnYW1lQmcgPSB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KCdnYW1lX2JnJyk7XHJcbiAgICAgICAgaWYgKGdhbWVCZykge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoZ2FtZUJnLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0luc3RydWN0aW9uc1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHcmlkQW5kQmxvY2tzKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdVSSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVNb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gdGhpcy5jYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgbW91c2VYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcclxuICAgICAgICBjb25zdCBtb3VzZVkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNQcm9jZXNzaW5nTW92ZSkgcmV0dXJuOyAvLyBJZ25vcmUgaW5wdXQgaWYgZ2FtZSBpcyBwcm9jZXNzaW5nIGEgbW92ZVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbCA9IE1hdGguZmxvb3IobW91c2VYIC8gdGhpcy5jb25maWcuZ3JpZC5ibG9ja1NpemUpO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gTWF0aC5mbG9vcihtb3VzZVkgLyB0aGlzLmNvbmZpZy5ncmlkLmJsb2NrU2l6ZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHJvdyA+PSAwICYmIHJvdyA8IHRoaXMuY29uZmlnLmdyaWQucm93cyAmJiBjb2wgPj0gMCAmJiBjb2wgPCB0aGlzLmNvbmZpZy5ncmlkLmNvbHMpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RlZEJsb2NrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNSb3cgPSB0aGlzLnNlbGVjdGVkQmxvY2sucm93O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzQ29sID0gdGhpcy5zZWxlY3RlZEJsb2NrLmNvbDtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFkamFjZW50XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQWRqYWNlbnQgPSAoTWF0aC5hYnMoc1JvdyAtIHJvdykgKyBNYXRoLmFicyhzQ29sIC0gY29sKSkgPT09IDE7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNBZGphY2VudCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pc1Byb2Nlc3NpbmdNb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudHJ5U3dhcChzUm93LCBzQ29sLCByb3csIGNvbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWxlY3RlZEJsb2NrID0gbnVsbDsgLy8gRGVzZWxlY3QgYWZ0ZXIgYXR0ZW1wdGVkIHN3YXBcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkQmxvY2sgPSB7IHJvdywgY29sIH07XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5pdEdhbWUoKTsgLy8gR28gYmFjayB0byB0aXRsZSBzY3JlZW5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB0aXRsZUJnID0gdGhpcy5hc3NldHMuaW1hZ2VzLmdldCgndGl0bGVfYmcnKTtcclxuICAgICAgICBpZiAodGl0bGVCZykge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UodGl0bGVCZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLm92ZXJsYXk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLnRleHQ7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC50aXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5jbGlja1RvU3RhcnQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDMwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgdGl0bGVCZyA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQoJ3RpdGxlX2JnJyk7XHJcbiAgICAgICAgaWYgKHRpdGxlQmcpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlQmcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy5vdmVybGF5O1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy50ZXh0O1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnYm9sZCAzNnB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRleHQuaW5zdHJ1Y3Rpb25zVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDEwMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBzYW5zLXNlcmlmJztcclxuICAgICAgICBjb25zdCBsaW5lSGVpZ2h0ID0gMzA7XHJcbiAgICAgICAgdGhpcy5jb25maWcudGV4dC5pbnN0cnVjdGlvbnMuZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTAgKyBpbmRleCAqIGxpbmVIZWlnaHQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5jbGlja1RvU3RhcnQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLm92ZXJsYXk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy50ZXh0O1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnYm9sZCA0OHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRleHQuZ2FtZU92ZXJUaXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gODApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzM2cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudGV4dC50aW1lVXB9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMjApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnRleHQuc2NvcmVMYWJlbH0gJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDMwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRleHQucmVzdGFydEdhbWUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R3JpZEFuZEJsb2NrcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB7IHJvd3MsIGNvbHMsIGJsb2NrU2l6ZSB9ID0gdGhpcy5jb25maWcuZ3JpZDtcclxuICAgICAgICBcclxuICAgICAgICAvLyBEcmF3IGdyaWQgYmFja2dyb3VuZCBhbmQgYmxvY2tzXHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrVHlwZSA9IHRoaXMuZ3JpZFtyXVtjXTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHggPSBjICogYmxvY2tTaXplO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeSA9IHIgKiBibG9ja1NpemU7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBjZWxsIGJhY2tncm91bmQgZm9yIGNoZWNrZXJib2FyZCBlZmZlY3RcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IChyICsgYykgJSAyID09PSAwID8gJyNBQUQ3NTEnIDogJyNBMkQxNDknO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoeCwgeSwgYmxvY2tTaXplLCBibG9ja1NpemUpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChibG9ja1R5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBibG9ja0ltZyA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQoYmxvY2tUeXBlKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYmxvY2tJbWcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJsb2NrSW1nLCB4LCB5LCBibG9ja1NpemUsIGJsb2NrU2l6ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIERyYXcgc2VsZWN0aW9uIGhpZ2hsaWdodFxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2VsZWN0ZWRCbG9jayAmJiB0aGlzLnNlbGVjdGVkQmxvY2sucm93ID09PSByICYmIHRoaXMuc2VsZWN0ZWRCbG9jay5jb2wgPT09IGMpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy5zZWxlY3Rpb247XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gNDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KHggKyAyLCB5ICsgMiwgYmxvY2tTaXplIC0gNCwgYmxvY2tTaXplIC0gNCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VUkoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy50ZXh0O1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnYm9sZCAyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnRleHQuc2NvcmVMYWJlbH0gJHt0aGlzLnNjb3JlfWAsIDEwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLSAzMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICAgICAgY29uc3QgZGlzcGxheVRpbWUgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMudGltZUxlZnQpKTsgLy8gTm8gbmVnYXRpdmUgdGltZSBkaXNwbGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudGV4dC50aW1lTGFiZWx9ICR7ZGlzcGxheVRpbWV9YCwgdGhpcy5jYW52YXMud2lkdGggLSAxMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMzApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2VuZXJhdGVHcmlkKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHsgcm93cywgY29scyB9ID0gdGhpcy5jb25maWcuZ3JpZDtcclxuICAgICAgICBjb25zdCBibG9ja05hbWVzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5maWx0ZXIoaW1nID0+IGltZy5uYW1lLnN0YXJ0c1dpdGgoJ2Jsb2NrXycpKS5tYXAoaW1nID0+IGltZy5uYW1lKTtcclxuICAgICAgICB0aGlzLmdyaWQgPSBBcnJheShyb3dzKS5maWxsKDApLm1hcCgoKSA9PiBBcnJheShjb2xzKS5maWxsKG51bGwpKTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGxldCBibG9ja1R5cGU6IEJsb2NrVHlwZTtcclxuICAgICAgICAgICAgICAgIGRvIHtcclxuICAgICAgICAgICAgICAgICAgICBibG9ja1R5cGUgPSBibG9ja05hbWVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGJsb2NrTmFtZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgICAgICB9IHdoaWxlIChcclxuICAgICAgICAgICAgICAgICAgICAoYyA+PSB0aGlzLmNvbmZpZy5nYW1lcGxheS5taW5NYXRjaCAtMSAmJiB0aGlzLmdyaWRbcl1bYyAtIDFdID09PSBibG9ja1R5cGUgJiYgdGhpcy5ncmlkW3JdW2MgLSAyXSA9PT0gYmxvY2tUeXBlKSB8fCAvLyBDaGVjayBob3Jpem9udGFsIG1hdGNoXHJcbiAgICAgICAgICAgICAgICAgICAgKHIgPj0gdGhpcy5jb25maWcuZ2FtZXBsYXkubWluTWF0Y2ggLTEgJiYgdGhpcy5ncmlkW3IgLSAxXVtjXSA9PT0gYmxvY2tUeXBlICYmIHRoaXMuZ3JpZFtyIC0gMl1bY10gPT09IGJsb2NrVHlwZSkgICAgLy8gQ2hlY2sgdmVydGljYWwgbWF0Y2hcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdyaWRbcl1bY10gPSBibG9ja1R5cGU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRCbG9jayhyOiBudW1iZXIsIGM6IG51bWJlcik6IEJsb2NrVHlwZSB7XHJcbiAgICAgICAgaWYgKHIgPCAwIHx8IHIgPj0gdGhpcy5jb25maWcuZ3JpZC5yb3dzIHx8IGMgPCAwIHx8IGMgPj0gdGhpcy5jb25maWcuZ3JpZC5jb2xzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5ncmlkW3JdW2NdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0QmxvY2socjogbnVtYmVyLCBjOiBudW1iZXIsIHR5cGU6IEJsb2NrVHlwZSk6IHZvaWQge1xyXG4gICAgICAgIGlmIChyID49IDAgJiYgciA8IHRoaXMuY29uZmlnLmdyaWQucm93cyAmJiBjID49IDAgJiYgYyA8IHRoaXMuY29uZmlnLmdyaWQuY29scykge1xyXG4gICAgICAgICAgICB0aGlzLmdyaWRbcl1bY10gPSB0eXBlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHRyeVN3YXAocjE6IG51bWJlciwgYzE6IG51bWJlciwgcjI6IG51bWJlciwgYzI6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IHRlbXAgPSB0aGlzLmdldEJsb2NrKHIxLCBjMSk7XHJcbiAgICAgICAgdGhpcy5zZXRCbG9jayhyMSwgYzEsIHRoaXMuZ2V0QmxvY2socjIsIGMyKSk7XHJcbiAgICAgICAgdGhpcy5zZXRCbG9jayhyMiwgYzIsIHRlbXApO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBmb3IgbWF0Y2hlcyBhZnRlciB0ZW1wb3Jhcnkgc3dhcFxyXG4gICAgICAgIGNvbnN0IG1hdGNoZXMgPSB0aGlzLmZpbmRBbGxNYXRjaGVzKCk7XHJcblxyXG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5TWF0Y2hTb3VuZCgpO1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlICs9IG1hdGNoZXMubGVuZ3RoICogdGhpcy5jb25maWcuZ2FtZXBsYXkuc2NvcmVQZXJNYXRjaDtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wcm9jZXNzTWF0Y2hlc0FuZENhc2NhZGVzKG1hdGNoZXMpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIE5vIG1hdGNoLCBzd2FwIGJhY2tcclxuICAgICAgICAgICAgY29uc3QgdGVtcEJhY2sgPSB0aGlzLmdldEJsb2NrKHIxLCBjMSk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0QmxvY2socjEsIGMxLCB0aGlzLmdldEJsb2NrKHIyLCBjMikpO1xyXG4gICAgICAgICAgICB0aGlzLnNldEJsb2NrKHIyLCBjMiwgdGVtcEJhY2spO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmlzUHJvY2Vzc2luZ01vdmUgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbmRBbGxNYXRjaGVzKCk6IHsgcm93OiBudW1iZXIsIGNvbDogbnVtYmVyIH1bXSB7XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlczogeyByb3c6IG51bWJlciwgY29sOiBudW1iZXIgfVtdID0gW107XHJcbiAgICAgICAgY29uc3QgeyByb3dzLCBjb2xzIH0gPSB0aGlzLmNvbmZpZy5ncmlkO1xyXG4gICAgICAgIGNvbnN0IG1pbk1hdGNoID0gdGhpcy5jb25maWcuZ2FtZXBsYXkubWluTWF0Y2g7XHJcbiAgICBcclxuICAgICAgICAvLyBIb3Jpem9udGFsIG1hdGNoZXNcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHJvd3M7IHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IGNvbHM7IGMrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmxvY2tUeXBlID0gdGhpcy5nZXRCbG9jayhyLCBjKTtcclxuICAgICAgICAgICAgICAgIGlmIChibG9ja1R5cGUgPT09IG51bGwpIGNvbnRpbnVlO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICBsZXQgaG9yaXpvbnRhbE1hdGNoQ291bnQgPSAxO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGMgKyBpIDwgY29sczsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2V0QmxvY2sociwgYyArIGkpID09PSBibG9ja1R5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaG9yaXpvbnRhbE1hdGNoQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoaG9yaXpvbnRhbE1hdGNoQ291bnQgPj0gbWluTWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGhvcml6b250YWxNYXRjaENvdW50OyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFtYXRjaGVzLnNvbWUobSA9PiBtLnJvdyA9PT0gciAmJiBtLmNvbCA9PT0gYyArIGkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goeyByb3c6IHIsIGNvbDogYyArIGkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAvLyBWZXJ0aWNhbCBtYXRjaGVzXHJcbiAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByb3dzOyByKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrVHlwZSA9IHRoaXMuZ2V0QmxvY2sociwgYyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoYmxvY2tUeXBlID09PSBudWxsKSBjb250aW51ZTtcclxuICAgIFxyXG4gICAgICAgICAgICAgICAgbGV0IHZlcnRpY2FsTWF0Y2hDb3VudCA9IDE7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgciArIGkgPCByb3dzOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5nZXRCbG9jayhyICsgaSwgYykgPT09IGJsb2NrVHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0aWNhbE1hdGNoQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodmVydGljYWxNYXRjaENvdW50ID49IG1pbk1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB2ZXJ0aWNhbE1hdGNoQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1hdGNoZXMuc29tZShtID0+IG0ucm93ID09PSByICsgaSAmJiBtLmNvbCA9PT0gYykpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaCh7IHJvdzogciArIGksIGNvbDogYyB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0Y2hlcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzTWF0Y2hlc0FuZENhc2NhZGVzKGluaXRpYWxNYXRjaGVzOiB7IHJvdzogbnVtYmVyLCBjb2w6IG51bWJlciB9W10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBsZXQgY3VycmVudE1hdGNoZXMgPSBpbml0aWFsTWF0Y2hlcztcclxuXHJcbiAgICAgICAgd2hpbGUgKGN1cnJlbnRNYXRjaGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIG1hdGNoZWQgYmxvY2tzXHJcbiAgICAgICAgICAgIGN1cnJlbnRNYXRjaGVzLmZvckVhY2goKHsgcm93LCBjb2wgfSkgPT4gdGhpcy5zZXRCbG9jayhyb3csIGNvbCwgbnVsbCkpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDEwMCk7IC8vIFNtYWxsIGRlbGF5IGZvciB2aXN1YWwgZWZmZWN0IG9mIGJsb2NrcyBkaXNhcHBlYXJpbmdcclxuXHJcbiAgICAgICAgICAgIC8vIERyb3AgYmxvY2tzXHJcbiAgICAgICAgICAgIHRoaXMuZHJvcEJsb2NrcygpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDIwMCk7IC8vIFNtYWxsIGRlbGF5IGZvciB2aXN1YWwgZWZmZWN0IG9mIGJsb2NrcyBmYWxsaW5nXHJcblxyXG4gICAgICAgICAgICAvLyBGaWxsIG5ldyBibG9ja3NcclxuICAgICAgICAgICAgdGhpcy5maWxsRW1wdHlCbG9ja3MoKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5kZWxheSgxMDApOyAvLyBTbWFsbCBkZWxheSBmb3IgdmlzdWFsIGVmZmVjdCBvZiBuZXcgYmxvY2tzIGFwcGVhcmluZ1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIG5ldyBjYXNjYWRlIG1hdGNoZXNcclxuICAgICAgICAgICAgY3VycmVudE1hdGNoZXMgPSB0aGlzLmZpbmRBbGxNYXRjaGVzKCk7XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50TWF0Y2hlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlNYXRjaFNvdW5kKCk7IC8vIFBsYXkgc291bmQgZm9yIGNhc2NhZGUgbWF0Y2hlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSBjdXJyZW50TWF0Y2hlcy5sZW5ndGggKiB0aGlzLmNvbmZpZy5nYW1lcGxheS5zY29yZVBlck1hdGNoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJvcEJsb2NrcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB7IHJvd3MsIGNvbHMgfSA9IHRoaXMuY29uZmlnLmdyaWQ7XHJcbiAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgbGV0IGVtcHR5U3BhY2VzID0gMDtcclxuICAgICAgICAgICAgZm9yIChsZXQgciA9IHJvd3MgLSAxOyByID49IDA7IHItLSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2V0QmxvY2sociwgYykgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbXB0eVNwYWNlcysrO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChlbXB0eVNwYWNlcyA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBNb3ZlIGJsb2NrIGRvd24gYnkgYGVtcHR5U3BhY2VzYCBhbW91bnRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldEJsb2NrKHIgKyBlbXB0eVNwYWNlcywgYywgdGhpcy5nZXRCbG9jayhyLCBjKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRCbG9jayhyLCBjLCBudWxsKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbGxFbXB0eUJsb2NrcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB7IHJvd3MsIGNvbHMgfSA9IHRoaXMuY29uZmlnLmdyaWQ7XHJcbiAgICAgICAgY29uc3QgYmxvY2tOYW1lcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMuZmlsdGVyKGltZyA9PiBpbWcubmFtZS5zdGFydHNXaXRoKCdibG9ja18nKSkubWFwKGltZyA9PiBpbWcubmFtZSk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcm93czsgcisrKSB7IC8vIEl0ZXJhdGUgZnJvbSB0b3AgdG8gYm90dG9tXHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5nZXRCbG9jayhyLCBjKSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0QmxvY2sociwgYywgYmxvY2tOYW1lc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBibG9ja05hbWVzLmxlbmd0aCldKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlNYXRjaFNvdW5kKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG1hdGNoU291bmQgPSB0aGlzLmFzc2V0cy5zb3VuZHMuZ2V0KCdtYXRjaF9zb3VuZCcpO1xyXG4gICAgICAgIGlmIChtYXRjaFNvdW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gbWF0Y2hTb3VuZC5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gbWF0Y2hTb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIk1hdGNoIHNvdW5kIHBsYXkgYmxvY2tlZDpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRlbGF5KG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBpbml0aWFsaXphdGlvblxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQXNEQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxXQUFBLFdBQVE7QUFDUixFQUFBQSxXQUFBLGtCQUFlO0FBQ2YsRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxlQUFZO0FBSlgsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxLQUFLO0FBQUEsRUFtQlAsWUFBWSxVQUFrQjtBQVg5QixTQUFRLFlBQXVCO0FBQy9CLFNBQVEsZ0JBQXdCO0FBR2hDLFNBQVEsUUFBZ0I7QUFDeEIsU0FBUSxXQUFtQjtBQUMzQixTQUFRLGdCQUFxRDtBQUM3RCxTQUFRLG1CQUE0QjtBQUVwQztBQUFBLFNBQVEsV0FBb0M7QUFHeEMsU0FBSyxTQUFTLFNBQVMsZUFBZSxRQUFRO0FBQzlDLFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDZCxZQUFNLElBQUksTUFBTSxtQkFBbUIsUUFBUSxjQUFjO0FBQUEsSUFDN0Q7QUFDQSxTQUFLLE1BQU0sS0FBSyxPQUFPLFdBQVcsSUFBSTtBQUN0QyxTQUFLLFNBQVMsRUFBRSxRQUFRLG9CQUFJLElBQUksR0FBRyxRQUFRLG9CQUFJLElBQUksRUFBRTtBQUVyRCxTQUFLLE9BQU8saUJBQWlC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
