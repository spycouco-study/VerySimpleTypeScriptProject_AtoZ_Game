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
  GameState2[GameState2["INSTRUCTIONS"] = 2] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 3] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 4] = "GAME_OVER";
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
          this.state = 2 /* INSTRUCTIONS */;
          this.input.reset();
        }
        break;
      case 2 /* INSTRUCTIONS */:
        if (this.input.isMouseClicked() || this.input.isKeyDown("Space")) {
          this.initializeGame();
          this.state = 3 /* PLAYING */;
          this.input.reset();
        }
        break;
      case 3 /* PLAYING */:
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
            this.state = 4 /* GAME_OVER */;
            break;
          }
        }
        this.score += this.data.scoreIncrementPerSecond * deltaTime;
        break;
      case 4 /* GAME_OVER */:
        if (this.input.isMouseClicked() || this.input.isKeyDown("Space")) {
          this.initializeGame();
          this.state = 3 /* PLAYING */;
          this.input.reset();
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
      case 2 /* INSTRUCTIONS */:
        this.drawInstructionScreen();
        break;
      case 3 /* PLAYING */:
        this.player.draw(this.ctx, this.assets);
        this.enemies.forEach((enemy) => enemy.draw(this.ctx, this.assets));
        this.drawScore();
        break;
      case 4 /* GAME_OVER */:
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
  // 새로운 조작 설명 화면 그리기 메서드
  drawInstructionScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = `36px ${this.data.fontFamily}`;
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.data.instructionText, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = `24px ${this.data.fontFamily}`;
    this.ctx.fillText(this.data.instructionProceedText, this.canvas.width / 2, this.canvas.height / 2 + 20);
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
  document.body.style.margin = "0";
  document.body.style.backgroundColor = "#1a1a1a";
  document.body.style.display = "flex";
  document.body.style.justifyContent = "center";
  document.body.style.alignItems = "center";
  document.body.style.minHeight = "100vh";
  document.body.style.overflow = "hidden";
  const gameCanvas = document.createElement("canvas");
  gameCanvas.id = "gameCanvas";
  gameCanvas.style.display = "block";
  gameCanvas.style.border = "2px solid #555";
  gameCanvas.style.boxShadow = "0 0 15px rgba(0,0,0,0.5)";
  document.body.appendChild(gameCanvas);
  try {
    const game = new Game("gameCanvas");
    game.start();
  } catch (error) {
    console.error("Failed to initialize game:", error);
    alert("Game initialization failed. See console for details.");
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIGdhbWVUaXRsZTogc3RyaW5nO1xyXG4gICAgdGl0bGVTY3JlZW5JbnN0cnVjdGlvbjogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25UZXh0OiBzdHJpbmc7IC8vIFx1Q0Q5NFx1QUMwMDogXHVBQzhDXHVDNzg0IFx1Qzg3MFx1Qzc5MSBcdUMxMjRcdUJBODVcclxuICAgIGluc3RydWN0aW9uUHJvY2VlZFRleHQ6IHN0cmluZzsgLy8gXHVDRDk0XHVBQzAwOiBcdUFDOENcdUM3ODQgXHVDODcwXHVDNzkxIFx1QzEyNFx1QkE4NSBcdUM3NzRcdUQ2QzQgXHVDOUM0XHVENTg5IFx1QzU0OFx1QjBCNFxyXG4gICAgZ2FtZU92ZXJNZXNzYWdlOiBzdHJpbmc7XHJcbiAgICByZXN0YXJ0SW5zdHJ1Y3Rpb246IHN0cmluZztcclxuICAgIHBsYXllcjoge1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBpbWFnZU5hbWU6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBlbmVteToge1xyXG4gICAgICAgIHNwYXduSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgICAgICBzcGVlZE1pbjogbnVtYmVyO1xyXG4gICAgICAgIHNwZWVkTWF4OiBudW1iZXI7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBpbWFnZU5hbWU6IHN0cmluZztcclxuICAgICAgICBpbml0aWFsQ291bnQ6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBzY29yZUluY3JlbWVudFBlclNlY29uZDogbnVtYmVyO1xyXG4gICAgYmFja2dyb3VuZENvbG9yOiBzdHJpbmc7XHJcbiAgICBmb250RmFtaWx5OiBzdHJpbmc7XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRDb3VudCA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzID0gMDtcclxuXHJcbiAgICBhc3luYyBsb2FkQXNzZXRzKGRhdGE6IEdhbWVEYXRhKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGRhdGEuYXNzZXRzLmltYWdlcy5sZW5ndGggKyBkYXRhLmFzc2V0cy5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBkYXRhLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB0aGlzLmxvYWRJbWFnZShpbWcubmFtZSwgaW1nLnBhdGgpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gZGF0YS5hc3NldHMuc291bmRzLm1hcChzbmQgPT4gdGhpcy5sb2FkU291bmQoc25kLm5hbWUsIHNuZC5wYXRoKSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UobmFtZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IHBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQobmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtwYXRofWApO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7cGF0aH1gKSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQobmFtZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhwYXRoKTtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJzsgLy8gRW5zdXJlIGF1ZGlvIGlzIHByZWxvYWRlZFxyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KG5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3BhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtwYXRofWApKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHtcclxuICAgICAgICBjb25zdCBpbWcgPSB0aGlzLmltYWdlcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKCFpbWcpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBJbWFnZSBcIiR7bmFtZX1cIiBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgIC8vIFJldHVybiBhIGR1bW15IGltYWdlIG9yIHRocm93IGFuIGVycm9yIHRvIHByZXZlbnQgY3Jhc2hlc1xyXG4gICAgICAgICAgICBjb25zdCBkdW1teSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBkdW1teS5zcmMgPSAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFBRUFBQUFCQ0FRQUFBQzFIQXdDQUFBQUMwbEVRVlI0Mm1Oa1lBQUFBQVlBQWpDQjBDOEFBQUFBU1VWT1JLNUNZSUk9JzsgLy8gMXgxIHRyYW5zcGFyZW50IHBpeGVsXHJcbiAgICAgICAgICAgIHJldHVybiBkdW1teTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGltZztcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZTogbnVtYmVyID0gMS4wKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIG5ldyBpbnN0YW5jZSBmb3Igc2ltdWx0YW5lb3VzIHBsYXliYWNrIGlmIG5lZWRlZCwgb3IganVzdCBwbGF5IHRoZSBsb2FkZWQgb25lXHJcbiAgICAgICAgICAgIC8vIEZvciBzaW1wbGUgYmFja2dyb3VuZCBtdXNpYywgdGhlIGxvYWRlZCBvbmUgaXMgZmluZS4gRm9yIGVmZmVjdHMsIGNsb25lIGl0LlxyXG4gICAgICAgICAgICBpZiAoIWxvb3ApIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVmZmVjdCA9IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBlZmZlY3Qudm9sdW1lID0gdm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgZWZmZWN0LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJTb3VuZCBwbGF5IGZhaWxlZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSB2b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiQkdNIHBsYXkgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIFwiJHtuYW1lfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPT09IDAgPyAwIDogdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIElOU1RSVUNUSU9OUywgLy8gXHVDMEM4XHVCODVDXHVDNkI0IFx1QUM4Q1x1Qzc4NCBcdUMwQzFcdUQwREMgXHVDRDk0XHVBQzAwXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSXHJcbn1cclxuXHJcbmNsYXNzIElucHV0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBtb3VzZUNsaWNrZWQ6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXApO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMub25Nb3VzZVVwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uS2V5RG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMua2V5cy5hZGQoZXZlbnQuY29kZSk7XHJcbiAgICB9O1xyXG5cclxuICAgIHByaXZhdGUgb25LZXlVcCA9IChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMua2V5cy5kZWxldGUoZXZlbnQuY29kZSk7XHJcbiAgICB9O1xyXG5cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24gPSAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgICBpZiAoZXZlbnQuYnV0dG9uID09PSAwKSB7IC8vIExlZnQgY2xpY2tcclxuICAgICAgICAgICAgdGhpcy5tb3VzZUNsaWNrZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlVXAgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgICBpZiAoZXZlbnQuYnV0dG9uID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubW91c2VDbGlja2VkID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBpc0tleURvd24oY29kZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5cy5oYXMoY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNNb3VzZUNsaWNrZWQoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgY2xpY2tlZCA9IHRoaXMubW91c2VDbGlja2VkO1xyXG4gICAgICAgIC8vIFJlc2V0IGZvciB0aGUgbmV4dCBmcmFtZSB0byBkZXRlY3Qgc2luZ2xlIGNsaWNrXHJcbiAgICAgICAgaWYgKGNsaWNrZWQpIHRoaXMubW91c2VDbGlja2VkID0gZmFsc2U7XHJcbiAgICAgICAgcmV0dXJuIGNsaWNrZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXQoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzLmNsZWFyKCk7XHJcbiAgICAgICAgdGhpcy5tb3VzZUNsaWNrZWQgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBkZXN0cm95KCk6IHZvaWQge1xyXG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24pO1xyXG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcCk7XHJcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMub25Nb3VzZURvd24pO1xyXG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5vbk1vdXNlVXApO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFzc2V0czogQXNzZXRNYW5hZ2VyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2UgPSBhc3NldHMuZ2V0SW1hZ2UodGhpcy5pbWFnZU5hbWUpO1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNDb2xsaWRpbmdXaXRoKG90aGVyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueCA8IG90aGVyLnggKyBvdGhlci53aWR0aCAmJlxyXG4gICAgICAgICAgICAgICB0aGlzLnggKyB0aGlzLndpZHRoID4gb3RoZXIueCAmJlxyXG4gICAgICAgICAgICAgICB0aGlzLnkgPCBvdGhlci55ICsgb3RoZXIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueSArIHRoaXMuaGVpZ2h0ID4gb3RoZXIueTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGxheWVyIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlTmFtZTogc3RyaW5nLCBzcGVlZDogbnVtYmVyLCBjYW52YXNXaWR0aDogbnVtYmVyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lKTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5jYW52YXNXaWR0aCA9IGNhbnZhc1dpZHRoO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgaW5wdXQ6IElucHV0TWFuYWdlcik6IHZvaWQge1xyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleURvd24oJ0Fycm93TGVmdCcpIHx8IGlucHV0LmlzS2V5RG93bignS2V5QScpKSB7XHJcbiAgICAgICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoaW5wdXQuaXNLZXlEb3duKCdBcnJvd1JpZ2h0JykgfHwgaW5wdXQuaXNLZXlEb3duKCdLZXlEJykpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCBwbGF5ZXIgcG9zaXRpb24gdG8gY2FudmFzIGJvdW5kc1xyXG4gICAgICAgIHRoaXMueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMuY2FudmFzV2lkdGggLSB0aGlzLndpZHRoLCB0aGlzLngpKTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHZlbG9jaXR5WTogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgdmVsb2NpdHlZOiBudW1iZXIsIGNhbnZhc0hlaWdodDogbnVtYmVyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lKTtcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IHZlbG9jaXR5WTtcclxuICAgICAgICB0aGlzLmNhbnZhc0hlaWdodCA9IGNhbnZhc0hlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZWxvY2l0eVkgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgaXNPZmZTY3JlZW4oKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueSA+IHRoaXMuY2FudmFzSGVpZ2h0O1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGRhdGEhOiBHYW1lRGF0YTtcclxuICAgIHByaXZhdGUgYXNzZXRzOiBBc3NldE1hbmFnZXIgPSBuZXcgQXNzZXRNYW5hZ2VyKCk7XHJcbiAgICBwcml2YXRlIGlucHV0OiBJbnB1dE1hbmFnZXIgPSBuZXcgSW5wdXRNYW5hZ2VyKCk7XHJcblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuICAgIHByaXZhdGUgYW5pbWF0aW9uRnJhbWVJZDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIHBsYXllciE6IFBsYXllcjtcclxuICAgIHByaXZhdGUgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZW5lbXlTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCFjYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEIFwiJHtjYW52YXNJZH1cIiBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xyXG4gICAgICAgIGNvbnN0IGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xyXG4gICAgICAgIGlmICghY3R4KSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCAyRCByZW5kZXJpbmcgY29udGV4dCBmb3IgY2FudmFzLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIHRoaXMucmVzaXplQ2FudmFzKCk7IC8vIFNldCBjYW52YXMgc2l6ZSBiYXNlZCBvbiBsb2FkZWQgZGF0YVxyXG4gICAgICAgIGF3YWl0IHRoaXMuYXNzZXRzLmxvYWRBc3NldHModGhpcy5kYXRhKTtcclxuICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgICAgICB0aGlzLmFzc2V0cy5wbGF5U291bmQoJ2JnbScsIHRydWUsIHRoaXMuZGF0YS5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuNSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgR2FtZURhdGE7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhOicsIGVycm9yKTtcclxuICAgICAgICAgICAgYWxlcnQoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YS4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi4nKTtcclxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HOyAvLyBTdGF5IGluIGxvYWRpbmcgb3IgZXJyb3Igc3RhdGVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNpemVDYW52YXMoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5kYXRhLmNhbnZhc0hlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGluaXRpYWxpemVHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuZW5lbXlTcGF3blRpbWVyID0gMDtcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyRGF0YSA9IHRoaXMuZGF0YS5wbGF5ZXI7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICAodGhpcy5jYW52YXMud2lkdGggLSBwbGF5ZXJEYXRhLndpZHRoKSAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAtIHBsYXllckRhdGEuaGVpZ2h0IC0gMjAsXHJcbiAgICAgICAgICAgIHBsYXllckRhdGEud2lkdGgsXHJcbiAgICAgICAgICAgIHBsYXllckRhdGEuaGVpZ2h0LFxyXG4gICAgICAgICAgICBwbGF5ZXJEYXRhLmltYWdlTmFtZSxcclxuICAgICAgICAgICAgcGxheWVyRGF0YS5zcGVlZCxcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGhcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBTcGF3biBpbml0aWFsIGVuZW1pZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZGF0YS5lbmVteS5pbml0aWFsQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkodHJ1ZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmFzc2V0cy5wbGF5U291bmQoJ2dhbWVfc3RhcnQnLCBmYWxzZSwgdGhpcy5kYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2dhbWVfc3RhcnQnKT8udm9sdW1lIHx8IDEuMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bkVuZW15KGluaXRpYWxTcGF3bjogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZW5lbXlEYXRhID0gdGhpcy5kYXRhLmVuZW15O1xyXG4gICAgICAgIGNvbnN0IHggPSBNYXRoLnJhbmRvbSgpICogKHRoaXMuY2FudmFzLndpZHRoIC0gZW5lbXlEYXRhLndpZHRoKTtcclxuICAgICAgICBjb25zdCB5ID0gaW5pdGlhbFNwYXduID8gTWF0aC5yYW5kb20oKSAqIC10aGlzLmNhbnZhcy5oZWlnaHQgOiAtZW5lbXlEYXRhLmhlaWdodDsgLy8gU3Bhd24gb2ZmLXNjcmVlbiB0b3BcclxuICAgICAgICBjb25zdCB2ZWxvY2l0eVkgPSBlbmVteURhdGEuc3BlZWRNaW4gKyBNYXRoLnJhbmRvbSgpICogKGVuZW15RGF0YS5zcGVlZE1heCAtIGVuZW15RGF0YS5zcGVlZE1pbik7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2gobmV3IEVuZW15KHgsIHksIGVuZW15RGF0YS53aWR0aCwgZW5lbXlEYXRhLmhlaWdodCwgZW5lbXlEYXRhLmltYWdlTmFtZSwgdmVsb2NpdHlZLCB0aGlzLmNhbnZhcy5oZWlnaHQpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wID0gKGN1cnJlbnRUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBDb252ZXJ0IHRvIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcblxyXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgIH07XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuc3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgICAgIC8vIE5vdGhpbmcgdG8gdXBkYXRlLCBqdXN0IGRpc3BsYXkgbG9hZGluZyBwcm9ncmVzc1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaW5wdXQuaXNNb3VzZUNsaWNrZWQoKSB8fCB0aGlzLmlucHV0LmlzS2V5RG93bignU3BhY2UnKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOyAvLyBcdUQwQzBcdUM3NzRcdUQyQzBcdUM1RDBcdUMxMUMgXHVDMEFDXHVDNkE5XHVDNzkwIFx1Qzc4NVx1QjgyNSBcdUMyREMgXHVDODcwXHVDNzkxIFx1QzEyNFx1QkE4NSBcdUQ2NTRcdUJBNzRcdUM3M0NcdUI4NUMgXHVDODA0XHVENjU4XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbnB1dC5yZXNldCgpOyAvLyBcdUM3ODVcdUI4MjUgXHVDRDA4XHVBRTMwXHVENjU0XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOiAvLyBcdUM4NzBcdUM3OTEgXHVDMTI0XHVCQTg1IFx1RDY1NFx1QkE3NCBcdUM1QzVcdUIzNzBcdUM3NzRcdUQyQjggXHVCODVDXHVDOUMxXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pbnB1dC5pc01vdXNlQ2xpY2tlZCgpIHx8IHRoaXMuaW5wdXQuaXNLZXlEb3duKCdTcGFjZScpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplR2FtZSgpOyAvLyBcdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxIFx1QzgwNCBcdUNEMDhcdUFFMzBcdUQ2NTRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7IC8vIFx1Qzg3MFx1Qzc5MSBcdUMxMjRcdUJBODUgXHVENkM0IFx1QUM4Q1x1Qzc4NCBcdUQ1MENcdUI4MDhcdUM3NzQgXHVDMEMxXHVEMERDXHVCODVDIFx1QzgwNFx1RDY1OFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXQucmVzZXQoKTsgLy8gXHVDNzg1XHVCODI1IFx1Q0QwOFx1QUUzMFx1RDY1NFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmlucHV0KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgYW5kIHJlbW92ZSBvZmYtc2NyZWVuIGVuZW1pZXNcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAhZW5lbXkuaXNPZmZTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFNwYXduIG5ldyBlbmVtaWVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW15U3Bhd25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbmVteVNwYXduVGltZXIgPj0gdGhpcy5kYXRhLmVuZW15LnNwYXduSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW15U3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ29sbGlzaW9uIGRldGVjdGlvblxyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaXNDb2xsaWRpbmdXaXRoKGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5wbGF5U291bmQoJ2hpdF9zb3VuZCcsIGZhbHNlLCB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnaGl0X3NvdW5kJyk/LnZvbHVtZSB8fCAxLjApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gdGhpcy5kYXRhLnNjb3JlSW5jcmVtZW50UGVyU2Vjb25kICogZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlucHV0LmlzTW91c2VDbGlja2VkKCkgfHwgdGhpcy5pbnB1dC5pc0tleURvd24oJ1NwYWNlJykpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRpYWxpemVHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXQucmVzZXQoKTsgLy8gXHVDNzg1XHVCODI1IFx1Q0QwOFx1QUUzMFx1RDY1NFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5kYXRhPy5iYWNrZ3JvdW5kQ29sb3IgfHwgJyMwMDAwMDAnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuc3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOiAvLyBcdUM4NzBcdUM3OTEgXHVDMTI0XHVCQTg1IFx1RDY1NFx1QkE3NCBcdUFERjhcdUI5QUNcdUFFMzBcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0luc3RydWN0aW9uU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IGVuZW15LmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRzKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdTY29yZSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdTY29yZSgpOyAvLyBTaG93IGZpbmFsIHNjb3JlXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjRweCAke3RoaXMuZGF0YT8uZm9udEZhbWlseSB8fCAnQXJpYWwnfWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgY29uc3QgcHJvZ3Jlc3MgPSAodGhpcy5hc3NldHMuZ2V0TG9hZGluZ1Byb2dyZXNzKCkgKiAxMDApLnRvRml4ZWQoMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYExvYWRpbmcuLi4gJHtwcm9ncmVzc30lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgNDhweCAke3RoaXMuZGF0YS5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5kYXRhLmdhbWVUaXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI0cHggJHt0aGlzLmRhdGEuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuZGF0YS50aXRsZVNjcmVlbkluc3RydWN0aW9uLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gXHVDMEM4XHVCODVDXHVDNkI0IFx1Qzg3MFx1Qzc5MSBcdUMxMjRcdUJBODUgXHVENjU0XHVCQTc0IFx1QURGOFx1QjlBQ1x1QUUzMCBcdUJBNTRcdUMxMUNcdUI0RENcclxuICAgIHByaXZhdGUgZHJhd0luc3RydWN0aW9uU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAzNnB4ICR7dGhpcy5kYXRhLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmRhdGEuaW5zdHJ1Y3Rpb25UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjRweCAke3RoaXMuZGF0YS5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5kYXRhLmluc3RydWN0aW9uUHJvY2VlZFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDQ4cHggJHt0aGlzLmRhdGEuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuZGF0YS5nYW1lT3Zlck1lc3NhZ2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI0cHggJHt0aGlzLmRhdGEuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuZGF0YS5yZXN0YXJ0SW5zdHJ1Y3Rpb24sIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdTY29yZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjBweCAke3RoaXMuZGF0YS5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBTY29yZTogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIDEwLCAzMCk7XHJcbiAgICB9XHJcblxyXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcclxuICAgICAgICBjYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGlvbkZyYW1lSWQpO1xyXG4gICAgICAgIHRoaXMuaW5wdXQuZGVzdHJveSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBFbnN1cmUgdGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZXhpc3RzIGFuZCB0aGVuIHN0YXJ0IHRoZSBnYW1lXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICAvLyBIVE1MIGJvZHlcdUM1RDAgXHVBQzhDXHVDNzg0IFx1RDY1NFx1QkE3NCBcdUM5MTFcdUM1NTkgXHVDODE1XHVCODJDXHVDNzQ0IFx1QzcwNFx1RDU1QyBcdUMyQTRcdUQwQzBcdUM3N0MgXHVDODAxXHVDNkE5XHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLm1hcmdpbiA9ICcwJztcclxuICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyMxYTFhMWEnOyAvLyBcdUNFOTRcdUJDODRcdUMyQTQgXHVCQzMwXHVBQ0JEXHVBQ0ZDIFx1QjMwMFx1QkU0NFx1QjQxOFx1QjI5NCBcdUMwQzlcdUMwQzFcdUM3M0NcdUI4NUMgXHVDMTI0XHVDODE1XHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2NlbnRlcic7IC8vIFx1QUMwMFx1Qjg1QyBcdUM5MTFcdUM1NTkgXHVDODE1XHVCODJDXHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJzsgICAgIC8vIFx1QzEzOFx1Qjg1QyBcdUM5MTFcdUM1NTkgXHVDODE1XHVCODJDXHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLm1pbkhlaWdodCA9ICcxMDB2aCc7ICAgICAgICAvLyBib2R5XHVBQzAwIFx1QkRGMFx1RDNFQ1x1RDJCOCBcdUM4MDRcdUNDQjQgXHVCMTkyXHVDNzc0XHVCOTdDIFx1Q0MyOFx1QzlDMFx1RDU1OFx1QjNDNFx1Qjg1RFxyXG4gICAgZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nOyAgICAgICAgLy8gXHVDRTk0XHVCQzg0XHVDMkE0IFx1RDA2Q1x1QUUzMFx1QUMwMCBcdUJERjBcdUQzRUNcdUQyQjhcdUI5N0MgXHVCMTE4XHVDNUI0XHVBQzA4IFx1QUNCRFx1QzZCMCBcdUMyQTRcdUQwNkNcdUI4NjRcdUJDMTQgXHVCQzI5XHVDOUMwXHJcblxyXG4gICAgY29uc3QgZ2FtZUNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xyXG4gICAgZ2FtZUNhbnZhcy5pZCA9ICdnYW1lQ2FudmFzJztcclxuICAgIGdhbWVDYW52YXMuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7IC8vIFx1Q0U5NFx1QkM4NFx1QzJBNCBcdUM1NDRcdUI3OTggXHVDRDk0XHVBQzAwIFx1QUNGNVx1QkMzMSBcdUM4MUNcdUFDNzBcclxuICAgIGdhbWVDYW52YXMuc3R5bGUuYm9yZGVyID0gJzJweCBzb2xpZCAjNTU1JzsgLy8gXHVDRTk0XHVCQzg0XHVDMkE0IFx1RDE0Q1x1QjQ1MFx1QjlBQyBcdUNEOTRcdUFDMDAgKFx1QzEyMFx1RDBERCBcdUMwQUNcdUQ1NkQpXHJcbiAgICBnYW1lQ2FudmFzLnN0eWxlLmJveFNoYWRvdyA9ICcwIDAgMTVweCByZ2JhKDAsMCwwLDAuNSknOyAvLyBcdUNFOTRcdUJDODRcdUMyQTQgXHVBREY4XHVCOUJDXHVDNzkwIFx1Q0Q5NFx1QUMwMCAoXHVDMTIwXHVEMEREIFx1QzBBQ1x1RDU2RClcclxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZ2FtZUNhbnZhcyk7IC8vIEFkZCBjYW52YXMgdG8gYm9keSBpZiBub3QgYWxyZWFkeSB0aGVyZSAoZm9yIHRlc3RpbmcgZmxleGliaWxpdHkpXHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBnYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgICAgICBnYW1lLnN0YXJ0KCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaW5pdGlhbGl6ZSBnYW1lOlwiLCBlcnJvcik7XHJcbiAgICAgICAgYWxlcnQoXCJHYW1lIGluaXRpYWxpemF0aW9uIGZhaWxlZC4gU2VlIGNvbnNvbGUgZm9yIGRldGFpbHMuXCIpO1xyXG4gICAgfVxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBaUNBLE1BQU0sYUFBYTtBQUFBLEVBQW5CO0FBQ0ksU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBQ3hELFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLGNBQWM7QUFDdEIsU0FBUSxjQUFjO0FBQUE7QUFBQSxFQUV0QixNQUFNLFdBQVcsTUFBK0I7QUFDNUMsU0FBSyxjQUFjLEtBQUssT0FBTyxPQUFPLFNBQVMsS0FBSyxPQUFPLE9BQU87QUFDbEUsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFBVSxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFDdEYsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFBVSxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFFdEYsVUFBTSxRQUFRLElBQUksQ0FBQyxHQUFHLGVBQWUsR0FBRyxhQUFhLENBQUM7QUFBQSxFQUMxRDtBQUFBLEVBRVEsVUFBVSxNQUFjLE1BQTZCO0FBQ3pELFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3BDLFlBQU0sTUFBTSxJQUFJLE1B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
