var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Game {
  constructor(canvasId) {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.gameState = 0 /* TITLE */;
    this.lastFrameTime = 0;
    this.projectiles = [];
    this.enemies = [];
    this.score = 0;
    this.lastEnemySpawnTime = 0;
    this.keys = /* @__PURE__ */ new Set();
    this.bgmAudio = null;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = 800;
    this.canvas.height = 600;
    this.player = { x: 0, y: 0, width: 0, height: 0, speed: 0, lastShotTime: 0 };
  }
  async start() {
    await this.loadConfig();
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    await this.loadAssets();
    this.setupInput();
    this.initGame();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  async loadConfig() {
    const response = await fetch("data.json");
    this.config = await response.json();
  }
  async loadAssets() {
    const loadImagePromises = this.config.assets.images.map((imgData) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imgData.path;
        img.onload = () => resolve(Object.assign(img, { name: imgData.name }));
        img.onerror = () => reject(new Error(`Failed to load image: ${imgData.path}`));
      });
    });
    const loadSoundPromises = this.config.assets.sounds.map((sndData) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = sndData.path;
        audio.volume = sndData.volume;
        audio.oncanplaythrough = () => resolve(Object.assign(audio, { name: sndData.name }));
        audio.onerror = () => reject(new Error(`Failed to load sound: ${sndData.path}`));
      });
    });
    const loadedImages = await Promise.all(loadImagePromises);
    loadedImages.forEach((img) => this.images.set(img.name, img));
    const loadedSounds = await Promise.all(loadSoundPromises);
    loadedSounds.forEach((snd) => this.sounds.set(snd.name, snd));
  }
  setupInput() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      if (this.gameState === 0 /* TITLE */ && e.key === " ") {
        this.gameState = 1 /* INSTRUCTIONS */;
        this.playBGM();
      } else if (this.gameState === 1 /* INSTRUCTIONS */ && e.key === " ") {
        this.gameState = 2 /* PLAYING */;
        this.initGame();
      } else if (this.gameState === 3 /* GAME_OVER */ && e.key.toLowerCase() === "r") {
        this.gameState = 0 /* TITLE */;
        this.score = 0;
        this.resetEntities();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }
  playSound(name, loop = false) {
    const sound = this.sounds.get(name);
    if (sound) {
      if (name === "bgm") {
        if (this.bgmAudio) this.bgmAudio.pause();
        this.bgmAudio = sound.cloneNode(true);
        this.bgmAudio.volume = sound.volume;
        this.bgmAudio.loop = loop;
        this.bgmAudio.play().catch((e) => console.error("Error playing BGM:", e));
      } else {
        const clonedSound = sound.cloneNode();
        clonedSound.volume = sound.volume;
        clonedSound.loop = loop;
        clonedSound.play().catch((e) => console.error("Error playing sound effect:", e));
      }
    }
  }
  stopBGM() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
    }
  }
  playBGM() {
    if (!this.bgmAudio) {
      this.playSound("bgm", true);
    } else if (this.bgmAudio.paused) {
      this.bgmAudio.play().catch((e) => console.error("Error resuming BGM:", e));
    }
  }
  initGame() {
    this.score = 0;
    this.resetEntities();
    this.player.width = this.config.player.width;
    this.player.height = this.config.player.height;
    this.player.x = (this.canvas.width - this.player.width) / 2;
    this.player.y = this.canvas.height - this.player.height - 20;
    this.player.speed = this.config.playerSpeed;
    this.player.lastShotTime = 0;
    this.lastEnemySpawnTime = 0;
  }
  resetEntities() {
    this.projectiles = [];
    this.enemies = [];
  }
  gameLoop(timestamp) {
    const deltaTime = (timestamp - this.lastFrameTime) / 1e3;
    this.lastFrameTime = timestamp;
    this.update(deltaTime);
    this.draw();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    switch (this.gameState) {
      case 2 /* PLAYING */:
        this.updatePlaying(deltaTime);
        break;
    }
  }
  updatePlaying(deltaTime) {
    if (this.keys.has("a") || this.keys.has("arrowleft")) {
      this.player.x -= this.player.speed * deltaTime;
    }
    if (this.keys.has("d") || this.keys.has("arrowright")) {
      this.player.x += this.player.speed * deltaTime;
    }
    if (this.player.x < 0) this.player.x = 0;
    if (this.player.x + this.player.width > this.canvas.width) this.player.x = this.canvas.width - this.player.width;
    if (this.keys.has(" ") && performance.now() - this.player.lastShotTime > this.config.playerShootInterval) {
      this.projectiles.push({
        x: this.player.x + this.player.width / 2 - this.config.projectile.width / 2,
        y: this.player.y,
        width: this.config.projectile.width,
        height: this.config.projectile.height,
        speed: this.config.projectileSpeed
      });
      this.player.lastShotTime = performance.now();
      this.playSound("shoot_effect");
    }
    this.projectiles = this.projectiles.filter((p) => {
      p.y -= p.speed * deltaTime;
      return p.y + p.height > 0;
    });
    if (performance.now() - this.lastEnemySpawnTime > this.config.enemySpawnInterval) {
      this.enemies.push({
        x: Math.random() * (this.canvas.width - this.config.enemy.width),
        y: -this.config.enemy.height,
        width: this.config.enemy.width,
        height: this.config.enemy.height,
        speed: this.config.enemySpeed,
        health: this.config.enemyHealth
      });
      this.lastEnemySpawnTime = performance.now();
    }
    this.enemies = this.enemies.filter((e) => {
      e.y += e.speed * deltaTime;
      if (e.y > this.canvas.height) {
        this.gameState = 3 /* GAME_OVER */;
        this.stopBGM();
        return false;
      }
      return true;
    });
    this.projectiles.forEach((p) => {
      this.enemies.forEach((e) => {
        if (this.checkCollision(p, e)) {
          this.playSound("hit_effect");
          e.health--;
          p.y = -100;
          if (e.health <= 0) {
            e.y = this.canvas.height + 100;
            this.score += this.config.scorePerEnemy;
          }
        }
      });
    });
    this.projectiles = this.projectiles.filter((p) => p.y !== -100);
    this.enemies = this.enemies.filter((e) => e.y !== this.canvas.height + 100 && e.health > 0);
  }
  checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y;
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.config.colors.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const backgroundImage = this.images.get("background");
    if (backgroundImage) {
      this.ctx.drawImage(backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 1 /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case 2 /* PLAYING */:
        this.drawPlayingScreen();
        break;
      case 3 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawTitleScreen() {
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "48px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.text.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.text.startPrompt, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawInstructionsScreen() {
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "36px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("\uAC8C\uC784 \uC870\uC791\uBC95", this.canvas.width / 2, this.canvas.height / 2 - 100);
    this.ctx.font = "24px sans-serif";
    let yOffset = -40;
    this.config.text.instructions.forEach((line) => {
      this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 + yOffset);
      yOffset += 30;
    });
    this.ctx.fillText(this.config.text.startPrompt, this.canvas.width / 2, this.canvas.height / 2 + 100);
  }
  drawPlayingScreen() {
    const playerImage = this.images.get("player");
    if (playerImage) {
      this.ctx.drawImage(playerImage, this.player.x, this.player.y, this.player.width, this.player.height);
    }
    const projectileImage = this.images.get("projectile");
    if (projectileImage) {
      this.projectiles.forEach((p) => {
        this.ctx.drawImage(projectileImage, p.x, p.y, p.width, p.height);
      });
    }
    const enemyImage = this.images.get("enemy");
    if (enemyImage) {
      this.enemies.forEach((e) => {
        this.ctx.drawImage(enemyImage, e.x, e.y, e.width, e.height);
      });
    }
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "24px sans-serif";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`${this.config.text.scoreLabel}: ${this.score}`, 10, 30);
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = this.config.colors.text;
    this.ctx.font = "48px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.text.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "36px sans-serif";
    this.ctx.fillText(`${this.config.text.scoreLabel}: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.text.restartPrompt, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game = new Game("gameCanvas");
  game.start();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsidHlwZSBHYW1lQ29uZmlnID0ge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgcGxheWVyU3BlZWQ6IG51bWJlcjtcclxuICAgIHBsYXllclNob290SW50ZXJ2YWw6IG51bWJlcjtcclxuICAgIHByb2plY3RpbGVTcGVlZDogbnVtYmVyO1xyXG4gICAgZW5lbXlTcGVlZDogbnVtYmVyO1xyXG4gICAgZW5lbXlTcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICBlbmVteUhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2NvcmVQZXJFbmVteTogbnVtYmVyO1xyXG4gICAgcGxheWVyOiB7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBwcm9qZWN0aWxlOiB7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBlbmVteToge1xyXG4gICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlcjsgfVtdO1xyXG4gICAgfTtcclxuICAgIGNvbG9yczoge1xyXG4gICAgICAgIGJhY2tncm91bmQ6IHN0cmluZztcclxuICAgICAgICB0ZXh0OiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgdGV4dDoge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgc3RhcnRQcm9tcHQ6IHN0cmluZztcclxuICAgICAgICBpbnN0cnVjdGlvbnM6IHN0cmluZ1tdO1xyXG4gICAgICAgIGdhbWVPdmVyOiBzdHJpbmc7XHJcbiAgICAgICAgcmVzdGFydFByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlTGFiZWw6IHN0cmluZztcclxuICAgIH07XHJcbn07XHJcblxyXG50eXBlIEltYWdlQXNzZXQgPSBIVE1MSW1hZ2VFbGVtZW50ICYgeyBuYW1lOiBzdHJpbmcgfTtcclxudHlwZSBTb3VuZEFzc2V0ID0gSFRNTEF1ZGlvRWxlbWVudCAmIHsgbmFtZTogc3RyaW5nIH07XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIElOU1RSVUNUSU9OUyxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEltYWdlQXNzZXQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIFNvdW5kQXNzZXQ+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICBwcml2YXRlIGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5ZXI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBzcGVlZDogbnVtYmVyOyBsYXN0U2hvdFRpbWU6IG51bWJlcjsgfTtcclxuICAgIHByaXZhdGUgcHJvamVjdGlsZXM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBzcGVlZDogbnVtYmVyOyB9W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllczogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHNwZWVkOiBudW1iZXI7IGhlYWx0aDogbnVtYmVyOyB9W10gPSBbXTtcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGxhc3RFbmVteVNwYXduVGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBiZ21BdWRpbzogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSA4MDA7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gNjAwO1xyXG5cclxuICAgICAgICB0aGlzLnBsYXllciA9IHsgeDogMCwgeTogMCwgd2lkdGg6IDAsIGhlaWdodDogMCwgc3BlZWQ6IDAsIGxhc3RTaG90VGltZTogMCB9O1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHN0YXJ0KCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBJbnB1dCgpO1xyXG4gICAgICAgIHRoaXMuaW5pdEdhbWUoKTtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRDb25maWcoKSB7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgR2FtZUNvbmZpZztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgbG9hZEltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWdEYXRhID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPEltYWdlQXNzZXQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0RhdGEucGF0aDtcclxuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKE9iamVjdC5hc3NpZ24oaW1nLCB7IG5hbWU6IGltZ0RhdGEubmFtZSB9KSk7XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZ0RhdGEucGF0aH1gKSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBsb2FkU291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNuZERhdGEgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8U291bmRBc3NldD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHNuZERhdGEucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNuZERhdGEudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHJlc29sdmUoT2JqZWN0LmFzc2lnbihhdWRpbywgeyBuYW1lOiBzbmREYXRhLm5hbWUgfSkpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NuZERhdGEucGF0aH1gKSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBsb2FkZWRJbWFnZXMgPSBhd2FpdCBQcm9taXNlLmFsbChsb2FkSW1hZ2VQcm9taXNlcyk7XHJcbiAgICAgICAgbG9hZGVkSW1hZ2VzLmZvckVhY2goaW1nID0+IHRoaXMuaW1hZ2VzLnNldChpbWcubmFtZSwgaW1nKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGxvYWRlZFNvdW5kcyA9IGF3YWl0IFByb21pc2UuYWxsKGxvYWRTb3VuZFByb21pc2VzKTtcclxuICAgICAgICBsb2FkZWRTb3VuZHMuZm9yRWFjaChzbmQgPT4gdGhpcy5zb3VuZHMuc2V0KHNuZC5uYW1lLCBzbmQpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwSW5wdXQoKSB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmtleXMuYWRkKGUua2V5LnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiBlLmtleSA9PT0gJyAnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlCR00oKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUyAmJiBlLmtleSA9PT0gJyAnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbml0R2FtZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSICYmIGUua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdyJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRFbnRpdGllcygpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgKGUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5rZXlzLmRlbGV0ZShlLmtleS50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSkge1xyXG4gICAgICAgIGNvbnN0IHNvdW5kID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZCkge1xyXG4gICAgICAgICAgICBpZiAobmFtZSA9PT0gJ2JnbScpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7IC8vIFN0b3AgYW55IGV4aXN0aW5nIEJHTVxyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpbyA9IHNvdW5kLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiRXJyb3IgcGxheWluZyBCR006XCIsIGUpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNsb25lZFNvdW5kID0gc291bmQuY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGNsb25lZFNvdW5kLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGNsb25lZFNvdW5kLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICAgICAgY2xvbmVkU291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkVycm9yIHBsYXlpbmcgc291bmQgZWZmZWN0OlwiLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdG9wQkdNKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8gPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlCR00oKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdiZ20nLCB0cnVlKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuYmdtQXVkaW8ucGF1c2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkVycm9yIHJlc3VtaW5nIEJHTTpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLnJlc2V0RW50aXRpZXMoKTtcclxuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIud2lkdGggPSB0aGlzLmNvbmZpZy5wbGF5ZXIud2lkdGg7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuaGVpZ2h0ID0gdGhpcy5jb25maWcucGxheWVyLmhlaWdodDtcclxuICAgICAgICB0aGlzLnBsYXllci54ID0gKHRoaXMuY2FudmFzLndpZHRoIC0gdGhpcy5wbGF5ZXIud2lkdGgpIC8gMjtcclxuICAgICAgICB0aGlzLnBsYXllci55ID0gdGhpcy5jYW52YXMuaGVpZ2h0IC0gdGhpcy5wbGF5ZXIuaGVpZ2h0IC0gMjA7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuc3BlZWQgPSB0aGlzLmNvbmZpZy5wbGF5ZXJTcGVlZDtcclxuICAgICAgICB0aGlzLnBsYXllci5sYXN0U2hvdFRpbWUgPSAwO1xyXG5cclxuICAgICAgICB0aGlzLmxhc3RFbmVteVNwYXduVGltZSA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldEVudGl0aWVzKCkge1xyXG4gICAgICAgIHRoaXMucHJvamVjdGlsZXMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wKHRpbWVzdGFtcDogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWVzdGFtcCAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwO1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHRpbWVzdGFtcDtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLmRyYXcoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnRcclxuICAgICAgICBpZiAodGhpcy5rZXlzLmhhcygnYScpIHx8IHRoaXMua2V5cy5oYXMoJ2Fycm93bGVmdCcpKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnggLT0gdGhpcy5wbGF5ZXIuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXMuaGFzKCdkJykgfHwgdGhpcy5rZXlzLmhhcygnYXJyb3dyaWdodCcpKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnggKz0gdGhpcy5wbGF5ZXIuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLnBsYXllci54IDwgMCkgdGhpcy5wbGF5ZXIueCA9IDA7XHJcbiAgICAgICAgaWYgKHRoaXMucGxheWVyLnggKyB0aGlzLnBsYXllci53aWR0aCA+IHRoaXMuY2FudmFzLndpZHRoKSB0aGlzLnBsYXllci54ID0gdGhpcy5jYW52YXMud2lkdGggLSB0aGlzLnBsYXllci53aWR0aDtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHNob290aW5nXHJcbiAgICAgICAgaWYgKHRoaXMua2V5cy5oYXMoJyAnKSAmJiBwZXJmb3JtYW5jZS5ub3coKSAtIHRoaXMucGxheWVyLmxhc3RTaG90VGltZSA+IHRoaXMuY29uZmlnLnBsYXllclNob290SW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgdGhpcy5wcm9qZWN0aWxlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHg6IHRoaXMucGxheWVyLnggKyB0aGlzLnBsYXllci53aWR0aCAvIDIgLSB0aGlzLmNvbmZpZy5wcm9qZWN0aWxlLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIHk6IHRoaXMucGxheWVyLnksXHJcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy5jb25maWcucHJvamVjdGlsZS53aWR0aCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5jb25maWcucHJvamVjdGlsZS5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICBzcGVlZDogdGhpcy5jb25maWcucHJvamVjdGlsZVNwZWVkXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci5sYXN0U2hvdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3Nob290X2VmZmVjdCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIHByb2plY3RpbGVzXHJcbiAgICAgICAgdGhpcy5wcm9qZWN0aWxlcyA9IHRoaXMucHJvamVjdGlsZXMuZmlsdGVyKHAgPT4ge1xyXG4gICAgICAgICAgICBwLnkgLT0gcC5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgcmV0dXJuIHAueSArIHAuaGVpZ2h0ID4gMDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gU3Bhd24gZW5lbWllc1xyXG4gICAgICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID4gdGhpcy5jb25maWcuZW5lbXlTcGF3bkludGVydmFsKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHg6IE1hdGgucmFuZG9tKCkgKiAodGhpcy5jYW52YXMud2lkdGggLSB0aGlzLmNvbmZpZy5lbmVteS53aWR0aCksXHJcbiAgICAgICAgICAgICAgICB5OiAtdGhpcy5jb25maWcuZW5lbXkuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMuY29uZmlnLmVuZW15LndpZHRoLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmNvbmZpZy5lbmVteS5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICBzcGVlZDogdGhpcy5jb25maWcuZW5lbXlTcGVlZCxcclxuICAgICAgICAgICAgICAgIGhlYWx0aDogdGhpcy5jb25maWcuZW5lbXlIZWFsdGhcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZW5lbWllc1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZSA9PiB7XHJcbiAgICAgICAgICAgIGUueSArPSBlLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAoZS55ID4gdGhpcy5jYW52YXMuaGVpZ2h0KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3BCR00oKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gQ29sbGlzaW9uIGRldGVjdGlvbjogUHJvamVjdGlsZXMgdnMgRW5lbWllc1xyXG4gICAgICAgIHRoaXMucHJvamVjdGlsZXMuZm9yRWFjaChwID0+IHtcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jaGVja0NvbGxpc2lvbihwLCBlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdoaXRfZWZmZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgZS5oZWFsdGgtLTtcclxuICAgICAgICAgICAgICAgICAgICBwLnkgPSAtMTAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChlLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGUueSA9IHRoaXMuY2FudmFzLmhlaWdodCArIDEwMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmNvbmZpZy5zY29yZVBlckVuZW15O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvamVjdGlsZXMgPSB0aGlzLnByb2plY3RpbGVzLmZpbHRlcihwID0+IHAueSAhPT0gLTEwMCk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gdGhpcy5lbmVtaWVzLmZpbHRlcihlID0+IGUueSAhPT0gdGhpcy5jYW52YXMuaGVpZ2h0ICsgMTAwICYmIGUuaGVhbHRoID4gMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjaGVja0NvbGxpc2lvbihyZWN0MTogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH0sIHJlY3QyOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfSkge1xyXG4gICAgICAgIHJldHVybiByZWN0MS54IDwgcmVjdDIueCArIHJlY3QyLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgIHJlY3QxLnggKyByZWN0MS53aWR0aCA+IHJlY3QyLnggJiZcclxuICAgICAgICAgICAgICAgcmVjdDEueSA8IHJlY3QyLnkgKyByZWN0Mi5oZWlnaHQgJiZcclxuICAgICAgICAgICAgICAgcmVjdDEueSArIHJlY3QxLmhlaWdodCA+IHJlY3QyLnk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3KCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5jb2xvcnMuYmFja2dyb3VuZDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZEltYWdlID0gdGhpcy5pbWFnZXMuZ2V0KCdiYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgaWYgKGJhY2tncm91bmRJbWFnZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmFja2dyb3VuZEltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0luc3RydWN0aW9uc1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdQbGF5aW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5jb2xvcnMudGV4dDtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC50aXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5zdGFydFByb21wdCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5jb2xvcnMudGV4dDtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzM2cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJcdUFDOENcdUM3ODQgXHVDODcwXHVDNzkxXHVCQzk1XCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDEwMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICBsZXQgeU9mZnNldCA9IC00MDtcclxuICAgICAgICB0aGlzLmNvbmZpZy50ZXh0Lmluc3RydWN0aW9ucy5mb3JFYWNoKGxpbmUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChsaW5lLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyB5T2Zmc2V0KTtcclxuICAgICAgICAgICAgeU9mZnNldCArPSAzMDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5zdGFydFByb21wdCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdQbGF5aW5nU2NyZWVuKCkge1xyXG4gICAgICAgIC8vIERyYXcgcGxheWVyXHJcbiAgICAgICAgY29uc3QgcGxheWVySW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoJ3BsYXllcicpO1xyXG4gICAgICAgIGlmIChwbGF5ZXJJbWFnZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UocGxheWVySW1hZ2UsIHRoaXMucGxheWVyLngsIHRoaXMucGxheWVyLnksIHRoaXMucGxheWVyLndpZHRoLCB0aGlzLnBsYXllci5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRHJhdyBwcm9qZWN0aWxlc1xyXG4gICAgICAgIGNvbnN0IHByb2plY3RpbGVJbWFnZSA9IHRoaXMuaW1hZ2VzLmdldCgncHJvamVjdGlsZScpO1xyXG4gICAgICAgIGlmIChwcm9qZWN0aWxlSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5wcm9qZWN0aWxlcy5mb3JFYWNoKHAgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHByb2plY3RpbGVJbWFnZSwgcC54LCBwLnksIHAud2lkdGgsIHAuaGVpZ2h0KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IGVuZW1pZXNcclxuICAgICAgICBjb25zdCBlbmVteUltYWdlID0gdGhpcy5pbWFnZXMuZ2V0KCdlbmVteScpO1xyXG4gICAgICAgIGlmIChlbmVteUltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGUgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGVuZW15SW1hZ2UsIGUueCwgZS55LCBlLndpZHRoLCBlLmhlaWdodCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRHJhdyBzY29yZVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmNvbG9ycy50ZXh0O1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudGV4dC5zY29yZUxhYmVsfTogJHt0aGlzLnNjb3JlfWAsIDEwLCAzMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29sb3JzLnRleHQ7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0OHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRleHQuZ2FtZU92ZXIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczNnB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnRleHQuc2NvcmVMYWJlbH06ICR7dGhpcy5zY29yZX1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC5yZXN0YXJ0UHJvbXB0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBjb25zdCBnYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIGdhbWUuc3RhcnQoKTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQTJDQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQU9MLE1BQU0sS0FBSztBQUFBLEVBbUJQLFlBQVksVUFBa0I7QUFmOUIsU0FBUSxTQUFrQyxvQkFBSSxJQUFJO0FBQ2xELFNBQVEsU0FBa0Msb0JBQUksSUFBSTtBQUVsRCxTQUFRLFlBQXVCO0FBQy9CLFNBQVEsZ0JBQXdCO0FBR2hDLFNBQVEsY0FBeUYsQ0FBQztBQUNsRyxTQUFRLFVBQXFHLENBQUM7QUFDOUcsU0FBUSxRQUFnQjtBQUN4QixTQUFRLHFCQUE2QjtBQUVyQyxTQUFRLE9BQW9CLG9CQUFJLElBQUk7QUFDcEMsU0FBUSxXQUFvQztBQUd4QyxTQUFLLFNBQVMsU0FBUyxlQUFlLFFBQVE7QUFDOUMsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNkLFlBQU0sSUFBSSxNQUFNLG1CQUFtQixRQUFRLGNBQWM7QUFBQSxJQUM3RDtBQUNBLFNBQUssTUFBTSxLQUFLLE9BQU8sV0FBVyxJQUFJO0FBQ3RDLFNBQUssT0FBTyxRQUFRO0FBQ3BCLFNBQUssT0FBTyxTQUFTO0FBRXJCLFNBQUssU0FBUyxFQUFFLEdBQUcsR0FBRyxHQUFHLEdBQUcsT0FBTyxHQUFHLFFBQVEsR0FBRyxPQUFPLEdBQUcsY0FBYyxFQUFFO0FBQUEsRUFDL0U7QUFBQSxFQUVBLE1BQU0sUUFBUTtBQUNWLFVBQU0sS0FBSyxXQUFXO0FBQ3RCLFNBQUssT0FBTyxRQUFRLEtBQUssT0FBTztBQUNoQyxTQUFLLE9BQU8s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
