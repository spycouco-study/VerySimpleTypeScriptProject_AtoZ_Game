var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 2] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 3] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 4] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class AssetManager {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.onProgressCallback = null;
  }
  setOnProgress(callback) {
    this.onProgressCallback = callback;
  }
  updateProgress() {
    this.loadedAssets++;
    if (this.onProgressCallback) {
      this.onProgressCallback(this.loadedAssets / this.totalAssets);
    }
  }
  async load(assetsConfig) {
    this.totalAssets = assetsConfig.images.length + assetsConfig.sounds.length;
    this.loadedAssets = 0;
    const imagePromises = assetsConfig.images.map((img) => {
      return new Promise((resolve) => {
        const image = new Image();
        image.src = img.path;
        image.onload = () => {
          this.images.set(img.name, image);
          this.updateProgress();
          resolve();
        };
        image.onerror = () => {
          console.error(`Failed to load image: ${img.path}`);
          this.updateProgress();
          resolve();
        };
      });
    });
    const soundPromises = assetsConfig.sounds.map((snd) => {
      return new Promise((resolve) => {
        const audio = new Audio(snd.path);
        audio.volume = snd.volume;
        audio.oncanplaythrough = () => {
          this.sounds.set(snd.name, audio);
          this.updateProgress();
          resolve();
        };
        audio.onerror = () => {
          console.error(`Failed to load sound: ${snd.path}`);
          this.updateProgress();
          resolve();
        };
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  getImage(name) {
    return this.images.get(name);
  }
  getSound(name) {
    return this.sounds.get(name);
  }
  playSound(name, loop = false, volume) {
    const sound = this.getSound(name);
    if (sound) {
      const clone = sound.cloneNode();
      if (volume !== void 0) {
        clone.volume = volume;
      } else {
        clone.volume = sound.volume;
      }
      clone.loop = loop;
      clone.play().catch((e) => console.warn(`Audio playback failed for ${name}: ${e}`));
      if (!loop) {
        clone.onended = () => clone.remove();
      }
    }
  }
}
class GameObject {
  constructor(x, y, width, height, spriteName, health = 1) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.spriteName = spriteName;
    this.health = health;
  }
  draw(ctx, assetManager) {
    const image = assetManager.getImage(this.spriteName);
    if (image) {
      ctx.drawImage(image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = "purple";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
  isOffscreen(canvasWidth, canvasHeight) {
    return this.y + this.height < 0 || this.y > canvasHeight || this.x + this.width < 0 || this.x > canvasWidth;
  }
}
class Player extends GameObject {
  constructor(x, y, width, height, spriteName, health, fireRate) {
    super(x, y, width, height, spriteName, health);
    this.lastShotTime = 0;
    // milliseconds between shots
    this.score = 0;
    this.fireInterval = 1e3 / fireRate;
    this.maxHealth = health;
  }
  canShoot(currentTime) {
    return currentTime - this.lastShotTime > this.fireInterval;
  }
  shoot(currentTime) {
    this.lastShotTime = currentTime;
  }
  takeDamage(amount) {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
  }
}
class Bullet extends GameObject {
  constructor(x, y, width, height, spriteName, speed, damage, isPlayerBullet) {
    super(x, y, width, height, spriteName);
    this.speed = speed;
    this.damage = damage;
    this.isPlayerBullet = isPlayerBullet;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
}
class Enemy extends GameObject {
  constructor(x, y, width, height, spriteName, health, speed, fireRate, scoreValue, bulletSpriteName, bulletWidth, bulletHeight, bulletSpeed, bulletDamage) {
    super(x, y, width, height, spriteName, health);
    this.lastShotTime = 0;
    this.speed = speed;
    this.fireInterval = fireRate > 0 ? 1e3 / fireRate : 0;
    this.scoreValue = scoreValue;
    this.bulletSpriteName = bulletSpriteName;
    this.bulletWidth = bulletWidth;
    this.bulletHeight = bulletHeight;
    this.bulletSpeed = bulletSpeed;
    this.bulletDamage = bulletDamage;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
  }
  canShoot(currentTime) {
    return this.fireInterval > 0 && currentTime - this.lastShotTime > this.fireInterval;
  }
  shoot(currentTime) {
    this.lastShotTime = currentTime;
  }
  takeDamage(amount) {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
  }
}
class Game {
  // True if enemies from current wave are being queued/spawned
  constructor(canvasId) {
    this.assetManager = new AssetManager();
    this.gameState = 0 /* LOADING */;
    this.lastTime = 0;
    this.bullets = [];
    this.enemies = [];
    this.keys = {};
    this.backgroundY = 0;
    this.currentWaveIndex = 0;
    this.waveSpawnDelayTimer = 0;
    // Delay before next wave starts queuing
    this.enemySpawnQueue = [];
    this.waveActive = false;
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.init();
  }
  async init() {
    this.drawLoadingScreen(0);
    await this.loadConfig();
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    this.ctx.imageSmoothingEnabled = false;
    this.assetManager.setOnProgress((progress) => this.drawLoadingScreen(progress));
    await this.assetManager.load(this.config.assets);
    this.assetManager.playSound(this.config.soundConfig.bgm, true);
    this.setupEventListeners();
    this.resetGame();
    this.gameState = 1 /* TITLE */;
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  async loadConfig() {
    try {
      const response = await fetch("data.json");
      this.config = await response.json();
    } catch (error) {
      console.error("Failed to load game configuration:", error);
      alert("\uAC8C\uC784 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uB294\uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uAC8C\uC784\uC744 \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      this.gameState = 4 /* GAME_OVER */;
    }
  }
  setupEventListeners() {
    window.addEventListener("keydown", this.handleKeyDown.bind(this));
    window.addEventListener("keyup", this.handleKeyUp.bind(this));
    window.addEventListener("click", this.handleClick.bind(this));
  }
  handleKeyDown(event) {
    this.keys[event.code] = true;
    if (event.code === "Space" && (this.gameState === 1 /* TITLE */ || this.gameState === 2 /* INSTRUCTIONS */ || this.gameState === 4 /* GAME_OVER */)) {
      this.progressGameState();
    }
  }
  handleKeyUp(event) {
    this.keys[event.code] = false;
  }
  handleClick(event) {
    if (this.gameState === 1 /* TITLE */ || this.gameState === 2 /* INSTRUCTIONS */ || this.gameState === 4 /* GAME_OVER */) {
      this.progressGameState();
    }
  }
  progressGameState() {
    if (this.gameState === 1 /* TITLE */) {
      this.gameState = 2 /* INSTRUCTIONS */;
    } else if (this.gameState === 2 /* INSTRUCTIONS */) {
      this.startGame();
    } else if (this.gameState === 4 /* GAME_OVER */) {
      this.resetGame();
      this.gameState = 1 /* TITLE */;
    }
  }
  resetGame() {
    const pConf = this.config.playerConfig;
    this.player = new Player(
      (this.canvas.width - pConf.width) / 2,
      this.canvas.height - pConf.height - 30,
      pConf.width,
      pConf.height,
      pConf.spriteName,
      pConf.initialHealth,
      pConf.fireRate
    );
    this.bullets = [];
    this.enemies = [];
    this.player.score = 0;
    this.currentWaveIndex = 0;
    this.waveSpawnDelayTimer = 0;
    this.enemySpawnQueue = [];
    this.waveActive = false;
    this.backgroundY = 0;
  }
  startGame() {
    this.resetGame();
    this.gameState = 3 /* PLAYING */;
  }
  gameLoop(currentTime) {
    const deltaTime = (currentTime - this.lastTime) / 1e3;
    this.lastTime = currentTime;
    this.update(deltaTime, currentTime);
    this.draw();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime, currentTime) {
    if (this.gameState === 3 /* PLAYING */) {
      this.updatePlayer(deltaTime, currentTime);
      this.updateBullets(deltaTime);
      this.updateEnemies(deltaTime, currentTime);
      this.handleCollisions();
      this.removeOffscreenObjects();
      this.scrollBackground(deltaTime);
      this.updateWaves(deltaTime, currentTime);
      if (this.player.health <= 0) {
        this.gameState = 4 /* GAME_OVER */;
        this.assetManager.playSound(this.config.soundConfig.explosion);
      }
    }
  }
  updatePlayer(deltaTime, currentTime) {
    const pConf = this.config.playerConfig;
    const playerSpeed = pConf.speed;
    if (this.keys["ArrowLeft"] || this.keys["KeyA"]) {
      this.player.x -= playerSpeed * deltaTime;
    }
    if (this.keys["ArrowRight"] || this.keys["KeyD"]) {
      this.player.x += playerSpeed * deltaTime;
    }
    if (this.keys["ArrowUp"] || this.keys["KeyW"]) {
      this.player.y -= playerSpeed * deltaTime;
    }
    if (this.keys["ArrowDown"] || this.keys["KeyS"]) {
      this.player.y += playerSpeed * deltaTime;
    }
    this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
    this.player.y = Math.max(0, Math.min(this.canvas.height - this.player.height, this.player.y));
    if ((this.keys["Space"] || this.keys["KeyJ"]) && this.player.canShoot(currentTime)) {
      this.player.shoot(currentTime);
      this.bullets.push(new Bullet(
        this.player.x + (this.player.width - pConf.bulletWidth) / 2,
        this.player.y,
        pConf.bulletWidth,
        pConf.bulletHeight,
        pConf.bulletSpriteName,
        -pConf.bulletSpeed,
        pConf.bulletDamage,
        true
      ));
      this.assetManager.playSound(this.config.soundConfig.playerShoot);
    }
  }
  updateBullets(deltaTime) {
    this.bullets.forEach((bullet) => bullet.update(deltaTime));
  }
  updateEnemies(deltaTime, currentTime) {
    this.enemies.forEach((enemy) => {
      enemy.update(deltaTime);
      if (enemy.canShoot(currentTime)) {
        enemy.shoot(currentTime);
        this.bullets.push(new Bullet(
          enemy.x + (enemy.width - enemy.bulletWidth) / 2,
          enemy.y + enemy.height,
          enemy.bulletWidth,
          enemy.bulletHeight,
          enemy.bulletSpriteName,
          enemy.bulletSpeed,
          enemy.bulletDamage,
          false
        ));
        this.assetManager.playSound(this.config.soundConfig.enemyShoot, false, 0.3);
      }
    });
  }
  handleCollisions() {
    this.bullets = this.bullets.filter((bullet) => {
      if (!bullet.isPlayerBullet) return true;
      let hitEnemy = false;
      this.enemies = this.enemies.filter((enemy) => {
        if (checkCollision(bullet, enemy)) {
          enemy.takeDamage(bullet.damage);
          if (enemy.health <= 0) {
            this.player.score += enemy.scoreValue;
            this.assetManager.playSound(this.config.soundConfig.explosion);
            return false;
          }
          hitEnemy = true;
          return true;
        }
        return true;
      });
      return !hitEnemy;
    });
    this.bullets = this.bullets.filter((bullet) => {
      if (bullet.isPlayerBullet) return true;
      if (checkCollision(bullet, this.player)) {
        this.player.takeDamage(bullet.damage);
        this.assetManager.playSound(this.config.soundConfig.explosion, false, 0.5);
        return false;
      }
      return true;
    });
  }
  removeOffscreenObjects() {
    this.bullets = this.bullets.filter((b) => !b.isOffscreen(this.canvas.width, this.canvas.height));
    this.enemies = this.enemies.filter((e) => !e.isOffscreen(this.canvas.width, this.canvas.height));
  }
  scrollBackground(deltaTime) {
    const bgImage = this.assetManager.getImage(this.config.backgroundConfig.spriteName);
    if (bgImage) {
      const tileWidth = this.canvas.width;
      const tileHeight = bgImage.height * (this.canvas.width / bgImage.width);
      this.backgroundY += this.config.backgroundConfig.scrollSpeed * deltaTime;
      if (this.backgroundY >= tileHeight) {
        this.backgroundY -= tileHeight;
      }
    }
  }
  updateWaves(deltaTime, currentTime) {
    if (this.currentWaveIndex < this.config.waveConfig.length && !this.waveActive && this.enemies.length === 0 && this.enemySpawnQueue.length === 0) {
      this.waveSpawnDelayTimer -= deltaTime;
      if (this.waveSpawnDelayTimer <= 0) {
        const wave = this.config.waveConfig[this.currentWaveIndex];
        let relativeSpawnTime = 0;
        wave.enemies.forEach((group) => {
          for (let i = 0; i < group.count; i++) {
            const randomXOffset = Math.random() * 0.2 - 0.1 + (group.spawnXOffset !== void 0 ? group.spawnXOffset : 0.5);
            this.enemySpawnQueue.push({
              enemyType: group.enemyType,
              spawnTime: currentTime + relativeSpawnTime,
              xOffset: randomXOffset
            });
            relativeSpawnTime += group.spawnInterval;
          }
        });
        this.enemySpawnQueue.sort((a, b) => a.spawnTime - b.spawnTime);
        this.waveActive = true;
        this.currentWaveIndex++;
        if (this.currentWaveIndex < this.config.waveConfig.length) {
          this.waveSpawnDelayTimer = this.config.waveConfig[this.currentWaveIndex].waveDelay;
        } else {
          this.waveSpawnDelayTimer = Infinity;
        }
      }
    }
    while (this.enemySpawnQueue.length > 0 && this.enemySpawnQueue[0].spawnTime <= currentTime) {
      const nextSpawn = this.enemySpawnQueue.shift();
      if (nextSpawn) {
        const enemyConf = this.config.enemyConfigs[nextSpawn.enemyType];
        if (enemyConf) {
          const spawnX = this.canvas.width * nextSpawn.xOffset;
          this.enemies.push(new Enemy(
            spawnX - enemyConf.width / 2,
            -enemyConf.height,
            enemyConf.width,
            enemyConf.height,
            enemyConf.spriteName,
            enemyConf.initialHealth,
            enemyConf.speed,
            enemyConf.fireRate,
            enemyConf.scoreValue,
            enemyConf.bulletSpriteName,
            enemyConf.bulletWidth,
            enemyConf.bulletHeight,
            enemyConf.bulletSpeed,
            enemyConf.bulletDamage
          ));
        }
      }
      if (this.enemySpawnQueue.length === 0) {
        this.waveActive = false;
      }
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();
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
        this.drawGamePlaying();
        break;
      case 4 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawBackground() {
    const bgImage = this.assetManager.getImage(this.config.backgroundConfig.spriteName);
    if (bgImage) {
      const tileWidth = this.canvas.width;
      const tileHeight = bgImage.height * (this.canvas.width / bgImage.width);
      let currentY = this.backgroundY % tileHeight;
      if (currentY > 0) currentY -= tileHeight;
      for (let y = currentY; y < this.canvas.height; y += tileHeight) {
        this.ctx.drawImage(bgImage, 0, y, tileWidth, tileHeight);
      }
    }
  }
  drawLoadingScreen(progress) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Loading Game...", this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.strokeStyle = "white";
    this.ctx.strokeRect(this.canvas.width / 2 - 100, this.canvas.height / 2 + 10, 200, 20);
    this.ctx.fillStyle = "green";
    this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2 + 10, 200 * progress, 20);
  }
  drawTitleScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = "48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.uiText.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.uiText.startText, this.canvas.width / 2, this.canvas.height / 2 + 50);
    this.ctx.fillText(this.config.uiText.pressAnyKey, this.canvas.width / 2, this.canvas.height / 2 + 80);
  }
  drawInstructionsScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = "28px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("\uC870\uC791\uBC95", this.canvas.width / 2, 100);
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "left";
    const instructionLines = this.config.uiText.instructions.split("\n");
    instructionLines.forEach((line, index) => {
      this.ctx.fillText(line, this.canvas.width / 2 - 150, 150 + index * 30);
    });
    this.ctx.textAlign = "center";
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.uiText.continueText, this.canvas.width / 2, this.canvas.height - 100);
    this.ctx.fillText(this.config.uiText.pressAnyKey, this.canvas.width / 2, this.canvas.height - 70);
  }
  drawGamePlaying() {
    this.player.draw(this.ctx, this.assetManager);
    this.bullets.forEach((bullet) => bullet.draw(this.ctx, this.assetManager));
    this.enemies.forEach((enemy) => enemy.draw(this.ctx, this.assetManager));
    this.ctx.fillStyle = "white";
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`${this.config.uiText.scoreLabel} ${this.player.score}`, 10, 30);
    this.ctx.fillText(`${this.config.uiText.healthLabel} ${this.player.health}/${this.player.maxHealth}`, 10, 60);
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = "red";
    this.ctx.font = "48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.uiText.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.fillText(`${this.config.uiText.scoreLabel} ${this.player.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20);
    this.ctx.fillText(this.config.uiText.pressAnyKey, this.canvas.width / 2, this.canvas.height / 2 + 70);
  }
}
function checkCollision(obj1, obj2) {
  return obj1.x < obj2.x + obj2.width && obj1.x + obj1.width > obj2.x && obj1.y < obj2.y + obj2.height && obj1.y + obj1.height > obj2.y;
}
document.addEventListener("DOMContentLoaded", () => {
  new Game("gameCanvas");
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgcGxheWVyQ29uZmlnOiB7XHJcbiAgICAgICAgc3ByaXRlTmFtZTogc3RyaW5nO1xyXG4gICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBidWxsZXRzIHBlciBzZWNvbmRcclxuICAgICAgICBidWxsZXRTcHJpdGVOYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgYnVsbGV0V2lkdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXRIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgIGluaXRpYWxIZWFsdGg6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBlbmVteUNvbmZpZ3M6IHtcclxuICAgICAgICBba2V5OiBzdHJpbmddOiB7XHJcbiAgICAgICAgICAgIHNwcml0ZU5hbWU6IHN0cmluZztcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGZpcmVSYXRlOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGJ1bGxldFNwcml0ZU5hbWU6IHN0cmluZztcclxuICAgICAgICAgICAgYnVsbGV0V2lkdGg6IG51bWJlcjtcclxuICAgICAgICAgICAgYnVsbGV0SGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgICAgIGJ1bGxldFNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgICAgICBpbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIHdhdmVDb25maWc6IHtcclxuICAgICAgICB3YXZlRGVsYXk6IG51bWJlcjsgLy8gdGltZSBiZWZvcmUgd2F2ZSBzdGFydHMgcXVldWluZyBhZnRlciBwcmV2aW91cyBvbmUgY29tcGxldGVzXHJcbiAgICAgICAgZW5lbWllczoge1xyXG4gICAgICAgICAgICBlbmVteVR5cGU6IHN0cmluZzsgLy8ga2V5IGZyb20gZW5lbXlDb25maWdzXHJcbiAgICAgICAgICAgIGNvdW50OiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNwYXduSW50ZXJ2YWw6IG51bWJlcjsgLy8gZGVsYXkgYmV0d2VlbiBzcGF3bmluZyBlYWNoIGVuZW15IGluIHRoaXMgZ3JvdXBcclxuICAgICAgICAgICAgc3Bhd25YT2Zmc2V0PzogbnVtYmVyOyAvLyBwZXJjZW50YWdlIG9mIGNhbnZhcyB3aWR0aCBmcm9tIGxlZnQgKDAuMCB0byAxLjApXHJcbiAgICAgICAgfVtdO1xyXG4gICAgfVtdO1xyXG4gICAgYmFja2dyb3VuZENvbmZpZzoge1xyXG4gICAgICAgIHNwcml0ZU5hbWU6IHN0cmluZztcclxuICAgICAgICBzY3JvbGxTcGVlZDogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIHVpVGV4dDoge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgaW5zdHJ1Y3Rpb25zOiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXI6IHN0cmluZztcclxuICAgICAgICBwcmVzc0FueUtleTogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlTGFiZWw6IHN0cmluZztcclxuICAgICAgICBoZWFsdGhMYWJlbDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0VGV4dDogc3RyaW5nO1xyXG4gICAgICAgIGNvbnRpbnVlVGV4dDogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1bXTtcclxuICAgICAgICBzb3VuZHM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH1bXTtcclxuICAgIH07XHJcbiAgICBzb3VuZENvbmZpZzoge1xyXG4gICAgICAgIGJnbTogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNob290OiBzdHJpbmc7XHJcbiAgICAgICAgZW5lbXlTaG9vdDogc3RyaW5nO1xyXG4gICAgICAgIGV4cGxvc2lvbjogc3RyaW5nO1xyXG4gICAgfTtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbG9hZGVkQXNzZXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBvblByb2dyZXNzQ2FsbGJhY2s6ICgocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwdWJsaWMgc2V0T25Qcm9ncmVzcyhjYWxsYmFjazogKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpIHtcclxuICAgICAgICB0aGlzLm9uUHJvZ3Jlc3NDYWxsYmFjayA9IGNhbGxiYWNrO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUHJvZ3Jlc3MoKSB7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICBpZiAodGhpcy5vblByb2dyZXNzQ2FsbGJhY2spIHtcclxuICAgICAgICAgICAgdGhpcy5vblByb2dyZXNzQ2FsbGJhY2sodGhpcy5sb2FkZWRBc3NldHMgLyB0aGlzLnRvdGFsQXNzZXRzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGFzeW5jIGxvYWQoYXNzZXRzQ29uZmlnOiBHYW1lQ29uZmlnWydhc3NldHMnXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMudG90YWxBc3NldHMgPSBhc3NldHNDb25maWcuaW1hZ2VzLmxlbmd0aCArIGFzc2V0c0NvbmZpZy5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIHRoaXMubG9hZGVkQXNzZXRzID0gMDtcclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoaW1nLm5hbWUsIGltYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1nLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQcm9ncmVzcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gYXNzZXRzQ29uZmlnLnNvdW5kcy5tYXAoc25kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc25kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc25kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQcm9ncmVzcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NuZC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0U291bmQobmFtZTogc3RyaW5nKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlLCB2b2x1bWU/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuZ2V0U291bmQobmFtZSk7XHJcbiAgICAgICAgaWYgKHNvdW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gc291bmQuY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgaWYgKHZvbHVtZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWU7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjbG9uZS52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2xvbmUubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OiAke2V9YCkpO1xyXG4gICAgICAgICAgICBpZiAoIWxvb3ApIHtcclxuICAgICAgICAgICAgICAgIGNsb25lLm9uZW5kZWQgPSAoKSA9PiBjbG9uZS5yZW1vdmUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZU9iamVjdCB7XHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICBwdWJsaWMgeDogbnVtYmVyLFxyXG4gICAgICAgIHB1YmxpYyB5OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIHdpZHRoOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIHB1YmxpYyBzcHJpdGVOYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgcHVibGljIGhlYWx0aDogbnVtYmVyID0gMVxyXG4gICAgKSB7fVxyXG5cclxuICAgIHB1YmxpYyBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGltYWdlID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHRoaXMuc3ByaXRlTmFtZSk7XHJcbiAgICAgICAgaWYgKGltYWdlKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdwdXJwbGUnOyAvLyBGYWxsYmFjayBmb3IgbWlzc2luZyBpbWFnZVxyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGlzT2Zmc2NyZWVuKGNhbnZhc1dpZHRoOiBudW1iZXIsIGNhbnZhc0hlaWdodDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueSArIHRoaXMuaGVpZ2h0IDwgMCB8fCB0aGlzLnkgPiBjYW52YXNIZWlnaHQgfHwgdGhpcy54ICsgdGhpcy53aWR0aCA8IDAgfHwgdGhpcy54ID4gY2FudmFzV2lkdGg7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFBsYXllciBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgcHJpdmF0ZSBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGZpcmVJbnRlcnZhbDogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHMgYmV0d2VlbiBzaG90c1xyXG4gICAgcHVibGljIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHVibGljIG1heEhlYWx0aDogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3ByaXRlTmFtZTogc3RyaW5nLFxyXG4gICAgICAgIGhlYWx0aDogbnVtYmVyLCBmaXJlUmF0ZTogbnVtYmVyIC8vIGZpcmVSYXRlIGlzIGJ1bGxldHMgcGVyIHNlY29uZFxyXG4gICAgKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgc3ByaXRlTmFtZSwgaGVhbHRoKTtcclxuICAgICAgICB0aGlzLmZpcmVJbnRlcnZhbCA9IDEwMDAgLyBmaXJlUmF0ZTtcclxuICAgICAgICB0aGlzLm1heEhlYWx0aCA9IGhlYWx0aDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY2FuU2hvb3QoY3VycmVudFRpbWU6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBjdXJyZW50VGltZSAtIHRoaXMubGFzdFNob3RUaW1lID4gdGhpcy5maXJlSW50ZXJ2YWw7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNob290KGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmxhc3RTaG90VGltZSA9IGN1cnJlbnRUaW1lO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyB0YWtlRGFtYWdlKGFtb3VudDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggLT0gYW1vdW50O1xyXG4gICAgICAgIGlmICh0aGlzLmhlYWx0aCA8IDApIHRoaXMuaGVhbHRoID0gMDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQnVsbGV0IGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICB4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHNwcml0ZU5hbWU6IHN0cmluZyxcclxuICAgICAgICBwdWJsaWMgc3BlZWQ6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgZGFtYWdlOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGlzUGxheWVyQnVsbGV0OiBib29sZWFuXHJcbiAgICApIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBzcHJpdGVOYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEVuZW15IGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBwcml2YXRlIGxhc3RTaG90VGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZmlyZUludGVydmFsOiBudW1iZXI7IC8vIG1pbGxpc2Vjb25kc1xyXG4gICAgcHVibGljIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgIHB1YmxpYyBidWxsZXRTcHJpdGVOYW1lOiBzdHJpbmc7XHJcbiAgICBwdWJsaWMgYnVsbGV0V2lkdGg6IG51bWJlcjtcclxuICAgIHB1YmxpYyBidWxsZXRIZWlnaHQ6IG51bWJlcjtcclxuICAgIHB1YmxpYyBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgcHVibGljIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgcHVibGljIHNwZWVkOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzcHJpdGVOYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgaGVhbHRoOiBudW1iZXIsIHNwZWVkOiBudW1iZXIsIGZpcmVSYXRlOiBudW1iZXIsIHNjb3JlVmFsdWU6IG51bWJlcixcclxuICAgICAgICBidWxsZXRTcHJpdGVOYW1lOiBzdHJpbmcsIGJ1bGxldFdpZHRoOiBudW1iZXIsIGJ1bGxldEhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIGJ1bGxldFNwZWVkOiBudW1iZXIsIGJ1bGxldERhbWFnZTogbnVtYmVyXHJcbiAgICApIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBzcHJpdGVOYW1lLCBoZWFsdGgpO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBzcGVlZDtcclxuICAgICAgICB0aGlzLmZpcmVJbnRlcnZhbCA9IGZpcmVSYXRlID4gMCA/ICgxMDAwIC8gZmlyZVJhdGUpIDogMDtcclxuICAgICAgICB0aGlzLnNjb3JlVmFsdWUgPSBzY29yZVZhbHVlO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0U3ByaXRlTmFtZSA9IGJ1bGxldFNwcml0ZU5hbWU7XHJcbiAgICAgICAgdGhpcy5idWxsZXRXaWR0aCA9IGJ1bGxldFdpZHRoO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0SGVpZ2h0ID0gYnVsbGV0SGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuYnVsbGV0U3BlZWQgPSBidWxsZXRTcGVlZDtcclxuICAgICAgICB0aGlzLmJ1bGxldERhbWFnZSA9IGJ1bGxldERhbWFnZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNhblNob290KGN1cnJlbnRUaW1lOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5maXJlSW50ZXJ2YWwgPiAwICYmIChjdXJyZW50VGltZSAtIHRoaXMubGFzdFNob3RUaW1lID4gdGhpcy5maXJlSW50ZXJ2YWwpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBzaG9vdChjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBjdXJyZW50VGltZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPCAwKSB0aGlzLmhlYWx0aCA9IDA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIgPSBuZXcgQXNzZXRNYW5hZ2VyKCk7XHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXIhOiBQbGF5ZXI7XHJcbiAgICBwcml2YXRlIGJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTtcclxuICAgIHByaXZhdGUgYmFja2dyb3VuZFk6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRXYXZlSW5kZXg6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHdhdmVTcGF3bkRlbGF5VGltZXI6IG51bWJlciA9IDA7IC8vIERlbGF5IGJlZm9yZSBuZXh0IHdhdmUgc3RhcnRzIHF1ZXVpbmdcclxuICAgIHByaXZhdGUgZW5lbXlTcGF3blF1ZXVlOiB7IGVuZW15VHlwZTogc3RyaW5nLCBzcGF3blRpbWU6IG51bWJlciwgeE9mZnNldDogbnVtYmVyIH1bXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSB3YXZlQWN0aXZlOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgZW5lbWllcyBmcm9tIGN1cnJlbnQgd2F2ZSBhcmUgYmVpbmcgcXVldWVkL3NwYXduZWRcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICAgICAgdGhpcy5pbml0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oMCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQ29uZmlnKCk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5jdHguaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7XHJcblxyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnNldE9uUHJvZ3Jlc3MoKHByb2dyZXNzKSA9PiB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKHByb2dyZXNzKSk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5hc3NldE1hbmFnZXIubG9hZCh0aGlzLmNvbmZpZy5hc3NldHMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCh0aGlzLmNvbmZpZy5zb3VuZENvbmZpZy5iZ20sIHRydWUpO1xyXG5cclxuICAgICAgICB0aGlzLnNldHVwRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgICAgICB0aGlzLnJlc2V0R2FtZSgpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uOicsIGVycm9yKTtcclxuICAgICAgICAgICAgYWxlcnQoJ1x1QUM4Q1x1Qzc4NCBcdUMxMjRcdUM4MTVcdUM3NDQgXHVCRDg4XHVCN0VDXHVDNjI0XHVCMjk0XHVCMzcwIFx1QzJFNFx1RDMyOFx1RDU4OFx1QzJCNVx1QjJDOFx1QjJFNC4gXHVBQzhDXHVDNzg0XHVDNzQ0IFx1QzJEQ1x1Qzc5MVx1RDU2MCBcdUMyMTggXHVDNUM2XHVDMkI1XHVCMkM4XHVCMkU0LicpO1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2xpY2suYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmNvZGVdID0gdHJ1ZTtcclxuICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ1NwYWNlJyAmJiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUyB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikpIHtcclxuICAgICAgICAgICAgdGhpcy5wcm9ncmVzc0dhbWVTdGF0ZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmNvZGVdID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVDbGljayhldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIHRoaXMucHJvZ3Jlc3NHYW1lU3RhdGUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwcm9ncmVzc0dhbWVTdGF0ZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUykge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHBDb25mID0gdGhpcy5jb25maWcucGxheWVyQ29uZmlnO1xyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcihcclxuICAgICAgICAgICAgKHRoaXMuY2FudmFzLndpZHRoIC0gcENvbmYud2lkdGgpIC8gMixcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC0gcENvbmYuaGVpZ2h0IC0gMzAsXHJcbiAgICAgICAgICAgIHBDb25mLndpZHRoLCBwQ29uZi5oZWlnaHQsIHBDb25mLnNwcml0ZU5hbWUsXHJcbiAgICAgICAgICAgIHBDb25mLmluaXRpYWxIZWFsdGgsIHBDb25mLmZpcmVSYXRlXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSBbXTtcclxuICAgICAgICB0aGlzLnBsYXllci5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50V2F2ZUluZGV4ID0gMDtcclxuICAgICAgICB0aGlzLndhdmVTcGF3bkRlbGF5VGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMuZW5lbXlTcGF3blF1ZXVlID0gW107XHJcbiAgICAgICAgdGhpcy53YXZlQWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kWSA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AoY3VycmVudFRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDtcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSwgY3VycmVudFRpbWUpO1xyXG4gICAgICAgIHRoaXMuZHJhdygpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgY3VycmVudFRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXIoZGVsdGFUaW1lLCBjdXJyZW50VGltZSk7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlQnVsbGV0cyhkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUVuZW1pZXMoZGVsdGFUaW1lLCBjdXJyZW50VGltZSk7XHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlQ29sbGlzaW9ucygpO1xyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZU9mZnNjcmVlbk9iamVjdHMoKTtcclxuICAgICAgICAgICAgdGhpcy5zY3JvbGxCYWNrZ3JvdW5kKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlV2F2ZXMoZGVsdGFUaW1lLCBjdXJyZW50VGltZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCh0aGlzLmNvbmZpZy5zb3VuZENvbmZpZy5leHBsb3Npb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWVyKGRlbHRhVGltZTogbnVtYmVyLCBjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgcENvbmYgPSB0aGlzLmNvbmZpZy5wbGF5ZXJDb25maWc7XHJcbiAgICAgICAgY29uc3QgcGxheWVyU3BlZWQgPSBwQ29uZi5zcGVlZDtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snQXJyb3dMZWZ0J10gfHwgdGhpcy5rZXlzWydLZXlBJ10pIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIueCAtPSBwbGF5ZXJTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snQXJyb3dSaWdodCddIHx8IHRoaXMua2V5c1snS2V5RCddKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnggKz0gcGxheWVyU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0Fycm93VXAnXSB8fCB0aGlzLmtleXNbJ0tleVcnXSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci55IC09IHBsYXllclNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydBcnJvd0Rvd24nXSB8fCB0aGlzLmtleXNbJ0tleVMnXSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci55ICs9IHBsYXllclNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMuY2FudmFzLndpZHRoIC0gdGhpcy5wbGF5ZXIud2lkdGgsIHRoaXMucGxheWVyLngpKTtcclxuICAgICAgICB0aGlzLnBsYXllci55ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5jYW52YXMuaGVpZ2h0IC0gdGhpcy5wbGF5ZXIuaGVpZ2h0LCB0aGlzLnBsYXllci55KSk7XHJcblxyXG4gICAgICAgIGlmICgodGhpcy5rZXlzWydTcGFjZSddIHx8IHRoaXMua2V5c1snS2V5SiddKSAmJiB0aGlzLnBsYXllci5jYW5TaG9vdChjdXJyZW50VGltZSkpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIuc2hvb3QoY3VycmVudFRpbWUpO1xyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldHMucHVzaChuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIueCArICh0aGlzLnBsYXllci53aWR0aCAtIHBDb25mLmJ1bGxldFdpZHRoKSAvIDIsXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci55LFxyXG4gICAgICAgICAgICAgICAgcENvbmYuYnVsbGV0V2lkdGgsIHBDb25mLmJ1bGxldEhlaWdodCwgcENvbmYuYnVsbGV0U3ByaXRlTmFtZSxcclxuICAgICAgICAgICAgICAgIC1wQ29uZi5idWxsZXRTcGVlZCwgcENvbmYuYnVsbGV0RGFtYWdlLCB0cnVlXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQodGhpcy5jb25maWcuc291bmRDb25maWcucGxheWVyU2hvb3QpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4gYnVsbGV0LnVwZGF0ZShkZWx0YVRpbWUpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUVuZW1pZXMoZGVsdGFUaW1lOiBudW1iZXIsIGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGVuZW15LmNhblNob290KGN1cnJlbnRUaW1lKSkge1xyXG4gICAgICAgICAgICAgICAgZW5lbXkuc2hvb3QoY3VycmVudFRpbWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzLnB1c2gobmV3IEJ1bGxldChcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS54ICsgKGVuZW15LndpZHRoIC0gZW5lbXkuYnVsbGV0V2lkdGgpIC8gMixcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS55ICsgZW5lbXkuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LmJ1bGxldFdpZHRoLCBlbmVteS5idWxsZXRIZWlnaHQsIGVuZW15LmJ1bGxldFNwcml0ZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkuYnVsbGV0U3BlZWQsIGVuZW15LmJ1bGxldERhbWFnZSwgZmFsc2VcclxuICAgICAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKHRoaXMuY29uZmlnLnNvdW5kQ29uZmlnLmVuZW15U2hvb3QsIGZhbHNlLCAwLjMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVDb2xsaXNpb25zKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cyA9IHRoaXMuYnVsbGV0cy5maWx0ZXIoYnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgaWYgKCFidWxsZXQuaXNQbGF5ZXJCdWxsZXQpIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgICAgICAgbGV0IGhpdEVuZW15ID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrQ29sbGlzaW9uKGJ1bGxldCwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkudGFrZURhbWFnZShidWxsZXQuZGFtYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5lbXkuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuc2NvcmUgKz0gZW5lbXkuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKHRoaXMuY29uZmlnLnNvdW5kQ29uZmlnLmV4cGxvc2lvbik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaGl0RW5lbXkgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXR1cm4gIWhpdEVuZW15O1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmJ1bGxldHMgPSB0aGlzLmJ1bGxldHMuZmlsdGVyKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIGlmIChidWxsZXQuaXNQbGF5ZXJCdWxsZXQpIHJldHVybiB0cnVlO1xyXG5cclxuICAgICAgICAgICAgaWYgKGNoZWNrQ29sbGlzaW9uKGJ1bGxldCwgdGhpcy5wbGF5ZXIpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci50YWtlRGFtYWdlKGJ1bGxldC5kYW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKHRoaXMuY29uZmlnLnNvdW5kQ29uZmlnLmV4cGxvc2lvbiwgZmFsc2UsIDAuNSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW1vdmVPZmZzY3JlZW5PYmplY3RzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cyA9IHRoaXMuYnVsbGV0cy5maWx0ZXIoYiA9PiAhYi5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KSk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gdGhpcy5lbmVtaWVzLmZpbHRlcihlID0+ICFlLmlzT2Zmc2NyZWVuKHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNjcm9sbEJhY2tncm91bmQoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBiZ0ltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcuYmFja2dyb3VuZENvbmZpZy5zcHJpdGVOYW1lKTtcclxuICAgICAgICBpZiAoYmdJbWFnZSkge1xyXG4gICAgICAgICAgICBjb25zdCB0aWxlV2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aDtcclxuICAgICAgICAgICAgY29uc3QgdGlsZUhlaWdodCA9IGJnSW1hZ2UuaGVpZ2h0ICogKHRoaXMuY2FudmFzLndpZHRoIC8gYmdJbWFnZS53aWR0aCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRZICs9IHRoaXMuY29uZmlnLmJhY2tncm91bmRDb25maWcuc2Nyb2xsU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmJhY2tncm91bmRZID49IHRpbGVIZWlnaHQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZFkgLT0gdGlsZUhlaWdodDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZVdhdmVzKGRlbHRhVGltZTogbnVtYmVyLCBjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgLy8gSWYgYWxsIGVuZW1pZXMgZnJvbSB0aGUgcHJldmlvdXMgd2F2ZSBhcmUgY2xlYXJlZCBhbmQgbm8gbW9yZSBlbmVtaWVzIGFyZSBpbiBxdWV1ZSxcclxuICAgICAgICAvLyBhbmQgd2UgaGF2ZW4ndCBwcm9jZXNzZWQgYWxsIHdhdmVzLCB0aGVuIHN0YXJ0IHRoZSBkZWxheSBmb3IgdGhlIG5leHQgd2F2ZS5cclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50V2F2ZUluZGV4IDwgdGhpcy5jb25maWcud2F2ZUNvbmZpZy5sZW5ndGggJiYgIXRoaXMud2F2ZUFjdGl2ZSAmJiB0aGlzLmVuZW1pZXMubGVuZ3RoID09PSAwICYmIHRoaXMuZW5lbXlTcGF3blF1ZXVlLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLndhdmVTcGF3bkRlbGF5VGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy53YXZlU3Bhd25EZWxheVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHdhdmUgPSB0aGlzLmNvbmZpZy53YXZlQ29uZmlnW3RoaXMuY3VycmVudFdhdmVJbmRleF07XHJcbiAgICAgICAgICAgICAgICBsZXQgcmVsYXRpdmVTcGF3blRpbWUgPSAwO1xyXG5cclxuICAgICAgICAgICAgICAgIHdhdmUuZW5lbWllcy5mb3JFYWNoKGdyb3VwID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdyb3VwLmNvdW50OyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmFuZG9tWE9mZnNldCA9IChNYXRoLnJhbmRvbSgpICogMC4yIC0gMC4xKSArIChncm91cC5zcGF3blhPZmZzZXQgIT09IHVuZGVmaW5lZCA/IGdyb3VwLnNwYXduWE9mZnNldCA6IDAuNSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW5lbXlTcGF3blF1ZXVlLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXlUeXBlOiBncm91cC5lbmVteVR5cGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGF3blRpbWU6IGN1cnJlbnRUaW1lICsgcmVsYXRpdmVTcGF3blRpbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4T2Zmc2V0OiByYW5kb21YT2Zmc2V0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZVNwYXduVGltZSArPSBncm91cC5zcGF3bkludGVydmFsO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVteVNwYXduUXVldWUuc29ydCgoYSwgYikgPT4gYS5zcGF3blRpbWUgLSBiLnNwYXduVGltZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLndhdmVBY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50V2F2ZUluZGV4Kys7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50V2F2ZUluZGV4IDwgdGhpcy5jb25maWcud2F2ZUNvbmZpZy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLndhdmVTcGF3bkRlbGF5VGltZXIgPSB0aGlzLmNvbmZpZy53YXZlQ29uZmlnW3RoaXMuY3VycmVudFdhdmVJbmRleF0ud2F2ZURlbGF5O1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLndhdmVTcGF3bkRlbGF5VGltZXIgPSBJbmZpbml0eTsgLy8gQWxsIHdhdmVzIHByb2Nlc3NlZFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTcGF3biBlbmVtaWVzIGZyb20gcXVldWUgaWYgdGhlaXIgYWJzb2x1dGUgc3Bhd24gdGltZSBpcyByZWFjaGVkXHJcbiAgICAgICAgd2hpbGUgKHRoaXMuZW5lbXlTcGF3blF1ZXVlLmxlbmd0aCA+IDAgJiYgdGhpcy5lbmVteVNwYXduUXVldWVbMF0uc3Bhd25UaW1lIDw9IGN1cnJlbnRUaW1lKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRTcGF3biA9IHRoaXMuZW5lbXlTcGF3blF1ZXVlLnNoaWZ0KCk7XHJcbiAgICAgICAgICAgIGlmIChuZXh0U3Bhd24pIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVuZW15Q29uZiA9IHRoaXMuY29uZmlnLmVuZW15Q29uZmlnc1tuZXh0U3Bhd24uZW5lbXlUeXBlXTtcclxuICAgICAgICAgICAgICAgIGlmIChlbmVteUNvbmYpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzcGF3blggPSB0aGlzLmNhbnZhcy53aWR0aCAqIG5leHRTcGF3bi54T2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKG5ldyBFbmVteShcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3Bhd25YIC0gZW5lbXlDb25mLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgICAgICAgICAgLWVuZW15Q29uZi5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15Q29uZi53aWR0aCwgZW5lbXlDb25mLmhlaWdodCwgZW5lbXlDb25mLnNwcml0ZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15Q29uZi5pbml0aWFsSGVhbHRoLCBlbmVteUNvbmYuc3BlZWQsIGVuZW15Q29uZi5maXJlUmF0ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXlDb25mLnNjb3JlVmFsdWUsIGVuZW15Q29uZi5idWxsZXRTcHJpdGVOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmVteUNvbmYuYnVsbGV0V2lkdGgsIGVuZW15Q29uZi5idWxsZXRIZWlnaHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15Q29uZi5idWxsZXRTcGVlZCwgZW5lbXlDb25mLmJ1bGxldERhbWFnZVxyXG4gICAgICAgICAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmVuZW15U3Bhd25RdWV1ZS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMud2F2ZUFjdGl2ZSA9IGZhbHNlOyAvLyBBbGwgZW5lbWllcyBmcm9tIHRoZSBjdXJyZW50IHdhdmUgaGF2ZSBiZWVuIHF1ZXVlZFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBwcml2YXRlIGRyYXcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmRyYXdCYWNrZ3JvdW5kKCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgICAgIC8vIEhhbmRsZWQgYnkgZHJhd0xvYWRpbmdTY3JlZW5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVQbGF5aW5nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdCYWNrZ3JvdW5kKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJnSW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSh0aGlzLmNvbmZpZy5iYWNrZ3JvdW5kQ29uZmlnLnNwcml0ZU5hbWUpO1xyXG4gICAgICAgIGlmIChiZ0ltYWdlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRpbGVXaWR0aCA9IHRoaXMuY2FudmFzLndpZHRoO1xyXG4gICAgICAgICAgICBjb25zdCB0aWxlSGVpZ2h0ID0gYmdJbWFnZS5oZWlnaHQgKiAodGhpcy5jYW52YXMud2lkdGggLyBiZ0ltYWdlLndpZHRoKTtcclxuXHJcbiAgICAgICAgICAgIGxldCBjdXJyZW50WSA9IHRoaXMuYmFja2dyb3VuZFkgJSB0aWxlSGVpZ2h0O1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudFkgPiAwKSBjdXJyZW50WSAtPSB0aWxlSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgZm9yIChsZXQgeSA9IGN1cnJlbnRZOyB5IDwgdGhpcy5jYW52YXMuaGVpZ2h0OyB5ICs9IHRpbGVIZWlnaHQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCB5LCB0aWxlV2lkdGgsIHRpbGVIZWlnaHQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKHByb2dyZXNzOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdMb2FkaW5nIEdhbWUuLi4nLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAyMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwLCAyMDAsIDIwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZ3JlZW4nO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwLCAyMDAgKiBwcm9ncmVzcywgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0OHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aVRleHQudGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aVRleHQuc3RhcnRUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWlUZXh0LnByZXNzQW55S2V5LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA4MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyOHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnXHVDODcwXHVDNzkxXHVCQzk1JywgdGhpcy5jYW52YXMud2lkdGggLyAyLCAxMDApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICBjb25zdCBpbnN0cnVjdGlvbkxpbmVzID0gdGhpcy5jb25maWcudWlUZXh0Lmluc3RydWN0aW9ucy5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgaW5zdHJ1Y3Rpb25MaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChsaW5lLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSAxNTAsIDE1MCArIGluZGV4ICogMzApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpVGV4dC5jb250aW51ZVRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTAwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aVRleHQucHJlc3NBbnlLZXksIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gNzApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVQbGF5aW5nKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucGxheWVyLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRNYW5hZ2VyKTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4gYnVsbGV0LmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRNYW5hZ2VyKSk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4gZW5lbXkuZHJhdyh0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLmNvbmZpZy51aVRleHQuc2NvcmVMYWJlbH0gJHt0aGlzLnBsYXllci5zY29yZX1gLCAxMCwgMzApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpVGV4dC5oZWFsdGhMYWJlbH0gJHt0aGlzLnBsYXllci5oZWFsdGh9LyR7dGhpcy5wbGF5ZXIubWF4SGVhbHRofWAsIDEwLCA2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0OHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aVRleHQuZ2FtZU92ZXIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpVGV4dC5zY29yZUxhYmVsfSAke3RoaXMucGxheWVyLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aVRleHQucHJlc3NBbnlLZXksIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDcwKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tDb2xsaXNpb24ob2JqMTogR2FtZU9iamVjdCwgb2JqMjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIG9iajEueCA8IG9iajIueCArIG9iajIud2lkdGggJiZcclxuICAgICAgICAgICBvYmoxLnggKyBvYmoxLndpZHRoID4gb2JqMi54ICYmXHJcbiAgICAgICAgICAgb2JqMS55IDwgb2JqMi55ICsgb2JqMi5oZWlnaHQgJiZcclxuICAgICAgICAgICBvYmoxLnkgKyBvYmoxLmhlaWdodCA+IG9iajIueTtcclxufVxyXG5cclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+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
