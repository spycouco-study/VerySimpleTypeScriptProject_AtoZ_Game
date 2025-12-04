class AssetManager {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.loadedCount = 0;
    this.totalAssets = 0;
  }
  async loadAssets(data) {
    this.totalAssets = data.assets.images.length + data.assets.sounds.length;
    const imagePromises = data.assets.images.map((img) => this.loadImage(img.name, img.path));
    const soundPromises = data.assets.sounds.map((snd) => this.loadSound(snd.name, snd.path));
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  loadImage(name, path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = path;
      img.onload = () => {
        this.images.set(name, img);
        this.loadedCount++;
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${path}`);
        reject(new Error(`Failed to load image: ${path}`));
      };
    });
  }
  loadSound(name, path) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(path);
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        this.sounds.set(name, audio);
        this.loadedCount++;
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${path}`);
        reject(new Error(`Failed to load sound: ${path}`));
      };
    });
  }
  getImage(name) {
    const img = this.images.get(name);
    if (!img) {
      console.warn(`Image "${name}" not found.`);
      const dummy = new Image();
      dummy.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      return dummy;
    }
    return img;
  }
  playSound(name, loop = false, volume = 1) {
    const audio = this.sounds.get(name);
    if (audio) {
      if (!loop) {
        const effect = audio.cloneNode();
        effect.volume = volume;
        effect.play().catch((e) => console.error("Sound play failed:", e));
      } else {
        audio.loop = loop;
        audio.volume = volume;
        audio.play().catch((e) => console.error("BGM play failed:", e));
      }
    } else {
      console.warn(`Sound "${name}" not found.`);
    }
  }
  getLoadingProgress() {
    return this.totalAssets === 0 ? 0 : this.loadedCount / this.totalAssets;
  }
}
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class InputManager {
  constructor() {
    this.keys = /* @__PURE__ */ new Set();
    this.mouseClicked = false;
    this.onKeyDown = (event) => {
      this.keys.add(event.code);
    };
    this.onKeyUp = (event) => {
      this.keys.delete(event.code);
    };
    this.onMouseDown = (event) => {
      if (event.button === 0) {
        this.mouseClicked = true;
      }
    };
    this.onMouseUp = (event) => {
      if (event.button === 0) {
        this.mouseClicked = false;
      }
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
  }
  isKeyDown(code) {
    return this.keys.has(code);
  }
  isMouseClicked() {
    const clicked = this.mouseClicked;
    if (clicked) this.mouseClicked = false;
    return clicked;
  }
  reset() {
    this.keys.clear();
    this.mouseClicked = false;
  }
  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
  }
}
class GameObject {
  constructor(x, y, width, height, imageName) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageName = imageName;
  }
  draw(ctx, assets) {
    const image = assets.getImage(this.imageName);
    ctx.drawImage(image, this.x, this.y, this.width, this.height);
  }
  isCollidingWith(other) {
    return this.x < other.x + other.width && this.x + this.width > other.x && this.y < other.y + other.height && this.y + this.height > other.y;
  }
}
class Player extends GameObject {
  constructor(x, y, width, height, imageName, speed, canvasWidth) {
    super(x, y, width, height, imageName);
    this.speed = speed;
    this.canvasWidth = canvasWidth;
  }
  update(deltaTime, input) {
    if (input.isKeyDown("ArrowLeft") || input.isKeyDown("KeyA")) {
      this.x -= this.speed * deltaTime;
    }
    if (input.isKeyDown("ArrowRight") || input.isKeyDown("KeyD")) {
      this.x += this.speed * deltaTime;
    }
    this.x = Math.max(0, Math.min(this.canvasWidth - this.width, this.x));
  }
}
class Enemy extends GameObject {
  constructor(x, y, width, height, imageName, velocityY, canvasHeight) {
    super(x, y, width, height, imageName);
    this.velocityY = velocityY;
    this.canvasHeight = canvasHeight;
  }
  update(deltaTime) {
    this.y += this.velocityY * deltaTime;
  }
  isOffScreen() {
    return this.y > this.canvasHeight;
  }
}
class Game {
  constructor(canvasId) {
    this.assets = new AssetManager();
    this.input = new InputManager();
    this.state = 0 /* LOADING */;
    this.lastTime = 0;
    this.animationFrameId = 0;
    this.enemies = [];
    this.score = 0;
    this.enemySpawnTimer = 0;
    this.gameLoop = (currentTime) => {
      const deltaTime = (currentTime - this.lastTime) / 1e3;
      this.lastTime = currentTime;
      this.update(deltaTime);
      this.draw();
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
    };
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      throw new Error(`Canvas element with ID "${canvasId}" not found.`);
    }
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D rendering context for canvas.");
    }
    this.ctx = ctx;
  }
  async start() {
    await this.loadGameData();
    this.resizeCanvas();
    await this.assets.loadAssets(this.data);
    this.state = 1 /* TITLE */;
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
    this.assets.playSound("bgm", true, this.data.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.5);
  }
  async loadGameData() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.data = await response.json();
    } catch (error) {
      console.error("Failed to load game data:", error);
      alert("Failed to load game data. Please check data.json.");
      this.state = 0 /* LOADING */;
    }
  }
  resizeCanvas() {
    this.canvas.width = this.data.canvasWidth;
    this.canvas.height = this.data.canvasHeight;
  }
  initializeGame() {
    this.score = 0;
    this.enemies = [];
    this.enemySpawnTimer = 0;
    const playerData = this.data.player;
    this.player = new Player(
      (this.canvas.width - playerData.width) / 2,
      this.canvas.height - playerData.height - 20,
      playerData.width,
      playerData.height,
      playerData.imageName,
      playerData.speed,
      this.canvas.width
    );
    for (let i = 0; i < this.data.enemy.initialCount; i++) {
      this.spawnEnemy(true);
    }
    this.assets.playSound("game_start", false, this.data.assets.sounds.find((s) => s.name === "game_start")?.volume || 1);
  }
  spawnEnemy(initialSpawn = false) {
    const enemyData = this.data.enemy;
    const x = Math.random() * (this.canvas.width - enemyData.width);
    const y = initialSpawn ? Math.random() * -this.canvas.height : -enemyData.height;
    const velocityY = enemyData.speedMin + Math.random() * (enemyData.speedMax - enemyData.speedMin);
    this.enemies.push(new Enemy(x, y, enemyData.width, enemyData.height, enemyData.imageName, velocityY, this.canvas.height));
  }
  update(deltaTime) {
    switch (this.state) {
      case 0 /* LOADING */:
        break;
      case 1 /* TITLE */:
        if (this.input.isMouseClicked() || this.input.isKeyDown("Space")) {
          this.initializeGame();
          this.state = 2 /* PLAYING */;
        }
        break;
      case 2 /* PLAYING */:
        this.player.update(deltaTime, this.input);
        this.enemies = this.enemies.filter((enemy) => {
          enemy.update(deltaTime);
          return !enemy.isOffScreen();
        });
        this.enemySpawnTimer += deltaTime;
        if (this.enemySpawnTimer >= this.data.enemy.spawnInterval) {
          this.spawnEnemy();
          this.enemySpawnTimer = 0;
        }
        for (const enemy of this.enemies) {
          if (this.player.isCollidingWith(enemy)) {
            this.assets.playSound("hit_sound", false, this.data.assets.sounds.find((s) => s.name === "hit_sound")?.volume || 1);
            this.state = 3 /* GAME_OVER */;
            break;
          }
        }
        this.score += this.data.scoreIncrementPerSecond * deltaTime;
        break;
      case 3 /* GAME_OVER */:
        if (this.input.isMouseClicked() || this.input.isKeyDown("Space")) {
          this.initializeGame();
          this.state = 2 /* PLAYING */;
        }
        break;
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.data?.backgroundColor || "#000000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.state) {
      case 0 /* LOADING */:
        this.drawLoadingScreen();
        break;
      case 1 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 2 /* PLAYING */:
        this.player.draw(this.ctx, this.assets);
        this.enemies.forEach((enemy) => enemy.draw(this.ctx, this.assets));
        this.drawScore();
        break;
      case 3 /* GAME_OVER */:
        this.drawGameOverScreen();
        this.drawScore();
        break;
    }
  }
  drawLoadingScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = `24px ${this.data?.fontFamily || "Arial"}`;
    this.ctx.textAlign = "center";
    const progress = (this.assets.getLoadingProgress() * 100).toFixed(0);
    this.ctx.fillText(`Loading... ${progress}%`, this.canvas.width / 2, this.canvas.height / 2);
  }
  drawTitleScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = `48px ${this.data.fontFamily}`;
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.data.gameTitle, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = `24px ${this.data.fontFamily}`;
    this.ctx.fillText(this.data.titleScreenInstruction, this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = "red";
    this.ctx.font = `48px ${this.data.fontFamily}`;
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.data.gameOverMessage, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.fillStyle = "white";
    this.ctx.font = `24px ${this.data.fontFamily}`;
    this.ctx.fillText(this.data.restartInstruction, this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  drawScore() {
    this.ctx.fillStyle = "white";
    this.ctx.font = `20px ${this.data.fontFamily}`;
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 10, 30);
  }
  destroy() {
    cancelAnimationFrame(this.animationFrameId);
    this.input.destroy();
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const gameCanvas = document.createElement("canvas");
  gameCanvas.id = "gameCanvas";
  document.body.appendChild(gameCanvas);
  try {
    const game = new Game("gameCanvas");
    game.start();
  } catch (error) {
    console.error("Failed to initialize game:", error);
    alert("Game initialization failed. See console for details.");
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIGdhbWVUaXRsZTogc3RyaW5nO1xyXG4gICAgdGl0bGVTY3JlZW5JbnN0cnVjdGlvbjogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXJNZXNzYWdlOiBzdHJpbmc7XHJcbiAgICByZXN0YXJ0SW5zdHJ1Y3Rpb246IHN0cmluZztcclxuICAgIHBsYXllcjoge1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBpbWFnZU5hbWU6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBlbmVteToge1xyXG4gICAgICAgIHNwYXduSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgICAgICBzcGVlZE1pbjogbnVtYmVyO1xyXG4gICAgICAgIHNwZWVkTWF4OiBudW1iZXI7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBpbWFnZU5hbWU6IHN0cmluZztcclxuICAgICAgICBpbml0aWFsQ291bnQ6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBzY29yZUluY3JlbWVudFBlclNlY29uZDogbnVtYmVyO1xyXG4gICAgYmFja2dyb3VuZENvbG9yOiBzdHJpbmc7XHJcbiAgICBmb250RmFtaWx5OiBzdHJpbmc7XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRDb3VudCA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzID0gMDtcclxuXHJcbiAgICBhc3luYyBsb2FkQXNzZXRzKGRhdGE6IEdhbWVEYXRhKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGRhdGEuYXNzZXRzLmltYWdlcy5sZW5ndGggKyBkYXRhLmFzc2V0cy5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBkYXRhLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB0aGlzLmxvYWRJbWFnZShpbWcubmFtZSwgaW1nLnBhdGgpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gZGF0YS5hc3NldHMuc291bmRzLm1hcChzbmQgPT4gdGhpcy5sb2FkU291bmQoc25kLm5hbWUsIHNuZC5wYXRoKSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UobmFtZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IHBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQobmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtwYXRofWApO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7cGF0aH1gKSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQobmFtZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhwYXRoKTtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJzsgLy8gRW5zdXJlIGF1ZGlvIGlzIHByZWxvYWRlZFxyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KG5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3BhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtwYXRofWApKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHtcclxuICAgICAgICBjb25zdCBpbWcgPSB0aGlzLmltYWdlcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKCFpbWcpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBJbWFnZSBcIiR7bmFtZX1cIiBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgIC8vIFJldHVybiBhIGR1bW15IGltYWdlIG9yIHRocm93IGFuIGVycm9yIHRvIHByZXZlbnQgY3Jhc2hlc1xyXG4gICAgICAgICAgICBjb25zdCBkdW1teSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBkdW1teS5zcmMgPSAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFBRUFBQUFCQ0FRQUFBQzFIQXdDQUFBQUMwbEVRVlI0Mm1Oa1lBQUFBQVlBQWpDQjBDOEFBQUFBU1VWT1JLNUNZSUk9JzsgLy8gMXgxIHRyYW5zcGFyZW50IHBpeGVsXHJcbiAgICAgICAgICAgIHJldHVybiBkdW1teTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGltZztcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZTogbnVtYmVyID0gMS4wKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIG5ldyBpbnN0YW5jZSBmb3Igc2ltdWx0YW5lb3VzIHBsYXliYWNrIGlmIG5lZWRlZCwgb3IganVzdCBwbGF5IHRoZSBsb2FkZWQgb25lXHJcbiAgICAgICAgICAgIC8vIEZvciBzaW1wbGUgYmFja2dyb3VuZCBtdXNpYywgdGhlIGxvYWRlZCBvbmUgaXMgZmluZS4gRm9yIGVmZmVjdHMsIGNsb25lIGl0LlxyXG4gICAgICAgICAgICBpZiAoIWxvb3ApIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVmZmVjdCA9IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBlZmZlY3Qudm9sdW1lID0gdm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgZWZmZWN0LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJTb3VuZCBwbGF5IGZhaWxlZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSB2b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiQkdNIHBsYXkgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIFwiJHtuYW1lfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPT09IDAgPyAwIDogdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJcclxufVxyXG5cclxuY2xhc3MgSW5wdXRNYW5hZ2VyIHtcclxuICAgIHByaXZhdGUga2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIG1vdXNlQ2xpY2tlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcCk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMub25Nb3VzZURvd24pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5vbk1vdXNlVXApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25LZXlEb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgdGhpcy5rZXlzLmFkZChldmVudC5jb2RlKTtcclxuICAgIH07XHJcblxyXG4gICAgcHJpdmF0ZSBvbktleVVwID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgdGhpcy5rZXlzLmRlbGV0ZShldmVudC5jb2RlKTtcclxuICAgIH07XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlRG93biA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDApIHsgLy8gTGVmdCBjbGlja1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlQ2xpY2tlZCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBwcml2YXRlIG9uTW91c2VVcCA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tb3VzZUNsaWNrZWQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGlzS2V5RG93bihjb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5rZXlzLmhhcyhjb2RlKTtcclxuICAgIH1cclxuXHJcbiAgICBpc01vdXNlQ2xpY2tlZCgpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBjbGlja2VkID0gdGhpcy5tb3VzZUNsaWNrZWQ7XHJcbiAgICAgICAgLy8gUmVzZXQgZm9yIHRoZSBuZXh0IGZyYW1lIHRvIGRldGVjdCBzaW5nbGUgY2xpY2tcclxuICAgICAgICBpZiAoY2xpY2tlZCkgdGhpcy5tb3VzZUNsaWNrZWQgPSBmYWxzZTtcclxuICAgICAgICByZXR1cm4gY2xpY2tlZDtcclxuICAgIH1cclxuXHJcbiAgICByZXNldCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmtleXMuY2xlYXIoKTtcclxuICAgICAgICB0aGlzLm1vdXNlQ2xpY2tlZCA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGRlc3Ryb3koKTogdm9pZCB7XHJcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLm9uS2V5RG93bik7XHJcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwKTtcclxuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bik7XHJcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLm9uTW91c2VVcCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWVPYmplY3Qge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZU5hbWUgPSBpbWFnZU5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRzOiBBc3NldE1hbmFnZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBpbWFnZSA9IGFzc2V0cy5nZXRJbWFnZSh0aGlzLmltYWdlTmFtZSk7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZShpbWFnZSwgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0NvbGxpZGluZ1dpdGgob3RoZXI6IEdhbWVPYmplY3QpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy54IDwgb3RoZXIueCArIG90aGVyLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueSA8IG90aGVyLnkgKyBvdGhlci5oZWlnaHQgJiZcclxuICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgPiBvdGhlci55O1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcsIHNwZWVkOiBudW1iZXIsIGNhbnZhc1dpZHRoOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBzcGVlZDtcclxuICAgICAgICB0aGlzLmNhbnZhc1dpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBpbnB1dDogSW5wdXRNYW5hZ2VyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKGlucHV0LmlzS2V5RG93bignQXJyb3dMZWZ0JykgfHwgaW5wdXQuaXNLZXlEb3duKCdLZXlBJykpIHtcclxuICAgICAgICAgICAgdGhpcy54IC09IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleURvd24oJ0Fycm93UmlnaHQnKSB8fCBpbnB1dC5pc0tleURvd24oJ0tleUQnKSkge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBjYW52YXMgYm91bmRzXHJcbiAgICAgICAgdGhpcy54ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5jYW52YXNXaWR0aCAtIHRoaXMud2lkdGgsIHRoaXMueCkpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBFbmVteSBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgdmVsb2NpdHlZOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlTmFtZTogc3RyaW5nLCB2ZWxvY2l0eVk6IG51bWJlciwgY2FudmFzSGVpZ2h0OiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xyXG4gICAgICAgIHRoaXMudmVsb2NpdHlZID0gdmVsb2NpdHlZO1xyXG4gICAgICAgIHRoaXMuY2FudmFzSGVpZ2h0ID0gY2FudmFzSGVpZ2h0O1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnZlbG9jaXR5WSAqIGRlbHRhVGltZTtcclxuICAgIH1cclxuXHJcbiAgICBpc09mZlNjcmVlbigpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy55ID4gdGhpcy5jYW52YXNIZWlnaHQ7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZGF0YSE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSBhc3NldHM6IEFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuICAgIHByaXZhdGUgaW5wdXQ6IElucHV0TWFuYWdlciA9IG5ldyBJbnB1dE1hbmFnZXIoKTtcclxuXHJcbiAgICBwcml2YXRlIHN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG4gICAgcHJpdmF0ZSBhbmltYXRpb25GcmFtZUlkOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgcGxheWVyITogUGxheWVyO1xyXG4gICAgcHJpdmF0ZSBlbmVtaWVzOiBFbmVteVtdID0gW107XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBlbmVteVNwYXduVGltZXI6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIWNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyBlbGVtZW50IHdpdGggSUQgXCIke2NhbnZhc0lkfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBjYW52YXM7XHJcbiAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XHJcbiAgICAgICAgaWYgKCFjdHgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0IGZvciBjYW52YXMuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gY3R4O1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEdhbWVEYXRhKCk7XHJcbiAgICAgICAgdGhpcy5yZXNpemVDYW52YXMoKTsgLy8gU2V0IGNhbnZhcyBzaXplIGJhc2VkIG9uIGxvYWRlZCBkYXRhXHJcbiAgICAgICAgYXdhaXQgdGhpcy5hc3NldHMubG9hZEFzc2V0cyh0aGlzLmRhdGEpO1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25GcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgICAgIHRoaXMuYXNzZXRzLnBsYXlTb3VuZCgnYmdtJywgdHJ1ZSwgdGhpcy5kYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUgfHwgMC41KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRHYW1lRGF0YSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lRGF0YTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGE6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICBhbGVydCgnRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhLiBQbGVhc2UgY2hlY2sgZGF0YS5qc29uLicpO1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7IC8vIFN0YXkgaW4gbG9hZGluZyBvciBlcnJvciBzdGF0ZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2l6ZUNhbnZhcygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuZGF0YS5jYW52YXNXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmRhdGEuY2FudmFzSGVpZ2h0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaW5pdGlhbGl6ZUdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVteVNwYXduVGltZXIgPSAwO1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJEYXRhID0gdGhpcy5kYXRhLnBsYXllcjtcclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIoXHJcbiAgICAgICAgICAgICh0aGlzLmNhbnZhcy53aWR0aCAtIHBsYXllckRhdGEud2lkdGgpIC8gMixcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC0gcGxheWVyRGF0YS5oZWlnaHQgLSAyMCxcclxuICAgICAgICAgICAgcGxheWVyRGF0YS53aWR0aCxcclxuICAgICAgICAgICAgcGxheWVyRGF0YS5oZWlnaHQsXHJcbiAgICAgICAgICAgIHBsYXllckRhdGEuaW1hZ2VOYW1lLFxyXG4gICAgICAgICAgICBwbGF5ZXJEYXRhLnNwZWVkLFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFNwYXduIGluaXRpYWwgZW5lbWllc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kYXRhLmVuZW15LmluaXRpYWxDb3VudDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVteSh0cnVlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYXNzZXRzLnBsYXlTb3VuZCgnZ2FtZV9zdGFydCcsIGZhbHNlLCB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnZ2FtZV9zdGFydCcpPy52b2x1bWUgfHwgMS4wKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduRW5lbXkoaW5pdGlhbFNwYXduOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBlbmVteURhdGEgPSB0aGlzLmRhdGEuZW5lbXk7XHJcbiAgICAgICAgY29uc3QgeCA9IE1hdGgucmFuZG9tKCkgKiAodGhpcy5jYW52YXMud2lkdGggLSBlbmVteURhdGEud2lkdGgpO1xyXG4gICAgICAgIGNvbnN0IHkgPSBpbml0aWFsU3Bhd24gPyBNYXRoLnJhbmRvbSgpICogLXRoaXMuY2FudmFzLmhlaWdodCA6IC1lbmVteURhdGEuaGVpZ2h0OyAvLyBTcGF3biBvZmYtc2NyZWVuIHRvcFxyXG4gICAgICAgIGNvbnN0IHZlbG9jaXR5WSA9IGVuZW15RGF0YS5zcGVlZE1pbiArIE1hdGgucmFuZG9tKCkgKiAoZW5lbXlEYXRhLnNwZWVkTWF4IC0gZW5lbXlEYXRhLnNwZWVkTWluKTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChuZXcgRW5lbXkoeCwgeSwgZW5lbXlEYXRhLndpZHRoLCBlbmVteURhdGEuaGVpZ2h0LCBlbmVteURhdGEuaW1hZ2VOYW1lLCB2ZWxvY2l0eVksIHRoaXMuY2FudmFzLmhlaWdodCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AgPSAoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApID0+IHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLmRyYXcoKTtcclxuXHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25GcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfTtcclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5zdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5MT0FESU5HOlxyXG4gICAgICAgICAgICAgICAgLy8gTm90aGluZyB0byB1cGRhdGUsIGp1c3QgZGlzcGxheSBsb2FkaW5nIHByb2dyZXNzXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pbnB1dC5pc01vdXNlQ2xpY2tlZCgpIHx8IHRoaXMuaW5wdXQuaXNLZXlEb3duKCdTcGFjZScpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplR2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5pbnB1dCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIGFuZCByZW1vdmUgb2ZmLXNjcmVlbiBlbmVtaWVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMgPSB0aGlzLmVuZW1pZXMuZmlsdGVyKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWVuZW15LmlzT2ZmU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTcGF3biBuZXcgZW5lbWllc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVteVNwYXduVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZW5lbXlTcGF3blRpbWVyID49IHRoaXMuZGF0YS5lbmVteS5zcGF3bkludGVydmFsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGF3bkVuZW15KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmVteVNwYXduVGltZXIgPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENvbGxpc2lvbiBkZXRlY3Rpb25cclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZW5lbXkgb2YgdGhpcy5lbmVtaWVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmlzQ29sbGlkaW5nV2l0aChlbmVteSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHMucGxheVNvdW5kKCdoaXRfc291bmQnLCBmYWxzZSwgdGhpcy5kYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2hpdF9zb3VuZCcpPy52b2x1bWUgfHwgMS4wKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuZGF0YS5zY29yZUluY3JlbWVudFBlclNlY29uZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pbnB1dC5pc01vdXNlQ2xpY2tlZCgpIHx8IHRoaXMuaW5wdXQuaXNLZXlEb3duKCdTcGFjZScpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplR2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZGF0YT8uYmFja2dyb3VuZENvbG9yIHx8ICcjMDAwMDAwJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5kcmF3KHRoaXMuY3R4LCB0aGlzLmFzc2V0cyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiBlbmVteS5kcmF3KHRoaXMuY3R4LCB0aGlzLmFzc2V0cykpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3U2NvcmUoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3U2NvcmUoKTsgLy8gU2hvdyBmaW5hbCBzY29yZVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI0cHggJHt0aGlzLmRhdGE/LmZvbnRGYW1pbHkgfHwgJ0FyaWFsJ31gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIGNvbnN0IHByb2dyZXNzID0gKHRoaXMuYXNzZXRzLmdldExvYWRpbmdQcm9ncmVzcygpICogMTAwKS50b0ZpeGVkKDApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBMb2FkaW5nLi4uICR7cHJvZ3Jlc3N9JWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDQ4cHggJHt0aGlzLmRhdGEuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuZGF0YS5nYW1lVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNHB4ICR7dGhpcy5kYXRhLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmRhdGEudGl0bGVTY3JlZW5JbnN0cnVjdGlvbiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZWQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgNDhweCAke3RoaXMuZGF0YS5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5kYXRhLmdhbWVPdmVyTWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjRweCAke3RoaXMuZGF0YS5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5kYXRhLnJlc3RhcnRJbnN0cnVjdGlvbiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1Njb3JlKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyMHB4ICR7dGhpcy5kYXRhLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNjb3JlOiAke01hdGguZmxvb3IodGhpcy5zY29yZSl9YCwgMTAsIDMwKTtcclxuICAgIH1cclxuXHJcbiAgICBkZXN0cm95KCk6IHZvaWQge1xyXG4gICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0aW9uRnJhbWVJZCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dC5kZXN0cm95KCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEVuc3VyZSB0aGUgSFRNTCBjYW52YXMgZWxlbWVudCBleGlzdHMgYW5kIHRoZW4gc3RhcnQgdGhlIGdhbWVcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIGNvbnN0IGdhbWVDYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgIGdhbWVDYW52YXMuaWQgPSAnZ2FtZUNhbnZhcyc7XHJcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGdhbWVDYW52YXMpOyAvLyBBZGQgY2FudmFzIHRvIGJvZHkgaWYgbm90IGFscmVhZHkgdGhlcmUgKGZvciB0ZXN0aW5nIGZsZXhpYmlsaXR5KVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICAgICAgZ2FtZS5zdGFydCgpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGluaXRpYWxpemUgZ2FtZTpcIiwgZXJyb3IpO1xyXG4gICAgICAgIGFsZXJ0KFwiR2FtZSBpbml0aWFsaXphdGlvbiBmYWlsZWQuIFNlZSBjb25zb2xlIGZvciBkZXRhaWxzLlwiKTtcclxuICAgIH1cclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQStCQSxNQUFNLGFBQWE7QUFBQSxFQUFuQjtBQUNJLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxjQUFjO0FBQ3RCLFNBQVEsY0FBYztBQUFBO0FBQUEsRUFFdEIsTUFB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
