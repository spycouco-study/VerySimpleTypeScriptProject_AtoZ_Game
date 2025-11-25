var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  GameState2[GameState2["PAUSED"] = 4] = "PAUSED";
  return GameState2;
})(GameState || {});
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["UP"] = 0] = "UP";
  Direction2[Direction2["DOWN"] = 1] = "DOWN";
  Direction2[Direction2["LEFT"] = 2] = "LEFT";
  Direction2[Direction2["RIGHT"] = 3] = "RIGHT";
  return Direction2;
})(Direction || {});
class SnakeGame {
  constructor(canvasId) {
    this.assets = { images: /* @__PURE__ */ new Map(), sounds: /* @__PURE__ */ new Map() };
    this.currentState = 0 /* LOADING */;
    this.lastFrameTime = 0;
    this.snake = [];
    this.food = null;
    this.direction = 3 /* RIGHT */;
    this.nextDirection = 3 /* RIGHT */;
    this.score = 0;
    this.currentSpeedMs = 0;
    this.lastMoveTime = 0;
    this.gameLoopId = null;
    this.bgmAudio = null;
    this.isBgmPlaying = false;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas with ID '${canvasId}' not found.`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      console.error("Failed to get 2D rendering context for canvas.");
      return;
    }
    this.init();
  }
  async init() {
    await this.loadGameData();
    await this.loadAssets();
    this.setupEventListeners();
    this.canvas.width = this.settings.canvasWidth;
    this.canvas.height = this.settings.canvasHeight;
    this.currentState = 1 /* TITLE */;
    this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
  }
  async loadGameData() {
    try {
      const response = await fetch("data.json");
      this.settings = await response.json();
    } catch (error) {
      console.error("Failed to load game data:", error);
      alert("Failed to load game data. Please check data.json.");
    }
  }
  async loadAssets() {
    const imagePromises = this.settings.assets.images.map((imgData) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imgData.path;
        img.onload = () => {
          this.assets.images.set(imgData.name, img);
          resolve();
        };
        img.onerror = () => {
          console.error(`Failed to load image: ${imgData.path}`);
          reject(`Failed to load image: ${imgData.path}`);
        };
      });
    });
    const soundPromises = this.settings.assets.sounds.map((soundData) => {
      return new Promise((resolve) => {
        const audio = new Audio(soundData.path);
        audio.preload = "auto";
        audio.volume = soundData.volume;
        audio.oncanplaythrough = () => {
          this.assets.sounds.set(soundData.name, audio);
          resolve();
        };
        audio.onerror = () => {
          console.warn(`Failed to load sound: ${soundData.path}. It might still play later.`);
          this.assets.sounds.set(soundData.name, audio);
          resolve();
        };
      });
    });
    try {
      await Promise.all([...imagePromises, ...soundPromises]);
      this.bgmAudio = this.assets.sounds.get("bgm") || null;
      if (this.bgmAudio) {
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = this.settings.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.3;
      }
    } catch (error) {
      console.error("One or more assets failed to load:", error);
      alert("Failed to load some game assets. Check console for details.");
    }
  }
  setupEventListeners() {
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }
  handleKeyDown(event) {
    if (this.currentState === 1 /* TITLE */ || this.currentState === 3 /* GAME_OVER */) {
      if (event.code === "Space") {
        this.startGame();
        event.preventDefault();
      }
    } else if (this.currentState === 2 /* PLAYING */) {
      switch (event.code) {
        case "ArrowUp":
        case "KeyW":
          if (this.direction !== 1 /* DOWN */) this.nextDirection = 0 /* UP */;
          break;
        case "ArrowDown":
        case "KeyS":
          if (this.direction !== 0 /* UP */) this.nextDirection = 1 /* DOWN */;
          break;
        case "ArrowLeft":
        case "KeyA":
          if (this.direction !== 3 /* RIGHT */) this.nextDirection = 2 /* LEFT */;
          break;
        case "ArrowRight":
        case "KeyD":
          if (this.direction !== 2 /* LEFT */) this.nextDirection = 3 /* RIGHT */;
          break;
        case "Escape":
        case "KeyP":
          this.pauseGame();
          break;
      }
      event.preventDefault();
    } else if (this.currentState === 4 /* PAUSED */) {
      if (event.code === "Escape" || event.code === "KeyP") {
        this.resumeGame();
      }
    }
  }
  startGame() {
    if (this.bgmAudio && !this.isBgmPlaying) {
      this.bgmAudio.play().then(() => {
        this.isBgmPlaying = true;
      }).catch((e) => console.warn("BGM autoplay failed:", e));
    }
    this.snake = [];
    for (let i = 0; i < this.settings.initialSnakeLength; i++) {
      this.snake.push({
        x: Math.floor(this.settings.canvasWidth / this.settings.gridSize / 2) - i,
        y: Math.floor(this.settings.canvasHeight / this.settings.gridSize / 2)
      });
    }
    this.direction = 3 /* RIGHT */;
    this.nextDirection = 3 /* RIGHT */;
    this.score = 0;
    this.currentSpeedMs = this.settings.snakeSpeedInitialMs;
    this.food = null;
    this.spawnFood();
    this.lastMoveTime = performance.now();
    this.currentState = 2 /* PLAYING */;
  }
  pauseGame() {
    if (this.currentState === 2 /* PLAYING */) {
      this.currentState = 4 /* PAUSED */;
      if (this.bgmAudio) this.bgmAudio.pause();
    }
  }
  resumeGame() {
    if (this.currentState === 4 /* PAUSED */) {
      this.currentState = 2 /* PLAYING */;
      if (this.bgmAudio && this.isBgmPlaying) this.bgmAudio.play();
    }
  }
  gameOver() {
    this.currentState = 3 /* GAME_OVER */;
    this.playSound("gameOver");
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.isBgmPlaying = false;
    }
  }
  spawnFood() {
    const maxX = this.settings.canvasWidth / this.settings.gridSize - 1;
    const maxY = this.settings.canvasHeight / this.settings.gridSize - 1;
    let newFood;
    do {
      newFood = {
        x: Math.floor(Math.random() * (maxX + 1)),
        y: Math.floor(Math.random() * (maxY + 1))
      };
    } while (this.snake.some((segment) => segment.x === newFood.x && segment.y === newFood.y));
    this.food = newFood;
  }
  playSound(name) {
    const audio = this.assets.sounds.get(name);
    if (audio) {
      const clone = audio.cloneNode();
      clone.volume = audio.volume;
      clone.play().catch((e) => console.warn(`Failed to play sound '${name}':`, e));
    }
  }
  gameLoop(timestamp) {
    const deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.update(deltaTime);
    this.render();
    this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    if (this.currentState === 2 /* PLAYING */) {
      this.direction = this.nextDirection;
      if (this.lastMoveTime + this.currentSpeedMs <= performance.now()) {
        this.lastMoveTime = performance.now();
        this.moveSnake();
      }
    }
  }
  moveSnake() {
    const head = { ...this.snake[0] };
    switch (this.direction) {
      case 0 /* UP */:
        head.y--;
        break;
      case 1 /* DOWN */:
        head.y++;
        break;
      case 2 /* LEFT */:
        head.x--;
        break;
      case 3 /* RIGHT */:
        head.x++;
        break;
    }
    const maxX = this.settings.canvasWidth / this.settings.gridSize;
    const maxY = this.settings.canvasHeight / this.settings.gridSize;
    if (head.x < 0 || head.x >= maxX || head.y < 0 || head.y >= maxY) {
      this.gameOver();
      return;
    }
    for (let i = 0; i < this.snake.length - (this.food ? 0 : 1); i++) {
      if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
        this.gameOver();
        return;
      }
    }
    this.snake.unshift(head);
    if (this.food && head.x === this.food.x && head.y === this.food.y) {
      this.score++;
      this.playSound("eatFood");
      this.spawnFood();
      this.currentSpeedMs = Math.max(
        this.settings.minSnakeSpeedMs,
        this.currentSpeedMs - this.settings.snakeSpeedDecreaseMs
      );
    } else {
      this.snake.pop();
    }
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.currentState === 0 /* LOADING */) {
      this.drawText("Loading...", this.canvas.width / 2, this.canvas.height / 2, "white");
    } else if (this.currentState === 1 /* TITLE */) {
      this.drawText(this.settings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2, "white");
      this.drawText("Use Arrow Keys / WASD to move", this.canvas.width / 2, this.canvas.height / 2 + 50, "gray", 20);
      this.drawText("Eat food to grow!", this.canvas.width / 2, this.canvas.height / 2 + 80, "gray", 20);
    } else if (this.currentState === 2 /* PLAYING */ || this.currentState === 4 /* PAUSED */) {
      if (this.food) {
        this.drawImage("food", this.food.x * this.settings.gridSize, this.food.y * this.settings.gridSize, this.settings.gridSize, this.settings.gridSize);
      }
      this.snake.forEach((segment, index) => {
        const imgName = index === 0 ? "snakeHead" : "snakeBody";
        this.drawImage(imgName, segment.x * this.settings.gridSize, segment.y * this.settings.gridSize, this.settings.gridSize, this.settings.gridSize);
      });
      this.drawText(`Score: ${this.score}`, 10, 30, "white", 24, "left");
      if (this.currentState === 4 /* PAUSED */) {
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawText("PAUSED", this.canvas.width / 2, this.canvas.height / 2, "white", 48);
        this.drawText("Press ESC / P to Resume", this.canvas.width / 2, this.canvas.height / 2 + 50, "gray", 20);
      }
    } else if (this.currentState === 3 /* GAME_OVER */) {
      this.drawText(this.settings.gameOverText + this.score, this.canvas.width / 2, this.canvas.height / 2, "red");
      this.drawText("Press SPACE to Restart", this.canvas.width / 2, this.canvas.height / 2 + 50, "white", 20);
    }
  }
  drawImage(name, dx, dy, dWidth, dHeight) {
    const img = this.assets.images.get(name);
    if (img) {
      this.ctx.drawImage(img, dx, dy, dWidth, dHeight);
    } else {
      this.ctx.fillStyle = name === "food" ? "lime" : name === "snakeHead" ? "blue" : "green";
      this.ctx.fillRect(dx, dy, dWidth, dHeight);
    }
  }
  drawText(text, x, y, color, fontSize = 36, textAlign = "center") {
    this.ctx.fillStyle = color;
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.textAlign = textAlign;
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, x, y);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("gameCanvas")) {
    new SnakeGame("gameCanvas");
  } else {
    const body = document.body;
    const canvas = document.createElement("canvas");
    canvas.id = "gameCanvas";
    canvas.width = 800;
    canvas.height = 600;
    canvas.style.border = "1px solid white";
    canvas.style.display = "block";
    canvas.style.margin = "50px auto";
    body.appendChild(canvas);
    console.warn("No canvas element with ID 'gameCanvas' found. A default one was created.");
    new SnakeGame("gameCanvas");
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIFBvaW50IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmlkU2l6ZTogbnVtYmVyO1xyXG4gICAgaW5pdGlhbFNuYWtlTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBzbmFrZVNwZWVkSW5pdGlhbE1zOiBudW1iZXI7XHJcbiAgICBzbmFrZVNwZWVkRGVjcmVhc2VNczogbnVtYmVyO1xyXG4gICAgbWluU25ha2VTcGVlZE1zOiBudW1iZXI7XHJcbiAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlcjsgfVtdO1xyXG4gICAgfTtcclxufVxyXG5cclxuaW50ZXJmYWNlIExvYWRlZEFzc2V0cyB7XHJcbiAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+O1xyXG4gICAgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PjtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUixcclxuICAgIFBBVVNFRFxyXG59XHJcblxyXG5lbnVtIERpcmVjdGlvbiB7XHJcbiAgICBVUCxcclxuICAgIERPV04sXHJcbiAgICBMRUZULFxyXG4gICAgUklHSFRcclxufVxyXG5cclxuY2xhc3MgU25ha2VHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIHNldHRpbmdzITogR2FtZVNldHRpbmdzO1xyXG4gICAgcHJpdmF0ZSBhc3NldHM6IExvYWRlZEFzc2V0cyA9IHsgaW1hZ2VzOiBuZXcgTWFwKCksIHNvdW5kczogbmV3IE1hcCgpIH07XHJcblxyXG4gICAgcHJpdmF0ZSBjdXJyZW50U3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG4gICAgcHJpdmF0ZSBsYXN0RnJhbWVUaW1lID0gMDtcclxuXHJcbiAgICBwcml2YXRlIHNuYWtlOiBQb2ludFtdID0gW107XHJcbiAgICBwcml2YXRlIGZvb2Q6IFBvaW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGRpcmVjdGlvbjogRGlyZWN0aW9uID0gRGlyZWN0aW9uLlJJR0hUO1xyXG4gICAgcHJpdmF0ZSBuZXh0RGlyZWN0aW9uOiBEaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U3BlZWRNczogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbGFzdE1vdmVUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcElkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwcml2YXRlIGJnbUF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGlzQmdtUGxheWluZzogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYENhbnZhcyB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0IGZvciBjYW52YXMuJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuaW5pdCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xyXG5cclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5zZXR0aW5ncy5jYW52YXNIZWlnaHQ7XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHRoaXMuZ2FtZUxvb3BJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEdhbWVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIGFsZXJ0KCdGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEuIFBsZWFzZSBjaGVjayBkYXRhLmpzb24uJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5zZXR0aW5ncy5hc3NldHMuaW1hZ2VzLm1hcChpbWdEYXRhID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0RhdGEucGF0aDtcclxuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuaW1hZ2VzLnNldChpbWdEYXRhLm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZ0RhdGEucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZ0RhdGEucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5zZXR0aW5ncy5hc3NldHMuc291bmRzLm1hcChzb3VuZERhdGEgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHsgLy8gRG9uJ3QgcmVqZWN0IGZvciBzb3VuZHMsIGFzIHRoZXkgbWlnaHQgbG9hZCBsYXppbHlcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kRGF0YS5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZERhdGEudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHMuc2V0KHNvdW5kRGF0YS5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZERhdGEucGF0aH0uIEl0IG1pZ2h0IHN0aWxsIHBsYXkgbGF0ZXIuYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuc291bmRzLnNldChzb3VuZERhdGEubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gdGhpcy5hc3NldHMuc291bmRzLmdldCgnYmdtJykgfHwgbnVsbDtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ubG9vcCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnZvbHVtZSA9IHRoaXMuc2V0dGluZ3MuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnYmdtJyk/LnZvbHVtZSB8fCAwLjM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdPbmUgb3IgbW9yZSBhc3NldHMgZmFpbGVkIHRvIGxvYWQ6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICBhbGVydCgnRmFpbGVkIHRvIGxvYWQgc29tZSBnYW1lIGFzc2V0cy4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cEV2ZW50TGlzdGVuZXJzKCkge1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgfHwgdGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdTcGFjZScpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgc3dpdGNoIChldmVudC5jb2RlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdBcnJvd1VwJzpcclxuICAgICAgICAgICAgICAgIGNhc2UgJ0tleVcnOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRpcmVjdGlvbiAhPT0gRGlyZWN0aW9uLkRPV04pIHRoaXMubmV4dERpcmVjdGlvbiA9IERpcmVjdGlvbi5VUDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ0Fycm93RG93bic6XHJcbiAgICAgICAgICAgICAgICBjYXNlICdLZXlTJzpcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kaXJlY3Rpb24gIT09IERpcmVjdGlvbi5VUCkgdGhpcy5uZXh0RGlyZWN0aW9uID0gRGlyZWN0aW9uLkRPV047XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdBcnJvd0xlZnQnOlxyXG4gICAgICAgICAgICAgICAgY2FzZSAnS2V5QSc6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uUklHSFQpIHRoaXMubmV4dERpcmVjdGlvbiA9IERpcmVjdGlvbi5MRUZUO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnQXJyb3dSaWdodCc6XHJcbiAgICAgICAgICAgICAgICBjYXNlICdLZXlEJzpcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kaXJlY3Rpb24gIT09IERpcmVjdGlvbi5MRUZUKSB0aGlzLm5leHREaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdFc2NhcGUnOlxyXG4gICAgICAgICAgICAgICAgY2FzZSAnS2V5UCc6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXVzZUdhbWUoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5QQVVTRUQpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdFc2NhcGUnIHx8IGV2ZW50LmNvZGUgPT09ICdLZXlQJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZXN1bWVHYW1lKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8gJiYgIXRoaXMuaXNCZ21QbGF5aW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pc0JnbVBsYXlpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICB9KS5jYXRjaChlID0+IGNvbnNvbGUud2FybignQkdNIGF1dG9wbGF5IGZhaWxlZDonLCBlKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnNuYWtlID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnNldHRpbmdzLmluaXRpYWxTbmFrZUxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc25ha2UucHVzaCh7XHJcbiAgICAgICAgICAgICAgICB4OiBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGggLyB0aGlzLnNldHRpbmdzLmdyaWRTaXplIC8gMikgLSBpLFxyXG4gICAgICAgICAgICAgICAgeTogTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmNhbnZhc0hlaWdodCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUgLyAyKVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5kaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7XHJcbiAgICAgICAgdGhpcy5uZXh0RGlyZWN0aW9uID0gRGlyZWN0aW9uLlJJR0hUO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNwZWVkTXMgPSB0aGlzLnNldHRpbmdzLnNuYWtlU3BlZWRJbml0aWFsTXM7XHJcbiAgICAgICAgdGhpcy5mb29kID0gbnVsbDtcclxuICAgICAgICB0aGlzLnNwYXduRm9vZCgpO1xyXG4gICAgICAgIHRoaXMubGFzdE1vdmVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBhdXNlR2FtZSgpIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlBBVVNFRDtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXN1bWVHYW1lKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBBVVNFRCkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyAmJiB0aGlzLmlzQmdtUGxheWluZykgdGhpcy5iZ21BdWRpby5wbGF5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKSB7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdnYW1lT3ZlcicpO1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuaXNCZ21QbGF5aW5nID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25Gb29kKCkge1xyXG4gICAgICAgIGNvbnN0IG1heFggPSB0aGlzLnNldHRpbmdzLmNhbnZhc1dpZHRoIC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSAtIDE7XHJcbiAgICAgICAgY29uc3QgbWF4WSA9IHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0IC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSAtIDE7XHJcblxyXG4gICAgICAgIGxldCBuZXdGb29kOiBQb2ludDtcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIG5ld0Zvb2QgPSB7XHJcbiAgICAgICAgICAgICAgICB4OiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4WCArIDEpKSxcclxuICAgICAgICAgICAgICAgIHk6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXhZICsgMSkpXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSB3aGlsZSAodGhpcy5zbmFrZS5zb21lKHNlZ21lbnQgPT4gc2VnbWVudC54ID09PSBuZXdGb29kLnggJiYgc2VnbWVudC55ID09PSBuZXdGb29kLnkpKTtcclxuXHJcbiAgICAgICAgdGhpcy5mb29kID0gbmV3Rm9vZDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXNzZXRzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gYXVkaW8udm9sdW1lO1xyXG4gICAgICAgICAgICBjbG9uZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBwbGF5IHNvdW5kICcke25hbWV9JzpgLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AodGltZXN0YW1wOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gdGltZXN0YW1wIC0gdGhpcy5sYXN0RnJhbWVUaW1lO1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHRpbWVzdGFtcDtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG5cclxuICAgICAgICB0aGlzLmdhbWVMb29wSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5kaXJlY3Rpb24gPSB0aGlzLm5leHREaXJlY3Rpb247XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5sYXN0TW92ZVRpbWUgKyB0aGlzLmN1cnJlbnRTcGVlZE1zIDw9IHBlcmZvcm1hbmNlLm5vdygpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RNb3ZlVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlU25ha2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG1vdmVTbmFrZSgpIHtcclxuICAgICAgICBjb25zdCBoZWFkID0geyAuLi50aGlzLnNuYWtlWzBdIH07XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5kaXJlY3Rpb24pIHtcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uVVA6XHJcbiAgICAgICAgICAgICAgICBoZWFkLnktLTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5ET1dOOlxyXG4gICAgICAgICAgICAgICAgaGVhZC55Kys7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uTEVGVDpcclxuICAgICAgICAgICAgICAgIGhlYWQueC0tO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLlJJR0hUOlxyXG4gICAgICAgICAgICAgICAgaGVhZC54Kys7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG1heFggPSB0aGlzLnNldHRpbmdzLmNhbnZhc1dpZHRoIC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZTtcclxuICAgICAgICBjb25zdCBtYXhZID0gdGhpcy5zZXR0aW5ncy5jYW52YXNIZWlnaHQgLyB0aGlzLnNldHRpbmdzLmdyaWRTaXplO1xyXG5cclxuICAgICAgICBpZiAoaGVhZC54IDwgMCB8fCBoZWFkLnggPj0gbWF4WCB8fCBoZWFkLnkgPCAwIHx8IGhlYWQueSA+PSBtYXhZKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnNuYWtlLmxlbmd0aCAtICh0aGlzLmZvb2QgPyAwIDogMSk7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoaGVhZC54ID09PSB0aGlzLnNuYWtlW2ldLnggJiYgaGVhZC55ID09PSB0aGlzLnNuYWtlW2ldLnkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zbmFrZS51bnNoaWZ0KGhlYWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5mb29kICYmIGhlYWQueCA9PT0gdGhpcy5mb29kLnggJiYgaGVhZC55ID09PSB0aGlzLmZvb2QueSkge1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlKys7XHJcbiAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdlYXRGb29kJyk7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25Gb29kKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTcGVlZE1zID0gTWF0aC5tYXgoXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldHRpbmdzLm1pblNuYWtlU3BlZWRNcyxcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFNwZWVkTXMgLSB0aGlzLnNldHRpbmdzLnNuYWtlU3BlZWREZWNyZWFzZU1zXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5zbmFrZS5wb3AoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5MT0FESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoJ0xvYWRpbmcuLi4nLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICd3aGl0ZScpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuc2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICd3aGl0ZScpO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KCdVc2UgQXJyb3cgS2V5cyAvIFdBU0QgdG8gbW92ZScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwLCAnZ3JheScsIDIwKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCgnRWF0IGZvb2QgdG8gZ3JvdyEnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA4MCwgJ2dyYXknLCAyMCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgfHwgdGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5QQVVTRUQpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZm9vZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SW1hZ2UoJ2Zvb2QnLCB0aGlzLmZvb2QueCAqIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUsIHRoaXMuZm9vZC55ICogdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSwgdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSwgdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuc25ha2UuZm9yRWFjaCgoc2VnbWVudCwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZ05hbWUgPSAoaW5kZXggPT09IDApID8gJ3NuYWtlSGVhZCcgOiAnc25ha2VCb2R5JztcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0ltYWdlKGltZ05hbWUsIHNlZ21lbnQueCAqIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUsIHNlZ21lbnQueSAqIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUsIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUsIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoYFNjb3JlOiAke3RoaXMuc2NvcmV9YCwgMTAsIDMwLCAnd2hpdGUnLCAyNCwgJ2xlZnQnKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBBVVNFRCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC41KSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoJ1BBVVNFRCcsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgNDgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCgnUHJlc3MgRVNDIC8gUCB0byBSZXN1bWUnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJ2dyYXknLCAyMCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuc2V0dGluZ3MuZ2FtZU92ZXJUZXh0ICsgdGhpcy5zY29yZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyLCAncmVkJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoJ1ByZXNzIFNQQUNFIHRvIFJlc3RhcnQnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJ3doaXRlJywgMjApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdJbWFnZShuYW1lOiBzdHJpbmcsIGR4OiBudW1iZXIsIGR5OiBudW1iZXIsIGRXaWR0aDogbnVtYmVyLCBkSGVpZ2h0OiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBpbWcgPSB0aGlzLmFzc2V0cy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGltZywgZHgsIGR5LCBkV2lkdGgsIGRIZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IG5hbWUgPT09ICdmb29kJyA/ICdsaW1lJyA6IChuYW1lID09PSAnc25ha2VIZWFkJyA/ICdibHVlJyA6ICdncmVlbicpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChkeCwgZHksIGRXaWR0aCwgZEhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RleHQodGV4dDogc3RyaW5nLCB4OiBudW1iZXIsIHk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZm9udFNpemU6IG51bWJlciA9IDM2LCB0ZXh0QWxpZ246IENhbnZhc1RleHRBbGlnbiA9ICdjZW50ZXInKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke2ZvbnRTaXplfXB4IEFyaWFsYDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSB0ZXh0QWxpZ247XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dCwgeCwgeSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSkge1xyXG4gICAgICAgIG5ldyBTbmFrZUdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmJvZHk7XHJcbiAgICAgICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XHJcbiAgICAgICAgY2FudmFzLmlkID0gJ2dhbWVDYW52YXMnO1xyXG4gICAgICAgIGNhbnZhcy53aWR0aCA9IDgwMDtcclxuICAgICAgICBjYW52YXMuaGVpZ2h0ID0gNjAwO1xyXG4gICAgICAgIGNhbnZhcy5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHdoaXRlJztcclxuICAgICAgICBjYW52YXMuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgY2FudmFzLnN0eWxlLm1hcmdpbiA9ICc1MHB4IGF1dG8nO1xyXG4gICAgICAgIGJvZHkuYXBwZW5kQ2hpbGQoY2FudmFzKTtcclxuICAgICAgICBjb25zb2xlLndhcm4oXCJObyBjYW52YXMgZWxlbWVudCB3aXRoIElEICdnYW1lQ2FudmFzJyBmb3VuZC4gQSBkZWZhdWx0IG9uZSB3YXMgY3JlYXRlZC5cIik7XHJcbiAgICAgICAgbmV3IFNuYWtlR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfVxyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUEwQkEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUxDLFNBQUFBO0FBQUEsR0FBQTtBQVFMLElBQUssWUFBTCxrQkFBS0MsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxVQUFVO0FBQUEsRUFxQlosWUFBWSxVQUFrQjtBQWpCOUIsU0FBUSxTQUF1QixFQUFFLFFBQVEsb0JBQUksSUFBSSxHQUFHLFFBQVEsb0JBQUksSUFBSSxFQUFFO0FBRXRFLFNBQVEsZUFBMEI7QUFDbEMsU0FBUSxnQkFBZ0I7QUFFeEIsU0FBUSxRQUFpQixDQUFDO0FBQzFCLFNBQVEsT0FBcUI7QUFDN0IsU0FBUSxZQUF1QjtBQUMvQixTQUFRLGdCQUEyQjtBQUNuQyxTQUFRLFFBQWdCO0FBQ3hCLFNBQVEsaUJBQXlCO0FBQ2pDLFNBQVEsZUFBdUI7QUFDL0IsU0FBUSxhQUE0QjtBQUVwQyxTQUFRLFdBQW9DO0FBQzVDLFNBQVEsZUFBd0I7QUFHNUIsU0FBSyxTQUFTLFNBQVMsZUFBZSxRQUFRO0FBQzlDLFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDZCxj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QUEsTUFDM0c7QUFBQSxJQUVKLFdBQVcsS0FBSyxpQkFBaUIsbUJBQXFCO0FBQ2xELFdBQUssU0FBUyxLQUFLLFNBQVMsZUFBZSxLQUFLLE9BQU8sS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxHQUFHLEtBQUs7QUFDM0csV0FBSyxTQUFTLDBCQUEwQixLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksSUFBSSxTQUFTLEVBQUU7QUFBQSxJQUMzRztBQUFBLEVBQ0o7QUFBQSxFQUVRLFVBQVUsTUFBYyxJQUFZLElBQVksUUFBZ0IsU0FBaUI7QUFDckYsVUFBTSxNQUFNLEtBQUssT0FBTyxPQUFPLElBQUksSUFBSTtBQUN2QyxRQUFJLEtBQUs7QUFDTCxXQUFLLElBQUksVUFBVSxLQUFLLElBQUksSUFBSSxRQUFRLE9BQU87QUFBQSxJQUNuRCxPQUFPO0FBQ0gsV0FBSyxJQUFJLFlBQVksU0FBUyxTQUFTLFNBQVUsU0FBUyxjQUFjLFNBQVM7QUFDakYsV0FBSyxJQUFJLFNBQVMsSUFBSSxJQUFJLFFBQVEsT0FBTztBQUFBLElBQzdDO0FBQUEsRUFDSjtBQUFBLEVBRVEsU0FBUyxNQUFjLEdBQVcsR0FBVyxPQUFlLFdBQW1CLElBQUksWUFBNkIsVUFBVTtBQUM5SCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksT0FBTyxHQUFHLFFBQVE7QUFDM0IsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLGVBQWU7QUFDeEIsU0FBSyxJQUFJLFNBQVMsTUFBTSxHQUFHLENBQUM7QUFBQSxFQUNoQztBQUNKO0FBRUEsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsTUFBSSxTQUFTLGVBQWUsWUFBWSxHQUFHO0FBQ3ZDLFFBQUksVUFBVSxZQUFZO0FBQUEsRUFDOUIsT0FBTztBQUNILFVBQU0sT0FBTyxTQUFTO0FBQ3RCLFVBQU0sU0FBUyxTQUFTLGNBQWMsUUFBUTtBQUM5QyxXQUFPLEtBQUs7QUFDWixXQUFPLFFBQVE7QUFDZixXQUFPLFNBQVM7QUFDaEIsV0FBTyxNQUFNLFNBQVM7QUFDdEIsV0FBTyxNQUFNLFVBQVU7QUFDdkIsV0FBTyxNQUFNLFNBQVM7QUFDdEIsU0FBSyxZQUFZLE1BQU07QUFDdkIsWUFBUSxLQUFLLDBFQUEwRTtBQUN2RixRQUFJLFVBQVUsWUFBWTtBQUFBLEVBQzlCO0FBQ0osQ0FBQzsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIiwgIkRpcmVjdGlvbiJdCn0K
