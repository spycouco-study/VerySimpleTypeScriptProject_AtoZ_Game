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
    this.ctx.fillStyle = this.settings.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIFBvaW50IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmlkU2l6ZTogbnVtYmVyO1xyXG4gICAgaW5pdGlhbFNuYWtlTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBzbmFrZVNwZWVkSW5pdGlhbE1zOiBudW1iZXI7XHJcbiAgICBzbmFrZVNwZWVkRGVjcmVhc2VNczogbnVtYmVyO1xyXG4gICAgbWluU25ha2VTcGVlZE1zOiBudW1iZXI7XHJcbiAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgYmFja2dyb3VuZENvbG9yOiBzdHJpbmc7IC8vIEFkZGVkIGZvciBiYWNrZ3JvdW5kIGNvbG9yXHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTG9hZGVkQXNzZXRzIHtcclxuICAgIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD47XHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HLFxyXG4gICAgVElUTEUsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSLFxyXG4gICAgUEFVU0VEXHJcbn1cclxuXHJcbmVudW0gRGlyZWN0aW9uIHtcclxuICAgIFVQLFxyXG4gICAgRE9XTixcclxuICAgIExFRlQsXHJcbiAgICBSSUdIVFxyXG59XHJcblxyXG5jbGFzcyBTbmFrZUdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgc2V0dGluZ3MhOiBHYW1lU2V0dGluZ3M7XHJcbiAgICBwcml2YXRlIGFzc2V0czogTG9hZGVkQXNzZXRzID0geyBpbWFnZXM6IG5ldyBNYXAoKSwgc291bmRzOiBuZXcgTWFwKCkgfTtcclxuXHJcbiAgICBwcml2YXRlIGN1cnJlbnRTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIGxhc3RGcmFtZVRpbWUgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgc25ha2U6IFBvaW50W10gPSBbXTtcclxuICAgIHByaXZhdGUgZm9vZDogUG9pbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgZGlyZWN0aW9uOiBEaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7XHJcbiAgICBwcml2YXRlIG5leHREaXJlY3Rpb246IERpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDtcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRTcGVlZE1zOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBsYXN0TW92ZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGdhbWVMb29wSWQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaXNCZ21QbGF5aW5nOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICBpZiAoIXRoaXMuY3R4KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgMkQgcmVuZGVyaW5nIGNvbnRleHQgZm9yIGNhbnZhcy4nKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5pbml0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEdhbWVEYXRhKCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cEV2ZW50TGlzdGVuZXJzKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5zZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLnNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5nYW1lTG9vcElkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhOicsIGVycm9yKTtcclxuICAgICAgICAgICAgYWxlcnQoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YS4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi4nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLnNldHRpbmdzLmFzc2V0cy5pbWFnZXMubWFwKGltZ0RhdGEgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWcuc3JjID0gaW1nRGF0YS5wYXRoO1xyXG4gICAgICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5pbWFnZXMuc2V0KGltZ0RhdGEubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1nRGF0YS5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1nRGF0YS5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLnNldHRpbmdzLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kRGF0YSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4geyAvLyBEb24ndCByZWplY3QgZm9yIHNvdW5kcywgYXMgdGhleSBtaWdodCBsb2FkIGxhemlseVxyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmREYXRhLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJztcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kRGF0YS52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLnNvdW5kcy5zZXQoc291bmREYXRhLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kRGF0YS5wYXRofS4gSXQgbWlnaHQgc3RpbGwgcGxheSBsYXRlci5gKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHMuc2V0KHNvdW5kRGF0YS5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8gPSB0aGlzLmFzc2V0cy5zb3VuZHMuZ2V0KCdiZ20nKSB8fCBudWxsO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8udm9sdW1lID0gdGhpcy5zZXR0aW5ncy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuMztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ09uZSBvciBtb3JlIGFzc2V0cyBmYWlsZWQgdG8gbG9hZDonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIGFsZXJ0KCdGYWlsZWQgdG8gbG9hZCBzb21lIGdhbWUgYXNzZXRzLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwRXZlbnRMaXN0ZW5lcnMoKSB7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fCB0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ1NwYWNlJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ0Fycm93VXAnOlxyXG4gICAgICAgICAgICAgICAgY2FzZSAnS2V5Vyc6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uRE9XTikgdGhpcy5uZXh0RGlyZWN0aW9uID0gRGlyZWN0aW9uLlVQO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnQXJyb3dEb3duJzpcclxuICAgICAgICAgICAgICAgIGNhc2UgJ0tleVMnOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRpcmVjdGlvbiAhPT0gRGlyZWN0aW9uLlVQKSB0aGlzLm5leHREaXJlY3Rpb24gPSBEaXJlY3Rpb24uRE9XTjtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ0Fycm93TGVmdCc6XHJcbiAgICAgICAgICAgICAgICBjYXNlICdLZXlBJzpcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kaXJlY3Rpb24gIT09IERpcmVjdGlvbi5SSUdIVCkgdGhpcy5uZXh0RGlyZWN0aW9uID0gRGlyZWN0aW9uLkxFRlQ7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdBcnJvd1JpZ2h0JzpcclxuICAgICAgICAgICAgICAgIGNhc2UgJ0tleUQnOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRpcmVjdGlvbiAhPT0gRGlyZWN0aW9uLkxFRlQpIHRoaXMubmV4dERpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ0VzY2FwZSc6XHJcbiAgICAgICAgICAgICAgICBjYXNlICdLZXlQJzpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhdXNlR2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBBVVNFRCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ0VzY2FwZScgfHwgZXZlbnQuY29kZSA9PT0gJ0tleVAnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlc3VtZUdhbWUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyAmJiAhdGhpcy5pc0JnbVBsYXlpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmlzQmdtUGxheWluZyA9IHRydWU7XHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKCdCR00gYXV0b3BsYXkgZmFpbGVkOicsIGUpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc25ha2UgPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2V0dGluZ3MuaW5pdGlhbFNuYWtlTGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdGhpcy5zbmFrZS5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHg6IE1hdGguZmxvb3IodGhpcy5zZXR0aW5ncy5jYW52YXNXaWR0aCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUgLyAyKSAtIGksXHJcbiAgICAgICAgICAgICAgICB5OiBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0IC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSAvIDIpXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmRpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDtcclxuICAgICAgICB0aGlzLm5leHREaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3BlZWRNcyA9IHRoaXMuc2V0dGluZ3Muc25ha2VTcGVlZEluaXRpYWxNcztcclxuICAgICAgICB0aGlzLmZvb2QgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuc3Bhd25Gb29kKCk7XHJcbiAgICAgICAgdGhpcy5sYXN0TW92ZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGF1c2VHYW1lKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuUEFVU0VEO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc3VtZUdhbWUoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuUEFVU0VEKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvICYmIHRoaXMuaXNCZ21QbGF5aW5nKSB0aGlzLmJnbUF1ZGlvLnBsYXkoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lT3ZlcigpIHtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2dhbWVPdmVyJyk7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgdGhpcy5pc0JnbVBsYXlpbmcgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bkZvb2QoKSB7XHJcbiAgICAgICAgY29uc3QgbWF4WCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGggLyB0aGlzLnNldHRpbmdzLmdyaWRTaXplIC0gMTtcclxuICAgICAgICBjb25zdCBtYXhZID0gdGhpcy5zZXR0aW5ncy5jYW52YXNIZWlnaHQgLyB0aGlzLnNldHRpbmdzLmdyaWRTaXplIC0gMTtcclxuXHJcbiAgICAgICAgbGV0IG5ld0Zvb2Q6IFBvaW50O1xyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgbmV3Rm9vZCA9IHtcclxuICAgICAgICAgICAgICAgIHg6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXhYICsgMSkpLFxyXG4gICAgICAgICAgICAgICAgeTogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heFkgKyAxKSlcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IHdoaWxlICh0aGlzLnNuYWtlLnNvbWUoc2VnbWVudCA9PiBzZWdtZW50LnggPT09IG5ld0Zvb2QueCAmJiBzZWdtZW50LnkgPT09IG5ld0Zvb2QueSkpO1xyXG5cclxuICAgICAgICB0aGlzLmZvb2QgPSBuZXdGb29kO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGxheVNvdW5kKG5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hc3NldHMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3QgY2xvbmUgPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSBhdWRpby52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgRmFpbGVkIHRvIHBsYXkgc291bmQgJyR7bmFtZX0nOmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lc3RhbXA6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSB0aW1lc3RhbXAgLSB0aGlzLmxhc3RGcmFtZVRpbWU7XHJcbiAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gdGltZXN0YW1wO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcblxyXG4gICAgICAgIHRoaXMuZ2FtZUxvb3BJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLmRpcmVjdGlvbiA9IHRoaXMubmV4dERpcmVjdGlvbjtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmxhc3RNb3ZlVGltZSArIHRoaXMuY3VycmVudFNwZWVkTXMgPD0gcGVyZm9ybWFuY2Uubm93KCkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubGFzdE1vdmVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVTbmFrZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbW92ZVNuYWtlKCkge1xyXG4gICAgICAgIGNvbnN0IGhlYWQgPSB7IC4uLnRoaXMuc25ha2VbMF0gfTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmRpcmVjdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5VUDpcclxuICAgICAgICAgICAgICAgIGhlYWQueS0tO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkRPV046XHJcbiAgICAgICAgICAgICAgICBoZWFkLnkrKztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5MRUZUOlxyXG4gICAgICAgICAgICAgICAgaGVhZC54LS07XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uUklHSFQ6XHJcbiAgICAgICAgICAgICAgICBoZWFkLngrKztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWF4WCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGggLyB0aGlzLnNldHRpbmdzLmdyaWRTaXplO1xyXG4gICAgICAgIGNvbnN0IG1heFkgPSB0aGlzLnNldHRpbmdzLmNhbnZhc0hlaWdodCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcblxyXG4gICAgICAgIGlmIChoZWFkLnggPCAwIHx8IGhlYWQueCA+PSBtYXhYIHx8IGhlYWQueSA8IDAgfHwgaGVhZC55ID49IG1heFkpIHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc25ha2UubGVuZ3RoIC0gKHRoaXMuZm9vZCA/IDAgOiAxKTsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChoZWFkLnggPT09IHRoaXMuc25ha2VbaV0ueCAmJiBoZWFkLnkgPT09IHRoaXMuc25ha2VbaV0ueSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnNuYWtlLnVuc2hpZnQoaGVhZCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmZvb2QgJiYgaGVhZC54ID09PSB0aGlzLmZvb2QueCAmJiBoZWFkLnkgPT09IHRoaXMuZm9vZC55KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2NvcmUrKztcclxuICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ2VhdEZvb2QnKTtcclxuICAgICAgICAgICAgdGhpcy5zcGF3bkZvb2QoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFNwZWVkTXMgPSBNYXRoLm1heChcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MubWluU25ha2VTcGVlZE1zLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3BlZWRNcyAtIHRoaXMuc2V0dGluZ3Muc25ha2VTcGVlZERlY3JlYXNlTXNcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnNuYWtlLnBvcCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlcigpIHtcclxuICAgICAgICAvLyBDbGVhciB0aGUgY2FudmFzIGZpcnN0XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGJhc2VkIG9uIHNldHRpbmdzXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5zZXR0aW5ncy5iYWNrZ3JvdW5kQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLkxPQURJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCgnTG9hZGluZy4uLicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJyk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5zZXR0aW5ncy50aXRsZVNjcmVlblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoJ1VzZSBBcnJvdyBLZXlzIC8gV0FTRCB0byBtb3ZlJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTAsICdncmF5JywgMjApO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KCdFYXQgZm9vZCB0byBncm93IScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwLCAnZ3JheScsIDIwKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyB8fCB0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlBBVVNFRCkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5mb29kKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdJbWFnZSgnZm9vZCcsIHRoaXMuZm9vZC54ICogdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSwgdGhpcy5mb29kLnkgKiB0aGlzLnNldHRpbmdzLmdyaWRTaXplLCB0aGlzLnNldHRpbmdzLmdyaWRTaXplLCB0aGlzLnNldHRpbmdzLmdyaWRTaXplKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5zbmFrZS5mb3JFYWNoKChzZWdtZW50LCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nTmFtZSA9IChpbmRleCA9PT0gMCkgPyAnc25ha2VIZWFkJyA6ICdzbmFrZUJvZHknO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SW1hZ2UoaW1nTmFtZSwgc2VnbWVudC54ICogdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSwgc2VnbWVudC55ICogdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSwgdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSwgdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChgU2NvcmU6ICR7dGhpcy5zY29yZX1gLCAxMCwgMzAsICd3aGl0ZScsIDI0LCAnbGVmdCcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuUEFVU0VEKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjUpJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCgnUEFVU0VEJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyLCAnd2hpdGUnLCA0OCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KCdQcmVzcyBFU0MgLyBQIHRvIFJlc3VtZScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwLCAnZ3JheScsIDIwKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5zZXR0aW5ncy5nYW1lT3ZlclRleHQgKyB0aGlzLnNjb3JlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICdyZWQnKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCgnUHJlc3MgU1BBQ0UgdG8gUmVzdGFydCcsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwLCAnd2hpdGUnLCAyMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0ltYWdlKG5hbWU6IHN0cmluZywgZHg6IG51bWJlciwgZHk6IG51bWJlciwgZFdpZHRoOiBudW1iZXIsIGRIZWlnaHQ6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IHRoaXMuYXNzZXRzLmltYWdlcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGltZykge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoaW1nLCBkeCwgZHksIGRXaWR0aCwgZEhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gbmFtZSA9PT0gJ2Zvb2QnID8gJ2xpbWUnIDogKG5hbWUgPT09ICdzbmFrZUhlYWQnID8gJ2JsdWUnIDogJ2dyZWVuJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGR4LCBkeSwgZFdpZHRoLCBkSGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBmb250U2l6ZTogbnVtYmVyID0gMzYsIHRleHRBbGlnbjogQ2FudmFzVGV4dEFsaWduID0gJ2NlbnRlcicpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYCR7Zm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IHRleHRBbGlnbjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuICAgIH1cclxufVxyXG5cclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpKSB7XHJcbiAgICAgICAgbmV3IFNuYWtlR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zdCBib2R5ID0gZG9jdW1lbnQuYm9keTtcclxuICAgICAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICBjYW52YXMuaWQgPSAnZ2FtZUNhbnZhcyc7XHJcbiAgICAgICAgY2FudmFzLndpZHRoID0gODAwO1xyXG4gICAgICAgIGNhbnZhcy5oZWlnaHQgPSA2MDA7XHJcbiAgICAgICAgY2FudmFzLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgd2hpdGUnO1xyXG4gICAgICAgIGNhbnZhcy5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICBjYW52YXMuc3R5bGUubWFyZ2luID0gJzUwcHggYXV0byc7XHJcbiAgICAgICAgYm9keS5hcHBlbmRDaGlsZChjYW52YXMpO1xyXG4gICAgICAgIGNvbnNvbGUud2FybihcIk5vIGNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIGZvdW5kLiBBIGRlZmF1bHQgb25lIHdhcyBjcmVhdGVkLlwiKTtcclxuICAgICAgICBuZXcgU25ha2VHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICB9XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQTJCQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBTEMsU0FBQUE7QUFBQSxHQUFBO0FBUUwsSUFBSyxZQUFMLGtCQUFLQyxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFKQyxTQUFBQTtBQUFBLEdBQUE7QUFPTCxNQUFNLFVBQVU7QUFBQSxFQXFCWixZQUFZLFVBQWtCO0FBakI5QixTQUFRLFNBQXVCLEVBQUUsUUFBUSxvQkFBSSxJQUFJLEdB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
