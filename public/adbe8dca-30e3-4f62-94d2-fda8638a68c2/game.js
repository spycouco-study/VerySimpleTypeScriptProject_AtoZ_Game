var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 2] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 3] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 4] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2["UP"] = "UP";
  Direction2["DOWN"] = "DOWN";
  Direction2["LEFT"] = "LEFT";
  Direction2["RIGHT"] = "RIGHT";
  return Direction2;
})(Direction || {});
class AssetLoader {
  constructor(onProgress, onComplete) {
    this.loadedImages = /* @__PURE__ */ new Map();
    this.loadedSounds = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedCount = 0;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
  }
  async loadAssets(config) {
    this.totalAssets = config.assets.images.length + config.assets.sounds.length;
    this.loadedCount = 0;
    const imagePromises = config.assets.images.map((imgData) => this.loadImage(imgData));
    const soundPromises = config.assets.sounds.map((soundData) => this.loadSound(soundData));
    await Promise.all([...imagePromises, ...soundPromises]);
    this.onComplete();
  }
  loadImage(imgData) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imgData.path;
      img.onload = () => {
        this.loadedImages.set(imgData.name, img);
        this.loadedCount++;
        this.onProgress(this.loadedCount / this.totalAssets);
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${imgData.path}`);
        reject(new Error(`Failed to load image: ${imgData.path}`));
      };
    });
  }
  loadSound(soundData) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = soundData.path;
      audio.volume = soundData.volume;
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        this.loadedSounds.set(soundData.name, audio);
        this.loadedCount++;
        this.onProgress(this.loadedCount / this.totalAssets);
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${soundData.path}`);
        reject(new Error(`Failed to load sound: ${soundData.path}`));
      };
    });
  }
  getImage(name) {
    return this.loadedImages.get(name);
  }
  getSound(name) {
    return this.loadedSounds.get(name);
  }
}
class SnakeGame {
  constructor(canvasId) {
    this.gameState = 0 /* LOADING */;
    this.lastUpdateTime = 0;
    this.snake = [];
    this.food = null;
    this.direction = "RIGHT" /* RIGHT */;
    this.nextDirection = null;
    this.score = 0;
    this.loopId = 0;
    this.bgmAudio = null;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D rendering context.");
    }
    this.ctx = ctx;
    this.assetLoader = new AssetLoader(
      this.handleAssetProgress.bind(this),
      this.handleAssetLoadComplete.bind(this)
    );
    this.setupEventListeners();
  }
  async init() {
    try {
      const response = await fetch("data.json");
      this.config = await response.json();
      this.canvas.width = this.config.boardWidthCells * this.config.gridSize;
      this.canvas.height = this.config.boardHeightCells * this.config.gridSize;
      this.startGameLoop();
      await this.assetLoader.loadAssets(this.config);
    } catch (error) {
      console.error("Failed to load game configuration or assets:", error);
    }
  }
  handleAssetProgress(progress) {
    this.drawLoadingScreen(progress);
  }
  handleAssetLoadComplete() {
    this.gameState = 1 /* TITLE */;
    this.bgmAudio = this.assetLoader.getSound("backgroundMusic") || null;
    if (this.bgmAudio) {
      this.bgmAudio.loop = true;
    }
  }
  setupEventListeners() {
    window.addEventListener("keydown", this.handleInput.bind(this));
  }
  handleInput(event) {
    switch (this.gameState) {
      case 1 /* TITLE */:
        if (event.key === "Enter") {
          this.gameState = 2 /* INSTRUCTIONS */;
          this.playBGM();
        }
        break;
      case 2 /* INSTRUCTIONS */:
        if (event.key === "Enter") {
          this.startGame();
        }
        break;
      case 3 /* PLAYING */:
        this.changeDirection(event.key);
        break;
      case 4 /* GAME_OVER */:
        if (event.key === "Enter") {
          this.startGame();
        }
        break;
    }
  }
  playBGM() {
    if (this.bgmAudio && this.bgmAudio.paused) {
      this.bgmAudio.play().catch((e) => console.warn("BGM autoplay prevented:", e));
    }
  }
  playSound(name) {
    const audio = this.assetLoader.getSound(name);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch((e) => console.warn(`Sound ${name} autoplay prevented:`, e));
    }
  }
  changeDirection(key) {
    const head = this.snake[0];
    let potentialNextX = head.x;
    let potentialNextY = head.y;
    switch (this.direction) {
      case "UP" /* UP */:
        potentialNextY--;
        break;
      case "DOWN" /* DOWN */:
        potentialNextY++;
        break;
      case "LEFT" /* LEFT */:
        potentialNextX--;
        break;
      case "RIGHT" /* RIGHT */:
        potentialNextX++;
        break;
    }
    switch (key) {
      case "ArrowUp":
        if (this.direction !== "DOWN" /* DOWN */ && !(this.snake.length > 1 && potentialNextY + 1 === this.snake[1].y && potentialNextX === this.snake[1].x)) {
          this.nextDirection = "UP" /* UP */;
        }
        break;
      case "ArrowDown":
        if (this.direction !== "UP" /* UP */ && !(this.snake.length > 1 && potentialNextY - 1 === this.snake[1].y && potentialNextX === this.snake[1].x)) {
          this.nextDirection = "DOWN" /* DOWN */;
        }
        break;
      case "ArrowLeft":
        if (this.direction !== "RIGHT" /* RIGHT */ && !(this.snake.length > 1 && potentialNextX + 1 === this.snake[1].x && potentialNextY === this.snake[1].y)) {
          this.nextDirection = "LEFT" /* LEFT */;
        }
        break;
      case "ArrowRight":
        if (this.direction !== "LEFT" /* LEFT */ && !(this.snake.length > 1 && potentialNextX - 1 === this.snake[1].x && potentialNextY === this.snake[1].y)) {
          this.nextDirection = "RIGHT" /* RIGHT */;
        }
        break;
    }
  }
  startGame() {
    this.gameState = 3 /* PLAYING */;
    this.score = 0;
    this.direction = "RIGHT" /* RIGHT */;
    this.nextDirection = null;
    this.snake = [];
    for (let i = 0; i < this.config.initialSnakeLength; i++) {
      this.snake.push({
        x: Math.floor(this.config.boardWidthCells / 2) - i,
        y: Math.floor(this.config.boardHeightCells / 2)
      });
    }
    this.spawnFood();
    this.lastUpdateTime = performance.now();
    this.playBGM();
  }
  spawnFood() {
    let newFood;
    do {
      newFood = {
        x: Math.floor(Math.random() * this.config.boardWidthCells),
        y: Math.floor(Math.random() * this.config.boardHeightCells)
      };
    } while (this.isOccupiedBySnake(newFood));
    this.food = newFood;
  }
  isOccupiedBySnake(point) {
    return this.snake.some((segment) => segment.x === point.x && segment.y === point.y);
  }
  startGameLoop() {
    const loop = (currentTime) => {
      this.update(currentTime);
      this.draw();
      this.loopId = requestAnimationFrame(loop);
    };
    this.loopId = requestAnimationFrame(loop);
  }
  update(currentTime) {
    if (this.gameState === 3 /* PLAYING */) {
      if (currentTime - this.lastUpdateTime > this.config.gameSpeedMs) {
        this.lastUpdateTime = currentTime;
        this.moveSnake();
        this.checkCollisions();
      }
    }
  }
  moveSnake() {
    if (this.nextDirection) {
      this.direction = this.nextDirection;
      this.nextDirection = null;
    }
    const head = { ...this.snake[0] };
    switch (this.direction) {
      case "UP" /* UP */:
        head.y--;
        break;
      case "DOWN" /* DOWN */:
        head.y++;
        break;
      case "LEFT" /* LEFT */:
        head.x--;
        break;
      case "RIGHT" /* RIGHT */:
        head.x++;
        break;
    }
    this.snake.unshift(head);
    if (this.food && head.x === this.food.x && head.y === this.food.y) {
      this.score += this.config.scorePerFood;
      this.playSound("eatSound");
      this.spawnFood();
    } else {
      this.snake.pop();
    }
  }
  checkCollisions() {
    const head = this.snake[0];
    if (head.x < 0 || head.x >= this.config.boardWidthCells || head.y < 0 || head.y >= this.config.boardHeightCells) {
      this.endGame();
      return;
    }
    for (let i = 1; i < this.snake.length; i++) {
      if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
        this.endGame();
        return;
      }
    }
  }
  endGame() {
    this.gameState = 4 /* GAME_OVER */;
    this.playSound("gameOverSound");
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const background = this.assetLoader.getImage("background");
    if (background) {
      this.ctx.drawImage(background, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.config.backgroundColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.gameState) {
      case 0 /* LOADING */:
        break;
      case 1 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 2 /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case 3 /* PLAYING */:
        this.drawGameScreen();
        break;
      case 4 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawLoadingScreen(progress) {
    this.ctx.fillStyle = "#1a1a1a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("\uB85C\uB529 \uC911...", this.canvas.width / 2, this.canvas.height / 2 - 20);
    const barWidth = this.canvas.width * 0.6;
    const barHeight = 20;
    const barX = (this.canvas.width - barWidth) / 2;
    const barY = this.canvas.height / 2 + 20;
    this.ctx.fillStyle = "#555555";
    this.ctx.fillRect(barX, barY, barWidth, barHeight);
    this.ctx.fillStyle = "#78c2ad";
    this.ctx.fillRect(barX, barY, barWidth * progress, barHeight);
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.strokeRect(barX, barY, barWidth, barHeight);
  }
  drawTitleScreen() {
    this.ctx.fillStyle = this.config.fontColor;
    this.ctx.font = "bold 48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.config.titleText, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.pressToStartText, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawInstructionsScreen() {
    this.ctx.fillStyle = this.config.fontColor;
    this.ctx.font = "bold 36px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.config.instructionsTitle, this.canvas.width / 2, this.canvas.height / 2 - 100);
    this.ctx.font = "20px Arial";
    const lines = this.config.instructionsText.split("\n");
    lines.forEach((line, index) => {
      this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 - 40 + index * 30);
    });
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.pressToStartText, this.canvas.width / 2, this.canvas.height - 50);
  }
  drawGameScreen() {
    if (this.food) {
      this.drawAsset("food", this.food.x, this.food.y);
    }
    this.snake.forEach((segment, index) => {
      if (index === 0) {
        this.drawAsset("snakeHead", segment.x, segment.y);
      } else {
        this.drawAsset("snakeBody", segment.x, segment.y);
      }
    });
    this.ctx.fillStyle = this.config.fontColor;
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(`${this.config.scoreLabel}: ${this.score}`, 10, 10);
  }
  drawAsset(assetName, gridX, gridY) {
    const image = this.assetLoader.getImage(assetName);
    if (image) {
      const x = gridX * this.config.gridSize;
      const y = gridY * this.config.gridSize;
      this.ctx.drawImage(image, x, y, this.config.gridSize, this.config.gridSize);
    } else {
      this.ctx.fillStyle = assetName === "food" ? this.config.foodColor : assetName === "snakeHead" ? this.config.snakeHeadColor : this.config.snakeBodyColor;
      this.ctx.fillRect(gridX * this.config.gridSize, gridY * this.config.gridSize, this.config.gridSize, this.config.gridSize);
    }
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.config.fontColor;
    this.ctx.font = "bold 48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.config.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 80);
    this.ctx.font = "36px Arial";
    this.ctx.fillText(`${this.config.scoreLabel}: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.pressToRestartText, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game = new SnakeGame("gameCanvas");
  game.init();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgZ3JpZFNpemU6IG51bWJlcjtcclxuICAgIGJvYXJkV2lkdGhDZWxsczogbnVtYmVyO1xyXG4gICAgYm9hcmRIZWlnaHRDZWxsczogbnVtYmVyO1xyXG4gICAgaW5pdGlhbFNuYWtlTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBnYW1lU3BlZWRNczogbnVtYmVyO1xyXG4gICAgc2NvcmVQZXJGb29kOiBudW1iZXI7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIHNuYWtlSGVhZENvbG9yOiBzdHJpbmc7IC8vIE5vdCBzdHJpY3RseSB1c2VkIGlmIGltYWdlcyBhcmUgdXNlZCwgYnV0IGtlcHQgZm9yIGNvbnNpc3RlbmN5IG9yIGZhbGxiYWNrXHJcbiAgICBzbmFrZUJvZHlDb2xvcjogc3RyaW5nO1xyXG4gICAgZm9vZENvbG9yOiBzdHJpbmc7IC8vIE5vdCBzdHJpY3RseSB1c2VkIGlmIGltYWdlcyBhcmUgdXNlZCwgYnV0IGtlcHQgZm9yIGNvbnNpc3RlbmN5IG9yIGZhbGxiYWNrXHJcbiAgICBmb250Q29sb3I6IHN0cmluZztcclxuICAgIHRpdGxlVGV4dDogc3RyaW5nO1xyXG4gICAgcHJlc3NUb1N0YXJ0VGV4dDogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25zVGl0bGU6IHN0cmluZztcclxuICAgIGluc3RydWN0aW9uc1RleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgc2NvcmVMYWJlbDogc3RyaW5nO1xyXG4gICAgcHJlc3NUb1Jlc3RhcnRUZXh0OiBzdHJpbmc7XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEdhbWVJbWFnZURhdGFbXTtcclxuICAgICAgICBzb3VuZHM6IFNvdW5kRGF0YVtdO1xyXG4gICAgfTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVJbWFnZURhdGEge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjsgLy8gT3JpZ2luYWwgd2lkdGggb2YgaW1hZ2VcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBPcmlnaW5hbCBoZWlnaHQgb2YgaW1hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIFNvdW5kRGF0YSB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUixcclxufVxyXG5cclxuZW51bSBEaXJlY3Rpb24ge1xyXG4gICAgVVAgPSAnVVAnLFxyXG4gICAgRE9XTiA9ICdET1dOJyxcclxuICAgIExFRlQgPSAnTEVGVCcsXHJcbiAgICBSSUdIVCA9ICdSSUdIVCcsXHJcbn1cclxuXHJcbmludGVyZmFjZSBQb2ludCB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TG9hZGVyIHtcclxuICAgIHByaXZhdGUgbG9hZGVkSW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgbG9hZGVkU291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgdG90YWxBc3NldHMgPSAwO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRDb3VudCA9IDA7XHJcbiAgICBwcml2YXRlIG9uUHJvZ3Jlc3M6IChwcm9ncmVzczogbnVtYmVyKSA9PiB2b2lkO1xyXG4gICAgcHJpdmF0ZSBvbkNvbXBsZXRlOiAoKSA9PiB2b2lkO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG9uUHJvZ3Jlc3M6IChwcm9ncmVzczogbnVtYmVyKSA9PiB2b2lkLCBvbkNvbXBsZXRlOiAoKSA9PiB2b2lkKSB7XHJcbiAgICAgICAgdGhpcy5vblByb2dyZXNzID0gb25Qcm9ncmVzcztcclxuICAgICAgICB0aGlzLm9uQ29tcGxldGUgPSBvbkNvbXBsZXRlO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvYWRBc3NldHMoY29uZmlnOiBHYW1lQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGNvbmZpZy5hc3NldHMuaW1hZ2VzLmxlbmd0aCArIGNvbmZpZy5hc3NldHMuc291bmRzLmxlbmd0aDtcclxuICAgICAgICB0aGlzLmxvYWRlZENvdW50ID0gMDtcclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWdEYXRhID0+IHRoaXMubG9hZEltYWdlKGltZ0RhdGEpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kRGF0YSA9PiB0aGlzLmxvYWRTb3VuZChzb3VuZERhdGEpKTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICB0aGlzLm9uQ29tcGxldGUoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShpbWdEYXRhOiBHYW1lSW1hZ2VEYXRhKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBpbWdEYXRhLnBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEltYWdlcy5zZXQoaW1nRGF0YS5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vblByb2dyZXNzKHRoaXMubG9hZGVkQ291bnQgLyB0aGlzLnRvdGFsQXNzZXRzKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdEYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdEYXRhLnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKHNvdW5kRGF0YTogU291bmREYXRhKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgYXVkaW8uc3JjID0gc291bmREYXRhLnBhdGg7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kRGF0YS52b2x1bWU7XHJcbiAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZFNvdW5kcy5zZXQoc291bmREYXRhLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHRoaXMub25Qcm9ncmVzcyh0aGlzLmxvYWRlZENvdW50IC8gdGhpcy50b3RhbEFzc2V0cyk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZERhdGEucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kRGF0YS5wYXRofWApKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5sb2FkZWRJbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNvdW5kKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmxvYWRlZFNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFNuYWtlR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldExvYWRlciE6IEFzc2V0TG9hZGVyO1xyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdFVwZGF0ZVRpbWUgPSAwO1xyXG4gICAgcHJpdmF0ZSBzbmFrZTogUG9pbnRbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBmb29kOiBQb2ludCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBkaXJlY3Rpb246IERpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDtcclxuICAgIHByaXZhdGUgbmV4dERpcmVjdGlvbjogRGlyZWN0aW9uIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHNjb3JlID0gMDtcclxuICAgIHByaXZhdGUgbG9vcElkOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBiZ21BdWRpbzogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJyk7XHJcbiAgICAgICAgaWYgKCFjdHgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0LicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcclxuXHJcbiAgICAgICAgdGhpcy5hc3NldExvYWRlciA9IG5ldyBBc3NldExvYWRlcihcclxuICAgICAgICAgICAgdGhpcy5oYW5kbGVBc3NldFByb2dyZXNzLmJpbmQodGhpcyksXHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlQXNzZXRMb2FkQ29tcGxldGUuYmluZCh0aGlzKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGluaXQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIEdhbWVDb25maWc7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmJvYXJkV2lkdGhDZWxscyAqIHRoaXMuY29uZmlnLmdyaWRTaXplO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5ib2FyZEhlaWdodENlbGxzICogdGhpcy5jb25maWcuZ3JpZFNpemU7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZUxvb3AoKTsgLy8gU3RhcnQgbG9vcCBldmVuIGZvciBsb2FkaW5nIHNjcmVlblxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TG9hZGVyLmxvYWRBc3NldHModGhpcy5jb25maWcpOyAvLyBUaGlzIHdpbGwgdHJpZ2dlciBoYW5kbGVBc3NldExvYWRDb21wbGV0ZVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIFBvdGVudGlhbGx5IGRpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBvbiBjYW52YXNcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVBc3NldFByb2dyZXNzKHByb2dyZXNzOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKHByb2dyZXNzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUFzc2V0TG9hZENvbXBsZXRlKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHRoaXMuYmdtQXVkaW8gPSB0aGlzLmFzc2V0TG9hZGVyLmdldFNvdW5kKCdiYWNrZ3JvdW5kTXVzaWMnKSB8fCBudWxsO1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ubG9vcCA9IHRydWU7XHJcbiAgICAgICAgICAgIC8vIFZvbHVtZSBpcyBzZXQgZHVyaW5nIGxvYWRpbmcuIEJHTSB3aWxsIHN0YXJ0IG9uIGZpcnN0IHVzZXIgaW50ZXJhY3Rpb24gZm9yIHRoZSB0aXRsZSBzY3JlZW5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cEV2ZW50TGlzdGVuZXJzKCk6IHZvaWQge1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVJbnB1dC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUlucHV0KGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIGlmIChldmVudC5rZXkgPT09ICdFbnRlcicpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5QkdNKCk7IC8vIFN0YXJ0IEJHTSBvbiBmaXJzdCB1c2VyIGludGVyYWN0aW9uXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VudGVyJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlRGlyZWN0aW9uKGV2ZW50LmtleSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VudGVyJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvICYmIHRoaXMuYmdtQXVkaW8ucGF1c2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKFwiQkdNIGF1dG9wbGF5IHByZXZlbnRlZDpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0U291bmQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDsgLy8gUmVzZXQgdG8gc3RhcnRcclxuICAgICAgICAgICAgYXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBTb3VuZCAke25hbWV9IGF1dG9wbGF5IHByZXZlbnRlZDpgLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hhbmdlRGlyZWN0aW9uKGtleTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgaGVhZCA9IHRoaXMuc25ha2VbMF07XHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHBvdGVudGlhbCBuZXh0IGhlYWQgcG9zaXRpb24gYmFzZWQgb24gY3VycmVudCBkaXJlY3Rpb25cclxuICAgICAgICBsZXQgcG90ZW50aWFsTmV4dFggPSBoZWFkLng7XHJcbiAgICAgICAgbGV0IHBvdGVudGlhbE5leHRZID0gaGVhZC55O1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLlVQOiBwb3RlbnRpYWxOZXh0WS0tOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uRE9XTjogcG90ZW50aWFsTmV4dFkrKzsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkxFRlQ6IHBvdGVudGlhbE5leHRYLS07IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5SSUdIVDogcG90ZW50aWFsTmV4dFgrKzsgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKGtleSkge1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd1VwJzpcclxuICAgICAgICAgICAgICAgIC8vIE9ubHkgYWxsb3cgaWYgbm90IGN1cnJlbnRseSBtb3ZpbmcgZG93biBBTkQgbm90IHRyeWluZyB0byBtb3ZlIHRvIHRoZSBzZWdtZW50IGRpcmVjdGx5IGJlaGluZCB0aGUgaGVhZFxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uRE9XTiAmJiAhKHRoaXMuc25ha2UubGVuZ3RoID4gMSAmJiBwb3RlbnRpYWxOZXh0WSArIDEgPT09IHRoaXMuc25ha2VbMV0ueSAmJiBwb3RlbnRpYWxOZXh0WCA9PT0gdGhpcy5zbmFrZVsxXS54KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV4dERpcmVjdGlvbiA9IERpcmVjdGlvbi5VUDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd0Rvd24nOlxyXG4gICAgICAgICAgICAgICAgLy8gT25seSBhbGxvdyBpZiBub3QgY3VycmVudGx5IG1vdmluZyB1cCBBTkQgbm90IHRyeWluZyB0byBtb3ZlIHRvIHRoZSBzZWdtZW50IGRpcmVjdGx5IGJlaGluZCB0aGUgaGVhZFxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uVVAgJiYgISh0aGlzLnNuYWtlLmxlbmd0aCA+IDEgJiYgcG90ZW50aWFsTmV4dFkgLSAxID09PSB0aGlzLnNuYWtlWzFdLnkgJiYgcG90ZW50aWFsTmV4dFggPT09IHRoaXMuc25ha2VbMV0ueCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5leHREaXJlY3Rpb24gPSBEaXJlY3Rpb24uRE9XTjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd0xlZnQnOlxyXG4gICAgICAgICAgICAgICAgLy8gT25seSBhbGxvdyBpZiBub3QgY3VycmVudGx5IG1vdmluZyByaWdodCBBTkQgbm90IHRyeWluZyB0byBtb3ZlIHRvIHRoZSBzZWdtZW50IGRpcmVjdGx5IGJlaGluZCB0aGUgaGVhZFxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uUklHSFQgJiYgISh0aGlzLnNuYWtlLmxlbmd0aCA+IDEgJiYgcG90ZW50aWFsTmV4dFggKyAxID09PSB0aGlzLnNuYWtlWzFdLnggJiYgcG90ZW50aWFsTmV4dFkgPT09IHRoaXMuc25ha2VbMV0ueSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5leHREaXJlY3Rpb24gPSBEaXJlY3Rpb24uTEVGVDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd1JpZ2h0JzpcclxuICAgICAgICAgICAgICAgIC8vIE9ubHkgYWxsb3cgaWYgbm90IGN1cnJlbnRseSBtb3ZpbmcgbGVmdCBBTkQgbm90IHRyeWluZyB0byBtb3ZlIHRvIHRoZSBzZWdtZW50IGRpcmVjdGx5IGJlaGluZCB0aGUgaGVhZFxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uTEVGVCAmJiAhKHRoaXMuc25ha2UubGVuZ3RoID4gMSAmJiBwb3RlbnRpYWxOZXh0WCAtIDEgPT09IHRoaXMuc25ha2VbMV0ueCAmJiBwb3RlbnRpYWxOZXh0WSA9PT0gdGhpcy5zbmFrZVsxXS55KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV4dERpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmRpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDsgLy8gUmVzZXQgZGlyZWN0aW9uXHJcbiAgICAgICAgdGhpcy5uZXh0RGlyZWN0aW9uID0gbnVsbDtcclxuXHJcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBzbmFrZVxyXG4gICAgICAgIHRoaXMuc25ha2UgPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY29uZmlnLmluaXRpYWxTbmFrZUxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc25ha2UucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB4OiBNYXRoLmZsb29yKHRoaXMuY29uZmlnLmJvYXJkV2lkdGhDZWxscyAvIDIpIC0gaSxcclxuICAgICAgICAgICAgICAgIHk6IE1hdGguZmxvb3IodGhpcy5jb25maWcuYm9hcmRIZWlnaHRDZWxscyAvIDIpXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnNwYXduRm9vZCgpO1xyXG4gICAgICAgIHRoaXMubGFzdFVwZGF0ZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsgLy8gUmVzZXQgdXBkYXRlIHRpbWVyXHJcbiAgICAgICAgdGhpcy5wbGF5QkdNKCk7IC8vIEVuc3VyZSBCR00gY29udGludWVzIGlmIGl0IHdhcyBwYXVzZWQgb3IgcmVzZXRcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduRm9vZCgpOiB2b2lkIHtcclxuICAgICAgICBsZXQgbmV3Rm9vZDogUG9pbnQ7XHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBuZXdGb29kID0ge1xyXG4gICAgICAgICAgICAgICAgeDogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcuYm9hcmRXaWR0aENlbGxzKSxcclxuICAgICAgICAgICAgICAgIHk6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuY29uZmlnLmJvYXJkSGVpZ2h0Q2VsbHMpLFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0gd2hpbGUgKHRoaXMuaXNPY2N1cGllZEJ5U25ha2UobmV3Rm9vZCkpO1xyXG4gICAgICAgIHRoaXMuZm9vZCA9IG5ld0Zvb2Q7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpc09jY3VwaWVkQnlTbmFrZShwb2ludDogUG9pbnQpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zbmFrZS5zb21lKHNlZ21lbnQgPT4gc2VnbWVudC54ID09PSBwb2ludC54ICYmIHNlZ21lbnQueSA9PT0gcG9pbnQueSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWVMb29wKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGxvb3AgPSAoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApID0+IHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoY3VycmVudFRpbWUpO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXcoKTtcclxuICAgICAgICAgICAgdGhpcy5sb29wSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLmxvb3BJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShjdXJyZW50VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VXBkYXRlVGltZSA+IHRoaXMuY29uZmlnLmdhbWVTcGVlZE1zKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RVcGRhdGVUaW1lID0gY3VycmVudFRpbWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVTbmFrZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0NvbGxpc2lvbnMoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG1vdmVTbmFrZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5uZXh0RGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uID0gdGhpcy5uZXh0RGlyZWN0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLm5leHREaXJlY3Rpb24gPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGVhZCA9IHsgLi4udGhpcy5zbmFrZVswXSB9OyAvLyBDb3B5IGN1cnJlbnQgaGVhZFxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLlVQOlxyXG4gICAgICAgICAgICAgICAgaGVhZC55LS07XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uRE9XTjpcclxuICAgICAgICAgICAgICAgIGhlYWQueSsrO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkxFRlQ6XHJcbiAgICAgICAgICAgICAgICBoZWFkLngtLTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5SSUdIVDpcclxuICAgICAgICAgICAgICAgIGhlYWQueCsrO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnNuYWtlLnVuc2hpZnQoaGVhZCk7IC8vIEFkZCBuZXcgaGVhZFxyXG5cclxuICAgICAgICBpZiAodGhpcy5mb29kICYmIGhlYWQueCA9PT0gdGhpcy5mb29kLnggJiYgaGVhZC55ID09PSB0aGlzLmZvb2QueSkge1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuY29uZmlnLnNjb3JlUGVyRm9vZDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ2VhdFNvdW5kJyk7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25Gb29kKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5zbmFrZS5wb3AoKTsgLy8gUmVtb3ZlIHRhaWwgaWYgbm8gZm9vZCBlYXRlblxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrQ29sbGlzaW9ucygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBoZWFkID0gdGhpcy5zbmFrZVswXTtcclxuXHJcbiAgICAgICAgLy8gV2FsbCBjb2xsaXNpb25cclxuICAgICAgICBpZiAoaGVhZC54IDwgMCB8fCBoZWFkLnggPj0gdGhpcy5jb25maWcuYm9hcmRXaWR0aENlbGxzIHx8XHJcbiAgICAgICAgICAgIGhlYWQueSA8IDAgfHwgaGVhZC55ID49IHRoaXMuY29uZmlnLmJvYXJkSGVpZ2h0Q2VsbHMpIHtcclxuICAgICAgICAgICAgdGhpcy5lbmRHYW1lKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNlbGYtY29sbGlzaW9uIChzdGFydCBmcm9tIDEgdG8gc2tpcCBoZWFkKVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgdGhpcy5zbmFrZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoaGVhZC54ID09PSB0aGlzLnNuYWtlW2ldLnggJiYgaGVhZC55ID09PSB0aGlzLnNuYWtlW2ldLnkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5kR2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5kR2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2dhbWVPdmVyU291bmQnKTtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7IC8vIFBhdXNlIEJHTVxyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDsgLy8gUmVzZXQgQkdNIGZvciBuZXh0IHBsYXlcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTsgLy8gQ2xlYXIgZW50aXJlIGNhbnZhc1xyXG5cclxuICAgICAgICAvLyBEcmF3IGJhY2tncm91bmQgaWYgYXZhaWxhYmxlXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZCA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UoJ2JhY2tncm91bmQnKTtcclxuICAgICAgICBpZiAoYmFja2dyb3VuZCkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmFja2dyb3VuZCwgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuYmFja2dyb3VuZENvbG9yO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IGxvYWRpbmcgc2NyZWVuIGlzIGhhbmRsZWQgYnkgaGFuZGxlQXNzZXRQcm9ncmVzc1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbihwcm9ncmVzczogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyMxYTFhMWEnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnI2ZmZmZmZic7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnXHVCODVDXHVCNTI5IFx1QzkxMS4uLicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcclxuXHJcbiAgICAgICAgY29uc3QgYmFyV2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aCAqIDAuNjtcclxuICAgICAgICBjb25zdCBiYXJIZWlnaHQgPSAyMDtcclxuICAgICAgICBjb25zdCBiYXJYID0gKHRoaXMuY2FudmFzLndpZHRoIC0gYmFyV2lkdGgpIC8gMjtcclxuICAgICAgICBjb25zdCBiYXJZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzU1NTU1NSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyWCwgYmFyWSwgYmFyV2lkdGgsIGJhckhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjNzhjMmFkJzsgLy8gQSBwbGVhc2FudCBncmVlbi1ibHVlIGZvciB0aGUgcHJvZ3Jlc3NcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJYLCBiYXJZLCBiYXJXaWR0aCAqIHByb2dyZXNzLCBiYXJIZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICcjZmZmZmZmJztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGJhclgsIGJhclksIGJhcldpZHRoLCBiYXJIZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmZvbnRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJ2JvbGQgNDhweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGl0bGVUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcucHJlc3NUb1N0YXJ0VGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5mb250Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDM2cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLmluc3RydWN0aW9uc1RpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAxMDApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xyXG4gICAgICAgIGNvbnN0IGxpbmVzID0gdGhpcy5jb25maWcuaW5zdHJ1Y3Rpb25zVGV4dC5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgbGluZXMuZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNDAgKyAoaW5kZXggKiAzMCkpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnByZXNzVG9TdGFydFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgLy8gRHJhdyBmb29kXHJcbiAgICAgICAgaWYgKHRoaXMuZm9vZCkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdBc3NldCgnZm9vZCcsIHRoaXMuZm9vZC54LCB0aGlzLmZvb2QueSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IHNuYWtlXHJcbiAgICAgICAgdGhpcy5zbmFrZS5mb3JFYWNoKChzZWdtZW50LCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIERyYXcgaGVhZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3QXNzZXQoJ3NuYWtlSGVhZCcsIHNlZ21lbnQueCwgc2VnbWVudC55KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIERyYXcgYm9keVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3QXNzZXQoJ3NuYWtlQm9keScsIHNlZ21lbnQueCwgc2VnbWVudC55KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHNjb3JlXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuZm9udENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICd0b3AnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnNjb3JlTGFiZWx9OiAke3RoaXMuc2NvcmV9YCwgMTAsIDEwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdBc3NldChhc3NldE5hbWU6IHN0cmluZywgZ3JpZFg6IG51bWJlciwgZ3JpZFk6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGltYWdlID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZShhc3NldE5hbWUpO1xyXG4gICAgICAgIGlmIChpbWFnZSkge1xyXG4gICAgICAgICAgICBjb25zdCB4ID0gZ3JpZFggKiB0aGlzLmNvbmZpZy5ncmlkU2l6ZTtcclxuICAgICAgICAgICAgY29uc3QgeSA9IGdyaWRZICogdGhpcy5jb25maWcuZ3JpZFNpemU7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShpbWFnZSwgeCwgeSwgdGhpcy5jb25maWcuZ3JpZFNpemUsIHRoaXMuY29uZmlnLmdyaWRTaXplKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBGYWxsYmFjayBmb3IgZGVidWdnaW5nIGlmIGFzc2V0IG5vdCBsb2FkZWRcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gYXNzZXROYW1lID09PSAnZm9vZCcgPyB0aGlzLmNvbmZpZy5mb29kQ29sb3IgOiAoYXNzZXROYW1lID09PSAnc25ha2VIZWFkJyA/IHRoaXMuY29uZmlnLnNuYWtlSGVhZENvbG9yIDogdGhpcy5jb25maWcuc25ha2VCb2R5Q29sb3IpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChncmlkWCAqIHRoaXMuY29uZmlnLmdyaWRTaXplLCBncmlkWSAqIHRoaXMuY29uZmlnLmdyaWRTaXplLCB0aGlzLmNvbmZpZy5ncmlkU2l6ZSwgdGhpcy5jb25maWcuZ3JpZFNpemUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuZm9udENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnYm9sZCA0OHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy5nYW1lT3ZlclRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczNnB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLmNvbmZpZy5zY29yZUxhYmVsfTogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy5wcmVzc1RvUmVzdGFydFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gSW5pdGlhbGl6ZSB0aGUgZ2FtZVxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBTbmFrZUdh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
