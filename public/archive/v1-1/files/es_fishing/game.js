var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class AssetLoader {
  constructor() {
    this.imageCache = /* @__PURE__ */ new Map();
    this.audioCache = /* @__PURE__ */ new Map();
    this.config = null;
  }
  async loadConfig(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.statusText}`);
    }
    this.config = await response.json();
    return this.config;
  }
  async loadAssets() {
    if (!this.config) {
      throw new Error("Config not loaded. Call loadConfig first.");
    }
    const imagePromises = this.config.assets.images.map((imgData) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imgData.path;
        img.onload = () => {
          this.imageCache.set(imgData.name, img);
          resolve();
        };
        img.onerror = () => reject(`Failed to load image: ${imgData.path}`);
      });
    });
    const audioPromises = this.config.assets.sounds.map((soundData) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio(soundData.path);
        audio.oncanplay = () => {
          audio.volume = soundData.volume;
          this.audioCache.set(soundData.name, audio);
          resolve();
        };
        audio.onerror = () => reject(`Failed to load audio: ${soundData.path}`);
      });
    });
    await Promise.all([...imagePromises, ...audioPromises]);
    console.log("All assets loaded.");
  }
  getImage(name) {
    return this.imageCache.get(name);
  }
  getAudio(name) {
    return this.audioCache.get(name);
  }
  playAudio(name, loop = false) {
    const audio = this.audioCache.get(name);
    if (audio) {
      if (!loop) {
        const clone = audio.cloneNode();
        clone.volume = audio.volume;
        clone.play().catch((e) => console.warn(`Audio playback failed for ${name}:`, e));
        return clone;
      } else {
        audio.loop = true;
        audio.play().catch((e) => console.warn(`Audio playback failed for ${name}:`, e));
        return audio;
      }
    }
    return void 0;
  }
  stopAudio(name) {
    const audio = this.audioCache.get(name);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
}
class Player {
  constructor(config, image, canvasWidth) {
    this.width = config.player.width;
    this.height = config.player.height;
    this.x = (canvasWidth - this.width) / 2;
    this.y = config.canvasHeight - this.height - 10;
    this.speed = config.player.speed;
    this.image = image;
    this.canvasWidth = canvasWidth;
  }
  update(deltaTime, input) {
    if (input.isKeyPressed("ArrowLeft") || input.isKeyPressed("a")) {
      this.x -= this.speed * deltaTime;
    }
    if (input.isKeyPressed("ArrowRight") || input.isKeyPressed("d")) {
      this.x += this.speed * deltaTime;
    }
    if (this.x < 0) this.x = 0;
    if (this.x > this.canvasWidth - this.width) this.x = this.canvasWidth - this.width;
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
}
class FallingObject {
  constructor(x, y, width, height, speed, image) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.image = image;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
}
class InputHandler {
  constructor() {
    this.pressedKeys = /* @__PURE__ */ new Set();
    window.addEventListener("keydown", (e) => this.pressedKeys.add(e.key));
    window.addEventListener("keyup", (e) => this.pressedKeys.delete(e.key));
  }
  isKeyPressed(key) {
    return this.pressedKeys.has(key);
  }
  consumeKey(key) {
    if (this.pressedKeys.has(key)) {
      this.pressedKeys.delete(key);
      return true;
    }
    return false;
  }
}
class Game {
  constructor(canvasId) {
    this.config = null;
    this.gameState = 0 /* TITLE */;
    this.lastTime = 0;
    this.animationFrameId = null;
    this.player = null;
    this.fallingObjects = [];
    this.score = 0;
    this.lastSpawnTime = 0;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.assetLoader = new AssetLoader();
    this.inputHandler = new InputHandler();
  }
  async init() {
    try {
      this.config = await this.assetLoader.loadConfig("data.json");
      this.canvas.width = this.config.canvasWidth;
      this.canvas.height = this.config.canvasHeight;
      await this.assetLoader.loadAssets();
      this.setupInitialState();
      this.startLoop();
    } catch (error) {
      console.error("Game initialization failed:", error);
      this.ctx.font = "24px Arial";
      this.ctx.fillStyle = "red";
      this.ctx.fillText("Failed to load game. Check console for errors.", 10, 50);
    }
  }
  setupInitialState() {
    if (!this.config) return;
    const playerImage = this.assetLoader.getImage(this.config.player.imageName);
    if (!playerImage) throw new Error(`Player image '${this.config.player.imageName}' not found.`);
    this.player = new Player(this.config, playerImage, this.canvas.width);
    this.fallingObjects = [];
    this.score = 0;
    this.lastSpawnTime = 0;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.loop = false;
    }
    this.bgmAudio = void 0;
  }
  startLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
  }
  stopLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  gameLoop(currentTime) {
    const deltaTime = (currentTime - this.lastTime) / 1e3;
    this.lastTime = currentTime;
    this.update(deltaTime);
    this.render();
    this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    if (!this.config) return;
    switch (this.gameState) {
      case 0 /* TITLE */:
        if (this.inputHandler.consumeKey("Enter")) {
          this.startGame();
        }
        break;
      case 1 /* PLAYING */:
        if (!this.player) return;
        this.player.update(deltaTime, this.inputHandler);
        for (let i = this.fallingObjects.length - 1; i >= 0; i--) {
          const obj = this.fallingObjects[i];
          obj.update(deltaTime);
          if (this.checkCollision(this.player, obj)) {
            this.assetLoader.playAudio(this.config.gameplay.hitSoundName);
            this.gameOver();
            return;
          }
          if (obj.y > this.canvas.height) {
            this.fallingObjects.splice(i, 1);
          }
        }
        this.lastSpawnTime += deltaTime * 1e3;
        if (this.lastSpawnTime >= this.config.fallingObjects.spawnInterval) {
          this.spawnFallingObject();
          this.lastSpawnTime = 0;
        }
        this.score += this.config.gameplay.scoreIncrementPerSecond * deltaTime;
        break;
      case 2 /* GAME_OVER */:
        if (this.inputHandler.consumeKey("Enter")) {
          this.startGame();
        }
        break;
    }
  }
  render() {
    if (!this.config) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 1 /* PLAYING */:
        if (this.player) {
          this.player.draw(this.ctx);
        }
        this.fallingObjects.forEach((obj) => obj.draw(this.ctx));
        this.drawScore();
        break;
      case 2 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawTitleScreen() {
    if (!this.config) return;
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = this.config.titleScreen.color;
    this.ctx.font = `bold 48px ${this.config.titleScreen.font}`;
    this.ctx.fillText(this.config.titleScreen.text, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = `24px ${this.config.titleScreen.font}`;
    this.ctx.fillText(this.config.titleScreen.pressKeyText, this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  drawGameOverScreen() {
    if (!this.config) return;
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = this.config.gameOverScreen.color;
    this.ctx.font = `bold 48px ${this.config.gameOverScreen.font}`;
    this.ctx.fillText(this.config.gameOverScreen.text, this.canvas.width / 2, this.canvas.height / 2 - 80);
    this.ctx.font = `bold 36px ${this.config.gameOverScreen.font}`;
    this.ctx.fillText(`${this.config.gameOverScreen.scoreText} ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.font = `24px ${this.config.gameOverScreen.font}`;
    this.ctx.fillText(this.config.gameOverScreen.pressKeyText, this.canvas.width / 2, this.canvas.height / 2 + 40);
  }
  drawScore() {
    if (!this.config) return;
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = "white";
    this.ctx.font = "20px Arial";
    this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 10, 30);
  }
  spawnFallingObject() {
    if (!this.config) return;
    const objectTypes = this.config.fallingObjects.types;
    const randomType = objectTypes[Math.floor(Math.random() * objectTypes.length)];
    const objectImage = this.assetLoader.getImage(randomType.imageName);
    if (!objectImage) {
      console.warn(`Falling object image '${randomType.imageName}' not found.`);
      return;
    }
    const x = Math.random() * (this.canvas.width - randomType.width);
    const speed = Math.random() * (this.config.fallingObjects.maxSpeed - this.config.fallingObjects.minSpeed) + this.config.fallingObjects.minSpeed;
    this.fallingObjects.push(new FallingObject(x, -randomType.height, randomType.width, randomType.height, speed, objectImage));
  }
  checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y;
  }
  startGame() {
    if (!this.config) return;
    console.log("Starting game...");
    this.setupInitialState();
    this.gameState = 1 /* PLAYING */;
    this.bgmAudio = this.assetLoader.playAudio(this.config.gameplay.bgmName, true);
  }
  gameOver() {
    if (!this.config) return;
    console.log("Game Over!");
    this.gameState = 2 /* GAME_OVER */;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.loop = false;
    }
    this.assetLoader.playAudio(this.config.gameplay.gameOverSoundName);
  }
}
window.onload = () => {
  const game = new Game("gameCanvas");
  game.init();
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW46IHtcclxuICAgICAgICB0ZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgZm9udDogc3RyaW5nO1xyXG4gICAgICAgIGNvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgcHJlc3NLZXlUZXh0OiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgZ2FtZU92ZXJTY3JlZW46IHtcclxuICAgICAgICB0ZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgZm9udDogc3RyaW5nO1xyXG4gICAgICAgIGNvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgcHJlc3NLZXlUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgc2NvcmVUZXh0OiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgcGxheWVyOiB7XHJcbiAgICAgICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIGZhbGxpbmdPYmplY3RzOiB7XHJcbiAgICAgICAgc3Bhd25JbnRlcnZhbDogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHNcclxuICAgICAgICBtaW5TcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIG1heFNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgdHlwZXM6IHtcclxuICAgICAgICAgICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIH1bXTtcclxuICAgIH07XHJcbiAgICBnYW1lcGxheToge1xyXG4gICAgICAgIHNjb3JlSW5jcmVtZW50UGVyU2Vjb25kOiBudW1iZXI7XHJcbiAgICAgICAgYmdtTmFtZTogc3RyaW5nO1xyXG4gICAgICAgIGhpdFNvdW5kTmFtZTogc3RyaW5nO1xyXG4gICAgICAgIGdhbWVPdmVyU291bmROYW1lOiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlcjsgfVtdO1xyXG4gICAgfTtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSLFxyXG59XHJcblxyXG5jbGFzcyBBc3NldExvYWRlciB7XHJcbiAgICBwcml2YXRlIGltYWdlQ2FjaGU6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBhdWRpb0NhY2hlOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgY29uZmlnOiBHYW1lQ29uZmlnIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgYXN5bmMgbG9hZENvbmZpZyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPEdhbWVDb25maWc+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHBhdGgpO1xyXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBjb25maWc6ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb25maWcgbm90IGxvYWRlZC4gQ2FsbCBsb2FkQ29uZmlnIGZpcnN0LlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWdEYXRhID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0RhdGEucGF0aDtcclxuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZUNhY2hlLnNldChpbWdEYXRhLm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdEYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBhdWRpb1Byb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmREYXRhID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kRGF0YS5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheSA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZERhdGEudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9DYWNoZS5zZXQoc291bmREYXRhLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgYXVkaW86ICR7c291bmREYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uYXVkaW9Qcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmltYWdlQ2FjaGUuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEF1ZGlvKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmF1ZGlvQ2FjaGUuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXlBdWRpbyhuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hdWRpb0NhY2hlLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgaWYgKCFsb29wKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDbG9uZSBhdWRpbyBmb3Igc2ltdWx0YW5lb3VzIHBsYXliYWNrIG9mIHNvdW5kIGVmZmVjdHNcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTsgXHJcbiAgICAgICAgICAgICAgICBjbG9uZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEF1ZGlvIHBsYXliYWNrIGZhaWxlZCBmb3IgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY2xvbmU7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBhdWRpbztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIHN0b3BBdWRpbyhuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXVkaW9DYWNoZS5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFBsYXllciB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZzogR2FtZUNvbmZpZywgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQsIGNhbnZhc1dpZHRoOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLndpZHRoID0gY29uZmlnLnBsYXllci53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5wbGF5ZXIuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMueCA9IChjYW52YXNXaWR0aCAtIHRoaXMud2lkdGgpIC8gMjtcclxuICAgICAgICB0aGlzLnkgPSBjb25maWcuY2FudmFzSGVpZ2h0IC0gdGhpcy5oZWlnaHQgLSAxMDtcclxuICAgICAgICB0aGlzLnNwZWVkID0gY29uZmlnLnBsYXllci5zcGVlZDtcclxuICAgICAgICB0aGlzLmltYWdlID0gaW1hZ2U7XHJcbiAgICAgICAgdGhpcy5jYW52YXNXaWR0aCA9IGNhbnZhc1dpZHRoO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgaW5wdXQ6IElucHV0SGFuZGxlcikge1xyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleVByZXNzZWQoXCJBcnJvd0xlZnRcIikgfHwgaW5wdXQuaXNLZXlQcmVzc2VkKFwiYVwiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGlucHV0LmlzS2V5UHJlc3NlZChcIkFycm93UmlnaHRcIikgfHwgaW5wdXQuaXNLZXlQcmVzc2VkKFwiZFwiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnggPCAwKSB0aGlzLnggPSAwO1xyXG4gICAgICAgIGlmICh0aGlzLnggPiB0aGlzLmNhbnZhc1dpZHRoIC0gdGhpcy53aWR0aCkgdGhpcy54ID0gdGhpcy5jYW52YXNXaWR0aCAtIHRoaXMud2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRmFsbGluZ09iamVjdCB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzcGVlZDogbnVtYmVyLCBpbWFnZTogSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IHNwZWVkO1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSBpbWFnZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBJbnB1dEhhbmRsZXIge1xyXG4gICAgcHJpdmF0ZSBwcmVzc2VkS2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB0aGlzLnByZXNzZWRLZXlzLmFkZChlLmtleSkpO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgKGUpID0+IHRoaXMucHJlc3NlZEtleXMuZGVsZXRlKGUua2V5KSk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNLZXlQcmVzc2VkKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMucHJlc3NlZEtleXMuaGFzKGtleSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3VtZUtleShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLnByZXNzZWRLZXlzLmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgIHRoaXMucHJlc3NlZEtleXMuZGVsZXRlKGtleSk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgY29uZmlnOiBHYW1lQ29uZmlnIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGFzc2V0TG9hZGVyOiBBc3NldExvYWRlcjtcclxuICAgIHByaXZhdGUgaW5wdXRIYW5kbGVyOiBJbnB1dEhhbmRsZXI7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGFuaW1hdGlvbkZyYW1lSWQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIHByaXZhdGUgcGxheWVyOiBQbGF5ZXIgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgZmFsbGluZ09iamVjdHM6IEZhbGxpbmdPYmplY3RbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbGFzdFNwYXduVGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoXCIyZFwiKSE7XHJcbiAgICAgICAgdGhpcy5hc3NldExvYWRlciA9IG5ldyBBc3NldExvYWRlcigpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyID0gbmV3IElucHV0SGFuZGxlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCB0aGlzLmFzc2V0TG9hZGVyLmxvYWRDb25maWcoXCJkYXRhLmpzb25cIik7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodDtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hc3NldExvYWRlci5sb2FkQXNzZXRzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dXBJbml0aWFsU3RhdGUoKTtcclxuICAgICAgICAgICAgdGhpcy5zdGFydExvb3AoKTsgXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkdhbWUgaW5pdGlhbGl6YXRpb24gZmFpbGVkOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjI0cHggQXJpYWxcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJyZWRcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJGYWlsZWQgdG8gbG9hZCBnYW1lLiBDaGVjayBjb25zb2xlIGZvciBlcnJvcnMuXCIsIDEwLCA1MCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBJbml0aWFsU3RhdGUoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckltYWdlID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZSh0aGlzLmNvbmZpZy5wbGF5ZXIuaW1hZ2VOYW1lKTtcclxuICAgICAgICBpZiAoIXBsYXllckltYWdlKSB0aHJvdyBuZXcgRXJyb3IoYFBsYXllciBpbWFnZSAnJHt0aGlzLmNvbmZpZy5wbGF5ZXIuaW1hZ2VOYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcih0aGlzLmNvbmZpZywgcGxheWVySW1hZ2UsIHRoaXMuY2FudmFzLndpZHRoKTtcclxuICAgICAgICB0aGlzLmZhbGxpbmdPYmplY3RzID0gW107XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5sYXN0U3Bhd25UaW1lID0gMDtcclxuICAgICAgICAvLyBTdG9wIGFueSBjdXJyZW50bHkgcGxheWluZyBCR01cclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5iZ21BdWRpbyA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0TG9vcCgpIHtcclxuICAgICAgICBpZiAodGhpcy5hbmltYXRpb25GcmFtZUlkICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0aW9uRnJhbWVJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICB0aGlzLmFuaW1hdGlvbkZyYW1lSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0b3BMb29wKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmFuaW1hdGlvbkZyYW1lSWQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRpb25GcmFtZUlkKTtcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25GcmFtZUlkID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcblxyXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaW5wdXRIYW5kbGVyLmNvbnN1bWVLZXkoXCJFbnRlclwiKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5wbGF5ZXIpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmlucHV0SGFuZGxlcik7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuZmFsbGluZ09iamVjdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBvYmogPSB0aGlzLmZhbGxpbmdPYmplY3RzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIG9iai51cGRhdGUoZGVsdGFUaW1lKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuY2hlY2tDb2xsaXNpb24odGhpcy5wbGF5ZXIsIG9iaikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldExvYWRlci5wbGF5QXVkaW8odGhpcy5jb25maWcuZ2FtZXBsYXkuaGl0U291bmROYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAob2JqLnkgPiB0aGlzLmNhbnZhcy5oZWlnaHQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5mYWxsaW5nT2JqZWN0cy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RTcGF3blRpbWUgKz0gZGVsdGFUaW1lICogMTAwMDsgXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5sYXN0U3Bhd25UaW1lID49IHRoaXMuY29uZmlnLmZhbGxpbmdPYmplY3RzLnNwYXduSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRmFsbGluZ09iamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGFzdFNwYXduVGltZSA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmNvbmZpZy5nYW1lcGxheS5zY29yZUluY3JlbWVudFBlclNlY29uZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pbnB1dEhhbmRsZXIuY29uc3VtZUtleShcIkVudGVyXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTsgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXIoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5kcmF3KHRoaXMuY3R4KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuZmFsbGluZ09iamVjdHMuZm9yRWFjaChvYmogPT4gb2JqLmRyYXcodGhpcy5jdHgpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1Njb3JlKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50aXRsZVNjcmVlbi5jb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgNDhweCAke3RoaXMuY29uZmlnLnRpdGxlU2NyZWVuLmZvbnR9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50aXRsZVNjcmVlbi50ZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNHB4ICR7dGhpcy5jb25maWcudGl0bGVTY3JlZW4uZm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRpdGxlU2NyZWVuLnByZXNzS2V5VGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyU2NyZWVuKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmdhbWVPdmVyU2NyZWVuLmNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCA0OHB4ICR7dGhpcy5jb25maWcuZ2FtZU92ZXJTY3JlZW4uZm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLmdhbWVPdmVyU2NyZWVuLnRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDM2cHggJHt0aGlzLmNvbmZpZy5nYW1lT3ZlclNjcmVlbi5mb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcuZ2FtZU92ZXJTY3JlZW4uc2NvcmVUZXh0fSAke01hdGguZmxvb3IodGhpcy5zY29yZSl9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMjApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI0cHggJHt0aGlzLmNvbmZpZy5nYW1lT3ZlclNjcmVlbi5mb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcuZ2FtZU92ZXJTY3JlZW4ucHJlc3NLZXlUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA0MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3U2NvcmUoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwibGVmdFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNjb3JlOiAke01hdGguZmxvb3IodGhpcy5zY29yZSl9YCwgMTAsIDMwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduRmFsbGluZ09iamVjdCgpIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcbiAgICAgICAgY29uc3Qgb2JqZWN0VHlwZXMgPSB0aGlzLmNvbmZpZy5mYWxsaW5nT2JqZWN0cy50eXBlcztcclxuICAgICAgICBjb25zdCByYW5kb21UeXBlID0gb2JqZWN0VHlwZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogb2JqZWN0VHlwZXMubGVuZ3RoKV07XHJcbiAgICAgICAgY29uc3Qgb2JqZWN0SW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKHJhbmRvbVR5cGUuaW1hZ2VOYW1lKTtcclxuICAgICAgICBpZiAoIW9iamVjdEltYWdlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgRmFsbGluZyBvYmplY3QgaW1hZ2UgJyR7cmFuZG9tVHlwZS5pbWFnZU5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHggPSBNYXRoLnJhbmRvbSgpICogKHRoaXMuY2FudmFzLndpZHRoIC0gcmFuZG9tVHlwZS53aWR0aCk7XHJcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBNYXRoLnJhbmRvbSgpICogKHRoaXMuY29uZmlnLmZhbGxpbmdPYmplY3RzLm1heFNwZWVkIC0gdGhpcy5jb25maWcuZmFsbGluZ09iamVjdHMubWluU3BlZWQpICsgdGhpcy5jb25maWcuZmFsbGluZ09iamVjdHMubWluU3BlZWQ7XHJcblxyXG4gICAgICAgIHRoaXMuZmFsbGluZ09iamVjdHMucHVzaChuZXcgRmFsbGluZ09iamVjdCh4LCAtcmFuZG9tVHlwZS5oZWlnaHQsIHJhbmRvbVR5cGUud2lkdGgsIHJhbmRvbVR5cGUuaGVpZ2h0LCBzcGVlZCwgb2JqZWN0SW1hZ2UpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrQ29sbGlzaW9uKHJlY3QxOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfSwgcmVjdDI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgcmVjdDEueCA8IHJlY3QyLnggKyByZWN0Mi53aWR0aCAmJlxyXG4gICAgICAgICAgICByZWN0MS54ICsgcmVjdDEud2lkdGggPiByZWN0Mi54ICYmXHJcbiAgICAgICAgICAgIHJlY3QxLnkgPCByZWN0Mi55ICsgcmVjdDIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICAgIHJlY3QxLnkgKyByZWN0MS5oZWlnaHQgPiByZWN0Mi55XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJTdGFydGluZyBnYW1lLi4uXCIpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBJbml0aWFsU3RhdGUoKTsgLy8gUmVzZXQgZ2FtZSBzdGF0ZSBpbmNsdWRpbmcgQkdNXHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLmJnbUF1ZGlvID0gdGhpcy5hc3NldExvYWRlci5wbGF5QXVkaW8odGhpcy5jb25maWcuZ2FtZXBsYXkuYmdtTmFtZSwgdHJ1ZSk7IFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiR2FtZSBPdmVyIVwiKTtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5sb29wID0gZmFsc2U7IFxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmFzc2V0TG9hZGVyLnBsYXlBdWRpbyh0aGlzLmNvbmZpZy5nYW1lcGxheS5nYW1lT3ZlclNvdW5kTmFtZSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbndpbmRvdy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBnYW1lID0gbmV3IEdhbWUoXCJnYW1lQ2FudmFzXCIpO1xyXG4gICAgZ2FtZS5pbml0KCk7XHJcbn07Il0sCiAgIm1hcHBpbmdzIjogIkFBNENBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUhDLFNBQUFBO0FBQUEsR0FBQTtBQU1MLE1BQU0sWUFBWTtBQUFBLEVBQWxCO0FBQ0ksU0FBUSxhQUE0QyxvQkFBSSxJQUFJO0FBQzVELFNBQVEsYUFBNEMsb0JBQUksSUFBSTtBQUM1RCxTQUFRLFNBQTRCO0FBQUE7QUFBQSxFQUVwQyxNQUFNLFdBQVcsTUFBbUM7QUFDaEQsVUFBTSxXQUFXLE1BQU0sTUFBTSxJQUFJO0FBQ2pDLFFBQUksQ0FBQyxTQUFTLElBQUk7QUFDZCxZQUFNLElBQUksTUFBTSwwQkFBMEIsU0FBUyxVQUFVLEVBQUU7QUFBQSxJQUNuRTtBQUNBLFNBQUssU0FBUyxNQUFNLFNBQVMsS0FBSztBQUNsQyxXQUFPLEtBQUs7QUFBQSxFQUNoQjtBQUFBLEVBRUEsTUFBTSxhQUE0QjtBQUM5QixRQUFJLENBQUMsS0FBSyxRQUFRO0FBQ2QsWUFBTSxJQUFJLE1BQU0sMkNBQTJDO0FBQUEsSUFDL0Q7QUFFQSxVQUFNLGdCQUFnQixLQUFLLE9BQU8sT0FBTyxPQUFPLElBQUksYUFBVztBQUMzRCxhQUFPLElBQUksUUFBYyxDQUFDLFNB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LFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsVUFBVSxLQUFLLE1BQU0sS0FBSyxLQUFLLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFBQSxFQUNoRTtBQUFBLEVBRVEscUJBQXFCO0FBQ3pCLFFBQUksQ0FBQyxLQUFLLE9BQVE7QUFDbEIsVUFBTSxjQUFjLEtBQUssT0FBTyxlQUFlO0FBQy9DLFVBQU0sYUFBYSxZQUFZLEtBQUssTUFBTSxLQUFLLE9BQU8sSUFBSSxZQUFZLE1BQU0sQ0FBQztBQUM3RSxVQUFNLGNBQWMsS0FBSyxZQUFZLFNBQVMsV0FBVyxTQUFTO0FBQ2xFLFFBQUksQ0FBQyxhQUFhO0FBQ2QsY0FBUSxLQUFLLHlCQUF5QixXQUFXLFNBQVMsY0FBYztBQUN4RTtBQUFBLElBQ0o7QUFFQSxVQUFNLElBQUksS0FBSyxPQUFPLEtBQUssS0FBSyxPQUFPLFFBQVEsV0FBVztBQUMxRCxVQUFNLFFBQVEsS0FBSyxPQUFPLEtBQUssS0FBSyxPQUFPLGVBQWUsV0FBVyxLQUFLLE9BQU8sZUFBZSxZQUFZLEtBQUssT0FBTyxlQUFlO0FBRXZJLFNBQUssZUFBZSxLQUFLLElBQUksY0FBYyxHQUFHLENBQUMsV0FBVyxRQUFRLFdBQVcsT0FBTyxXQUFXLFFBQVEsT0FBTyxXQUFXLENBQUM7QUFBQSxFQUM5SDtBQUFBLEVBRVEsZUFBZSxPQUFpRSxPQUEwRTtBQUM5SixXQUNJLE1BQU0sSUFBSSxNQUFNLElBQUksTUFBTSxTQUMxQixNQUFNLElBQUksTUFBTSxRQUFRLE1BQU0sS0FDOUIsTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLFVBQzFCLE1BQU0sSUFBSSxNQUFNLFNBQVMsTUFBTTtBQUFBLEVBRXZDO0FBQUEsRUFFUSxZQUFZO0FBQ2hCLFFBQUksQ0FBQyxLQUFLLE9BQVE7QUFDbEIsWUFBUSxJQUFJLGtCQUFrQjtBQUM5QixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLFlBQVk7QUFDakIsU0FBSyxXQUFXLEtBQUssWUFBWSxVQUFVLEtBQUssT0FBTyxTQUFTLFNBQVMsSUFBSTtBQUFBLEVBQ2pGO0FBQUEsRUFFUSxXQUFXO0FBQ2YsUUFBSSxDQUFDLEtBQUssT0FBUTtBQUNsQixZQUFRLElBQUksWUFBWTtBQUN4QixTQUFLLFlBQVk7QUFDakIsUUFBSSxLQUFLLFVBQVU7QUFDZixXQUFLLFNBQVMsTUFBTTtBQUNwQixXQUFLLFNBQVMsY0FBYztBQUM1QixXQUFLLFNBQVMsT0FBTztBQUFBLElBQ3pCO0FBQ0EsU0FBSyxZQUFZLFVBQVUsS0FBSyxPQUFPLFNBQVMsaUJBQWlCO0FBQUEsRUFDckU7QUFDSjtBQUVBLE9BQU8sU0FBUyxNQUFNO0FBQ2xCLFFBQU0sT0FBTyxJQUFJLEtBQUssWUFBWTtBQUNsQyxPQUFLLEtBQUs7QUFDZDsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIl0KfQo=
