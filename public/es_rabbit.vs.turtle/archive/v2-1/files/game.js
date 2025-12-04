var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class AssetLoader {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.soundConfigs = /* @__PURE__ */ new Map();
  }
  async load(assetConfig) {
    const imagePromises = assetConfig.images.map((imgData) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imgData.path;
        img.onload = () => {
          this.images.set(imgData.name, img);
          resolve();
        };
        img.onerror = () => reject(`Failed to load image: ${imgData.path}`);
      });
    });
    const soundPromises = assetConfig.sounds.map((soundData) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = soundData.path;
        audio.preload = "auto";
        audio.oncanplaythrough = () => {
          this.sounds.set(soundData.name, audio);
          this.soundConfigs.set(soundData.name, soundData);
          resolve();
        };
        audio.onerror = () => reject(`Failed to load sound: ${soundData.path}`);
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  getImage(name) {
    return this.images.get(name);
  }
  playSound(name, loop = false) {
    const audio = this.sounds.get(name);
    const config = this.soundConfigs.get(name);
    if (audio && config) {
      const clonedAudio = audio.cloneNode();
      clonedAudio.volume = config.volume;
      clonedAudio.loop = loop;
      clonedAudio.play().catch((e) => console.warn(`Sound playback failed for ${name}:`, e));
      return clonedAudio;
    }
    return void 0;
  }
  playBGM(name) {
    const audio = this.sounds.get(name);
    const config = this.soundConfigs.get(name);
    if (audio && config) {
      audio.volume = config.volume;
      audio.loop = true;
      audio.play().catch((e) => console.warn(`BGM playback failed for ${name}:`, e));
      return audio;
    }
    return void 0;
  }
  stopSound(audioInstance) {
    if (audioInstance) {
      audioInstance.pause();
      audioInstance.currentTime = 0;
    }
  }
}
class InputHandler {
  constructor(canvas) {
    this.keys = /* @__PURE__ */ new Map();
    this.clickRegistered = false;
    window.addEventListener("keydown", (e) => {
      this.keys.set(e.code, true);
      if (e.code === "Space" || e.code === "KeyR") {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.set(e.code, false);
    });
    canvas.addEventListener("click", () => {
      this.clickRegistered = true;
    });
  }
  isKeyDown(code) {
    return this.keys.get(code) || false;
  }
  resetClick() {
    this.clickRegistered = false;
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
  draw(ctx, assetLoader) {
    const img = assetLoader.getImage(this.imageName);
    if (img) {
      ctx.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    } else {
      ctx.fillStyle = "red";
      ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }
  }
  collidesWith(other) {
    return this.x - this.width / 2 < other.x + other.width / 2 && this.x + this.width / 2 > other.x - other.width / 2 && this.y - this.height / 2 < other.y + other.height / 2 && this.y + this.height / 2 > other.y - other.height / 2;
  }
}
class Player extends GameObject {
  constructor(x, y, width, height, imageName, settings) {
    super(x, y, width, height, imageName);
    this.lastShotTime = 0;
    this.health = settings.health;
    this.fireRateMs = settings.fireRateMs;
    this.speed = settings.speed;
  }
  update(deltaTime, canvasWidth, canvasHeight, input) {
    if (input.isKeyDown("ArrowLeft") || input.isKeyDown("KeyA")) {
      this.x -= this.speed * deltaTime;
    }
    if (input.isKeyDown("ArrowRight") || input.isKeyDown("KeyD")) {
      this.x += this.speed * deltaTime;
    }
    if (input.isKeyDown("ArrowUp") || input.isKeyDown("KeyW")) {
      this.y -= this.speed * deltaTime;
    }
    if (input.isKeyDown("ArrowDown") || input.isKeyDown("KeyS")) {
      this.y += this.speed * deltaTime;
    }
    this.x = Math.max(this.width / 2, Math.min(canvasWidth - this.width / 2, this.x));
    this.y = Math.max(this.height / 2, Math.min(canvasHeight - this.height / 2, this.y));
  }
  canShoot(currentTime) {
    return currentTime - this.lastShotTime > this.fireRateMs;
  }
  shoot(currentTime, bulletSettings) {
    this.lastShotTime = currentTime;
    return new Bullet(
      this.x,
      this.y - this.height / 2 - bulletSettings.height / 2,
      bulletSettings.width,
      bulletSettings.height,
      "bullet",
      bulletSettings.speed,
      bulletSettings.damage
    );
  }
}
class Bullet extends GameObject {
  constructor(x, y, width, height, imageName, speed, damage) {
    super(x, y, width, height, imageName);
    this.speed = speed;
    this.damage = damage;
  }
  update(deltaTime) {
    this.y -= this.speed * deltaTime;
  }
  isOffscreen(canvasHeight) {
    return this.y + this.height / 2 < 0;
  }
}
class Enemy extends GameObject {
  constructor(x, y, width, height, imageName, settings) {
    super(x, y, width, height, imageName);
    this.health = settings.health;
    this.speed = settings.speed;
    this.scoreValue = settings.scoreValue;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  isOffscreen(canvasHeight) {
    return this.y - this.height / 2 > canvasHeight;
  }
}
class Game {
  constructor(canvasId) {
    this.gameState = 0 /* TITLE */;
    this.lastFrameTime = 0;
    this.bullets = [];
    this.enemies = [];
    this.score = 0;
    this.lastEnemySpawnTime = 0;
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D rendering context from canvas.");
    }
    this.ctx = ctx;
    this.assetLoader = new AssetLoader();
    this.inputHandler = new InputHandler(this.canvas);
    this.gameLoop = this.gameLoop.bind(this);
  }
  async start() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const gameData = await response.json();
      this.settings = gameData.gameSettings;
      this.canvas.width = this.settings.canvasWidth;
      this.canvas.height = this.settings.canvasHeight;
      await this.assetLoader.load(gameData.assets);
      console.log("Assets loaded successfully!");
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this.gameLoop);
    } catch (error) {
      console.error("Failed to load game data or assets:", error);
    }
  }
  initGame() {
    this.player = new Player(
      this.canvas.width / 2,
      this.canvas.height - this.settings.player.height,
      this.settings.player.width,
      this.settings.player.height,
      "player",
      this.settings.player
    );
    this.bullets = [];
    this.enemies = [];
    this.score = 0;
    this.lastEnemySpawnTime = performance.now();
    if (this.bgmInstance) {
      this.assetLoader.stopSound(this.bgmInstance);
    }
    this.bgmInstance = this.assetLoader.playBGM("bgm");
  }
  gameLoop(currentTime) {
    const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
    this.lastFrameTime = currentTime;
    this.update(deltaTime, currentTime);
    this.draw();
    requestAnimationFrame(this.gameLoop);
  }
  update(deltaTime, currentTime) {
    switch (this.gameState) {
      case 0 /* TITLE */:
        if (this.inputHandler.isKeyDown("Space") || this.inputHandler.clickRegistered) {
          this.initGame();
          this.gameState = 1 /* PLAYING */;
          this.inputHandler.resetClick();
        }
        break;
      case 1 /* PLAYING */:
        this.player.update(deltaTime, this.canvas.width, this.canvas.height, this.inputHandler);
        if (this.inputHandler.isKeyDown("Space") && this.player.canShoot(currentTime)) {
          const newBullet = this.player.shoot(currentTime, this.settings.bullet);
          this.bullets.push(newBullet);
          this.assetLoader.playSound("shoot");
        }
        this.bullets = this.bullets.filter((bullet) => {
          bullet.update(deltaTime);
          return !bullet.isOffscreen(this.canvas.height);
        });
        if (currentTime - this.lastEnemySpawnTime > this.settings.enemy.spawnIntervalMs) {
          const enemyX = Math.random() * (this.canvas.width - this.settings.enemy.width) + this.settings.enemy.width / 2;
          const newEnemy = new Enemy(
            enemyX,
            -this.settings.enemy.height / 2,
            this.settings.enemy.width,
            this.settings.enemy.height,
            "enemy",
            this.settings.enemy
          );
          this.enemies.push(newEnemy);
          this.lastEnemySpawnTime = currentTime;
        }
        this.enemies = this.enemies.filter((enemy) => {
          enemy.update(deltaTime);
          if (enemy.isOffscreen(this.canvas.height)) {
            this.player.health--;
            this.assetLoader.playSound("hit");
            return false;
          }
          return true;
        });
        this.bullets.forEach((bullet) => {
          this.enemies.forEach((enemy) => {
            if (bullet.collidesWith(enemy)) {
              enemy.health -= bullet.damage;
              bullet.x = -1e3;
              this.assetLoader.playSound("hit");
              if (enemy.health <= 0) {
                this.score += enemy.scoreValue;
                enemy.x = -1e3;
              }
            }
          });
        });
        this.bullets = this.bullets.filter((bullet) => bullet.x !== -1e3);
        this.enemies = this.enemies.filter((enemy) => enemy.x !== -1e3);
        this.enemies.forEach((enemy) => {
          if (this.player.collidesWith(enemy)) {
            this.player.health--;
            enemy.x = -1e3;
            this.assetLoader.playSound("hit");
          }
        });
        this.enemies = this.enemies.filter((enemy) => enemy.x !== -1e3);
        if (this.player.health <= 0) {
          this.gameState = 2 /* GAME_OVER */;
          if (this.bgmInstance) {
            this.assetLoader.stopSound(this.bgmInstance);
          }
        }
        break;
      case 2 /* GAME_OVER */:
        if (this.inputHandler.isKeyDown("KeyR")) {
          this.gameState = 0 /* TITLE */;
          this.inputHandler.keys.set("KeyR", false);
        }
        break;
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.settings.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const bgImg = this.assetLoader.getImage("background");
    if (bgImg) {
      this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawText(this.settings.titleText, this.canvas.width / 2, this.canvas.height / 2 - 50, "white", "48px Arial");
        this.drawText(this.settings.startPromptText, this.canvas.width / 2, this.canvas.height / 2 + 20, "white", this.settings.gameFont);
        break;
      case 1 /* PLAYING */:
        this.player.draw(this.ctx, this.assetLoader);
        this.bullets.forEach((bullet) => bullet.draw(this.ctx, this.assetLoader));
        this.enemies.forEach((enemy) => enemy.draw(this.ctx, this.assetLoader));
        this.drawText(`Score: ${this.score}`, 10, 30, "white", this.settings.gameFont, "left");
        this.drawText(`Health: ${this.player.health}`, this.canvas.width - 10, 30, "white", this.settings.gameFont, "right");
        break;
      case 2 /* GAME_OVER */:
        this.drawText(this.settings.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 50, "white", "48px Arial");
        this.drawText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20, "white", this.settings.gameFont);
        this.drawText(this.settings.restartPromptText, this.canvas.width / 2, this.canvas.height / 2 + 60, "white", this.settings.gameFont);
        break;
    }
  }
  drawText(text, x, y, color, font, align = "center") {
    this.ctx.font = font;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, x, y);
  }
}
window.addEventListener("load", () => {
  const game = new Game("gameCanvas");
  game.start();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZERhdGFDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgdm9sdW1lOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBc3NldENvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlRGF0YUNvbmZpZ1tdO1xyXG4gICAgc291bmRzOiBTb3VuZERhdGFDb25maWdbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIHRpdGxlVGV4dDogc3RyaW5nO1xyXG4gICAgc3RhcnRQcm9tcHRUZXh0OiBzdHJpbmc7XHJcbiAgICBnYW1lT3ZlclRleHQ6IHN0cmluZztcclxuICAgIHJlc3RhcnRQcm9tcHRUZXh0OiBzdHJpbmc7XHJcbiAgICBwbGF5ZXI6IHtcclxuICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7IC8vIHBpeGVscyBwZXIgc2Vjb25kXHJcbiAgICAgICAgZmlyZVJhdGVNczogbnVtYmVyO1xyXG4gICAgICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIGJ1bGxldDoge1xyXG4gICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjsgLy8gcGl4ZWxzIHBlciBzZWNvbmRcclxuICAgICAgICBkYW1hZ2U6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBlbmVteToge1xyXG4gICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjsgLy8gcGl4ZWxzIHBlciBzZWNvbmRcclxuICAgICAgICBzcGF3bkludGVydmFsTXM6IG51bWJlcjtcclxuICAgICAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZ2FtZUZvbnQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgYXNzZXRzOiBBc3NldENvbmZpZztcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TG9hZGVyIHtcclxuICAgIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgc291bmRDb25maWdzOiBNYXA8c3RyaW5nLCBTb3VuZERhdGFDb25maWc+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIGFzeW5jIGxvYWQoYXNzZXRDb25maWc6IEFzc2V0Q29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGFzc2V0Q29uZmlnLmltYWdlcy5tYXAoaW1nRGF0YSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgICAgIGltZy5zcmMgPSBpbWdEYXRhLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChpbWdEYXRhLm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdEYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gYXNzZXRDb25maWcuc291bmRzLm1hcChzb3VuZERhdGEgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHNvdW5kRGF0YS5wYXRoO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJztcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kRGF0YS5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZENvbmZpZ3Muc2V0KHNvdW5kRGF0YS5uYW1lLCBzb3VuZERhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZERhdGEucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBjb25zdCBjb25maWcgPSB0aGlzLnNvdW5kQ29uZmlncy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvICYmIGNvbmZpZykge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZWRBdWRpbyA9IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lZEF1ZGlvLnZvbHVtZSA9IGNvbmZpZy52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lZEF1ZGlvLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZWRBdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYFNvdW5kIHBsYXliYWNrIGZhaWxlZCBmb3IgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgIHJldHVybiBjbG9uZWRBdWRpbztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5QkdNKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuc291bmRDb25maWdzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8gJiYgY29uZmlnKSB7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGNvbmZpZy52b2x1bWU7XHJcbiAgICAgICAgICAgIGF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICBhdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEJHTSBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgICAgICByZXR1cm4gYXVkaW87XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcFNvdW5kKGF1ZGlvSW5zdGFuY2U6IEhUTUxBdWRpb0VsZW1lbnQpIHtcclxuICAgICAgICBpZiAoYXVkaW9JbnN0YW5jZSkge1xyXG4gICAgICAgICAgICBhdWRpb0luc3RhbmNlLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvSW5zdGFuY2UuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgSW5wdXRIYW5kbGVyIHtcclxuICAgIGtleXM6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcCgpO1xyXG4gICAgY2xpY2tSZWdpc3RlcmVkOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCkge1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5rZXlzLnNldChlLmNvZGUsIHRydWUpO1xyXG4gICAgICAgICAgICBpZiAoZS5jb2RlID09PSAnU3BhY2UnIHx8IGUuY29kZSA9PT0gJ0tleVInKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmtleXMuc2V0KGUuY29kZSwgZmFsc2UpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jbGlja1JlZ2lzdGVyZWQgPSB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGlzS2V5RG93bihjb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5rZXlzLmdldChjb2RlKSB8fCBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICByZXNldENsaWNrKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2xpY2tSZWdpc3RlcmVkID0gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWVPYmplY3Qge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZU5hbWUgPSBpbWFnZU5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRMb2FkZXI6IEFzc2V0TG9hZGVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgaW1nID0gYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5pbWFnZU5hbWUpO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHRoaXMueCAtIHRoaXMud2lkdGggLyAyLCB0aGlzLnkgLSB0aGlzLmhlaWdodCAvIDIsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLnggLSB0aGlzLndpZHRoIC8gMiwgdGhpcy55IC0gdGhpcy5oZWlnaHQgLyAyLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbGxpZGVzV2l0aChvdGhlcjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnggLSB0aGlzLndpZHRoIC8gMiA8IG90aGVyLnggKyBvdGhlci53aWR0aCAvIDIgJiZcclxuICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCAvIDIgPiBvdGhlci54IC0gb3RoZXIud2lkdGggLyAyICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueSAtIHRoaXMuaGVpZ2h0IC8gMiA8IG90aGVyLnkgKyBvdGhlci5oZWlnaHQgLyAyICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueSArIHRoaXMuaGVpZ2h0IC8gMiA+IG90aGVyLnkgLSBvdGhlci5oZWlnaHQgLyAyO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgbGFzdFNob3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgZmlyZVJhdGVNczogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlTmFtZTogc3RyaW5nLCBzZXR0aW5nczogR2FtZVNldHRpbmdzWydwbGF5ZXInXSkge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlTmFtZSk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBzZXR0aW5ncy5oZWFsdGg7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZU1zID0gc2V0dGluZ3MuZmlyZVJhdGVNcztcclxuICAgICAgICB0aGlzLnNwZWVkID0gc2V0dGluZ3Muc3BlZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBjYW52YXNXaWR0aDogbnVtYmVyLCBjYW52YXNIZWlnaHQ6IG51bWJlciwgaW5wdXQ6IElucHV0SGFuZGxlcik6IHZvaWQge1xyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleURvd24oJ0Fycm93TGVmdCcpIHx8IGlucHV0LmlzS2V5RG93bignS2V5QScpKSB7XHJcbiAgICAgICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoaW5wdXQuaXNLZXlEb3duKCdBcnJvd1JpZ2h0JykgfHwgaW5wdXQuaXNLZXlEb3duKCdLZXlEJykpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleURvd24oJ0Fycm93VXAnKSB8fCBpbnB1dC5pc0tleURvd24oJ0tleVcnKSkge1xyXG4gICAgICAgICAgICB0aGlzLnkgLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGlucHV0LmlzS2V5RG93bignQXJyb3dEb3duJykgfHwgaW5wdXQuaXNLZXlEb3duKCdLZXlTJykpIHtcclxuICAgICAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnggPSBNYXRoLm1heCh0aGlzLndpZHRoIC8gMiwgTWF0aC5taW4oY2FudmFzV2lkdGggLSB0aGlzLndpZHRoIC8gMiwgdGhpcy54KSk7XHJcbiAgICAgICAgdGhpcy55ID0gTWF0aC5tYXgodGhpcy5oZWlnaHQgLyAyLCBNYXRoLm1pbihjYW52YXNIZWlnaHQgLSB0aGlzLmhlaWdodCAvIDIsIHRoaXMueSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGNhblNob290KGN1cnJlbnRUaW1lOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gY3VycmVudFRpbWUgLSB0aGlzLmxhc3RTaG90VGltZSA+IHRoaXMuZmlyZVJhdGVNcztcclxuICAgIH1cclxuXHJcbiAgICBzaG9vdChjdXJyZW50VGltZTogbnVtYmVyLCBidWxsZXRTZXR0aW5nczogR2FtZVNldHRpbmdzWydidWxsZXQnXSk6IEJ1bGxldCB7XHJcbiAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBjdXJyZW50VGltZTtcclxuICAgICAgICByZXR1cm4gbmV3IEJ1bGxldChcclxuICAgICAgICAgICAgdGhpcy54LFxyXG4gICAgICAgICAgICB0aGlzLnkgLSB0aGlzLmhlaWdodCAvIDIgLSBidWxsZXRTZXR0aW5ncy5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICBidWxsZXRTZXR0aW5ncy53aWR0aCxcclxuICAgICAgICAgICAgYnVsbGV0U2V0dGluZ3MuaGVpZ2h0LFxyXG4gICAgICAgICAgICAnYnVsbGV0JyxcclxuICAgICAgICAgICAgYnVsbGV0U2V0dGluZ3Muc3BlZWQsXHJcbiAgICAgICAgICAgIGJ1bGxldFNldHRpbmdzLmRhbWFnZVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJ1bGxldCBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgZGFtYWdlOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBzcGVlZDtcclxuICAgICAgICB0aGlzLmRhbWFnZSA9IGRhbWFnZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnkgLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgIH1cclxuXHJcbiAgICBpc09mZnNjcmVlbihjYW52YXNIZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnkgKyB0aGlzLmhlaWdodCAvIDIgPCAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBFbmVteSBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcsIHNldHRpbmdzOiBHYW1lU2V0dGluZ3NbJ2VuZW15J10pIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gc2V0dGluZ3MuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBzZXR0aW5ncy5zcGVlZDtcclxuICAgICAgICB0aGlzLnNjb3JlVmFsdWUgPSBzZXR0aW5ncy5zY29yZVZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGlzT2Zmc2NyZWVuKGNhbnZhc0hlaWdodDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueSAtIHRoaXMuaGVpZ2h0IC8gMiA+IGNhbnZhc0hlaWdodDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBhc3NldExvYWRlcjogQXNzZXRMb2FkZXI7XHJcbiAgICBpbnB1dEhhbmRsZXI6IElucHV0SGFuZGxlcjtcclxuICAgIHNldHRpbmdzITogR2FtZVNldHRpbmdzO1xyXG5cclxuICAgIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBwbGF5ZXIhOiBQbGF5ZXI7XHJcbiAgICBidWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBiZ21JbnN0YW5jZTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICBsYXN0RW5lbXlTcGF3blRpbWU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIWNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGNhbnZhcztcclxuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgICAgICBpZiAoIWN0eCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgMkQgcmVuZGVyaW5nIGNvbnRleHQgZnJvbSBjYW52YXMuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gY3R4O1xyXG5cclxuICAgICAgICB0aGlzLmFzc2V0TG9hZGVyID0gbmV3IEFzc2V0TG9hZGVyKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIgPSBuZXcgSW5wdXRIYW5kbGVyKHRoaXMuY2FudmFzKTtcclxuXHJcbiAgICAgICAgdGhpcy5nYW1lTG9vcCA9IHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IGdhbWVEYXRhOiBHYW1lRGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IGdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5zZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5zZXR0aW5ncy5jYW52YXNIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TG9hZGVyLmxvYWQoZ2FtZURhdGEuYXNzZXRzKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0Fzc2V0cyBsb2FkZWQgc3VjY2Vzc2Z1bGx5IScpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEgb3IgYXNzZXRzOicsIGVycm9yKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAtIHRoaXMuc2V0dGluZ3MucGxheWVyLmhlaWdodCxcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5wbGF5ZXIud2lkdGgsXHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MucGxheWVyLmhlaWdodCxcclxuICAgICAgICAgICAgJ3BsYXllcicsXHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MucGxheWVyXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmxhc3RFbmVteVNwYXduVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5iZ21JbnN0YW5jZSkge1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TG9hZGVyLnN0b3BTb3VuZCh0aGlzLmJnbUluc3RhbmNlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5iZ21JbnN0YW5jZSA9IHRoaXMuYXNzZXRMb2FkZXIucGxheUJHTSgnYmdtJyk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZUxvb3AoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RGcmFtZVRpbWUpIC8gMTAwMDtcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lLCBjdXJyZW50VGltZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaW5wdXRIYW5kbGVyLmlzS2V5RG93bignU3BhY2UnKSB8fCB0aGlzLmlucHV0SGFuZGxlci5jbGlja1JlZ2lzdGVyZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5yZXNldENsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0LCB0aGlzLmlucHV0SGFuZGxlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaW5wdXRIYW5kbGVyLmlzS2V5RG93bignU3BhY2UnKSAmJiB0aGlzLnBsYXllci5jYW5TaG9vdChjdXJyZW50VGltZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdCdWxsZXQgPSB0aGlzLnBsYXllci5zaG9vdChjdXJyZW50VGltZSwgdGhpcy5zZXR0aW5ncy5idWxsZXQpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0cy5wdXNoKG5ld0J1bGxldCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldExvYWRlci5wbGF5U291bmQoJ3Nob290Jyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzID0gdGhpcy5idWxsZXRzLmZpbHRlcihidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGJ1bGxldC51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gIWJ1bGxldC5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RW5lbXlTcGF3blRpbWUgPiB0aGlzLnNldHRpbmdzLmVuZW15LnNwYXduSW50ZXJ2YWxNcykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZW15WCA9IE1hdGgucmFuZG9tKCkgKiAodGhpcy5jYW52YXMud2lkdGggLSB0aGlzLnNldHRpbmdzLmVuZW15LndpZHRoKSArIHRoaXMuc2V0dGluZ3MuZW5lbXkud2lkdGggLyAyO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0VuZW15ID0gbmV3IEVuZW15KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmVteVgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC10aGlzLnNldHRpbmdzLmVuZW15LmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZW5lbXkud2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZW5lbXkuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAnZW5lbXknLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHRpbmdzLmVuZW15XHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChuZXdFbmVteSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXN0RW5lbXlTcGF3blRpbWUgPSBjdXJyZW50VGltZTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMgPSB0aGlzLmVuZW1pZXMuZmlsdGVyKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5lbXkuaXNPZmZzY3JlZW4odGhpcy5jYW52YXMuaGVpZ2h0KSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5oZWFsdGgtLTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldExvYWRlci5wbGF5U291bmQoJ2hpdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChidWxsZXQuY29sbGlkZXNXaXRoKGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXkuaGVhbHRoIC09IGJ1bGxldC5kYW1hZ2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBidWxsZXQueCA9IC0xMDAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldExvYWRlci5wbGF5U291bmQoJ2hpdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVuZW15LmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSBlbmVteS5zY29yZVZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnggPSAtMTAwMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldHMgPSB0aGlzLmJ1bGxldHMuZmlsdGVyKGJ1bGxldCA9PiBidWxsZXQueCAhPT0gLTEwMDApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzID0gdGhpcy5lbmVtaWVzLmZpbHRlcihlbmVteSA9PiBlbmVteS54ICE9PSAtMTAwMCk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5jb2xsaWRlc1dpdGgoZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmhlYWx0aC0tO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmVteS54ID0gLTEwMDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRMb2FkZXIucGxheVNvdW5kKCdoaXQnKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZW5lbXkgPT4gZW5lbXkueCAhPT0gLTEwMDApO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5iZ21JbnN0YW5jZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TG9hZGVyLnN0b3BTb3VuZCh0aGlzLmJnbUluc3RhbmNlKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlucHV0SGFuZGxlci5pc0tleURvd24oJ0tleVInKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLmtleXMuc2V0KCdLZXlSJywgZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuc2V0dGluZ3MuYmFja2dyb3VuZENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBiZ0ltZyA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UoJ2JhY2tncm91bmQnKTtcclxuICAgICAgICBpZiAoYmdJbWcpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJnSW1nLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuc2V0dGluZ3MudGl0bGVUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJ3doaXRlJywgJzQ4cHggQXJpYWwnKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5zZXR0aW5ncy5zdGFydFByb21wdFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwLCAnd2hpdGUnLCB0aGlzLnNldHRpbmdzLmdhbWVGb250KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRMb2FkZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IGJ1bGxldC5kcmF3KHRoaXMuY3R4LCB0aGlzLmFzc2V0TG9hZGVyKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiBlbmVteS5kcmF3KHRoaXMuY3R4LCB0aGlzLmFzc2V0TG9hZGVyKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChgU2NvcmU6ICR7dGhpcy5zY29yZX1gLCAxMCwgMzAsICd3aGl0ZScsIHRoaXMuc2V0dGluZ3MuZ2FtZUZvbnQsICdsZWZ0Jyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGBIZWFsdGg6ICR7dGhpcy5wbGF5ZXIuaGVhbHRofWAsIHRoaXMuY2FudmFzLndpZHRoIC0gMTAsIDMwLCAnd2hpdGUnLCB0aGlzLnNldHRpbmdzLmdhbWVGb250LCAncmlnaHQnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLnNldHRpbmdzLmdhbWVPdmVyVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsICd3aGl0ZScsICc0OHB4IEFyaWFsJyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGBGaW5hbCBTY29yZTogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwLCAnd2hpdGUnLCB0aGlzLnNldHRpbmdzLmdhbWVGb250KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5zZXR0aW5ncy5yZXN0YXJ0UHJvbXB0VGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNjAsICd3aGl0ZScsIHRoaXMuc2V0dGluZ3MuZ2FtZUZvbnQpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXdUZXh0KHRleHQ6IHN0cmluZywgeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIGZvbnQ6IHN0cmluZywgYWxpZ246IENhbnZhc1RleHRBbGlnbiA9ICdjZW50ZXInKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGZvbnQ7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gYWxpZ247XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dCwgeCwgeSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICBnYW1lLnN0YXJ0KCk7XHJcbn0pOyJdLAogICJtYXBw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USxLQUFLLFdBQVc7QUFBQSxNQUNwQixLQUFLO0FBQ0QsYUFBSyxTQUFTLEtBQUssU0FBUyxXQUFXLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxJQUFJLFNBQVMsWUFBWTtBQUNoSCxhQUFLLFNBQVMsS0FBSyxTQUFTLGlCQUFpQixLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksSUFBSSxTQUFTLEtBQUssU0FBUyxRQUFRO0FBQ2hJO0FBQUEsTUFFSixLQUFLO0FBQ0QsYUFBSyxPQUFPLEtBQUssS0FBSyxLQUFLLEtBQUssV0FBVztBQUMzQyxhQUFLLFFBQVEsUUFBUSxZQUFVLE9BQU8sS0FBSyxLQUFLLEtBQUssS0FBSyxXQUFXLENBQUM7QUFDdEUsYUFBSyxRQUFRLFFBQVEsV0FBUyxNQUFNLEtBQUssS0FBSyxLQUFLLEtBQUssV0FBVyxDQUFDO0FBRXBFLGFBQUssU0FBUyxVQUFVLEtBQUssS0FBSyxJQUFJLElBQUksSUFBSSxTQUFTLEtBQUssU0FBUyxVQUFVLE1BQU07QUFDckYsYUFBSyxTQUFTLFdBQVcsS0FBSyxPQUFPLE1BQU0sSUFBSSxLQUFLLE9BQU8sUUFBUSxJQUFJLElBQUksU0FBUyxLQUFLLFNBQVMsVUFBVSxPQUFPO0FBQ25IO0FBQUEsTUFFSixLQUFLO0FBQ0QsYUFBSyxTQUFTLEtBQUssU0FBUyxjQUFjLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxJQUFJLFNBQVMsWUFBWTtBQUNuSCxhQUFLLFNBQVMsZ0JBQWdCLEtBQUssS0FBSyxJQUFJLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxJQUFJLFNBQVMsS0FBSyxTQUFTLFFBQVE7QUFDL0gsYUFBSyxTQUFTLEtBQUssU0FBUyxtQkFBbUIsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLElBQUksU0FBUyxLQUFLLFNBQVMsUUFBUTtBQUNsSTtBQUFBLElBQ1I7QUFBQSxFQUNKO0FBQUEsRUFFQSxTQUFTLE1BQWMsR0FBVyxHQUFXLE9BQWUsTUFBYyxRQUF5QixVQUFnQjtBQUMvRyxTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksZUFBZTtBQUN4QixTQUFLLElBQUksU0FBUyxNQUFNLEdBQUcsQ0FBQztBQUFBLEVBQ2hDO0FBQ0o7QUFFQSxPQUFPLGlCQUFpQixRQUFRLE1BQU07QUFDbEMsUUFBTSxPQUFPLElBQUksS0FBSyxZQUFZO0FBQ2xDLE9BQUssTUFBTTtBQUNmLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSJdCn0K
