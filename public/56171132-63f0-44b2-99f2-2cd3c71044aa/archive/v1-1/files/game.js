var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["Title"] = 0] = "Title";
  GameState2[GameState2["Instructions"] = 1] = "Instructions";
  GameState2[GameState2["Playing"] = 2] = "Playing";
  GameState2[GameState2["GameOver"] = 3] = "GameOver";
  return GameState2;
})(GameState || {});
class SnakeGame {
  constructor(canvasId) {
    this.currentGameState = 0 /* Title */;
    this.lastFrameTime = 0;
    this.lastSnakeMoveTime = 0;
    this.snake = [];
    this.food = null;
    this.direction = { x: 1, y: 0 };
    this.nextDirection = null;
    this.score = 0;
    this.timeLeft = 0;
    this.gameStartTime = 0;
    this.assetsLoadedCount = 0;
    this.totalAssets = 0;
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }
  async init() {
    try {
      const response = await fetch("data.json");
      this.data = await response.json();
      this.canvas.width = this.data.gameSettings.canvasWidth;
      this.canvas.height = this.data.gameSettings.canvasHeight;
      this.totalAssets = this.data.assets.images.length + this.data.assets.sounds.length;
      await this.loadAssets();
      this.gameLoop(0);
    } catch (error) {
      console.error("Failed to load game data or assets:", error);
    }
  }
  async loadAssets() {
    const imagePromises = this.data.assets.images.map((asset) => {
      return new Promise((resolve) => {
        asset.img = new Image();
        asset.img.src = asset.path;
        asset.img.onload = () => {
          this.assetsLoadedCount++;
          resolve();
        };
        asset.img.onerror = () => {
          console.error(`Failed to load image: ${asset.path}`);
          this.assetsLoadedCount++;
          resolve();
        };
      });
    });
    const soundPromises = this.data.assets.sounds.map((asset) => {
      return new Promise((resolve) => {
        asset.audio = new Audio(asset.path);
        asset.audio.oncanplaythrough = () => {
          this.assetsLoadedCount++;
          if (asset.audio) {
            asset.audio.volume = asset.volume;
          }
          resolve();
        };
        asset.audio.onerror = () => {
          console.error(`Failed to load audio: ${asset.path}`);
          this.assetsLoadedCount++;
          resolve();
        };
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
  }
  getAsset(type, name) {
    return this.data.assets[type].find((asset) => asset.name === name);
  }
  playSound(name, loop = false) {
    const sound = this.getAsset("sounds", name);
    if (sound?.audio) {
      sound.audio.currentTime = 0;
      sound.audio.loop = loop;
      sound.audio.play().catch((e) => console.warn(`Audio playback failed for ${name}:`, e));
    }
  }
  stopSound(name) {
    const sound = this.getAsset("sounds", name);
    if (sound?.audio) {
      sound.audio.pause();
      sound.audio.currentTime = 0;
    }
  }
  handleKeyDown(event) {
    switch (this.currentGameState) {
      case 0 /* Title */:
        this.currentGameState = 1 /* Instructions */;
        break;
      case 1 /* Instructions */:
        this.startGame();
        break;
      case 2 /* Playing */:
        this.updateDirection(event.key);
        break;
      case 3 /* GameOver */:
        this.resetGame();
        break;
    }
  }
  updateDirection(key) {
    const currentDir = this.direction;
    let newDir = null;
    if (key === "ArrowUp" && currentDir.y === 0) newDir = { x: 0, y: -1 };
    else if (key === "ArrowDown" && currentDir.y === 0) newDir = { x: 0, y: 1 };
    else if (key === "ArrowLeft" && currentDir.x === 0) newDir = { x: -1, y: 0 };
    else if (key === "ArrowRight" && currentDir.x === 0) newDir = { x: 1, y: 0 };
    if (newDir) {
      this.nextDirection = newDir;
    }
  }
  startGame() {
    this.currentGameState = 2 /* Playing */;
    this.score = 0;
    this.timeLeft = this.data.gameSettings.gameDurationSeconds;
    this.gameStartTime = performance.now();
    this.snake = [];
    for (let i = 0; i < this.data.gameSettings.snakeInitialLength; i++) {
      this.snake.push({
        x: Math.floor(this.canvas.width / (2 * this.data.gameSettings.gridSize)) - i,
        y: Math.floor(this.canvas.height / (2 * this.data.gameSettings.gridSize))
      });
    }
    this.direction = { x: 1, y: 0 };
    this.nextDirection = null;
    this.generateFood();
    this.playSound("bgm", true);
  }
  resetGame() {
    this.stopSound("bgm");
    this.currentGameState = 0 /* Title */;
  }
  generateFood() {
    let newFoodPos;
    const maxGridX = this.canvas.width / this.data.gameSettings.gridSize;
    const maxGridY = this.canvas.height / this.data.gameSettings.gridSize;
    do {
      newFoodPos = {
        x: Math.floor(Math.random() * maxGridX),
        y: Math.floor(Math.random() * maxGridY)
      };
    } while (this.snake.some((segment) => segment.x === newFoodPos.x && segment.y === newFoodPos.y));
    this.food = newFoodPos;
  }
  update(deltaTime) {
    if (this.currentGameState === 2 /* Playing */) {
      const currentTime = performance.now();
      const elapsedFromGameStart = (currentTime - this.gameStartTime) / 1e3;
      this.timeLeft = Math.max(0, this.data.gameSettings.gameDurationSeconds - elapsedFromGameStart);
      if (this.timeLeft <= 0) {
        this.currentGameState = 3 /* GameOver */;
        this.stopSound("bgm");
        this.playSound("game_over_sound");
        return;
      }
      if (currentTime - this.lastSnakeMoveTime > this.data.gameSettings.snakeSpeedMillis) {
        this.lastSnakeMoveTime = currentTime;
        if (this.nextDirection) {
          this.direction = this.nextDirection;
          this.nextDirection = null;
        }
        const head = { ...this.snake[0] };
        head.x += this.direction.x;
        head.y += this.direction.y;
        if (this.snake.slice(1).some((segment) => segment.x === head.x && segment.y === head.y)) {
          this.currentGameState = 3 /* GameOver */;
          this.stopSound("bgm");
          this.playSound("game_over_sound");
          return;
        }
        const maxGridX = this.canvas.width / this.data.gameSettings.gridSize;
        const maxGridY = this.canvas.height / this.data.gameSettings.gridSize;
        if (head.x < 0 || head.x >= maxGridX || head.y < 0 || head.y >= maxGridY) {
          this.currentGameState = 3 /* GameOver */;
          this.stopSound("bgm");
          this.playSound("game_over_sound");
          return;
        }
        this.snake.unshift(head);
        if (this.food && head.x === this.food.x && head.y === this.food.y) {
          this.score += this.data.gameSettings.foodScoreIncrement;
          this.generateFood();
          this.playSound("eat_sound");
        } else {
          this.snake.pop();
        }
      }
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bgAsset = this.getAsset("images", "background");
    if (bgAsset?.img?.complete) {
      this.ctx.drawImage(bgAsset.img, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.data.gameSettings.backgroundColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.currentGameState) {
      case 0 /* Title */:
        this.drawTitleScreen();
        break;
      case 1 /* Instructions */:
        this.drawInstructionsScreen();
        break;
      case 2 /* Playing */:
        this.drawGamePlay();
        break;
      case 3 /* GameOver */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawTextCentered(text, y, fontSize, color, font = "Arial") {
    this.ctx.fillStyle = color;
    this.ctx.font = `${fontSize}px ${font}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, this.canvas.width / 2, y);
  }
  drawTitleScreen() {
    const { textContent, gameSettings } = this.data;
    this.drawTextCentered(textContent.title, this.canvas.height * 0.4, 60, gameSettings.textColor);
    this.drawTextCentered(textContent.pressAnyKey, this.canvas.height * 0.6, 30, gameSettings.textColor);
  }
  drawInstructionsScreen() {
    const { textContent, gameSettings } = this.data;
    this.drawTextCentered(textContent.instructionsTitle, this.canvas.height * 0.2, 40, gameSettings.textColor);
    let yOffset = this.canvas.height * 0.35;
    textContent.instructionsText.forEach((line) => {
      this.drawTextCentered(line, yOffset, 24, gameSettings.textColor);
      yOffset += 30;
    });
    this.drawTextCentered(textContent.pressAnyKey, this.canvas.height * 0.85, 30, gameSettings.textColor);
  }
  drawGamePlay() {
    const { gameSettings, textContent } = this.data;
    const gridSize = gameSettings.gridSize;
    if (this.food) {
      const foodAsset = this.getAsset("images", "food");
      if (foodAsset?.img?.complete) {
        this.ctx.drawImage(foodAsset.img, this.food.x * gridSize, this.food.y * gridSize, gridSize, gridSize);
      } else {
        this.ctx.fillStyle = gameSettings.foodColor;
        this.ctx.fillRect(this.food.x * gridSize, this.food.y * gridSize, gridSize, gridSize);
      }
    }
    this.snake.forEach((segment, index) => {
      const asset = index === 0 ? this.getAsset("images", "snake_head") : this.getAsset("images", "snake_body");
      if (asset?.img?.complete) {
        this.ctx.drawImage(asset.img, segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
      } else {
        this.ctx.fillStyle = gameSettings.snakeColor;
        this.ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
      }
    });
    this.ctx.fillStyle = gameSettings.textColor;
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(`${textContent.scorePrefix} ${this.score}`, 10, 10);
    this.ctx.textAlign = "right";
    this.ctx.fillText(`${textContent.timePrefix} ${Math.ceil(this.timeLeft)}`, this.canvas.width - 10, 10);
  }
  drawGameOverScreen() {
    const { textContent, gameSettings } = this.data;
    this.drawTextCentered(textContent.gameOver, this.canvas.height * 0.3, 50, gameSettings.textColor);
    if (this.timeLeft <= 0) {
      this.drawTextCentered(textContent.timeUp, this.canvas.height * 0.4, 40, gameSettings.textColor);
    }
    this.drawTextCentered(`${textContent.scorePrefix} ${this.score}`, this.canvas.height * 0.5, 35, gameSettings.textColor);
    this.drawTextCentered(textContent.restartGame, this.canvas.height * 0.7, 28, gameSettings.textColor);
  }
  gameLoop(currentTime) {
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    this.update(deltaTime);
    this.draw();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game = new SnakeGame("gameCanvas");
  game.init();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmlkU2l6ZTogbnVtYmVyO1xyXG4gICAgc25ha2VJbml0aWFsTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBzbmFrZVNwZWVkTWlsbGlzOiBudW1iZXI7XHJcbiAgICBmb29kU2NvcmVJbmNyZW1lbnQ6IG51bWJlcjtcclxuICAgIGdhbWVEdXJhdGlvblNlY29uZHM6IG51bWJlcjtcclxuICAgIGJhY2tncm91bmRDb2xvcjogc3RyaW5nO1xyXG4gICAgc25ha2VDb2xvcjogc3RyaW5nO1xyXG4gICAgZm9vZENvbG9yOiBzdHJpbmc7XHJcbiAgICB0ZXh0Q29sb3I6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFRleHRDb250ZW50IHtcclxuICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICBwcmVzc0FueUtleTogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25zVGl0bGU6IHN0cmluZztcclxuICAgIGluc3RydWN0aW9uc1RleHQ6IHN0cmluZ1tdO1xyXG4gICAgZ2FtZU92ZXI6IHN0cmluZztcclxuICAgIHRpbWVVcDogc3RyaW5nO1xyXG4gICAgc2NvcmVQcmVmaXg6IHN0cmluZztcclxuICAgIHRpbWVQcmVmaXg6IHN0cmluZztcclxuICAgIHJlc3RhcnRHYW1lOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBJbWFnZUFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltZz86IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG4gICAgYXVkaW8/OiBIVE1MQXVkaW9FbGVtZW50O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRzIHtcclxuICAgIGltYWdlczogSW1hZ2VBc3NldFtdO1xyXG4gICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lRGF0YSB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcclxuICAgIHRleHRDb250ZW50OiBUZXh0Q29udGVudDtcclxuICAgIGFzc2V0czogQXNzZXRzO1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUaXRsZSxcclxuICAgIEluc3RydWN0aW9ucyxcclxuICAgIFBsYXlpbmcsXHJcbiAgICBHYW1lT3ZlclxyXG59XHJcblxyXG5jbGFzcyBTbmFrZUdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZGF0YSE6IEdhbWVEYXRhO1xyXG5cclxuICAgIHByaXZhdGUgY3VycmVudEdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRpdGxlO1xyXG4gICAgcHJpdmF0ZSBsYXN0RnJhbWVUaW1lID0gMDtcclxuICAgIHByaXZhdGUgbGFzdFNuYWtlTW92ZVRpbWUgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgc25ha2U6IHsgeDogbnVtYmVyLCB5OiBudW1iZXIgfVtdID0gW107XHJcbiAgICBwcml2YXRlIGZvb2Q6IHsgeDogbnVtYmVyLCB5OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBkaXJlY3Rpb246IHsgeDogbnVtYmVyLCB5OiBudW1iZXIgfSA9IHsgeDogMSwgeTogMCB9O1xyXG4gICAgcHJpdmF0ZSBuZXh0RGlyZWN0aW9uOiB7IHg6IG51bWJlciwgeTogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0aW1lTGVmdDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZ2FtZVN0YXJ0VGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGFzc2V0c0xvYWRlZENvdW50OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzLmxlbmd0aCArIHRoaXMuZGF0YS5hc3NldHMuc291bmRzLmxlbmd0aDtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmdhbWVMb29wKDApO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YSBvciBhc3NldHM6JywgZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzLm1hcChhc3NldCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXNzZXQuaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBhc3NldC5pbWcuc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGFzc2V0LmltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHNMb2FkZWRDb3VudCsrO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhc3NldC5pbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzTG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuZGF0YS5hc3NldHMuc291bmRzLm1hcChhc3NldCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXNzZXQuYXVkaW8gPSBuZXcgQXVkaW8oYXNzZXQucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhc3NldC5hdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzTG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYXNzZXQuYXVkaW8pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXQuYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXNzZXQuYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBhdWRpbzogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzTG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQWxsIGFzc2V0cyBsb2FkZWQuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRBc3NldDxUIGV4dGVuZHMgJ2ltYWdlcycgfCAnc291bmRzJz4odHlwZTogVCwgbmFtZTogc3RyaW5nKTogKFQgZXh0ZW5kcyAnaW1hZ2VzJyA/IEltYWdlQXNzZXQgOiBTb3VuZEFzc2V0KSB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS5hc3NldHNbdHlwZV0uZmluZChhc3NldCA9PiBhc3NldC5uYW1lID09PSBuYW1lKSBhcyBhbnk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuZ2V0QXNzZXQoJ3NvdW5kcycsIG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZD8uYXVkaW8pIHtcclxuICAgICAgICAgICAgc291bmQuYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICBzb3VuZC5hdWRpby5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgc291bmQuYXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBBdWRpbyBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0b3BTb3VuZChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuZ2V0QXNzZXQoJ3NvdW5kcycsIG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZD8uYXVkaW8pIHtcclxuICAgICAgICAgICAgc291bmQuYXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgc291bmQuYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudEdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UaXRsZTpcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JbnN0cnVjdGlvbnM7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSW5zdHJ1Y3Rpb25zOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QbGF5aW5nOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVEaXJlY3Rpb24oZXZlbnQua2V5KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HYW1lT3ZlcjpcclxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVEaXJlY3Rpb24oa2V5OiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50RGlyID0gdGhpcy5kaXJlY3Rpb247XHJcbiAgICAgICAgbGV0IG5ld0RpcjogeyB4OiBudW1iZXIsIHk6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICAgIGlmIChrZXkgPT09ICdBcnJvd1VwJyAmJiBjdXJyZW50RGlyLnkgPT09IDApIG5ld0RpciA9IHsgeDogMCwgeTogLTEgfTtcclxuICAgICAgICBlbHNlIGlmIChrZXkgPT09ICdBcnJvd0Rvd24nICYmIGN1cnJlbnREaXIueSA9PT0gMCkgbmV3RGlyID0geyB4OiAwLCB5OiAxIH07XHJcbiAgICAgICAgZWxzZSBpZiAoa2V5ID09PSAnQXJyb3dMZWZ0JyAmJiBjdXJyZW50RGlyLnggPT09IDApIG5ld0RpciA9IHsgeDogLTEsIHk6IDAgfTtcclxuICAgICAgICBlbHNlIGlmIChrZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiBjdXJyZW50RGlyLnggPT09IDApIG5ld0RpciA9IHsgeDogMSwgeTogMCB9O1xyXG5cclxuICAgICAgICBpZiAobmV3RGlyKSB7XHJcbiAgICAgICAgICAgIHRoaXMubmV4dERpcmVjdGlvbiA9IG5ld0RpcjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50R2FtZVN0YXRlID0gR2FtZVN0YXRlLlBsYXlpbmc7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy50aW1lTGVmdCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZUR1cmF0aW9uU2Vjb25kcztcclxuICAgICAgICB0aGlzLmdhbWVTdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuXHJcbiAgICAgICAgdGhpcy5zbmFrZSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5zbmFrZUluaXRpYWxMZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB0aGlzLnNuYWtlLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgeDogTWF0aC5mbG9vcih0aGlzLmNhbnZhcy53aWR0aCAvICgyICogdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5ncmlkU2l6ZSkpIC0gaSxcclxuICAgICAgICAgICAgICAgIHk6IE1hdGguZmxvb3IodGhpcy5jYW52YXMuaGVpZ2h0IC8gKDIgKiB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdyaWRTaXplKSlcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZGlyZWN0aW9uID0geyB4OiAxLCB5OiAwIH07XHJcbiAgICAgICAgdGhpcy5uZXh0RGlyZWN0aW9uID0gbnVsbDtcclxuICAgICAgICB0aGlzLmdlbmVyYXRlRm9vZCgpO1xyXG5cclxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnYmdtJywgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdG9wU291bmQoJ2JnbScpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5UaXRsZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdlbmVyYXRlRm9vZCgpIHtcclxuICAgICAgICBsZXQgbmV3Rm9vZFBvczogeyB4OiBudW1iZXIsIHk6IG51bWJlciB9O1xyXG4gICAgICAgIGNvbnN0IG1heEdyaWRYID0gdGhpcy5jYW52YXMud2lkdGggLyB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdyaWRTaXplO1xyXG4gICAgICAgIGNvbnN0IG1heEdyaWRZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC8gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5ncmlkU2l6ZTtcclxuXHJcbiAgICAgICAgZG8ge1xyXG4gICAgICAgICAgICBuZXdGb29kUG9zID0ge1xyXG4gICAgICAgICAgICAgICAgeDogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbWF4R3JpZFgpLFxyXG4gICAgICAgICAgICAgICAgeTogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbWF4R3JpZFkpXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSB3aGlsZSAodGhpcy5zbmFrZS5zb21lKHNlZ21lbnQgPT4gc2VnbWVudC54ID09PSBuZXdGb29kUG9zLnggJiYgc2VnbWVudC55ID09PSBuZXdGb29kUG9zLnkpKTtcclxuXHJcbiAgICAgICAgdGhpcy5mb29kID0gbmV3Rm9vZFBvcztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRHYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QbGF5aW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGVsYXBzZWRGcm9tR2FtZVN0YXJ0ID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5nYW1lU3RhcnRUaW1lKSAvIDEwMDA7XHJcbiAgICAgICAgICAgIHRoaXMudGltZUxlZnQgPSBNYXRoLm1heCgwLCB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdhbWVEdXJhdGlvblNlY29uZHMgLSBlbGFwc2VkRnJvbUdhbWVTdGFydCk7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy50aW1lTGVmdCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRHYW1lU3RhdGUgPSBHYW1lU3RhdGUuR2FtZU92ZXI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3BTb3VuZCgnYmdtJyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnZ2FtZV9vdmVyX3NvdW5kJyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50VGltZSAtIHRoaXMubGFzdFNuYWtlTW92ZVRpbWUgPiB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnNuYWtlU3BlZWRNaWxsaXMpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubGFzdFNuYWtlTW92ZVRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5uZXh0RGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXJlY3Rpb24gPSB0aGlzLm5leHREaXJlY3Rpb247XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXh0RGlyZWN0aW9uID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBoZWFkID0geyAuLi50aGlzLnNuYWtlWzBdIH07XHJcbiAgICAgICAgICAgICAgICBoZWFkLnggKz0gdGhpcy5kaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgICAgIGhlYWQueSArPSB0aGlzLmRpcmVjdGlvbi55O1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNuYWtlLnNsaWNlKDEpLnNvbWUoc2VnbWVudCA9PiBzZWdtZW50LnggPT09IGhlYWQueCAmJiBzZWdtZW50LnkgPT09IGhlYWQueSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRHYW1lU3RhdGUgPSBHYW1lU3RhdGUuR2FtZU92ZXI7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdG9wU291bmQoJ2JnbScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdnYW1lX292ZXJfc291bmQnKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgbWF4R3JpZFggPSB0aGlzLmNhbnZhcy53aWR0aCAvIHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBtYXhHcmlkWSA9IHRoaXMuY2FudmFzLmhlaWdodCAvIHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgICAgICAgICBpZiAoaGVhZC54IDwgMCB8fCBoZWFkLnggPj0gbWF4R3JpZFggfHwgaGVhZC55IDwgMCB8fCBoZWFkLnkgPj0gbWF4R3JpZFkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRHYW1lU3RhdGUgPSBHYW1lU3RhdGUuR2FtZU92ZXI7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdG9wU291bmQoJ2JnbScpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdnYW1lX292ZXJfc291bmQnKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5zbmFrZS51bnNoaWZ0KGhlYWQpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZvb2QgJiYgaGVhZC54ID09PSB0aGlzLmZvb2QueCAmJiBoZWFkLnkgPT09IHRoaXMuZm9vZC55KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmZvb2RTY29yZUluY3JlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdlbmVyYXRlRm9vZCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdlYXRfc291bmQnKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zbmFrZS5wb3AoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXcoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBiZ0Fzc2V0ID0gdGhpcy5nZXRBc3NldCgnaW1hZ2VzJywgJ2JhY2tncm91bmQnKTtcclxuICAgICAgICBpZiAoYmdBc3NldD8uaW1nPy5jb21wbGV0ZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmdBc3NldC5pbWcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuYmFja2dyb3VuZENvbG9yO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5jdXJyZW50R2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRpdGxlOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JbnN0cnVjdGlvbnM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QbGF5aW5nOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZVBsYXkoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HYW1lT3ZlcjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGV4dENlbnRlcmVkKHRleHQ6IHN0cmluZywgeTogbnVtYmVyLCBmb250U2l6ZTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBmb250OiBzdHJpbmcgPSAnQXJpYWwnKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke2ZvbnRTaXplfXB4ICR7Zm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgY29uc3QgeyB0ZXh0Q29udGVudCwgZ2FtZVNldHRpbmdzIH0gPSB0aGlzLmRhdGE7XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dENlbnRlcmVkKHRleHRDb250ZW50LnRpdGxlLCB0aGlzLmNhbnZhcy5oZWlnaHQgKiAwLjQsIDYwLCBnYW1lU2V0dGluZ3MudGV4dENvbG9yKTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0Q2VudGVyZWQodGV4dENvbnRlbnQucHJlc3NBbnlLZXksIHRoaXMuY2FudmFzLmhlaWdodCAqIDAuNiwgMzAsIGdhbWVTZXR0aW5ncy50ZXh0Q29sb3IpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpIHtcclxuICAgICAgICBjb25zdCB7IHRleHRDb250ZW50LCBnYW1lU2V0dGluZ3MgfSA9IHRoaXMuZGF0YTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0Q2VudGVyZWQodGV4dENvbnRlbnQuaW5zdHJ1Y3Rpb25zVGl0bGUsIHRoaXMuY2FudmFzLmhlaWdodCAqIDAuMiwgNDAsIGdhbWVTZXR0aW5ncy50ZXh0Q29sb3IpO1xyXG5cclxuICAgICAgICBsZXQgeU9mZnNldCA9IHRoaXMuY2FudmFzLmhlaWdodCAqIDAuMzU7XHJcbiAgICAgICAgdGV4dENvbnRlbnQuaW5zdHJ1Y3Rpb25zVGV4dC5mb3JFYWNoKGxpbmUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0Q2VudGVyZWQobGluZSwgeU9mZnNldCwgMjQsIGdhbWVTZXR0aW5ncy50ZXh0Q29sb3IpO1xyXG4gICAgICAgICAgICB5T2Zmc2V0ICs9IDMwO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmRyYXdUZXh0Q2VudGVyZWQodGV4dENvbnRlbnQucHJlc3NBbnlLZXksIHRoaXMuY2FudmFzLmhlaWdodCAqIDAuODUsIDMwLCBnYW1lU2V0dGluZ3MudGV4dENvbG9yKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lUGxheSgpIHtcclxuICAgICAgICBjb25zdCB7IGdhbWVTZXR0aW5ncywgdGV4dENvbnRlbnQgfSA9IHRoaXMuZGF0YTtcclxuICAgICAgICBjb25zdCBncmlkU2l6ZSA9IGdhbWVTZXR0aW5ncy5ncmlkU2l6ZTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZm9vZCkge1xyXG4gICAgICAgICAgICBjb25zdCBmb29kQXNzZXQgPSB0aGlzLmdldEFzc2V0KCdpbWFnZXMnLCAnZm9vZCcpO1xyXG4gICAgICAgICAgICBpZiAoZm9vZEFzc2V0Py5pbWc/LmNvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoZm9vZEFzc2V0LmltZywgdGhpcy5mb29kLnggKiBncmlkU2l6ZSwgdGhpcy5mb29kLnkgKiBncmlkU2l6ZSwgZ3JpZFNpemUsIGdyaWRTaXplKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IGdhbWVTZXR0aW5ncy5mb29kQ29sb3I7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCh0aGlzLmZvb2QueCAqIGdyaWRTaXplLCB0aGlzLmZvb2QueSAqIGdyaWRTaXplLCBncmlkU2l6ZSwgZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnNuYWtlLmZvckVhY2goKHNlZ21lbnQsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gaW5kZXggPT09IDAgPyB0aGlzLmdldEFzc2V0KCdpbWFnZXMnLCAnc25ha2VfaGVhZCcpIDogdGhpcy5nZXRBc3NldCgnaW1hZ2VzJywgJ3NuYWtlX2JvZHknKTtcclxuICAgICAgICAgICAgaWYgKGFzc2V0Py5pbWc/LmNvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYXNzZXQuaW1nLCBzZWdtZW50LnggKiBncmlkU2l6ZSwgc2VnbWVudC55ICogZ3JpZFNpemUsIGdyaWRTaXplLCBncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBnYW1lU2V0dGluZ3Muc25ha2VDb2xvcjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHNlZ21lbnQueCAqIGdyaWRTaXplLCBzZWdtZW50LnkgKiBncmlkU2l6ZSwgZ3JpZFNpemUsIGdyaWRTaXplKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBnYW1lU2V0dGluZ3MudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICd0b3AnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RleHRDb250ZW50LnNjb3JlUHJlZml4fSAke3RoaXMuc2NvcmV9YCwgMTAsIDEwKTtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAncmlnaHQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RleHRDb250ZW50LnRpbWVQcmVmaXh9ICR7TWF0aC5jZWlsKHRoaXMudGltZUxlZnQpfWAsIHRoaXMuY2FudmFzLndpZHRoIC0gMTAsIDEwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpIHtcclxuICAgICAgICBjb25zdCB7IHRleHRDb250ZW50LCBnYW1lU2V0dGluZ3MgfSA9IHRoaXMuZGF0YTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0Q2VudGVyZWQodGV4dENvbnRlbnQuZ2FtZU92ZXIsIHRoaXMuY2FudmFzLmhlaWdodCAqIDAuMywgNTAsIGdhbWVTZXR0aW5ncy50ZXh0Q29sb3IpO1xyXG4gICAgICAgIGlmICh0aGlzLnRpbWVMZWZ0IDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dENlbnRlcmVkKHRleHRDb250ZW50LnRpbWVVcCwgdGhpcy5jYW52YXMuaGVpZ2h0ICogMC40LCA0MCwgZ2FtZVNldHRpbmdzLnRleHRDb2xvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZHJhd1RleHRDZW50ZXJlZChgJHt0ZXh0Q29udGVudC5zY29yZVByZWZpeH0gJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLmhlaWdodCAqIDAuNSwgMzUsIGdhbWVTZXR0aW5ncy50ZXh0Q29sb3IpO1xyXG4gICAgICAgIHRoaXMuZHJhd1RleHRDZW50ZXJlZCh0ZXh0Q29udGVudC5yZXN0YXJ0R2FtZSwgdGhpcy5jYW52YXMuaGVpZ2h0ICogMC43LCAyOCwgZ2FtZVNldHRpbmdzLnRleHRDb2xvcik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gY3VycmVudFRpbWUgLSB0aGlzLmxhc3RGcmFtZVRpbWU7XHJcbiAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG59XHJcblxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBTbmFrZUdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIGdhbWUuaW5pdCgpO1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBcURBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxVQUFVO0FBQUEsRUFxQlosWUFBWSxVQUFrQjtBQWhCOUIsU0FBUSxtQkFBOEI7QUFDdEMsU0FBUSxnQkFBZ0I7QUFDeEIsU0FBUSxvQkFBb0I7QUFFNUIsU0FBUSxRQUFvQyxDQUFDO0FBQzdDLFNBQVEsT0FBd0M7QUFDaEQsU0FBUSxZQUFzQyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFDM0QsU0FBUSxnQkFBaUQ7QUFFekQsU0FBUSxRQUFnQjtBQUN4QixTQUFRLFdBQW1CO0FBQzNCLFNBQVEsZ0JBQXdCO0FBRWhDLFNBQVEsb0JBQTRCO0FBQ3BDLFNBQVEsY0FBc0I7QUFHMUIsU0FBSyxTQUFTLFNBQVMsZUFBZSxRQUFRO0FBQzlDLFNBQUssTUFBTSxLQUFLLE9BQU8sV0FBVyxJQUFJO0FBRXRDLGFBQVMsaUJBQWlCLFdBQVcsS0FBSyxjQUFjLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDdEU7QUFBQSxFQUVBLE1BQU0sT0FBTztBQUNULFFBQUk7QUFDQSxZQUFNLFdBQVcsTUFBTSxNQUFNLFdBQVc7QUFDeEMsV0FBSyxPQUFPLE1BQU0sU0FBUyxLQUFLO0FBRWhDLFdBQUssT0FBTyxRQUFRLEtBQUssS0FBSyxhQUFhO0FBQzNDLFdBQUssT0FBTyxTQUFTLEtBQUssS0FBSyxhQUFhO0FBRTVDLFdBQUssY0FBYyxLQUFLLEtBQUssT0FBTyxPQUFPLFNBQVMsS0FBSyxLQUFLLE9BQU8sT0FBTztBQUM1RSxZQUFNLEtBQUssV0FBVztBQUV0QixXQUFLLFNBQVMs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
