var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class GameObject {
  constructor(x, y, width, height, imageKey) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageKey = imageKey;
  }
  collidesWith(other) {
    return this.x < other.x + other.width && this.x + this.width > other.x && this.y < other.y + other.height && this.y + this.height > other.y;
  }
}
class Player extends GameObject {
  constructor(x, y, width, height, imageKey, speed, initialLives) {
    super(x, y, width, height, imageKey);
    this.movingLeft = false;
    this.movingRight = false;
    this.speed = speed;
    this.score = 0;
    this.lives = initialLives;
  }
  update(deltaTime, canvasWidth) {
    if (this.movingLeft) {
      this.x -= this.speed * (deltaTime / 1e3);
    }
    if (this.movingRight) {
      this.x += this.speed * (deltaTime / 1e3);
    }
    if (this.x < 0) this.x = 0;
    if (this.x + this.width > canvasWidth) this.x = canvasWidth - this.width;
  }
  draw(ctx, imageCache) {
    const image = imageCache.get(this.imageKey);
    if (image) {
      ctx.drawImage(image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = "blue";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}
class Collectible extends GameObject {
  constructor(x, y, width, height, imageKey, velocityY) {
    super(x, y, width, height, imageKey);
    this.velocityY = velocityY;
  }
  update(deltaTime) {
    this.y += this.velocityY * (deltaTime / 1e3);
  }
  draw(ctx, imageCache) {
    const image = imageCache.get(this.imageKey);
    if (image) {
      ctx.drawImage(image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = "green";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}
class Game {
  // ms
  constructor(canvasId) {
    this.imageCache = /* @__PURE__ */ new Map();
    this.audioCache = /* @__PURE__ */ new Map();
    this.gameState = 0 /* LOADING */;
    this.collectibles = [];
    this.lastTime = 0;
    this.lastCollectibleSpawnTime = 0;
    this.nextCollectibleSpawnInterval = 0;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.setupEventListeners();
    this.loadGameDataAndAssets().then(() => {
      this.initGame();
      this.gameLoop(0);
    }).catch((error) => {
      console.error("Failed to load game data or assets:", error);
      if (this.canvas.width === 0 || this.canvas.height === 0) {
        this.canvas.width = 800;
        this.canvas.height = 600;
      }
      this.ctx.fillStyle = "red";
      this.ctx.font = "24px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Error loading game. Check console.", this.canvas.width / 2, this.canvas.height / 2);
    });
  }
  async loadGameDataAndAssets() {
    const response = await fetch("data.json");
    this.gameData = await response.json();
    if (!this.gameData || !this.gameData.gameSettings || typeof this.gameData.gameSettings.canvasWidth !== "number" || typeof this.gameData.gameSettings.canvasHeight !== "number" || !Array.isArray(this.gameData.assets?.images) || // Check if assets and images array exist
    !Array.isArray(this.gameData.assets?.sounds)) {
      console.error("Malformed data.json:", this.gameData);
      throw new Error("Invalid or incomplete game data found in data.json.");
    }
    this.canvas.width = this.gameData.gameSettings.canvasWidth;
    this.canvas.height = this.gameData.gameSettings.canvasHeight;
    await Promise.all([
      this.loadImages(this.gameData.assets.images ?? []),
      // Use nullish coalescing to ensure an array
      this.loadSounds(this.gameData.assets.sounds ?? [])
      // Use nullish coalescing to ensure an array
    ]);
  }
  loadImages(imageConfigs) {
    const imagePromises = imageConfigs.map((config) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = config.path;
        img.onload = () => {
          this.imageCache.set(config.name, img);
          resolve();
        };
        img.onerror = () => {
          console.warn(`Failed to load image: ${config.path}`);
          reject(new Error(`Failed to load image: ${config.path}`));
        };
      });
    });
    return Promise.all(imagePromises);
  }
  loadSounds(soundConfigs) {
    const soundPromises = soundConfigs.map((config) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = config.path;
        audio.volume = config.volume;
        audio.oncanplaythrough = () => {
          this.audioCache.set(config.name, audio);
          resolve();
        };
        audio.onerror = () => {
          console.warn(`Failed to load sound: ${config.path}`);
          reject(new Error(`Failed to load sound: ${config.path}`));
        };
      });
    });
    return Promise.all(soundPromises);
  }
  playSound(name, loop = false) {
    const audio = this.audioCache.get(name);
    if (audio) {
      audio.currentTime = 0;
      audio.loop = loop;
      audio.play().catch((e) => console.warn(`Error playing sound ${name}:`, e));
    } else {
      console.warn(`Sound '${name}' not found in cache.`);
    }
  }
  initGame() {
    this.gameState = 1 /* TITLE */;
    this.setupNewGame();
  }
  setupNewGame() {
    const { gameSettings } = this.gameData;
    this.player = new Player(
      (this.canvas.width - gameSettings.playerWidth) / 2,
      this.canvas.height - gameSettings.playerHeight - 10,
      gameSettings.playerWidth,
      gameSettings.playerHeight,
      "player",
      gameSettings.playerSpeed,
      gameSettings.initialLives
    );
    this.collectibles = [];
    this.lastCollectibleSpawnTime = 0;
    this.setNextCollectibleSpawnInterval();
  }
  setNextCollectibleSpawnInterval() {
    const { collectibleSpawnIntervalMin, collectibleSpawnIntervalMax } = this.gameData.gameSettings;
    this.nextCollectibleSpawnInterval = Math.random() * (collectibleSpawnIntervalMax - collectibleSpawnIntervalMin) + collectibleSpawnIntervalMin;
  }
  setupEventListeners() {
    window.addEventListener("keydown", this.handleKeyDown.bind(this));
    window.addEventListener("keyup", this.handleKeyUp.bind(this));
  }
  handleKeyDown(event) {
    if (this.gameState === 1 /* TITLE */ || this.gameState === 3 /* GAME_OVER */) {
      if (event.code === "Space") {
        this.startGame();
      }
    } else if (this.gameState === 2 /* PLAYING */) {
      if (event.key === "ArrowLeft" || event.key === "a") {
        this.player.movingLeft = true;
      } else if (event.key === "ArrowRight" || event.key === "d") {
        this.player.movingRight = true;
      }
    }
  }
  handleKeyUp(event) {
    if (this.gameState === 2 /* PLAYING */) {
      if (event.key === "ArrowLeft" || event.key === "a") {
        this.player.movingLeft = false;
      } else if (event.key === "ArrowRight" || event.key === "d") {
        this.player.movingRight = false;
      }
    }
  }
  startGame() {
    if (this.gameState === 1 /* TITLE */ || this.gameState === 3 /* GAME_OVER */) {
      this.setupNewGame();
      this.player.score = 0;
      this.player.lives = this.gameData.gameSettings.initialLives;
      this.gameState = 2 /* PLAYING */;
      this.lastTime = performance.now();
      this.playSound("bgm", true);
    }
  }
  gameOver() {
    this.gameState = 3 /* GAME_OVER */;
    this.player.movingLeft = false;
    this.player.movingRight = false;
  }
  gameLoop(timestamp) {
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;
    this.update(deltaTime);
    this.draw();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    if (this.gameState === 2 /* PLAYING */) {
      const { gameSettings } = this.gameData;
      this.player.update(deltaTime, this.canvas.width);
      this.lastCollectibleSpawnTime += deltaTime;
      if (this.lastCollectibleSpawnTime >= this.nextCollectibleSpawnInterval) {
        const randomX = Math.random() * (this.canvas.width - gameSettings.collectibleWidth);
        const randomVelocityY = Math.random() * (gameSettings.collectibleSpeedMax - gameSettings.collectibleSpeedMin) + gameSettings.collectibleSpeedMin;
        this.collectibles.push(new Collectible(
          randomX,
          -gameSettings.collectibleHeight,
          gameSettings.collectibleWidth,
          gameSettings.collectibleHeight,
          "collectible",
          randomVelocityY
        ));
        this.lastCollectibleSpawnTime = 0;
        this.setNextCollectibleSpawnInterval();
      }
      for (let i = this.collectibles.length - 1; i >= 0; i--) {
        const collectible = this.collectibles[i];
        collectible.update(deltaTime);
        if (this.player.collidesWith(collectible)) {
          this.player.score += gameSettings.scorePerCollectible;
          this.playSound("collect");
          this.collectibles.splice(i, 1);
        } else if (collectible.y > this.canvas.height) {
          this.player.lives--;
          this.playSound("miss");
          this.collectibles.splice(i, 1);
          if (this.player.lives <= 0) {
            this.gameOver();
          }
        }
      }
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const { gameSettings } = this.gameData;
    this.ctx.font = `24px ${gameSettings.fontFamily}`;
    this.ctx.fillStyle = gameSettings.textColor;
    this.ctx.textAlign = "center";
    if (this.gameState === 0 /* LOADING */) {
      this.ctx.fillText("Loading...", this.canvas.width / 2, this.canvas.height / 2);
    } else if (this.gameState === 1 /* TITLE */) {
      this.drawText(gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2);
    } else if (this.gameState === 2 /* PLAYING */) {
      this.player.draw(this.ctx, this.imageCache);
      this.collectibles.forEach((collectible) => collectible.draw(this.ctx, this.imageCache));
      this.ctx.textAlign = "left";
      this.ctx.fillText(`Score: ${this.player.score}`, 10, 30);
      this.ctx.textAlign = "right";
      this.ctx.fillText(`Lives: ${this.player.lives}`, this.canvas.width - 10, 30);
    } else if (this.gameState === 3 /* GAME_OVER */) {
      const gameOverText = gameSettings.gameOverScreenText.replace("{score}", this.player.score.toString());
      this.drawText(gameOverText, this.canvas.width / 2, this.canvas.height / 2);
    }
  }
  drawText(text, x, y) {
    const lines = text.split("\n");
    const lineHeight = 30;
    let currentY = y - (lines.length - 1) * lineHeight / 2;
    for (const line of lines) {
      this.ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new Game("gameCanvas");
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZERhdGFDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgdm9sdW1lOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lU2V0dGluZ3Mge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgcGxheWVyU3BlZWQ6IG51bWJlcjtcclxuICAgIHBsYXllcldpZHRoOiBudW1iZXI7XHJcbiAgICBwbGF5ZXJIZWlnaHQ6IG51bWJlcjtcclxuICAgIGluaXRpYWxMaXZlczogbnVtYmVyO1xyXG4gICAgY29sbGVjdGlibGVTcGVlZE1pbjogbnVtYmVyO1xyXG4gICAgY29sbGVjdGlibGVTcGVlZE1heDogbnVtYmVyO1xyXG4gICAgY29sbGVjdGlibGVXaWR0aDogbnVtYmVyO1xyXG4gICAgY29sbGVjdGlibGVIZWlnaHQ6IG51bWJlcjtcclxuICAgIGNvbGxlY3RpYmxlU3Bhd25JbnRlcnZhbE1pbjogbnVtYmVyO1xyXG4gICAgY29sbGVjdGlibGVTcGF3bkludGVydmFsTWF4OiBudW1iZXI7XHJcbiAgICBzY29yZVBlckNvbGxlY3RpYmxlOiBudW1iZXI7XHJcbiAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgZm9udEZhbWlseTogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lRGF0YSB7XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEltYWdlRGF0YUNvbmZpZ1tdO1xyXG4gICAgICAgIHNvdW5kczogU291bmREYXRhQ29uZmlnW107XHJcbiAgICB9O1xyXG4gICAgZ2FtZVNldHRpbmdzOiBHYW1lU2V0dGluZ3M7XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmFic3RyYWN0IGNsYXNzIEdhbWVPYmplY3Qge1xyXG4gICAgY29uc3RydWN0b3IocHVibGljIHg6IG51bWJlciwgcHVibGljIHk6IG51bWJlciwgcHVibGljIHdpZHRoOiBudW1iZXIsIHB1YmxpYyBoZWlnaHQ6IG51bWJlciwgcHVibGljIGltYWdlS2V5OiBzdHJpbmcpIHt9XHJcblxyXG4gICAgYWJzdHJhY3QgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZDtcclxuICAgIGFic3RyYWN0IGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGltYWdlQ2FjaGU6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+KTogdm9pZDtcclxuXHJcbiAgICBjb2xsaWRlc1dpdGgob3RoZXI6IEdhbWVPYmplY3QpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy54IDwgb3RoZXIueCArIG90aGVyLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueSA8IG90aGVyLnkgKyBvdGhlci5oZWlnaHQgJiZcclxuICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgPiBvdGhlci55O1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZTogbnVtYmVyO1xyXG4gICAgbGl2ZXM6IG51bWJlcjtcclxuICAgIG1vdmluZ0xlZnQ6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIG1vdmluZ1JpZ2h0OiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZUtleTogc3RyaW5nLCBzcGVlZDogbnVtYmVyLCBpbml0aWFsTGl2ZXM6IG51bWJlcikge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlS2V5KTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5saXZlcyA9IGluaXRpYWxMaXZlcztcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGNhbnZhc1dpZHRoOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5tb3ZpbmdMZWZ0KSB7XHJcbiAgICAgICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogKGRlbHRhVGltZSAvIDEwMDApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5tb3ZpbmdSaWdodCkge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIChkZWx0YVRpbWUgLyAxMDAwKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnggPCAwKSB0aGlzLnggPSAwO1xyXG4gICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoID4gY2FudmFzV2lkdGgpIHRoaXMueCA9IGNhbnZhc1dpZHRoIC0gdGhpcy53aWR0aDtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBpbWFnZUNhY2hlOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50Pik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGltYWdlID0gaW1hZ2VDYWNoZS5nZXQodGhpcy5pbWFnZUtleSk7XHJcbiAgICAgICAgaWYgKGltYWdlKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdibHVlJztcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBDb2xsZWN0aWJsZSBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgdmVsb2NpdHlZOiBudW1iZXI7XHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlS2V5OiBzdHJpbmcsIHZlbG9jaXR5WTogbnVtYmVyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VLZXkpO1xyXG4gICAgICAgIHRoaXMudmVsb2NpdHlZID0gdmVsb2NpdHlZO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnZlbG9jaXR5WSAqIChkZWx0YVRpbWUgLyAxMDAwKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBpbWFnZUNhY2hlOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50Pik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGltYWdlID0gaW1hZ2VDYWNoZS5nZXQodGhpcy5pbWFnZUtleSk7XHJcbiAgICAgICAgaWYgKGltYWdlKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdncmVlbic7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBnYW1lRGF0YSE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSBpbWFnZUNhY2hlOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgYXVkaW9DYWNoZTogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5ZXIhOiBQbGF5ZXI7XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogQ29sbGVjdGlibGVbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBwcml2YXRlIGxhc3RDb2xsZWN0aWJsZVNwYXduVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBwcml2YXRlIG5leHRDb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWw6IG51bWJlciA9IDA7IC8vIG1zXHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgICAgICB0aGlzLnNldHVwRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgICAgICB0aGlzLmxvYWRHYW1lRGF0YUFuZEFzc2V0cygpLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZUxvb3AoMCk7IC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3AgYWZ0ZXIgaW5pdGlhbGl6YXRpb25cclxuICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEgb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSBjYW52YXMgaGFzIHNvbWUgZGltZW5zaW9ucyBmb3IgZXJyb3IgbWVzc2FnZSBpZiBub3QgbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNhbnZhcy53aWR0aCA9PT0gMCB8fCB0aGlzLmNhbnZhcy5oZWlnaHQgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gODAwOyAvLyBEZWZhdWx0IHdpZHRoXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSA2MDA7IC8vIERlZmF1bHQgaGVpZ2h0XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIkVycm9yIGxvYWRpbmcgZ2FtZS4gQ2hlY2sgY29uc29sZS5cIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRHYW1lRGF0YUFuZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICB0aGlzLmdhbWVEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAvLyBSdW50aW1lIHZhbGlkYXRpb24gZm9yIGVzc2VudGlhbCBnYW1lU2V0dGluZ3MgYW5kIGFzc2V0IGFycmF5c1xyXG4gICAgICAgIGlmICghdGhpcy5nYW1lRGF0YSB8fFxyXG4gICAgICAgICAgICAhdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MgfHxcclxuICAgICAgICAgICAgdHlwZW9mIHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoICE9PSAnbnVtYmVyJyB8fFxyXG4gICAgICAgICAgICB0eXBlb2YgdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0ICE9PSAnbnVtYmVyJyB8fFxyXG4gICAgICAgICAgICAhQXJyYXkuaXNBcnJheSh0aGlzLmdhbWVEYXRhLmFzc2V0cz8uaW1hZ2VzKSB8fCAvLyBDaGVjayBpZiBhc3NldHMgYW5kIGltYWdlcyBhcnJheSBleGlzdFxyXG4gICAgICAgICAgICAhQXJyYXkuaXNBcnJheSh0aGlzLmdhbWVEYXRhLmFzc2V0cz8uc291bmRzKSAgICAvLyBDaGVjayBpZiBhc3NldHMgYW5kIHNvdW5kcyBhcnJheSBleGlzdFxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiTWFsZm9ybWVkIGRhdGEuanNvbjpcIiwgdGhpcy5nYW1lRGF0YSk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgb3IgaW5jb21wbGV0ZSBnYW1lIGRhdGEgZm91bmQgaW4gZGF0YS5qc29uLlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbXHJcbiAgICAgICAgICAgIHRoaXMubG9hZEltYWdlcyh0aGlzLmdhbWVEYXRhLmFzc2V0cy5pbWFnZXMgPz8gW10pLCAvLyBVc2UgbnVsbGlzaCBjb2FsZXNjaW5nIHRvIGVuc3VyZSBhbiBhcnJheVxyXG4gICAgICAgICAgICB0aGlzLmxvYWRTb3VuZHModGhpcy5nYW1lRGF0YS5hc3NldHMuc291bmRzID8/IFtdKSAgLy8gVXNlIG51bGxpc2ggY29hbGVzY2luZyB0byBlbnN1cmUgYW4gYXJyYXlcclxuICAgICAgICBdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZXMoaW1hZ2VDb25maWdzOiBJbWFnZURhdGFDb25maWdbXSk6IFByb21pc2U8dm9pZFtdPiB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGltYWdlQ29uZmlncy5tYXAoY29uZmlnID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGNvbmZpZy5wYXRoO1xyXG4gICAgICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmltYWdlQ2FjaGUuc2V0KGNvbmZpZy5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2NvbmZpZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2NvbmZpZy5wYXRofWApKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRTb3VuZHMoc291bmRDb25maWdzOiBTb3VuZERhdGFDb25maWdbXSk6IFByb21pc2U8dm9pZFtdPiB7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHNvdW5kQ29uZmlncy5tYXAoY29uZmlnID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5zcmMgPSBjb25maWcucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGNvbmZpZy52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9DYWNoZS5zZXQoY29uZmlnLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2NvbmZpZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2NvbmZpZy5wYXRofWApKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChzb3VuZFByb21pc2VzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hdWRpb0NhY2hlLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICBhdWRpby5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgYXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBFcnJvciBwbGF5aW5nIHNvdW5kICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZCBpbiBjYWNoZS5gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICB0aGlzLnNldHVwTmV3R2FtZSgpO1xyXG4gICAgICAgIC8vIEJHTSBpcyBub3cgc3RhcnRlZCBvbmx5IGFmdGVyIHVzZXIgaW5wdXQgKFNQQUNFKSBpbiBzdGFydEdhbWUoKVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBOZXdHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHsgZ2FtZVNldHRpbmdzIH0gPSB0aGlzLmdhbWVEYXRhO1xyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcihcclxuICAgICAgICAgICAgKHRoaXMuY2FudmFzLndpZHRoIC0gZ2FtZVNldHRpbmdzLnBsYXllcldpZHRoKSAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAtIGdhbWVTZXR0aW5ncy5wbGF5ZXJIZWlnaHQgLSAxMCxcclxuICAgICAgICAgICAgZ2FtZVNldHRpbmdzLnBsYXllcldpZHRoLFxyXG4gICAgICAgICAgICBnYW1lU2V0dGluZ3MucGxheWVySGVpZ2h0LFxyXG4gICAgICAgICAgICAncGxheWVyJyxcclxuICAgICAgICAgICAgZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkLFxyXG4gICAgICAgICAgICBnYW1lU2V0dGluZ3MuaW5pdGlhbExpdmVzXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMubGFzdENvbGxlY3RpYmxlU3Bhd25UaW1lID0gMDtcclxuICAgICAgICB0aGlzLnNldE5leHRDb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWwoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldE5leHRDb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWwoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgeyBjb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNaW4sIGNvbGxlY3RpYmxlU3Bhd25JbnRlcnZhbE1heCB9ID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgdGhpcy5uZXh0Q29sbGVjdGlibGVTcGF3bkludGVydmFsID0gTWF0aC5yYW5kb20oKSAqIChjb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNYXggLSBjb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNaW4pICsgY29sbGVjdGlibGVTcGF3bkludGVydmFsTWluO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcgfHwgZXZlbnQua2V5ID09PSAnYScpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLm1vdmluZ0xlZnQgPSB0cnVlO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93UmlnaHQnIHx8IGV2ZW50LmtleSA9PT0gJ2QnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5tb3ZpbmdSaWdodCA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcgfHwgZXZlbnQua2V5ID09PSAnYScpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLm1vdmluZ0xlZnQgPSBmYWxzZTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICdBcnJvd1JpZ2h0JyB8fCBldmVudC5rZXkgPT09ICdkJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIubW92aW5nUmlnaHQgPSBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICB0aGlzLnNldHVwTmV3R2FtZSgpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci5zY29yZSA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLmxpdmVzID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuaW5pdGlhbExpdmVzO1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdiZ20nLCB0cnVlKTsgLy8gQkdNIHN0YXJ0cyBoZXJlLCBhZnRlciB1c2VyIGlucHV0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIHRoaXMucGxheWVyLm1vdmluZ0xlZnQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLnBsYXllci5tb3ZpbmdSaWdodCA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AodGltZXN0YW1wOiBET01IaWdoUmVzVGltZVN0YW1wKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gdGltZXN0YW1wIC0gdGhpcy5sYXN0VGltZTtcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gdGltZXN0YW1wO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMuZHJhdygpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgY29uc3QgeyBnYW1lU2V0dGluZ3MgfSA9IHRoaXMuZ2FtZURhdGE7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmNhbnZhcy53aWR0aCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmxhc3RDb2xsZWN0aWJsZVNwYXduVGltZSArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmxhc3RDb2xsZWN0aWJsZVNwYXduVGltZSA+PSB0aGlzLm5leHRDb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJhbmRvbVggPSBNYXRoLnJhbmRvbSgpICogKHRoaXMuY2FudmFzLndpZHRoIC0gZ2FtZVNldHRpbmdzLmNvbGxlY3RpYmxlV2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmFuZG9tVmVsb2NpdHlZID0gTWF0aC5yYW5kb20oKSAqIChnYW1lU2V0dGluZ3MuY29sbGVjdGlibGVTcGVlZE1heCAtIGdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZVNwZWVkTWluKSArIGdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZVNwZWVkTWluO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMucHVzaChuZXcgQ29sbGVjdGlibGUoXHJcbiAgICAgICAgICAgICAgICAgICAgcmFuZG9tWCxcclxuICAgICAgICAgICAgICAgICAgICAtZ2FtZVNldHRpbmdzLmNvbGxlY3RpYmxlSGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgIGdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZVdpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgIGdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZUhlaWdodCxcclxuICAgICAgICAgICAgICAgICAgICAnY29sbGVjdGlibGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIHJhbmRvbVZlbG9jaXR5WVxyXG4gICAgICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RDb2xsZWN0aWJsZVNwYXduVGltZSA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldE5leHRDb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWwoKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuY29sbGVjdGlibGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xsZWN0aWJsZSA9IHRoaXMuY29sbGVjdGlibGVzW2ldO1xyXG4gICAgICAgICAgICAgICAgY29sbGVjdGlibGUudXBkYXRlKGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmNvbGxpZGVzV2l0aChjb2xsZWN0aWJsZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5zY29yZSArPSBnYW1lU2V0dGluZ3Muc2NvcmVQZXJDb2xsZWN0aWJsZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnY29sbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNvbGxlY3RpYmxlLnkgPiB0aGlzLmNhbnZhcy5oZWlnaHQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5saXZlcy0tO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdtaXNzJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5saXZlcyA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgeyBnYW1lU2V0dGluZ3MgfSA9IHRoaXMuZ2FtZURhdGE7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNHB4ICR7Z2FtZVNldHRpbmdzLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBnYW1lU2V0dGluZ3MudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5MT0FESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiTG9hZGluZy4uLlwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIuZHJhdyh0aGlzLmN0eCwgdGhpcy5pbWFnZUNhY2hlKTtcclxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuZm9yRWFjaChjb2xsZWN0aWJsZSA9PiBjb2xsZWN0aWJsZS5kcmF3KHRoaXMuY3R4LCB0aGlzLmltYWdlQ2FjaGUpKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNjb3JlOiAke3RoaXMucGxheWVyLnNjb3JlfWAsIDEwLCAzMCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBMaXZlczogJHt0aGlzLnBsYXllci5saXZlc31gLCB0aGlzLmNhbnZhcy53aWR0aCAtIDEwLCAzMCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICBjb25zdCBnYW1lT3ZlclRleHQgPSBnYW1lU2V0dGluZ3MuZ2FtZU92ZXJTY3JlZW5UZXh0LnJlcGxhY2UoJ3tzY29yZX0nLCB0aGlzLnBsYXllci5zY29yZS50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChnYW1lT3ZlclRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RleHQodGV4dDogc3RyaW5nLCB4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgY29uc3QgbGluZUhlaWdodCA9IDMwOyAvLyBBcHByb3ggbGluZSBoZWlnaHQgYmFzZWQgb24gMjRweCBmb250XHJcbiAgICAgICAgbGV0IGN1cnJlbnRZID0geSAtIChsaW5lcy5sZW5ndGggLSAxKSAqIGxpbmVIZWlnaHQgLyAyO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgeCwgY3VycmVudFkpO1xyXG4gICAgICAgICAgICBjdXJyZW50WSArPSBsaW5lSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQTBDQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQU9MLE1BQWUsV0FBVztBQUFBLEVBQ3RCLFlBQW1CLEdBQWtCLEdBQWtCLE9BQXNCLFFBQXVCLFVBQWtCO0FBQW5HO0FBQWtCO0FBQWtCO0FBQXNCO0FBQXVCO0FBQUEsRUFBbUI7QUFBQSxFQUt2SCxhQUFhLE9BQTRCO0FBQ3JDLFdBQU8sS0FBSyxJQUFJLE1BQU0sSUFBSSxNQUFNLFNBQ3pCLEtBQUssSUFBSSxLQUFLLFFBQVEsTUFBTSxLQUM1QixLQUFLLElBQUksTUFBTSxJQUFJLE1BQU0sVUFDekIsS0FBSyxJQUFJLEtBQUssU0FBUyxNQUFNO0FBQUEsRUFDeEM7QUFDSjtBQUVBLE1BQU0sZUFBZSxXQUFXO0FBQUEsRUFPNUIsWUFBWSxHQUFXLEdBQVcsT0FBZSxRQUFnQixVQUFrQixPQUFlLGNBQXNCO0FBQ3BILFVBQU0sR0FBRyxHQUFHLE9BQU8sUUFBUSxRQUFRO0FBSnZDLHNCQUFzQjtBQUN0Qix1QkFBdUI7QUFJbkIsU0FBSyxRQUFRO0FBQ2IsU0FBSyxRQUFRO0FBQ2IsU0FBSyxRQUFRO0FBQUEsRUFDakI7QUFBQSxFQUVBLE9BQU8sV0FBbUIsYUFBMkI7QUFDakQsUUFBSSxLQUFLLFlBQVk7QUFDakIsV0FBSyxLQUFLLEtBQUssU0FBUyxZQUFZO0FBQUEsSUFDeEM7QUFDQSxRQUFJLEtBQUssYUFBYTtBQUNsQixXQUFLLEtBQUssS0FBSyxTQUFTLFlBQVk7QUFBQSxJQUN4QztBQUVBLFFBQUksS0FBSyxJQUFJLEVBQUcsTUFBSyxJQUFJO0FBQ3pCLFFBQUksS0FBSyxJQUFJLEtBQUssUUFBUSxZ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
